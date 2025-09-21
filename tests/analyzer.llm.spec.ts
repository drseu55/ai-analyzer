import { analyzeWithLLM } from "../src/analyzer.js";
import { buildGraph } from "../src/graph-builder.js";
import type { InsightPayload } from "../src/types.js";
import { MockLLMClient } from "./mocks/llm-client.mock.js";

describe("analyzeWithLLM", () => {
  let mockLLMClient: MockLLMClient;

  beforeEach(() => {
    mockLLMClient = new MockLLMClient();
  });

  describe("Basic functionality", () => {
    it("should return LLM insights only", async () => {
      // Create a simple graph with a cycle
      const adjacency = {
        "/src/a.ts": ["/src/b.ts"],
        "/src/b.ts": ["/src/a.ts"],
        "/src/c.ts": [],
      };
      const graph = buildGraph(adjacency);

      // Mock LLM to return specific insights
      const mockLLMInsights: InsightPayload = {
        circularDependencies: ["LLM detected: a.ts → b.ts → a.ts"],
        tightCoupling: ["LLM found high coupling in a.ts"],
        recommendations: ["LLM suggests breaking the cycle with interfaces"],
      };
      jest.spyOn(mockLLMClient, "analyze").mockResolvedValue(mockLLMInsights);

      const result = await analyzeWithLLM(graph, mockLLMClient);

      // Verify structure
      expect(result).toHaveProperty("graph");
      expect(result).toHaveProperty("insights");
      expect(result.graph).toEqual(adjacency);

      // Verify LLM was called with correct adjacency
      expect(mockLLMClient.analyze).toHaveBeenCalledWith(
        JSON.stringify(adjacency),
      );

      // Verify insights contain only LLM insights
      expect(result.insights).toEqual(mockLLMInsights);
      expect(result.insights.circularDependencies).toEqual([
        "LLM detected: a.ts → b.ts → a.ts",
      ]);
      expect(result.insights.tightCoupling).toEqual([
        "LLM found high coupling in a.ts",
      ]);
      expect(result.insights.recommendations).toEqual([
        "LLM suggests breaking the cycle with interfaces",
      ]);
    });

    it("should handle empty graph", async () => {
      const adjacency = {};
      const graph = buildGraph(adjacency);

      const mockLLMInsights: InsightPayload = {
        circularDependencies: [],
        tightCoupling: [],
        recommendations: ["LLM suggests adding some code"],
      };
      jest.spyOn(mockLLMClient, "analyze").mockResolvedValue(mockLLMInsights);

      const result = await analyzeWithLLM(graph, mockLLMClient);

      expect(result.graph).toEqual({});
      expect(result.insights).toEqual(mockLLMInsights);
      expect(result.insights.circularDependencies).toEqual([]);
      expect(result.insights.tightCoupling).toEqual([]);
      expect(result.insights.recommendations).toEqual([
        "LLM suggests adding some code",
      ]);
    });

    it("should handle large graph with multiple issues", async () => {
      const adjacency = {
        "/src/hub.ts": ["/src/a.ts", "/src/b.ts", "/src/c.ts", "/src/d.ts"],
        "/src/a.ts": ["/src/b.ts"],
        "/src/b.ts": ["/src/c.ts"],
        "/src/c.ts": ["/src/hub.ts"], // Creates cycle: hub → a → b → c → hub
        "/src/d.ts": ["/src/e.ts"],
        "/src/e.ts": [],
      };
      const graph = buildGraph(adjacency);

      const mockLLMInsights: InsightPayload = {
        circularDependencies: ["Complex cycle detected involving hub.ts"],
        tightCoupling: [
          "hub.ts has excessive dependencies",
          "Consider dependency injection",
        ],
        recommendations: [
          "Break hub.ts into smaller modules",
          "Use event-driven architecture",
          "Implement proper layering",
        ],
      };
      jest.spyOn(mockLLMClient, "analyze").mockResolvedValue(mockLLMInsights);

      const result = await analyzeWithLLM(graph, mockLLMClient);

      // Should have only LLM insights
      expect(result.insights).toEqual(mockLLMInsights);
      expect(result.insights.circularDependencies).toEqual([
        "Complex cycle detected involving hub.ts",
      ]);
      expect(result.insights.tightCoupling).toEqual([
        "hub.ts has excessive dependencies",
        "Consider dependency injection",
      ]);
      expect(result.insights.recommendations).toEqual([
        "Break hub.ts into smaller modules",
        "Use event-driven architecture",
        "Implement proper layering",
      ]);
    });
  });

  describe("LLM insights handling", () => {
    it("should return exact LLM insights without modification", async () => {
      const adjacency = {
        "/src/a.ts": ["/src/b.ts"],
        "/src/b.ts": ["/src/a.ts"],
      };
      const graph = buildGraph(adjacency);

      const mockLLMInsights: InsightPayload = {
        circularDependencies: ["Circular dependency: a.ts → b.ts → a.ts"],
        tightCoupling: [],
        recommendations: [
          "Break circular dependencies",
          "Use dependency injection",
        ],
      };
      jest.spyOn(mockLLMClient, "analyze").mockResolvedValue(mockLLMInsights);

      const result = await analyzeWithLLM(graph, mockLLMClient);

      // Should return exactly what LLM provided
      expect(result.insights).toEqual(mockLLMInsights);
      expect(result.insights.circularDependencies).toEqual([
        "Circular dependency: a.ts → b.ts → a.ts",
      ]);
      expect(result.insights.tightCoupling).toEqual([]);
      expect(result.insights.recommendations).toEqual([
        "Break circular dependencies",
        "Use dependency injection",
      ]);
    });

    it("should pass through LLM insights with duplicates if present", async () => {
      const adjacency = { "/src/a.ts": [] };
      const graph = buildGraph(adjacency);

      const mockLLMInsights: InsightPayload = {
        circularDependencies: [],
        tightCoupling: [],
        recommendations: [
          "First recommendation",
          "Second recommendation",
          "First recommendation", // LLM returned duplicate
          "Third recommendation",
        ],
      };
      jest.spyOn(mockLLMClient, "analyze").mockResolvedValue(mockLLMInsights);

      const result = await analyzeWithLLM(graph, mockLLMClient);

      // Should return exactly what LLM provided, including duplicates
      expect(result.insights).toEqual(mockLLMInsights);
      expect(result.insights.recommendations).toEqual([
        "First recommendation",
        "Second recommendation",
        "First recommendation", // Preserves duplicate
        "Third recommendation",
      ]);

      // Should have exact length including duplicates
      expect(result.insights.recommendations).toHaveLength(4);
    });

    it("should handle all insight types from LLM", async () => {
      const adjacency = {
        "/src/a.ts": ["/src/b.ts"],
        "/src/b.ts": ["/src/c.ts"],
        "/src/c.ts": ["/src/a.ts"],
      };
      const graph = buildGraph(adjacency);

      const mockLLMInsights: InsightPayload = {
        circularDependencies: ["LLM cycle insight"],
        tightCoupling: ["LLM coupling insight"],
        recommendations: ["LLM recommendation"],
      };
      jest.spyOn(mockLLMClient, "analyze").mockResolvedValue(mockLLMInsights);

      const result = await analyzeWithLLM(graph, mockLLMClient);

      // Should return exactly the LLM insights
      expect(result.insights).toEqual(mockLLMInsights);
      expect(result.insights.circularDependencies).toEqual([
        "LLM cycle insight",
      ]);
      expect(result.insights.tightCoupling).toEqual(["LLM coupling insight"]);
      expect(result.insights.recommendations).toEqual(["LLM recommendation"]);
    });
  });

  describe("Schema validation", () => {
    it("should validate output against AnalysisOutputSchema", async () => {
      const adjacency = { "/src/test.ts": [] };
      const graph = buildGraph(adjacency);

      const validInsights: InsightPayload = {
        circularDependencies: ["Valid insight"],
        tightCoupling: ["Valid coupling"],
        recommendations: ["Valid recommendation"],
      };
      jest.spyOn(mockLLMClient, "analyze").mockResolvedValue(validInsights);

      const result = await analyzeWithLLM(graph, mockLLMClient);

      // Should be valid AnalysisOutput
      expect(result).toMatchObject({
        graph: expect.any(Object),
        insights: {
          circularDependencies: expect.any(Array),
          tightCoupling: expect.any(Array),
          recommendations: expect.any(Array),
        },
      });

      // All arrays should contain strings
      result.insights.circularDependencies.forEach((item) => {
        expect(typeof item).toBe("string");
      });
      result.insights.tightCoupling.forEach((item) => {
        expect(typeof item).toBe("string");
      });
      result.insights.recommendations.forEach((item) => {
        expect(typeof item).toBe("string");
      });
    });

    it("should throw error for invalid LLM response", async () => {
      const adjacency = { "/src/test.ts": [] };
      const graph = buildGraph(adjacency);

      // Mock LLM to return invalid data
      const invalidInsights = {
        circularDependencies: ["valid"],
        tightCoupling: [123], // Invalid: should be string
        recommendations: ["valid"],
      } as unknown as InsightPayload;

      jest.spyOn(mockLLMClient, "analyze").mockResolvedValue(invalidInsights);

      await expect(analyzeWithLLM(graph, mockLLMClient)).rejects.toThrow(
        /Analysis output validation failed/,
      );
    });
  });

  describe("Error handling", () => {
    it("should propagate LLM client errors", async () => {
      const adjacency = { "/src/test.ts": [] };
      const graph = buildGraph(adjacency);

      const error = new Error("LLM service unavailable");
      jest.spyOn(mockLLMClient, "analyze").mockRejectedValue(error);

      await expect(analyzeWithLLM(graph, mockLLMClient)).rejects.toThrow(
        "LLM service unavailable",
      );
    });

    it("should not be affected by graph complexity", async () => {
      const adjacency = {
        "/src/hub.ts": ["/src/a.ts", "/src/b.ts", "/src/c.ts"],
        "/src/a.ts": [],
        "/src/b.ts": [],
        "/src/c.ts": [],
      };
      const graph = buildGraph(adjacency);

      const mockInsights: InsightPayload = {
        circularDependencies: [],
        tightCoupling: [],
        recommendations: ["LLM recommendation"],
      };
      jest.spyOn(mockLLMClient, "analyze").mockResolvedValue(mockInsights);

      const result = await analyzeWithLLM(graph, mockLLMClient);

      // Should return exactly what LLM provided regardless of graph complexity
      expect(result.insights).toEqual(mockInsights);
    });
  });

  describe("Integration scenarios", () => {
    it("should handle real-world graph structure", async () => {
      const adjacency = {
        "/src/index.ts": ["/src/app.ts", "/src/config.ts"],
        "/src/app.ts": [
          "/src/services/user.ts",
          "/src/services/auth.ts",
          "/src/utils/logger.ts",
        ],
        "/src/config.ts": ["/src/utils/env.ts"],
        "/src/services/user.ts": ["/src/models/user.ts", "/src/utils/db.ts"],
        "/src/services/auth.ts": ["/src/models/user.ts", "/src/utils/jwt.ts"],
        "/src/models/user.ts": ["/src/utils/validation.ts"],
        "/src/utils/logger.ts": [],
        "/src/utils/env.ts": [],
        "/src/utils/db.ts": ["/src/config.ts"], // Creates cycle
        "/src/utils/jwt.ts": [],
        "/src/utils/validation.ts": [],
      };
      const graph = buildGraph(adjacency);

      const mockLLMInsights: InsightPayload = {
        circularDependencies: [
          "Configuration cycle detected between config.ts and db.ts",
        ],
        tightCoupling: [
          "User model is tightly coupled to multiple services",
          "App.ts has too many direct dependencies",
        ],
        recommendations: [
          "Extract database configuration to separate module",
          "Implement dependency injection for services",
          "Consider using a service locator pattern",
          "Break user model into smaller interfaces",
        ],
      };
      jest.spyOn(mockLLMClient, "analyze").mockResolvedValue(mockLLMInsights);

      const result = await analyzeWithLLM(graph, mockLLMClient);

      // Should return exactly the LLM insights
      expect(result.insights).toEqual(mockLLMInsights);
      expect(result.insights.circularDependencies).toEqual([
        "Configuration cycle detected between config.ts and db.ts",
      ]);
      expect(result.insights.tightCoupling).toEqual([
        "User model is tightly coupled to multiple services",
        "App.ts has too many direct dependencies",
      ]);
      expect(result.insights.recommendations).toEqual([
        "Extract database configuration to separate module",
        "Implement dependency injection for services",
        "Consider using a service locator pattern",
        "Break user model into smaller interfaces",
      ]);

      // Graph should be properly serialized (check structure, not exact order)
      expect(Object.keys(result.graph)).toEqual(
        expect.arrayContaining(Object.keys(adjacency)),
      );

      // Check that each file has the correct dependencies (regardless of order)
      for (const [file, deps] of Object.entries(adjacency)) {
        expect(result.graph[file]).toEqual(expect.arrayContaining(deps));
        expect(result.graph[file]).toHaveLength(deps.length);
      }
    });
  });
});
