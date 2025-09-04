/**
 * MCP Authentication Unit Tests
 * Tests OAuth 2.1 authentication system without requiring a real OAuth server
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// Mock fetch for authorization server metadata requests
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock the Logger
jest.unstable_mockModule('../../loggerFramework.js', () => ({
  Logger: jest.fn().mockImplementation((name) => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    refreshLogLevel: jest.fn().mockReturnValue(3)
  }))
}));

// Mock crypto for token hashing
jest.unstable_mockModule('crypto', () => ({
  default: {
    createHash: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('mockedHash')
    })
  }
}));

describe('MCP Authentication System', () => {
  let MCPAuthConfig, MCPAuthMiddleware, TokenValidator, AuthServerMetadata, ProtectedResourceMetadata;
  let app;
  let isAuthEnabled;

  beforeAll(async () => {
    // Import modules after mocks
    const authModule = await import('../../MCP/auth/mcpAuth.js');
    MCPAuthConfig = authModule.MCPAuthConfig;
    MCPAuthMiddleware = authModule.MCPAuthMiddleware;
    TokenValidator = authModule.TokenValidator;
    AuthServerMetadata = authModule.AuthServerMetadata;
    ProtectedResourceMetadata = authModule.ProtectedResourceMetadata;
    
    // Check if auth is enabled in the current configuration (directly from env)
    isAuthEnabled = process.env.MCP_AUTH_ENABLED === 'true';
    
    if (!isAuthEnabled) {
      console.log('🔄 MCP Authentication is disabled - skipping auth-specific tests');
    }
  });

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    mockFetch.mockClear();
    
    // Reset environment variables
    delete process.env.MCP_AUTH_ENABLED;
    delete process.env.MCP_AUTH_SERVER_URL;
    delete process.env.MCP_SERVER_CANONICAL_URI;
    delete process.env.MCP_AUTH_CLIENT_ID;
    delete process.env.NODE_ENV;
    
    // Create fresh Express app
    app = express();
    app.use(express.json());
  });

  afterAll(() => {
    // Clean up global mocks to prevent Jest hanging
    if (global.fetch === mockFetch) {
      delete global.fetch;
    }
    jest.restoreAllMocks();
  });

  describe('MCPAuthConfig', () => {
    test('should be disabled by default', () => {
      const config = new MCPAuthConfig();
      expect(config.isEnabled()).toBe(false);
    });

    test('should validate required environment variables when enabled', async () => {
      // Set up environment for this test
      process.env.MCP_AUTH_ENABLED = 'true';
      process.env.MCP_AUTH_SERVER_URL = 'https://auth.example.com';
      delete process.env.MCP_SERVER_CANONICAL_URI;

      // Since we're using ES modules, we need to re-import to get fresh config
      const { MCPAuthConfig: FreshMCPAuthConfig } = await import('../../MCP/auth/mcpAuth.js?' + Date.now());
      
      expect(() => new FreshMCPAuthConfig()).toThrow(/MCP_SERVER_CANONICAL_URI is required/);
    });

    test('should accept valid configuration', () => {
      process.env.MCP_AUTH_ENABLED = 'true';
      process.env.MCP_AUTH_SERVER_URL = 'https://auth.example.com';
      process.env.MCP_SERVER_CANONICAL_URI = 'https://mcp.example.com';
      process.env.MCP_AUTH_CLIENT_ID = 'test-client';

      const config = new MCPAuthConfig();
      expect(config.enabled).toBe(true); // Use .enabled instead of .isEnabled()
      expect(config.authServerUrl).toBe('https://auth.example.com');
      expect(config.serverCanonicalUri).toBe('https://mcp.example.com');
      expect(config.clientId).toBe('test-client');
    });

    test('should enforce HTTPS in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.MCP_AUTH_ENABLED = 'true';
      process.env.MCP_AUTH_SERVER_URL = 'http://auth.example.com'; // HTTP not allowed
      process.env.MCP_SERVER_CANONICAL_URI = 'https://mcp.example.com';

      expect(() => new MCPAuthConfig()).toThrow(/must be a valid HTTPS URL in production/);
    });

    test('should validate canonical URI format', () => {
      process.env.MCP_AUTH_ENABLED = 'true';
      process.env.MCP_AUTH_SERVER_URL = 'https://auth.example.com';
      process.env.MCP_SERVER_CANONICAL_URI = 'invalid-uri';

      expect(() => new MCPAuthConfig()).toThrow(/must be a valid canonical URI/);
    });
  });

  describe('TokenValidator', () => {
    let validator;
    let config;

    beforeEach(() => {
      // Setup valid config
      process.env.MCP_AUTH_ENABLED = 'true';
      process.env.MCP_AUTH_SERVER_URL = 'https://auth.example.com';
      process.env.MCP_SERVER_CANONICAL_URI = 'https://mcp.example.com';
      process.env.MCP_AUTH_CLIENT_ID = 'test-client-id';
      
      config = new MCPAuthConfig();
      validator = new TokenValidator(config);
    });

    test('should skip validation when auth is disabled', async () => {
      process.env.MCP_AUTH_ENABLED = 'false';
      const disabledConfig = new MCPAuthConfig();
      const disabledValidator = new TokenValidator(disabledConfig);

      const result = await disabledValidator.validateToken('any-token');
      expect(result.valid).toBe(true);
      expect(result.skipAuth).toBe(true);
    });

    test('should reject missing tokens', async () => {
      const result = await validator.validateToken();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing access token');
    });

    test('should reject malformed tokens', async () => {
      const result = await validator.validateToken('invalid-token');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    test('should validate JWT token structure', async () => {
      // Create a mock JWT token (header.payload.signature)
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: 'https://auth.example.com',
        aud: ['https://mcp.example.com'],
        sub: 'user123',
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        iat: Math.floor(Date.now() / 1000)
      })).toString('base64url');
      const signature = 'mock-signature';
      const token = `${header}.${payload}.${signature}`;

      const result = await validator.validateToken(token);
      expect(result.valid).toBe(true);
      expect(result.claims.sub).toBe('user123');
      expect(result.claims.aud).toContain('https://mcp.example.com');
    });

    test('should reject expired tokens', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: 'https://auth.example.com',
        aud: ['https://mcp.example.com'],
        sub: 'user123',
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
        iat: Math.floor(Date.now() / 1000) - 7200
      })).toString('base64url');
      const signature = 'mock-signature';
      const token = `${header}.${payload}.${signature}`;

      const result = await validator.validateToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');
    });

    test('should reject tokens with invalid audience', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: 'https://auth.example.com',
        aud: ['https://other-server.com'], // Wrong audience
        sub: 'user123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      })).toString('base64url');
      const signature = 'mock-signature';
      const token = `${header}.${payload}.${signature}`;

      const result = await validator.validateToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token audience');
    });

    test('should cache valid tokens', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: 'https://auth.example.com',
        aud: ['https://mcp.example.com'],
        sub: 'user123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      })).toString('base64url');
      const signature = 'mock-signature';
      const token = `${header}.${payload}.${signature}`;

      // First validation
      const result1 = await validator.validateToken(token);
      expect(result1.valid).toBe(true);

      // Second validation should use cache
      const result2 = await validator.validateToken(token);
      expect(result2.valid).toBe(true);
      expect(result2.claims.sub).toBe('user123');
    });
  });

  describe('AuthServerMetadata', () => {
    let metadata;
    let config;

    beforeEach(() => {
      process.env.MCP_AUTH_ENABLED = 'true';
      process.env.MCP_AUTH_SERVER_URL = 'https://auth.example.com';
      process.env.MCP_SERVER_CANONICAL_URI = 'https://mcp.example.com';
      process.env.MCP_AUTH_CLIENT_ID = 'test-client-id';
      
      config = new MCPAuthConfig();
      metadata = new AuthServerMetadata(config);
    });

    test('should fetch authorization server metadata', async () => {
      const mockMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/auth',
        token_endpoint: 'https://auth.example.com/token',
        jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
        code_challenge_methods_supported: ['S256']
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockMetadata)
      });

      const result = await metadata.getMetadata();
      expect(result).toEqual(mockMetadata);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/.well-known/oauth-authorization-server',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Accept': 'application/json'
          })
        })
      );
    });

    test('should validate required metadata fields', async () => {
      const invalidMetadata = {
        issuer: 'https://auth.example.com'
        // Missing required fields
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(invalidMetadata)
      });

      await expect(metadata.getMetadata()).rejects.toThrow(/missing required fields/);
    });

    test('should require PKCE support', async () => {
      const metadataWithoutPKCE = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/auth',
        token_endpoint: 'https://auth.example.com/token',
        jwks_uri: 'https://auth.example.com/.well-known/jwks.json'
        // Missing code_challenge_methods_supported
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(metadataWithoutPKCE)
      });

      await expect(metadata.getMetadata()).rejects.toThrow(/must support PKCE with S256/);
    });

    test('should cache metadata', async () => {
      const mockMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/auth',
        token_endpoint: 'https://auth.example.com/token',
        jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
        code_challenge_methods_supported: ['S256']
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockMetadata)
      });

      // First call
      await metadata.getMetadata();
      
      // Second call should use cache, not make another fetch
      await metadata.getMetadata();
      
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('ProtectedResourceMetadata', () => {
    test('should return correct metadata when auth is enabled', () => {
      process.env.MCP_AUTH_ENABLED = 'true';
      process.env.MCP_AUTH_SERVER_URL = 'https://auth.example.com';
      process.env.MCP_SERVER_CANONICAL_URI = 'https://mcp.example.com';
      process.env.MCP_AUTH_CLIENT_ID = 'test-client-id';
      
      const config = new MCPAuthConfig();
      const metadata = new ProtectedResourceMetadata(config);
      
      const result = metadata.getMetadata();
      expect(result).toEqual({
        resource: 'https://mcp.example.com',
        authorization_servers: ['https://auth.example.com'],
        jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
        bearer_methods_supported: ['header'],
        resource_documentation: 'https://mcp.example.com/docs',
        op_policy_uri: 'https://auth.example.com/policy',
        op_tos_uri: 'https://auth.example.com/terms'
      });
    });

    test('should return null when auth is disabled', () => {
      const config = new MCPAuthConfig(); // Auth disabled by default
      const metadata = new ProtectedResourceMetadata(config);
      
      const result = metadata.getMetadata();
      expect(result).toBeNull();
    });
  });

  // Only run middleware integration tests if auth is enabled
  (isAuthEnabled ? describe : describe.skip)('MCPAuthMiddleware Integration', () => {
    let middleware;

    beforeEach(() => {
      process.env.MCP_AUTH_ENABLED = 'true';
      process.env.MCP_AUTH_SERVER_URL = 'https://auth.example.com';
      process.env.MCP_SERVER_CANONICAL_URI = 'https://mcp.example.com';
      process.env.MCP_AUTH_CLIENT_ID = 'test-client-id';
      
      const config = new MCPAuthConfig();
      middleware = new MCPAuthMiddleware(config);
      
      app.use(middleware.middleware());
      app.get('/.well-known/oauth-protected-resource', middleware.getProtectedResourceMetadata());
      app.post('/mcp', (req, res) => res.json({ success: true, authenticated: req.authenticated }));
    });

    test('should allow access to metadata endpoints without auth', async () => {
      const response = await request(app)
        .get('/.well-known/oauth-protected-resource');
      
      expect(response.status).toBe(200);
      expect(response.body.resource).toBe('https://mcp.example.com');
    });

    test('should require Bearer token for protected endpoints', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({ method: 'tools/list' });
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('unauthorized');
      expect(response.headers['www-authenticate']).toContain('Bearer');
    });

    test('should accept valid Bearer tokens', async () => {
      // Create valid JWT token
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: 'https://auth.example.com',
        aud: ['https://mcp.example.com'],
        sub: 'user123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      })).toString('base64url');
      const signature = 'mock-signature';
      const token = `${header}.${payload}.${signature}`;

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${token}`)
        .send({ method: 'tools/list' });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.authenticated).toBe(true);
    });

    test('should reject malformed Authorization headers', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'InvalidHeader')
        .send({ method: 'tools/list' });
      
      expect(response.status).toBe(401);
      expect(response.body.error_description).toBe('Bearer token required');
    });

    test('should pass through when auth is disabled', async () => {
      // Create app with disabled auth
      const disabledApp = express();
      disabledApp.use(express.json());
      
      delete process.env.MCP_AUTH_ENABLED;
      const disabledConfig = new MCPAuthConfig();
      const disabledMiddleware = new MCPAuthMiddleware(disabledConfig);
      
      disabledApp.use(disabledMiddleware.middleware());
      disabledApp.post('/mcp', (req, res) => res.json({ success: true, authenticated: req.authenticated }));

      const response = await request(disabledApp)
        .post('/mcp')
        .send({ method: 'tools/list' });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Should not set authenticated when auth is disabled
      expect(response.body.authenticated).toBeUndefined();
    });
  });

  // Only run error handling tests if auth is enabled
  (isAuthEnabled ? describe : describe.skip)('Error Handling', () => {
    test('should handle authorization server fetch errors', async () => {
      process.env.MCP_AUTH_ENABLED = 'true';
      process.env.MCP_AUTH_SERVER_URL = 'https://auth.example.com';
      process.env.MCP_SERVER_CANONICAL_URI = 'https://mcp.example.com';
      process.env.MCP_AUTH_CLIENT_ID = 'test-client-id';
      
      const config = new MCPAuthConfig();
      const metadata = new AuthServerMetadata(config);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(metadata.getMetadata()).rejects.toThrow(/Authorization server metadata error/);
    });

    test('should handle token validation errors gracefully', async () => {
      process.env.MCP_AUTH_ENABLED = 'true';
      process.env.MCP_AUTH_SERVER_URL = 'https://auth.example.com';
      process.env.MCP_SERVER_CANONICAL_URI = 'https://mcp.example.com';
      process.env.MCP_AUTH_CLIENT_ID = 'test-client-id';
      
      const config = new MCPAuthConfig();
      const validator = new TokenValidator(config);

      // Invalid JSON in token payload
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const invalidPayload = 'invalid-json';
      const signature = 'mock-signature';
      const token = `${header}.${invalidPayload}.${signature}`;

      const result = await validator.validateToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Token validation error');
    });
  });
});
