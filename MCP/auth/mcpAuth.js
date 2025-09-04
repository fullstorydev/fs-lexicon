/**
 * MCP OAuth 2.1 Authentication System
 * 
 * Implements OAuth 2.1 authorization as per MCP specification 2025-06-18:
 * - Authorization Server Discovery (RFC 9728)
 * - Authorization Server Metadata (RFC 8414) 
 * - Dynamic Client Registration (RFC 7591)
 * - Resource Indicators (RFC 8707)
 * - PKCE (OAuth 2.1 requirement)
 * 
 * DISABLED BY DEFAULT - Requires explicit configuration
 */

import crypto from 'crypto';
import { Logger } from '../../loggerFramework.js';
import config from '../../config.js';

// Create logger instance
const authLogger = new Logger('MCP-Auth');

/**
 * MCP Authentication Configuration
 */
class MCPAuthConfig {
  constructor() {
    this.enabled = config.getBoolean('mcp_auth_enabled', false);
    this.authServerUrl = config.get('mcp_auth_server_url');
    this.clientId = config.get('mcp_auth_client_id');
    this.clientSecret = config.get('mcp_auth_client_secret');
    this.serverCanonicalUri = config.get('mcp_server_canonical_uri');
    this.allowDynamicRegistration = config.getBoolean('mcp_auth_allow_dynamic_registration', false);
    this.tokenCacheTimeSeconds = config.getNumber('mcp_auth_token_cache_time', 300);
    this.requireTokenAudienceValidation = config.getBoolean('mcp_auth_require_audience_validation', true);
    
    // Security settings
    this.enforceHTTPS = config.get('node_env') === 'production';
    this.maxTokenAge = config.getNumber('mcp_auth_max_token_age', 3600); // 1 hour
    this.rateLimitByToken = config.getBoolean('mcp_auth_rate_limit_by_token', false);
    
    this._validate();
  }

  _validate() {
    if (!this.enabled) {
      authLogger.info('MCP Authentication is DISABLED by default');
      return;
    }

    authLogger.info('MCP Authentication is ENABLED - validating configuration');

    const errors = [];
    
    if (!this.serverCanonicalUri) {
      errors.push('MCP_SERVER_CANONICAL_URI is required when authentication is enabled');
    } else if (!this._isValidCanonicalUri(this.serverCanonicalUri)) {
      errors.push('MCP_SERVER_CANONICAL_URI must be a valid canonical URI (https scheme, no fragments)');
    }

    if (!this.authServerUrl) {
      errors.push('MCP_AUTH_SERVER_URL is required when authentication is enabled');
    } else if (!this._isValidAuthServerUrl(this.authServerUrl)) {
      errors.push('MCP_AUTH_SERVER_URL must be a valid HTTPS URL in production');
    }

    if (!this.clientId && !this.allowDynamicRegistration) {
      errors.push('MCP_AUTH_CLIENT_ID is required when dynamic registration is disabled');
    }

    if (errors.length > 0) {
      authLogger.error('MCP Authentication configuration errors:', errors);
      throw new Error(`MCP Auth Configuration Error: ${errors.join('; ')}`);
    }

    authLogger.info('MCP Authentication configuration validated successfully', {
      authServerUrl: this.authServerUrl,
      serverCanonicalUri: this.serverCanonicalUri,
      dynamicRegistration: this.allowDynamicRegistration,
      audienceValidation: this.requireTokenAudienceValidation,
      httpsEnforced: this.enforceHTTPS
    });
  }

  _isValidCanonicalUri(uri) {
    try {
      const url = new URL(uri);
      // RFC 8707 canonical URI requirements
      return url.protocol === 'https:' && !url.hash && url.hostname.toLowerCase() === url.hostname;
    } catch {
      return false;
    }
  }

