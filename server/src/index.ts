import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { ToolRegistry } from "./core/registry";
import { Dispatcher } from "./core/dispatcher";
import { BridgeClient } from "./bridge/client";
import { randomUUID } from "crypto";
import { createSceneTools } from "./tools/scene";
import { createAssetTools } from "./tools/assets";
import { createEditorTools } from "./tools/editor";
import { createScriptTools } from "./tools/script";
import { createDebugTools } from "./tools/debug";
import { rootLogger } from "./utils/logger";

async function main() {
  const logger = rootLogger;
  logger.info("Starting Flax MCP Server...");

  // -- Bridge Setup --
  const bridge = new BridgeClient({
    host: process.env.FLAX_WS_HOST || "localhost",
    port: parseInt(process.env.FLAX_WS_PORT || "7777", 10),
    reconnectIntervalMs: parseInt(process.env.FLAX_WS_RECONNECT_MS || "3000", 10),
    maxReconnectAttempts: parseInt(process.env.FLAX_WS_MAX_RETRIES || "10", 10),
    requestTimeoutMs: parseInt(process.env.FLAX_WS_TIMEOUT_MS || "30000", 10),
  });

  bridge.onConnect(() => logger.info("Bridge connected to Flax Engine"));
  bridge.onDisconnect(() => logger.warn("Bridge disconnected from Flax Engine"));

  // Connect (non-blocking — server starts even if engine is not running)
  bridge.connect().catch((err) => {
    logger.warn(`Initial bridge connection failed (engine may not be running): ${err.message}`);
    logger.info("MCP Server will continue and retry connection automatically");
  });

  // -- Registry Setup --
  const registry = new ToolRegistry();

  // Optional whitelist via environment
  if (process.env.FLAX_TOOL_WHITELIST) {
    const whitelist = JSON.parse(process.env.FLAX_TOOL_WHITELIST);
    registry.setWhitelist(whitelist);
  }

  registry.registerBatch(createSceneTools());
  registry.registerBatch(createAssetTools());
  registry.registerBatch(createEditorTools());
  registry.registerBatch(createScriptTools());
  registry.registerBatch(createDebugTools());

  logger.info(`Registered ${registry.getAll().length} tools`);

  // -- Dispatcher Setup --
  const dispatcher = new Dispatcher(registry, bridge);

  // -- MCP Server --
  const server = new Server(
    {
      name: "flax-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = dispatcher.getTools();
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: {
          type: "object" as const,
          properties: {},
          additionalProperties: true,
        },
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const mcpRequest = {
      id: randomUUID(),
      tool: name,
      params: (args as Record<string, unknown>) || {},
      version: "1.0",
    };

    const result = await dispatcher.dispatch(mcpRequest);

    if (!result.success) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: result.error }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result.data ?? { success: true }),
        },
      ],
    };
  });

  // -- Transport --
  const transport = new StdioServerTransport();
  logger.info("Attaching MCP server to stdio transport...");

  await server.connect(transport);

  logger.info("Flax MCP Server is running. Waiting for messages via stdio...");

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    bridge.disconnect();
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  rootLogger.error("Fatal error:", err);
  process.exit(1);
});
