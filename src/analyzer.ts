import type { Graph } from "@dagrejs/graphlib";
import {
  findCycles,
  computeFanInOut,
  serializeAdjacency,
} from "./graph-builder";
import type { InsightPayload, AnalysisOutput } from "./types";
import { AnalysisOutputSchema } from "./types";
import type { ILLMClient } from "./llm-client";
import { basename } from "path";
import { logger } from "./utils/logger";

/**
 * Options for configuring the programmatic analyzer
 */
export interface AnalyzerOptions {
  /** Threshold for considering high fan-in (default: 5) */
  fanInThreshold?: number;
  /** Threshold for considering high fan-out (default: 10) */
  fanOutThreshold?: number;
  /** Whether to use basenames instead of full paths for readability (default: true) */
  useBasenames?: boolean;
}

/**
 * Default analyzer options
 */
const DEFAULT_OPTIONS: Required<AnalyzerOptions> = {
  fanInThreshold: 5,
  fanOutThreshold: 10,
  useBasenames: true,
};

/**
 * Programmatically analyzes a dependency graph to extract insights without LLM.
 *
 * This function provides a fallback analysis when LLM services are unavailable,
 * detecting circular dependencies, tight coupling, and generating basic recommendations.
 *
 * @param graph - The dependency graph to analyze
 * @param options - Configuration options for analysis thresholds
 * @returns InsightPayload containing programmatic analysis results
 */
export function analyzeProgrammatically(
  graph: Graph,
  options: AnalyzerOptions = {},
): InsightPayload {
  logger.debug(
    {
      nodeCount: graph.nodeCount(),
      edgeCount: graph.edgeCount(),
      options,
    },
    "Starting programmatic analysis",
  );

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Find circular dependencies
  logger.debug("Detecting circular dependencies");
  const circularDependencies = detectCircularDependencies(graph, opts);

  // Detect tight coupling
  logger.debug("Detecting tight coupling");
  const tightCoupling = detectTightCoupling(graph, opts);

  // Generate recommendations
  logger.debug("Generating recommendations");
  const recommendations = generateRecommendations(graph, opts);

  const result = {
    circularDependencies,
    tightCoupling,
    recommendations,
  };

  logger.info(
    {
      circularDependenciesCount: circularDependencies.length,
      tightCouplingCount: tightCoupling.length,
      recommendationsCount: recommendations.length,
    },
    "Programmatic analysis completed",
  );

  return result;
}

/**
 * Detects circular dependencies in the graph and formats them as readable strings.
 *
 * @param graph - The dependency graph
 * @param options - Analyzer options
 * @returns Array of circular dependency descriptions
 */
function detectCircularDependencies(
  graph: Graph,
  options: Required<AnalyzerOptions>,
): string[] {
  const cycles = findCycles(graph);

  return cycles.map((cycle) => {
    const nodeNames = cycle.map((node) =>
      options.useBasenames ? basename(node, ".ts") : node,
    );

    // Create a cycle description like "A -> B -> C -> A"
    const cycleDescription = [...nodeNames, nodeNames[0]].join(" -> ");
    return `Circular dependency: ${cycleDescription}`;
  });
}

/**
 * Detects modules with tight coupling based on fan-in and fan-out metrics.
 *
 * @param graph - The dependency graph
 * @param options - Analyzer options with thresholds
 * @returns Array of tight coupling descriptions
 */
function detectTightCoupling(
  graph: Graph,
  options: Required<AnalyzerOptions>,
): string[] {
  const { fanIn, fanOut } = computeFanInOut(graph);
  const tightCoupling: string[] = [];

  // Check for high fan-in (many modules depend on this one)
  for (const [node, count] of Object.entries(fanIn)) {
    if (count >= options.fanInThreshold) {
      const nodeName = options.useBasenames ? basename(node, ".ts") : node;
      tightCoupling.push(
        `High fan-in: ${nodeName} is depended upon by ${count} modules`,
      );
    }
  }

  // Check for high fan-out (this module depends on many others)
  for (const [node, count] of Object.entries(fanOut)) {
    if (count >= options.fanOutThreshold) {
      const nodeName = options.useBasenames ? basename(node, ".ts") : node;
      tightCoupling.push(
        `High fan-out: ${nodeName} depends on ${count} modules`,
      );
    }
  }

  // Sort for consistent output
  return tightCoupling.sort();
}

/**
 * Generates actionable recommendations based on the analysis results.
 *
 * @param graph - The dependency graph
 * @param options - Analyzer options
 * @returns Array of recommendation strings
 */
