/**
 * Rate Limiter - Centralized rate limiting service for Lexicon
 * Provides configurable rate limiting middleware following Lexicon patterns
 */
import { Logger } from './loggerFramework.js';
import { ErrorHandler } from './errorHandler.js';
import config from './config.js';
import serviceRegistry from './serviceRegistry.js';

/**
 * Rate limiting service with configurable limits and storage backends
 */
class RateLimiterService {
  constructor(configInstance = config) {
    this.logger = new Logger('RateLimiter');
    this.errorHandler = new ErrorHandler('RateLimiter');
    
    // Initialize configuration using Lexicon's configuration system
    this.config = {
      // General rate limiting
      enabled: configInstance.getBoolean('rate_limit_enabled', true),
      windowMs: configInstance.getNumber('rate_limit_window_ms', 60000), // 1 minute default
      maxRequests: configInstance.getNumber('rate_limit_max_requests', 100), // 100 requests per window
      
      // Different limits for different endpoint types
      apiWindowMs: configInstance.getNumber('rate_limit_api_window_ms', 60000),
      apiMaxRequests: configInstance.getNumber('rate_limit_api_max_requests', 50),
      
      webhookWindowMs: configInstance.getNumber('rate_limit_webhook_window_ms', 60000),
      webhookMaxRequests: configInstance.getNumber('rate_limit_webhook_max_requests', 200),
      
      mcpWindowMs: configInstance.getNumber('rate_limit_mcp_window_ms', 60000),
      mcpMaxRequests: configInstance.getNumber('rate_limit_mcp_max_requests', 30),
      
      // Tool-specific limits (for MCP mode)
      toolWindowMs: configInstance.getNumber('rate_limit_tool_window_ms', 60000),
      toolMaxRequests: configInstance.getNumber('rate_limit_tool_max_requests', 20),
      
      // Storage configuration
      useRedis: configInstance.getBoolean('rate_limit_use_redis', false),
      redisUrl: configInstance.get('rate_limit_redis_url', 'redis://localhost:6379'),
      
      // Response configuration
      skipSuccessfulRequests: configInstance.getBoolean('rate_limit_skip_successful', false),
      skipFailedRequests: configInstance.getBoolean('rate_limit_skip_failed', false),
      includeHeaders: configInstance.getBoolean('rate_limit_include_headers', true),
      
      // IP-based limiting
      trustProxy: configInstance.getBoolean('rate_limit_trust_proxy', false),
      
      // Custom message
      message: configInstance.get('rate_limit_message', 'Too many requests, please try again later.')
    };
    
    // Initialize storage backend
    this.storage = new Map(); // Default in-memory storage
    this.initialized = false;
    
    this.logger.info('Rate limiter service created', {
      enabled: this.config.enabled,
      windowMs: this.config.windowMs,
      maxRequests: this.config.maxRequests,
      useRedis: this.config.useRedis
    });
  }
  
  /**
   * Initialize the rate limiter service
   */
  async initialize() {
    try {
      if (this.config.useRedis) {
        await this._initializeRedis();
      }
      
      this.initialized = true;
      this.logger.info('Rate limiter service initialized', {
        storageType: this.config.useRedis ? 'redis' : 'memory',
        enabled: this.config.enabled
      });
      
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize rate limiter service:', error);
      this.initialized = false;
      return false;
    }
  }
  
  /**
   * Initialize Redis storage backend
   * @private
   */
  async _initializeRedis() {
    try {
      // Dynamically import Redis if needed
      const Redis = await import('redis');
      this.redisClient = Redis.createClient({
        url: this.config.redisUrl
      });
      
      this.redisClient.on('error', (err) => {
        this.logger.error('Redis client error:', err);
      });
      
      await this.redisClient.connect();
      this.logger.info('Redis storage backend connected', {
        url: this.config.redisUrl.replace(/\/\/.*@/, '//***@') // Hide credentials in logs
      });
      
    } catch (error) {
      this.logger.warn('Failed to initialize Redis, falling back to memory storage:', error);
      this.config.useRedis = false;
    }
  }
  

  
  /**
   * Get client identifier from request
   * @private
   */
  _getClientId(req) {
    // Use IP address as client identifier
    if (this.config.trustProxy) {
      return req.ip || req.connection.remoteAddress || 'unknown';
    } else {
      return req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
    }
  }
  
  /**
   * Get rate limit data from storage
   * @private
   */
  async _getLimit(key) {
    try {
      if (this.config.useRedis && this.redisClient) {
        const data = await this.redisClient.get(key);
        return data ? JSON.parse(data) : null;
      } else {
        return this.storage.get(key) || null;
      }
    } catch (error) {
      this.logger.error('Error getting rate limit data:', error);
      return null;
    }
  }
  
