# Lexicon - Multi-Cloud Serverless Function

<div align="center">

*A flexible serverless middleware that transforms and routes Fullstory data across multiple cloud platforms*

</div>

## 🚀 Quick Start

```bash
# Clone the repository
git clone [repository-url]

# Install dependencies
npm install

# Set environment variables (.env file or export)
export CLOUD_PROVIDER=GCP  # Options: GCP, AZURE, AWS
export NODE_ENV=development

# Run locally
npm start

# Run in Docker
npm run docker:build
npm run docker:run:env
```

## 📋 Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
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
- [Contributing](#contributing)

## 📚 Overview

Lexicon is a multi-cloud serverless middleware that processes Fullstory data and routes it to various destinations. It serves as an intermediary layer between Fullstory analytics and downstream services, transforming and enriching data along the way.

**Key Benefits:**
- Single codebase deployable to GCP, Azure, or AWS
- Automatic cloud provider detection
- Flexible webhook routing system
- Comprehensive connector ecosystem for third-party integrations

## ✨ Features

- **Multi-Cloud Deployment**: Deploy the same code to Google Cloud, Azure, or AWS
- **Webhook Processing**: Handle Fullstory webhook events and route them appropriately
- **Service Integrations**: Connect with Slack, Jira, BigQuery, Snowflake, and more
- **Database Abstraction**: Work with multiple database backends through a common interface
- **Robust Configuration**: Type-safe configuration with environment-specific settings
- **Service Registry**: Centralized service management with dependency injection
- **Controlled Startup Sequence**: Phased initialization to prevent circular dependencies
- **Comprehensive Logging**: Structured logging with redaction of sensitive information
- **Docker Support**: Run in containers locally or in production environments

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

Interact with Fullstory's behavioral data platform:

```javascript
// Get session data
const summary = await Fullstory.getSessionSummary(userId, sessionId);

// Generate session replay link
const link = Fullstory.getSessionLink(userId, sessionId);
```

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

### Google Cloud

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
# Deploy to AWS App Runner
npm run deploy:aws
# (Requires AWS_ACCOUNT_ID and AWS_REGION env variables)
```

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

# Run specific test categories
npm run test:unit
npm run test:integration
npm run test:adapters

# Test specific cloud providers
npm run test:gcp
npm run test:azure
npm run test:aws

# Watch mode for development
npm run test:watch
```

For detailed test documentation, see the [Testing Guidelines](./tests/README.md).

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