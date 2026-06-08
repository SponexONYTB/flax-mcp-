export class McpError extends Error {
  constructor(
    message: string,
    public readonly code: McpErrorCode,
    public readonly tool?: string,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = "McpError";
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.message,
      code: this.code,
      tool: this.tool ?? null,
      requestId: this.requestId ?? null,
    };
  }
}

export enum McpErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  TOOL_NOT_FOUND = "TOOL_NOT_FOUND",
  EXECUTION_ERROR = "EXECUTION_ERROR",
  BRIDGE_DISCONNECTED = "BRIDGE_DISCONNECTED",
  REQUEST_TIMEOUT = "REQUEST_TIMEOUT",
  ENGINE_ERROR = "ENGINE_ERROR",
  WHITELIST_DENIED = "WHITELIST_DENIED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export function isMcpError(err: unknown): err is McpError {
  return err instanceof McpError;
}

export function toErrorResult(error: unknown, tool?: string, requestId?: string): { success: false; error: string } {
  if (isMcpError(error)) {
    return { success: false, error: error.message };
  }
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: String(error) };
}
