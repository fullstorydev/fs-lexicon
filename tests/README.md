# Developer Guide: Writing Tests for Lexicon

> **👀 Looking to run tests?** See **[TESTING.md](../TESTING.md)** for the comprehensive testing guide.  
> **This document** focuses on how to write and contribute tests to the Lexicon project.

## 🎯 Purpose

This guide covers **writing and contributing tests** for the [Lexicon](../README.md) project. The test suite is fully **ESM-compatible** with comprehensive coverage including rate limiting, security, and integration testing.

**Test Architecture:**
- ✅ **ES Modules**: All tests use modern `import`/`export` syntax
- ✅ **Jest + ESM**: Uses `jest.unstable_mockModule()` patterns
- ✅ **Multi-layer Testing**: Unit, integration, and bash script tests
- ✅ **Zero Process Leaks**: Clean teardown and worker management

## Test Structure

```
tests/
├── unit/                     # Unit tests for individual components
│   ├── webhookBase.test.js   # Tests for the WebhookBase class
│   ├── connectorBase.test.js # Tests for the ConnectorBase class
│   └── webhookRouter.test.js # Tests for the webhook router
├── integration/              # Integration tests
│   └── webhook.integration.test.js # End-to-end tests for webhook flows
├── jest.config.js            # Jest configuration
├── jest.setup.js             # Test setup that runs before each test file
├── globalSetup.js            # Global setup that runs once before all tests
├── globalTeardown.js         # Global teardown that runs once after all tests
├── testHelpers.js            # Common test utilities and factories
└── README.md                 # This file
```

## Key Components Tested

### Core Classes

- **WebhookBase**: Base class for webhook handlers that provides common utilities for field validation, data extraction, and error handling.
- **ConnectorBase**: Base class for service connectors that provides initialization, config validation, and retry functionality.
- **WebhookRouter**: Express router that handles various webhook endpoints (Slack, Fusion, GoogleSheets, etc.)

### Security Systems (New)

- **MCP Authentication**: OAuth 2.1 authentication system with PKCE, token validation, and authorization server discovery
- **Input Validation**: Comprehensive input validation and sanitization protecting against SQL injection, XSS, path traversal, and command injection
- **Security Integration**: End-to-end testing of authentication and validation working together under various conditions

## Test Helpers

The `testHelpers.js` file provides reusable functions for tests:

- `createMockRequest(options)`: Creates a mock Express request object
- `createMockResponse()`: Creates a mock Express response object with Jest spies
- `createTestEventData(overrides)`: Creates standardized test event data
- `createWebhookPayload(eventType, overrides)`: Creates specific webhook payloads for different integrations
- `wait(ms)`: Utility for async testing to pause execution

## Running Tests While Developing

> **💡 Tip**: For comprehensive test running, see **[TESTING.md](../TESTING.md)**

Quick commands for **test-driven development**:

```bash
# Watch mode for TDD
npm run test:watch           # Auto-rerun tests on file changes
npm run test:coverage        # Run with code coverage report
npm run test:verbose         # Detailed test output

# Target specific components while developing
npm run test:unit            # All unit tests (ESM-compatible)
npm run test:webhook         # WebhookRouter tests  
npm run test:webhook:base    # WebhookBase tests
npm run test:connector:base  # ConnectorBase tests

# Security testing (New)
npm run test:mcp:auth        # OAuth 2.1 authentication tests
npm run test:mcp:validation  # Input validation and sanitization tests
npm run test:mcp:security    # Security integration tests (requires server)
npm run test:mcp:security:all # All security tests in sequence
```

**ESM Development:**
All tests use modern ES modules with Jest's experimental VM modules support.

**Security Testing:**
Security tests include comprehensive coverage of authentication and input validation systems. Configure test environment by copying `tests/mcp-security.env.example` to `tests/test.env`.

## Test Patterns

### Unit Tests

Unit tests focus on testing individual functions and classes in isolation. External dependencies are mocked to ensure tests are reliable and fast.

Example pattern for testing webhook handlers:
1. Mock dependencies (webhookBase, external services)
2. Create test request with appropriate payload
3. Call the handler function directly
4. Assert expected behavior (API calls, response status, logging)

### Integration Tests

Integration tests verify that components work together correctly. They test the complete flow from HTTP request to response.

Example pattern for webhook integration tests:
1. Set up a test Express app with the webhook router
2. Mock external services but allow internal components to interact
3. Send HTTP requests to endpoints
4. Assert correct responses and that the right service calls were made

## Adding New Tests (ESM Style)

