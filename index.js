/**
 * Lexicon - Multi-cloud serverless function entry point
 */
const config = require('./config');
const startup = require('./startup');
const { Logger } = require('./loggerFramework');
const { ErrorHandler } = require('./errorHandler');
const express = require('express');
const serviceRegistry = require('./serviceRegistry');

// Configure logger for index.js
const logger = new Logger('Index');

// Get the cloud provider
const cloud_provider = config.get('cloud_provider', 'GCP');

// Create and export a minimal Express app right away that will be used
// as the handler for cloud functions. This ensures it is defined immediately.
const app = express();
exports.lexicon = app;

// Use a minimal initial configuration that just handles requests during initialization
app.use((req, res, next) => {
  // If the app is fully initialized, proceed with normal request handling
  if (app.initialized) {
    return next();
  }
  
  // Otherwise, return a brief initialization message
  logger.info('Request received during initialization', {
    method: req.method,
    path: req.path
  });
  
  res.status(503).json({
    success: false,
    error: 'Service is initializing',
    message: 'Please retry in a few moments'
  });
});

// Make sure app has middleware and parser
app.use(express.json());

/**
 * CloudAdapter - Base class for cloud provider adapters
 */
class CloudAdapter {
  /**
   * Initialize the adapter with standard middleware
   */
  constructor() {
    // Get middleware from the service registry if available
    let middleware;
    try {
      middleware = serviceRegistry.has('middleware') ? 
        serviceRegistry.get('middleware') : 
        require('./middleware');
    } catch (error) {
      logger.error('Failed to get middleware, using empty object:', error);
      middleware = { 
        logRequest: (req, res, next) => next(),
        verifyWebHook: (req, res, next) => next()
      };
    }

    this.middlewares = [
      express.json(),
      middleware.logRequest, // Add consistent request logging
      middleware.verifyWebHook
    ];
    this.logger = new Logger('CloudAdapter');
    this.errorHandler = new ErrorHandler('CloudAdapter');
  }
  
  /**
   * Add a route to the application
   * @param {string} path - Route path 
   * @param {Object} router - Express router
   */
  addRoute(path, router) {
    // To be implemented by subclasses
    throw new Error('Not implemented');
  }
  
  /**
   * Deploy the application
   */
  deploy() {
    // To be implemented by subclasses
    throw new Error('Not implemented');
  }
  
  /**
   * Add a health check endpoint
   * @returns {CloudAdapter} This adapter instance for method chaining
   */
  addHealthCheck() {
    const healthRouter = express.Router();
    healthRouter.get('/', (req, res) => {
      res.status(200).json({ 
        status: 'ok', 
        provider: cloud_provider,
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        environment: config.get('node_env', 'development')
      });
    });
    return this.addRoute('/health', healthRouter);
  }
  
  /**
   * Add standard error handling middleware
   * @private
   */
  _addErrorHandler(app) {
    app.use((err, req, res, next) => {
      // Use the ErrorHandler for consistent error handling
      const errorResponse = this.errorHandler.handleError(err, 'CloudAdapter');
      
      // Send consistent error response
      res.status(500).json(errorResponse);
    });
    return app;
  }
}

// Export the class for testing
exports.CloudAdapter = CloudAdapter;

/**
 * Google Cloud Functions/Cloud Run adapter
 */
class GCPAdapter extends CloudAdapter {
  constructor() {
    super();
    const express = require('express');
    this.app = express();
    
    // Track whether we're running in Cloud Run or Cloud Functions
    this.isCloudRun = process.env.K_SERVICE !== undefined;
    
    // For Cloud Functions, we need the functions framework
    if (!this.isCloudRun) {
      this.functions = require('@google-cloud/functions-framework');
    }
  }
  
  /**
   * Add a route to the GCP application 
   * @param {string} path - Route path
   * @param {Object} router - Express router
   * @returns {GCPAdapter} This adapter instance for method chaining
   */
  addRoute(path, router) {
    this.app.use(path, ...this.middlewares, router);
    return this;
  }
  
