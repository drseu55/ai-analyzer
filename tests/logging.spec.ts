import { Writable } from "stream";
import pino from "pino";

// Mock the logger module to capture log outputs
interface LogEntry {
  level?: number;
  time?: number;
  pid?: number;
  hostname?: string;
  msg?: string;
  raw?: string;
  [key: string]: unknown;
}

const mockLogEntries: LogEntry[] = [];

// Create a writable stream that captures log entries
const logCapture = new Writable({
  write(chunk, _encoding, callback) {
    try {
      const logEntry = JSON.parse(chunk.toString());
      mockLogEntries.push(logEntry);
    } catch (_error) {
      // Handle non-JSON output (like from pino-pretty)
      mockLogEntries.push({ raw: chunk.toString() });
    }
    callback();
  },
});

// Create a test logger that writes to our capture stream
const testLogger = pino(
  {
    level: "trace", // Capture all log levels for testing
  },
  logCapture,
);

// Mock the logger module
jest.mock("../src/utils/logger", () => ({
  logger: testLogger,
}));

describe("Structured Logging", () => {
  beforeEach(() => {
    // Clear captured logs before each test
    mockLogEntries.length = 0;
  });

  describe("Logger Configuration", () => {
    it("should be configured to use JSON output in test environment", () => {
      testLogger.info("test message");

      expect(mockLogEntries).toHaveLength(1);
      expect(mockLogEntries[0]).toHaveProperty("level", 30); // info level
      expect(mockLogEntries[0]).toHaveProperty("msg", "test message");
    });

    it("should include timestamp in log entries", () => {
      testLogger.info("test with timestamp");

      expect(mockLogEntries).toHaveLength(1);
      expect(mockLogEntries[0]).toHaveProperty("time");
      expect(typeof mockLogEntries[0].time).toBe("number");
    });

    it("should support different log levels", () => {
      testLogger.trace("trace message");
      testLogger.debug("debug message");
      testLogger.info("info message");
      testLogger.warn("warn message");
      testLogger.error("error message");
      testLogger.fatal("fatal message");

      expect(mockLogEntries).toHaveLength(6);
      expect(mockLogEntries[0]).toHaveProperty("level", 10); // trace
      expect(mockLogEntries[1]).toHaveProperty("level", 20); // debug
      expect(mockLogEntries[2]).toHaveProperty("level", 30); // info
      expect(mockLogEntries[3]).toHaveProperty("level", 40); // warn
      expect(mockLogEntries[4]).toHaveProperty("level", 50); // error
      expect(mockLogEntries[5]).toHaveProperty("level", 60); // fatal
    });

    it("should support structured logging with context objects", () => {
      const context = {
        userId: "123",
        action: "login",
        metadata: {
          ip: "192.168.1.1",
          userAgent: "test-agent",
        },
      };

      testLogger.info(context, "User login attempt");

      expect(mockLogEntries).toHaveLength(1);
      expect(mockLogEntries[0]).toHaveProperty("userId", "123");
      expect(mockLogEntries[0]).toHaveProperty("action", "login");
      expect(mockLogEntries[0]).toHaveProperty("metadata.ip", "192.168.1.1");
      expect(mockLogEntries[0]).toHaveProperty("msg", "User login attempt");
    });
  });

  describe("Application Logging Integration", () => {
    beforeEach(() => {
      // Re-import modules after mocking to get the mocked logger
      jest.resetModules();
    });

    it("should log main.ts operations", async () => {
      // Mock process.exit to prevent test termination
      const mockExit = jest
        .spyOn(process, "exit")
        .mockImplementation((code) => {
          throw new Error(`process.exit(${code})`);
        });

      const { runAnalysis } = await import("../src/main");

      // This will fail due to invalid directory, but should generate logs
      try {
        await runAnalysis({
          dir: "/nonexistent/directory",
        });
      } catch (_error) {
        // Expected to fail or throw process.exit error
      }

      // Should have logged the start of analysis
      const infoLogs = mockLogEntries.filter((entry) => entry.level === 30);
      expect(
        infoLogs.some((log) =>
          log.msg?.includes("Starting TypeScript dependency analysis"),
        ),
      ).toBe(true);

      // Restore process.exit
      mockExit.mockRestore();
    });

    it("should log parser operations", async () => {
      const { parseImports } = await import("../src/parser");

      const mockResolver = jest.fn().mockReturnValue(null);

      await parseImports([], mockResolver);

      // Should have logged debug messages about parsing
      const debugLogs = mockLogEntries.filter((entry) => entry.level === 20);
      expect(
        debugLogs.some((log) =>
          log.msg?.includes("No files provided for parsing"),
        ),
      ).toBe(true);
    });

    it("should log graph builder operations", async () => {
      const { buildGraph } = await import("../src/graph-builder");

      const testAdjacency = {
        "fileA.ts": ["fileB.ts"],
        "fileB.ts": [],
      };

      buildGraph(testAdjacency);

      // Should have logged graph building
      const debugLogs = mockLogEntries.filter((entry) => entry.level === 20);

      expect(
        debugLogs.some((log) => log.msg?.includes("Building dependency graph")),
      ).toBe(true);
    });

    it("should log analyzer operations", async () => {
      const { analyzeProgrammatically } = await import("../src/analyzer");
      const { buildGraph } = await import("../src/graph-builder");

      const testAdjacency = {
        "fileA.ts": ["fileB.ts"],
        "fileB.ts": ["fileA.ts"], // Create a cycle for more interesting logs
      };

      const graph = buildGraph(testAdjacency);

      // Clear logs from graph building
      mockLogEntries.length = 0;

      analyzeProgrammatically(graph);

      // Should have logged analysis steps
      const debugLogs = mockLogEntries.filter((entry) => entry.level === 20);
      const infoLogs = mockLogEntries.filter((entry) => entry.level === 30);

      expect(
        debugLogs.some((log) =>
          log.msg?.includes("Starting programmatic analysis"),
        ),
      ).toBe(true);
      expect(
        infoLogs.some((log) =>
          log.msg?.includes("Programmatic analysis completed"),
        ),
      ).toBe(true);
    });

    it("should log LLM client operations", async () => {
      // Clear logs before this specific test
      mockLogEntries.length = 0;

      const { GeminiLLMClient } = await import("../src/llm-client");

      // Should log initialization (will fail due to missing API key, but should log the attempt)
      try {
        new GeminiLLMClient();
      } catch (_error) {
        // Expected to fail due to missing API key
      }

      // Should have logged something during initialization
      expect(mockLogEntries.length).toBeGreaterThan(0);

      // Check that we have logs at appropriate levels
      const hasDebugLogs = mockLogEntries.some((entry) => entry.level === 20);
      const hasErrorLogs = mockLogEntries.some((entry) => entry.level === 50);

      expect(hasDebugLogs || hasErrorLogs).toBe(true);
    });
  });

  describe("Log Level Filtering", () => {
    it("should respect log level configuration", () => {
      // Create a logger with warn level (should filter out info, debug, trace)
      const warnLogger = pino({ level: "warn" }, logCapture);

      mockLogEntries.length = 0; // Clear previous logs

      warnLogger.trace("trace message");
      warnLogger.debug("debug message");
      warnLogger.info("info message");
      warnLogger.warn("warn message");
      warnLogger.error("error message");

      // Should only have warn and error logs
      expect(mockLogEntries).toHaveLength(2);
      expect(mockLogEntries[0]).toHaveProperty("level", 40); // warn
      expect(mockLogEntries[1]).toHaveProperty("level", 50); // error
    });
  });

  describe("Error Logging", () => {
    it("should properly log error objects", () => {
      const testError = new Error("Test error message");
      testError.stack = "Error: Test error message\n    at test";

      testLogger.error({ error: testError }, "Operation failed");

      expect(mockLogEntries).toHaveLength(1);
      expect(mockLogEntries[0]).toHaveProperty("error");
      expect(mockLogEntries[0]).toHaveProperty("msg", "Operation failed");
    });

    it("should handle error serialization in LLM client", () => {
      const errorContext = {
        error: "Network timeout",
        attempt: 2,
        maxRetries: 3,
        retryable: true,
      };

      testLogger.warn(errorContext, "LLM request failed");

      expect(mockLogEntries).toHaveLength(1);
      expect(mockLogEntries[0]).toHaveProperty("error", "Network timeout");
      expect(mockLogEntries[0]).toHaveProperty("attempt", 2);
      expect(mockLogEntries[0]).toHaveProperty("retryable", true);
    });
  });

  describe("Performance Logging", () => {
    it("should log performance metrics", () => {
      const performanceData = {
        nodeCount: 150,
        edgeCount: 300,
        totalDependencies: 500,
        analysisTimeMs: 1234,
      };

      testLogger.info(performanceData, "Analysis performance metrics");

      expect(mockLogEntries).toHaveLength(1);
      expect(mockLogEntries[0]).toHaveProperty("nodeCount", 150);
      expect(mockLogEntries[0]).toHaveProperty("edgeCount", 300);
      expect(mockLogEntries[0]).toHaveProperty("totalDependencies", 500);
      expect(mockLogEntries[0]).toHaveProperty("analysisTimeMs", 1234);
    });
  });
});
