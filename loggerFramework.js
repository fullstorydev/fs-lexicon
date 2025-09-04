/**
 * Logger Framework - Advanced logging utility with log level support
 */

// Log levels with numeric values for comparison
const LOG_LEVELS = {
  NONE: 0,    // No logging
  ERROR: 1,   // Only errors
  WARN: 2,    // Errors and warnings
  INFO: 3,    // Normal operational messages
  DEBUG: 4,    // Detailed debug information
  TRACE: 5    // Very detailed tracing information
};

// Define error types to be shared across the application
const ERROR_TYPES = {
  VALIDATION: 'ValidationError',
  DATABASE: 'DatabaseError',
  NETWORK: 'NetworkError',
  API: 'ApiError',
  CONFIG: 'ConfigurationError',
  AUTH: 'AuthenticationError',
  PERMISSION: 'PermissionError',
  INTERNAL: 'InternalError'
};

class Logger {
  /**
   * Create a new logger instance
   * @param {string} context - The context (module/class name) for this logger
   */
  constructor(context) {
    this.context = context || 'global';
    this.logLevel = this._determineLogLevel();
  }

  /**
   * Determine log level from environment variable
   * @private
   */
  _determineLogLevel() {
    // Use environment variable directly instead of config.get()
    const configLevel = (process.env.LOG_LEVEL || 'INFO').toUpperCase();
    return LOG_LEVELS[configLevel] !== undefined ? 
      LOG_LEVELS[configLevel] : 
      LOG_LEVELS.INFO;
  }

  /**
   * Refresh the log level (useful after configuration changes)
   * @param {object} config - Optional config object to use
   */
  refreshLogLevel(config) {
    // If config is passed in, use it
    if (config && typeof config.get === 'function') {
      const configLevel = config.get('log_level', 'INFO').toUpperCase();
      this.logLevel = LOG_LEVELS[configLevel] !== undefined ? 
        LOG_LEVELS[configLevel] : 
        LOG_LEVELS.INFO;
    } else {
      // Otherwise fall back to environment variables
      this.logLevel = this._determineLogLevel();
    }
    return this.logLevel;
  }

  /**
   * Categorize an error based on available information
   * @param {Error} error - The error to categorize
   * @returns {string} The error type
   * @private
   */
  _categorizeError(error) {
    if (!error) return 'Unknown';
    
    // Use the explicit error type/name if available
    if (error.type && typeof error.type === 'string') {
      return error.type;
    }
    
    if (error.name && typeof error.name === 'string') {
      // Check if the error name matches one of our known error types
      for (const key in ERROR_TYPES) {
        if (ERROR_TYPES[key] === error.name) {
          return ERROR_TYPES[key];
        }
      }
      
      return error.name; // Use the error name if it doesn't match a type
    }
    
    // Check if the error code gives a hint about its type
    if (error.code && typeof error.code === 'string') {
      if (error.code.includes('DB_')) return ERROR_TYPES.DATABASE;
      if (error.code.includes('API_')) return ERROR_TYPES.API;
      if (error.code.includes('AUTH_')) return ERROR_TYPES.AUTH;
      if (error.code.includes('PERM_')) return ERROR_TYPES.PERMISSION;
      if (error.code.includes('CONFIG_')) return ERROR_TYPES.CONFIG;
      if (error.code.includes('NET_')) return ERROR_TYPES.NETWORK;
    }
    
    // Check if the message gives a hint about its type
    const message = error.message || '';
    if (message.includes('database') || 
        message.includes('query') || 
        message.includes('SQL')) {
      return ERROR_TYPES.DATABASE;
    }
    
    if (message.includes('permission') || 
        message.includes('access denied') || 
        message.includes('unauthorized')) {
      return ERROR_TYPES.PERMISSION;
    }
    
    if (message.includes('authentication') || 
        message.includes('login') || 
        message.includes('credentials') || 
        message.includes('password')) {
      return ERROR_TYPES.AUTH;
    }
    
    if (message.includes('network') || 
        message.includes('connection') || 
        message.includes('timeout')) {
      return ERROR_TYPES.NETWORK;
    }
    
    if (message.includes('configuration') || 
        message.includes('config') || 
        message.includes('setting')) {
      return ERROR_TYPES.CONFIG;
    }
    
    // If we can't categorize, return a generic error type
    return ERROR_TYPES.INTERNAL;
  }

  /**
   * Format a log message with timestamp, level and context
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} [data] - Optional data to include
   * @returns {string} Formatted log message
   * @private
   */
  _formatLogMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const formattedMsg = `[${timestamp}] [${level}] [${this.context}] ${message}`;
    
    if (data) {
      try {
        // Handle circular references and limit data size
        const safeData = this._prepareSafeData(data);
        return `${formattedMsg} ${JSON.stringify(safeData)}`;
      } catch (error) {
        return `${formattedMsg} [Error serializing data: ${error.message}]`;
      }
    }
    
