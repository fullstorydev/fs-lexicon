/**
 * Simple ESM test to verify our setup
 */

import { describe, it, expect } from '@jest/globals';

describe('ESM Test Setup', () => {
  it('should be able to run basic tests with ESM', () => {
    expect(true).toBe(true);
  });

  it('should be able to import ES modules', async () => {
    const { default: config } = await import('../../config.js');
    expect(config).toBeDefined();
    expect(typeof config.get).toBe('function');
  });

  it('should be able to import connectors', async () => {
    const { default: fullstoryConnector } = await import('../../Fullstory.js');
    expect(fullstoryConnector).toBeDefined();
    expect(fullstoryConnector.name).toBe('Fullstory');
  });

  it('should be able to import MCP modules', async () => {
    // Import the MCP main module - this tests that the module can be loaded
    // without throwing syntax errors, which is the main purpose of this test
    try {
      const mcpModule = await import('../../MCP/mcp-main.js');
      
      // At minimum, the module should be defined
      expect(mcpModule).toBeDefined();
      
      // Should have the main function exported
      expect(mcpModule.main).toBeDefined();
      expect(typeof mcpModule.main).toBe('function');
      
      // The test passes if we can import without errors and server doesn't start
      expect(true).toBe(true);
    } catch (error) {
      // If there's an import error, fail the test with a helpful message
      throw new Error(`Failed to import MCP module: ${error.message}`);
    }
  }, 5000); // Set timeout to 5 seconds to prevent hanging
});
