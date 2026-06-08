import { ToolDefinition, ToolContext, ToolResult, TOOL_VERSION, WhitelistConfig } from "./types";
import { Logger } from "../utils/logger";

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private logger: Logger;
  private whitelist: WhitelistConfig | null = null;

  constructor() {
    this.logger = new Logger("ToolRegistry");
  }

  register(tool: ToolDefinition): void {
    const key = this.toolKey(tool.name, tool.version);
    if (this.tools.has(key)) {
      this.logger.warn(`Overwriting existing tool: ${key}`);
    }
    this.tools.set(key, tool);
    this.logger.info(`Registered tool: ${key}`);
  }

  registerBatch(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string, version: string = TOOL_VERSION): ToolDefinition | undefined {
    return this.tools.get(this.toolKey(name, version));
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getAllToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  async execute(name: string, params: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${name}. Available tools: ${this.getAll().map(t => t.name).join(", ")}`,
      };
    }

    if (this.whitelist?.enabled && !this.isAllowed(name)) {
      return {
        success: false,
        error: `Tool '${name}' is not in the whitelist.`,
      };
    }

    const parsed = tool.schema.safeParse(params);
    if (!parsed.success) {
      return {
        success: false,
        error: `Validation failed for '${name}': ${parsed.error.message}`,
      };
    }

    try {
      return await tool.handler(parsed.data, context);
    } catch (err) {
      this.logger.error(`Execution error in '${name}':`, err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  setWhitelist(config: WhitelistConfig): void {
    this.whitelist = config;
    if (config.enabled) {
      this.logger.info(`Whitelist enabled with ${config.allowedTools.length} tools`);
    }
  }

  private isAllowed(toolName: string): boolean {
    if (!this.whitelist) return true;
    return this.whitelist.allowedTools.includes(toolName);
  }

  private toolKey(name: string, version: string): string {
    return `${name}@${version}`;
  }
}
