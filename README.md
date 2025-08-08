# Lexicon - Multi-Cloud Serverless Function

<div align="center">

*A flexible serverless middleware for data transformation and routing across multiple cloud platforms*

</div>


## 📦 ES Module Migration

Lexicon has fully migrated from CommonJS to modern ECMAScript Modules (ESM). All source files now use `import`/`export` syntax, and connectors (such as `Fullstory.js`) are implemented as ES Modules. Please ensure your environment and tooling support ESM (Node.js ≥ 14, preferably 18+).

**Key changes:**
- All imports use `import ... from ...` (no `require()`).
- All exports use `export`/`export default`.
- Example usage:
  ```js
  import fullstoryConnector from './Fullstory.js';
  ```
- No legacy CommonJS (`module.exports` or `require`) remains in the codebase.

## 🚀 Quick Start

```bash
# Clone the repository
git clone [repository-url]

# Install dependencies
npm install

# Standard webhook processing mode
export CLOUD_PROVIDER=GCP  # Options: GCP, AZURE, AWS
export NODE_ENV=development
npm start

# MCP mode for AI agent integration
npm run start:mcp           # Start MCP server locally

# Local development
npm run docker:build
npm run docker:run:env
```

## 📋 Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [MCP Integration](#mcp-integration-optional)
- [Design Patterns](#design-patterns)
- [Service Registry](#service-registry)
- [Startup Sequence](#startup-sequence)
- [Service Connectors](#service-connectors)
- [Configuration](#configuration)
  - [Configuration System Architecture](#configuration-system-architecture)
  - [Using Configuration in Connectors](#using-configuration-in-connectors)
- [Deployment](#deployment)
- [Local Development](#local-development)
- [Testing](#testing)
- [Security Configuration](#security-configuration-mcp-mode)
- [Contributing](#contributing)

## 📚 Overview

Lexicon is a multi-cloud serverless middleware that processes data and routes it to various destinations. It serves as an intermediary layer between data sources and downstream services, transforming and enriching data along the way. While it includes comprehensive FullStory integration capabilities, it's designed as a flexible platform that can work with any data source.

### 📖 Documentation Structure

The project includes comprehensive documentation:

```bash
# View main README for overall architecture and setup
cat README.md

# View MCP-specific documentation  
cat MCP/README.md

# View Terraform deployment template
cat terraform-blueprint.tf
```

**Key Documentation Files**:
- `README.md` - Main project documentation and architecture
- `MCP/README.md` - MCP server features, API, and security
- `terraform-blueprint.tf` - Infrastructure deployment template

**Key Benefits:**
- **Multi-Cloud Deployment**: Single codebase deployable to GCP, Azure, or AWS
- **Automatic Cloud Detection**: Seamless cloud provider detection and adaptation
- **Flexible Webhook Routing**: Comprehensive routing system for data transformation
- **Enterprise MCP Integration**: Production-ready Model Context Protocol server
- **Infrastructure as Code**: Terraform-managed secure deployments
- **Multiple Security Levels**: From development to production-grade security
- **Comprehensive Connector Ecosystem**: Third-party integrations and data pipelines
- **Optional MCP integration** for AI agent capabilities (when needed)

## ✨ Features

### Core Platform Features
- **Multi-Cloud Deployment**: Deploy the same code to Google Cloud, Azure, or AWS
- **Webhook Processing**: Handle webhook events and route them appropriately
- **Service Integrations**: Connect with Slack, JIRA, BigQuery, Snowflake, FullStory, and more
- **Database Abstraction**: Work with multiple database backends through a common interface
- **Robust Configuration**: Type-safe configuration with environment-specific settings
- **Service Registry**: Centralized service management with dependency injection
- **Controlled Startup Sequence**: Phased initialization to prevent circular dependencies
- **Comprehensive Logging**: Structured logging with redaction of sensitive information
- **Docker Support**: Run in containers locally or in production environments

### MCP Server Features (Optional)
- **Model Context Protocol Compliance**: Built with MCP SDK 1.13.0
- **HTTP Transport**: Express.js server with JSON-RPC over HTTP
- **Unified Tool Dispatcher**: Single routing system for all tool categories
- **Container Support**: Docker-ready with Cloud Build integration
- **Signal Handling**: Graceful shutdown and error handling
- **Environment Configuration**: Configurable via environment variables

## 🏗️ Infrastructure as Code - Terraform Blueprint

Lexicon includes a comprehensive Terraform blueprint (`terraform-blueprint.tf`) that provides a complete infrastructure template for deploying Lexicon services on Google Cloud Platform with enterprise-grade security and scalability.

### Blueprint Features

The Terraform blueprint includes:

- **Complete Cloud Run Deployment**: Both main Lexicon service and optional MCP server
- **Security Best Practices**: Service accounts, IAM bindings, and secret management
- **Scalability Configuration**: Auto-scaling, resource limits, and health checks
- **Multi-Environment Ready**: Easily customizable for dev, staging, and production
- **Secret Management Integration**: Google Secret Manager for secure credential storage

### Quick Setup

1. **Review the blueprint**:
   ```bash
   # The blueprint is located at the root of the project
   cat terraform-blueprint.tf
   ```

2. **Customize for your environment**:
   ```bash
   # Copy and modify the blueprint
   cp terraform-blueprint.tf my-deployment.tf
   
   # Update these placeholders with your values:
   # - YOUR_REGISTRY -> your container registry URL
   # - your-api-key -> your actual API keys
   # - your-project-id -> your Google Cloud project ID
   ```

3. **Deploy the infrastructure**:
   ```bash
   # Initialize Terraform
   terraform init
   
   # Plan your deployment
   terraform plan -var-file="my-variables.tfvars"
   
   # Apply the infrastructure
   terraform apply -var-file="my-variables.tfvars"
   ```

### Blueprint Components

#### Core Infrastructure
- **Service Account**: Dedicated service account with minimal required permissions
- **Cloud Run Services**: Main Lexicon service and optional MCP server
- **Health Checks**: Built-in health monitoring and auto-restart capabilities

#### Security & Secrets
- **Secret Manager**: Centralized secret storage with encrypted values
- **IAM Bindings**: Principle of least privilege access controls
- **Network Security**: Configurable ingress and security policies

#### Environment Variables
The blueprint supports configurable environment variables for:
- API integrations (customize based on your needs)
- Database connections (BigQuery, Snowflake, etc.)
- Third-party services (Slack, JIRA, etc.)
- MCP configuration (when using AI agent features)

### Customization Guide

#### 1. **API Keys and Secrets**
```hcl
// Uncomment and customize the secrets you need
resource "google_secret_manager_secret" "your_api_key" {
  secret_id = "your-service-api-key"
  replication {
    auto {}
  }
}
```

#### 2. **Environment Variables**
```hcl
// Add your service-specific environment variables
env {
  name = "YOUR_SERVICE_API_KEY"
  value_source {
    secret_key_ref {
      secret  = google_secret_manager_secret.your_api_key.secret_id
      version = "latest"
    }
  }
}
```

#### 3. **Resource Scaling**
```hcl
// Customize based on your traffic needs
--min-instances=1 
--max-instances=10
--cpu=2 
--memory=1Gi
```

### Deployment Outputs

After deployment, Terraform provides useful outputs:
- **Service URLs**: Direct links to your deployed Lexicon services
- **Service Account Email**: For configuring external integrations
- **Project Information**: Confirmation of deployment location and settings

The blueprint follows infrastructure-as-code best practices and can be easily integrated into CI/CD pipelines for automated deployments.

## 🏗️ Architecture

Lexicon uses an **adapter pattern** to deploy the same application to multiple cloud environments:

```
┌─────────────────────────────────────┐
│  Fullstory Anywhere Activations     │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│    Configure Webhook Properties     │
│    (Event Types, User Attributes)   │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│        Fullstory Webhook            │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│        Webhook Verification         │
│      (Signature & Auth Check)       │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│   Cloud Adapter (GCP/AWS/Azure)     │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│      Service Registry Layer         │
│  (Dependency Injection & Sharing)   │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│   Data Transformation & Enrichment  │
│    (Using Connectors for Context)   │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│      Connector Information Fetch    │
│    (Fullstory, BigQuery, etc.)      │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│         Route Configuration         │
│     (Destination & Format Rules)    │
└──────────────────┬──────────────────┘
                   │
                   │     ◄── One behavioral webhook can feed
                   │         many end destinations at once
┌──────────────────▼──────────────────┐
│          Connector Services         │
└─────┬─────────┬─────────┬───────────┘
      │         │         │
      │         │         │
┌─────▼───┐ ┌───▼───┐ ┌───▼────────┐
│Databases│ │ APIs  │ │ Endpoints  │
└─────────┘ └───────┘ └────────────┘
```

## 🤖 MCP Integration (Optional)

Lexicon includes an **optional comprehensive Model Context Protocol (MCP) server** that exposes enterprise-grade tools for FullStory, BigQuery, and Snowflake as standardized AI tools and resources.

> **⚠️ Important**: The MCP server is completely optional and can be safely excluded from deployments. Lexicon's core functionality (webhook processing, data transformation, multi-cloud connectors) works perfectly without any MCP components.

> **✨ New**: Fully updated MCP server with explicit tool registration, unified dispatcher pattern, and comprehensive API coverage.

The MCP integration is organized in the dedicated `MCP/` directory and runs as a standalone enterprise server when needed.

### MCP Server Features

**🏗️ Enterprise Architecture**
- Built with MCP SDK 1.13.0 using modern declarative APIs
- HTTP transport with Express.js server
- Unified dispatcher pattern for tool routing
- JSON Schema validation for all tool inputs
- Comprehensive monitoring and observability

**🔧 Explicit Tool Registration**
- **FullStory tools**: 23 tools covering all FullStory server APIs (v1 and v2)
- **Warehouse tools**: 12 tools for BigQuery and Snowflake operations
- **System tools**: 6 tools for health checks and diagnostics
- **Total**: 41 enterprise-grade tools with full API coverage

**🏢 Warehouse Integration**
- **BigQuery & Snowflake**: Essential data warehouse platforms
- **Direct API integration**: Platform-specific optimized queries
- **Konbini.js abstraction**: Database-agnostic SQL generation  
- **Type-safe operations**: JSON Schema validation for all parameters

### When to Use MCP

**Use MCP mode when:**
- You need AI agent integration capabilities
- You want to expose Lexicon connectors as standardized tools for AI systems
- You're building AI-powered workflows that need data access
- You require standardized tool interfaces for AI agents

**Use standard Lexicon mode when:**
- You only need webhook processing and data transformation
- You're building traditional web applications or APIs
- You don't require AI agent integration
- You want minimal deployment complexity

### Quick Start

```bash
# Start MCP server
npm run start:mcp

# Build Docker image
npm run build:cloudrun

# Deploy to your cloud provider (customize the commands with your values)
# See package.json for example deployment scripts
```

### Available Tools

#### FullStory Tools (23 total)
Complete coverage of FullStory server APIs including sessions, users, events, segments, analytics, and health endpoints.

#### Warehouse Tools (12 total)
BigQuery and Snowflake operations including query execution, schema inspection, and analytics.  
- `warehouse_generate_sql` - Platform-specific SQL generation via Konbini
- `warehouse_list_tables` - Database exploration

#### System Tools (6 total)
System diagnostics, health checks, and metrics for monitoring server status.

### Architecture Highlights

**Database Abstraction (Konbini.js)**
```javascript
// Platform-agnostic operations
const adapter = konbini.warehouse.getAdapter({ databaseType: 'bigquery' });
const sql = adapter.generateSql('select', 'users', ['id', 'name']);
```

**Explicit Tool Registration**
```javascript
// All tools use explicit JSON Schema registration
const tools = [
  {
    name: 'fullstory_get_profile',
    description: 'Get FullStory profile details',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: 'Profile ID to retrieve' }
      },
      required: ['profileId']
    }
  }
];

// Unified dispatcher routes calls to correct handlers
server.setRequestHandler(CallToolRequestSchema, unifiedDispatcher);
```

### When to Use MCP

**Perfect for:**
- AI agent integration with FullStory and warehouse data
- Standardized tool APIs for LLMs and AI assistants
- Exposing data connectors as MCP-compliant tools
- Cross-platform data warehouse operations

**Alternative options:**
- Use standard Lexicon mode for simple webhook processing
- Direct connector usage for basic integrations

### Docker Deployment

```bash
# Build MCP container
npm run build:cloudrun

# Deploy to Google Cloud
# Deploy to your cloud provider using the blueprint
# See terraform-blueprint.tf for infrastructure template
```

For complete documentation, examples, and API references, see [`MCP/README.md`](./MCP/README.md).

### Design Patterns

Lexicon follows several best practices and design patterns:

1. **Adapter Pattern**
   - Abstracts cloud-specific implementations
   - Enables a single codebase across platforms

2. **Singleton Pattern**
   - Used for service connectors to maintain consistent state
   - Example: `const fullstoryClient = new FullstoryClient(token, orgId);`

3. **Factory Pattern**
   - Creates appropriate cloud adapters at runtime
   - Example:
     ```javascript
     function createCloudAdapter(provider) {
       switch (provider.toUpperCase()) {
         case 'GCP': return new GCPAdapter();
         case 'AZURE': return new AzureAdapter();
         case 'AWS': return new AWSAdapter();
       }
     }
     ```

4. **Builder Pattern**
   - Used in database query construction
   - Example: `konbini.warehouse.generateSql({ ... })`

5. **Strategy Pattern**
   - Implemented for different authentication methods

6. **Service Registry Pattern**
   - Centralizes and manages shared services
   - Eliminates circular dependencies
   - Simplifies testing through dependency injection
   - Example:
     ```javascript
     // Register a service
     serviceRegistry.register('config', configInstance);
     
     // Get a service
     const config = serviceRegistry.get('config');
     ```

### Code Quality Principles

- **DRY (Don't Repeat Yourself)**: Common functionality in utility methods
- **Single Responsibility**: Each class/function has a focused purpose
- **Error Handling**: Consistent error responses across endpoints
- **Configuration Management**: Centralized through `config.js`
- **Protected Methods**: Private methods prefixed with underscore

## 📦 Service Registry

The Service Registry is a core architectural component that provides centralized service management and dependency injection:

```
┌─────────────────────────────────────┐
│          serviceRegistry.js         │
│     (Central Service Repository)    │
└─────┬─────────┬─────────┬───────────┘
      │         │         │
      │         │         │
┌─────▼───┐ ┌───▼───┐ ┌───▼────────┐
│  config │ │initial│ │ connectors │
│         │ │ization│ │            │
└─────────┘ └───────┘ └────────────┘
```

**Key Benefits:**

1. **Dependency Management**: Centralized management of service instances
2. **Circular Dependency Prevention**: Break dependency cycles between modules
3. **Testing Support**: Easy mocking of services during unit tests
4. **Runtime Flexibility**: Services can be dynamically registered and replaced

**Usage Examples:**

```javascript
// In index.js during application startup
serviceRegistry.register('config', configInstance);
serviceRegistry.register('initialization', initializationInstance);

// In a connector or webhook handler
const config = serviceRegistry.get('config');
const initialization = serviceRegistry.get('initialization');

// Check if a service exists
if (serviceRegistry.has('snowflake')) {
  const snowflake = serviceRegistry.get('snowflake');
  // Use the snowflake connector
}
```

**Service Registry API:**

```javascript
// Register a service
serviceRegistry.register('serviceName', serviceInstance);

// Get a registered service
const service = serviceRegistry.get('serviceName');

// Check if a service exists
const exists = serviceRegistry.has('serviceName');

// Get all registered service names
const services = serviceRegistry.getServiceNames();
```

## 🚀 Startup Sequence

Lexicon implements a controlled, phased initialization process that prevents circular dependencies and ensures services are initialized in the correct order:

```
┌─────────────────────────────────────┐
│            startup.js               │
│      (Initialization Manager)       │
└─────────────────┬─────────────────┬─┘
                  │                 │
                  ▼                 ▼
┌─────────────────────────┐ ┌───────────────────────┐
│     Initialization      │ │    Service Registry   │
│        Phases           │ │    Registration       │
└──────────┬──────────────┘ └───────────┬───────────┘
           │                            │
           ▼                            ▼
┌──────────────────────────────────────────────────┐
│                 Phase 1: Core Services           │
│          config, initialization, middleware      │
└──────────────────────────┬───────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────┐
│           Phase 2: Database & Resources          │
│       konbini, snowflake, bigQuery, workspace    │
└──────────────────────────┬───────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────┐
│          Phase 3: External Integrations          │
│           fullstory, slack, atlassian            │
└──────────────────────────┬───────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────┐
│            Phase 4: Webhooks & Routes            │
│                   webhookRouter                  │
└──────────────────────────┬───────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────┐
│              Phase 5: Cloud Adapter              │
│                    cloudAdapter                  │
└──────────────────────────┬───────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────┐
│              Initialization Summary              │
│        Status reporting for all components       │
└──────────────────────────────────────────────────┘
```

### Key Features

1. **Phased Initialization**: Services are started in a specific order to prevent dependency issues
2. **Graceful Fallbacks**: Services can operate even when dependencies aren't fully initialized
3. **Robust Error Handling**: Initialization failures in one service don't crash the entire application
4. **Status Reporting**: Comprehensive logging of initialization state for all components

### Initialization Process

1. **Core Services**: Essential services like config and the service registry itself are initialized first
2. **Database & Resources**: Data storage and resource connectors are initialized next
3. **External Integrations**: Third-party service connectors like Fullstory, Slack, and Atlassian
4. **Webhooks & Routes**: API endpoints and webhook handlers are set up
5. **Cloud Adapter**: The cloud-specific adapter (GCP, AWS, Azure) is initialized last

### Startup Manager API

```javascript
// In index.js
const startup = require('./startup');

// Initialize all services in the correct sequence
await startup.initialize();

// Get initialization status
const status = startup.getStatus();
console.log(`Initialization complete: ${status.initialized}`);
console.log(`Services registered: ${status.serviceCount}`);
```

### Error Handling During Initialization

The startup sequence is designed to be resilient:

1. **Temporary Placeholder**: The application exports a placeholder function immediately, which responds with a 503 status code during initialization
2. **Individual Service Failures**: If a service fails to initialize, the system continues with the next service
3. **Graceful Degradation**: The application functions with reduced capabilities when non-critical services fail
4. **Comprehensive Logging**: Detailed error logs help identify initialization issues

## 🔌 Service Connectors

Lexicon includes several service connectors to integrate with external systems:


### Fullstory Integration

The `Fullstory.js` connector now provides comprehensive, unified access to **all FullStory APIs** (v1, v2, and v2beta), including:
- User CRUD and batch operations
- Session management and search
- Event creation (single, batch, custom)
- Segment exports and status
- User events and pages
- Privacy and block rules
- Advanced analytics, health checks, and more

All methods are fully documented, support both NA1 and EU1 data centers, and are implemented as ES Modules. The connector is the foundation for both webhook processing and MCP tool exposure.

#### Example Usage

```js
import fullstoryConnector from './Fullstory.js';
const user = await fullstoryConnector.getUser('user123');
const sessionLink = fullstoryConnector.getSessionLink('user123', 'session456');
```

---

## 🧠 Session Insights & Behavioral Analytics

The `session_insights` function (exposed as `getSessionInsights` in `Fullstory.js`) provides deep analytics for a given user/session, including behavioral clustering, event timelines, session flow, and engagement metrics. This is supported by a suite of private helper functions for clustering, funnel analysis, engagement scoring, and more.

### `getSessionInsights(userId, sessionId)`

**Returns:**
- Session summary (duration, event count, unique event types)
- Behavioral clustering (categories, insights, diversity)
- Session flow (event transitions, common paths, dropoff points)
- Conversion path and dropoff analysis
- Session replay link

#### Example
```js
const insights = await fullstoryConnector.getSessionInsights({ user_id: 'user123', session_id: 'session456' });
console.log(insights.behavioralClustering.behavioralInsights.primaryBehavior);
console.log(insights.sessionUrl);
```

### Helper Analytics Methods

- `_generateEventClustering(events)`: Categorizes events into behavioral intent groups and computes clustering stats.
- `_analyzeBehavioralPatterns(behavioralCategories)`: Determines primary/secondary behaviors, engagement, and diversity.
- `_analyzeSessionFlow(events)`: Extracts event transitions, common paths, and dropoff points.
- `_calculateSessionDuration(events)`: Computes session duration in seconds.
- `_countSessionEvents(events)`: Counts session start/end events.
- `_getMostFrequentEvents(events)`: Top event types by frequency.
- `_calculateEngagementScore(events)`: Computes a 0-100 engagement score.
- `_calculateConversionFunnel(events)`: Funnel metrics for conversion analysis.
- `_analyzeBehaviorPattern(events)`: Detects dominant user behavior patterns.
- `_identifyDropoffPoints(events)`: Finds long gaps between events.

All analytics methods are used internally by `getSessionInsights` and `getUserAnalytics` to provide actionable business insights from raw FullStory data.

#### Core Features

- **Complete API Coverage**: Supports both v1 and v2 FullStory APIs
- **Advanced Session Analytics**: Behavioral clustering and user journey analysis  
- **Rate Limiting**: Built-in request queuing to respect API limits
- **Multi-Datacenter Support**: Works with NA1 and EU1 data centers
- **Comprehensive Error Handling**: Robust error handling with detailed logging

#### Basic Operations

```javascript
// Get session data
const summary = await Fullstory.getSessionSummary(userId, sessionId);
const events = await Fullstory.getSessionEvents(userId, sessionId);

// Generate session replay link
const link = Fullstory.getSessionLink(userId, sessionId);

// Create custom events
await Fullstory.createEvent({
  name: 'custom_action',
  user: { uid: userId },
  properties: { action: 'completed' }
});
```

#### Advanced Analytics Engine

The connector includes a sophisticated analytics engine that processes raw session data into actionable business insights:

##### Behavioral Clustering

Automatically categorizes user events into behavioral intent categories:

- **Navigation & Orientation**: Page views, loading, navigation actions
- **Information Seeking & Learning**: Clicks, content viewing, exploration  
- **Task Accomplishment & Management**: Form filling, data entry, configuration
- **Communication & Community**: User identification, social interactions
- **Entertainment & Leisure**: Casual browsing, multimedia consumption
- **Feedback & Contribution**: Error reporting, reviews, console messages
- **Transaction & Acquisition**: Purchase flows, subscriptions, conversions

```javascript
// Get comprehensive session insights with behavioral clustering
const insights = await Fullstory.getSessionInsights(userId, sessionId);

console.log('Primary Behavior:', insights.behavioralClustering.behavioralInsights.primaryBehavior);
console.log('Engagement Level:', insights.behavioralClustering.behavioralInsights.engagementLevel);
console.log('Session Duration:', insights.behavioralClustering.sessionDuration, 'seconds');
```

##### Session Analytics Features

The insights include rich analytical data:

```javascript
{
  eventCount: 126,
  uniqueEventTypes: 12,
  sessionDuration: 135, // Duration in seconds for precise calculations
  
  behavioralClustering: {
    behavioralCategories: {
      'Task Accomplishment & Management': {
        count: 75,
        percentage: 60,
        events: [...]
      },
      'Information Seeking & Learning': {
        count: 35, 
        percentage: 28,
        events: [...]
      }
    },
    
    behavioralInsights: {
      primaryBehavior: 'Task Accomplishment & Management',
      primaryPercentage: 60,
      engagementLevel: 'high',
      behavioralDiversity: 42,
      confidence: 0.8
    },
    
    sessionFlow: {
      transitions: [...],
      commonPaths: [
        { path: 'navigate → click', count: 15 },
        { path: 'click → change', count: 12 }
      ],
      dropoffPoints: [...]
    }
  },
  
  conversionPath: [...], // Sequence of conversion-related events
  dropoffPoints: [...],  // Potential abandonment moments
  sessionUrl: 'https://app.fullstory.com/ui/ORG/session/...'
}
```

##### User Analytics

Get comprehensive user profiles with behavioral patterns:

```javascript
// Enhanced user analytics with behavioral insights
const analytics = await Fullstory.getUserAnalytics(userId);

console.log('Total Sessions:', analytics.analytics.totalSessions);
console.log('Engagement Score:', analytics.analytics.engagementScore);
console.log('Behavior Pattern:', analytics.analytics.behaviorPattern.pattern);
```

#### Bulk Operations

Handle large-scale data operations efficiently:

```javascript
// Bulk user creation with validation and chunking
const result = await Fullstory.bulkCreateUsers(usersArray, {
  validateData: true,
  chunkSize: 100
});

// Bulk event creation
const eventResult = await Fullstory.bulkCreateEvents(eventsArray);
```

#### Data Export and Migration

Export data for analytics or migration purposes:

```javascript
// Export session data
const exportData = await Fullstory.exportData({
  type: 'sessions',
  filters: { limit: 1000 },
  format: 'json',
  dateRange: { start: '2024-01-01', end: '2024-12-31' }
});

// Export segment data
const segmentExport = await Fullstory.exportData({
  type: 'segment',
  filters: { segmentId: 'segment_123' },
  format: 'csv'
});
```

#### Health Monitoring

Built-in health checking for system monitoring:

```javascript
const health = await Fullstory.healthCheck();
console.log('Status:', health.status); // 'healthy' or 'unhealthy'
console.log('Datacenter:', health.datacenter);
```

#### Advanced Configuration

The connector automatically handles:

- **API Version Management**: Supports v1, v2, and v2beta endpoints
- **Data Center Routing**: Automatic URL selection based on datacenter config
- **Rate Limiting**: Queued requests with configurable intervals
- **Error Recovery**: Automatic retry logic with exponential backoff
- **Field Mapping**: Handles differences between API versions (e.g., `event_type` vs `name`)

#### Integration with MCP Tools

When used with the MCP server, all methods are automatically exposed as tools:

```javascript
// Available MCP tools include:
// - fullstory_get_session_insights
// - fullstory_get_user_analytics  
// - fullstory_health_check
// - fullstory_create_event
// - fullstory_search_sessions
// ... and 20+ more automated tools
```

The connector serves as the foundation for AI agents and provides enterprise-grade FullStory integration capabilities.

### Database Support

Work with multiple database backends through Konbini:

```javascript
// BigQuery example with named parameters
const { sql, params, parameterTypes } = konbini.warehouse.generateSql({
  databaseType: 'bigquery',
  operation: 'insert',
  table: 'fs_data_destinations.lead_info',
  columns: ['session_id', 'visitor_id'],
  data: {
    session_id: data.session_id,
    visitor_id: data.uid
  }
});

// Snowflake example with positional parameters
await snowflake.withConnection(async (connector) => {
  await connector.executeQuery(sql, bindings);
});
```

### Notification Integrations

Send notifications to various channels:

```javascript
// Send Slack notification
await slack.sendWebHook({
  text: "New customer feedback received",
  blocks: [/* Block Kit content */]
});

// Create Jira ticket
const ticket = await atlassian.jira.createTicket({
  fields: {
    summary: `${body.name} - ${body.user.email}`,
    description: rundown,
    project: { key: projectKey },
    issuetype: { id: issueTypeId }
  }
});
```

## ⚙️ Configuration

Lexicon provides a robust configuration system through `config.js`:

```javascript
// Get a configuration value with default
const port = config.get('port', 8080);

// Get a typed configuration value
const debugEnabled = config.getBoolean('enable_detailed_errors', false);
const timeout = config.getNumber('timeout', 30);

// Check environment
if (config.isCloudProvider('GCP')) {
  // GCP-specific code
}
```

Configuration can be set through:
1. Environment variables
2. `.env` file (development only)
3. Cloud provider environment settings

### Configuration System Architecture

Lexicon follows a layered configuration architecture to ensure consistency and validation across all services:

```
┌─────────────────────────────┐
│         config.js           │
│ (Core Configuration System) │
└─────────────┬───────────────┘
              │
              │ provides configuration
              ▼
┌─────────────────────────────┐
│  connectorConfigValidator   │
│   (Validation & Typing)     │
└─────────────┬───────────────┘
              │
              │ provides validation services
              ▼
┌─────────────────────────────┐
│      connectorBase.js       │
│  (Common Connector Logic)   │
└─────────────┬───────────────┘
              │
              │ extends
     ┌────────┼────────┬───────────┐
     │        │        │           │
     ▼        ▼        ▼           ▼
┌─────────┐ ┌─────┐ ┌────────-┐ ┌────────┐
│Snowflake│ │Slack│ │Fullstory│ │  Other │
└─────────┘ └─────┘ └────────-┘ └────────┘
```

**Key Components:**

1. **config.js**: Singleton configuration manager that handles environment detection, environment variables, and cloud platform specifics.

2. **connectorConfigValidator.js**: Validates configuration values, tracks errors, and provides proper type conversion.

3. **connectorBase.js**: Provides a consistent interface to all connectors, integrating the validator with convenient helper methods.

4. **Individual Connectors**: Extend ConnectorBase to inherit the configuration system.

### Using Configuration in Connectors

All service connectors use a consistent pattern to access configuration:

```javascript
// Creating a new connector that extends ConnectorBase
class SnowflakeConnector extends ConnectorBase {
  constructor() {
    // Initialize with connector name
    super('Snowflake');
    
    // Get configuration through the base class methods
    this.config = {
      account: this.getConfig('snowflake_account_identifier'),
      username: this.getConfig('snowflake_user'),
      warehouse: this.getConfig('snowflake_warehouse'),
      // Get more configuration values as needed
    };
    
    // Check if configuration is valid using the validator
    this.isConfigured = this.validator.checkIsConfigured();
  }
  
  // Access configuration in methods
  async connect() {
    if (!this.isConfigured) {
      return Promise.reject(new Error('Snowflake is not properly configured'));
    }
    
    // Use configuration values
    // ...
  }
}
```

This approach ensures:
- Consistent configuration across all connectors
- Proper validation and error tracking
- Type-safe configuration access
- Environment-specific configuration

## 🚢 Deployment

Lexicon can be deployed in two modes with comprehensive deployment options:

### Standard Mode (Default)
Traditional HTTP server mode for webhook processing and data transformation:

```bash
# Standard deployment (no MCP)
npm start

# Docker deployment (standard mode)
docker build -t lexicon .
docker run -p 8080:8080 lexicon
```

### MCP Mode (Optional)
AI agent integration mode using the Model Context Protocol:

```bash
# Start MCP server locally
npm run start:mcp

# Build and run MCP Docker container
npm run build:cloudrun
docker run -p 8080:8080 --env-file .env lexicon-mcp

# Deploy to your cloud provider
# See package.json for example deployment commands
# Customize with your project ID, region, and service account
```

### Cloud Provider Deployment

#### Google Cloud

```bash
# Deploy to Cloud Functions
gcloud functions deploy lexicon \
  --runtime=nodejs18 \
  --trigger-http \
  --set-env-vars="cloud_provider=GCP"

# Deploy to Cloud Run
gcloud run deploy lexicon \
  --image=gcr.io/[PROJECT_ID]/lexicon \
  --set-env-vars="cloud_provider=GCP"
```

### Azure

```bash
# Deploy to Azure Functions
func azure functionapp publish [APP_NAME] \
  --javascript \
  --set cloud_provider=AZURE

# Deploy to Azure App Service
az webapp deploy \
  --resource-group [RESOURCE_GROUP] \
  --name [APP_NAME] \
  --src-path . \
  --type zip \
  --env-vars cloud_provider=AZURE
```

### AWS

```bash
# Deploy using AWS-specific tools and configuration
# Customize based on your AWS setup and requirements
```

## 🏗️ Infrastructure as Code - Terraform Blueprint

Lexicon includes a comprehensive Terraform blueprint (`terraform-blueprint.tf`) for secure, production-ready cloud deployments on Google Cloud Platform.

### What's Included

The Terraform blueprint provides:

- **Complete Infrastructure**: Service accounts, Cloud Run services, Secret Manager, IAM bindings
- **Dual Service Setup**: Both standard Lexicon service and optional MCP server
- **Security Best Practices**: Proper secret management, IAM roles, and access controls
- **Production Ready**: Lifecycle management, health checks, and scaling configuration

### Key Features

#### 🔐 **Secret Management**
All sensitive configuration is managed through Google Secret Manager:
```terraform
resource "google_secret_manager_secret" "api_key_service_1" {
  secret_id = "api-key-service-1"
  replication { auto {} }
}
```

#### 🚀 **Cloud Run Services**
Both services are configured with production best practices:
- Automatic scaling with configurable limits
- Health checks and lifecycle management  
- Environment variable injection from secrets
- Proper service account assignments

#### 🔒 **IAM Security**
Follows principle of least privilege:
- Dedicated service account for Lexicon services
- Granular secret access permissions
- Cloud Run invoker roles properly assigned

### Quick Start

1. **Customize the blueprint**:
   ```bash
   cp terraform-blueprint.tf main.tf
   # Edit main.tf with your project details
   ```

2. **Add your secrets and environment variables**:
   - Uncomment the secret resources you need
   - Update the environment variable sections in the Cloud Run services
   - Modify the IAM bindings to include your secrets

3. **Deploy the infrastructure**:
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

### Customization Guide

#### **Step 1: Configure Secrets**
Uncomment and customize the secrets you need:
```terraform
# Example: Add your service API key
resource "google_secret_manager_secret" "my_service_api_key" {
  secret_id = "my-service-api-key"
  replication { auto {} }
}
```

#### **Step 2: Update Cloud Run Environment Variables**
Add your environment variables to both services:
```terraform
env {
  name = "MY_SERVICE_API_KEY"
  value_source {
    secret_key_ref {
      secret  = google_secret_manager_secret.my_service_api_key.secret_id
      version = "latest"
    }
  }
}
```

#### **Step 3: Update IAM Bindings**
Include your new secrets in the IAM permissions:
```terraform
resource "google_secret_manager_secret_iam_member" "lexicon_runner" {
  for_each = toset([
    google_secret_manager_secret.my_service_api_key.secret_id,
    # Add other secrets here
  ])
  # ... rest of configuration
}
```

#### **Step 4: Customize Container Images**
Update the container registry URLs:
```terraform
image = "your-region-docker.pkg.dev/your-project/your-repo/lexicon:latest"
```

### Advanced Configuration

#### **MCP Mode**
The blueprint includes an optional MCP server with:
- `MCP_MODE=true` environment variable
- `SAFE_MODE=true` for secure AI agent integration
- Separate service for AI agent workloads

#### **Terraform State Management**
For team environments, consider using remote state:
```bash
terraform {
  backend "gcs" {
    bucket = "your-terraform-state-bucket"
    prefix = "lexicon"
  }
}
```

### Outputs

The blueprint provides useful outputs:
```terraform
# Service URLs for integration
output "lexicon_service_url"     # Main Lexicon service
output "lexicon_mcp_service_url" # MCP server (if deployed)
output "lexicon_service_account_email" # Service account for additional config
```

### Migration from Manual Setup

If you have an existing manual deployment:

1. **Import existing resources** (optional):
   ```bash
   terraform import google_cloud_run_v2_service.lexicon projects/YOUR_PROJECT/locations/YOUR_REGION/services/lexicon
   ```

2. **Plan and review changes**:
   ```bash
   terraform plan
   ```

3. **Apply gradually**:
   ```bash
   # Apply only secrets first
   terraform apply -target=google_secret_manager_secret.your_secret
   ```

The Terraform blueprint ensures your Lexicon deployment follows cloud best practices and is maintainable, secure, and scalable.

## 🐳 Docker Usage

Lexicon provides several Docker-related npm scripts:

```bash
# Build and run
npm run docker:build
npm run docker:run:env  # Uses env vars from .env file

# Provider-specific containers
npm run docker:run:gcp  # Runs on port 8080
npm run docker:run:azure  # Runs on port 8080 
npm run docker:run:aws  # Runs on port 8080
```

## 💻 Local Development

For local development:

```bash
# Set cloud provider
export CLOUD_PROVIDER=GCP

# Run with local environment
npm start

# Run with Docker and live reload
npm run dev:mount

# Auto-restart on changes
npm run dev:docker
```

## 🧪 Testing

Lexicon includes comprehensive tests:

```bash
# Run all tests
npm test

# Run specific test categories (available tests)
npm run test:unit
npm run test:integration

# Watch mode for development
npm run test:watch
```

For detailed test documentation, see the [Testing Guidelines](./tests/README.md).

## 🔒 Security Configuration (MCP Mode)

When running Lexicon in MCP mode, consider these security best practices:

### Authentication & Authorization
- **API Keys**: Secure FullStory, BigQuery, and Snowflake credentials
- **Session Management**: Configurable TTL and automatic cleanup
- **Rate Limiting**: Built-in protection against abuse
- **Transport Security**: TLS/SSL for all network communications

### Production Checklist
- [ ] Enable authentication middleware
- [ ] Configure secure session TTL (default: 1 hour)
- [ ] Set up proper logging and monitoring
- [ ] Use environment variables for all secrets
- [ ] Enable CORS restrictions for web clients
- [ ] Configure firewall rules for MCP ports

### Environment Variables (MCP Mode)
```bash
# Authentication
MCP_AUTH_ENABLED=true
MCP_SESSION_TTL=3600
MCP_RATE_LIMIT_REQUESTS=100
MCP_RATE_LIMIT_WINDOW=60

# Transport Security
MCP_TLS_ENABLED=true
MCP_CORS_ORIGINS=https://yourdomain.com

# Monitoring
MCP_METRICS_ENABLED=true
MCP_AUDIT_LOG_ENABLED=true
```

For comprehensive security documentation, see [`MCP/README.md`](./MCP/README.md).

## 🤝 Contributing

When adding new functionality to Lexicon, follow these guidelines:

1. **New Webhook Handlers**:
   - Extend `WebhookBase` class
   - Use the logger and errorHandler
   - Follow existing patterns

2. **New Connector Integrations**:
   - Create a dedicated file that extends `ConnectorBase`
   - Use the configuration validation system through `getConfig()` methods
   - Implement comprehensive error handling
   - Document with JSDoc comments

3. **Cloud Provider Support**:
   - Extend the appropriate adapter
   - Test thoroughly in target environment

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.