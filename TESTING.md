# Comprehensive Testing Guide for Lexicon

This document describes the enhanced testing infrastructure for Lexicon, including comprehensive rate limiting tests.

## 📊 Test Suite Overview

### New Rate Limiting Tests

1. **`tests/comprehensive-rate-limiting.test.js`** - Complete unit tests for rate limiting functionality
2. **`tests/integration-rate-limiting.test.js`** - Integration tests against running servers
3. **`tests/enhanced-mcp-test.sh`** - Enhanced bash script testing MCP with rate limiting
4. **`tests/run-comprehensive-tests.js`** - Unified test runner for all test types

### Test Commands

```bash
# MCP Server for Testing (NEW - Recommended)
npm run test:server                         # Start MCP server with test configuration
npm run test:validate-server               # Validate test server configuration

# Security & MCP Tests
npm run test:mcp:auth                       # OAuth 2.1 authentication tests
npm run test:mcp:validation                 # Input validation tests  
npm run test:mcp:security                   # Security integration tests
npm run test:mcp:security:all               # All security tests combined

# Rate Limiting Tests
npm run test:rate-limiting                  # Unit tests with mocks
npm run test:rate-limiting:integration      # Integration tests (requires server)
npm run test:mcp:enhanced                   # Enhanced MCP bash script

# Comprehensive Testing
npm run test:comprehensive                  # All tests (detects running server)
npm run test:comprehensive:no-server        # Unit tests only

# Individual Test Categories
npm run test:unit                           # Jest unit tests
npm run test:integration                    # Integration tests
npm run test                                # Standard Jest tests
```

## 🚀 Quick Start: Testing Workflow (Recommended)

### 1. Terminal 1 - Start MCP Server
```bash
MCP_MODE=true npm start
```
This uses:
- ✅ Your existing `.env` file (real credentials and configuration)
- ✅ Default rate limits (increase if you hit 429 errors during testing)
- ✅ All your actual connectors (BigQuery, Snowflake, FullStory)
- ✅ MCP mode with full security features enabled

### 2. Terminal 2 - Run Tests
```bash
# Run full test suite (all 58+ tests)
npm run test:comprehensive

# Or run specific test categories
npm run test:mcp:security:all    # Security tests only
npm run test:unit                # Unit tests only
```

### 3. Optional: Rate Limit Overrides
If you encounter 429 rate limit errors during heavy testing:
```bash
# Terminal 1: Start with higher rate limits
TOOL_RATE_LIMIT_MAX_REQUESTS=2000 MCP_RATE_LIMIT_MAX_REQUESTS=3000 MCP_MODE=true npm start
```

## 🔐 Test Data Security & Configuration

### Environment-Based Test Configuration

All test scripts now use environment variables instead of hardcoded values to ensure:
- **Security**: No exposure of production IDs or sensitive data
- **Flexibility**: Each user can configure their own test data
- **CI/CD Compatibility**: Easy integration with automated testing environments

### Test Configuration Approach

**Simplified Configuration:**
1. **`.env`** - Your real configuration file (used as base)
2. **Environment overrides** - Test-specific settings via npm scripts
3. **`tests/test.env.example`** - Template for optional custom test data
4. **`tests/mcp-security.env.example`** - Security-specific test examples

### Test Override Settings

**Test server automatically sets:**
- ✅ **High rate limits** (`TOOL_RATE_LIMIT_MAX_REQUESTS=2000`, `MCP_RATE_LIMIT_MAX_REQUESTS=3000`)
- ✅ **Authentication disabled** (`MCP_AUTH_ENABLED=false`)
- ✅ **Test mode enabled** (`SKIP_REAL_DATA_TESTS=true`)
- ✅ **MCP mode enabled** (`MCP_MODE=true`)

### Setting Up Test Data

**No setup required!** The test server uses your real `.env` with safe overrides.

