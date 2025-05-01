const { Logger } = require('./loggerFramework');
const { createErrorHandler } = require('./errorHandler');
const ConnectorConfigValidator = require('./connectorConfigValidator');
const serviceRegistry = require('./serviceRegistry');
// Direct import of config for fallback when registry isn't ready
const configFallback = require('./config');

/**
 * Base class for all connectors
 */
class ConnectorBase {
  /**
   * Create a new connector
   * @param {string} name - Connector name
   * @param {Object} [options] - Additional configuration options
   */
  constructor(name, options = {}) {
    this.name = name;
    this.logger = new Logger(`Connector:${name}`);
    this.errorHandler = createErrorHandler(`Connector:${name}`);
    
    // Get config from options, service registry, or fallback to direct import
    let config;
    try {
      config = options.config || (serviceRegistry.has('config') ? serviceRegistry.get('config') : configFallback);
    } catch (error) {
      this.logger.debug(`Using direct config import as fallback: ${error.message}`);
      config = configFallback;
    }
    
    // Create validator with config instance
    this.validator = new ConnectorConfigValidator(name, config);
    this.initialized = false;
    this.options = options;

    // Handle initialization service gracefully
    let initialization;
    try {
      initialization = options.initialization || (serviceRegistry.has('initialization') ? serviceRegistry.get('initialization') : null);
    } catch (error) {
      this.logger.debug(`Initialization service not available yet: ${error.message}`);
      initialization = null;
    }
    
    this.initialization = initialization;
    
    if (this.initialization) {
      try {
        // Register the connector for initialization tracking
        this.initialization.registerComponent(this.name);
      } catch (error) {
        this.logger.warn(`Could not register connector component: ${error.message}`);
      }
    }
  }

  /**
   * Initialize the connector
   * @returns {Promise<boolean>} Whether initialization succeeded
   */
  async initialize() {
    try {
      // If no initialization service, just run the connector initialization
      if (!this.initialization) {
        const initResult = await this._initializeConnector();
        this.initialized = true;
        this.logger.info(`Connector ${this.name} initialized without tracking`, initResult || {});
        return true;
      }
      
      // Register as a connector first, so we're counted even during initialization
      this.initialization.registerConnector(this.name);
      
      // Perform connector-specific initialization
      const initResult = await this._initializeConnector();
      
      // Mark connector as initialized in the tracking system
      this.initialization.markInitialized(this.name, initResult || {});
      
      this.initialized = true;
      return true;
    } catch (error) {
      // Handle error logging when initialization isn't available
      if (!this.initialization) {
        this.logger.error(`Failed to initialize ${this.name} connector:`, error);
        return false;
      }
      
      // Let initialization.markFailed handle the logging
      this.initialization.markFailed(this.name, error);
      return false;
    }
  }

  /**
   * Connector-specific initialization logic - to be implemented by subclasses
   * @returns {Promise<Object>} Initialization result details
   * @protected
   */
  async _initializeConnector() {
    // Default implementation - subclasses should override
    return { status: 'nominal' };
  }

  /**
   * Get a configuration value 
   * This method uses the validator to ensure proper validation and error tracking
   * @param {string} key - Configuration key to retrieve
   * @param {any} defaultValue - Default value if key is not found
   * @returns {any} The configuration value
   */
  getConfig(key, defaultValue = undefined) {
    return this.validator.validateConfig(key, defaultValue);
  }

  /**
   * Get a boolean configuration value
   * Uses the validator for proper validation and type conversion
   * @param {string} key - Configuration key to retrieve
   * @param {boolean} defaultValue - Default value if key is not found
   * @returns {boolean} The boolean configuration value
   */
  getConfigBoolean(key, defaultValue = false) {
    return this.validator.validateBoolean(key, defaultValue);
  }

  /**
   * Get a numeric configuration value
   * Uses the validator for proper validation and type conversion
   * @param {string} key - Configuration key to retrieve
   * @param {number} defaultValue - Default value if key is not found
   * @returns {number} The numeric configuration value
   */
  getConfigNumber(key, defaultValue = 0) {
    return this.validator.validateNumber(key, defaultValue);
  }

  /**
   * Check if the connector is properly initialized
   * @param {boolean} throwError - Whether to throw an error if not initialized
   * @returns {boolean} Whether the connector is initialized
   */
  checkInitialized(throwError = false) {
    if (!this.initialized && throwError) {
      const error = new Error(`Connector ${this.name} is not initialized`);
      this.logger.error('Connector not initialized', error);
      throw error;
    }
    return this.initialized;
  }

  /**
   * Execute a function safely with proper error handling
   * @param {Function} fn - Function to execute
   * @param {string} operationName - Name of the operation
   * @param {any} defaultValue - Default value to return on error
   * @returns {Promise<any>} Result of the function or default value
   */
  async safeExecute(fn, operationName, defaultValue = null) {
    try {
      // Ensure connector is initialized
      this.checkInitialized(true);
      
      // Execute the function
      return await fn();
    } catch (error) {
      this.logger.error(`Error during ${operationName}`, error);
      return defaultValue;
    }
  }
}

module.exports = ConnectorBase;
