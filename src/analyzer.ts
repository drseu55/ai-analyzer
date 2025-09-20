import type { Graph } from "@dagrejs/graphlib";
import { findCycles, computeFanInOut } from "./graph-builder.js";
import type { InsightPayload } from "./types.js";
import { basename } from "path";

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
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Find circular dependencies
  const circularDependencies = detectCircularDependencies(graph, opts);

  // Detect tight coupling
  const tightCoupling = detectTightCoupling(graph, opts);

  // Generate recommendations
  const recommendations = generateRecommendations(graph, opts);

  return {
    circularDependencies,
    tightCoupling,
    recommendations,
  };
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
 * Validates that the analysis output conforms to the InsightPayload schema.
 * This function can be used in tests to ensure schema compliance.
 *
 * @param insight - The insight payload to validate
 * @returns True if valid, throws error if invalid
 */
export function validateInsightPayload(insight: InsightPayload): boolean {
  if (typeof insight !== "object" || insight === null) {
    throw new Error("InsightPayload must be an object");
  }

  if (!Array.isArray(insight.circularDependencies)) {
    throw new Error("circularDependencies must be an array");
  }

  if (!Array.isArray(insight.tightCoupling)) {
    throw new Error("tightCoupling must be an array");
  }

  if (!Array.isArray(insight.recommendations)) {
    throw new Error("recommendations must be an array");
  }

  // Validate that all items are strings
  const allItems = [
    ...insight.circularDependencies,
    ...insight.tightCoupling,
    ...insight.recommendations,
  ];

  for (const item of allItems) {
    if (typeof item !== "string") {
      throw new Error("All insight items must be strings");
    }
  }

  return true;
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
 * Analyzes the overall health of a dependency graph.
 *
 * @param graph - The dependency graph
 * @returns Object containing health metrics and status
 */
export function analyzeGraphHealth(graph: Graph): {
  status: "healthy" | "concerning" | "problematic";
  score: number;
  metrics: {
    nodeCount: number;
    edgeCount: number;
    cycleCount: number;
    avgFanOut: number;
    maxFanOut: number;
    maxFanIn: number;
  };
  issues: string[];
} {
  const nodeCount = graph.nodeCount();
  const edgeCount = graph.edgeCount();
  const cycles = findCycles(graph);
  const { fanIn, fanOut } = computeFanInOut(graph);

  const fanOutValues = Object.values(fanOut);
  const fanInValues = Object.values(fanIn);

  const avgFanOut =
    fanOutValues.length > 0
      ? fanOutValues.reduce((sum, val) => sum + val, 0) / fanOutValues.length
      : 0;
  const maxFanOut = fanOutValues.length > 0 ? Math.max(...fanOutValues) : 0;
  const maxFanIn = fanInValues.length > 0 ? Math.max(...fanInValues) : 0;

  const metrics = {
    nodeCount,
    edgeCount,
    cycleCount: cycles.length,
    avgFanOut,
    maxFanOut,
    maxFanIn,
  };

  const issues: string[] = [];
  let score = 100;

  // Deduct points for various issues
  if (cycles.length > 0) {
    issues.push(`${cycles.length} circular dependencies found`);
    score -= cycles.length * 25; // More severe penalty for cycles
  }

  if (maxFanOut > 15) {
    issues.push(`Very high fan-out detected (${maxFanOut})`);
    score -= 30;
  } else if (maxFanOut > 10) {
    issues.push(`High fan-out detected (${maxFanOut})`);
    score -= 20;
  }

  if (maxFanIn > 15) {
    issues.push(`Very high fan-in detected (${maxFanIn})`);
    score -= 25;
  } else if (maxFanIn > 10) {
    issues.push(`High fan-in detected (${maxFanIn})`);
    score -= 15;
  }

  if (avgFanOut > 8) {
    issues.push(`High average fan-out (${avgFanOut.toFixed(1)})`);
    score -= 15;
  }

  // Ensure score doesn't go below 0
  score = Math.max(0, score);

  let status: "healthy" | "concerning" | "problematic";
  if (score >= 80) {
    status = "healthy";
  } else if (score >= 60) {
    status = "concerning";
  } else {
    status = "problematic";
  }

  return {
    status,
    score,
    metrics,
    issues,
  };
}
