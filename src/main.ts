import "dotenv/config";
import { Command } from "commander";
import { resolve } from "path";
import { findTypeScriptFiles } from "./utils/fs.js";
import { loadTsConfig, createPathResolver } from "./utils/tsconfig.js";
import { parseImports } from "./parser.js";
import { buildGraph, serializeAdjacency } from "./graph-builder.js";
import { printJson, writeJsonToFile } from "./reporter.js";
import { logger } from "./utils/logger.js";

/**
 * Main CLI entry point for the TypeScript Dependency Analysis tool.
 *
 * This orchestrates the complete analysis pipeline:
 * 1. Parse command line arguments
 * 2. Find TypeScript files in the specified directory
 * 3. Load TypeScript configuration and create path resolver
 * 4. Parse imports from all files
 * 5. Build dependency graph
 * 6. Output results as JSON
 */

// Create CLI program
const program = new Command();

program
  .name("ai-analyzer")
  .description("TypeScript Dependency Analysis Tool")
  .version("1.0.0");

program
  .requiredOption("-d, --dir <path>", "Directory to analyze (required)")
  .option(
    "-o, --output <file>",
    "Output file path (optional, defaults to console output)",
  )
  .option(
    "--tsconfig <path>",
    "Path to tsconfig.json (optional, auto-detected if not provided)",
  )
  .option(
    "--max-files <number>",
    "Maximum number of files to analyze (optional)",
    (value) => parseInt(value, 10),
  );

/**
 * Main analysis function that orchestrates the entire pipeline.
 */
async function runAnalysis(options: {
  dir: string;
  output?: string;
  tsconfig?: string;
  maxFiles?: number;
}): Promise<void> {
  try {
    logger.info({ options }, "Starting TypeScript dependency analysis");

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
      process.exit(1);
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
    const parsedImports = await parseImports(files, pathResolver);

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

    // Prepare output data
    const analysisResult = {
      graph: adjacencyList,
    };

    // Output results
    if (options.output) {
      logger.info({ outputPath: options.output }, "Writing results to file");
      await writeJsonToFile(options.output, analysisResult);
      logger.info("Analysis complete! Results written to file");
    } else {
      logger.debug("Outputting results to console");
      printJson(analysisResult);
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Analysis failed",
    );

    if (error instanceof Error) {
      // Provide helpful suggestions for common errors
      if (error.message.includes("ENOENT")) {
        logger.error(
          "Tip: Please check that the directory path exists and is accessible",
        );
      } else if (error.message.includes("permission")) {
        logger.error(
          "Tip: Please check that you have read permissions for the directory",
        );
      } else if (error.message.includes("tsconfig")) {
        logger.error("Tip: Please check that the tsconfig.json file is valid");
      }
    }

    process.exit(1);
  }
}

/**
 * Parse command line arguments and run the analysis.
 */
async function main(): Promise<void> {
  program.parse(process.argv);
  const options = program.opts();

  // Validate required options
  if (!options.dir) {
    logger.error("Error: --dir option is required");
    program.help();
  }

  await runAnalysis({
    dir: options.dir,
    output: options.output,
    tsconfig: options.tsconfig,
    maxFiles: options.maxFiles,
  });
}

// Export for testing
export { runAnalysis, main };

// Run main function if this file is executed directly
// Note: This detection works when the file is compiled and run with Node.js
if (process.argv[1] && process.argv[1].endsWith("/main.js")) {
  main().catch((error) => {
    logger.fatal(
      { error: error instanceof Error ? error.message : String(error) },
      "Fatal error",
    );
    process.exit(1);
  });
}
