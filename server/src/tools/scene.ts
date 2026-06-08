import { ToolDefinition, TOOL_VERSION, ToolContext, ToolResult, ActorNode } from "../core/types";
import {
  CreateActorSchema,
  DeleteActorSchema,
  MoveActorSchema,
  RotateActorSchema,
  ScaleActorSchema,
  DuplicateActorSchema,
  SelectActorSchema,
  GetSceneHierarchySchema,
  SceneOpenSchema,
  SceneSaveSchema,
  SceneCreateSchema,
  SceneUnloadSchema,
  SceneSetActiveSchema,
  SceneListOpenedSchema,
  SceneGetDataSchema,
  FindActorsSchema,
  SetActorParentSchema,
  ModifyActorSchema,
  AddComponentSchema,
  GetComponentSchema,
  ModifyComponentSchema,
  RemoveComponentSchema,
  ListComponentTypesSchema,
} from "../core/validator";

export function createSceneTools(): ToolDefinition[] {
  return [
    {
      name: "get_scene_hierarchy",
      version: TOOL_VERSION,
      description: "Retrieve the full scene hierarchy of the active (or specified) scene",
      schema: GetSceneHierarchySchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "get_scene_hierarchy",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "create_actor",
      version: TOOL_VERSION,
      description: "Create a new actor in the scene",
      schema: CreateActorSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "create_actor",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "delete_actor",
      version: TOOL_VERSION,
      description: "Delete an actor from the scene by ID",
      schema: DeleteActorSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "delete_actor",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "move_actor",
      version: TOOL_VERSION,
      description: "Move an actor to a new position in world space",
      schema: MoveActorSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "move_actor",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "rotate_actor",
      version: TOOL_VERSION,
      description: "Rotate an actor to a new euler rotation",
      schema: RotateActorSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "rotate_actor",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "scale_actor",
      version: TOOL_VERSION,
      description: "Scale an actor by new scale factors",
      schema: ScaleActorSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "scale_actor",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "duplicate_actor",
      version: TOOL_VERSION,
      description: "Duplicate an existing actor in the scene",
      schema: DuplicateActorSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "duplicate_actor",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "select_actor",
      version: TOOL_VERSION,
      description: "Select one or more actors in the editor",
      schema: SelectActorSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "select_actor",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "scene_open",
      version: TOOL_VERSION,
      description: "Open a scene in the editor (single or additive)",
      schema: SceneOpenSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "scene_open",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "scene_save",
      version: TOOL_VERSION,
      description: "Save the current scene",
      schema: SceneSaveSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "scene_save",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "scene_create",
      version: TOOL_VERSION,
      description: "Create a new scene asset",
      schema: SceneCreateSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "scene_create",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "scene_unload",
      version: TOOL_VERSION,
      description: "Unload an opened scene",
      schema: SceneUnloadSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "scene_unload",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "scene_set_active",
      version: TOOL_VERSION,
      description: "Set the active scene",
      schema: SceneSetActiveSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "scene_set_active",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "scene_list_opened",
      version: TOOL_VERSION,
      description: "List currently opened scenes in the editor",
      schema: SceneListOpenedSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "scene_list_opened",
          params: {},
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "scene_get_data",
      version: TOOL_VERSION,
      description: "Get root actors in a scene",
      schema: SceneGetDataSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "scene_get_data",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "find_actors",
      version: TOOL_VERSION,
      description: "Find actors by name, type, or other criteria",
      schema: FindActorsSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "find_actors",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "set_actor_parent",
      version: TOOL_VERSION,
      description: "Set parent for an actor, changing hierarchy",
      schema: SetActorParentSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "set_actor_parent",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "modify_actor",
      version: TOOL_VERSION,
      description: "Modify actor properties (name, transform, active state)",
      schema: ModifyActorSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "modify_actor",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "add_component",
      version: TOOL_VERSION,
      description: "Add a component/script to an actor",
      schema: AddComponentSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "add_component",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "get_component",
      version: TOOL_VERSION,
      description: "Get component data from an actor",
      schema: GetComponentSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "get_component",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "modify_component",
      version: TOOL_VERSION,
      description: "Modify component fields on an actor",
      schema: ModifyComponentSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "modify_component",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "remove_component",
      version: TOOL_VERSION,
      description: "Remove a component/script from an actor",
      schema: RemoveComponentSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "remove_component",
          params: params as Record<string, unknown>,
          version: TOOL_VERSION,
        });
      },
    },
    {
      name: "list_component_types",
      version: TOOL_VERSION,
      description: "List all available component types that can be added to actors",
      schema: ListComponentTypesSchema,
      handler: async (params, ctx): Promise<ToolResult> => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "list_component_types",
          params: {},
          version: TOOL_VERSION,
        });
      },
    },
  ];
}