  /**
   * Deploy the GCP application
   * @returns {Object} Deployment result with handlers
   */
  deploy() {
    // Add common error handling
    this._addErrorHandler(this.app);
    
    if (this.isCloudRun) {
      // For Cloud Run, we need to start the HTTP server directly
      const port = parseInt(process.env.PORT || '8080', 10);
      
      // Only start the server if this is the main module
      if (require.main === module) {
        this.app.listen(port, () => {
          console.log(`Cloud Run service listening on port ${port}`);
        });
      }
      
      // Return the Express app for testing/direct use
      return {
        expressApp: this.app
      };
    } else {
      // For Cloud Functions, use the functions framework
      return {
        lexicon: this.functions.http('lexicon', this.app)
      };
    }
  }
}

// Export the class for testing
exports.GCPAdapter = GCPAdapter;

/**
 * Azure Functions adapter
 */
class AzureAdapter extends CloudAdapter {
  constructor() {
    super();
    // Detect if we're running in Azure Functions or Azure App Service
    this.isAppService = !process.env.FUNCTIONS_WORKER_RUNTIME;
    
    const express = require('express');
    this.app = express();
    
    // Only initialize Azure Functions SDK if running in Functions environment
    if (!this.isAppService) {
      try {
        const { app } = require('@azure/functions');
        this.azureApp = app;
        this.routes = [];
      } catch (error) {
        console.error('Failed to initialize Azure Functions SDK:', error);
        throw new Error('Azure Functions SDK initialization failed');
      }
    }
  }
  
  addRoute(path, router) {
    if (this.isAppService) {
      // For App Service, directly add routes to Express app
      this.app.use(path, ...this.middlewares, router);
    } else {
      // For Azure Functions, store routes for later processing
      this.routes.push({ path, router });
    }
    return this;
  }
  
  deploy() {
    if (this.isAppService) {
      // Add error handling middleware
      this._addErrorHandler(this.app);
      
      // For Azure App Service, start the HTTP server
      const port = parseInt(process.env.PORT || '8080', 10);
      
      // Only start server when running as main module
      if (require.main === module) {
        this.app.listen(port, () => {
          console.log(`Azure App Service listening on port ${port}`);
        });
      }
      
      return {
        expressApp: this.app
      };
    } else {
      // For Azure Functions
      const express = require('express');
      const app = express();
      
      // Add all routes to Express app
      for (const route of this.routes) {
        app.use(route.path, ...this.middlewares, route.router);
      }
      
      // Add error handling middleware
      this._addErrorHandler(app);
      
      // Register the HTTP trigger
      this.azureApp.http('lexicon', {
        methods: ['GET', 'POST'],
        authLevel: 'function',
        handler: async (request, context) => {
          // Create a response mock for Express.js
          const mockRes = this._createResponseMock();
          
          try {
            await this._processRequest(app, request, mockRes, context);
          } catch (error) {
            // Use the errorHandler for consistent error handling
            context.log.error('Error processing request:', error);
            const errorResponse = this.errorHandler.handleError(error, 'Azure Functions handler');
            
            context.res = {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(errorResponse)
            };
          }
        }
      });
      
      return this.azureApp;
    }
  }
  
  _createResponseMock() {
    return {
      statusCode: 200,
      headers: {},
      body: null,
      json: function(body) {
        this.body = JSON.stringify(body);
        this.headers['Content-Type'] = 'application/json';
        return this;
      },
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      setHeader: function(key, value) {
        this.headers[key] = value;
        return this;
      },
      send: function(body) {
        this.body = body;
        return this;
      }
    };
  }
  
  /**
   * Process an Express request and map it to Azure response format
   * @param {Object} app - Express application
   * @param {Object} request - HTTP request
   * @param {Object} mockRes - Mock response object
   * @param {Object} context - Azure function context
   * @returns {Promise<void>} Resolves when request is processed
   * @private
   */
  async _processRequest(app, request, mockRes, context) {
    if (!request || !app || !mockRes) {
      context.log.error('Invalid request processing parameters');
      context.res = {
        status: 500,
        body: JSON.stringify({ error: 'Internal server error - invalid request processing' })
      };
      return;
    }

    // Add required Express.js properties if they don't exist
    request.originalUrl = request.url;
    request.path = request.url?.split('?')[0];
    request.query = request.query || {};
    request.params = request.params || {};
    
    return new Promise((resolve, reject) => {
      let isResolved = false;
      
      // Create a timeout to prevent hanging promises
      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          context.log.error('Request processing timed out');
          reject(new Error('Request processing timed out'));
        }
      }, 30000); // 30-second timeout
      
