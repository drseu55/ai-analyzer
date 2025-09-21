import { Router, Request, Response, NextFunction } from "express";
import {
  AnalysisService,
  AnalysisServiceError,
  type AnalysisOptions,
} from "./service";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";

/**
 * Request interface for the analysis endpoint with query parameters.
 */
interface AnalysisRequest extends Request {
  query: {
    dir?: string;
    tsconfig?: string;
    maxFiles?: string;
    concurrency?: string;
    useProgrammaticAnalysis?: string;
  };
}

/**
 * Creates and configures the Express router with analysis endpoints.
 */
export function createRouter(): Router {
  const router = Router();
  const analysisService = new AnalysisService();

  /**
   * GET /analyze - Analyze TypeScript dependencies
   *
   * Query Parameters:
   * - dir: Directory to analyze (required)
   * - tsconfig: Path to tsconfig.json (optional)
   * - maxFiles: Maximum number of files to analyze (optional)
   * - concurrency: Maximum concurrent file processing (optional, default: 10)
   * - useProgrammaticAnalysis: Use programmatic analysis only (optional, "true" to enable)
   *
   * Response:
   * - 200: Analysis result as JSON
   * - 400: Bad request (invalid parameters)
   * - 404: Directory not found or no TypeScript files
   * - 403: Permission denied
   * - 500: Internal server error
   */
  router.get(
    "/analyze",
    async (req: AnalysisRequest, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const requestId = uuidv4();

      try {
        logger.info(
          {
            requestId,
            query: req.query,
            userAgent: req.get("User-Agent"),
            ip: req.ip,
          },
          "Analysis request received",
        );

        // Parse and validate query parameters
        const options: AnalysisOptions = {
          dir: req.query.dir || "",
          tsconfig: req.query.tsconfig,
          maxFiles: req.query.maxFiles
            ? parseInt(req.query.maxFiles, 10)
            : undefined,
          concurrency: req.query.concurrency
            ? parseInt(req.query.concurrency, 10)
            : undefined,
          useProgrammaticAnalysis: req.query.useProgrammaticAnalysis === "true",
        };

        // Validate options
        analysisService.validateOptions(options);

        // Perform analysis
        const result = await analysisService.analyze(options);

        const duration = Date.now() - startTime;
        logger.info(
          {
            requestId,
            duration,
            nodeCount: Object.keys(result.graph).length,
            totalEdges: Object.values(result.graph).reduce(
              (sum, deps) => sum + deps.length,
              0,
            ),
            circularDependencies: result.insights.circularDependencies.length,
            tightCoupling: result.insights.tightCoupling.length,
            recommendations: result.insights.recommendations.length,
          },
          "Analysis completed successfully",
        );

        // Set response headers
        res.set({
          "Content-Type": "application/json",
          "X-Request-ID": requestId,
          "X-Analysis-Duration": duration.toString(),
        });

        // Send response
        res.status(200).json({
          success: true,
          requestId,
          duration,
          timestamp: new Date().toISOString(),
          result,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * GET / - API information endpoint
   *
   * Response:
   * - 200: API information and usage
   */
  router.get("/", (_req: Request, res: Response) => {
    res.status(200).json({
      name: "TypeScript Dependency Analysis API",
      version: "1.0.0",
      description: "API for analyzing TypeScript project dependencies",
      endpoints: {
        "GET /": "API information",
        "GET /api/analyze": "Analyze TypeScript dependencies",
      },
      usage: {
        analyze: {
          method: "GET",
          url: "/analyze",
          parameters: {
            dir: {
              type: "string",
              required: true,
              description: "Directory to analyze",
              example: "/path/to/typescript/project",
            },
            tsconfig: {
              type: "string",
              required: false,
              description: "Path to tsconfig.json",
              example: "/path/to/tsconfig.json",
            },
            maxFiles: {
              type: "number",
              required: false,
              description: "Maximum number of files to analyze",
              example: "1000",
            },
            concurrency: {
              type: "number",
              required: false,
              description: "Maximum concurrent file processing (default: 10)",
              example: "5",
            },
            useProgrammaticAnalysis: {
              type: "boolean",
              required: false,
              description: "Use programmatic analysis only (skip LLM)",
              example: "true",
            },
          },
        },
      },
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

/**
 * Error handling middleware for the analysis routes.
 * Converts AnalysisServiceError instances into appropriate HTTP responses.
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = res.get("X-Request-ID") || uuidv4();

  // Handle AnalysisServiceError with specific status codes
  if (error instanceof AnalysisServiceError) {
    logger.warn(
      {
        requestId,
        error: error.message,
        statusCode: error.statusCode,
        code: error.code,
        query: req.query,
      },
      "Analysis service error",
    );

    res.status(error.statusCode).json({
      success: false,
      requestId,
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle generic errors
  logger.error(
    {
      requestId,
      error: error.message,
      stack: error.stack,
      query: req.query,
    },
    "Unexpected error in analysis route",
  );

  res.status(500).json({
    success: false,
    requestId,
    error: {
      message: "Internal server error",
      code: "INTERNAL_ERROR",
      statusCode: 500,
    },
    timestamp: new Date().toISOString(),
  });
}
