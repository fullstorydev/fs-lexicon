/**
 * Startup - Manages the initialization sequence for Lexicon
 * Ensures services are started in the correct order to prevent circular dependencies
 */
const { Logger } = require('./loggerFramework');
const serviceRegistry = require('./serviceRegistry');

// Initialize logger
const logger = new Logger('Startup');

/**
 * Startup sequence manager for Lexicon
 */
class Startup {
  constructor() {
    this.phases = [
      {
        name: 'Core Services',
        services: ['config', 'initialization', 'middleware'],
        initialized: false
      },
      {
        name: 'Database & Resources',
        services: ['konbini', 'snowflake', 'bigQuery', 'googleWorkspace'],
        initialized: false
      },
      {
        name: 'External Integrations',
        services: ['fullstory', 'slack', 'atlassian'],
        initialized: false
      },
      {
        name: 'Webhooks & Routes',
        services: ['webhookRouter'],
        initialized: false
      },
      {
        name: 'Cloud Adapter', 
        services: ['cloudAdapter'],
        initialized: false
      }
    ];
    
    this.initialized = false;
  }
  
  /**
   * Initialize all services in the specified order
   * @returns {Promise<boolean>} Whether initialization was successful
   */
  async initialize() {
    logger.info('Starting Lexicon initialization sequence');
    
    try {
      // Register core services first
      await this._registerCoreServices();
      
      // Initialize each phase in sequence
      for (const phase of this.phases) {
        logger.info(`Initializing ${phase.name} phase`);
        
        try {
          await this._initializePhase(phase);
          phase.initialized = true;
          logger.info(`Completed ${phase.name} phase initialization`);
        } catch (error) {
          logger.error(`Error initializing ${phase.name} phase:`, error);
          // Continue with next phase even if this one fails
        }
      }
      
      // Mark startup as complete
      this.initialized = true;
      logger.info('Lexicon initialization sequence complete');
      
      // Log any services that failed to initialize
      this._logInitializationStatus();
      
      return true;
    } catch (error) {
      logger.error('Fatal error during initialization sequence:', error);
      return false;
    }
  }
  
  /**
   * Register core services that are needed for initialization
   * @private
   */
  async _registerCoreServices() {
    try {
      // Import services - order matters here
      const config = require('./config');
      const initialization = require('./initialization');
      
      // Register in service registry
      serviceRegistry.register('config', config);
      serviceRegistry.register('initialization', initialization);
      
      logger.info('Core services registered successfully');
    } catch (error) {
      logger.error('Failed to register core services:', error);
      throw error;
    }
  }
  
  /**
   * Initialize a specific phase
   * @param {Object} phase - Phase to initialize
   * @private
   */
  async _initializePhase(phase) {
    // For each service in the phase, check if it's in the registry
    for (const serviceName of phase.services) {
      try {
        if (serviceRegistry.has(serviceName)) {
          logger.debug(`Service ${serviceName} is already registered`);
          continue;
        }
        
        // Special handling for specific services
        switch (serviceName) {
          case 'middleware':
            // Must be initialized differently since the middleware service 
            // doesn't export itself as a proper service (it exports methods)
            this._initializeMiddleware();
            break;
            
          case 'konbini':
            // Konbini already initializes itself when required, just need to register it
            const konbini = require('./konbini');
            serviceRegistry.register('konbini', konbini);
            break;
            
          case 'webhookRouter':
            // Webhook router needs special handling
            this._initializeWebhookRouter();
            break;
            
          case 'cloudAdapter':
            // Cloud adapter is created in index.js, not here
            break;
            
          default:
            // For other services, assume they export a service
            // This pattern works for connectors that initialize themselves
            logger.warn(`No special initialization for ${serviceName}, check if it initializes correctly`);
        }
      } catch (error) {
        logger.error(`Failed to initialize service ${serviceName}:`, error);
        // Continue with next service
      }
    }
  }
  
  /**
   * Initialize middleware service
   * @private
   */
  _initializeMiddleware() {
    try {
      // Middleware already registers itself with the registry
      require('./middleware');
      logger.debug('Middleware service initialized');
    } catch (error) {
      logger.error('Failed to initialize middleware:', error);
    }
  }
  
  /**
   * Initialize webhook router
   * @private
   */
  _initializeWebhookRouter() {
    try {
      const webhookRouter = require('./webhookRouter');
      serviceRegistry.register('webhookRouter', webhookRouter);
      logger.debug('Webhook router initialized');
    } catch (error) {
      logger.error('Failed to initialize webhook router:', error);
    }
  }
  
  /**
   * Log the initialization status of all services
   * @private
   */
  _logInitializationStatus() {
    if (!serviceRegistry.has('initialization')) {
      logger.warn('Initialization service not available for status report');
      return;
    }
    
    try {
      const initialization = serviceRegistry.get('initialization');
      const summary = initialization.getSummary();
      
      // Log initialized components
      if (summary.initialized && summary.initialized.length > 0) {
        logger.info(`Successfully initialized ${summary.initialized.length} components`);
      }
      
      // Log failed components
      if (summary.failed && summary.failed.length > 0) {
        logger.warn(`Failed to initialize ${summary.failed.length} components`);
        for (const item of summary.failed) {
          logger.warn(`  - ${item.name}: ${item.error}`);
        }
      }
      
      // Log pending components
      if (summary.pending && summary.pending.length > 0) {
        logger.warn(`${summary.pending.length} components still pending initialization`);
        for (const item of summary.pending) {
          logger.warn(`  - ${item}`);
        }
      }
    } catch (error) {
      logger.error('Error generating initialization status report:', error);
    }
  }
  
  /**
   * Get the initialization status
   * @returns {Object} Initialization status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      phases: this.phases.map(phase => ({
        name: phase.name,
        initialized: phase.initialized
      })),
      serviceCount: serviceRegistry.getServiceNames().length
    };
  }
}

// Create singleton instance
const startupManager = new Startup();

module.exports = startupManager;