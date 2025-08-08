/**
 * Lexicon - Multi-cloud serverless function entry point (ES Modules)
 */
import config from './config.js';
import startup from './startup.js';
import { Logger } from './loggerFramework.js';
import { ErrorHandler } from './errorHandler.js';
import express from 'express';
import serviceRegistry from './serviceRegistry.js';

// Configure logger for index.js
const logger = new Logger('Index');

// Get the cloud provider
const cloud_provider = config.get('cloud_provider', 'GCP');

// Check if we should run in MCP mode
const isMCPMode = process.env.MCP_MODE === 'true' || process.argv.includes('--mcp');

// If MCP mode is requested, delegate to MCP server
if (isMCPMode) {
  logger.info('Starting in MCP mode...');
  const { main } = await import('./MCP/mcp-main.js');
  main().catch((error) => {
    logger.error('MCP mode failed:', error);
    process.exit(1);
  });
  process.exit(0); // Exit after starting MCP mode
}

// Create and export a minimal Express app right away that will be used
// as the handler for cloud functions. This ensures it is defined immediately.
const app = express();

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
export class CloudAdapter {
  /**
   * Initialize the adapter with standard middleware
   */
  constructor() {
    this.logger = new Logger('CloudAdapter');
    this.errorHandler = new ErrorHandler('CloudAdapter');
    this.middlewares = [express.json()]; // Basic middleware
  }
  
  /**
   * Initialize async components
   */
  async initialize() {
    // Get middleware from the service registry if available
    let middleware;
    try {
      middleware = serviceRegistry.has('middleware') ? 
        serviceRegistry.get('middleware') : 
        (await import('./middleware.js')).default;
    } catch (error) {
      this.logger.error('Failed to get middleware, using empty object:', error);
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
  }
  
  /**
   * Create an instance of CloudAdapter
   */
  static async create() {
    const instance = new CloudAdapter();
    await instance.initialize();
    return instance;
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

/**
 * Google Cloud Functions/Cloud Run adapter
 */
export class GCPAdapter extends CloudAdapter {
  constructor() {
    super();
    this.app = express();
    
    // Track whether we're running in Cloud Run or Cloud Functions
    this.isCloudRun = process.env.K_SERVICE !== undefined;
  }
  
  /**
   * Initialize async components
   */
  async initialize() {
    await super.initialize();
    
    // For Cloud Functions, we need the functions framework
    if (!this.isCloudRun) {
      try {
        this.functions = await import('@google-cloud/functions-framework');
      } catch (error) {
        this.logger.warn('Functions framework not available, running in development mode');
        this.functions = null;
      }
    }
  }
  
  /**
   * Create an instance of GCPAdapter
   */
  static async create() {
    const instance = new GCPAdapter();
    await instance.initialize();
    return instance;
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
      if (import.meta.url === `file://${process.argv[1]}`) {
        this.app.listen(port, () => {
          console.log(`Cloud Run service listening on port ${port}`);
        });
      }
      
      // Return the Express app for testing/direct use
      return {
        expressApp: this.app
      };
    } else {
      // For Cloud Functions, use the functions framework if available
      if (this.functions && this.functions.http) {
        return {
          lexicon: this.functions.http('lexicon', this.app)
        };
      } else {
        // Fallback for development - just return the express app
        this.logger.warn('Functions framework not available, using Express app directly');
        return {
          expressApp: this.app
        };
      }
    }
  }
}

/**
 * Azure Functions adapter
 */
export class AzureAdapter extends CloudAdapter {
  constructor() {
    super();
    // Detect if we're running in Azure Functions or Azure App Service
    this.isAppService = !process.env.FUNCTIONS_WORKER_RUNTIME;
    
    this.app = express();
  }
  
  /**
   * Initialize async components
   */
  async initialize() {
    await super.initialize();
    
    // Only initialize Azure Functions SDK if running in Functions environment
    if (!this.isAppService) {
      try {
        const { app } = await import('@azure/functions');
        this.azureApp = app;
        this.routes = [];
      } catch (error) {
        console.error('Failed to initialize Azure Functions SDK:', error);
        throw new Error('Azure Functions SDK initialization failed');
      }
    }
  }
  
  /**
   * Create an instance of AzureAdapter
   */
  static async create() {
    const instance = new AzureAdapter();
    await instance.initialize();
    return instance;
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
      
      // Only start the server if this is the main module
      if (import.meta.url === `file://${process.argv[1]}`) {
        this.app.listen(port, () => {
          console.log(`Azure App Service listening on port ${port}`);
        });
      }
      
      // Return the Express app for testing/direct use
      return {
        expressApp: this.app
      };
    } else {
      // For Azure Functions, register HTTP triggers
      this.routes.forEach(({ path, router }) => {
        this.azureApp.http(`lexicon-${path.replace(/[^a-zA-Z0-9]/g, '')}`, {
          methods: ['GET', 'POST', 'PUT', 'DELETE'],
          route: path.startsWith('/') ? path.substring(1) : path,
          handler: (request, context) => {
            // Create Express-like request and response objects
            const req = {
              ...request,
              method: request.method,
              path: request.path || request.url,
              body: request.body,
              headers: request.headers,
              query: request.query
            };
            
            const res = {
              status: (code) => {
                context.res = { ...context.res, status: code };
                return res;
              },
              json: (data) => {
                context.res = { 
                  ...context.res, 
                  body: JSON.stringify(data),
                  headers: { 'Content-Type': 'application/json' }
                };
                return res;
              }
            };
            
            // Execute middleware chain
            const executeMiddlewares = async (middlewares, index = 0) => {
              if (index >= middlewares.length) {
                return;
              }
              
              const middleware = middlewares[index];
              return new Promise((resolve, reject) => {
                middleware(req, res, (err) => {
                  if (err) reject(err);
                  else resolve(executeMiddlewares(middlewares, index + 1));
                });
              });
            };
            
            return executeMiddlewares([...this.middlewares, router]);
          }
        });
      });
      
      return {
        azureApp: this.azureApp
      };
    }
  }
}

/**
 * AWS Lambda adapter
 */
export class AWSAdapter extends CloudAdapter {
  constructor() {
    super();
    this.app = express();
    
    // Detect if we're running in Lambda or Elastic Beanstalk/EC2
    this.isLambda = process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
  }
  
