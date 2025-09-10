#!/usr/bin/env node

// Lexicon MCP Server - Unified Entrypoint with Logging, Signal Handling, and Server Logic


import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { fullstoryTools, fullstoryDispatcher } from "./tools/fullstory-tools.js";
import { systemTools, systemDispatcher } from "./tools/system-tools.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../loggerFramework.js';
import config from '../config.js';

// Import startup utilities
import serviceRegistry from '../serviceRegistry.js';
import initialization from '../initialization.js';
import rateLimiter from '../rateLimiter.js';

// Import MCP authentication system
import { getMCPAuth, isAuthEnabled } from './auth/mcpAuth.js';

// Create a global logger for error handling (before main function)
const globalLogger = new Logger('MCP-Global');

/**
 * Initialize MCP services following the same pattern as main Lexicon
 */
async function initializeMCPServices() {
  const logger = new Logger('MCP-Startup');
  
  try {
    // Register core services first
    serviceRegistry.register('initialization', initialization);
    
    // Initialize connectors that the MCP server needs
    const servicesNeeded = [
      { name: 'fullstory', path: '../Fullstory.js' },
      { name: 'snowflake', path: '../Snowflake.js' },
      { name: 'bigQuery', path: '../GoogleCloud.js' }
    ];
    
    logger.info('Initializing MCP services');
    
    for (const service of servicesNeeded) {
      try {
        if (!serviceRegistry.has(service.name)) {
          // Import the connector - it will register itself
          await import(service.path);
          logger.debug(`Service ${service.name} imported and registered`);
        } else {
          logger.debug(`Service ${service.name} already registered`);
        }
      } catch (error) {
        logger.error(`Failed to initialize service ${service.name}:`, error);
        // Continue with other services
      }
    }
    
    // Wait for services to complete initialization
    await initialization.waitForConnectors(3000);
    
    logger.info('MCP services initialization complete');
    return true;
  } catch (error) {
    logger.error('MCP services initialization failed:', error);
    return false;
  }
}

