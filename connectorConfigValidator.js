const { Logger } = require('./loggerFramework');

/**
 * Centralized configuration validation system for connectors
 */
class ConnectorConfigValidator {
  /**
   * Create a new connector validator
   * @param {string} connectorName - Name of the connector being validated
   * @param {object} configObj - The config object to use for validation
   */
  constructor(connectorName, configObj) {
    this.connectorName = connectorName;
    this.isConfigured = true;
    this.errors = [];
    this.config = configObj; // Store the config object
    this.logger = new Logger(`${connectorName}Config`);
  }

  /**
   * Validate a required configuration value
   * @param {string} key - Configuration key to check
   * @param {any} defaultValue - Optional default value if not required
   * @param {boolean} isRequired - Whether this config is required
   * @returns {any} The configuration value or default
   */
  validateConfig(key, defaultValue = undefined, isRequired = true) {
    try {
      // Use the config object's get method if available, otherwise try direct property access
      let value;
      if (this.config && typeof this.config.get === 'function') {
        value = this.config.get(key, defaultValue);
      } else {
        value = (this.config && key in this.config) ? this.config[key] : defaultValue;
      }

      // Check if value is missing and required
      if ((value === undefined || value === null) && isRequired && defaultValue === undefined) {
        this.errors.push(`Missing required ${this.connectorName} configuration: ${key}`);
        this.isConfigured = false;
        return defaultValue;
      }

      return value;
    } catch (error) {
      this.errors.push(`Error retrieving ${key}: ${error.message}`);
      if (isRequired) {
        this.isConfigured = false;
      }
      return defaultValue;
    }
  }

  /**
   * Validate a boolean configuration value
   * @param {string} key - Configuration key to check
   * @param {boolean} defaultValue - Optional default value
   * @param {boolean} isRequired - Whether this config is required
   * @returns {boolean} The validated boolean value
   */
  validateBoolean(key, defaultValue = false, isRequired = true) {
    try {
      // Use the config object's getBoolean method if available
      if (this.config && typeof this.config.getBoolean === 'function') {
        return this.config.getBoolean(key, defaultValue);
      }
      
      // Otherwise use regular validate and convert
      const value = this.validateConfig(key, defaultValue, isRequired);
      
      // Convert to boolean
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
      }
      return Boolean(value);
    } catch (error) {
      this.errors.push(`Error validating boolean ${key}: ${error.message}`);
      if (isRequired) {
        this.isConfigured = false;
      }
      return defaultValue;
    }
  }

  /**
   * Validate a numeric configuration value
   * @param {string} key - Configuration key to check
   * @param {number} defaultValue - Optional default value
   * @param {boolean} isRequired - Whether this config is required
   * @returns {number} The validated numeric value
   */
  validateNumber(key, defaultValue = 0, isRequired = true) {
    try {
      // Use the config object's getNumber method if available
      if (this.config && typeof this.config.getNumber === 'function') {
        return this.config.getNumber(key, defaultValue);
      }
      
      // Otherwise use regular validate and convert
      const value = this.validateConfig(key, defaultValue, isRequired);
      
      // Convert to number
      if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
      }
      return typeof value === 'number' ? value : defaultValue;
    } catch (error) {
      this.errors.push(`Error validating number ${key}: ${error.message}`);
      if (isRequired) {
        this.isConfigured = false;
      }
      return defaultValue;
    }
  }

  /**
   * Check if a connector is properly configured
   * @returns {boolean} true if connector is correctly configured
   */
  checkIsConfigured() {
    if (!this.isConfigured && this.errors.length > 0) {
      this.logger.warn(`${this.connectorName} client not properly configured. Some functions may not work.`);
      this.errors.forEach(error => this.logger.warn(`- ${error}`));
    }
    return this.isConfigured;
  }
}

module.exports = ConnectorConfigValidator;
