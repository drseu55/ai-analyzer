import {
  buildGraph,
  serializeAdjacency,
  findCycles,
  AdjacencyMapping,
} from "../src/graph-builder.js";

describe("Graph Builder", () => {
  describe("buildGraph", () => {
    it("should build an empty graph", () => {
      const adjacency: AdjacencyMapping = {};
      const graph = buildGraph(adjacency);

      expect(graph.nodeCount()).toBe(0);
      expect(graph.edgeCount()).toBe(0);
      expect(graph.nodes()).toEqual([]);
    });

    it("should build a graph with isolated nodes", () => {
      const adjacency: AdjacencyMapping = {
        "/src/a.ts": [],
        "/src/b.ts": [],
        "/src/c.ts": [],
      };
      const graph = buildGraph(adjacency);

      expect(graph.nodeCount()).toBe(3);
      expect(graph.edgeCount()).toBe(0);
      expect(graph.nodes().sort()).toEqual([
        "/src/a.ts",
        "/src/b.ts",
        "/src/c.ts",
      ]);
    });

    it("should build a simple linear dependency chain", () => {
      const adjacency: AdjacencyMapping = {
        "/src/main.ts": ["/src/utils.ts"],
        "/src/utils.ts": ["/src/helpers.ts"],
        "/src/helpers.ts": [],
      };
      const graph = buildGraph(adjacency);

      expect(graph.nodeCount()).toBe(3);
      expect(graph.edgeCount()).toBe(2);
      expect(graph.hasEdge("/src/main.ts", "/src/utils.ts")).toBe(true);
      expect(graph.hasEdge("/src/utils.ts", "/src/helpers.ts")).toBe(true);
    });

    it("should build a graph with multiple dependencies", () => {
      const adjacency: AdjacencyMapping = {
        "/src/main.ts": ["/src/utils.ts", "/src/config.ts"],
        "/src/utils.ts": ["/src/helpers.ts"],
        "/src/config.ts": ["/src/helpers.ts"],
        "/src/helpers.ts": [],
      };
      const graph = buildGraph(adjacency);

      expect(graph.nodeCount()).toBe(4);
      expect(graph.edgeCount()).toBe(4);
      expect(graph.hasEdge("/src/main.ts", "/src/utils.ts")).toBe(true);
      expect(graph.hasEdge("/src/main.ts", "/src/config.ts")).toBe(true);
      expect(graph.hasEdge("/src/utils.ts", "/src/helpers.ts")).toBe(true);
      expect(graph.hasEdge("/src/config.ts", "/src/helpers.ts")).toBe(true);
    });

    it("should include target nodes even if they're not source files", () => {
      const adjacency: AdjacencyMapping = {
        "/src/main.ts": ["/src/external.ts"],
      };
      const graph = buildGraph(adjacency);

      expect(graph.nodeCount()).toBe(2);
      expect(graph.nodes().sort()).toEqual([
        "/src/external.ts",
        "/src/main.ts",
      ]);
      expect(graph.hasEdge("/src/main.ts", "/src/external.ts")).toBe(true);
    });

    it("should handle duplicate dependencies gracefully", () => {
      const adjacency: AdjacencyMapping = {
        "/src/main.ts": ["/src/utils.ts", "/src/utils.ts"], // Duplicate
      };
      const graph = buildGraph(adjacency);

      expect(graph.nodeCount()).toBe(2);
      expect(graph.edgeCount()).toBe(1);
      expect(graph.hasEdge("/src/main.ts", "/src/utils.ts")).toBe(true);
    });
  });

  describe("serializeAdjacency", () => {
    it("should serialize an empty graph", () => {
      const graph = buildGraph({});
      const serialized = serializeAdjacency(graph);

      expect(serialized).toEqual({});
    });

    it("should serialize a graph with isolated nodes", () => {
      const adjacency: AdjacencyMapping = {
        "/src/a.ts": [],
        "/src/b.ts": [],
        "/src/c.ts": [],
      };
      const graph = buildGraph(adjacency);
      const serialized = serializeAdjacency(graph);

      expect(serialized).toEqual({
        "/src/a.ts": [],
        "/src/b.ts": [],
        "/src/c.ts": [],
      });
    });

    it("should serialize a simple dependency chain", () => {
      const adjacency: AdjacencyMapping = {
        "/src/main.ts": ["/src/utils.ts"],
        "/src/utils.ts": ["/src/helpers.ts"],
        "/src/helpers.ts": [],
      };
      const graph = buildGraph(adjacency);
      const serialized = serializeAdjacency(graph);

      expect(serialized).toEqual({
        "/src/helpers.ts": [],
        "/src/main.ts": ["/src/utils.ts"],
        "/src/utils.ts": ["/src/helpers.ts"],
      });
    });

    it("should return sorted keys and values for deterministic output", () => {
      const adjacency: AdjacencyMapping = {
        "/src/z.ts": ["/src/c.ts", "/src/a.ts", "/src/b.ts"],
        "/src/a.ts": ["/src/y.ts", "/src/x.ts"],
        "/src/m.ts": [],
      };
      const graph = buildGraph(adjacency);
      const serialized = serializeAdjacency(graph);

      const keys = Object.keys(serialized);
      const expectedKeys = [
        "/src/a.ts",
        "/src/b.ts",
        "/src/c.ts",
        "/src/m.ts",
        "/src/x.ts",
        "/src/y.ts",
        "/src/z.ts",
      ];
      expect(keys).toEqual(expectedKeys);

      // Values should be sorted
      expect(serialized["/src/z.ts"]).toEqual([
        "/src/a.ts",
        "/src/b.ts",
        "/src/c.ts",
      ]);
      expect(serialized["/src/a.ts"]).toEqual(["/src/x.ts", "/src/y.ts"]);
    });

    it("should handle round-trip serialization", () => {
      const originalAdjacency: AdjacencyMapping = {
        "/src/main.ts": ["/src/config.ts", "/src/utils.ts"],
        "/src/utils.ts": ["/src/helpers.ts"],
        "/src/config.ts": [],
        "/src/helpers.ts": [],
      };

      const graph = buildGraph(originalAdjacency);
      const serialized = serializeAdjacency(graph);

      // Should preserve all nodes and relationships
      expect(Object.keys(serialized).sort()).toEqual([
        "/src/config.ts",
        "/src/helpers.ts",
        "/src/main.ts",
        "/src/utils.ts",
      ]);

      expect(serialized["/src/main.ts"].sort()).toEqual([
        "/src/config.ts",
        "/src/utils.ts",
      ]);
      expect(serialized["/src/utils.ts"]).toEqual(["/src/helpers.ts"]);
      expect(serialized["/src/config.ts"]).toEqual([]);
      expect(serialized["/src/helpers.ts"]).toEqual([]);
    });
  });

  describe("findCycles", () => {
    it("should find no cycles in an empty graph", () => {
      const graph = buildGraph({});
      const cycles = findCycles(graph);

      expect(cycles).toEqual([]);
    });

    it("should find no cycles in an acyclic graph", () => {
      const adjacency: AdjacencyMapping = {
        "/src/main.ts": ["/src/utils.ts"],
        "/src/utils.ts": ["/src/helpers.ts"],
        "/src/helpers.ts": [],
      };
      const graph = buildGraph(adjacency);
      const cycles = findCycles(graph);

      expect(cycles).toEqual([]);
    });

    it("should find a simple 2-node cycle", () => {
      const adjacency: AdjacencyMapping = {
        "/src/a.ts": ["/src/b.ts"],
        "/src/b.ts": ["/src/a.ts"],
      };
      const graph = buildGraph(adjacency);
      const cycles = findCycles(graph);

      expect(cycles).toHaveLength(1);
      expect(cycles[0].sort()).toEqual(["/src/a.ts", "/src/b.ts"]);
    });

    it("should find a 3-node cycle", () => {
      const adjacency: AdjacencyMapping = {
        "/src/a.ts": ["/src/b.ts"],
        "/src/b.ts": ["/src/c.ts"],
        "/src/c.ts": ["/src/a.ts"],
      };
      const graph = buildGraph(adjacency);
      const cycles = findCycles(graph);

      expect(cycles).toHaveLength(1);
      expect(cycles[0].sort()).toEqual(["/src/a.ts", "/src/b.ts", "/src/c.ts"]);
    });

    it("should find multiple separate cycles", () => {
      const adjacency: AdjacencyMapping = {
        // First cycle: a -> b -> a
        "/src/a.ts": ["/src/b.ts"],
        "/src/b.ts": ["/src/a.ts"],

        // Second cycle: x -> y -> z -> x
        "/src/x.ts": ["/src/y.ts"],
        "/src/y.ts": ["/src/z.ts"],
        "/src/z.ts": ["/src/x.ts"],

        // Non-cyclic dependency
        "/src/main.ts": ["/src/utils.ts"],
        "/src/utils.ts": [],
      };
      const graph = buildGraph(adjacency);
      const cycles = findCycles(graph);

      expect(cycles).toHaveLength(2);

      // Cycles should be sorted
      const sortedCycles = cycles
        .map((cycle) => cycle.sort())
        .sort((a, b) => a[0].localeCompare(b[0]));
      expect(sortedCycles[0]).toEqual(["/src/a.ts", "/src/b.ts"]);
      expect(sortedCycles[1]).toEqual(["/src/x.ts", "/src/y.ts", "/src/z.ts"]);
    });

    it("should find self-referencing cycles", () => {
      const adjacency: AdjacencyMapping = {
        "/src/a.ts": ["/src/a.ts"], // Self-reference
        "/src/b.ts": [],
      };
      const graph = buildGraph(adjacency);
      const cycles = findCycles(graph);

      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toEqual(["/src/a.ts"]);
    });

    it("should handle complex graphs with nested cycles", () => {
      const adjacency: AdjacencyMapping = {
        "/src/main.ts": ["/src/a.ts", "/src/x.ts"],
        "/src/a.ts": ["/src/b.ts"],
        "/src/b.ts": ["/src/c.ts"],
        "/src/c.ts": ["/src/a.ts"], // Creates cycle a -> b -> c -> a
        "/src/x.ts": ["/src/y.ts"],
        "/src/y.ts": [], // No cycle here
      };
      const graph = buildGraph(adjacency);
      const cycles = findCycles(graph);

      expect(cycles).toHaveLength(1);
      expect(cycles[0].sort()).toEqual(["/src/a.ts", "/src/b.ts", "/src/c.ts"]);
    });

    it("should return deterministic sorted results", () => {
      const adjacency: AdjacencyMapping = {
        "/src/z.ts": ["/src/y.ts"],
        "/src/y.ts": ["/src/x.ts"],
        "/src/x.ts": ["/src/z.ts"],
      };
      const graph = buildGraph(adjacency);

      // Run multiple times to ensure consistency
      const cycles1 = findCycles(graph);
      const cycles2 = findCycles(graph);
      const cycles3 = findCycles(graph);

      expect(cycles1).toEqual(cycles2);
      expect(cycles2).toEqual(cycles3);
      expect(cycles1[0].sort()).toEqual([
        "/src/x.ts",
        "/src/y.ts",
        "/src/z.ts",
      ]);
    });
  });

  describe("Integration tests", () => {
    it("should handle complete workflow: build -> serialize -> build", () => {
      const originalAdjacency: AdjacencyMapping = {
        "/src/main.ts": ["/src/utils.ts", "/src/config.ts"],
        "/src/utils.ts": ["/src/helpers.ts"],
        "/src/config.ts": [],
        "/src/helpers.ts": [],
        "/src/isolated.ts": [],
      };

      // Build graph
      const graph1 = buildGraph(originalAdjacency);

      // Serialize to adjacency
      const serializedAdjacency = serializeAdjacency(graph1);

      // Build new graph from serialized data
      const graph2 = buildGraph(serializedAdjacency);

      // Graphs should be equivalent
      expect(graph1.nodeCount()).toBe(graph2.nodeCount());
      expect(graph1.edgeCount()).toBe(graph2.edgeCount());

      // Both should have no cycles
      expect(findCycles(graph1)).toEqual([]);
      expect(findCycles(graph2)).toEqual([]);

      // Serialization should be identical
      expect(serializeAdjacency(graph1)).toEqual(serializeAdjacency(graph2));
    });

    it("should handle complex real-world dependency scenario", () => {
      const adjacency: AdjacencyMapping = {
        "/src/main.ts": ["/src/app.ts", "/src/config.ts"],
        "/src/app.ts": [
          "/src/routes.ts",
          "/src/middleware.ts",
          "/src/utils.ts",
        ],
        "/src/routes.ts": [
          "/src/controllers/users.ts",
          "/src/controllers/auth.ts",
        ],
        "/src/middleware.ts": ["/src/utils.ts", "/src/config.ts"],
        "/src/controllers/users.ts": ["/src/services/user.ts", "/src/utils.ts"],
        "/src/controllers/auth.ts": ["/src/services/auth.ts", "/src/utils.ts"],
        "/src/services/user.ts": ["/src/models/user.ts", "/src/utils.ts"],
        "/src/services/auth.ts": ["/src/models/user.ts", "/src/utils.ts"],
        "/src/models/user.ts": ["/src/utils.ts"],
        "/src/utils.ts": [],
        "/src/config.ts": [],
      };

      const graph = buildGraph(adjacency);
      const cycles = findCycles(graph);
      const serialized = serializeAdjacency(graph);

      // Should be acyclic
      expect(cycles).toEqual([]);

      // Serialization should be deterministic
      expect(Object.keys(serialized)).toEqual(Object.keys(serialized).sort());
    });
  });
});
