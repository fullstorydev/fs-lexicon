/**
 * Jest configuration for Lexicon test suite (ES Modules)
 */
export default {
  // Set the test environment (node for server-side code)
  testEnvironment: 'node',
  
  // Enable ES modules support
  preset: null,
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  
  // Transform configuration (no transforms for ESM)
  transform: {},
  
  // Set the root directory for tests
  rootDir: '../',
  
  // Tell Jest where to find test files
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  
  // Ignore certain directories
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.git/'
  ],
  
  // Automatically clear mock calls and instances between tests
  clearMocks: true,
  
  // Indicates whether each individual test should be reported during the run
  verbose: false,
  
  // Collect coverage information
  collectCoverage: false,
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**',
    '!**/jest.config.js',
  ],
  
  // Coverage directory and reporting formats
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  
  // Set a timeout for tests (in milliseconds)
  testTimeout: 30000,
  
  // For CI/CD integration
  reporters: [
    'default',
    process.env.CI === 'true' && ['jest-junit', {
      outputDirectory: '<rootDir>/test-results',
      outputName: 'junit.xml'
    }]
  ].filter(Boolean),
  
  // Jest will make calls to the global fetch
  setupFiles: ['<rootDir>/tests/jest.setup.js'],
  
  // Global setup and teardown
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
};