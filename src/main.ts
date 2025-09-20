#!/usr/bin/env node

import { Command } from "commander";
import { config as loadDotEnv } from "dotenv";
import { resolve } from "path";
import { findTypeScriptFiles } from "./utils/fs.js";
import { loadTsConfig, createPathResolver } from "./utils/tsconfig.js";
import { parseImports } from "./parser.js";
import { buildGraph, serializeAdjacency } from "./graph-builder.js";
import { printJson, writeJsonToFile } from "./reporter.js";

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

// Load environment variables from .env file
loadDotEnv();

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
    console.error("Starting TypeScript dependency analysis...");

    // Resolve and validate the target directory
    const targetDir = resolve(options.dir);
    console.error(`Analyzing directory: ${targetDir}`);

    // Find TypeScript files
    console.error("Finding TypeScript files...");
    const files = await findTypeScriptFiles(targetDir, {
      maxFiles: options.maxFiles,
    });

    if (files.length === 0) {
      console.error("No TypeScript files found in the specified directory");
      process.exit(1);
    }

    console.error(`Found ${files.length} TypeScript files`);

    // Load TypeScript configuration
    console.error("Loading TypeScript configuration...");
    const tsconfigPath = options.tsconfig
      ? resolve(options.tsconfig)
      : undefined;

    const tsConfig = await loadTsConfig(tsconfigPath);
    const pathResolver = createPathResolver(targetDir, tsConfig);

    // Parse imports from all files
    console.error("Parsing imports and dependencies...");
    const parsedImports = await parseImports(files, pathResolver);

    const totalDependencies = Object.values(parsedImports).reduce(
      (sum, deps) => sum + deps.length,
      0,
    );
    console.error(`Parsed ${totalDependencies} dependencies`);

    // Build dependency graph
    console.error("Building dependency graph...");
    const graph = buildGraph(parsedImports);
    const adjacencyList = serializeAdjacency(graph);

    // Prepare output data
    const analysisResult = {
      graph: adjacencyList,
    };

    // Output results
    if (options.output) {
      console.error(`Writing results to: ${options.output}`);
      await writeJsonToFile(options.output, analysisResult);
      console.error("Analysis complete! Results written to file.");
    } else {
      console.error("Outputting results to console:");
      printJson(analysisResult);
    }
  } catch (error) {
    console.error("Analysis failed:");

    if (error instanceof Error) {
      console.error(`${error.message}`);

      // Provide helpful suggestions for common errors
      if (error.message.includes("ENOENT")) {
        console.error(
          "Tip: Please check that the directory path exists and is accessible",
        );
      } else if (error.message.includes("permission")) {
        console.error(
          "Tip: Please check that you have read permissions for the directory",
        );
      } else if (error.message.includes("tsconfig")) {
        console.error("Tip: Please check that the tsconfig.json file is valid");
      }
    } else {
      console.error(`   Unknown error: ${String(error)}`);
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
    console.error("Error: --dir option is required");
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
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
