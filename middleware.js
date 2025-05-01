/**
 * Middleware - Express middleware functions for request processing and validation
 */
const crypto = require('crypto');
const config = require('./config');
const { Logger } = require('./loggerFramework');
const { ErrorHandler } = require('./errorHandler');
const serviceRegistry = require('./serviceRegistry');

/**
 * Middleware class with various request handlers
 */
class MiddlewareService {
  constructor() {
    // Initialize logger
    this.logger = new Logger('Middleware');
    
    // Initialize error handler
    this.errorHandler = new ErrorHandler('Middleware');
    
    // Get the Fullstory API key
    this.org_api_key = config.get('fs_org_api_key');
    
    // Check if key is available
    if (!this.org_api_key) {
      this.logger.warn('Fullstory API key not configured. Webhook verification will fail.');
    }
  }

  /**
   * Verify Fullstory webhook signature
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  verifyWebHook(req, res, next) {
    try {
      // Check if signature header exists
      const signature = req.headers["fullstory-signature"];
      if (!signature) {
        this.logger.warn('Missing Fullstory signature in request');
        return res.status(401).json({
          success: false,
          error: 'Missing Fullstory signature'
        });
      }

      // Check if API key is configured
      if (!this.org_api_key) {
        this.logger.error('Cannot verify webhook: Fullstory API key not configured');
        return res.status(500).json({
          success: false,
          error: 'Internal configuration error'
        });
      }

      // Capture payload
      const payload = JSON.stringify(req.body);

      // Parse the Fullstory-Signature header
      const signatureParts = signature.split(",");
      const signatureMap = {};
      signatureParts.forEach(part => {
        const [key, value] = part.split(":");
        signatureMap[key] = value;
      });

      // Check required signature components
      if (!signatureMap.v || !signatureMap.o || !signatureMap.t) {
        this.logger.warn('Invalid signature format in webhook request');
        return res.status(401).json({
          success: false,
          error: 'Invalid signature format'
        });
      }

      // Construct the canonical event payload
      const canonicalPayload = `${payload}:${signatureMap.o}:${signatureMap.t}`;

      // Compute the HMAC SHA256 hash
      const hmac = crypto.createHmac("sha256", this.org_api_key);
      hmac.update(canonicalPayload);

      // Digest the hmac value
      const computedSignature = hmac.digest("base64");

      // Check if signatures match
      if (computedSignature !== signatureMap.v) {
        this.logger.warn('Invalid webhook signature - signatures do not match');
        return res.status(401).json({
          success: false,
          error: 'Invalid webhook signature'
        });
      }

      this.logger.debug('Webhook signature verification successful');
      // Valid signature, continue to next middleware
      next();
    } catch (error) {
      this.logger.error('Error verifying webhook signature:', error);
      return res.status(500).json(this.errorHandler.createErrorResponse(error));
    }
  }

  /**
   * Validate required JSON fields in request body
   * @param {Array<string>} requiredFields - Array of required field names
   * @returns {Function} Express middleware function
   */
  validateJsonFields(requiredFields) {
    // Correctly bind to this instance when returning the function
    return (req, res, next) => {
      try {
        // Check that body exists
        if (!req.body) {
          this.logger.warn('Missing request body');
          return res.status(400).json({
            success: false,
            error: 'Missing request body'
          });
        }

        // Check each required field
        const missingFields = [];
        for (const field of requiredFields) {
          if (req.body[field] === undefined) {
            missingFields.push(field);
          }
        }

        // If any required fields are missing, return error
        if (missingFields.length > 0) {
          this.logger.warn(`Missing required fields: ${missingFields.join(', ')}`);
          return res.status(400).json({
            success: false,
            error: `Missing required fields: ${missingFields.join(', ')}`
          });
        }

        // All required fields present, continue
        next();
      } catch (error) {
        this.logger.error('Error validating JSON fields:', error);
        return res.status(500).json(this.errorHandler.createErrorResponse(error));
      }
    };
  }

  /**
   * Log incoming requests
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  logRequest(req, res, next) {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.originalUrl || req.url;
    const ip = req.ip || req.connection.remoteAddress;
    
    this.logger.info(`[${timestamp}] ${method} ${url} - IP: ${ip}`);

    // Record start time
    req.requestTime = Date.now();

    // Override end to calculate response time
    const originalEnd = res.end;
    res.end = function(...args) {
      const responseTime = Date.now() - req.requestTime;
      this.logger.info(`[${timestamp}] ${method} ${url} - Status: ${res.statusCode} - ${responseTime}ms`);
      originalEnd.apply(res, args);
    }.bind(this);

    next();
  }
}

// Create singleton instance
const middleware = new MiddlewareService();

// Register with initialization tracker using the service registry with graceful fallback
try {
  // Check if initialization service is available in registry
  if (serviceRegistry.has('initialization')) {
    const initialization = serviceRegistry.get('initialization');
    initialization.markInitialized('Middleware', {
      webhookVerificationEnabled: !!middleware.org_api_key
    });
  } else {
    const logger = new Logger('Middleware');
    logger.info('Middleware initialized without tracking');
  }
} catch (error) {
  const logger = new Logger('Middleware');
  logger.error('Failed to register middleware with initialization tracker', error);
}

// Register middleware in the service registry
try {
  serviceRegistry.register('middleware', middleware);
} catch (error) {
  const logger = new Logger('Middleware');
  logger.warn('Failed to register middleware in service registry', error);
}

// Export middleware methods with proper binding to the instance
module.exports = {
  verifyWebHook: (req, res, next) => middleware.verifyWebHook(req, res, next),
  validateJsonFields: (requiredFields) => middleware.validateJsonFields(requiredFields),
  logRequest: (req, res, next) => middleware.logRequest(req, res, next)
};