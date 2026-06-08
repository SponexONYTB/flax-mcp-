import { z } from "zod";
import { ToolDefinition, TOOL_VERSION, ToolResult } from "../core/types";
import {
  ReadScriptSchema,
  WriteScriptSchema,
  DeleteScriptSchema,
  ExecuteScriptSchema,
} from "../core/validator";

export function createScriptTools(): ToolDefinition[] {
  return [
    {
      name: "read_script",
      version: TOOL_VERSION,
      description: "Read the content of a C# script file",
      schema: ReadScriptSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "read_script",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "write_script",
      version: TOOL_VERSION,
      description: "Create or update a C# script file",
      schema: WriteScriptSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "write_script",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "delete_script",
      version: TOOL_VERSION,
      description: "Delete a C# script file",
      schema: DeleteScriptSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "delete_script",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "execute_script",
      version: TOOL_VERSION,
      description: "Compile and execute C# code dynamically in the editor",
      schema: ExecuteScriptSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "execute_script",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
  ];
}