      app(request, mockRes, (err) => {
        clearTimeout(timeout); // Clear the timeout
        
        if (isResolved) return; // Don't resolve/reject if already handled
        isResolved = true;
        
        if (err) {
          context.log.error('Express middleware error:', err);
          reject(err);
        } else {
          context.res = {
            status: mockRes.statusCode,
            body: mockRes.body,
            headers: mockRes.headers
          };
          resolve();
        }
      });
    });
  }
}

// Export the class for testing
exports.AzureAdapter = AzureAdapter;

/**
 * AWS App Runner adapter
 */
class AWSAdapter extends CloudAdapter {
  constructor() {
    super();
    const express = require('express');
    this.app = express();
  }
  
  addRoute(path, router) {
    this.app.use(path, ...this.middlewares, router);
    return this;
  }
  
  deploy() {
    // Add error handling middleware
    this._addErrorHandler(this.app);
    
    // For AWS App Runner, we need to start an HTTP server
    const port = parseInt(process.env.PORT || '8080', 10);
    
    // Only start the server if this is the main module
    if (require.main === module) {
      this.app.listen(port, () => {
        console.log(`AWS App Runner service listening on port ${port}`);
      });
    }
    
    return {
      expressApp: this.app
    };
  }
}

// Export the class for testing
exports.AWSAdapter = AWSAdapter;

/**
 * Test adapter for unit tests
 */
class TestAdapter extends CloudAdapter {
  constructor() {
    super();
    const express = require('express');
    this.app = express();
  }
  
  addRoute(path, router) {
    this.app.use(path, ...this.middlewares, router);
    return this;
  }
  
  deploy() {
    // Add error handling middleware
    this._addErrorHandler(this.app);
    
    return {
      expressApp: this.app
    };
  }
}

// Export the class for testing
exports.TestAdapter = TestAdapter;

/**
 * Factory function to create the appropriate adapter
 * @param {string} provider - Cloud provider name
 * @returns {CloudAdapter} The appropriate cloud adapter instance
 * @throws {Error} If provider is not supported
 */
function createCloudAdapter(provider) {
  if (!provider) {
    console.warn('No cloud provider specified, defaulting to GCP');
    provider = 'GCP';
  }

  switch (provider.toUpperCase()) {
    case 'GCP':
      return new GCPAdapter();
    
    case 'AZURE':
      return new AzureAdapter();
    
    case 'AWS':
      return new AWSAdapter();
    
    case 'TEST':
      return new TestAdapter();
    
    default:
      throw new Error(`Unsupported cloud provider: ${provider}`);
  }
}

// Export the factory function for testing
exports.createCloudAdapter = createCloudAdapter;

