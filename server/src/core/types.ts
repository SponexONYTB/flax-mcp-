import { z } from "zod";

export const TOOL_VERSION = "1.0";

export interface ToolDefinition<T = any> {
  name: string;
  version: string;
  description: string;
  schema: z.ZodSchema<T>;
  handler: (params: T, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  requestId: string;
  bridge: BridgeClient;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface McpRequest {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  version: string;
}

export interface McpResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error: string | null;
}

export interface BridgeClient {
  send(request: McpRequest): Promise<McpResponse>;
}

export interface EditorState {
  isPlaying: boolean;
  isPaused: boolean;
  activeScene: string;
  selectedActorIds: string[];
  fps: number;
  totalActorCount: number;
}

export interface ActorNode {
  id: string;
  name: string;
  type: string;
  children: ActorNode[];
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
}

export interface AssetInfo {
  id: string;
  name: string;
  path: string;
  type: string;
}

export interface SceneHierarchy {
  sceneName: string;
  actors: ActorNode[];
}

export interface CommandSafetyRule {
  toolName: string;
  allowedParams?: string[];
  requiresConfirmation?: boolean;
  maxBatchSize?: number;
}

export interface WhitelistConfig {
  enabled: boolean;
  allowedTools: string[];
  rules: CommandSafetyRule[];
}
