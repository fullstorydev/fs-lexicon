# Lexicon MCP Server

> Enterprise-grade Model Context Protocol server for FullStory integration

## Overview

The Lexicon MCP Server is a modern, enterprise-ready implementation of the Model Context Protocol (MCP) that provides seamless integration with FullStory analytics. Built with the latest MCP SDK 1.13.0, it offers a declarative, type-safe API with comprehensive enterprise features.

## 🚀 Features

### Core Capabilities
- **Modern MCP SDK**: Built with MCP SDK 1.13.0 using declarative APIs
- **Multi-transport Support**: HTTP, Server-Sent Events (SSE), and stdio
- **Enterprise Security**: OAuth 2.1 authentication + comprehensive input validation
- **SAFE_MODE Security**: Read-only tool access for compliance environments
- **Enterprise Rate Limiting**: HTTP and tool-level rate limiting with Redis clustering
- **Comprehensive Tool Coverage**: 29 enterprise-grade tools across FullStory and system diagnostics
- **Monitoring & Observability**: Health checks and system diagnostics
- **Container Ready**: Docker support with proper signal handling

### Security Features
- **OAuth 2.1 Authentication**: MCP-compliant authentication with PKCE (disabled by default)
- **Input Validation**: Comprehensive protection against SQL injection, XSS, path traversal, and command injection
- **Token Audience Binding**: Prevents confused deputy attacks and token passthrough
- **Authorization Server Discovery**: RFC-compliant metadata and discovery endpoints
- **Security Monitoring**: Detailed logging and alerting for security events

### Tool Categories

#### 1. FullStory Tools
All FullStory tools are now registered using an explicit, stateless MCP handler pattern with plain JSON Schema. Every FullStory server API (v1 and v2) is covered as a tool, including sessions, users, events, segments, analytics, and health endpoints. All schemas are documented with extensive JSDoc comments for every tool and parameter, ensuring clarity and maintainability.

- **Comprehensive Coverage**: Every FullStory API is available as a tool, including create, read, update, delete, batch, and analytics operations.
- **Spec-Compliant Registration**: All tools use explicit JSON Schema for input validation and are MCP-compliant.
- **JSDoc Documentation**: Each tool and parameter is documented with JSDoc, providing clear usage guidance and expected behavior.
- **SAFE_MODE Support**: When SAFE_MODE is enabled (`SAFE_MODE=true` in environment), only read-only and non-destructive tools are available. Attempts to use restricted tools will return an error. The list of safe tools is maintained in the code and includes profile, session, analytics, and health endpoints. This is ideal for compliance and secure environments.

Example SAFE_MODE configuration:
```bash
SAFE_MODE=true # Only safe/read-only tools are enabled
```

To control SAFE_MODE, set the environment variable in your deployment or `.env` file. See the code for the current list of safe tools.

- Session management (events, summaries, links, search)
- User operations (create, read, update, delete, batch)
- Event operations (create, batch, webhooks)
- Export operations (segments, status)
- Data retrieval (user events, pages, journeys)
- Advanced analytics and health check tools


#### 2. System Tools
All system tools are registered using the same explicit, JSON Schema-based pattern for clarity and future-proofing.

- `system_health_check` - Complete system health diagnostics
- `system_get_metrics` - Performance and usage metrics
- `system_get_status` - System configuration and status
- `system_get_service_registry` - Service registry status
- `system_get_logs` - System logs

### Resources
- **User Resources**: Dynamic user profiles with templates
- **Analytics Resources**: Dashboard data and session analytics

### Prompts
- **Analysis Prompts**: User behavior and session analysis templates

## 📦 Installation & Setup

### Prerequisites
- Node.js ≥ 20
- Valid FullStory API credentials

### Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Start the server**:
   ```bash
   npm run start:mcp
   ```

### Configuration

Key environment variables:

```bash
# FullStory Configuration
FULLSTORY_API_KEY=your_api_key
FULLSTORY_ORG_ID=your_org_id


# Server Configuration
MCP_SERVER_NAME=lexicon-mcp-enterprise
MCP_PORT=3000
MCP_HOST=0.0.0.0

# Rate Limiting Configuration
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MCP_MAX_REQUESTS=30         # HTTP requests per minute
RATE_LIMIT_TOOL_MAX_REQUESTS=20        # Tool calls per minute
RATE_LIMIT_USE_REDIS=false             # Use Redis for distributed limiting

# Security Configuration (Optional)
MCP_AUTH_ENABLED=false                 # OAuth 2.1 authentication (disabled by default)
MCP_AUTH_SERVER_URL=                   # Authorization server URL
MCP_SERVER_CANONICAL_URI=              # This server's canonical URI
MCP_AUTH_CLIENT_ID=                    # OAuth client ID
SAFE_MODE=false                        # Restrict to read-only tools
```

### Authentication Configuration (Optional)

