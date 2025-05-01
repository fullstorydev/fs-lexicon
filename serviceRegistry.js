/**
 * Service Registry - Centralized management of shared services
 * Provides dependency injection for the Lexicon application
 */
const { Logger } = require('./loggerFramework');

// Create a logger for the registry
const logger = new Logger('ServiceRegistry');

/**
 * Singleton service registry for dependency management
 */
class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.logger = logger;
    this.logger.debug('Service registry initialized');
  }

  /**
   * Register a service with the registry
   * @param {string} name - Name of the service
   * @param {any} instance - Service instance
   * @returns {ServiceRegistry} This registry instance for chaining
   */
  register(name, instance) {
    if (!name) {
      throw new Error('Service name is required');
    }
    
    if (this.services.has(name)) {
      this.logger.warn(`Service "${name}" is already registered and will be overwritten`);
    }
    
    this.services.set(name, instance);
    this.logger.debug(`Service "${name}" registered successfully`);
    return this;
  }

  /**
   * Get a service from the registry
   * @param {string} name - Name of the service to retrieve
   * @returns {any} The service instance
   * @throws {Error} If the service is not registered
   */
  get(name) {
    if (!this.services.has(name)) {
      throw new Error(`Service "${name}" is not registered`);
    }
    
    return this.services.get(name);
  }

  /**
   * Check if a service exists in the registry
   * @param {string} name - Name of the service to check
   * @returns {boolean} Whether the service exists
   */
  has(name) {
    return this.services.has(name);
  }

  /**
   * Remove a service from the registry
   * @param {string} name - Name of the service to remove
   * @returns {boolean} Whether the service was removed
   */
  remove(name) {
    const result = this.services.delete(name);
    if (result) {
      this.logger.debug(`Service "${name}" removed from registry`);
    }
    return result;
  }

  /**
   * Get all registered service names
   * @returns {Array<string>} Array of service names
   */
  getServiceNames() {
    return Array.from(this.services.keys());
  }
}

// Create a singleton instance
const registry = new ServiceRegistry();

module.exports = registry;