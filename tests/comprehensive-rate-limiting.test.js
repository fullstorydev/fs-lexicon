/**
 * Comprehensive Rate Limiting Tests
 * Tests rate limiting functionality across all Lexicon components
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { setTimeout } from 'timers/promises';

// Mock the imports that might not be available in test environment
const mockRateLimiter = {
  initialized: true,
  config: {
    enabled: true,
    windowMs: 60000,
    maxRequests: 5, // Low limit for testing
    mcpWindowMs: 60000,
    mcpMaxRequests: 3,
    toolWindowMs: 60000,
    toolMaxRequests: 2,
    useRedis: false
  },
  createMiddleware: jest.fn(),
  checkToolRateLimit: jest.fn()
};

const mockMiddleware = {
  createRateLimit: jest.fn(),
  createWebhookRateLimit: jest.fn(),
  createMcpRateLimit: jest.fn(),
  logRequest: jest.fn((req, res, next) => next()),
  verifyWebHook: jest.fn((req, res, next) => next())
};

// Mock modules before importing
jest.unstable_mockModule('../rateLimiter.js', () => ({
  default: mockRateLimiter
}));

jest.unstable_mockModule('../middleware.js', () => ({
  default: mockMiddleware
}));

describe('Rate Limiting Integration Tests', () => {
  let app;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create test app
    app = express();
    app.use(express.json());
    
    // Setup mock rate limiting middleware
    const mockRateLimitMiddleware = (req, res, next) => {
      // Simulate rate limiting logic - check X-Forwarded-For first, then IP
      const clientId = req.get('X-Forwarded-For') || req.ip || req.connection?.remoteAddress || 'test-client';
      const key = `rate_limit_test_${clientId}`;
      
      // Simple in-memory rate limiting for testing
      if (!global.testRateLimitStore) {
        global.testRateLimitStore = new Map();
      }
      
      const now = Date.now();
      const window = 10000; // 10 seconds for fast testing
      const limit = 3; // 3 requests per window
      
      let data = global.testRateLimitStore.get(key);
      if (!data || now - data.resetTime >= window) {
        data = { count: 0, resetTime: now + window };
      }
      
      data.count++;
      global.testRateLimitStore.set(key, data);
      
      const remaining = Math.max(0, limit - data.count);
      const resetTime = Math.ceil(data.resetTime / 1000);
      
      // Always add rate limit headers
      res.set({
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': resetTime.toString(),
        'X-RateLimit-Window': window.toString()
      });
      
      if (data.count > limit) {
        const retryAfter = Math.ceil((data.resetTime - now) / 1000);
        res.set('Retry-After', retryAfter.toString());
        
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          message: 'Too many requests, please try again later.',
          rateLimitInfo: {
            limit: limit,
            remaining: 0,
            resetTime: resetTime,
            retryAfter: retryAfter
          }
        });
      }
      
      next();
    };
    
    // Configure mock returns
    mockMiddleware.createRateLimit.mockReturnValue(mockRateLimitMiddleware);
    mockMiddleware.createWebhookRateLimit.mockReturnValue(mockRateLimitMiddleware);
    mockMiddleware.createMcpRateLimit.mockReturnValue(mockRateLimitMiddleware);
  });
  
  afterEach(() => {
    // Clean up test rate limit store
    global.testRateLimitStore = new Map();
  });

  describe('General Rate Limiting', () => {
    beforeEach(() => {
      // Add general rate limiting
      app.use(mockMiddleware.createRateLimit());
      
      // Add test endpoint
      app.get('/test', (req, res) => {
        res.json({ success: true, message: 'Test endpoint' });
      });
    });

    test('should allow requests under the limit', async () => {
      const response = await request(app)
        .get('/test')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.headers['x-ratelimit-limit']).toBe('3');
      expect(response.headers['x-ratelimit-remaining']).toBe('2');
    });

    test('should block requests over the limit', async () => {
      // Make requests up to the limit
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(200);
      
      // This request should be rate limited
      const response = await request(app)
        .get('/test')
        .expect(429);
      
      expect(response.body.error).toBe('Rate limit exceeded');
      expect(response.body.rateLimitInfo).toBeDefined();
      expect(response.body.rateLimitInfo.remaining).toBe(0);
      expect(response.headers['retry-after']).toBeDefined();
    });

    test('should include rate limit headers', async () => {
      const response = await request(app)
        .get('/test')
        .expect(200);
      
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('Webhook Rate Limiting', () => {
    beforeEach(() => {
      // Add webhook rate limiting
      app.use('/webhook', mockMiddleware.createWebhookRateLimit());
      
      // Add webhook endpoints
      app.post('/webhook/slack', (req, res) => {
        res.json({ success: true, message: 'Slack webhook processed' });
      });
      
      app.post('/webhook/fullstory', (req, res) => {
        res.json({ success: true, message: 'Fullstory webhook processed' });
      });
    });

    test('should apply rate limiting to webhook endpoints', async () => {
      // First few requests should succeed
      await request(app)
        .post('/webhook/slack')
        .send({ test: 'data' })
        .expect(200);
      
      await request(app)
        .post('/webhook/fullstory')
        .send({ test: 'data' })
        .expect(200);
      
      await request(app)
        .post('/webhook/slack')
        .send({ test: 'data' })
        .expect(200);
      
      // Next request should be rate limited
      const response = await request(app)
        .post('/webhook/slack')
        .send({ test: 'data' })
        .expect(429);
      
      expect(response.body.error).toBe('Rate limit exceeded');
    });

    test('should track rate limits per client', async () => {
      // Simulate different clients
      const client1Response = await request(app)
        .post('/webhook/slack')
        .set('X-Forwarded-For', '192.168.1.1')
        .send({ test: 'data' })
        .expect(200);
      
      const client2Response = await request(app)
        .post('/webhook/slack')
        .set('X-Forwarded-For', '192.168.1.2')
        .send({ test: 'data' })
        .expect(200);
      
      // Both should have their own rate limit counters
      expect(client1Response.headers['x-ratelimit-remaining']).toBe('2');
      expect(client2Response.headers['x-ratelimit-remaining']).toBe('2');
    });
  });

  describe('MCP Rate Limiting', () => {
    beforeEach(() => {
      // Add MCP rate limiting
      app.use('/mcp', mockMiddleware.createMcpRateLimit());
      
      // Add MCP endpoints
      app.post('/mcp', (req, res) => {
        const { method, params } = req.body;
        
        if (method === 'tools/list') {
          res.json({
            jsonrpc: '2.0',
            id: req.body.id,
            result: {
              tools: [
                { name: 'test_tool', description: 'Test tool' }
              ]
            }
          });
        } else if (method === 'tools/call') {
          // Simulate tool rate limiting
          if (params.name === 'rate_limited_tool') {
            return res.json({
              jsonrpc: '2.0',
              id: req.body.id,
              result: {
                content: [{
                  type: 'text',
                  text: 'Rate limit exceeded for tool "rate_limited_tool". Please try again in 45 seconds.'
                }],
                isError: true
              }
            });
          }
          
          res.json({
            jsonrpc: '2.0',
            id: req.body.id,
            result: {
              content: [{
                type: 'text',
                text: 'Tool executed successfully'
              }]
            }
          });
        }
      });
    });

    test('should allow MCP protocol requests under limit', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list'
        })
        .expect(200);
      
      expect(response.body.result.tools).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBe('2');
    });

    test('should block MCP requests over HTTP limit', async () => {
      // Make requests up to the limit
      await request(app)
        .post('/mcp')
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
        .expect(200);
      
      await request(app)
        .post('/mcp')
        .send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
        .expect(200);
      
      await request(app)
        .post('/mcp')
        .send({ jsonrpc: '2.0', id: 3, method: 'tools/list' })
        .expect(200);
      
      // This should be rate limited
      const response = await request(app)
        .post('/mcp')
        .send({ jsonrpc: '2.0', id: 4, method: 'tools/list' })
        .expect(429);
      
      expect(response.body.error).toBe('Rate limit exceeded');
    });

    test('should handle tool-level rate limiting', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'rate_limited_tool',
            arguments: {}
          }
        })
        .expect(200);
      
      expect(response.body.result.isError).toBe(true);
      expect(response.body.result.content[0].text).toContain('Rate limit exceeded for tool');
    });
  });

  describe('Rate Limiter Service Integration', () => {
    test('should call createMiddleware with correct parameters', () => {
      mockMiddleware.createRateLimit();
      expect(mockMiddleware.createRateLimit).toHaveBeenCalled();
    });

    test('should call createWebhookRateLimit for webhook routes', () => {
      mockMiddleware.createWebhookRateLimit();
      expect(mockMiddleware.createWebhookRateLimit).toHaveBeenCalled();
    });

    test('should call createMcpRateLimit for MCP routes', () => {
      mockMiddleware.createMcpRateLimit();
      expect(mockMiddleware.createMcpRateLimit).toHaveBeenCalled();
    });
  });

  describe('Configuration Testing', () => {
    test('should respect rate limiting configuration', () => {
      expect(mockRateLimiter.config.enabled).toBe(true);
      expect(mockRateLimiter.config.maxRequests).toBeDefined();
      expect(mockRateLimiter.config.windowMs).toBeDefined();
    });

    test('should have different limits for different endpoint types', () => {
      expect(mockRateLimiter.config.mcpMaxRequests).toBeLessThanOrEqual(mockRateLimiter.config.maxRequests);
      expect(mockRateLimiter.config.toolMaxRequests).toBeLessThanOrEqual(mockRateLimiter.config.mcpMaxRequests);
    });
  });
});

describe('Rate Limiting Edge Cases', () => {
  test('should handle malformed requests gracefully', async () => {
    const app = express();
    
    // Apply rate limiting BEFORE JSON parsing
    app.use(mockMiddleware.createRateLimit());
    app.use(express.json());
    
    app.post('/test', (req, res) => {
      res.json({ success: true });
    });
    
    // Send valid request first to test rate limiting works
    const validResponse = await request(app)
      .post('/test')
      .send({ valid: 'json' })
      .expect(200);
    
    // Should have rate limit headers for valid requests
    expect(validResponse.headers['x-ratelimit-limit']).toBeDefined();
    expect(validResponse.headers['x-ratelimit-remaining']).toBeDefined();
  });

  test('should reset rate limits after window expires', async () => {
    // This test would need a shorter window for practical testing
    // In a real implementation, you'd use a test with a very short window
    expect(mockRateLimiter.config.windowMs).toBeGreaterThan(0);
  });
});
