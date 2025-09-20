import pkg from "@dagrejs/graphlib";
import type { Graph } from "@dagrejs/graphlib";
import {
  analyzeProgrammatically,
  validateInsightPayload,
  formatFilePath,
  analyzeGraphHealth,
  type AnalyzerOptions,
} from "../src/analyzer.js";
import type { InsightPayload } from "../src/types.js";

const { Graph: GraphConstructor } = pkg;

describe("Programmatic Analyzer", () => {
  /**
   * Helper function to create a test graph from an adjacency mapping
   */
  function createTestGraph(adjacency: Record<string, string[]>): Graph {
    const graph = new GraphConstructor({ directed: true });

    // Add all nodes
    for (const node of Object.keys(adjacency)) {
      graph.setNode(node);
    }
    for (const deps of Object.values(adjacency)) {
      for (const dep of deps) {
        graph.setNode(dep);
      }
    }

    // Add edges
    for (const [source, deps] of Object.entries(adjacency)) {
      for (const dep of deps) {
        graph.setEdge(source, dep);
      }
    }

    return graph;
  }

  describe("analyzeProgrammatically", () => {
    it("should handle empty graph", () => {
      const graph = new GraphConstructor({ directed: true });
      const result = analyzeProgrammatically(graph);

      expect(result).toHaveProperty("circularDependencies");
      expect(result).toHaveProperty("tightCoupling");
      expect(result).toHaveProperty("recommendations");

      expect(result.circularDependencies).toEqual([]);
      expect(result.tightCoupling).toEqual([]);
      expect(result.recommendations).toEqual([]);

      // Validate schema compliance
      expect(() => validateInsightPayload(result)).not.toThrow();
    });

    it("should handle simple acyclic graph", () => {
      const graph = createTestGraph({
        "/src/main.ts": ["/src/utils.ts", "/src/config.ts"],
        "/src/utils.ts": ["/src/helpers.ts"],
        "/src/config.ts": [],
        "/src/helpers.ts": [],
      });

      const result = analyzeProgrammatically(graph);

      expect(result.circularDependencies).toEqual([]);
      expect(result.tightCoupling).toEqual([]); // No modules exceed default thresholds
      expect(result.recommendations).toEqual([]); // No issues to recommend fixes for

      expect(() => validateInsightPayload(result)).not.toThrow();
    });

    it("should detect circular dependencies", () => {
      const graph = createTestGraph({
        "/src/a.ts": ["/src/b.ts"],
        "/src/b.ts": ["/src/c.ts"],
        "/src/c.ts": ["/src/a.ts"], // Creates cycle: a -> b -> c -> a
        "/src/standalone.ts": [],
      });

      const result = analyzeProgrammatically(graph);

      expect(result.circularDependencies).toHaveLength(1);
      expect(result.circularDependencies[0]).toContain("Circular dependency:");
      expect(result.circularDependencies[0]).toContain("a -> b -> c -> a");

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(
        result.recommendations.some((rec) => rec.includes("circular")),
      ).toBe(true);

      expect(() => validateInsightPayload(result)).not.toThrow();
    });

    it("should detect multiple circular dependencies", () => {
      const graph = createTestGraph({
        // First cycle: a -> b -> a
        "/src/a.ts": ["/src/b.ts"],
        "/src/b.ts": ["/src/a.ts"],
        // Second cycle: x -> y -> z -> x
        "/src/x.ts": ["/src/y.ts"],
        "/src/y.ts": ["/src/z.ts"],
        "/src/z.ts": ["/src/x.ts"],
      });

      const result = analyzeProgrammatically(graph);

      expect(result.circularDependencies).toHaveLength(2);
      expect(
        result.circularDependencies.some((cycle) =>
          cycle.includes("a -> b -> a"),
        ),
      ).toBe(true);
      expect(
        result.circularDependencies.some((cycle) =>
          cycle.includes("x -> y -> z -> x"),
        ),
      ).toBe(true);

      expect(() => validateInsightPayload(result)).not.toThrow();
    });

    it("should detect high fan-out with default threshold", () => {
      // Create a module that depends on many others (>= 10 for default threshold)
      const dependencies = Array.from(
        { length: 12 },
        (_, i) => `/src/dep${i}.ts`,
      );
      const graph = createTestGraph({
        "/src/hub.ts": dependencies,
        ...Object.fromEntries(dependencies.map((dep) => [dep, []])),
      });

      const result = analyzeProgrammatically(graph);

      expect(result.tightCoupling.length).toBeGreaterThan(0);
      expect(
        result.tightCoupling.some((coupling) =>
          coupling.includes("High fan-out: hub depends on 12 modules"),
        ),
      ).toBe(true);

      expect(
        result.recommendations.some((rec) => rec.includes("splitting hub")),
      ).toBe(true);

      expect(() => validateInsightPayload(result)).not.toThrow();
    });

    it("should detect high fan-in with default threshold", () => {
      // Create a module that many others depend on (>= 5 for default threshold)
      const dependents = Array.from(
        { length: 7 },
        (_, i) => `/src/client${i}.ts`,
      );
      const adjacency: Record<string, string[]> = {
        "/src/shared.ts": [],
      };
      dependents.forEach((client) => {
        adjacency[client] = ["/src/shared.ts"];
      });

      const graph = createTestGraph(adjacency);
      const result = analyzeProgrammatically(graph);

      expect(result.tightCoupling.length).toBeGreaterThan(0);
      expect(
        result.tightCoupling.some((coupling) =>
          coupling.includes(
            "High fan-in: shared is depended upon by 7 modules",
          ),
        ),
      ).toBe(true);

      expect(
        result.recommendations.some((rec) => rec.includes("Monitor shared")),
      ).toBe(true);

      expect(() => validateInsightPayload(result)).not.toThrow();
    });

    it("should respect custom thresholds", () => {
      const graph = createTestGraph({
        "/src/moderate.ts": ["/src/dep1.ts", "/src/dep2.ts", "/src/dep3.ts"],
        "/src/dep1.ts": [],
        "/src/dep2.ts": [],
        "/src/dep3.ts": [],
      });

      // With default thresholds (fanOut: 10), should not detect tight coupling
      const defaultResult = analyzeProgrammatically(graph);
      expect(defaultResult.tightCoupling).toEqual([]);

      // With custom low threshold (fanOut: 2), should detect tight coupling
      const customOptions: AnalyzerOptions = {
        fanOutThreshold: 2,
        fanInThreshold: 2,
      };
      const customResult = analyzeProgrammatically(graph, customOptions);
      expect(customResult.tightCoupling.length).toBeGreaterThan(0);
      expect(
        customResult.tightCoupling.some((coupling) =>
          coupling.includes("High fan-out: moderate depends on 3 modules"),
        ),
      ).toBe(true);

      expect(() => validateInsightPayload(customResult)).not.toThrow();
    });

    it("should use basenames when useBasenames is true", () => {
      const graph = createTestGraph({
        "/long/path/to/src/moduleA.ts": ["/long/path/to/src/moduleB.ts"],
        "/long/path/to/src/moduleB.ts": ["/long/path/to/src/moduleA.ts"],
      });

      const result = analyzeProgrammatically(graph, { useBasenames: true });

      expect(result.circularDependencies[0]).toContain(
        "moduleA -> moduleB -> moduleA",
      );
      expect(result.circularDependencies[0]).not.toContain(
        "/long/path/to/src/",
      );

      expect(() => validateInsightPayload(result)).not.toThrow();
    });

    it("should use full paths when useBasenames is false", () => {
      const graph = createTestGraph({
        "/src/moduleA.ts": ["/src/moduleB.ts"],
        "/src/moduleB.ts": ["/src/moduleA.ts"],
      });

      const result = analyzeProgrammatically(graph, { useBasenames: false });

      expect(result.circularDependencies[0]).toContain("/src/moduleA.ts");
      expect(result.circularDependencies[0]).toContain("/src/moduleB.ts");

      expect(() => validateInsightPayload(result)).not.toThrow();
    });

    it("should generate recommendations for complex scenarios", () => {
      // Create a complex graph with multiple issues
      const graph = createTestGraph({
        // Circular dependency
        "/src/cycle1.ts": ["/src/cycle2.ts"],
        "/src/cycle2.ts": ["/src/cycle1.ts"],
        // High fan-out module
        "/src/god-object.ts": Array.from(
          { length: 15 },
          (_, i) => `/src/service${i}.ts`,
        ),
        // High fan-in module
        "/src/shared-util.ts": [],
        ...Object.fromEntries(
          Array.from({ length: 8 }, (_, i) => [
            `/src/client${i}.ts`,
            ["/src/shared-util.ts"],
          ]),
        ),
        ...Object.fromEntries(
          Array.from({ length: 15 }, (_, i) => [`/src/service${i}.ts`, []]),
        ),
      });

      const result = analyzeProgrammatically(graph);

      // Should detect the cycle
      expect(result.circularDependencies.length).toBeGreaterThan(0);

      // Should detect tight coupling
      expect(result.tightCoupling.length).toBeGreaterThan(0);
      expect(
        result.tightCoupling.some((coupling) =>
          coupling.includes("High fan-out: god-object"),
        ),
      ).toBe(true);
      expect(
        result.tightCoupling.some((coupling) =>
          coupling.includes("High fan-in: shared-util"),
        ),
      ).toBe(true);

      // Should have multiple recommendations
      expect(result.recommendations.length).toBeGreaterThan(2);
      expect(
        result.recommendations.some((rec) => rec.includes("circular")),
      ).toBe(true);
      expect(
        result.recommendations.some((rec) =>
          rec.includes("splitting god-object"),
        ),
      ).toBe(true);

      expect(() => validateInsightPayload(result)).not.toThrow();
    });

    it("should limit recommendations to avoid overwhelming output", () => {
      // Create many modules with high fan-out
      const adjacency: Record<string, string[]> = {};
      for (let i = 0; i < 10; i++) {
        adjacency[`/src/module${i}.ts`] = Array.from(
          { length: 12 },
          (_, j) => `/src/dep${i}-${j}.ts`,
        );
        // Add dependencies as empty modules
        for (let j = 0; j < 12; j++) {
          adjacency[`/src/dep${i}-${j}.ts`] = [];
        }
      }

      const graph = createTestGraph(adjacency);
      const result = analyzeProgrammatically(graph);

      // Should limit recommendations even though there are many issues
      expect(result.recommendations.length).toBeLessThan(20); // Reasonable limit

      expect(() => validateInsightPayload(result)).not.toThrow();
    });
  });

  describe("validateInsightPayload", () => {
    it("should validate correct InsightPayload", () => {
      const validPayload: InsightPayload = {
        circularDependencies: ["cycle1", "cycle2"],
        tightCoupling: ["coupling1"],
        recommendations: ["recommendation1", "recommendation2"],
      };

      expect(() => validateInsightPayload(validPayload)).not.toThrow();
    });

    it("should reject non-object payload", () => {
      expect(() =>
        validateInsightPayload(null as unknown as InsightPayload),
      ).toThrow("InsightPayload must be an object");
      expect(() =>
        validateInsightPayload("invalid" as unknown as InsightPayload),
      ).toThrow("InsightPayload must be an object");
    });

    it("should reject invalid circularDependencies", () => {
      const invalidPayload = {
        circularDependencies: "not an array",
        tightCoupling: [],
        recommendations: [],
      };

      expect(() =>
        validateInsightPayload(invalidPayload as unknown as InsightPayload),
      ).toThrow("circularDependencies must be an array");
    });

    it("should reject non-string items", () => {
      const invalidPayload = {
        circularDependencies: [123, "valid"],
        tightCoupling: [],
        recommendations: [],
      };

      expect(() =>
        validateInsightPayload(invalidPayload as unknown as InsightPayload),
      ).toThrow("All insight items must be strings");
    });
  });

  describe("formatFilePath", () => {
    it("should return basename when useBasename is true", () => {
      expect(formatFilePath("/long/path/to/module.ts", true)).toBe("module");
      expect(formatFilePath("/src/utils.ts", true)).toBe("utils");
    });

    it("should return full path when useBasename is false", () => {
      expect(formatFilePath("/long/path/to/module.ts", false)).toBe(
        "/long/path/to/module.ts",
      );
    });

    it("should default to basename when useBasename is not specified", () => {
      expect(formatFilePath("/src/module.ts")).toBe("module");
    });
  });

  describe("analyzeGraphHealth", () => {
    it("should rate empty graph as healthy", () => {
      const graph = new GraphConstructor({ directed: true });
      const health = analyzeGraphHealth(graph);

      expect(health.status).toBe("healthy");
      expect(health.score).toBe(100);
      expect(health.issues).toEqual([]);
      expect(health.metrics.nodeCount).toBe(0);
    });

    it("should rate simple healthy graph", () => {
      const graph = createTestGraph({
        "/src/main.ts": ["/src/utils.ts"],
        "/src/utils.ts": ["/src/helpers.ts"],
        "/src/helpers.ts": [],
      });

      const health = analyzeGraphHealth(graph);

      expect(health.status).toBe("healthy");
      expect(health.score).toBeGreaterThanOrEqual(80);
      expect(health.issues).toEqual([]);
    });

    it("should detect problematic graph with cycles", () => {
      const graph = createTestGraph({
        "/src/a.ts": ["/src/b.ts"],
        "/src/b.ts": ["/src/c.ts"],
        "/src/c.ts": ["/src/a.ts"], // Creates cycle
      });

      const health = analyzeGraphHealth(graph);

      expect(health.status).toBe("concerning");
      expect(health.score).toBeLessThan(100);
      expect(health.issues.some((issue) => issue.includes("circular"))).toBe(
        true,
      );
      expect(health.metrics.cycleCount).toBe(1);
    });

    it("should detect high fan-out issues", () => {
      const dependencies = Array.from(
        { length: 20 },
        (_, i) => `/src/dep${i}.ts`,
      );
      const graph = createTestGraph({
        "/src/god-module.ts": dependencies,
        ...Object.fromEntries(dependencies.map((dep) => [dep, []])),
      });

      const health = analyzeGraphHealth(graph);

      expect(health.status).toBe("concerning");
      expect(health.score).toBeLessThan(80);
      expect(
        health.issues.some((issue) => issue.includes("Very high fan-out")),
      ).toBe(true);
      expect(health.metrics.maxFanOut).toBe(20);
    });

    it("should handle multiple issues and score appropriately", () => {
      // Create a graph with multiple problems
      const graph = createTestGraph({
        // Cycles
        "/src/cycle1.ts": ["/src/cycle2.ts"],
        "/src/cycle2.ts": ["/src/cycle1.ts"],
        // High fan-out
        "/src/god.ts": Array.from({ length: 25 }, (_, i) => `/src/dep${i}.ts`),
        ...Object.fromEntries(
          Array.from({ length: 25 }, (_, i) => [`/src/dep${i}.ts`, []]),
        ),
      });

      const health = analyzeGraphHealth(graph);

      expect(health.status).toBe("problematic");
      expect(health.score).toBeLessThan(60);
      expect(health.issues.length).toBeGreaterThan(1);
    });

    it("should provide detailed metrics", () => {
      const graph = createTestGraph({
        "/src/hub.ts": ["/src/a.ts", "/src/b.ts", "/src/c.ts"],
        "/src/a.ts": ["/src/shared.ts"],
        "/src/b.ts": ["/src/shared.ts"],
        "/src/c.ts": ["/src/shared.ts"],
        "/src/shared.ts": [],
      });

      const health = analyzeGraphHealth(graph);

      expect(health.metrics.nodeCount).toBe(5);
      expect(health.metrics.edgeCount).toBe(6);
      expect(health.metrics.avgFanOut).toBeCloseTo(1.2, 1);
      expect(health.metrics.maxFanOut).toBe(3);
      expect(health.metrics.maxFanIn).toBe(3);
      expect(health.metrics.cycleCount).toBe(0);
    });
  });

  describe("Integration with graph-builder functions", () => {
    it("should work correctly with findCycles results", () => {
      const graph = createTestGraph({
        "/src/a.ts": ["/src/b.ts"],
        "/src/b.ts": ["/src/c.ts"],
        "/src/c.ts": ["/src/d.ts"],
        "/src/d.ts": ["/src/a.ts"], // Long cycle
      });

      const result = analyzeProgrammatically(graph);

      expect(result.circularDependencies).toHaveLength(1);
      expect(result.circularDependencies[0]).toContain("a -> b -> c -> d -> a");
    });

    it("should work correctly with computeFanInOut results", () => {
      const graph = createTestGraph({
        "/src/central.ts": [],
        "/src/client1.ts": ["/src/central.ts"],
        "/src/client2.ts": ["/src/central.ts"],
        "/src/client3.ts": ["/src/central.ts"],
        "/src/client4.ts": ["/src/central.ts"],
        "/src/client5.ts": ["/src/central.ts"],
        "/src/client6.ts": ["/src/central.ts"], // 6 clients -> fan-in of 6
      });

      const result = analyzeProgrammatically(graph);

      expect(result.tightCoupling).toHaveLength(1);
      expect(result.tightCoupling[0]).toContain(
        "High fan-in: central is depended upon by 6 modules",
      );
    });
  });

  describe("Edge cases and robustness", () => {
    it("should handle graph with single node", () => {
      const graph = createTestGraph({
        "/src/lonely.ts": [],
      });

      const result = analyzeProgrammatically(graph);

      expect(result.circularDependencies).toEqual([]);
      expect(result.tightCoupling).toEqual([]);
      expect(result.recommendations).toEqual([]);
      expect(() => validateInsightPayload(result)).not.toThrow();
    });

    it("should handle disconnected graph components", () => {
      const graph = createTestGraph({
        // Component 1
        "/src/comp1/a.ts": ["/src/comp1/b.ts"],
        "/src/comp1/b.ts": [],
        // Component 2 (disconnected)
        "/src/comp2/x.ts": ["/src/comp2/y.ts"],
        "/src/comp2/y.ts": [],
      });

      const result = analyzeProgrammatically(graph);

      expect(result.circularDependencies).toEqual([]);
      expect(() => validateInsightPayload(result)).not.toThrow();
    });

    it("should handle very large threshold values", () => {
      const graph = createTestGraph({
        "/src/normal.ts": ["/src/dep1.ts", "/src/dep2.ts"],
        "/src/dep1.ts": [],
        "/src/dep2.ts": [],
      });

      const result = analyzeProgrammatically(graph, {
        fanInThreshold: 1000,
        fanOutThreshold: 1000,
      });

      expect(result.tightCoupling).toEqual([]);
      expect(() => validateInsightPayload(result)).not.toThrow();
    });
  });
});
