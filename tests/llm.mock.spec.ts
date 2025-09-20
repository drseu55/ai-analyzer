import {
  MockLLMClient,
  MockLLMClientFactory,
  type MockLLMClientOptions,
} from "./mocks/llm-client.mock.js";

describe("LLM Client Interface and Mock", () => {
  describe("ILLMClient Interface", () => {
    it("should be implemented by MockLLMClient", () => {
      const client = new MockLLMClient();
      expect(client).toHaveProperty("analyze");
      expect(typeof client.analyze).toBe("function");
    });

    it("should have correct method signature", () => {
      const client = new MockLLMClient();
      // Test that analyze takes a string and returns a Promise
      const result = client.analyze("{}");
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe("MockLLMClient", () => {
    let client: MockLLMClient;

    beforeEach(() => {
      client = new MockLLMClient();
    });

    describe("Basic functionality", () => {
      it("should analyze empty graph", async () => {
        const emptyGraph = "{}";
        const result = await client.analyze(emptyGraph);

        expect(result).toHaveProperty("circularDependencies");
        expect(result).toHaveProperty("tightCoupling");
        expect(result).toHaveProperty("recommendations");

        expect(Array.isArray(result.circularDependencies)).toBe(true);
        expect(Array.isArray(result.tightCoupling)).toBe(true);
        expect(Array.isArray(result.recommendations)).toBe(true);
      });

      it("should analyze simple acyclic graph", async () => {
        const simpleGraph = JSON.stringify({
          "/src/main.ts": ["/src/utils.ts"],
          "/src/utils.ts": [],
        });

        const result = await client.analyze(simpleGraph);

        expect(result.circularDependencies).toEqual([]);
        expect(result.tightCoupling).toEqual([]);
        expect(result.recommendations).toEqual(
          expect.arrayContaining([expect.stringContaining("well-structured")]),
        );
      });

      it("should return valid InsightPayload structure", async () => {
        const graph = JSON.stringify({
          "/src/a.ts": ["/src/b.ts"],
          "/src/b.ts": [],
        });

        const result = await client.analyze(graph);

        // Verify structure matches InsightPayload
        expect(result).toMatchObject({
          circularDependencies: expect.any(Array),
          tightCoupling: expect.any(Array),
          recommendations: expect.any(Array),
        });

        // Verify all array items are strings
        const allItems = [
          ...result.circularDependencies,
          ...result.tightCoupling,
          ...result.recommendations,
        ];
        allItems.forEach((item) => {
          expect(typeof item).toBe("string");
        });
      });
    });

    describe("Cycle detection", () => {
      it("should detect simple circular dependency", async () => {
        const cyclicGraph = JSON.stringify({
          "/src/a.ts": ["/src/b.ts"],
          "/src/b.ts": ["/src/a.ts"],
        });

        const result = await client.analyze(cyclicGraph);

        expect(result.circularDependencies.length).toBeGreaterThan(0);
        expect(result.circularDependencies[0]).toContain("LLM detected cycle");
        expect(result.circularDependencies[0]).toContain("a");
        expect(result.circularDependencies[0]).toContain("b");
      });

      it("should detect complex circular dependency", async () => {
        const complexCyclicGraph = JSON.stringify({
          "/src/a.ts": ["/src/b.ts"],
          "/src/b.ts": ["/src/c.ts"],
          "/src/c.ts": ["/src/a.ts"],
        });

        const result = await client.analyze(complexCyclicGraph);

        expect(result.circularDependencies.length).toBeGreaterThan(0);
        expect(result.circularDependencies[0]).toContain("LLM detected cycle");
        expect(
          result.recommendations.some((rec) => rec.includes("Break")),
        ).toBe(true);
      });

      it("should detect multiple cycles", async () => {
        const multipleCyclesGraph = JSON.stringify({
          // First cycle: a -> b -> a
          "/src/a.ts": ["/src/b.ts"],
          "/src/b.ts": ["/src/a.ts"],
          // Second cycle: x -> y -> z -> x
          "/src/x.ts": ["/src/y.ts"],
          "/src/y.ts": ["/src/z.ts"],
          "/src/z.ts": ["/src/x.ts"],
        });

        const result = await client.analyze(multipleCyclesGraph);

        expect(result.circularDependencies.length).toBeGreaterThan(1);
        expect(
          result.recommendations.some((rec) =>
            rec.includes("dependency injection"),
          ),
        ).toBe(true);
      });
    });

    describe("Tight coupling detection", () => {
      it("should detect high fan-out modules", async () => {
        // Create a module with many dependencies (>= 8)
        const dependencies = Array.from(
          { length: 10 },
          (_, i) => `/src/dep${i}.ts`,
        );
        const highFanOutGraph = JSON.stringify({
          "/src/god-module.ts": dependencies,
          ...Object.fromEntries(dependencies.map((dep) => [dep, []])),
        });

        const result = await client.analyze(highFanOutGraph);

        expect(result.tightCoupling.length).toBeGreaterThan(0);
        expect(
          result.tightCoupling.some((coupling) =>
            coupling.includes("high complexity"),
          ),
        ).toBe(true);
        expect(
          result.tightCoupling.some((coupling) =>
            coupling.includes("god-module"),
          ),
        ).toBe(true);
      });

      it("should detect high fan-in modules", async () => {
        // Create a module that many others depend on (>= 6)
        const dependents = Array.from(
          { length: 8 },
          (_, i) => `/src/client${i}.ts`,
        );
        const adjacency: Record<string, string[]> = {
          "/src/shared-util.ts": [],
        };
        dependents.forEach((client) => {
          adjacency[client] = ["/src/shared-util.ts"];
        });

        const highFanInGraph = JSON.stringify(adjacency);
        const result = await client.analyze(highFanInGraph);

        expect(result.tightCoupling.length).toBeGreaterThan(0);
        expect(
          result.tightCoupling.some((coupling) =>
            coupling.includes("central dependency"),
          ),
        ).toBe(true);
        expect(
          result.tightCoupling.some((coupling) =>
            coupling.includes("shared-util"),
          ),
        ).toBe(true);
      });

      it("should detect both high fan-in and fan-out", async () => {
        const complexGraph = JSON.stringify({
          // High fan-out module
          "/src/god.ts": Array.from(
            { length: 9 },
            (_, i) => `/src/service${i}.ts`,
          ),
          // High fan-in module
          "/src/shared.ts": [],
          // Clients that depend on shared
          "/src/client1.ts": ["/src/shared.ts"],
          "/src/client2.ts": ["/src/shared.ts"],
          "/src/client3.ts": ["/src/shared.ts"],
          "/src/client4.ts": ["/src/shared.ts"],
          "/src/client5.ts": ["/src/shared.ts"],
          "/src/client6.ts": ["/src/shared.ts"],
          "/src/client7.ts": ["/src/shared.ts"],
          // Services
          ...Object.fromEntries(
            Array.from({ length: 9 }, (_, i) => [`/src/service${i}.ts`, []]),
          ),
        });

        const result = await client.analyze(complexGraph);

        expect(result.tightCoupling.length).toBeGreaterThanOrEqual(2);
        expect(
          result.tightCoupling.some((coupling) =>
            coupling.includes("high complexity"),
          ),
        ).toBe(true);
        expect(
          result.tightCoupling.some((coupling) =>
            coupling.includes("central dependency"),
          ),
        ).toBe(true);
      });
    });

    describe("Recommendations generation", () => {
      it("should provide recommendations for cycles", async () => {
        const cyclicGraph = JSON.stringify({
          "/src/a.ts": ["/src/b.ts"],
          "/src/b.ts": ["/src/c.ts"],
          "/src/c.ts": ["/src/a.ts"],
        });

        const result = await client.analyze(cyclicGraph);

        expect(result.recommendations.length).toBeGreaterThan(0);
        expect(
          result.recommendations.some((rec) => rec.includes("Break")),
        ).toBe(true);
        expect(
          result.recommendations.some((rec) => rec.includes("circular")),
        ).toBe(true);
      });

      it("should provide recommendations for tight coupling", async () => {
        const tightlyCoupledGraph = JSON.stringify({
          "/src/central.ts": Array.from(
            { length: 10 },
            (_, i) => `/src/dep${i}.ts`,
          ),
          ...Object.fromEntries(
            Array.from({ length: 10 }, (_, i) => [`/src/dep${i}.ts`, []]),
          ),
        });

        const result = await client.analyze(tightlyCoupledGraph);

        expect(result.recommendations.length).toBeGreaterThan(0);
        expect(
          result.recommendations.some((rec) => rec.includes("Refactor")),
        ).toBe(true);
        expect(
          result.recommendations.some((rec) => rec.includes("coupled")),
        ).toBe(true);
      });

      it("should provide general architecture recommendations", async () => {
        const largeGraph = JSON.stringify({
          // Create a graph with high average dependencies
          ...Object.fromEntries(
            Array.from({ length: 10 }, (_, i) => [
              `/src/module${i}.ts`,
              Array.from({ length: 6 }, (_, j) => `/src/util${j}.ts`),
            ]),
          ),
          ...Object.fromEntries(
            Array.from({ length: 6 }, (_, i) => [`/src/util${i}.ts`, []]),
          ),
        });

        const result = await client.analyze(largeGraph);

        expect(result.recommendations.length).toBeGreaterThan(0);
        expect(
          result.recommendations.some((rec) =>
            rec.includes("Single Responsibility"),
          ),
        ).toBe(true);
      });

      it("should detect utility module patterns", async () => {
        const utilityGraph = JSON.stringify({
          "/src/string-utils.ts": [],
          "/src/client1.ts": ["/src/string-utils.ts"],
          "/src/client2.ts": ["/src/string-utils.ts"],
          "/src/client3.ts": ["/src/string-utils.ts"],
          "/src/client4.ts": ["/src/string-utils.ts"],
          "/src/client5.ts": ["/src/string-utils.ts"],
          "/src/client6.ts": ["/src/string-utils.ts"],
          "/src/client7.ts": ["/src/string-utils.ts"],
        });

        const result = await client.analyze(utilityGraph);

        expect(
          result.recommendations.some((rec) => rec.includes("utility")),
        ).toBe(true);
      });

      it("should provide positive feedback for well-structured code", async () => {
        const wellStructuredGraph = JSON.stringify({
          "/src/main.ts": ["/src/service.ts"],
          "/src/service.ts": ["/src/utils.ts"],
          "/src/utils.ts": [],
        });

        const result = await client.analyze(wellStructuredGraph);

        expect(
          result.recommendations.some((rec) => rec.includes("well-structured")),
        ).toBe(true);
      });
    });

    describe("Configuration options", () => {
      it("should respect maxRecommendations option", async () => {
        const complexGraph = JSON.stringify({
          "/src/a.ts": ["/src/b.ts"],
          "/src/b.ts": ["/src/a.ts"], // Cycle
          "/src/god.ts": Array.from(
            { length: 15 },
            (_, i) => `/src/dep${i}.ts`,
          ), // High fan-out
          ...Object.fromEntries(
            Array.from({ length: 15 }, (_, i) => [`/src/dep${i}.ts`, []]),
          ),
        });

        const limitedClient = new MockLLMClient({ maxRecommendations: 2 });
        const result = await limitedClient.analyze(complexGraph);

        expect(result.recommendations.length).toBeLessThanOrEqual(2);
      });

      it("should respect includeDetailedAnalysis option", async () => {
        const simpleGraph = JSON.stringify({
          "/src/main.ts": ["/src/utils.ts"],
          "/src/utils.ts": [],
        });

        const noDetailClient = new MockLLMClient({
          includeDetailedAnalysis: false,
        });
        const result = await noDetailClient.analyze(simpleGraph);

        expect(
          result.recommendations.some((rec) => rec.includes("well-structured")),
        ).toBe(false);
      });

      it("should simulate delay when configured", async () => {
        const delayClient = new MockLLMClient({
          simulateDelay: true,
          delayMs: 50,
        });

        const startTime = Date.now();
        await delayClient.analyze("{}");
        const endTime = Date.now();

        expect(endTime - startTime).toBeGreaterThanOrEqual(45); // Allow some variance
      });
    });

    describe("Error handling", () => {
      it("should handle invalid JSON", async () => {
        const invalidJson = "{ invalid json }";

        await expect(client.analyze(invalidJson)).rejects.toThrow(
          "Failed to parse graph JSON",
        );
      });

      it("should handle null input", async () => {
        await expect(client.analyze("null")).rejects.toThrow();
      });

      it("should handle non-object JSON", async () => {
        await expect(client.analyze('"string"')).rejects.toThrow();
      });
    });

    describe("Deterministic behavior", () => {
      it("should return consistent results for same input", async () => {
        const graph = JSON.stringify({
          "/src/a.ts": ["/src/b.ts"],
          "/src/b.ts": ["/src/c.ts"],
          "/src/c.ts": ["/src/a.ts"],
        });

        const result1 = await client.analyze(graph);
        const result2 = await client.analyze(graph);

        expect(result1).toEqual(result2);
      });

      it("should be deterministic across different instances", async () => {
        const graph = JSON.stringify({
          "/src/main.ts": ["/src/utils.ts"],
          "/src/utils.ts": [],
        });

        const client1 = new MockLLMClient();
        const client2 = new MockLLMClient();

        const result1 = await client1.analyze(graph);
        const result2 = await client2.analyze(graph);

        expect(result1).toEqual(result2);
      });
    });

    describe("Node name formatting", () => {
      it("should format node names for readability", async () => {
        const graph = JSON.stringify({
          "/very/long/path/to/src/module.ts": [
            "/another/long/path/dependency.ts",
          ],
          "/another/long/path/dependency.ts": [],
        });

        const result = await client.analyze(graph);

        // Check that formatted names are used in output
        const allOutput = [
          ...result.circularDependencies,
          ...result.tightCoupling,
          ...result.recommendations,
        ].join(" ");

        expect(allOutput).not.toContain("/very/long/path");
        expect(allOutput).not.toContain("/another/long/path");
      });
    });
  });

  describe("MockLLMClientFactory", () => {
    it("should create mock client", () => {
      const client = MockLLMClientFactory.create();
      expect(client).toBeInstanceOf(MockLLMClient);
    });

    it("should create mock client with options", () => {
      const options: MockLLMClientOptions = {
        maxRecommendations: 3,
        simulateDelay: true,
      };
      const client = MockLLMClientFactory.create(options);
      expect(client).toBeInstanceOf(MockLLMClient);
    });

    it("should create client with delay", () => {
      const client = MockLLMClientFactory.createWithDelay();
      expect(client).toBeInstanceOf(MockLLMClient);
    });

    it("should create fast client", () => {
      const client = MockLLMClientFactory.createFast();
      expect(client).toBeInstanceOf(MockLLMClient);
    });

    it("should implement ILLMClient interface", () => {
      const client = MockLLMClientFactory.create();
      expect(client).toHaveProperty("analyze");
      expect(typeof client.analyze).toBe("function");
    });
  });

  describe("Integration scenarios", () => {
    it("should handle real-world complex graph", async () => {
      const client = new MockLLMClient();
      // Simulate a more realistic project structure
      const realWorldGraph = JSON.stringify({
        "/src/main.ts": [
          "/src/controllers/UserController.ts",
          "/src/services/AuthService.ts",
        ],
        "/src/controllers/UserController.ts": [
          "/src/services/UserService.ts",
          "/src/middleware/auth.ts",
        ],
        "/src/services/UserService.ts": [
          "/src/models/User.ts",
          "/src/database/UserRepository.ts",
        ],
        "/src/services/AuthService.ts": [
          "/src/models/User.ts",
          "/src/utils/jwt.ts",
          "/src/utils/crypto.ts",
        ],
        "/src/database/UserRepository.ts": [
          "/src/models/User.ts",
          "/src/database/connection.ts",
        ],
        "/src/middleware/auth.ts": ["/src/services/AuthService.ts"],
        "/src/models/User.ts": [],
        "/src/utils/jwt.ts": [],
        "/src/utils/crypto.ts": [],
        "/src/database/connection.ts": [],
      });

      const result = await client.analyze(realWorldGraph);

      expect(result.circularDependencies).toEqual([]); // Well-structured, no cycles
      expect(result.tightCoupling).toEqual([]); // No excessive coupling
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(
        result.recommendations.some((rec: string) =>
          rec.includes("well-structured"),
        ),
      ).toBe(true);
    });

    it("should handle edge case with self-dependencies", async () => {
      const client = new MockLLMClient();
      const selfDependentGraph = JSON.stringify({
        "/src/circular.ts": ["/src/circular.ts"], // Self-dependency
        "/src/normal.ts": [],
      });

      // Should not crash, should handle gracefully
      const result = await client.analyze(selfDependentGraph);
      expect(result).toHaveProperty("circularDependencies");
      expect(result).toHaveProperty("tightCoupling");
      expect(result).toHaveProperty("recommendations");
    });
  });
});
