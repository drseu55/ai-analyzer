import type { ILLMClient } from "../../src/llm-client.js";
import type { InsightPayload } from "../../src/types.js";

/**
 * Configuration options for MockLLMClient behavior.
 */
export interface MockLLMClientOptions {
  /** Whether to include detailed analysis in recommendations */
  includeDetailedAnalysis?: boolean;
  /** Whether to simulate processing delay */
  simulateDelay?: boolean;
  /** Delay in milliseconds when simulating processing */
  delayMs?: number;
  /** Maximum number of recommendations to return */
  maxRecommendations?: number;
}

/**
 * Mock LLM client that provides deterministic insights based on graph analysis.
 *
 * This implementation analyzes the graph structure to provide realistic insights
 * without requiring external API calls, making it ideal for testing and development.
 *
 * **This is a test utility and should not be used in production code.**
 */
export class MockLLMClient implements ILLMClient {
  private readonly options: Required<MockLLMClientOptions>;

  constructor(options: MockLLMClientOptions = {}) {
    this.options = {
      includeDetailedAnalysis: options.includeDetailedAnalysis ?? true,
      simulateDelay: options.simulateDelay ?? false,
      delayMs: options.delayMs ?? 100,
      maxRecommendations: options.maxRecommendations ?? 5,
    };
  }

