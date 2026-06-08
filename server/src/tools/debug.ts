import { z } from "zod";
import { ToolDefinition, TOOL_VERSION, ToolResult } from "../core/types";

export function createDebugTools(): ToolDefinition[] {
  return [
    {
      name: "get_tool_list",
      version: TOOL_VERSION,
      description: "List all available tools with their versions and descriptions",
      schema: z.object({}),
      handler: async (params, ctx): Promise<ToolResult> => {
        const tools = ctx.bridge;
        return {
          success: true,
          data: {
            message: "Available tools are exposed via MCP listTools. Use the bridge to inspect.",
          },
        };
      },
    },
    {
      name: "echo",
      version: TOOL_VERSION,
      description: "Echo test command to verify bridge connectivity",
      schema: z.object({
        message: z.string().default("ping").describe("Message to echo back"),
      }),
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "echo",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "ping",
      version: TOOL_VERSION,
      description: "Check if the Flax Engine bridge is connected and responsive",
      schema: z.object({}),
      handler: async (): Promise<ToolResult> => {
        return {
          success: true,
          data: { status: "ok", timestamp: new Date().toISOString() },
        };
      },
    },
  ];
}