  /**
   * Initialize async components
   */
  async initialize() {
    await super.initialize();
    
    if (this.isLambda) {
      const serverlessExpress = await import('@vendia/serverless-express');
      this.serverlessExpress = serverlessExpress.default;
    }
  }
  
  /**
   * Create an instance of AWSAdapter
   */
  static async create() {
    const instance = new AWSAdapter();
    await instance.initialize();
    return instance;
  }
  
  addRoute(path, router) {
    this.app.use(path, ...this.middlewares, router);
    return this;
  }
  
  deploy() {
    // Add error handling middleware
    this._addErrorHandler(this.app);
    
    if (this.isLambda) {
      // For Lambda, use serverless-express
      return {
        lexicon: this.serverlessExpress({ app: this.app })
      };
    } else {
      // For EC2/Beanstalk, start HTTP server
      const port = parseInt(process.env.PORT || '8080', 10);
      
      // Only start the server if this is the main module
      if (import.meta.url === `file://${process.argv[1]}`) {
        this.app.listen(port, () => {
          console.log(`AWS service listening on port ${port}`);
        });
      }
      
      // Return the Express app for testing/direct use
      return {
        expressApp: this.app
      };
    }
  }
}

// Export variables that need to be accessed
export { app, cloud_provider };

// Main initialization function
async function initializeLexicon() {
  try {
    logger.info(`Starting Lexicon on ${cloud_provider}...`);

    // Import initialization module
    const initialization = (await import('./initialization.js')).default;
    
    initialization.markInitialized('Index');
    
    // Initialize Lexicon services first
    await startup.initialize();
    
    // Create appropriate cloud adapter
    let adapter;
    
    switch (cloud_provider.toUpperCase()) {
      case 'GCP':
        adapter = await GCPAdapter.create();
        break;
      case 'AZURE':
        adapter = await AzureAdapter.create();
        break;
      case 'AWS':
        adapter = await AWSAdapter.create();
        break;
      default:
        throw new Error(`Unsupported cloud provider: ${cloud_provider}`);
    }
    
    initialization.markInitialized('CloudAdapter');
    
    // Configure adapter with routes
    try {
      const webhookRouter = serviceRegistry.has('webhookRouter') ?
        serviceRegistry.get('webhookRouter') :
        (await import('./webhookRouter.js')).default;
      
      adapter
        .addRoute('/webhook', webhookRouter)
        .addHealthCheck();        initialization.markInitialized('Webhook Routes');
    } catch (error) {
      initialization.markFailed('Webhook Routes', error);
      throw error;
    }
    
    // Deploy the application
    try {
      const deployment = adapter.deploy();
      
      // Mark the app as initialized
      app.initialized = true;
      
      if (deployment.expressApp) {
        // Copy all routes and middleware from the adapter's app to our main app
        deployment.expressApp._router.stack.forEach(layer => {
          app._router.stack.push(layer);
        });
        
        logger.info('Configured Express app for direct handling');
      }
      
      initialization.markInitialized('Deployment');
      
      // Store deployment for export
      app.deployment = deployment;
      
    } catch (error) {
      initialization.markFailed('Deployment', error);
      throw error;
    }
    
    // Log initialization summary
    initialization.logSummary();
    
    return app;
    
  } catch (error) {
    logger.error('Failed to initialize cloud adapter:', error);
    
    // Provide more specific error information in development
    if (config.get('node_env') !== 'production') {
      logger.error('Error details:', error.stack);
    }
    
    // Don't throw in production, but exit with error if this is the main module
    if (import.meta.url === `file://${process.argv[1]}`) {
      process.exit(1);
    }
    
    throw error;
  }
}

// Initialize if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeLexicon().catch(error => {
    logger.error('Failed to start Lexicon:', error);
    process.exit(1);
  });
}

// Export the main app and initialization function
export default app;
export { initializeLexicon };

// Export for Google Cloud Functions Framework compatibility
// Initialize immediately when the module is imported
const initializeForFunctions = async () => {
  try {
    logger.info('Initializing Lexicon for Google Cloud Functions Framework...');
    await initializeLexicon();
    logger.info('Lexicon initialization completed');
    return app;
  } catch (error) {
    logger.error('Failed to initialize Lexicon:', error);
    // Return an error handler app
    const errorApp = express();
    errorApp.use((req, res) => {
      res.status(503).json({
        success: false,
        error: 'Service initialization failed',
        message: error.message
      });
    });
    return errorApp;
  }
};

// Create the initialized app for Functions Framework
export const lexicon = await initializeForFunctions();

// For compatibility with CommonJS exports, we'll need to set up dynamic exports
// This will be handled in the migration by updating the cloud-specific deployment code
