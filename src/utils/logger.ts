import pino from "pino";
/**
 * Configured pino logger instance.
 * Log level is controlled by LOG_LEVEL environment variable, defaults to 'info'.
 * Supports: trace, debug, info, warn, error, fatal
 *
 * In development (NODE_ENV !== 'production'), uses pino-pretty for human-readable logs.
 * In production, outputs structured JSON for log aggregation systems.
 */
const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";
const logger = pino({
  level: isTest ? "silent" : process.env.LOG_LEVEL || "info",
  // Only use pretty transport in development (not in production or tests)
  ...(isProduction || isTest
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "yyyy-mm-dd HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
});

export { logger };