// Create and configure the adapter
(async function() {
  try {
    // Log environment information for debugging purposes
    const nodeEnv = config.get('node_env', 'development');
    const isCloudEnv = config.get('_isRunningInCloud', false);
    
    logger.info(`Lexicon starting in ${nodeEnv} environment${isCloudEnv ? ' (cloud detected)' : ''}`, {
      cloudProvider: cloud_provider,
      version: process.env.npm_package_version || '1.0.0'
    });
    
    // Initialize services in the correct order
    await startup.initialize();
    
    // Get references to initialized services
    const initialization = serviceRegistry.get('initialization');
    const webhookRouter = serviceRegistry.get('webhookRouter');
    
    // Register the adapter component before trying to create it
    initialization.registerComponent(`${cloud_provider}Adapter`);
    let adapter;
    
    try {
      adapter = createCloudAdapter(cloud_provider);
      
      // Register the adapter in the service registry
      serviceRegistry.register('cloudAdapter', adapter);
      
      initialization.markInitialized(`${cloud_provider}Adapter`, {
        provider: cloud_provider,
        isCloudRun: adapter.isCloudRun,
        isAppService: adapter.isAppService
      });
    } catch (error) {
      initialization.markFailed(`${cloud_provider}Adapter`, error);
      throw error; // Re-throw to handle in outer catch
    }
    
    // Register routes components
    initialization.registerComponent('Routes');
    try {
      // Add routes
      adapter.addRoute('/webhook', webhookRouter);
      adapter.addHealthCheck();
      
      initialization.markInitialized('Routes', {
        endpoints: ['/webhook', '/health']
      });
    } catch (error) {
      initialization.markFailed('Routes', error);
      throw error;
    }
    
    // Register deployment component
    initialization.registerComponent('Deployment');
    let deployment;
    try {
      // Deploy and export the handler
      deployment = adapter.deploy();
      
      // Include the full deployment details
      initialization.markInitialized('Deployment', {
        type: cloud_provider
      });
      
      // Wait for all registered connectors to initialize
      try {
        // This leverages the registration that happens in ConnectorBase
        await initialization.waitForConnectors();
        
        // Now generate the final summary after all connectors are accounted for
        initialization.finalizeSummary();
        
        // Log the final initialization state
        logger.info(`Lexicon initialized successfully with ${cloud_provider} adapter`, {
          api: 'WebhookRouter, HealthCheck',
          connectors: initialization.getRegisteredConnectorsString(),
          env: nodeEnv
        });

        // Mark the app as fully initialized
        app.initialized = true;
        
        // Mount all routes directly on the app we exported at the beginning
        if (adapter && webhookRouter) {
          logger.info('Mounting webhook routes on main app');
          const middleware = require('./middleware');
          app.use('/webhook', middleware.verifyWebHook, webhookRouter);
          
          // Add health check endpoint
          app.get('/health', (req, res) => {
            res.status(200).json({ 
              status: 'ok', 
              provider: cloud_provider,
              version: process.env.npm_package_version || '1.0.0',
              timestamp: new Date().toISOString(),
              environment: config.get('node_env', 'development')
            });
          });
        }
      } catch (error) {
        logger.error('Error waiting for connectors to initialize:', error);
      }
      
      // Configure the lexicon app directly instead of replacing it
      if (cloud_provider.toUpperCase() === 'GCP') {
        if (deployment.expressApp) {
          // Copy all routes and middleware from the deployed app to our exported app
          lexiconApp = deployment.expressApp;
          logger.info('Configured Express app for direct handling');
        }
      }
      
      // Now that everything is initialized, export the correct app or function handler
      if (cloud_provider.toUpperCase() === 'GCP') {
        if (deployment.lexicon) {
          // For Cloud Functions
          exports.lexicon = deployment.lexicon;
          logger.info('Exported function handler for Cloud Functions');
        } else if (deployment.expressApp) {
          // For Cloud Run
          exports.lexicon = deployment.expressApp;
          logger.info('Exported Express app handler for Cloud Run');
        }
      } else if (cloud_provider.toUpperCase() === 'AZURE') {
        // For Azure, the deployment itself is the handler
        if (!adapter.isAppService) {
          // Nothing to export as Azure Functions handles registration differently
          logger.info('Configured Azure Functions HTTP triggers');
        } else if (deployment.expressApp) {
          // For App Service
          exports.lexicon = deployment.expressApp;
          logger.info('Exported Express app handler for Azure App Service');
        }
      } else if (deployment.expressApp) {
        // For AWS and other providers
        exports.lexicon = deployment.expressApp;
        logger.info(`Exported Express app handler for ${cloud_provider}`);
      }
      
      // Export the Express app for testing purposes
      if (deployment.expressApp) {
        exports.app = deployment.expressApp;
      }
    } catch (error) {
      initialization.markFailed('Deployment', error);
      throw error;
    }
    
    // Log initialization summary
    initialization.logSummary();
    
  } catch (error) {
    logger.error('Failed to initialize cloud adapter:', error);
    
    // Provide more specific error information in development
    if (config.get('node_env') !== 'production') {
      logger.error('Error details:', error.stack);
    }
    
    // Don't throw in production, but exit with error if this is the main module
    if (require.main === module) {
      process.exit(1);
    }
  }
})();