async function main() {
  // Initialize services first
  await initializeMCPServices();
  
  const app = express();
  app.use(express.json());
  
  // Create logger for MCP requests first
  const mcpLogger = new Logger('MCP-Server');
  
  // Initialize MCP authentication system
  let mcpAuth = null;
  try {
    mcpAuth = getMCPAuth();
    if (isAuthEnabled()) {
      mcpLogger.info('MCP Authentication is ENABLED');
      
      // Add OAuth 2.1 protected resource metadata endpoint (RFC 9728)
      app.get('/.well-known/oauth-protected-resource', mcpAuth.getProtectedResourceMetadata());
      
      // Add authorization server metadata endpoint (RFC 8414)
      app.get('/.well-known/oauth-authorization-server', mcpAuth.getAuthServerMetadata());
      
      // Add OAuth authentication middleware
      app.use(mcpAuth.middleware());
      
      mcpLogger.info('MCP Authentication middleware registered');
    } else {
      mcpLogger.info('MCP Authentication is DISABLED (default)');
    }
  } catch (error) {
    mcpLogger.error('Failed to initialize MCP authentication:', error);
    if (isAuthEnabled()) {
      // If auth is explicitly enabled but fails, don't start the server
      throw new Error(`MCP Authentication initialization failed: ${error.message}`);
    }
    // If auth is disabled, continue without auth
    mcpLogger.warn('Continuing without authentication due to initialization failure');
  }
  
  // Add MCP-specific rate limiting
  if (rateLimiter.initialized) {
    const mcpRateLimit = rateLimiter.createMiddleware({
      category: 'mcp',
      windowMs: rateLimiter.config.mcpWindowMs,
      maxRequests: rateLimiter.config.mcpMaxRequests
    });
    app.use(mcpRateLimit);
    mcpLogger.info('MCP rate limiting enabled', {
      windowMs: rateLimiter.config.mcpWindowMs,
      maxRequests: rateLimiter.config.mcpMaxRequests
    });
  } else {
    mcpLogger.warn('Rate limiter not initialized, MCP rate limiting disabled');
  }

  const server = new Server(
    {
      name: "lexicon",
      version: "1.0.0"
    },
    {
      capabilities: { tools: {} }
    }
  );

  // All tool definitions are merged and handled via a unified dispatcher.
  const allTools = [
    ...fullstoryTools,
    ...systemTools
  ];
  
  // Enable debug logging for MCP if requested
  const showDebugLogs = config.getBoolean('mcp_debug', false);
  if (showDebugLogs) {
    mcpLogger.info('MCP debug logging enabled', { MCP_DEBUG: 'true' });
  }

  // Unified dispatcher routes tool calls to the correct group dispatcher.
  async function unifiedDispatcher(request) {
    const { name } = request.params;
    const startTime = Date.now();
    
    // Log incoming tool call (without sensitive parameters)
    mcpLogger.info(`Tool call: ${name}`, {
      requestId: request.id || 'unknown',
      toolName: name,
      hasArguments: !!(request.params && request.params.arguments),
      argumentCount: request.params?.arguments ? Object.keys(request.params.arguments).length : 0
    });
    
    // Check tool-specific rate limits
    if (rateLimiter.initialized) {
      const clientId = request.clientId || 'default'; // You may want to extract this from the request context
      const rateLimitCheck = await rateLimiter.checkToolRateLimit(name, clientId);
      
      if (!rateLimitCheck.allowed) {
        mcpLogger.warn(`Tool rate limit exceeded for ${name}`, {
          toolName: name,
          clientId: clientId,
          limit: rateLimitCheck.limit,
          resetTime: rateLimitCheck.resetTime
        });
        
        return {
          content: [{
            type: 'text',
            text: `Rate limit exceeded for tool "${name}". Please try again in ${rateLimitCheck.retryAfter} seconds.`
          }],
          isError: true,
          _rateLimitInfo: {
            toolName: name,
            limit: rateLimitCheck.limit,
            remaining: 0,
            resetTime: rateLimitCheck.resetTime,
            retryAfter: rateLimitCheck.retryAfter
          }
        };
      }
      
      mcpLogger.debug(`Tool rate limit check passed for ${name}`, {
        toolName: name,
        remaining: rateLimitCheck.remaining,
        limit: rateLimitCheck.limit
      });
    }
    
    let result;
    let toolCategory = 'unknown';
    
    try {
      // Log connector activity for specific tool categories
      let connectorService = null;
      
      if (fullstoryTools.some(t => t.name === name)) {
        toolCategory = 'fullstory';
        connectorService = serviceRegistry.get('fullstory');
        if (showDebugLogs && connectorService?.logger) {
          mcpLogger.info(`Invoking Fullstory connector for ${name}`, {
            toolName: name,
            connectorInitialized: connectorService.initialized,
            connectorConfigured: connectorService.isConfigured
          });
        }
        result = await fullstoryDispatcher(request);
      } else if (systemTools.some(t => t.name === name)) {
        toolCategory = 'system';
        if (showDebugLogs) {
          mcpLogger.info(`Invoking system tool ${name}`, {
            toolName: name,
            serviceCount: serviceRegistry.size
          });
        }
        result = await systemDispatcher(request);
      } else {
        toolCategory = 'unknown';
        result = {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true
        };
      }
      
      // Log tool call completion with connector insights
      const duration = Date.now() - startTime;
      const logData = {
        requestId: request.id || 'unknown',
        toolName: name,
        toolCategory,
        duration: `${duration}ms`,
        success: !result.isError,
        hasContent: !!(result.content && result.content.length > 0),
        contentLength: result.content ? result.content.reduce((total, item) => total + (item.text?.length || 0), 0) : 0
      };
      
      // Add connector-specific insights if debug logging is enabled
      if (showDebugLogs && connectorService) {
        logData.connectorInsights = {
          name: connectorService.name,
          initialized: connectorService.initialized,
          configured: connectorService.isConfigured,
          hasLogger: !!connectorService.logger
        };
      }
      
      mcpLogger.info(`Tool completed: ${name}`, logData);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      mcpLogger.error(`Tool failed: ${name}`, {
        requestId: request.id || 'unknown',
        toolName: name,
        toolCategory,
        duration: `${duration}ms`,
        error: error.message
      });
      
      result = {
        content: [{ type: 'text', text: `Tool execution failed: ${error.message}` }],
        isError: true
      };
    }
    
    return result;
  }

  // Register unified handlers for tool listing and tool calls
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    mcpLogger.info('MCP request: tools/list', {
      requestId: request.id || 'unknown',
      method: 'tools/list',
      toolCount: allTools.length
    });
    return { tools: allTools };
  });
  
  server.setRequestHandler(CallToolRequestSchema, unifiedDispatcher);



  // Create a single transport and connect once
  const transport = new StreamableHTTPServerTransport({});
  await server.connect(transport);

  // Register MCP protocol handler at /mcp using the persistent transport
  app.post("/mcp", async (req, res) => {
    const startTime = Date.now();
    const method = req.body?.method || 'unknown';
    const id = req.body?.id || 'unknown';
    
    mcpLogger.info(`MCP HTTP request: ${method}`, {
      requestId: id,
      method: method,
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type'),
      hasBody: !!req.body
    });
    
    try {
      await transport.handleRequest(req, res, req.body);
      const duration = Date.now() - startTime;
      mcpLogger.info(`MCP HTTP response: ${method}`, {
        requestId: id,
        method: method,
        duration: `${duration}ms`,
        statusCode: res.statusCode
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      mcpLogger.error(`MCP HTTP error: ${method}`, {
        requestId: id,
        method: method,
        duration: `${duration}ms`,
        error: error.message
      });
      throw error;
    }
  });
  
  app.get("/mcp", async (req, res) => {
    mcpLogger.info('MCP HTTP GET request', {
      userAgent: req.get('User-Agent'),
      query: Object.keys(req.query)
    });
    await transport.handleRequest(req, res);
  });

  // Health endpoints for external monitoring systems
  app.get("/health", async (req, res) => {
    const startTime = Date.now();
    mcpLogger.debug('HTTP request: GET /health', {
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
    
    try {
      const healthResult = await unifiedDispatcher({
        params: { name: "system_health_check", arguments: {} },
        id: 'health-check'
      });
      
      if (healthResult.isError) {
        const duration = Date.now() - startTime;
        mcpLogger.warn(`Health check returned error (${duration}ms)`, {
          status: 503,
          error: 'system_health_check failed'
        });
        return res.status(503).json({ 
          status: "unhealthy", 
          error: healthResult.content[0].text 
        });
      }

      const healthData = JSON.parse(healthResult.content[0].text);
      const httpStatus = healthData.overall === 'healthy' ? 200 : 
                        healthData.overall === 'warning' ? 200 : 503;
      
      const duration = Date.now() - startTime;
      mcpLogger.debug(`Health check completed (${duration}ms)`, {
        status: httpStatus,
        overall: healthData.overall,
        serviceCount: Object.keys(healthData.checks?.services || {}).length
      });
      
      res.status(httpStatus).json({
        status: healthData.overall,
        timestamp: healthData.timestamp,
        checks: healthData.checks
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      mcpLogger.error(`Health check failed (${duration}ms)`, error);
      res.status(503).json({ 
        status: "unhealthy", 
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  app.get("/metrics", async (req, res) => {
    try {
      const metricsResult = await unifiedDispatcher({
        params: { name: "system_get_metrics", arguments: {} }
      });
      
      if (metricsResult.isError) {
        return res.status(500).json({ error: metricsResult.content[0].text });
      }

      const metricsData = JSON.parse(metricsResult.content[0].text);
      res.json(metricsData);
    } catch (error) {
      res.status(500).json({ 
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  app.get("/status", async (req, res) => {
    try {
      const statusResult = await unifiedDispatcher({
        params: { 
          name: "system_get_status", 
          arguments: { 
            includeServices: true, 
            includeMemoryDetails: true 
          } 
        }
      });
      
      if (statusResult.isError) {
        return res.status(500).json({ error: statusResult.content[0].text });
      }

      const statusData = JSON.parse(statusResult.content[0].text);
      res.json(statusData);
    } catch (error) {
      res.status(500).json({ 
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  const PORT = config.getNumber('port', 8080);
  app.listen(PORT, () => {
    mcpLogger.info('MCP server started', {
      port: PORT,
      nodeVersion: process.version,
      environment: config.get('node_env', 'development'),
      toolsAvailable: allTools.length,
      endpoints: ['/health', '/status', '/metrics', '/mcp']
    });
    mcpLogger.info(`Lexicon MCP server listening on port ${PORT}`, {
      port: PORT,
      mode: 'MCP',
      endpoints: ['/health', '/status', '/metrics', '/mcp']
    });
  });
}



// Export main function for testing
export { main };

// Only run main if this file is executed directly (not imported during tests)
// Also check for test environment to prevent server startup during tests
const isDirectExecution = import.meta.url === `file://${process.argv[1]}`;
const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

if (isDirectExecution && !isTestEnvironment) {
  main().catch((err) => {
    globalLogger.error(`Fatal error during MCP server startup`, {
      error: err.message,
      stack: err.stack
    });
    process.exit(1);
  });
}



function handleSignal(signal) {
  globalLogger.info(`Received ${signal}. Shutting down gracefully...`, { signal });
  process.exit(0);
}

['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
  process.on(signal, () => handleSignal(signal));
});


process.on('uncaughtException', (err) => {
  globalLogger.error(`Uncaught exception`, {
    error: err.message,
    stack: err.stack
  });
  process.exit(1);
});


process.on('unhandledRejection', (reason, promise) => {
  globalLogger.error(`Unhandled rejection`, {
    reason: reason,
    promise: promise.toString()
  });
  process.exit(1);
});