By default, **authentication is disabled** - users should handle authentication at the infrastructure level (IAM, VPCs, firewalls). OAuth 2.1 authentication can be optionally enabled for standards-compliant API access:

```bash
# Enable OAuth 2.1 authentication
export MCP_AUTH_ENABLED=true
export MCP_AUTH_SERVER_URL=https://auth.example.com
export MCP_SERVER_CANONICAL_URI=https://mcp.example.com
export MCP_AUTH_CLIENT_ID=your-client-id

# Optional: Enable dynamic client registration
export MCP_AUTH_ALLOW_DYNAMIC_REGISTRATION=true
```

When enabled, the server provides OAuth 2.1 discovery endpoints:
- `/.well-known/oauth-protected-resource` - Protected resource metadata (RFC 9728)
- `/.well-known/oauth-authorization-server` - Authorization server metadata (RFC 8414)

### Input Validation (Always Active)

Input validation runs automatically for all tools and cannot be disabled. It protects against:
- XSS vulnerabilities in all text inputs
- Path traversal attempts in file-related parameters
- Command injection in system operations
- Command injection in system tools
- Schema bypass attempts

Production environments automatically enable stricter validation rules that block dangerous SQL operations.

## 🏗️ Architecture

### Hybrid Tool Registration
All tools are now registered using explicit JSON Schema-based registration. There is no auto-registration or legacy custom registration logic. This ensures full type safety, maintainability, and MCP compliance.


### Security Architecture
The MCP server implements defense-in-depth security with multiple layers:

#### Infrastructure Level (Recommended Primary)
- **Cloud IAM**: Use cloud provider IAM for primary authentication
- **Network Security**: VPC restrictions, firewalls, load balancer authentication
- **TLS/HTTPS**: Encrypted communication for all endpoints

#### Application Level (Optional OAuth 2.1)
- **OAuth 2.1 with PKCE**: Standards-compliant authentication (disabled by default)
- **Token Audience Binding**: Prevents token passthrough and confused deputy attacks
- **Authorization Server Discovery**: RFC 9728/8414 compliant metadata endpoints
- **Dynamic Client Registration**: Automated client setup (RFC 7591)

#### Input Security (Always Active)
- **SQL Injection Protection**: Pattern detection and query sanitization
- **XSS Prevention**: HTML/JavaScript sanitization and encoding
- **Path Traversal Blocking**: Directory traversal attack prevention
- **Command Injection Detection**: System command execution prevention
- **Schema Validation**: Strict JSON schema enforcement with length limits

#### Operational Security
- **SAFE_MODE**: Restricts access to read-only tools when enabled
- **Rate Limiting**: Multi-tier protection against abuse with HTTP and tool-level limits
- **Security Monitoring**: Comprehensive logging and alerting for security events
- **Environment-based Configuration**: Secure credential management through environment variables


### Tool Examples

#### FullStory User Analytics
```javascript
// Get comprehensive user profile
{
  \"name\": \"fullstory_get_user_profile\",
  \"arguments\": {
    \"userId\": \"user123\",
    \"includeAnalytics\": true,
    \"includeSegments\": true
  }
}
```

```

#### System Health Check
```javascript
// Complete system diagnostics
{
  \"name\": \"system_health_check\",
  \"arguments\": {
    \"includeMetrics\": true,
    \"checkConnections\": true
  }
}
```

## 📊 Monitoring

### Health Endpoints
- `GET /health` - Basic health check
- `GET /metrics` - Prometheus-compatible metrics
- `GET /status` - Detailed system status

### Metrics
The server collects comprehensive metrics:
- Tool execution counts and latency
- Session management statistics
- Connection health and performance
- Error rates and types

### Logging
Structured logging with multiple levels:
```bash
[2024-06-23T14:40:35.717Z] [INFO] [FullStoryTools] Auto-registered 23 CRUD methods
[2024-06-23T14:40:35.720Z] [INFO] [SystemTools] System tools registered
```



## 🛡️ SAFE_MODE

SAFE_MODE is a security feature that restricts tool access to a curated set of read-only and non-destructive operations for compliance and secure environments. When enabled (`SAFE_MODE=true`), only tools explicitly listed as safe in the codebase are available. Attempts to use restricted tools will return an error message.

- **How to Enable**: Set the environment variable `SAFE_MODE=true` in your deployment or `.env` file.
- **Where to Control**: SAFE_MODE logic and the list of safe tools are defined in the codebase (see `tools/fullstory-tools.js`).
- **Affected Tools**: Only tools listed in the `SAFE_TOOL_NAMES` arrays in each tool file are available. These typically include:
  - Profile and session retrieval
  - Analytics and health checks
  - Read-only data access
- **Intended Use**: SAFE_MODE is ideal for compliance, audit, and environments where write or destructive operations must be restricted.

Example configuration:
```bash
SAFE_MODE=true # Enable SAFE_MODE for secure, read-only operation
```

If you attempt to use a restricted tool in SAFE_MODE, the server will return an error indicating the tool is not available.

## 🛡️ Rate Limiting

The MCP server includes enterprise-grade rate limiting to protect against abuse and ensure fair resource usage.

### MCP-Specific Rate Limiting

The MCP mode implements two levels of rate limiting:

1. **HTTP Level**: Protects MCP endpoints (`/mcp`, `/health`, `/status`, `/metrics`)
2. **Tool Level**: Protects individual tool executions within the MCP protocol

### Configuration

```bash
# Enable/disable rate limiting
RATE_LIMIT_ENABLED=true

