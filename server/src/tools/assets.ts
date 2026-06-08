import { z } from "zod";
import { ToolDefinition, TOOL_VERSION, ToolResult } from "../core/types";
import {
  ImportAssetSchema,
  AssignMaterialSchema,
  FindAssetsSchema,
  CreateAssetFolderSchema,
  DeleteAssetSchema,
  CopyAssetSchema,
  MoveAssetSchema,
  RefreshAssetsSchema,
  CreateMaterialSchema,
} from "../core/validator";

export function createAssetTools(): ToolDefinition[] {
  return [
    {
      name: "import_asset",
      version: TOOL_VERSION,
      description: "Import an external asset file into the Flax project",
      schema: ImportAssetSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "import_asset",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "assign_material",
      version: TOOL_VERSION,
      description: "Assign a material to a specific slot on an actor",
      schema: AssignMaterialSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "assign_material",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "get_assets",
      version: TOOL_VERSION,
      description: "List assets in the project content directory",
      schema: z.object({
        path: z.string().default("Content").describe("Relative path within project"),
        filter: z.string().optional().describe("Optional name filter"),
        recursive: z.boolean().default(true),
        maxResults: z.number().int().positive().default(100),
      }),
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "get_assets",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "find_assets",
      version: TOOL_VERSION,
      description: "Find assets using search filters",
      schema: FindAssetsSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "find_assets",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "create_asset_folder",
      version: TOOL_VERSION,
      description: "Create new folder(s) in the project content directory",
      schema: CreateAssetFolderSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "create_asset_folder",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "delete_asset",
      version: TOOL_VERSION,
      description: "Delete an asset from the project",
      schema: DeleteAssetSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "delete_asset",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "copy_asset",
      version: TOOL_VERSION,
      description: "Copy/duplicate an asset",
      schema: CopyAssetSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "copy_asset",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "move_asset",
      version: TOOL_VERSION,
      description: "Move or rename an asset",
      schema: MoveAssetSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "move_asset",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "refresh_assets",
      version: TOOL_VERSION,
      description: "Force asset database refresh",
      schema: RefreshAssetsSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "refresh_assets",
          params: {},
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "create_material",
      version: TOOL_VERSION,
      description: "Create a new material asset",
      schema: CreateMaterialSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "create_material",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
  ];
}
