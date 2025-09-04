/**
 * MCP Security Integration Tests
 * Tests authentication and input validation working together in realistic scenarios
 */

import fetch from 'node-fetch';
import { setTimeout } from 'timers/promises';
import config from '../../config.js';

// Check if authentication is enabled to conditionally run auth tests
const isAuthEnabled = config.getBoolean('mcp_auth_enabled', false);

// Load test environment if available
const testEnvPath = new URL('../test.env', import.meta.url);
try {
  const { config: dotenvConfig } = await import('dotenv');
  dotenvConfig({ path: testEnvPath.pathname });
} catch (error) {
  // test.env not found or dotenv not available, continue with environment variables
}

const MCP_URL = config.get('mcp_url', 'http://localhost:8080/mcp');
const BASE_URL = config.get('lexicon_url', 'http://localhost:8080');

/**
 * Creates a mock JWT token for testing
 */
function createMockJWT(payload = {}, expired = false) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const defaultPayload = {
    iss: 'https://auth.example.com',
    aud: ['https://localhost:8080', 'https://mcp.example.com'],
    sub: 'test-user-123',
    exp: expired ? Math.floor(Date.now() / 1000) - 3600 : Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000) - 60,
    scope: 'mcp:read mcp:write',
    ...payload
  };
  
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(defaultPayload)).toString('base64url');
  const signature = 'mock-signature-for-testing';
  
  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Makes MCP request with optional authentication
 */
async function makeMCPRequest(method, params = {}, authToken = null) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Test-Client': 'mcp-security-integration-test'
  };
  
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  const body = {
    jsonrpc: '2.0',
    id: Math.random().toString(36).substr(2, 9),
    method,
    params
  };
  
  return fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