  /**
   * Set rate limit data in storage
   * @private
   */
  async _setLimit(key, data, ttlMs) {
    try {
      if (this.config.useRedis && this.redisClient) {
        await this.redisClient.setEx(key, Math.ceil(ttlMs / 1000), JSON.stringify(data));
      } else {
        this.storage.set(key, data);
        // Clean up memory storage after TTL
        setTimeout(() => {
          this.storage.delete(key);
        }, ttlMs);
      }
    } catch (error) {
      this.logger.error('Error setting rate limit data:', error);
    }
  }
  
  /**
   * Create rate limiting middleware
   * @param {Object} options - Rate limiting options
   * @returns {Function} Express middleware function
   */
  createMiddleware(options = {}) {
    // Merge options with defaults
    const opts = {
      windowMs: options.windowMs || this.config.windowMs,
      maxRequests: options.maxRequests || this.config.maxRequests,
      keyGenerator: options.keyGenerator || ((req) => this._getClientId(req)),
      skipSuccessfulRequests: options.skipSuccessfulRequests ?? this.config.skipSuccessfulRequests,
      skipFailedRequests: options.skipFailedRequests ?? this.config.skipFailedRequests,
      message: options.message || this.config.message,
      statusCode: options.statusCode || 429,
      headers: options.headers ?? this.config.includeHeaders,
      onLimitReached: options.onLimitReached || null,
      skip: options.skip || null,
      category: options.category || 'general'
    };
    
    return async (req, res, next) => {
      try {
        // Skip if rate limiting is disabled
        if (!this.config.enabled || !this.initialized) {
          return next();
        }
        
        // Check skip function
        if (opts.skip && opts.skip(req, res)) {
          return next();
        }
        
        const key = opts.keyGenerator(req);
        const limitKey = `rate_limit:${opts.category}:${key}`;
        
        // Get current limit data
        const now = Date.now();
        let limitData = await this._getLimit(limitKey);
        
        // Initialize or reset if window has expired
        if (!limitData || now - limitData.resetTime >= opts.windowMs) {
          limitData = {
            count: 0,
            resetTime: now + opts.windowMs
          };
        }
        
        // Increment counter
        limitData.count++;
        
        // Calculate remaining and reset time
        const remaining = Math.max(0, opts.maxRequests - limitData.count);
        const resetTimeSeconds = Math.ceil(limitData.resetTime / 1000);
        
        // Add headers if enabled
        if (opts.headers) {
          res.set({
            'X-RateLimit-Limit': opts.maxRequests,
            'X-RateLimit-Remaining': remaining,
            'X-RateLimit-Reset': resetTimeSeconds,
            'X-RateLimit-Window': opts.windowMs
          });
        }
        
        // Check if limit exceeded
        if (limitData.count > opts.maxRequests) {
          // Save the updated count
          await this._setLimit(limitKey, limitData, opts.windowMs);
          
          // Log rate limit exceeded
          this.logger.warn('Rate limit exceeded', {
            clientId: key,
            category: opts.category,
            count: limitData.count,
            limit: opts.maxRequests,
            path: req.path,
            method: req.method
          });
          
          // Call onLimitReached callback if provided
          if (opts.onLimitReached) {
            opts.onLimitReached(req, res);
          }
          
          // Add retry-after header
          if (opts.headers) {
            res.set('Retry-After', Math.ceil((limitData.resetTime - now) / 1000));
          }
          
          return res.status(opts.statusCode).json({
            success: false,
            error: 'Rate limit exceeded',
            message: opts.message,
            rateLimitInfo: opts.headers ? {
              limit: opts.maxRequests,
              remaining: 0,
              resetTime: resetTimeSeconds,
              retryAfter: Math.ceil((limitData.resetTime - now) / 1000)
            } : undefined
          });
        }
        
        // Save updated count
        await this._setLimit(limitKey, limitData, opts.windowMs);
        
        // Log request (debug level)
        this.logger.debug('Rate limit check passed', {
          clientId: key,
          category: opts.category,
          count: limitData.count,
          limit: opts.maxRequests,
          remaining: remaining
        });
        
        // Add method to skip rate limit accounting for successful/failed requests
        const originalEnd = res.end;
        res.end = async function(...args) {
          try {
            const statusCode = res.statusCode;
            const shouldSkip = (
              (opts.skipSuccessfulRequests && statusCode < 400) ||
              (opts.skipFailedRequests && statusCode >= 400)
            );
            
            if (shouldSkip) {
              // Decrement counter for skipped requests
              const currentData = await this._getLimit(limitKey);
              if (currentData) {
                currentData.count = Math.max(0, currentData.count - 1);
                await this._setLimit(limitKey, currentData, opts.windowMs);
              }
            }
          } catch (error) {
            this.logger.error('Error in rate limit response handler:', error);
          }
          
          originalEnd.apply(res, args);
        }.bind(this);
        
        next();
        
      } catch (error) {
        this.logger.error('Rate limiter middleware error:', error);
        // Don't block requests on rate limiter errors
        next();
      }
    };
  }
  
