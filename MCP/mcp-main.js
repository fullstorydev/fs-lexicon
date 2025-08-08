#!/usr/bin/env node

// Lexicon MCP Server - Unified Entrypoint with Logging, Signal Handling, and Server Logic


import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { fullstoryTools, fullstoryDispatcher } from "./tools/fullstory-tools.js";
import { warehouseTools, warehouseDispatcher } from "./tools/warehouse-tools.js";
import { systemTools, systemDispatcher } from "./tools/system-tools.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

async function main() {
  const app = express();
  app.use(express.json());

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
    ...warehouseTools,
    ...systemTools
  ];

  // Unified dispatcher routes tool calls to the correct group dispatcher.
  async function unifiedDispatcher(request) {
    const { name } = request.params;
    let result;
    if (fullstoryTools.some(t => t.name === name)) {
      result = await fullstoryDispatcher(request);
    } else if (warehouseTools.some(t => t.name === name)) {
      result = await warehouseDispatcher(request);
    } else if (systemTools.some(t => t.name === name)) {
      result = await systemDispatcher(request);
    } else {
      result = {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true
      };
    }
    //
    return result;
  }

  // Register unified handlers for tool listing and tool calls
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: allTools }));
  server.setRequestHandler(CallToolRequestSchema, unifiedDispatcher);



  // Create a single transport and connect once
  const transport = new StreamableHTTPServerTransport({});
  await server.connect(transport);

  // Register MCP protocol handler at /mcp using the persistent transport
  app.post("/mcp", async (req, res) => {
    await transport.handleRequest(req, res, req.body);
  });
  app.get("/mcp", async (req, res) => {
    await transport.handleRequest(req, res);
  });

  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`Lexicon MCP server listening on port ${PORT}`);
  });
}



main().catch((err) => {
  console.error(`Fatal error during MCP server startup: ${err.stack || err}`);
  process.exit(1);
});



function handleSignal(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  process.exit(0);
}

['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
  process.on(signal, () => handleSignal(signal));
});


process.on('uncaughtException', (err) => {
  console.error(`Uncaught exception: ${err.stack || err}`);
  process.exit(1);
});


process.on('unhandledRejection', (reason, promise) => {
  console.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
  process.exit(1);
});