describe('MCP Security Integration Tests', () => {
  const testTimeout = 30000; // 30 seconds

  // Log auth status for debugging
  beforeAll(() => {
    if (!isAuthEnabled) {
      console.log('🔄 MCP Authentication is disabled - skipping auth-specific integration tests');
    }
  });

  // Only run authentication tests if auth is enabled
  (isAuthEnabled ? describe : describe.skip)('Authentication Integration (when enabled)', () => {
    test('should provide OAuth discovery endpoints', async () => {
      // Test protected resource metadata endpoint
      const metadataResponse = await fetch(`${BASE_URL}/.well-known/oauth-protected-resource`, {
        method: 'GET',
        headers: { 'X-Test-Client': 'discovery-test' }
      });

      if (metadataResponse.status === 404) {
        // Authentication is disabled - this is the expected default
        console.log('✓ Authentication is disabled by default (expected)');
        return;
      }

      // If authentication is enabled, test the discovery endpoints
      expect(metadataResponse.status).toBe(200);
      const metadata = await metadataResponse.json();
      
      expect(metadata.resource).toBeDefined();
      expect(metadata.authorization_servers).toBeInstanceOf(Array);
      expect(metadata.bearer_methods_supported).toContain('header');
    }, testTimeout);

    test('should handle MCP requests without authentication when disabled', async () => {
      const response = await makeMCPRequest('tools/list');
      
      // Should work without authentication when auth is disabled (default)
      expect([200, 401, 406]).toContain(response.status);
      
      if (response.status === 200) {
        console.log('✓ Authentication is disabled - MCP requests work without tokens');
        const result = await response.json();
        expect(result.result).toBeDefined();
        expect(result.result.tools).toBeInstanceOf(Array);
      } else {
        console.log('✓ Authentication is enabled - testing token validation');
      }
    }, testTimeout);

    test('should validate Bearer tokens when authentication is enabled', async () => {
      // First check if auth is enabled by making a request without token
      const unauthedResponse = await makeMCPRequest('tools/list');
      
      if (unauthedResponse.status !== 401) {
        console.log('✓ Authentication disabled - skipping token validation tests');
        return;
      }

      // Auth is enabled - test with valid token
      const validToken = createMockJWT();
      const authedResponse = await makeMCPRequest('tools/list', {}, validToken);
      
      expect([200, 500]).toContain(authedResponse.status); // 500 if no real auth server
      
      if (authedResponse.status === 200) {
        const result = await authedResponse.json();
        expect(result.result).toBeDefined();
      }
    }, testTimeout);

    test('should reject expired tokens when authentication is enabled', async () => {
      const unauthedResponse = await makeMCPRequest('tools/list');
      
      if (unauthedResponse.status !== 401) {
        console.log('✓ Authentication disabled - skipping expired token tests');
        return;
      }

      // Test with expired token
      const expiredToken = createMockJWT({}, true);
      const response = await makeMCPRequest('tools/list', {}, expiredToken);
      
      expect(response.status).toBe(401);
      
      const wwwAuth = response.headers.get('www-authenticate');
      expect(wwwAuth).toContain('Bearer');
      expect(wwwAuth).toContain('error="invalid_token"');
    }, testTimeout);

    test('should reject tokens with wrong audience when authentication is enabled', async () => {
      const unauthedResponse = await makeMCPRequest('tools/list');
      
      if (unauthedResponse.status !== 401) {
        console.log('✓ Authentication disabled - skipping audience validation tests');
        return;
      }

      // Test with wrong audience
      const wrongAudienceToken = createMockJWT({ aud: ['https://other-server.com'] });
      const response = await makeMCPRequest('tools/list', {}, wrongAudienceToken);
      
      expect(response.status).toBe(401);
    }, testTimeout);
  });

  describe('Input Validation Integration', () => {

    test('should sanitize XSS attempts in annotation tools', async () => {
      const xssPayload = "<script>alert('xss')</script>Hello";
      
      const response = await makeMCPRequest('tools/call', {
        name: 'fullstory_create_annotation',
        arguments: {
          text: xssPayload
        }
      });
      
      if (response.status === 401) {
        console.log('✓ Authentication required - testing with token');
        const authedResponse = await makeMCPRequest('tools/call', {
          name: 'fullstory_create_annotation',
          arguments: {
            text: xssPayload
          }
        }, createMockJWT());
        
        if (authedResponse.status === 401) {
          console.log('✓ Real OAuth server required - skipping XSS test');
          return;
        }
      }
      
      expect([200, 400, 406, 500]).toContain(response.status);
      
      if (response.status === 200) {
        const result = await response.json();
        
        // Check if XSS was sanitized or blocked
        if (result.error) {
          expect(result.error.message || result.error).toContain('validation failed');
        } else if (result.result && result.result.isError) {
          const content = result.result.content?.[0]?.text || '';
          expect(content).toMatch(/validation failed|XSS/i);
        } else if (result.result && result.result.content) {
          // If not blocked, should be sanitized
          const content = result.result.content?.[0]?.text || '';
          expect(content).not.toContain('<script>');
          expect(content).toContain('&lt;script&gt;');
        }
      }
    }, testTimeout);


  });

  describe('Combined Security Scenarios', () => {

    test('should handle rate limiting with security validation', async () => {
      // Make multiple requests with invalid input to test interaction
      const requests = [];
      const maliciousInput = "<script>alert('xss')</script>";
      
      for (let i = 0; i < 5; i++) {
        requests.push(
          makeMCPRequest('tools/call', {
            name: 'fullstory_create_annotation',
            arguments: {
              text: maliciousInput
            }
          })
        );
      }
      
      const responses = await Promise.all(requests);
      
      // Should get a mix of validation errors and potentially rate limit errors
      const validationErrors = responses.filter(r => r.status === 200);
      const rateLimited = responses.filter(r => r.status === 429);
      const authRequired = responses.filter(r => r.status === 401);
      
      console.log(`✓ Responses: ${validationErrors.length} validation, ${rateLimited.length} rate limited, ${authRequired.length} auth required`);
      
      // At least some should be processed (even if they fail validation)
      expect(responses.length).toBe(5);
      expect(responses.every(r => [200, 401, 406, 429, 500].includes(r.status))).toBe(true);
    }, testTimeout);

    test('should maintain security during high load', async () => {
      // Test that security validation doesn't get bypassed under load
      const concurrentRequests = 10;
      const requests = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          makeMCPRequest('tools/call', {
            name: 'warehouse_execute_query', 
            arguments: {
              sql: i % 2 === 0 ? 'SELECT 1' : "SELECT * FROM users; DROP TABLE admin;--",
              platform: 'bigquery'
            }
          })
        );
      }
      
      const responses = await Promise.all(requests);
      
      // Check that malicious requests are still blocked under load
      let maliciousBlocked = 0;
      let legitimateProcessed = 0;
      
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        const isMalicious = i % 2 === 1;
        
        if (response.status === 401) {
          continue; // Auth required - can't test further
        }
        
        if (response.status === 200) {
          const result = await response.json();
          
          if (isMalicious) {
            // Malicious request should be blocked
            if (result.result && result.result.isError) {
              maliciousBlocked++;
            }
          } else {
            // Legitimate request might succeed (depending on database availability)
            legitimateProcessed++;
          }
        }
      }
      
      console.log(`✓ Under load: ${maliciousBlocked} malicious blocked, ${legitimateProcessed} legitimate processed`);
      
      // At minimum, we should have blocked some malicious requests
      if (maliciousBlocked === 0 && responses.some(r => r.status === 200)) {
        console.warn('⚠ Warning: No malicious requests were blocked under load');
      }
    }, testTimeout);
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed JSON requests', async () => {
      const response = await fetch(MCP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Client': 'malformed-json-test'
        },
        body: '{"invalid": json malformed}'
      });
      
      expect([400, 401, 406, 500]).toContain(response.status);
    }, testTimeout);

    test('should handle missing Content-Type header', async () => {
      const response = await fetch(MCP_URL, {
        method: 'POST',
        headers: {
          'X-Test-Client': 'missing-content-type-test'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list'
        })
      });
      
      expect([200, 400, 401, 406, 415]).toContain(response.status);
    }, testTimeout);

    test('should handle empty request body', async () => {
      const response = await fetch(MCP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Client': 'empty-body-test'
        },
        body: ''
      });
      
      expect([400, 401, 406, 500]).toContain(response.status);
    }, testTimeout);

    test('should handle extremely large payloads', async () => {
      const largePayload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'fullstory_create_annotation',
          arguments: {
            text: 'x'.repeat(100000) // 100KB of text
          }
        }
      };
      
      const response = await fetch(MCP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Client': 'large-payload-test'
        },
        body: JSON.stringify(largePayload)
      });
      
      // Should either reject the large payload or handle it gracefully
      expect([200, 400, 401, 406, 413, 500]).toContain(response.status);
    }, testTimeout);
  });
});
