import { z } from "zod";
import { ToolDefinition, TOOL_VERSION, ToolResult } from "../core/types";
import {
  PlayModeSchema,
  TakeScreenshotSchema,
  GetConsoleLogsSchema,
  GetProjectInfoSchema,
  ScreenshotCameraSchema,
} from "../core/validator";

export function createEditorTools(): ToolDefinition[] {
  return [
    {
      name: "play_control",
      version: TOOL_VERSION,
      description: "Control editor play mode (play, stop, pause, step)",
      schema: PlayModeSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "play_control",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "take_screenshot",
      version: TOOL_VERSION,
      description: "Capture the editor viewport as a screenshot",
      schema: TakeScreenshotSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "take_screenshot",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "get_editor_state",
      version: TOOL_VERSION,
      description: "Get current editor state including selection, play mode, active scene",
      schema: z.object({}),
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "get_editor_state",
          params: {},
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "get_active_scene",
      version: TOOL_VERSION,
      description: "Get the name and path of the currently active scene",
      schema: z.object({}),
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "get_active_scene",
          params: {},
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "get_console_logs",
      version: TOOL_VERSION,
      description: "Retrieve editor console logs",
      schema: GetConsoleLogsSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "get_console_logs",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "get_project_info",
      version: TOOL_VERSION,
      description: "Get project metadata and structure info",
      schema: GetProjectInfoSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "get_project_info",
          params: {},
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "screenshot_camera",
      version: TOOL_VERSION,
      description: "Capture a screenshot from a specific camera",
      schema: ScreenshotCameraSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "screenshot_camera",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
  ];
}
