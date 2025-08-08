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
    const { main } = await import('../../MCP/mcp-main.js');
    expect(main).toBeDefined();
    expect(typeof main).toBe('function');
  });
});
