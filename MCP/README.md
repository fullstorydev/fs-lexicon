# Lexicon MCP Server

> Enterprise-grade Model Context Protocol server for FullStory, BigQuery, and Snowflake integration

## Overview

The Lexicon MCP Server is a modern, enterprise-ready implementation of the Model Context Protocol (MCP) that provides seamless integration with FullStory analytics, BigQuery, and Snowflake data warehouses. Built with the latest MCP SDK 1.13.0, it offers a declarative, type-safe API with comprehensive enterprise features.

## 🚀 Features

### Core Capabilities
- **Modern MCP SDK**: Built with MCP SDK 1.13.0 using declarative APIs
- **Multi-transport Support**: HTTP, Server-Sent Events (SSE), and stdio
- **Enterprise Session Management**: TTL, cleanup, metrics tracking
- **Security Middleware**: Rate limiting, authentication, authorization
- **Monitoring & Observability**: Metrics collection, health checks
- **Horizontal Scaling**: Clustered deployment support

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

#### 2. Warehouse Tools (BigQuery + Snowflake)
All warehouse tools are registered using an explicit, JSON Schema-based pattern. Every tool is platform-agnostic and leverages the Konbini.js abstraction layer for SQL generation, parameterization, and execution. This ensures consistent, maintainable, and extensible integration for BigQuery and Snowflake, with no legacy or custom registration logic.

- **Explicit Registration**: All warehouse tools use plain JSON Schema for input validation and are registered explicitly for MCP compliance.
- **Platform-Agnostic Logic**: SQL generation and query logic are handled by Konbini.js, supporting BigQuery and Snowflake out of the box and easily extensible for new platforms.
- **Comprehensive Tooling**: Includes query execution, table/schema exploration, health checks, and platform-specific SQL generation.
- **JSDoc Documentation**: All tools and parameters are documented with JSDoc for clarity and maintainability.

Example usage:
```javascript
// Generate SQL for a warehouse tool
const { sql, params } = konbini.quickQueries.generateQuery({
  queryType: 'list_tables',
  platform: 'bigquery',
  target: 'myproject.mydataset',
  limit: 100
});
const results = await googleCloud.bigQuery.createQueryJob(sql, params, { maxResults: 100 });
```

All tool endpoints in MCP now use this pattern for BigQuery and Snowflake, ensuring maintainability and cross-platform compatibility.

#### 3. System Tools
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
- Snowflake connection (optional)
- BigQuery credentials (optional)

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

# Snowflake Configuration
SNOWFLAKE_ACCOUNT=your_account
SNOWFLAKE_USERNAME=your_username
SNOWFLAKE_PASSWORD=your_password
SNOWFLAKE_DATABASE=your_database
SNOWFLAKE_SCHEMA=your_schema

# BigQuery Configuration
GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json
BIGQUERY_PROJECT_ID=your_project_id

# Server Configuration
MCP_SERVER_NAME=lexicon-mcp-enterprise
MCP_PORT=3000
MCP_HOST=0.0.0.0
```

## 🏗️ Architecture

### Hybrid Tool Registration
All tools are now registered using explicit JSON Schema-based registration. There is no auto-registration or legacy custom registration logic. This ensures full type safety, maintainability, and MCP compliance.

### Database Abstraction (Konbini.js)
Warehouse operations use the Konbini.js abstraction layer:

```javascript
// Platform-agnostic SQL generation
const adapter = konbini.warehouse.getAdapter({ databaseType: 'bigquery' });
const sql = adapter.generateSql('select', 'users', ['id', 'name'], {}, { active: true });
```

Supported platforms:
- **BigQuery**: Google Cloud's serverless data warehouse
- **Snowflake**: Cloud-native data platform

### Session Management
Enterprise-grade session management with:
- Configurable TTL and cleanup
- Session metrics and activity tracking
- Authentication and authorization
- Session limit enforcement


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

#### Warehouse Query
```javascript
// Execute platform-specific query
{
  \"name\": \"warehouse_execute_query\",
  \"arguments\": {
    \"sql\": \"SELECT COUNT(*) FROM users WHERE created_date >= '2024-01-01'\",
    \"platform\": \"snowflake\",
    \"limit\": 1000
  }
}
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
[2024-06-23T14:40:35.719Z] [INFO] [WarehouseTools] Warehouse tools registered
[2024-06-23T14:40:35.720Z] [INFO] [SystemTools] System tools registered
```



## 🛡️ SAFE_MODE

SAFE_MODE is a security feature that restricts tool access to a curated set of read-only and non-destructive operations for compliance and secure environments. When enabled (`SAFE_MODE=true`), only tools explicitly listed as safe in the codebase are available. Attempts to use restricted tools will return an error message.

- **How to Enable**: Set the environment variable `SAFE_MODE=true` in your deployment or `.env` file.
- **Where to Control**: SAFE_MODE logic and the list of safe tools are defined in the codebase (see `tools/fullstory-tools.js`, `tools/warehouse-tools.js`).
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

## 📄 License

MIT License - see LICENSE file for details.

---

**Built with ❤️ using the Model Context Protocol**
