export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

export class Logger {
  private level: LogLevel;
  private context: string;

  constructor(context: string, level: LogLevel = LogLevel.INFO) {
    this.context = context;
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, args);
  }

  private log(level: LogLevel, message: string, args: unknown[]): void {
    if (level < this.level) return;

    const timestamp = new Date().toISOString();
    const label = LOG_LEVEL_LABELS[level];
    const prefix = `[${timestamp}] [${label}] [${this.context}]`;

    if (args.length > 0) {
      console.error(`${prefix} ${message}`, ...args);
    } else {
      console.error(`${prefix} ${message}`);
    }
  }

  child(childContext: string): Logger {
    return new Logger(`${this.context}:${childContext}`, this.level);
  }
}

export const rootLogger = new Logger("FlaxMcp");
