/**
 * Jest setup file for Lexicon test suite
 * 
 * This file runs before each test file
 */

// Set timezone for consistent date handling in tests
process.env.TZ = 'UTC';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce noise during tests

// Mock fetch for environments that don't have it
if (!global.fetch) {
  global.fetch = jest.fn(() => 
    Promise.resolve({
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      ok: true,
      status: 200
    })
  );
  global.Response = jest.fn();
  global.Headers = jest.fn();
  global.Request = jest.fn();
}