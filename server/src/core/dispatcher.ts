import { ToolRegistry } from "./registry";
import { McpRequest, McpResponse, ToolContext } from "./types";
import { Logger } from "../utils/logger";
import { v4 as uuid } from "uuid";
import { BridgeClient } from "../bridge/client";

export class Dispatcher {
  private registry: ToolRegistry;
  private bridge: BridgeClient;
  private logger: Logger;

  constructor(registry: ToolRegistry, bridge: BridgeClient) {
    this.registry = registry;
    this.bridge = bridge;
    this.logger = new Logger("Dispatcher");
  }

  async dispatch(request: McpRequest): Promise<McpResponse> {
    const requestId = request.id || uuid();
    this.logger.info(`Dispatching: ${request.tool} (id: ${requestId})`);

    const context: ToolContext = {
      requestId,
      bridge: this.bridge,
    };

    const result = await this.registry.execute(request.tool, request.params, context);

    const response: McpResponse = {
      id: requestId,
      success: result.success,
      data: result.data,
      error: result.error ?? null,
    };

    if (!result.success) {
      this.logger.warn(`Tool '${request.tool}' failed: ${result.error}`);
    }

    return response;
  }

  async dispatchBatch(requests: McpRequest[]): Promise<McpResponse[]> {
    return Promise.all(requests.map((req) => this.dispatch(req)));
  }

  getTools(): { name: string; version: string; description: string }[] {
    return this.registry.getAll().map((t) => ({
      name: t.name,
      version: t.version,
      description: t.description,
    }));
  }
}
