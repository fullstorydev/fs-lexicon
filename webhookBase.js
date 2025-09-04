import { format } from 'date-fns';
import { Logger } from './loggerFramework.js';
import { ErrorHandler } from './errorHandler.js';
import serviceRegistry from './serviceRegistry.js';

/**
 * Base class for all webhook handlers
 */
class WebhookBase {
  /**
   * Create a new webhook handler
   * @param {string} name - Name of the webhook handler
   * @param {Object} [options] - Additional options
   */
  constructor(name, options = {}) {
    this.name = name;
    this.logger = new Logger(`Webhook:${name}`);
    this.errorHandler = new ErrorHandler(`Webhook:${name}`);
    this.options = options;
    
    // Get initialization service from registry or options for testing with graceful fallback
    try {
      this.initialization = options.initialization || (serviceRegistry.has('initialization') ? serviceRegistry.get('initialization') : null);
    } catch (error) {
      this.logger.debug(`Initialization service not available for webhook: ${error.message}`);
      this.initialization = null;
    }
    
    if (this.initialization) {
      try {
        // Register webhook handler for initialization tracking
        this.initialization.registerComponent(`Webhook:${name}`);
      } catch (error) {
        this.logger.warn(`Could not register webhook component: ${error.message}`);
      }
    }
  }

  /**
   * Initialize the webhook handler
   * @param {Object} router - Express router to register routes
   * @returns {boolean} Whether initialization succeeded
   */
  initialize(router) {
    try {
      // Register routes on the router
      this._configureRoutes(router);
      
      // Mark webhook as initialized in the tracking system if available
      if (this.initialization) {
        this.initialization.markInitialized(`Webhook:${this.name}`, {
          routes: this.initialization.extractRoutes(router)
        });
      } else {
        this.logger.info(`Webhook ${this.name} initialized without tracking`);
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to initialize webhook ${this.name}`, error);
      
      if (this.initialization) {
        this.initialization.markFailed(`Webhook:${this.name}`, error);
      }
      
      return false;
    }
  }

  /**
   * Configure routes for this webhook handler - to be implemented by subclasses
   * @param {Object} router - Express router
   * @protected
   */
  _configureRoutes(router) {
    // Default implementation - should be overridden by subclasses
    this.logger.warn(`_configureRoutes not implemented for ${this.name}`);
  }

  /**
   * Extract common webhook data with consistent undefined handling
   * @param {Object} body - Webhook payload
   * @returns {Object} Extracted data
   */
  extractCommonData(body) {
    this.logger.debug('Extracting common data from webhook payload');
    
    try {
      const date = new Date(body.timestamp ?? Date.now());
      const formattedTime = format(date, "MM/dd/yy h:mm aaa");
      const isoTime = date.toISOString();
      
      return {
        event_name: body.name ?? "Undefined",
        email: body.user?.email ?? "Undefined",
        display_name: body.user?.display_name ?? "Undefined",
        uid: body.user?.id ?? "Undefined",
        timestamp: formattedTime,
        time: isoTime, // ISO format for database operations
        api_version: body.api_version ?? "Undefined",
        signal_version: body.signal_version ?? "Undefined",
        session_id: body.properties?.session_id ?? "Undefined",
        properties: body.properties ?? {}
      };
    } catch (error) {
      this.logger.error('Error extracting webhook data', error);
      // Return a basic object with undefined values instead of throwing
      const now = new Date();
      return {
        event_name: "Error",
        email: "Undefined",
        display_name: "Undefined",
        uid: "Undefined",
        timestamp: format(now, "MM/dd/yy h:mm aaa"),
        time: now.toISOString(),
        api_version: "Undefined",
        signal_version: "Undefined",
        session_id: "Undefined",
        properties: {}
      };
    }
  }

  /**
   * Validate required fields with consistent error handling
   * @param {Object} data - Data object to validate
   * @param {Array<string>} requiredFields - List of required field names
   * @returns {Object|null} Error object or null if valid
   */
  validateRequiredFields(data, requiredFields) {
    this.logger.debug('Validating required fields', { fields: requiredFields });
    
    const missingFields = requiredFields.filter(field => {
      return data[field] === undefined || data[field] === "Undefined";
    });
    
    if (missingFields.length > 0) {
      const error = new Error(`Missing required data fields: ${missingFields.join(', ')}`);
      this.logger.warn('Validation failed - missing required fields', { missingFields });
      return error;
    }
    
    return null;
  }

  /**
   * Create standard success response
   * @param {Object} data - Response data
   * @param {string} [message] - Optional success message
   * @returns {Object} Standardized success response
   */
  createSuccessResponse(data, message = 'Operation completed successfully') {
    return {
      success: true,
      message,
      data
    };
  }

  /**
   * Log the start of webhook processing
   * @param {string} webhookType - Type of webhook
   * @param {Object} req - Express request
   */
  logWebhookStart(webhookType, req) {
    this.logger.info(`Starting ${webhookType} webhook processing`, {
      method: req.method,
      path: req.path,
      contentType: req.get('content-type'),
      contentLength: req.get('content-length')
    });
    
    // Only log payload at debug level (avoid sensitive data at info level)
    this.logger.debug(`${webhookType} webhook payload`, req.body);
  }

  /**
   * Log the completion of webhook processing
   * @param {string} webhookType - Type of webhook
   * @param {Object} data - Processed data
   */
  logWebhookCompletion(webhookType, data) {
    this.logger.info(`${webhookType} webhook completed successfully`, data);
  }

  /**
   * Fetch Fullstory session data consistently
   * @param {Object} Fullstory - Fullstory client
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @returns {Object} Session data including replay URL and summary
   * @protected
   */
  async getFullstorySessionData(Fullstory, userId, sessionId) {
    this.logger.debug('Fetching Fullstory session data', { userId, sessionId });
    
    const result = {
      replayURL: "No replay URL available",
      sessionSummary: "No session summary available"
    };

    // Get replay URL
    try {
      const link = Fullstory.getSessionLink(userId, sessionId);
      if (link) {
        result.replayURL = link;
        this.logger.debug('Retrieved Fullstory replay URL', { url: link });
      }
    } catch (urlError) {
      this.logger.error('Error getting session link', urlError);
      // Use default value
    }
    
    // Get session summary with safety check
    try {
      const summary = await Fullstory.getSessionSummary(userId, sessionId);
      result.sessionSummary = summary ? JSON.stringify(summary.analysis) : "No session summary available";
      this.logger.debug('Retrieved Fullstory session summary', { 
        summaryAvailable: !!summary,
        summaryLength: summary ? JSON.stringify(summary.analysis).length : 0
      });
    } catch (summaryError) {
      this.logger.error('Error fetching session summary', summaryError);
      // Use default value
    }
    
    return result;
  }

  /**
   * Format a database operation for error messages with proper prepositions
   * @param {string} operation - SQL operation type (insert, select, update, delete)
   * @param {string} table - Table name
   * @returns {string} Formatted operation string
   * @protected
   */
  async formatDatabaseOperation(operation, table) {
    // Delegate to konbini.js warehouse module for consistent formatting
    const konbini = (await import('./konbini.js')).default;
    return konbini.warehouse.formatOperation(operation, table);
  }
}

export default WebhookBase;
