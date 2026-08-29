export interface LoggerPort {
  info(message: string, context?: string): void;
  warn(message: string, context?: string): void;
  error(message: string, context?: string): void;
  debug(message: string, context?: string): void;
}

export class ConsoleLogger implements LoggerPort {
  constructor(private readonly prefix?: string) {}

  info(message: string, context?: string): void {
    this.log("INFO", message, context);
  }

  warn(message: string, context?: string): void {
    this.log("WARN", message, context);
  }

  error(message: string, context?: string): void {
    this.log("ERROR", message, context);
  }

  debug(message: string, context?: string): void {
    this.log("DEBUG", message, context);
  }

  private log(level: string, message: string, context?: string): void {
    const prefix = this.prefix ? `[${this.prefix}]` : "";
    const ctx = context ? ` (${context})` : "";
    // eslint-disable-next-line no-console
    console.log(`${prefix}[${level}]${ctx} ${message}`);
  }
}
