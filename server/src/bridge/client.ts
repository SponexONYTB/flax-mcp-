import WebSocket from "ws";
import { McpRequest, McpResponse, BridgeClient as IBridgeClient } from "../core/types";
import { Logger } from "../utils/logger";
import { v4 as uuid } from "uuid";

interface PendingRequest {
  resolve: (value: McpResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface BridgeConfig {
  host: string;
  port: number;
  reconnectIntervalMs: number;
  maxReconnectAttempts: number;
  requestTimeoutMs: number;
}

const DEFAULT_CONFIG: BridgeConfig = {
  host: "localhost",
  port: 7777,
  reconnectIntervalMs: 3000,
  maxReconnectAttempts: 10,
  requestTimeoutMs: 30000,
};

export class BridgeClient implements IBridgeClient {
  private ws: WebSocket | null = null;
  private config: BridgeConfig;
  private logger: Logger;
  private pending: Map<string, PendingRequest> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;
  private commandQueue: McpRequest[] = [];
  private onConnectCallbacks: Array<() => void> = [];
  private onDisconnectCallbacks: Array<() => void> = [];

  constructor(config?: Partial<BridgeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = new Logger("BridgeClient");
  }

  get connected(): boolean {
    return this.isConnected;
  }

  onConnect(cb: () => void): void {
    this.onConnectCallbacks.push(cb);
  }

  onDisconnect(cb: () => void): void {
    this.onDisconnectCallbacks.push(cb);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = `ws://${this.config.host}:${this.config.port}`;
        this.logger.info(`Connecting to Flax Engine at ${url}`);

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.logger.info("Connected to Flax Engine WebSocket server");
          this.flushQueue();
          this.onConnectCallbacks.forEach((cb) => cb());
          resolve();
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this.logger.warn("Disconnected from Flax Engine");
          this.onDisconnectCallbacks.forEach((cb) => cb());
          this.scheduleReconnect();
        };

        this.ws.onerror = (err) => {
          this.logger.error("WebSocket error:", err);
          reject(err);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data as string);
        };
      } catch (err) {
        reject(err);
      }
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
    this.isConnected = false;
    this.rejectAllPending(new Error("Bridge client disconnected"));
  }

  async send(request: McpRequest): Promise<McpResponse> {
    if (!request.id) {
      request.id = uuid();
    }

    if (!this.isConnected) {
      this.commandQueue.push(request);
      return {
        id: request.id,
        success: false,
        data: null,
        error: "Not connected to Flax Engine. Request queued.",
      };
    }

    return new Promise<McpResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Request ${request.id} timed out after ${this.config.requestTimeoutMs}ms`));
      }, this.config.requestTimeoutMs);

      this.pending.set(request.id, { resolve, reject, timer });

      try {
        this.ws?.send(JSON.stringify(request));
      } catch (err) {
        this.pending.delete(request.id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  getQueueLength(): number {
    return this.commandQueue.length;
  }

  private handleMessage(raw: string): void {
    try {
      const response: McpResponse = JSON.parse(raw);
      const pending = this.pending.get(response.id);

      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(response.id);
        pending.resolve(response);
      } else {
        this.logger.warn(`Received response for unknown request: ${response.id}`);
      }
    } catch (err) {
      this.logger.error("Failed to parse WebSocket message:", raw);
    }
  }

  private flushQueue(): void {
    const queue = [...this.commandQueue];
    this.commandQueue = [];

    for (const request of queue) {
      this.send(request).catch((err) => {
        this.logger.error(`Failed to send queued request ${request.id}:`, err);
      });
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.logger.error("Max reconnect attempts reached. Giving up.");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectIntervalMs * Math.min(this.reconnectAttempts, 5);
    this.logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        this.logger.error(`Reconnect attempt failed:`, err);
      });
    }, delay);
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
