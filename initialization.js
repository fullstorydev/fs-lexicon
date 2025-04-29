/**
 * Initialization - Centralized component initialization and logging
 * Provides consistent startup logging across all components
 */
const { Logger } = require('./loggerFramework');

class Initialization {
  constructor() {
    this.logger = new Logger('Initialization');
    this.components = new Set();
    this.initializedComponents = [];
    this.failedComponents = [];
    this.connectors = new Set();
    this.registeredConnectors = new Set(); // Track all registered connectors
    this.summarized = false; // Track if summary has been generated
  }

  /**
   * Register a component to be tracked during initialization
   * @param {string} name - Component name
   */
  registerComponent(name) {
    this.components.add(name);
  }

  /**
   * Mark a component as successfully initialized
   * @param {string} name - Component name
   * @param {Object} details - Optional initialization details
   */
  markInitialized(name, details = {}) {
    if (!this.components.has(name)) {
      this.registerComponent(name);
    }
    
    // Sanitize details before logging
    const sanitizedDetails = this._sanitizeInitDetails(details);
    
    this.initializedComponents.push({ 
      name, 
      details: sanitizedDetails, 
      timestamp: new Date() 
    });
    
    this.logger.info(`Component initialized: ${name}`, sanitizedDetails);
  }

  /**
   * Mark a component as failed initialization
   * @param {string} name - Component name
   * @param {Error} error - Initialization error
   */
  markFailed(name, error) {
    if (!this.components.has(name)) {
      this.registerComponent(name);
    }
    
    this.failedComponents.push({ name, error, timestamp: new Date() });
    this.logger.error(`Component failed to initialize: ${name}`, error);
  }

  /**
   * Extract routes from an Express router
   * @param {Object} router - Express router object
   * @returns {Array<string>} List of route paths
   */
  extractRoutes(router) {
    if (!router || !router.stack) {
      return [];
    }

    const routes = [];
    
    const extractLayerRoutes = (layer) => {
      if (layer.route) {
        // This is a route - extract the path and methods
        const methods = Object.keys(layer.route.methods)
          .filter(method => layer.route.methods[method])
          .map(method => method.toUpperCase());
        
        routes.push(`${methods.join('/')} ${layer.route.path}`);
      } else if (layer.name === 'router' && layer.handle.stack) {
        // This is a nested router
        layer.handle.stack.forEach(extractLayerRoutes);
      }
    };

    router.stack.forEach(extractLayerRoutes);
    return routes;
  }

  /**
   * Mark a router as initialized, automatically detecting its routes
   * @param {string} name - Router component name
   * @param {Object} router - Express router object
   */
  markRouterInitialized(name, router) {
    const routes = this.extractRoutes(router);
    this.markInitialized(name, { routes });
  }

  /**
   * Register a connector that has been initialized
   * @param {string} connectorName - Name of the initialized connector
   */
  registerConnector(connectorName) {
    // Keep track of all connectors that have been registered
    this.registeredConnectors.add(connectorName);
    this.connectors.add(connectorName);
    this.logger.debug(`Connector registered: ${connectorName}`);
  }

  /**
   * Get all registered connectors as a comma-separated string
   * @returns {string} Comma-separated list of registered connectors
   */
  getRegisteredConnectorsString() {
    return Array.from(this.connectors).join(', ') || 'None';
  }