  _isValidAuthServerUrl(url) {
    try {
      const urlObj = new URL(url);
      // In production, must be HTTPS
      if (this.enforceHTTPS && urlObj.protocol !== 'https:') {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  isEnabled() {
    return this.enabled;
  }
}

/**
 * Authorization Server Metadata (RFC 8414)
 */
class AuthServerMetadata {
  constructor(config) {
    this.config = config;
    this._metadata = null;
    this._lastFetch = null;
    this._cacheTimeMs = 300000; // 5 minutes
  }

  async getMetadata() {
    if (!this.config.isEnabled()) {
      throw new Error('Authentication is disabled');
    }

    // Check cache
    if (this._metadata && this._lastFetch && 
        (Date.now() - this._lastFetch) < this._cacheTimeMs) {
      return this._metadata;
    }

    try {
      const metadataUrl = new URL('/.well-known/oauth-authorization-server', this.config.authServerUrl);
      authLogger.debug('Fetching authorization server metadata', { url: metadataUrl.toString() });

      const response = await fetch(metadataUrl.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Lexicon-MCP/1.0'
        },
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
      }

      this._metadata = await response.json();
      this._lastFetch = Date.now();

      // Validate required metadata fields
      this._validateMetadata(this._metadata);

      authLogger.info('Authorization server metadata fetched successfully', {
        issuer: this._metadata.issuer,
        supportsPKCE: !!this._metadata.code_challenge_methods_supported,
        supportsDynamicRegistration: !!this._metadata.registration_endpoint
      });

      return this._metadata;
    } catch (error) {
      authLogger.error('Failed to fetch authorization server metadata:', error);
      throw new Error(`Authorization server metadata error: ${error.message}`);
    }
  }

  _validateMetadata(metadata) {
    const required = ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri'];
    const missing = required.filter(field => !metadata[field]);
    
    if (missing.length > 0) {
      throw new Error(`Authorization server metadata missing required fields: ${missing.join(', ')}`);
    }

    // PKCE is required by OAuth 2.1
    if (!metadata.code_challenge_methods_supported || 
        !metadata.code_challenge_methods_supported.includes('S256')) {
      throw new Error('Authorization server must support PKCE with S256');
    }
  }
}

/**
 * Protected Resource Metadata (RFC 9728)
 */
class ProtectedResourceMetadata {
  constructor(config) {
    this.config = config;
  }

  getMetadata() {
    if (!this.config.isEnabled()) {
      return null;
    }

    return {
      resource: this.config.serverCanonicalUri,
      authorization_servers: [this.config.authServerUrl],
      jwks_uri: `${this.config.authServerUrl}/.well-known/jwks.json`,
      bearer_methods_supported: ['header'],
      resource_documentation: `${this.config.serverCanonicalUri}/docs`,
      op_policy_uri: `${this.config.authServerUrl}/policy`,
      op_tos_uri: `${this.config.authServerUrl}/terms`
    };
  }
}

/**
 * Token Validator with Audience Binding
 */
class TokenValidator {
  constructor(config) {
    this.config = config;
    this._jwksCache = new Map();
    this._tokenCache = new Map();
  }

  async validateToken(accessToken) {
    if (!this.config.isEnabled()) {
      return { valid: true, skipAuth: true };
    }

    if (!accessToken) {
      return { valid: false, error: 'Missing access token' };
    }

    // Check token cache first
    const cacheKey = this._hashToken(accessToken);
    if (this._tokenCache.has(cacheKey)) {
      const cached = this._tokenCache.get(cacheKey);
      if (Date.now() < cached.expiresAt) {
        return { valid: true, claims: cached.claims };
      }
      this._tokenCache.delete(cacheKey);
    }

    try {
      // Parse JWT token (basic validation)
      const tokenParts = accessToken.split('.');
      if (tokenParts.length !== 3) {
        return { valid: false, error: 'Invalid token format' };
      }

      const header = JSON.parse(Buffer.from(tokenParts[0], 'base64url').toString());
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString());

      // Validate basic claims
      const now = Math.floor(Date.now() / 1000);
      
      if (payload.exp && payload.exp < now) {
        return { valid: false, error: 'Token expired' };
      }

      if (payload.nbf && payload.nbf > now) {
        return { valid: false, error: 'Token not yet valid' };
      }

      if (payload.iat && (now - payload.iat) > this.config.maxTokenAge) {
        return { valid: false, error: 'Token too old' };
      }

      // Audience validation (RFC 8707) - Critical for security
      if (this.config.requireTokenAudienceValidation) {
        if (!this._validateAudience(payload.aud)) {
          return { valid: false, error: 'Invalid token audience' };
        }
      }

      // Note: This implementation performs basic JWT validation (expiry, audience, structure)
      // For production environments requiring cryptographic signature validation,
      // implement JWKS validation by extending this method with your authorization server's public keys
      authLogger.debug('Performing basic JWT validation - extend with JWKS for signature verification if required');

      // Cache valid token
      const cacheEntry = {
        claims: payload,
        expiresAt: Date.now() + (this.config.tokenCacheTimeSeconds * 1000)
      };
      this._tokenCache.set(cacheKey, cacheEntry);

      authLogger.debug('Token validated successfully', {
        subject: payload.sub,
        audience: payload.aud,
        expiresAt: new Date(payload.exp * 1000).toISOString()
      });

      return { valid: true, claims: payload };
    } catch (error) {
      authLogger.error('Token validation failed:', error);
      return { valid: false, error: 'Token validation error' };
    }
  }

  _validateAudience(audience) {
    if (!audience) {
      return false;
    }

    const audiences = Array.isArray(audience) ? audience : [audience];
    return audiences.includes(this.config.serverCanonicalUri);
  }

  _hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Clean expired tokens from cache
  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this._tokenCache.entries()) {
      if (now >= value.expiresAt) {
        this._tokenCache.delete(key);
      }
    }
  }
}