# MCP HTTP endpoint limits
RATE_LIMIT_MCP_WINDOW_MS=60000         # 1 minute window
RATE_LIMIT_MCP_MAX_REQUESTS=30         # 30 HTTP requests per minute

# Tool execution limits
RATE_LIMIT_TOOL_WINDOW_MS=60000        # 1 minute window
RATE_LIMIT_TOOL_MAX_REQUESTS=20        # 20 tool calls per minute

# Storage backend (Redis recommended for production)
RATE_LIMIT_USE_REDIS=true
RATE_LIMIT_REDIS_URL=redis://redis-cluster:6379
```

### Rate Limiting Behavior

When rate limits are exceeded:

**HTTP Level**: Returns 429 status with retry-after headers:
```json
{
  "success": false,
  "error": "Rate limit exceeded", 
  "message": "Too many requests, please try again later.",
  "rateLimitInfo": {
    "limit": 30,
    "remaining": 0,
    "resetTime": 1234567890,
    "retryAfter": 60
  }
}
```

**Tool Level**: Returns MCP error response:
```json
{
  "content": [{
    "type": "text",
    "text": "Rate limit exceeded for tool \"toolname\". Please try again in 45 seconds."
  }],
  "isError": true
}
```

### Production Recommendations

For high-volume AI agent deployments:

```bash
# Conservative limits for production
RATE_LIMIT_MCP_MAX_REQUESTS=100        # Adjust based on your traffic
RATE_LIMIT_TOOL_MAX_REQUESTS=50        # Adjust based on AI agent usage

# Use Redis for distributed instances
RATE_LIMIT_USE_REDIS=true
RATE_LIMIT_REDIS_URL=redis://your-redis-cluster:6379

# Trust proxy headers if behind load balancer
RATE_LIMIT_TRUST_PROXY=true
```

For complete rate limiting documentation, see [RATE_LIMITING.md](../RATE_LIMITING.md) in the main project.

## 📚 Documentation

### Security & Authentication
- **[Security Overview](./SECURITY.md)** - Comprehensive security architecture, hardening recommendations, and incident response procedures
- **[Authentication Guide](./auth/README.md)** - OAuth 2.1 authentication configuration, standards compliance, and troubleshooting
- **[Input Validation](./validation/README.md)** - Input validation and sanitization system protecting against injection attacks

### Key Security Features

#### 🔒 Authentication (Disabled by Default)
- OAuth 2.1 with PKCE implementation following MCP specification 2025-06-18
- Authorization server discovery and metadata endpoints (RFC 9728, RFC 8414)
- Token audience binding to prevent confused deputy attacks
- Dynamic client registration support (RFC 7591)
- Comprehensive security logging and monitoring

**Why disabled by default?** We recommend handling authentication at the infrastructure level (IAM, VPCs, firewalls) for most deployments. OAuth 2.1 authentication is available when you need standards-compliant API access or third-party client integration.

#### 🛡️ Input Validation (Always Active)
- SQL injection protection with pattern detection and query sanitization
- XSS prevention through HTML/JavaScript sanitization
- Path traversal blocking to prevent directory access attacks
- Command injection detection for system security
- JSON schema validation with configurable length limits
- Production-specific restrictions on dangerous operations

#### 📊 Security Monitoring
- Real-time security event logging
- Authentication success/failure tracking
- Input validation failure pattern analysis
- Rate limit monitoring and alerting
- Comprehensive audit trails for compliance

### Getting Started with Security

1. **Default Secure Setup** (Recommended)
   ```bash
   # Authentication handled at infrastructure level
   # Input validation active automatically
   npm run start:mcp
   ```

2. **Enable OAuth 2.1 Authentication**
   ```bash
   export MCP_AUTH_ENABLED=true
   export MCP_AUTH_SERVER_URL=https://your-auth-server.com
   export MCP_SERVER_CANONICAL_URI=https://your-mcp-server.com
   npm run start:mcp
   ```

3. **High Security Mode**
   ```bash
   export MCP_AUTH_ENABLED=true
   export SAFE_MODE=true  # Read-only tools only
   export NODE_ENV=production  # Stricter validation
   npm run start:mcp
   ```

## 📄 License

MIT License - see LICENSE file for details.

---

