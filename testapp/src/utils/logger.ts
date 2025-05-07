/**
 * Logger utility for consistent logging across the application
 */

/**
 * Log levels for the application
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

/**
 * Current log level for the application
 * Can be set via environment variable LOG_LEVEL
 */
const currentLogLevel = (() => {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  switch (envLevel) {
    case 'DEBUG': return LogLevel.DEBUG;
    case 'INFO': return LogLevel.INFO;
    case 'WARN': return LogLevel.WARN;
    case 'ERROR': return LogLevel.ERROR;
    default: return LogLevel.INFO; // Default level
  }
})();

/**
 * Logger class for consistent log formatting
 */
export class Logger {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Format a log message with timestamp and context
   */
  private formatMessage(message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${this.name}] ${message}`;
  }

  /**
   * Log debug level message
   */
  debug(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.DEBUG) {
      console.debug(this.formatMessage(message), ...args);
    }
  }

  /**
   * Log info level message
   */
  info(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.INFO) {
      console.info(this.formatMessage(message), ...args);
    }
  }

  /**
   * Log warning level message
   */
  warn(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.WARN) {
      console.warn(this.formatMessage(message), ...args);
    }
  }

  /**
   * Log error level message
   */
  error(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.ERROR) {
      console.error(this.formatMessage(message), ...args);
    }
  }
}