  /**
   * Wait for all registered connectors to initialize (or fail)
   * @param {number} timeoutMs - Maximum time to wait in milliseconds
   * @returns {Promise<boolean>} True if all connectors are initialized or failed
   */
  async waitForConnectors(timeoutMs = 5000) {
    const startTime = Date.now();
    
    // If no connectors were registered, return immediately
    if (this.registeredConnectors.size === 0) {
      this.logger.info('No connectors registered, skipping wait');
      return true;
    }
    
    this.logger.debug(`Waiting for ${this.registeredConnectors.size} connectors to initialize`);
    
    // Function to check if all connectors are accounted for (initialized or failed)
    const allConnectorsReady = () => {
      // Get all successful and failed connector names
      const initializedNames = this.initializedComponents
        .filter(c => this.registeredConnectors.has(c.name))
        .map(c => c.name);
      
      const failedNames = this.failedComponents
        .filter(c => this.registeredConnectors.has(c.name))
        .map(c => c.name);
      
      // Combine successful and failed connectors
      const accountedFor = new Set([...initializedNames, ...failedNames]);
      
      // Find any connectors that haven't completed initialization
      const pending = Array.from(this.registeredConnectors)
        .filter(name => !accountedFor.has(name));
        
      // Return true if all connectors are accounted for
      return pending.length === 0;
    };
    
    // Poll until all connectors are ready or timeout
    while (Date.now() - startTime < timeoutMs) {
      if (allConnectorsReady()) {
        const initializedCount = this.initializedComponents
          .filter(c => this.registeredConnectors.has(c.name)).length;
        
        const failedCount = this.failedComponents
          .filter(c => this.registeredConnectors.has(c.name)).length;
          
        this.logger.info('All connectors completed initialization', {
          success: initializedCount,
          failed: failedCount,
          total: this.registeredConnectors.size
        });
        
        return true;
      }
      
      // Sleep for a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // If we reached the timeout, log what's still pending
    const initializedNames = this.initializedComponents
      .filter(c => this.registeredConnectors.has(c.name))
      .map(c => c.name);
    
    const failedNames = this.failedComponents
      .filter(c => this.registeredConnectors.has(c.name))
      .map(c => c.name);
      
    const pendingNames = Array.from(this.registeredConnectors)
      .filter(name => !initializedNames.includes(name) && !failedNames.includes(name));
      
    if (pendingNames.length > 0) {
      this.logger.warn('Timed out waiting for connectors to initialize', {
        pending: pendingNames,
        initialized: initializedNames,
        failed: failedNames
      });
    }
    
    return false;
  }

  /**
   * Sanitize initialization details to remove sensitive information
   * @param {Object} details - Initialization details object
   * @returns {Object} Sanitized details object
   * @private
   */
  _sanitizeInitDetails(details) {
    if (!details || typeof details !== 'object') {
      return details;
    }

    const sanitized = { ...details };
    
    // List of potentially sensitive fields to sanitize
    const sensitiveFields = [
      'apiKey', 'token', 'key', 'secret', 'password', 'passphrase', 
      'privateKey', 'credential', 'sheetsId', 'sheetId', 'configPath',
      'database', 'schema', 'projectId', 'orgId'
    ];
    
    // Check each field against our sensitive fields list
    Object.keys(sanitized).forEach(key => {
      // If the field name contains a sensitive term
      const isSensitive = sensitiveFields.some(term => 
        key.toLowerCase().includes(term.toLowerCase())
      );
      
      if (isSensitive && sanitized[key]) {
        // Replace with a redacted indicator but keep field type
        if (typeof sanitized[key] === 'string') {
          if (key === 'status' || key.includes('has') || key.includes('is')) {
            // Don't redact status indicators or boolean flags
            // This keeps "isConfigured", "hasClient", etc. visible
          } else {
            // Completely redact all sensitive strings
            sanitized[key] = '[REDACTED]';
          }
        } else if (typeof sanitized[key] === 'boolean') {
          // Keep boolean values as they're rarely sensitive
        } else {
          // Redact other types of sensitive data
          sanitized[key] = '[REDACTED]';
        }
      }
    });
    
    return sanitized;
  }

  /**
   * Get a summary of all component initializations
   * @returns {Object} Summary object with initialized, failed, and pending components
   */
  getSummary() {
    const successful = this.initializedComponents.map(c => c.name);
    const failed = this.failedComponents.map(c => ({ 
      name: c.name, 
      error: c.error ? c.error.message : 'Unknown error' 
    }));
    const notInitialized = [...this.components].filter(
      name => !successful.includes(name) && !failed.some(f => f.name === name)
    );
    
    return {
      initialized: successful,
      failed: failed,
      pending: notInitialized
    };
  }

  /**
   * Log a summary of all component initializations
   * @param {boolean} force - Force generating the summary even if already generated
   */
  logSummary(force = false) {
    // Only generate summary once unless forced
    if (this.summarized && !force) {
      return null;
    }
    
    const successful = this.initializedComponents.map(c => c.name);
    const failed = this.failedComponents.map(c => c.name);
    const notInitialized = [...this.components].filter(
      name => !successful.includes(name) && !failed.includes(name)
    );
    
    const summary = {
      initialized: successful,
      failed: failed,
      pending: notInitialized,
      total: this.components.size,
      success: successful.length,
      failures: failed.length,
      connectors: Array.from(this.connectors)
    };
    
    this.logger.info('Initialization summary', summary);
    this.summarized = true;
    
    return summary;
  }

  /**
   * Force a rescan of initialized components to update connectors list
   * and generate a final summary at the end of the initialization process
   */
  finalizeSummary() {
    // Generate a summary with the most up-to-date information
    return this.logSummary(true);
  }
}

// Create singleton instance
const initialization = new Initialization();

// Export the singleton
module.exports = initialization;