  /**
   * Analyzes the dependency graph and returns mock insights based on graph structure.
   *
   * @param graphJson - JSON string representation of the dependency graph
   * @returns Promise resolving to mock insights
   */
  async analyze(graphJson: string): Promise<InsightPayload> {
    // Simulate processing delay if configured
    if (this.options.simulateDelay) {
      await this.sleep(this.options.delayMs);
    }

    try {
      const parsed = JSON.parse(graphJson);

      // Validate that parsed result is an object
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error("Graph JSON must be an object");
      }

      const graph = parsed as Record<string, string[]>;
      return this.analyzeGraphStructure(graph);
    } catch (error) {
      throw new Error(
        `Failed to parse graph JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Analyzes the graph structure and generates appropriate insights.
   *
   * @param graph - Parsed dependency graph as adjacency list
   * @returns Mock insights based on graph analysis
   */
  private analyzeGraphStructure(
    graph: Record<string, string[]>,
  ): InsightPayload {
    const cycles = this.detectCycles(graph);
    const highCouplingModules = this.findHighCouplingModules(graph);
    const recommendations = this.generateRecommendations(
      graph,
      cycles,
      highCouplingModules,
    );

    return {
      circularDependencies: cycles,
      tightCoupling: highCouplingModules,
      recommendations: recommendations.slice(
        0,
        this.options.maxRecommendations,
      ),
    };
  }

  /**
   * Detects circular dependencies in the graph using a simple DFS approach.
   *
   * @param graph - Dependency graph
   * @returns Array of cycle descriptions
   */
  private detectCycles(graph: Record<string, string[]>): string[] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[] = [];

    const dfs = (node: string, path: string[]): void => {
      if (recursionStack.has(node)) {
        // Found a cycle
        const cycleStart = path.indexOf(node);
        const cyclePath = path.slice(cycleStart);
        const cycleNodes = cyclePath.map((n) => this.formatNodeName(n));
        cycles.push(
          `LLM detected cycle: ${cycleNodes.join(" → ")} → ${this.formatNodeName(node)}`,
        );
        return;
      }

      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      recursionStack.add(node);

      const dependencies = graph[node] || [];
      for (const dep of dependencies) {
        if (graph.hasOwnProperty(dep)) {
          dfs(dep, [...path, node]);
        }
      }

      recursionStack.delete(node);
    };

    for (const node of Object.keys(graph)) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }

  /**
   * Finds modules with high coupling based on fan-in and fan-out.
   *
   * @param graph - Dependency graph
   * @returns Array of tight coupling descriptions
   */
  private findHighCouplingModules(graph: Record<string, string[]>): string[] {
    const tightCoupling: string[] = [];

    // Calculate fan-out (number of dependencies each module has)
    for (const [module, dependencies] of Object.entries(graph)) {
      if (dependencies.length >= 8) {
        const moduleName = this.formatNodeName(module);
        tightCoupling.push(
          `LLM identified high complexity: ${moduleName} imports ${dependencies.length} modules (consider refactoring)`,
        );
      }
    }

    // Calculate fan-in (number of modules that depend on each module)
    const fanIn: Record<string, number> = {};
    for (const dependencies of Object.values(graph)) {
      for (const dep of dependencies) {
        fanIn[dep] = (fanIn[dep] || 0) + 1;
      }
    }

    for (const [module, count] of Object.entries(fanIn)) {
      if (count >= 6) {
        const moduleName = this.formatNodeName(module);
        tightCoupling.push(
          `LLM detected central dependency: ${moduleName} is imported by ${count} modules (potential bottleneck)`,
        );
      }
    }

    return tightCoupling;
  }

  /**
   * Generates recommendations based on the graph analysis.
   *
   * @param graph - Dependency graph
   * @param cycles - Detected cycles
   * @param highCouplingModules - High coupling modules
   * @returns Array of recommendations
   */
  private generateRecommendations(
    graph: Record<string, string[]>,
    cycles: string[],
    highCouplingModules: string[],
  ): string[] {
    const recommendations: string[] = [];
    const nodeCount = Object.keys(graph).length;
    const totalDependencies = Object.values(graph).reduce(
      (sum, deps) => sum + deps.length,
      0,
    );

    // Recommendations for cycles
    if (cycles.length > 0) {
      recommendations.push(
        `LLM suggests: Break ${cycles.length} circular ${cycles.length === 1 ? "dependency" : "dependencies"} by introducing interfaces or extracting shared logic`,
      );

      if (cycles.length > 1) {
        recommendations.push(
          "LLM recommends: Consider using dependency injection patterns to reduce coupling between modules",
        );
      }
    }

    // Recommendations for tight coupling
    if (highCouplingModules.length > 0) {
      recommendations.push(
        "LLM suggests: Refactor highly coupled modules into smaller, single-responsibility components",
      );
    }

    // General architecture recommendations
    if (nodeCount > 0) {
      const avgDependencies = totalDependencies / nodeCount;

      if (avgDependencies > 3) {
        recommendations.push(
          "LLM recommends: Reduce average dependencies per module by applying the Single Responsibility Principle",
        );
      }

      if (nodeCount > 20 && avgDependencies < 2) {
        recommendations.push(
          "LLM suggests: Consider consolidating some modules as the architecture may be over-fragmented",
        );
      }
    }

    // Specific pattern recommendations
    const hasUtilityModules = Object.keys(graph).some((key) =>
      this.formatNodeName(key).toLowerCase().includes("util"),
    );

    if (hasUtilityModules && highCouplingModules.length > 0) {
      recommendations.push(
        "LLM recommends: Split utility modules into focused, domain-specific helper modules",
      );
    }

    // Add some LLM-style insights
    if (this.options.includeDetailedAnalysis) {
      if (cycles.length === 0 && highCouplingModules.length === 0) {
        recommendations.push(
          "LLM analysis: Code architecture appears well-structured with good separation of concerns",
        );
      } else {
        recommendations.push(
          "LLM suggests: Focus on reducing coupling between modules to improve maintainability and testability",
        );
      }
    }

    return recommendations;
  }

  /**
   * Formats a node name for better readability in output.
   *
   * @param nodeName - Full path node name
   * @returns Formatted node name
   */
  private formatNodeName(nodeName: string): string {
    // Extract just the filename without extension for readability
    const parts = nodeName.split("/");
    const filename = parts[parts.length - 1];
    return filename.replace(/\.(ts|tsx)$/, "");
  }

  /**
   * Sleep utility for simulating processing delay.
   *
   * @param ms - Milliseconds to sleep
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create mock LLM clients for testing.
 */
export class MockLLMClientFactory {
  /**
   * Creates a mock LLM client for testing and development.
   *
   * @param options - Configuration options for the mock client
   * @returns Mock LLM client instance
   */
  static create(options?: MockLLMClientOptions): ILLMClient {
    return new MockLLMClient(options);
  }

  /**
   * Creates a mock client with realistic delay simulation.
   *
   * @returns Mock LLM client with delay enabled
   */
  static createWithDelay(): ILLMClient {
    return new MockLLMClient({
      simulateDelay: true,
      delayMs: 100,
    });
  }

  /**
   * Creates a mock client optimized for fast testing.
   *
   * @returns Mock LLM client optimized for speed
   */
  static createFast(): ILLMClient {
    return new MockLLMClient({
      simulateDelay: false,
      includeDetailedAnalysis: false,
      maxRecommendations: 3,
    });
  }
}
