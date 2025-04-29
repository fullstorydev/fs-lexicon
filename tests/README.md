# Lexicon Test Suite

> This document covers the test suite for the [Lexicon](../README.md) project - a multi-cloud serverless function that transforms and routes Fullstory data across multiple cloud platforms.

## Overview

This folder contains the test suite for the Lexicon project - a multi-cloud serverless function middleware that receives, transforms, and routes webhooks for various services.

The test suite follows a structured approach with unit tests for individual components and integration tests for end-to-end validation. It utilizes Jest as the testing framework and provides helper functions to make tests consistent and maintainable.

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

## Test Helpers

The `testHelpers.js` file provides reusable functions for tests:

- `createMockRequest(options)`: Creates a mock Express request object
- `createMockResponse()`: Creates a mock Express response object with Jest spies
- `createTestEventData(overrides)`: Creates standardized test event data
- `createWebhookPayload(eventType, overrides)`: Creates specific webhook payloads for different integrations
- `wait(ms)`: Utility for async testing to pause execution

## Running Tests

You can run tests using npm scripts defined in package.json:

```bash
# Run all tests
npm test

# Run specific test groups
npm run test:unit            # Run all unit tests
npm run test:integration     # Run all integration tests
npm run test:webhook         # Run webhookRouter tests
npm run test:webhook:base    # Run webhookBase tests
npm run test:connector:base  # Run connectorBase tests

# Run with additional options
npm run test:coverage        # Run with code coverage
npm run test:watch           # Run in watch mode
npm run test:verbose         # Run with verbose output
```

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

## Adding New Tests

When adding new tests, follow these guidelines:

1. **Use test helpers**: Leverage the helper functions in `testHelpers.js` for consistency
2. **Follow existing patterns**: Match the style of existing tests
3. **Mock external dependencies**: Don't make real API calls in tests
4. **Test both success and failure cases**: Verify error handling works correctly
5. **Keep tests focused**: Each test should verify a specific behavior

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

## Coverage Goals

For a good balance of reliability and maintenance effort, we aim for:

1. **80-90% coverage** for core code (WebhookBase, ConnectorBase)
2. **75-85% coverage** for the router and handlers
3. **Key integration tests** covering the main webhook paths

> **Note on Current Coverage:** As of April 16, 2025, the current test coverage metrics are:
> 
> - Statement Coverage: 22.88%
> - Branch Coverage: 18.93% 
> - Function Coverage: 22.62%
> - Line Coverage: 23.22%
>
> Some components like `WebhookBase` (96.49%) and `ConnectorBase` (91.89%) have excellent coverage, which aligns with our goals. However, many other components require additional test coverage.
>
> Contributors are encouraged to add tests when implementing new features or fixing bugs.

## Common Issues and Solutions

- **Failing tests due to timeouts**: Check for unresolved promises or missing async/await
- **Mock not being called**: Ensure the mock is properly set up and the correct instance is being used
- **Test order dependencies**: Make sure each test properly sets up its environment and doesn't depend on previous tests

## Contributing

When adding new tests:
1. Update this README if you add new test patterns or helpers
2. Ensure all tests pass before submitting changes
3. Include both positive and negative test cases