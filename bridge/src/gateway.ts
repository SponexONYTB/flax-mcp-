import WebSocket from "ws";
import { v4 as uuid } from "uuid";
import {
  BridgeRequest,
  BridgeResponse,
  BridgeEvent,
  BridgeEventType,
  BRIDGE_DEFAULTS,
  EngineState,
} from "./protocol";

interface PendingEntry {
  resolve: (value: BridgeResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface GatewayConfig {
  host: string;
  port: number;
  reconnectIntervalMs: number;
  maxReconnectAttempts: number;
  requestTimeoutMs: number;
}

const DEFAULT_CONFIG: GatewayConfig = {
  host: BRIDGE_DEFAULTS.HOST,
  port: BRIDGE_DEFAULTS.PORT,
  reconnectIntervalMs: BRIDGE_DEFAULTS.RECONNECT_INTERVAL_MS,
  maxReconnectAttempts: BRIDGE_DEFAULTS.MAX_RECONNECT_ATTEMPTS,
  requestTimeoutMs: BRIDGE_DEFAULTS.REQUEST_TIMEOUT_MS,
};

export class BridgeGateway {
  private ws: WebSocket | null = null;
  private config: GatewayConfig;
  private pending: Map<string, PendingEntry> = new Map();
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;
  private queue: BridgeRequest[] = [];
  private eventListeners: Map<BridgeEventType, Array<(event: BridgeEvent) => void>> = new Map();

  private _engineState: EngineState = {
    connected: false,
    playMode: "stopped",
    activeScene: "",
    selectedActors: [],
    fps: 0,
  };

  constructor(config?: Partial<GatewayConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get connected(): boolean {
    return this._connected;
  }

  get engineState(): EngineState {
    return { ...this._engineState };
  }

  on(event: BridgeEventType, listener: (event: BridgeEvent) => void): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(listener);
    this.eventListeners.set(event, listeners);
  }

  off(event: BridgeEventType, listener: (event: BridgeEvent) => void): void {
    let listeners = this.eventListeners.get(event) || [];
    listeners = listeners.filter((l) => l !== listener);
    this.eventListeners.set(event, listeners);
  }

  private emit(event: BridgeEvent): void {
    const listeners = this.eventListeners.get(event.type) || [];
    for (const listener of listeners) {
      listener(event);
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://${this.config.host}:${this.config.port}`;

      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        this._connected = true;
        this.attempt = 0;
        this._engineState.connected = true;

        this.flushQueue();

        this.emit({
          type: BridgeEventType.CONNECTED,
          timestamp: new Date().toISOString(),
        });

        resolve();
      });

      this.ws.on("close", () => {
        this._connected = false;
        this._engineState.connected = false;

        this.emit({
          type: BridgeEventType.DISCONNECTED,
          timestamp: new Date().toISOString(),
        });

        this.rejectAllPending(new Error("Connection closed"));
        this.scheduleReconnect();
      });

      this.ws.on("error", (err) => {
        this.emit({
          type: BridgeEventType.ERROR,
          timestamp: new Date().toISOString(),
          payload: { message: err.message },
        });

        if (!this._connected) {
          reject(err);
        }
      });

      this.ws.on("message", (raw: string) => {
        this.handleResponse(raw);
      });
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    this._engineState.connected = false;
  }

  async send(request: Partial<BridgeRequest> & { tool: string }): Promise<BridgeResponse> {
    const fullRequest: BridgeRequest = {
      id: request.id || uuid(),
      tool: request.tool,
      params: request.params || {},
      version: request.version || "1.0",
    };

    if (!this._connected) {
      this.queue.push(fullRequest);
      return {
        id: fullRequest.id,
        success: false,
        error: "Not connected to Flax Engine. Request queued.",
      };
    }

    return new Promise<BridgeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(fullRequest.id);
        reject(new Error(`Request ${fullRequest.id} timed out after ${this.config.requestTimeoutMs}ms`));
      }, this.config.requestTimeoutMs);

      this.pending.set(fullRequest.id, { resolve, reject, timer });

      try {
        this.ws!.send(JSON.stringify(fullRequest));
      } catch (err) {
        this.pending.delete(fullRequest.id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  queueLength(): number {
    return this.queue.length;
  }

  private handleResponse(raw: string): void {
    try {
      const response: BridgeResponse = JSON.parse(raw);
      const pending = this.pending.get(response.id);

      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(response.id);
        pending.resolve(response);
      }

      // Auto-update engine state from response data
      if (response.data && typeof response.data === "object") {
        this.syncEngineState(response.data as Record<string, unknown>);
      }
    } catch {
      // Non-JSON message — might be a state push
      try {
        const event = JSON.parse(raw);
        if (event.type === "state_update" && event.payload) {
          this.syncEngineState(event.payload);
        }
      } catch {
        // Ignore malformed messages
      }
    }
  }

  private syncEngineState(data: Record<string, unknown>): void {
    if (data.playMode !== undefined) this._engineState.playMode = data.playMode as EngineState["playMode"];
    if (data.activeScene !== undefined) this._engineState.activeScene = data.activeScene as string;
    if (data.selectedActors !== undefined) this._engineState.selectedActors = data.selectedActors as string[];
    if (data.fps !== undefined) this._engineState.fps = data.fps as number;

    this.emit({
      type: BridgeEventType.STATE_UPDATE,
      timestamp: new Date().toISOString(),
      payload: this._engineState,
    });
  }

  private flushQueue(): void {
    const queue = [...this.queue];
    this.queue = [];
    for (const req of queue) {
      this.send(req).catch(() => {});
    }
  }

  private scheduleReconnect(): void {
    if (this.attempt >= this.config.maxReconnectAttempts) return;

    this.attempt++;
    const delay = this.config.reconnectIntervalMs * Math.min(this.attempt, 5);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
    }, delay);
  }

  private rejectAllPending(error: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }
}
