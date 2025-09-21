import {
  buildGraph,
  computeFanInOut,
  findHighCouplingNodes,
  AdjacencyMapping,
  findCycles,
} from "../src/graph-builder.js";

describe("Graph Metrics", () => {
  describe("computeFanInOut", () => {
    it("should compute zero fan-in/out for empty graph", () => {
      const graph = buildGraph({});
      const metrics = computeFanInOut(graph);

      expect(metrics.fanIn).toEqual({});
      expect(metrics.fanOut).toEqual({});
    });

    it("should compute zero fan-in/out for isolated nodes", () => {
      const adjacency: AdjacencyMapping = {
        "/src/a.ts": [],
        "/src/b.ts": [],
        "/src/c.ts": [],
      };
      const graph = buildGraph(adjacency);
      const metrics = computeFanInOut(graph);

      expect(metrics.fanIn).toEqual({
        "/src/a.ts": 0,
        "/src/b.ts": 0,
        "/src/c.ts": 0,
      });
      expect(metrics.fanOut).toEqual({
        "/src/a.ts": 0,
        "/src/b.ts": 0,
        "/src/c.ts": 0,
      });
    });

    it("should compute fan-out for linear dependency chain", () => {
      const adjacency: AdjacencyMapping = {
        "/src/main.ts": ["/src/utils.ts"],
        "/src/utils.ts": ["/src/helpers.ts"],
        "/src/helpers.ts": [],
      };
      const graph = buildGraph(adjacency);
      const metrics = computeFanInOut(graph);

      // Fan-out: how many dependencies each file has
      expect(metrics.fanOut).toEqual({
        "/src/main.ts": 1, // depends on utils
        "/src/utils.ts": 1, // depends on helpers
        "/src/helpers.ts": 0, // depends on nothing
      });

      // Fan-in: how many files depend on each file
      expect(metrics.fanIn).toEqual({
        "/src/main.ts": 0, // nothing depends on main
        "/src/utils.ts": 1, // main depends on utils
        "/src/helpers.ts": 1, // utils depends on helpers
      });
    });

    it("should compute fan-in for shared dependencies", () => {
      const adjacency: AdjacencyMapping = {
        "/src/main.ts": ["/src/utils.ts"],
        "/src/config.ts": ["/src/utils.ts"],
        "/src/app.ts": ["/src/utils.ts"],
        "/src/utils.ts": ["/src/helpers.ts"],
        "/src/helpers.ts": [],
      };
      const graph = buildGraph(adjacency);
      const metrics = computeFanInOut(graph);

      // Fan-in: utils.ts is used by 3 files
      expect(metrics.fanIn["/src/utils.ts"]).toBe(3);
      expect(metrics.fanIn["/src/helpers.ts"]).toBe(1);
      expect(metrics.fanIn["/src/main.ts"]).toBe(0);
      expect(metrics.fanIn["/src/config.ts"]).toBe(0);
      expect(metrics.fanIn["/src/app.ts"]).toBe(0);

      // Fan-out: each file's dependency count
      expect(metrics.fanOut["/src/main.ts"]).toBe(1);
      expect(metrics.fanOut["/src/config.ts"]).toBe(1);
      expect(metrics.fanOut["/src/app.ts"]).toBe(1);
      expect(metrics.fanOut["/src/utils.ts"]).toBe(1);
      expect(metrics.fanOut["/src/helpers.ts"]).toBe(0);
    });

    it("should compute fan-out for multiple dependencies", () => {
      const adjacency: AdjacencyMapping = {
        "/src/main.ts": [
          "/src/utils.ts",
          "/src/config.ts",
          "/src/helpers.ts",
          "/src/types.ts",
        ],
        "/src/utils.ts": [],
        "/src/config.ts": [],
        "/src/helpers.ts": [],
        "/src/types.ts": [],
      };
      const graph = buildGraph(adjacency);
      const metrics = computeFanInOut(graph);

      // Fan-out: main.ts depends on 4 files
      expect(metrics.fanOut["/src/main.ts"]).toBe(4);

      // Fan-in: each dependency is used by main.ts
      expect(metrics.fanIn["/src/utils.ts"]).toBe(1);
      expect(metrics.fanIn["/src/config.ts"]).toBe(1);
      expect(metrics.fanIn["/src/helpers.ts"]).toBe(1);
      expect(metrics.fanIn["/src/types.ts"]).toBe(1);
      expect(metrics.fanIn["/src/main.ts"]).toBe(0);
    });

    it("should handle complex shared dependency scenario", () => {
      const adjacency: AdjacencyMapping = {
        // Multiple files depending on shared utilities
        "/src/controllers/users.ts": ["/src/utils.ts", "/src/models/user.ts"],
        "/src/controllers/auth.ts": ["/src/utils.ts", "/src/models/user.ts"],
        "/src/controllers/posts.ts": ["/src/utils.ts", "/src/models/post.ts"],
        "/src/services/email.ts": ["/src/utils.ts", "/src/config.ts"],
        "/src/services/cache.ts": ["/src/utils.ts", "/src/config.ts"],
        "/src/middleware/auth.ts": ["/src/utils.ts"],

        // Base dependencies
        "/src/utils.ts": ["/src/config.ts"],
        "/src/models/user.ts": ["/src/utils.ts"],
        "/src/models/post.ts": ["/src/utils.ts"],
        "/src/config.ts": [],
      };
      const graph = buildGraph(adjacency);
      const metrics = computeFanInOut(graph);

      // utils.ts should have high fan-in (many files depend on it)
      expect(metrics.fanIn["/src/utils.ts"]).toBe(8); // 6 direct + 2 indirect (models)

      // config.ts should have moderate fan-in
      expect(metrics.fanIn["/src/config.ts"]).toBe(3); // utils + 2 services

      // models should have moderate fan-in
      expect(metrics.fanIn["/src/models/user.ts"]).toBe(2); // 2 controllers
      expect(metrics.fanIn["/src/models/post.ts"]).toBe(1); // 1 controller

      // Check fan-out for some nodes
      expect(metrics.fanOut["/src/controllers/users.ts"]).toBe(2);
      expect(metrics.fanOut["/src/services/email.ts"]).toBe(2);
      expect(metrics.fanOut["/src/utils.ts"]).toBe(1);
      expect(metrics.fanOut["/src/config.ts"]).toBe(0);
    });

    it("should handle circular dependencies correctly", () => {
      const adjacency: AdjacencyMapping = {
        "/src/a.ts": ["/src/b.ts"],
        "/src/b.ts": ["/src/c.ts"],
        "/src/c.ts": ["/src/a.ts"],
      };
      const graph = buildGraph(adjacency);
      const metrics = computeFanInOut(graph);

      // In a circular dependency, each node should have fan-in and fan-out of 1
      expect(metrics.fanIn["/src/a.ts"]).toBe(1);
      expect(metrics.fanIn["/src/b.ts"]).toBe(1);
      expect(metrics.fanIn["/src/c.ts"]).toBe(1);

      expect(metrics.fanOut["/src/a.ts"]).toBe(1);
      expect(metrics.fanOut["/src/b.ts"]).toBe(1);
      expect(metrics.fanOut["/src/c.ts"]).toBe(1);
    });

    it("should return deterministic results", () => {
      const adjacency: AdjacencyMapping = {
        "/src/z.ts": ["/src/y.ts", "/src/x.ts"],
        "/src/y.ts": ["/src/x.ts"],
        "/src/x.ts": [],
        "/src/a.ts": ["/src/x.ts"],
      };
      const graph = buildGraph(adjacency);

      // Run multiple times to ensure consistency
      const metrics1 = computeFanInOut(graph);
      const metrics2 = computeFanInOut(graph);
      const metrics3 = computeFanInOut(graph);

      expect(metrics1).toEqual(metrics2);
      expect(metrics2).toEqual(metrics3);

      // Verify specific values
      expect(metrics1.fanIn["/src/x.ts"]).toBe(3); // z, y, a depend on x
      expect(metrics1.fanOut["/src/z.ts"]).toBe(2); // z depends on y, x
    });
  });

  describe("findHighCouplingNodes", () => {
    it("should find no high coupling in simple graph", () => {
      const adjacency: AdjacencyMapping = {
        "/src/main.ts": ["/src/utils.ts"],
        "/src/utils.ts": [],
      };
      const graph = buildGraph(adjacency);
      const coupling = findHighCouplingNodes(graph);

      expect(coupling.highFanIn).toEqual([]);
      expect(coupling.highFanOut).toEqual([]);
    });

    it("should identify nodes with high fan-in", () => {
      const adjacency: AdjacencyMapping = {
        "/src/file1.ts": ["/src/utils.ts"],
        "/src/file2.ts": ["/src/utils.ts"],
        "/src/file3.ts": ["/src/utils.ts"],
        "/src/file4.ts": ["/src/utils.ts"],
        "/src/file5.ts": ["/src/utils.ts"],
        "/src/file6.ts": ["/src/utils.ts"], // 6 files depend on utils
        "/src/utils.ts": [],
      };
      const graph = buildGraph(adjacency);
      const coupling = findHighCouplingNodes(graph, { fanInThreshold: 5 });

      expect(coupling.highFanIn).toEqual([{ node: "/src/utils.ts", count: 6 }]);
      expect(coupling.highFanOut).toEqual([]);
    });

    it("should identify nodes with high fan-out", () => {
      const adjacency: AdjacencyMapping = {
        "/src/main.ts": [
          "/src/a.ts",
          "/src/b.ts",
          "/src/c.ts",
          "/src/d.ts",
          "/src/e.ts",
          "/src/f.ts",
          "/src/g.ts",
          "/src/h.ts",
          "/src/i.ts",
          "/src/j.ts",
          "/src/k.ts", // 11 dependencies
        ],
        "/src/a.ts": [],
        "/src/b.ts": [],
        "/src/c.ts": [],
        "/src/d.ts": [],
        "/src/e.ts": [],
        "/src/f.ts": [],
        "/src/g.ts": [],
        "/src/h.ts": [],
        "/src/i.ts": [],
        "/src/j.ts": [],
        "/src/k.ts": [],
      };
      const graph = buildGraph(adjacency);
      const coupling = findHighCouplingNodes(graph, { fanOutThreshold: 10 });

      expect(coupling.highFanIn).toEqual([]);
      expect(coupling.highFanOut).toEqual([
        { node: "/src/main.ts", count: 11 },
      ]);
    });

    it("should sort high coupling nodes by count descending", () => {
      const adjacency: AdjacencyMapping = {
        // Files depending on both utils and helpers
        "/src/file1.ts": ["/src/utils.ts", "/src/helpers.ts"],
        "/src/file2.ts": ["/src/utils.ts", "/src/helpers.ts"],
        "/src/file3.ts": ["/src/utils.ts", "/src/helpers.ts"],
        "/src/file4.ts": ["/src/utils.ts", "/src/helpers.ts"],
        "/src/file5.ts": ["/src/utils.ts", "/src/helpers.ts"],
        "/src/file6.ts": ["/src/utils.ts", "/src/helpers.ts"],

        // Files depending only on utils
        "/src/file7.ts": ["/src/utils.ts"],
        "/src/file8.ts": ["/src/utils.ts"],

        // Dependencies
        "/src/utils.ts": [],
        "/src/helpers.ts": [],
      };

      const graph = buildGraph(adjacency);
      const coupling = findHighCouplingNodes(graph, { fanInThreshold: 5 });

      expect(coupling.highFanIn).toEqual([
        { node: "/src/utils.ts", count: 8 }, // Higher count first
        { node: "/src/helpers.ts", count: 6 },
      ]);
    });

    it("should use custom thresholds", () => {
      const adjacency: AdjacencyMapping = {
        "/src/file1.ts": ["/src/utils.ts"],
        "/src/file2.ts": ["/src/utils.ts"],
        "/src/file3.ts": ["/src/utils.ts"],
        "/src/utils.ts": [],
      };
      const graph = buildGraph(adjacency);

      // With threshold 3, utils should be flagged
      const coupling1 = findHighCouplingNodes(graph, { fanInThreshold: 3 });
      expect(coupling1.highFanIn).toEqual([
        { node: "/src/utils.ts", count: 3 },
      ]);

      // With threshold 4, no nodes should be flagged
      const coupling2 = findHighCouplingNodes(graph, { fanInThreshold: 4 });
      expect(coupling2.highFanIn).toEqual([]);
    });
  });

  describe("Real-world scenario", () => {
    it("should analyze a complex project structure", () => {
      const adjacency: AdjacencyMapping = {
        // Entry points
        "/src/main.ts": ["/src/app.ts", "/src/config.ts"],
        "/src/server.ts": ["/src/app.ts", "/src/config.ts"],

        // Core application
        "/src/app.ts": [
          "/src/routes/index.ts",
          "/src/middleware/index.ts",
          "/src/utils/logger.ts",
        ],

        // Route handlers
        "/src/routes/index.ts": [
          "/src/routes/users.ts",
          "/src/routes/auth.ts",
          "/src/routes/posts.ts",
        ],
        "/src/routes/users.ts": [
          "/src/controllers/users.ts",
          "/src/middleware/auth.ts",
        ],
        "/src/routes/auth.ts": [
          "/src/controllers/auth.ts",
          "/src/middleware/validation.ts",
        ],
        "/src/routes/posts.ts": [
          "/src/controllers/posts.ts",
          "/src/middleware/auth.ts",
        ],

        // Controllers
        "/src/controllers/users.ts": [
          "/src/services/users.ts",
          "/src/utils/validation.ts",
          "/src/utils/logger.ts",
        ],
        "/src/controllers/auth.ts": [
          "/src/services/auth.ts",
          "/src/utils/validation.ts",
          "/src/utils/logger.ts",
        ],
        "/src/controllers/posts.ts": [
          "/src/services/posts.ts",
          "/src/utils/validation.ts",
          "/src/utils/logger.ts",
        ],

        // Services
        "/src/services/users.ts": [
          "/src/models/user.ts",
          "/src/utils/database.ts",
          "/src/utils/logger.ts",
        ],
        "/src/services/auth.ts": [
          "/src/models/user.ts",
          "/src/utils/database.ts",
          "/src/utils/crypto.ts",
          "/src/utils/logger.ts",
        ],
        "/src/services/posts.ts": [
          "/src/models/post.ts",
          "/src/models/user.ts",
          "/src/utils/database.ts",
          "/src/utils/logger.ts",
        ],

        // Middleware
        "/src/middleware/index.ts": [
          "/src/middleware/auth.ts",
          "/src/middleware/validation.ts",
          "/src/middleware/logging.ts",
        ],
        "/src/middleware/auth.ts": [
          "/src/services/auth.ts",
          "/src/utils/logger.ts",
        ],
        "/src/middleware/validation.ts": ["/src/utils/validation.ts"],
        "/src/middleware/logging.ts": ["/src/utils/logger.ts"],

        // Models
        "/src/models/user.ts": ["/src/utils/database.ts"],
        "/src/models/post.ts": ["/src/utils/database.ts"],

        // Utilities (leaf nodes)
        "/src/utils/logger.ts": ["/src/config.ts"],
        "/src/utils/database.ts": ["/src/config.ts"],
        "/src/utils/validation.ts": [],
        "/src/utils/crypto.ts": [],
        "/src/config.ts": [],
      };

      const graph = buildGraph(adjacency);
      const coupling = findHighCouplingNodes(graph, {
        fanInThreshold: 3,
        fanOutThreshold: 3,
      });

      // Should be a substantial graph (24 nodes based on our adjacency mapping)
      expect(graph.nodeCount()).toBe(24);
      expect(graph.edgeCount()).toBe(47);
      expect(findCycles(graph)).toEqual([]);

      // Logger should have very high fan-in (used everywhere)
      expect(
        computeFanInOut(graph).fanIn["/src/utils/logger.ts"],
      ).toBeGreaterThanOrEqual(8);

      // Config should have moderate fan-in
      expect(
        computeFanInOut(graph).fanIn["/src/config.ts"],
      ).toBeGreaterThanOrEqual(3);

      // App and route index should have moderate fan-out
      expect(computeFanInOut(graph).fanOut["/src/app.ts"]).toBe(3);
      expect(computeFanInOut(graph).fanOut["/src/routes/index.ts"]).toBe(3);

      // Should identify highly coupled nodes
      expect(coupling.highFanIn.length).toBeGreaterThan(0);
      expect(coupling.highFanOut.length).toBeGreaterThan(0);

      // Logger should be in high fan-in list
      const loggerCoupling = coupling.highFanIn.find(
        (item) => item.node === "/src/utils/logger.ts",
      );
      expect(loggerCoupling).toBeDefined();
      expect(loggerCoupling!.count).toBeGreaterThanOrEqual(8);

      // Metrics should be reasonable
      expect(coupling.highFanIn.length).toBeGreaterThan(0);
      expect(coupling.highFanOut.length).toBeGreaterThan(0);
      expect(coupling.highFanOut.length).toBeGreaterThanOrEqual(8);
      expect(coupling.highFanOut.length).toBeGreaterThanOrEqual(3);
    });
  });
});
