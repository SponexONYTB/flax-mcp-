export interface BridgeRequest {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  version: string;
}

export interface BridgeResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error: string | null;
}

export enum BridgeEventType {
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  ERROR = "error",
  STATE_UPDATE = "state_update",
}

export interface BridgeEvent {
  type: BridgeEventType;
  timestamp: string;
  payload?: unknown;
}

export interface EngineState {
  connected: boolean;
  playMode: "stopped" | "playing" | "paused";
  activeScene: string;
  selectedActors: string[];
  fps: number;
}

export const BRIDGE_DEFAULTS = {
  HOST: "localhost",
  PORT: 7777,
  RECONNECT_INTERVAL_MS: 3000,
  MAX_RECONNECT_ATTEMPTS: 10,
  REQUEST_TIMEOUT_MS: 30000,
} as const;