function generateRecommendations(
  graph: Graph,
  options: Required<AnalyzerOptions>,
): string[] {
  const recommendations: string[] = [];
  const cycles = findCycles(graph);
  const { fanIn, fanOut } = computeFanInOut(graph);

  // Recommendations for circular dependencies
  if (cycles.length > 0) {
    recommendations.push(
      `Found ${cycles.length} circular dependency cycles. Consider refactoring to break these cycles by introducing interfaces or moving shared code to separate modules.`,
    );

    // Specific recommendations for cycles
    for (const cycle of cycles.slice(0, 3)) {
      // Limit to first 3 for brevity
      const nodeNames = cycle.map((node) =>
        options.useBasenames ? basename(node, ".ts") : node,
      );
      recommendations.push(
        `Break cycle involving: ${nodeNames.join(", ")}. Consider extracting common dependencies or using dependency injection.`,
      );
    }
  }

  // Recommendations for high fan-out modules
  const highFanOutModules = Object.entries(fanOut)
    .filter(([, count]) => count >= options.fanOutThreshold)
    .sort(([, a], [, b]) => b - a); // Sort by count descending

  for (const [node, count] of highFanOutModules.slice(0, 3)) {
    // Limit to top 3
    const nodeName = options.useBasenames ? basename(node, ".ts") : node;
    recommendations.push(
      `Consider splitting ${nodeName}: it has high fan-out (${count} dependencies). Split into smaller, more focused modules.`,
    );
  }

  // Recommendations for high fan-in modules
  const highFanInModules = Object.entries(fanIn)
    .filter(([, count]) => count >= options.fanInThreshold)
    .sort(([, a], [, b]) => b - a); // Sort by count descending

  for (const [node, count] of highFanInModules.slice(0, 3)) {
    // Limit to top 3
    const nodeName = options.useBasenames ? basename(node, ".ts") : node;
    if (count >= options.fanInThreshold * 2) {
      // Very high fan-in
      recommendations.push(
        `Consider extracting interfaces from ${nodeName}: it has very high fan-in (${count} dependents). This might indicate it's doing too much.`,
      );
    } else {
      recommendations.push(
        `Monitor ${nodeName}: it has high fan-in (${count} dependents). Ensure it maintains a stable API.`,
      );
    }
  }

  // General recommendations based on graph structure
  const nodeCount = graph.nodeCount();
  const edgeCount = graph.edgeCount();

  if (nodeCount > 0) {
    const avgDependenciesPerModule = edgeCount / nodeCount;

    if (avgDependenciesPerModule > 5) {
      recommendations.push(
        `The project has high average dependencies per module (${avgDependenciesPerModule.toFixed(1)}). Consider reducing coupling between modules.`,
      );
    }

    if (nodeCount > 50 && edgeCount / nodeCount < 2) {
      recommendations.push(
        "The project has many modules with low interconnectivity. Consider if some modules can be consolidated or if the architecture is too fragmented.",
      );
    }
  }

  return recommendations;
}

/**
 * Formats file paths for better readability in analysis output.
 *
 * @param filePath - The file path to format
 * @param useBasename - Whether to use basename or full path
 * @returns Formatted file path
 */
export function formatFilePath(filePath: string, useBasename = true): string {
  if (useBasename) {
    return basename(filePath, ".ts");
  }
  return filePath;
}

/**
 * Analyzes a dependency graph using LLM-provided insights only.
 *
 * This function provides LLM-based analysis by:
 * 1. Serializing the graph to adjacency list format
 * 2. Getting LLM insights for advanced analysis
 * 3. Validating the final output
 *
 * @param graph - The dependency graph to analyze
 * @param llm - LLM client for getting insights
 * @returns Promise resolving to validated AnalysisOutput with LLM insights
 */
export async function analyzeWithLLM(
  graph: Graph,
  llm: ILLMClient,
): Promise<AnalysisOutput> {
  logger.info(
    {
      nodeCount: graph.nodeCount(),
      edgeCount: graph.edgeCount(),
    },
    "Starting LLM analysis",
  );

  const adjacencyList = serializeAdjacency(graph);

  logger.debug(
    {
      serializedSize: JSON.stringify(adjacencyList).length,
    },
    "Serialized graph for LLM analysis",
  );

  const llmInsights = await llm.analyze(JSON.stringify(adjacencyList));

  logger.debug(
    {
      circularDependenciesFound: llmInsights.circularDependencies.length,
      tightCouplingFound: llmInsights.tightCoupling.length,
      recommendationsGenerated: llmInsights.recommendations.length,
    },
    "LLM analysis completed",
  );

  const output: AnalysisOutput = {
    graph: adjacencyList,
    insights: llmInsights,
  };

  const validationResult = AnalysisOutputSchema.safeParse(output);
  if (!validationResult.success) {
    logger.error(
      {
        error: validationResult.error.message,
      },
      "Analysis output validation failed",
    );
    throw new Error(
      `Analysis output validation failed: ${validationResult.error.message}`,
    );
  }

  logger.info("LLM analysis validation successful");
  return validationResult.data;
}