```bash
# Test configuration works immediately  
npm run test:server        # Uses your .env + test overrides

# Your real credentials + test-safe settings
# - Real BigQuery/Snowflake/FullStory configs
# - High rate limits for testing
# - Authentication disabled for unit tests
```

**What gets overridden for testing:**
- ✅ **Rate limits**: Relaxed to prevent 429 errors during test runs
- ✅ **Authentication**: Disabled for easier unit testing
- ✅ **External calls**: Flagged to skip real data operations when appropriate

### Required Test Data

For comprehensive testing, configure these variables:

```bash
# FullStory test data (replace with your own valid IDs)
TEST_FULLSTORY_USER_ID=your_test_user_id_here
TEST_FULLSTORY_SESSION_ID=your_test_session_id_here

# BigQuery test data (replace with your own project/dataset)
TEST_BIGQUERY_PROJECT_ID=your_bigquery_project_id_here
TEST_BIGQUERY_DATASET=your_test_dataset_here
TEST_BIGQUERY_TABLE=your_test_table_here

# Optional: Skip tests requiring real data
SKIP_REAL_DATA_TESTS=true
```

### Security Best Practices

✅ **Safe Defaults**: Scripts use demo/placeholder values if no configuration is provided
✅ **No Hardcoded IDs**: All sensitive data moved to environment variables
✅ **Gitignored Config**: `test.env` files are excluded from version control
✅ **Optional Real Data**: Tests can run without real FullStory/BigQuery data
✅ **CI/CD Ready**: Easy to configure in automated environments

## 🧪 Rate Limiting Test Coverage

### Unit Tests (`comprehensive-rate-limiting.test.js`)

✅ **Comprehensive Coverage**:
- **General Rate Limiting**: Basic HTTP endpoint protection
- **Webhook Rate Limiting**: Webhook-specific limits and behavior
- **MCP Rate Limiting**: Both HTTP-level and tool-level rate limiting
- **Client Tracking**: Per-IP rate limit tracking
- **Rate Limit Headers**: Standard `X-RateLimit-*` headers
- **Configuration Integration**: Proper config system usage
- **Edge Cases**: Error handling and recovery

✅ **Test Features**:
- Mock-based testing (no server required)
- Simulated rate limiting with in-memory storage
- Multiple client simulation
- Rate limit header validation
- Error response format validation

### Integration Tests (`integration-rate-limiting.test.js`)

✅ **Real Server Testing**:
- **Main Lexicon**: Tests against actual Lexicon server
- **MCP Mode**: Tests against actual MCP server
- **HTTP Rate Limiting**: Real network request rate limiting
- **Tool Rate Limiting**: Actual MCP tool call limiting
- **Recovery Testing**: Rate limit window reset validation
- **Header Validation**: Real rate limit headers

✅ **Integration Features**:
- Tests against running servers
- Real network requests
- Actual rate limiting behavior
- Server health checking
- Multi-endpoint testing

### Enhanced MCP Script (`enhanced-mcp-test.sh`)

✅ **Comprehensive MCP Testing**:
- **Server Availability**: Health checks for both Lexicon and MCP
- **Rate Limiting Tests**: HTTP and tool-level rate limiting
- **Standard MCP Protocol**: tools/list, tools/call validation
- **Tool Sampling**: Representative tools from each category
- **Rate Limit Recovery**: Reset behavior validation
- **Colorized Output**: Clear pass/fail indicators

✅ **Script Features**:
- Bash-based testing with curl
- JSON response parsing
- Rate limit detection
- Test result tracking
- Color-coded output

## 🔧 Test Runner (`run-comprehensive-tests.js`)

### Features

✅ **Unified Testing**:
- Runs all test types in sequence
- Automatic server management
- Comprehensive reporting
- Parallel execution where appropriate

✅ **Server Management**:
- Automatically starts test server when needed
- Health checking with retries
- Graceful shutdown
- Background process management