### **ESM Test Template**
```javascript
import { jest } from '@jest/globals';

// Mock dependencies BEFORE imports
jest.unstable_mockModule('../../dependency.js', () => ({
  default: jest.fn(),
  someMethod: jest.fn()
}));

// Import after mocks
const { default: YourModule } = await import('../../YourModule.js');
const { default: dependency } = await import('../../dependency.js');

describe('YourModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should do something', async () => {
    // Test implementation
  });
});
```

### **Guidelines for New Tests**

1. **🎯 Use ESM patterns**: Always use `jest.unstable_mockModule()` and `await import()`
2. **🛠️ Leverage test helpers**: Use functions from `testHelpers.js` for consistency  
3. **🎭 Mock external dependencies**: No real API calls in tests
4. **✅ Test success + failure**: Verify both happy path and error handling
5. **🔍 Keep tests focused**: Each test should verify one specific behavior
6. **🧹 Clean up**: Use `beforeEach(() => jest.clearAllMocks())` to prevent test bleed

## Testing Base Classes

The WebhookBase and ConnectorBase tests serve as a foundation for testing derived classes. When you create a new webhook handler or connector:

1. Extend the appropriate base class
2. Implement required methods
3. Leverage the base class tests as a reference for what should be tested

## Mocking Strategy

The test suite uses Jest's mocking capabilities:

- Service dependencies (Slack, Fullstory, etc.) are mocked at the module level
- Express is partially mocked to allow testing route configuration
- Configuration is mocked to provide consistent test values

## Coverage Goals & ESM Testing Patterns

### **Coverage Targets**
- **80-90% coverage** for core classes (WebhookBase, ConnectorBase)
- **75-85% coverage** for routers and handlers  
- **Comprehensive integration tests** for main webhook flows

### **ESM Testing Patterns**

**Modern Mock Setup:**
```javascript
import { jest } from '@jest/globals';

// Use jest.unstable_mockModule for ESM
jest.unstable_mockModule('../../module.js', () => ({
  default: jest.fn(),
  namedExport: jest.fn()
}));

// Import after mocks
const { default: Module } = await import('../../module.js');
```

**Async Import Pattern:**
```javascript
describe('Component Tests', () => {
  let Component;
  
  beforeAll(async () => {
    Component = await import('../../Component.js');
  });
});
```

## Common Issues and Solutions

- **Failing tests due to timeouts**: Check for unresolved promises or missing async/await
- **Mock not being called**: Ensure the mock is properly set up and the correct instance is being used
- **Test order dependencies**: Make sure each test properly sets up its environment and doesn't depend on previous tests
- **Jest hanging after tests complete**: This is caused by open handles (timers, fetch mocks, etc.). The MCP test commands now include `--forceExit` to prevent hanging. If you see "Jest did not exit one second after the test run has completed", use Ctrl+C or run individual tests with `--forceExit`

## 🚀 Test Server Management

### Simple Two-Terminal Approach

For **running tests against a live server**:

```bash
# Terminal 1: Start MCP server with your real configuration
MCP_MODE=true npm start                # Uses your .env file

# Terminal 2: Run tests
npm run test:comprehensive             # Full test suite
```

### What This Approach Provides

✅ **Real Configuration**: Uses your actual `.env` file and credentials  
✅ **Full MCP Features**: Authentication system + input validation enabled  
✅ **Default Rate Limits**: Reasonable limits (increase if needed during heavy testing)  
✅ **All Connectors**: FullStory with real configurations  
✅ **Auto-Detection**: Test runner detects your running server automatically  

### Rate Limit Adjustments

If tests hit rate limits (429 errors), restart with higher limits:
```bash
# Terminal 1: Higher limits for heavy testing
TOOL_RATE_LIMIT_MAX_REQUESTS=2000 MCP_RATE_LIMIT_MAX_REQUESTS=3000 MCP_MODE=true npm start
```

## 📖 Documentation Guide

### **This File (`tests/README.md`)** - Developer Guide
- 🛠️ **How to write tests** for Lexicon
- 🎯 **ESM patterns and templates** for contributors
- 🔧 **Test helpers and utilities** documentation
- 📚 **Best practices** for test development

### **Root `TESTING.md`** - User Guide  
- ⚡ **How to run tests** (comprehensive test suite)
- 🔐 **Test data security** and environment configuration
- 🧪 **Rate limiting tests** and integration testing
- 🚀 **CI/CD commands** and production testing

## Contributing to Tests

**When writing new tests:**
1. ✅ Follow ESM patterns shown in this guide
2. ✅ Use test helpers from `testHelpers.js` 
3. ✅ Include both success and error test cases
4. ✅ Ensure all tests pass: `npm run test:unit`

**When updating test infrastructure:**
1. Update **this file** for new developer patterns
2. Update **`TESTING.md`** for new test commands or security features
3. Keep both files focused on their specific audiences