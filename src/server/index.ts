import "dotenv/config";
import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import { createRouter, errorHandler } from "./routes";
import { logger } from "../utils/logger";

/**
 * Server configuration interface.
 */
interface ServerConfig {
  port?: number;
  host?: string;
  cors: {
    origin: string | string[] | boolean;
    credentials: boolean;
  };
}

/**
 * Creates and configures the Express application.
 */
export function createApp(config?: Partial<ServerConfig>): Application {
  const app = express();

  // Default configuration
  const defaultConfig: ServerConfig = {
    cors: {
      origin: process.env.CORS_ORIGIN || true,
      credentials: true,
    },
  };

  const finalConfig = { ...defaultConfig, ...config };

  // Global middleware
  app.use(cors(finalConfig.cors));

  // Body parsing middleware
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Log request
    logger.info(
      {
        method: req.method,
        url: req.url,
        userAgent: req.get("User-Agent"),
        ip: req.ip,
        contentLength: req.get("Content-Length"),
      },
      "HTTP request received",
    );

    // Log response when finished
    res.on("finish", () => {
      const duration = Date.now() - startTime;
      logger.info(
        {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          contentLength: res.get("Content-Length"),
        },
        "HTTP request completed",
      );
    });

    next();
  });

  // API routes
  const apiRouter = createRouter();
  app.use("/api", apiRouter);

  // Root endpoint redirect to API info
  app.get("/", (_req: Request, res: Response) => {
    res.redirect("/api");
  });

  // 404 handler for unmatched routes
  app.use((req: Request, res: Response) => {
    logger.warn(
      {
        method: req.method,
        url: req.url,
        ip: req.ip,
      },
      "Route not found",
    );

    res.status(404).json({
      success: false,
      error: {
        message: "Route not found",
        code: "ROUTE_NOT_FOUND",
        statusCode: 404,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Global error handler
  app.use(errorHandler);

  // Global unhandled error handler (last resort)
  app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.fatal(
      {
        error: error.message,
        stack: error.stack,
        method: req.method,
        url: req.url,
      },
      "Unhandled error in Express application",
    );

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: {
          message: "Internal server error",
          code: "UNHANDLED_ERROR",
          statusCode: 500,
        },
        timestamp: new Date().toISOString(),
      });
    }
  });

  return app;
}

/**
 * Starts the Express server.
 */
export async function startServer(
  config?: Partial<ServerConfig>,
): Promise<void> {
  const app = createApp(config);

  const defaultConfig = {
    port: parseInt(process.env.PORT || "3000", 10),
    host: process.env.HOST || "localhost",
  };

  const finalConfig = { ...defaultConfig, ...config };

  return new Promise((resolve, reject) => {
    const server = app.listen(finalConfig.port, finalConfig.host, () => {
      logger.info(
        {
          port: finalConfig.port,
          host: finalConfig.host,
          environment: process.env.NODE_ENV || "development",
        },
        "Express server started successfully",
      );
      resolve();
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        logger.error(
          { port: finalConfig.port, host: finalConfig.host },
          "Port is already in use",
        );
        reject(new Error(`Port ${finalConfig.port} is already in use`));
      } else {
        logger.error(
          { error: error.message, code: error.code },
          "Server startup error",
        );
        reject(error);
      }
    });

    // Graceful shutdown handling
    const gracefulShutdown = (signal: string) => {
      logger.info(
        { signal },
        "Received shutdown signal, closing server gracefully",
      );

      server.close((error) => {
        if (error) {
          logger.error(
            { error: error.message },
            "Error during server shutdown",
          );
          process.exit(1);
        } else {
          logger.info("Server closed successfully");
          process.exit(0);
        }
      });
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  });
}

/**
 * Main function to start the server when this file is executed directly.
 */
async function main(): Promise<void> {
  try {
    await startServer();
  } catch (error) {
    logger.fatal(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to start server",
    );
    process.exit(1);
  }
}

// Export for testing and external use
export { ServerConfig, main };

// Start server if this file is executed directly
// Note: This detection works when the file is compiled and run with Node.js
if (process.argv[1] && process.argv[1].endsWith("/index.js")) {
  main().catch((error) => {
    logger.fatal(
      { error: error instanceof Error ? error.message : String(error) },
      "Fatal server error",
    );
    process.exit(1);
  });
}
