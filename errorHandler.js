/**
 * ErrorHandler - Centralized error handling utility
 */
// Import ERROR_TYPES from loggerFramework to avoid duplicate definitions
import { ERROR_TYPES, Logger } from './loggerFramework.js';

class ErrorHandler {
  /**
   * Create a new error handler instance
   * @param {string} [context] - Optional context for the error handler
   */
  constructor(context) {
    this.context = context || 'ErrorHandler';
    this.showDetailedErrors = process.env.ENABLE_DETAILED_ERRORS === 'true';
    this.logger = new Logger(this.context);
  }

  /**
   * Create a standardized error response
   * @param {Error|Object} error - Error object
   * @param {boolean} [isOperational=true] - Whether this is an operational error
   * @returns {Object} Standardized error response object
   */
  createErrorResponse(error, isOperational = true) {
    // If it's not an Error instance, wrap it
    const err = error instanceof Error ? error : new Error(error.message || 'Unknown error');
    
    // Log the error with appropriate level
    if (isOperational) {
      this.logger.warn('Operational error occurred', err);
    } else {
      this.logger.error('Programming or system error occurred', err);
    }
    
    return {
      success: false,
      error: err.message || 'Internal server error',
      details: this.showDetailedErrors ? {
        stack: err.stack,
        code: err.code,
        name: err.name,
        type: err.type || ERROR_TYPES.INTERNAL
      } : undefined
    };
  }

  /**
   * Create a standard validation error response
   * @param {string|Array} fields - Field(s) that failed validation
   * @param {string} [message] - Error message
   * @returns {Object} Validation error response
   */
  createValidationError(fields, message) {
    const fieldsArray = Array.isArray(fields) ? fields : [fields];
    const errorMessage = message || `Validation failed for fields: ${fieldsArray.join(', ')}`;
    
    const validationError = new Error(errorMessage);
    validationError.name = ERROR_TYPES.VALIDATION;
    validationError.type = ERROR_TYPES.VALIDATION;
    validationError.fields = fieldsArray;
    
    this.logger.warn(`Validation error: ${errorMessage}`, { fields: fieldsArray });
    
    return this.createErrorResponse(validationError);
  }

  /**
   * Create a database error response
   * @param {Error} error - Database error
   * @param {string} [operation] - Database operation that failed
   * @returns {Object} Database error response
   */
  createDatabaseError(error, operation) {
    const dbError = new Error(error.message || 'Database operation failed');
    dbError.name = ERROR_TYPES.DATABASE;
    dbError.type = ERROR_TYPES.DATABASE;
    dbError.cause = error;
    dbError.operation = operation;
    
    this.logger.error(`Database error during ${operation || 'unknown operation'}`, error);
    
    return this.createErrorResponse(dbError);
  }

  /**
   * Create a network/API error response
   * @param {Error} error - Network/API error
   * @param {string} [service] - Service that failed
   * @returns {Object} API error response
   */
  createApiError(error, service) {
    const apiError = new Error(error.message || `API call to ${service || 'external service'} failed`);
    apiError.name = ERROR_TYPES.API;
    apiError.type = ERROR_TYPES.API;
    apiError.cause = error;
    apiError.service = service;
    
    this.logger.error(`API error with ${service || 'external service'}`, error);
    
    return this.createErrorResponse(apiError);
  }

  /**
   * Handle an error by logging it and returning a standard response
   * @param {Error} error - The error to handle
   * @param {string} [context] - Optional context for the error
   * @returns {Object} Standardized error response
   */
  handleError(error, context) {
    if (context) {
      this.logger.error(`Error in ${context}:`, error);
    } else {
      this.logger.error('Error occurred:', error);
    }
    
    // Determine error type
    if (error.name === ERROR_TYPES.VALIDATION) {
      return this.createErrorResponse(error, true);
    } else if (error.name === ERROR_TYPES.DATABASE || error.code?.includes('DB_')) {
      return this.createDatabaseError(error);
    } else if (error.name === ERROR_TYPES.API || error.code?.includes('API_')) {
      return this.createApiError(error);
    }
    
    return this.createErrorResponse(error, false);
  }
}

// Helper function to create an error handler instance
function createErrorHandler(context) {
  return new ErrorHandler(context);
}

export {
  ErrorHandler,
  createErrorHandler,
  ERROR_TYPES
};