  /**
   * Create MCP-specific rate limiter for tool calls
   * @param {string} toolName - Name of the tool being called
   * @returns {Function} Async rate limiting function
   */
  async checkToolRateLimit(toolName, clientId = 'default') {
    try {
      if (!this.config.enabled || !this.initialized) {
        return { allowed: true };
      }
      
      const key = `rate_limit:tool:${toolName}:${clientId}`;
      const now = Date.now();
      
      let limitData = await this._getLimit(key);
      
      // Initialize or reset if window has expired
      if (!limitData || now - limitData.resetTime >= this.config.toolWindowMs) {
        limitData = {
          count: 0,
          resetTime: now + this.config.toolWindowMs
        };
      }
      
      // Increment counter
      limitData.count++;
      
      // Check if limit exceeded
      if (limitData.count > this.config.toolMaxRequests) {
        await this._setLimit(key, limitData, this.config.toolWindowMs);
        
        this.logger.warn('Tool rate limit exceeded', {
          toolName,
          clientId,
          count: limitData.count,
          limit: this.config.toolMaxRequests
        });
        
        return {
          allowed: false,
          limit: this.config.toolMaxRequests,
          remaining: 0,
          resetTime: Math.ceil(limitData.resetTime / 1000),
          retryAfter: Math.ceil((limitData.resetTime - now) / 1000)
        };
      }
      
      // Save updated count
      await this._setLimit(key, limitData, this.config.toolWindowMs);
      
      const remaining = Math.max(0, this.config.toolMaxRequests - limitData.count);
      
      return {
        allowed: true,
        limit: this.config.toolMaxRequests,
        remaining: remaining,
        resetTime: Math.ceil(limitData.resetTime / 1000)
      };
      
    } catch (error) {
      this.logger.error('Tool rate limit check error:', error);
      // Allow requests on error to prevent blocking
      return { allowed: true };
    }
  }
  
  /**
   * Get rate limiter status and statistics
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      initialized: this.initialized,
      storageType: this.config.useRedis ? 'redis' : 'memory',
      configuration: {
        general: {
          windowMs: this.config.windowMs,
          maxRequests: this.config.maxRequests
        },
        api: {
          windowMs: this.config.apiWindowMs,
          maxRequests: this.config.apiMaxRequests
        },
        webhook: {
          windowMs: this.config.webhookWindowMs,
          maxRequests: this.config.webhookMaxRequests
        },
        mcp: {
          windowMs: this.config.mcpWindowMs,
          maxRequests: this.config.mcpMaxRequests
        },
        tools: {
          windowMs: this.config.toolWindowMs,
          maxRequests: this.config.toolMaxRequests
        }
      }
    };
  }
  
  /**
   * Reset rate limits for a specific client
   * @param {string} clientId - Client identifier
   * @param {string} category - Rate limit category (optional)
   */
  async resetClientLimits(clientId, category = null) {
    try {
      if (this.config.useRedis && this.redisClient) {
        const pattern = category ? 
          `rate_limit:${category}:${clientId}` : 
          `rate_limit:*:${clientId}`;
        
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
      } else {
        // For memory storage, we need to iterate through keys
        const keysToDelete = [];
        for (const key of this.storage.keys()) {
          if (category) {
            if (key === `rate_limit:${category}:${clientId}`) {
              keysToDelete.push(key);
            }
          } else {
            if (key.includes(`:${clientId}`)) {
              keysToDelete.push(key);
            }
          }
        }
        
        keysToDelete.forEach(key => this.storage.delete(key));
      }
      
      this.logger.info('Reset rate limits for client', { clientId, category });
      
    } catch (error) {
      this.logger.error('Error resetting client rate limits:', error);
    }
  }
}

// Create singleton instance
const rateLimiter = new RateLimiterService();

// Initialize the service
rateLimiter.initialize().then((success) => {
  if (success) {
    // Register with initialization tracker
    try {
      if (serviceRegistry.has('initialization')) {
        const initialization = serviceRegistry.get('initialization');
        initialization.markInitialized('RateLimiter', {
          enabled: rateLimiter.config.enabled,
          storageType: rateLimiter.config.useRedis ? 'redis' : 'memory',
          generalLimit: `${rateLimiter.config.maxRequests}/${rateLimiter.config.windowMs}ms`,
          mcpLimit: `${rateLimiter.config.mcpMaxRequests}/${rateLimiter.config.mcpWindowMs}ms`,
          toolLimit: `${rateLimiter.config.toolMaxRequests}/${rateLimiter.config.toolWindowMs}ms`
        });
      }
    } catch (error) {
      rateLimiter.logger.error('Failed to register with initialization tracker:', error);
    }
    
    // Register with service registry
    try {
      serviceRegistry.register('rateLimiter', rateLimiter);
    } catch (error) {
      rateLimiter.logger.warn('Failed to register in service registry:', error);
    }
  }
}).catch((error) => {
  rateLimiter.logger.error('Failed to initialize rate limiter:', error);
});

export default rateLimiter;