    return formattedMsg;
  }

  /**
   * Format a structured log message with safe data handling
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} [data] - Optional data to include
   * @param {boolean} [sanitize=false] - Whether to sanitize sensitive fields
   * @returns {string} Formatted log message
   * @private
   */
  _formatLogMessage(level, message, data, sanitize = false) {
    const timestamp = new Date().toISOString();
    const formattedMsg = `[${timestamp}] [${level}] [${this.context}] ${message}`;
    
    if (data) {
      try {
        // Potentially sanitize sensitive data
        const safeData = sanitize ? this._sanitizeData(data) : this._prepareSafeData(data);
        return `${formattedMsg} ${JSON.stringify(safeData)}`;
      } catch (error) {
        return `${formattedMsg} [Error serializing data: ${error.message}]`;
      }
    }
    
    return formattedMsg;
  }

  /**
   * Sanitize potentially sensitive fields in log data
   * @param {Object} data - Data to sanitize
   * @returns {Object} Sanitized data
   * @private
   */
  _sanitizeData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    // If it's an Error, use special handling
    if (data instanceof Error) {
      return {
        message: data.message,
        name: data.name,
        stack: data.stack,
        code: data.code,
        type: data.type || this._categorizeError(data) // Add error categorization
      };
    }
    
    // For arrays and objects, process recursively
    const result = Array.isArray(data) ? [] : {};
    
    // List of sensitive field patterns
    const sensitivePatterns = [
      /password/i, /secret/i, /key/i, /token/i, /credential/i, /passphrase/i,
      /apiKey/i, /api_key/i, /auth/i, /sheetId/i, /privateKey/i, /private_key/i
    ];
    
    Object.keys(data).forEach(key => {
      const value = data[key];
      
      // Check if field name matches sensitive patterns
      const isSensitive = sensitivePatterns.some(pattern => pattern.test(key));
      
      if (value === null || value === undefined) {
        result[key] = value;
      } else if (isSensitive && typeof value === 'string' && value.length > 0) {
        // Mask sensitive string values
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        // Recursively sanitize nested objects
        result[key] = this._sanitizeData(value);
      } else {
        result[key] = value;
      }
    });
    
    return result;
  }

  /**
   * Prepare data for safe serialization
   * @param {Object} data - Data to prepare
   * @param {number} [depth=2] - Maximum recursion depth
   * @param {number} [maxLength=1000] - Maximum string length for values
   * @returns {Object} Safe data for serialization
   * @private
   */
  _prepareSafeData(data, depth = 2, maxLength = 1000) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // Handle different types of data
    if (data instanceof Error) {
      return {
        message: data.message,
        name: data.name,
        stack: data.stack,
        code: data.code,
        type: data.type || this._categorizeError(data) // Add error categorization
      };
    }

    // For arrays and objects, process recursively with depth limit
    if (depth <= 0) {
      return '[Object]'; // Limit recursion
    }

    const result = Array.isArray(data) ? [] : {};
    
    Object.keys(data).forEach(key => {
      const value = data[key];
      
      if (value === null || value === undefined) {
        result[key] = value;
      } else if (typeof value === 'object') {
        result[key] = this._prepareSafeData(value, depth - 1, maxLength);
      } else if (typeof value === 'string' && value.length > maxLength) {
        result[key] = value.substring(0, maxLength) + '...';
      } else {
        result[key] = value;
      }
    });
    
    return result;
  }

  /**
   * Log an error message
   * @param {string} message - Error message
   * @param {Error|Object} [error] - Error object or data
   */
  error(message, error) {
    if (this.logLevel >= LOG_LEVELS.ERROR) {
      // Add error categorization in the message if applicable
      let enhancedMessage = message;
      if (error instanceof Error) {
        const errorType = this._categorizeError(error);
        if (errorType) {
          enhancedMessage = `[${errorType}] ${message}`;
        }
      }
      
      console.error(this._formatLogMessage('ERROR', enhancedMessage, error));
    }
  }

  /**
   * Log a warning message
   * @param {string} message - Warning message
   * @param {Object} [data] - Optional data
   */
  warn(message, data) {
    if (this.logLevel >= LOG_LEVELS.WARN) {
      console.warn(this._formatLogMessage('WARN', message, data));
    }
  }

  /**
   * Log an info message
   * @param {string} message - Info message
   * @param {Object} [data] - Optional data
   */
  info(message, data) {
    if (this.logLevel >= LOG_LEVELS.INFO) {
      console.log(this._formatLogMessage('INFO', message, data));
    }
  }

  /**
   * Log a debug message
   * @param {string} message - Debug message
   * @param {Object} [data] - Optional data
   */
  debug(message, data) {
    if (this.logLevel >= LOG_LEVELS.DEBUG) {
      console.log(this._formatLogMessage('DEBUG', message, data));
    }
  }

  /**
   * Log a trace message
   * @param {string} message - Trace message
   * @param {Object} [data] - Optional data
   */
  trace(message, data) {
    if (this.logLevel >= LOG_LEVELS.TRACE) {
      console.log(this._formatLogMessage('TRACE', message, data));
    }
  }

  /**
   * Log an info message with sanitized sensitive data
   * @param {string} message - Info message
   * @param {Object} [data] - Optional data
   */
  infoSensitive(message, data) {
    if (this.logLevel >= LOG_LEVELS.INFO) {
      console.log(this._formatLogMessage('INFO', message, data, true));
    }
  }
}

// Helper function to create a logger instance
function createLogger(context) {
  return new Logger(context);
}

export {
  Logger,
  LOG_LEVELS,
  ERROR_TYPES,
  createLogger
};
