import { resolve } from "path";
import { findTypeScriptFiles } from "../utils/fs";
import { loadTsConfig, createPathResolver } from "../utils/tsconfig";
import { parseImports } from "../parser";
import { buildGraph, serializeAdjacency } from "../graph-builder";
import { logger } from "../utils/logger";
import { analyzeProgrammatically, analyzeWithLLM } from "../analyzer";
import { GeminiLLMClient } from "../llm-client";
import type { AnalysisOutput } from "../types";

/**
 * Options for the analysis service.
 */
export interface AnalysisOptions {
  /** Directory to analyze (required) */
  dir: string;
  /** Path to tsconfig.json (optional, auto-detected if not provided) */
  tsconfig?: string;
  /** Maximum number of files to analyze (optional) */
  maxFiles?: number;
  /** Maximum number of files to process concurrently (default: 10) */
  concurrency?: number;
  /** Use only programmatic analysis (skip LLM integration) */
  useProgrammaticAnalysis?: boolean;
}

/**
 * Service error class for better error handling in the Express server.
 */
export class AnalysisServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message);
    this.name = "AnalysisServiceError";
  }
}

/**
 * Analysis service that wraps the core analysis logic for use in the Express server.
 * This service provides the same functionality as the CLI but in a reusable format.
 */
export class AnalysisService {
  /**
   * Perform TypeScript dependency analysis on the specified directory.
   *
   * @param options Analysis options
   * @returns Promise resolving to the analysis result
   * @throws AnalysisServiceError for various error conditions
   */
  async analyze(options: AnalysisOptions): Promise<AnalysisOutput> {
    try {
      logger.info(
        { options },
        "Starting TypeScript dependency analysis via service",
      );

      // Validate required options
      if (!options.dir) {
        throw new AnalysisServiceError(
          "Directory path is required",
          400,
          "MISSING_DIR",
        );
      }

      // Resolve and validate the target directory
      const targetDir = resolve(options.dir);
      logger.info({ targetDir }, "Analyzing directory");

      // Find TypeScript files
      logger.debug("Finding TypeScript files");
      const files = await findTypeScriptFiles(targetDir, {
        maxFiles: options.maxFiles,
      });

      if (files.length === 0) {
        logger.error(
          { targetDir },
          "No TypeScript files found in the specified directory",
        );
        throw new AnalysisServiceError(
          "No TypeScript files found in the specified directory",
          404,
          "NO_TS_FILES",
        );
      }

      logger.info({ fileCount: files.length }, "Found TypeScript files");

      // Load TypeScript configuration
      logger.debug("Loading TypeScript configuration");
      const tsconfigPath = options.tsconfig
        ? resolve(options.tsconfig)
        : undefined;

      const tsConfig = await loadTsConfig(tsconfigPath);
      const pathResolver = createPathResolver(targetDir, tsConfig);
      logger.debug({ tsconfigPath }, "TypeScript configuration loaded");

      // Parse imports from all files
      logger.debug("Parsing imports and dependencies");
      const parsedImports = await parseImports(files, pathResolver, {
        concurrency: options.concurrency,
      });

      const totalDependencies = Object.values(parsedImports).reduce(
        (sum, deps) => sum + deps.length,
        0,
      );
      logger.info(
        { totalDependencies, uniqueFiles: Object.keys(parsedImports).length },
        "Parsed dependencies",
      );

      // Build dependency graph
      logger.debug("Building dependency graph");
      const graph = buildGraph(parsedImports);
      const adjacencyList = serializeAdjacency(graph);
      logger.info(
        {
          nodeCount: graph.nodeCount(),
          edgeCount: graph.edgeCount(),
        },
        "Dependency graph built",
      );

      // Perform analysis based on the analysis mode
      let analysisResult: AnalysisOutput;

      if (options.useProgrammaticAnalysis) {
        logger.info("Performing programmatic analysis only");
        const insights = analyzeProgrammatically(graph);
        analysisResult = {
          graph: adjacencyList,
          insights,
        };
      } else {
        logger.info("Performing LLM-enhanced analysis");
        try {
          const llmClient = new GeminiLLMClient();
          analysisResult = await analyzeWithLLM(graph, llmClient);
        } catch (error) {
          logger.warn(
            { error: error instanceof Error ? error.message : String(error) },
            "LLM analysis failed, falling back to programmatic analysis",
          );
          const insights = analyzeProgrammatically(graph);
          analysisResult = {
            graph: adjacencyList,
            insights,
          };
        }
      }

      logger.info(
        {
          circularDependencies:
            analysisResult.insights.circularDependencies.length,
          tightCoupling: analysisResult.insights.tightCoupling.length,
          recommendations: analysisResult.insights.recommendations.length,
        },
        "Analysis completed via service",
      );

      return analysisResult;
    } catch (error) {
      // Re-throw AnalysisServiceError as-is
      if (error instanceof AnalysisServiceError) {
        throw error;
      }

      // Handle known error types
      if (error instanceof Error) {
        logger.error({ error: error.message }, "Analysis failed in service");

        if (error.message.includes("ENOENT")) {
          throw new AnalysisServiceError(
            "Directory path does not exist or is not accessible",
            404,
            "DIR_NOT_FOUND",
          );
        } else if (error.message.includes("permission")) {
          throw new AnalysisServiceError(
            "Permission denied - check directory read permissions",
            403,
            "PERMISSION_DENIED",
          );
        } else if (error.message.includes("tsconfig")) {
          throw new AnalysisServiceError(
            "Invalid tsconfig.json file",
            400,
            "INVALID_TSCONFIG",
          );
        }
      }

      // Generic error fallback
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Unexpected error in analysis service",
      );
      throw new AnalysisServiceError(
        "Internal server error during analysis",
        500,
        "INTERNAL_ERROR",
      );
    }
  }

  /**
   * Validate analysis options and provide helpful error messages.
   *
   * @param options Analysis options to validate
   * @throws AnalysisServiceError for invalid options
   */
  validateOptions(options: Partial<AnalysisOptions>): void {
    if (!options.dir) {
      throw new AnalysisServiceError(
        "Directory path is required",
        400,
        "MISSING_DIR",
      );
    }

    if (
      options.maxFiles !== undefined &&
      (options.maxFiles < 1 || !Number.isInteger(options.maxFiles))
    ) {
      throw new AnalysisServiceError(
        "maxFiles must be a positive integer",
        400,
        "INVALID_MAX_FILES",
      );
    }

    if (
      options.concurrency !== undefined &&
      (options.concurrency < 1 || !Number.isInteger(options.concurrency))
    ) {
      throw new AnalysisServiceError(
        "concurrency must be a positive integer",
        400,
        "INVALID_CONCURRENCY",
      );
    }
  }
}