✅ **Command Line Options**:
```bash
# Skip server-dependent tests
npm run test:comprehensive:no-server

# Filter specific test types
node ./tests/run-comprehensive-tests.js --test=rate-limiting

# Manual server control
node ./tests/run-comprehensive-tests.js --skip-server
```

✅ **Reporting**:
- Real-time progress indicators
- Detailed timing information
- Pass/fail/skip categorization
- Color-coded output

## 📋 Test Results Status

### ✅ Working Tests

1. **Rate Limiting Unit Tests**: All 15 tests passing
   - General rate limiting middleware
   - Webhook-specific rate limiting
   - MCP HTTP and tool-level rate limiting
   - Client tracking and headers
   - Configuration validation

2. **Enhanced MCP Script**: Functional and comprehensive
   - Server availability checks
   - Rate limiting validation
   - MCP protocol compliance
   - Tool sampling tests

3. **Test Runner Infrastructure**: Operational
   - Server management
   - Test orchestration
   - Comprehensive reporting

### ⚠️ Known Issues

1. **Existing Unit Tests**: ESM compatibility issues
   - Some tests use CommonJS syntax
   - Jest configuration needs ESM updates
   - Mock patterns need modernization

2. **Integration Test Dependencies**: 
   - Requires running servers
   - Network-dependent tests
   - Environment configuration needed

## 🚀 Usage Examples

### Quick Rate Limiting Test

```bash
# Test rate limiting without starting servers
npm run test:rate-limiting
```

### Full Integration Testing

```bash
# Start server and run all tests
npm run test:comprehensive
```

### MCP-Specific Testing

```bash
# Start MCP server first
npm run start:mcp &

# Run enhanced MCP tests
npm run test:mcp:enhanced
```

### Development Testing

```bash
# Test only units (no server needed)
npm run test:comprehensive:no-server
```

## 🔍 Test Validation

### Rate Limiting Validation

The tests validate:

✅ **HTTP-Level Rate Limiting**:
- Request counting per client
- Rate limit headers
- 429 status responses
- Retry-After headers

✅ **Tool-Level Rate Limiting**:
- MCP tool call limiting
- Tool-specific error responses
- Rate limit integration in dispatcher

✅ **Configuration Integration**:
- Environment variable usage
- Different limits per endpoint type
- Storage backend configuration

✅ **Real-World Scenarios**:
- Multiple clients
- Concurrent requests
- Rate limit recovery
- Error handling

## 📚 Adding New Tests

### For Rate Limiting Features

1. **Unit Tests**: Add to `comprehensive-rate-limiting.test.js`
2. **Integration Tests**: Add to `integration-rate-limiting.test.js`
3. **MCP Tests**: Update `enhanced-mcp-test.sh`

### For Other Features

1. Follow existing patterns in `tests/unit/`
2. Use the enhanced test runner for comprehensive testing
3. Add appropriate npm scripts to `package.json`

## 🎯 Future Enhancements

### Planned Improvements

1. **ESM Migration**: Update existing tests to full ESM compatibility
2. **Performance Testing**: Add rate limiting performance benchmarks
3. **Load Testing**: High-volume rate limiting validation
4. **Redis Testing**: Distributed rate limiting validation
5. **Docker Testing**: Container-based test environments

### Test Automation

1. **CI/CD Integration**: GitHub Actions workflows
2. **Automated Reporting**: Test result notifications
3. **Performance Monitoring**: Rate limiting metrics tracking
4. **Regression Testing**: Automated rate limiting validation

## 📖 Related Documentation

- **[RATE_LIMITING.md](./RATE_LIMITING.md)** - Complete rate limiting documentation
- **[rate-limiting.env.example](./rate-limiting.env.example)** - Configuration examples
- **[README.md](./README.md)** - Main project documentation
- **[MCP/README.md](./MCP/README.md)** - MCP-specific documentation

---

The comprehensive testing infrastructure ensures that rate limiting functionality works correctly across all Lexicon components and deployment scenarios.