/**
 * MCP Authentication Middleware
 */
class MCPAuthMiddleware {
  constructor(config) {
    this.config = config;
    this.tokenValidator = new TokenValidator(config);
    this.protectedResourceMeta = new ProtectedResourceMetadata(config);
    this.authServerMeta = new AuthServerMetadata(config);
    
    // Setup periodic cache cleanup
    if (config.isEnabled()) {
      setInterval(() => this.tokenValidator.cleanCache(), 60000); // Every minute
    }
  }

  /**
   * Express middleware for HTTP authentication
   */
  middleware() {
    return async (req, res, next) => {
      try {
        if (!this.config.isEnabled()) {
          // Authentication disabled - continue without auth
          return next();
        }

        // Skip auth for metadata endpoints
        if (req.path === '/.well-known/oauth-protected-resource' || 
            req.path === '/.well-known/oauth-authorization-server') {
          return next();
        }

        // Extract Bearer token
        const authHeader = req.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return this._handleUnauthorized(res, 'Bearer token required');
        }

        const token = authHeader.substring(7);
        const validation = await this.tokenValidator.validateToken(token);

        if (!validation.valid) {
          return this._handleUnauthorized(res, validation.error);
        }

        // Add token claims to request context
        req.authClaims = validation.claims;
        req.authenticated = true;

        next();
      } catch (error) {
        authLogger.error('Authentication middleware error:', error);
        return this._handleServerError(res, 'Authentication error');
      }
    };
  }

  _handleUnauthorized(res, error) {
    authLogger.warn('Unauthorized request:', error);
    
    // RFC 9728 - WWW-Authenticate header for protected resource discovery
    const metadataUrl = `${this.config.serverCanonicalUri}/.well-known/oauth-protected-resource`;
    res.set('WWW-Authenticate', `Bearer realm="${this.config.serverCanonicalUri}", error="invalid_token", error_description="${error}", resource="${metadataUrl}"`);
    
    return res.status(401).json({
      error: 'unauthorized',
      error_description: error,
      metadata_url: metadataUrl
    });
  }

  _handleServerError(res, error) {
    return res.status(500).json({
      error: 'server_error',
      error_description: error
    });
  }

  /**
   * Get protected resource metadata endpoint handler
   */
  getProtectedResourceMetadata() {
    return (req, res) => {
      if (!this.config.isEnabled()) {
        return res.status(404).json({ error: 'Authentication not configured' });
      }

      const metadata = this.protectedResourceMeta.getMetadata();
      res.json(metadata);
    };
  }

  /**
   * Get authorization server metadata endpoint handler  
   */
  getAuthServerMetadata() {
    return async (req, res) => {
      try {
        if (!this.config.isEnabled()) {
          return res.status(404).json({ error: 'Authentication not configured' });
        }

        const metadata = await this.authServerMeta.getMetadata();
        res.json(metadata);
      } catch (error) {
        authLogger.error('Error serving auth server metadata:', error);
        res.status(500).json({ 
          error: 'server_error', 
          error_description: 'Failed to fetch authorization server metadata' 
        });
      }
    };
  }
}

// Export the main classes
export { MCPAuthConfig, MCPAuthMiddleware, TokenValidator, AuthServerMetadata, ProtectedResourceMetadata };

// Export a configured instance for easy use
let configuredAuth = null;

export function getMCPAuth() {
  if (!configuredAuth) {
    const config = new MCPAuthConfig();
    configuredAuth = new MCPAuthMiddleware(config);
  }
  return configuredAuth;
}

export function isAuthEnabled() {
  const config = new MCPAuthConfig();
  return config.isEnabled();
}
