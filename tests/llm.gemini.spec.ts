import {
  GeminiLLMClient,
  LLMError,
  type GeminiLLMClientOptions,
} from "../src/llm-client";

// Mock the Google Generative AI module
const mockGenerateContent = jest.fn();

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  })),
}));

describe("GeminiLLMClient", () => {
  // Store original environment for restoration
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create a clean environment mock
    jest.replaceProperty(process, "env", {
      ...originalEnv,
      GEMINI_API_KEY: undefined, // Default to undefined for safety
    });
  });

  afterEach(() => {
    // Restore original environment
    jest.replaceProperty(process, "env", originalEnv);
  });

  describe("Constructor", () => {
    it("should create client with API key from environment", () => {
      // Set API key in mocked environment
      jest.replaceProperty(process, "env", {
        ...originalEnv,
        GEMINI_API_KEY: "test-api-key",
      });

      const client = new GeminiLLMClient();
      expect(client).toBeInstanceOf(GeminiLLMClient);
    });

    it("should create client with API key from options", () => {
      // Ensure no API key in environment (already undefined by default)
      const client = new GeminiLLMClient({ apiKey: "test-api-key" });
      expect(client).toBeInstanceOf(GeminiLLMClient);
    });

    it("should throw error when no API key is provided", () => {
      // Environment already has no API key by default
      expect(() => new GeminiLLMClient()).toThrow(LLMError);
      expect(() => new GeminiLLMClient()).toThrow("Gemini API key is required");
    });

    it("should use default options when not provided", () => {
      // Set API key in mocked environment
      jest.replaceProperty(process, "env", {
        ...originalEnv,
        GEMINI_API_KEY: "test-key",
      });

      const client = new GeminiLLMClient();
      expect(client).toBeInstanceOf(GeminiLLMClient);
    });

    it("should use custom options when provided", () => {
      const options: GeminiLLMClientOptions = {
        apiKey: "custom-key",
        modelName: "gemini-pro",
        maxRetries: 5,
        baseDelay: 2000,
        timeout: 60000,
      };

      const client = new GeminiLLMClient(options);
      expect(client).toBeInstanceOf(GeminiLLMClient);
    });
  });

  describe("analyze", () => {
    let client: GeminiLLMClient;

    beforeEach(() => {
      // Set API key in mocked environment for this test group
      jest.replaceProperty(process, "env", {
        ...originalEnv,
        GEMINI_API_KEY: "test-api-key",
      });
      client = new GeminiLLMClient();
    });

    it("should successfully analyze a simple graph", async () => {
      const mockResponse = {
        text: JSON.stringify({
          circularDependencies: ["A -> B -> A"],
          tightCoupling: ["Module A has high fan-out"],
          recommendations: ["Consider refactoring module A"],
        }),
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const graphJson = JSON.stringify({
        "/src/a.ts": ["/src/b.ts"],
        "/src/b.ts": ["/src/a.ts"],
      });

      const result = await client.analyze(graphJson);

      expect(result).toEqual({
        circularDependencies: ["A -> B -> A"],
        tightCoupling: ["Module A has high fan-out"],
        recommendations: ["Consider refactoring module A"],
      });

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: expect.any(String),
        contents: expect.stringContaining(
          "TypeScript project's dependency graph",
        ),
      });
    });

    it("should handle empty graph", async () => {
      const mockResponse = {
        text: JSON.stringify({
          circularDependencies: [],
          tightCoupling: [],
          recommendations: ["Code appears well-structured"],
        }),
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.analyze("{}");

      expect(result.circularDependencies).toEqual([]);
      expect(result.tightCoupling).toEqual([]);
      expect(result.recommendations).toHaveLength(1);
    });

    it("should sanitize graph JSON before sending to LLM", async () => {
      const mockResponse = {
        text: JSON.stringify({
          circularDependencies: [],
          tightCoupling: [],
          recommendations: ["Analysis complete"],
        }),
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      // Graph with extra properties that should be filtered out
      const unsanitizedGraph = JSON.stringify({
        "/src/main.ts": ["/src/utils.ts"],
        "/src/utils.ts": [],
        someExtraProperty: "should be removed",
        anotherProperty: { nested: "object" },
      });

      await client.analyze(unsanitizedGraph);

      // Verify the prompt only contains sanitized graph
      const promptArg = mockGenerateContent.mock.calls[0][0];
      expect(promptArg.contents).toContain('"/src/main.ts":["/src/utils.ts"]');
      expect(promptArg.contents).toContain('"/src/utils.ts":[]');
      expect(promptArg.contents).not.toContain("someExtraProperty");
      expect(promptArg.contents).not.toContain("anotherProperty");
    });

    it("should extract JSON from response with extra text", async () => {
      const validJson = {
        circularDependencies: [],
        tightCoupling: [],
        recommendations: ["Good structure"],
      };

      const mockResponse = {
        text: `Here's my analysis:
          
          ${JSON.stringify(validJson)}
          
          Hope this helps!`,
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.analyze("{}");
      expect(result).toEqual(validJson);
    });

    it("should validate response schema", async () => {
      const invalidResponse = {
        text: JSON.stringify({
          wrongProperty: "invalid",
          anotherWrong: [],
        }),
      };

      mockGenerateContent.mockResolvedValue(invalidResponse);

      await expect(client.analyze("{}")).rejects.toThrow(LLMError);
      await expect(client.analyze("{}")).rejects.toThrow(
        "Invalid response format",
      );
    });
  });

  describe("Error handling and retries", () => {
    let client: GeminiLLMClient;

    beforeEach(() => {
      // Set API key in mocked environment for this test group
      jest.replaceProperty(process, "env", {
        ...originalEnv,
        GEMINI_API_KEY: "test-api-key",
      });
      client = new GeminiLLMClient({ maxRetries: 2, baseDelay: 10 }); // Fast retries for testing
    });

    it("should retry on rate limit errors", async () => {
      const rateLimitError = new Error("429 rate limit exceeded");
      const successResponse = {
        text: JSON.stringify({
          circularDependencies: [],
          tightCoupling: [],
          recommendations: ["Success after retry"],
        }),
      };

      mockGenerateContent
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue(successResponse);

      const result = await client.analyze("{}");

      expect(result.recommendations).toEqual(["Success after retry"]);
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    it("should retry on network errors", async () => {
      const networkError = new Error("network timeout");
      const successResponse = {
        text: JSON.stringify({
          circularDependencies: [],
          tightCoupling: [],
          recommendations: ["Recovered from network error"],
        }),
      };

      mockGenerateContent
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue(successResponse);

      const result = await client.analyze("{}");

      expect(result.recommendations).toEqual(["Recovered from network error"]);
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it("should not retry on authentication errors", async () => {
      const authError = new Error("401 unauthorized");
      mockGenerateContent.mockRejectedValue(authError);

      await expect(client.analyze("{}")).rejects.toThrow(LLMError);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1); // Should not retry
    });

    it("should fail after max retries", async () => {
      const persistentError = new Error("persistent 5xx error");
      mockGenerateContent.mockRejectedValue(persistentError);

      await expect(client.analyze("{}")).rejects.toThrow(LLMError);
      expect(mockGenerateContent).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it("should handle timeout errors", async () => {
      // Mock a long-running request that exceeds timeout
      const client = new GeminiLLMClient({
        apiKey: "test-key",
        timeout: 50, // Very short timeout for testing
        maxRetries: 1,
      });

      mockGenerateContent.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)), // Longer than timeout
      );

      await expect(client.analyze("{}")).rejects.toThrow(LLMError);
      await expect(client.analyze("{}")).rejects.toThrow("timeout");
    });

    it("should handle empty response", async () => {
      const emptyResponse = {
        text: "",
      };

      mockGenerateContent.mockResolvedValue(emptyResponse);

      await expect(client.analyze("{}")).rejects.toThrow(LLMError);
      await expect(client.analyze("{}")).rejects.toThrow("Empty response");
    });

    it("should handle no response", async () => {
      const noResponse = { text: null };
      mockGenerateContent.mockResolvedValue(noResponse);

      await expect(client.analyze("{}")).rejects.toThrow(LLMError);
      await expect(client.analyze("{}")).rejects.toThrow("Empty response");
    });

    it("should handle invalid JSON response", async () => {
      const invalidJsonResponse = {
        text: "This is not JSON",
      };

      mockGenerateContent.mockResolvedValue(invalidJsonResponse);

      await expect(client.analyze("{}")).rejects.toThrow(LLMError);
      await expect(client.analyze("{}")).rejects.toThrow(
        "Failed to parse LLM response",
      );
    });
  });

  describe("Input validation and sanitization", () => {
    let client: GeminiLLMClient;

    beforeEach(() => {
      // Set API key in mocked environment for this test group
      jest.replaceProperty(process, "env", {
        ...originalEnv,
        GEMINI_API_KEY: "test-api-key",
      });
      client = new GeminiLLMClient();
    });

    it("should reject invalid JSON input", async () => {
      await expect(client.analyze("invalid json")).rejects.toThrow(LLMError);
      await expect(client.analyze("invalid json")).rejects.toThrow(
        "sanitize graph JSON",
      );
    });

    it("should reject non-object JSON", async () => {
      await expect(client.analyze('"string"')).rejects.toThrow(LLMError);
      await expect(client.analyze('"string"')).rejects.toThrow(
        "Graph must be an object",
      );
    });

    it("should reject array JSON", async () => {
      await expect(client.analyze('["array"]')).rejects.toThrow(LLMError);
      await expect(client.analyze('["array"]')).rejects.toThrow(
        "Graph must be an object",
      );
    });

    it("should reject null JSON", async () => {
      await expect(client.analyze("null")).rejects.toThrow(LLMError);
      await expect(client.analyze("null")).rejects.toThrow(
        "Graph must be an object",
      );
    });

    it("should filter out non-string dependencies", async () => {
      const mockResponse = {
        text: JSON.stringify({
          circularDependencies: [],
          tightCoupling: [],
          recommendations: ["Sanitized successfully"],
        }),
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const graphWithMixedTypes = JSON.stringify({
        "/src/main.ts": ["/src/utils.ts", 123, null, "/src/config.ts"],
        "/src/utils.ts": ["valid-string", { object: "invalid" }],
      });

      await client.analyze(graphWithMixedTypes);

      const promptArg = mockGenerateContent.mock.calls[0][0];
      expect(promptArg.contents).toContain(
        '"/src/main.ts":["/src/utils.ts","/src/config.ts"]',
      );
      expect(promptArg.contents).toContain('"/src/utils.ts":["valid-string"]');
      expect(promptArg.contents).not.toContain("123");
      expect(promptArg.contents).not.toContain("null");
      expect(promptArg.contents).not.toContain("invalid");
    });
  });

  describe("LLMError types", () => {
    it("should create network error", () => {
      const error = LLMError.networkError("Connection failed");
      expect(error.code).toBe("NETWORK_ERROR");
      expect(error.retryable).toBe(true);
    });

    it("should create authentication error", () => {
      const error = LLMError.authenticationError("Invalid API key");
      expect(error.code).toBe("AUTH_ERROR");
      expect(error.statusCode).toBe(401);
      expect(error.retryable).toBe(false);
    });

    it("should create rate limit error", () => {
      const error = LLMError.rateLimitError("Too many requests");
      expect(error.code).toBe("RATE_LIMIT");
      expect(error.statusCode).toBe(429);
      expect(error.retryable).toBe(true);
    });

    it("should create invalid response error", () => {
      const error = LLMError.invalidResponseError("Bad format");
      expect(error.code).toBe("INVALID_RESPONSE");
      expect(error.retryable).toBe(false);
    });
  });

  describe("Exponential backoff", () => {
    let client: GeminiLLMClient;

    beforeEach(() => {
      // Set API key in mocked environment for this test group
      jest.replaceProperty(process, "env", {
        ...originalEnv,
        GEMINI_API_KEY: "test-api-key",
      });
      client = new GeminiLLMClient({ baseDelay: 100, maxRetries: 3 });
    });

    it("should use exponential backoff for retries", async () => {
      const networkError = new Error("network error");
      mockGenerateContent.mockRejectedValue(networkError);

      const startTime = Date.now();

      try {
        await client.analyze("{}");
      } catch (_error) {
        // Expected to fail
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should have waited approximately: 100ms + 200ms + 400ms = 700ms (plus jitter)
      // Allow for some variance due to test timing and jitter
      expect(totalTime).toBeGreaterThan(500);
      expect(totalTime).toBeLessThan(1500);

      expect(mockGenerateContent).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });
  });

  describe("Security and prompt crafting", () => {
    let client: GeminiLLMClient;

    beforeEach(() => {
      // Set API key in mocked environment for this test group
      jest.replaceProperty(process, "env", {
        ...originalEnv,
        GEMINI_API_KEY: "test-api-key",
      });
      client = new GeminiLLMClient();

      const mockResponse = {
        text: JSON.stringify({
          circularDependencies: [],
          tightCoupling: [],
          recommendations: ["Analysis complete"],
        }),
      };

      mockGenerateContent.mockResolvedValue(mockResponse);
    });

    it("should send only dependency graph structure to LLM", async () => {
      const graph = {
        "/src/main.ts": ["/src/utils.ts", "/src/config.ts"],
        "/src/utils.ts": ["/src/helpers.ts"],
        "/src/config.ts": [],
        "/src/helpers.ts": [],
      };

      await client.analyze(JSON.stringify(graph));

      const promptArg = mockGenerateContent.mock.calls[0][0];

      // Should contain graph structure
      expect(promptArg.contents).toContain('"/src/main.ts"');
      expect(promptArg.contents).toContain('"/src/utils.ts"');

      // Should not contain any file contents or code
      expect(promptArg.contents).not.toContain("function");
      expect(promptArg.contents).not.toContain("class");
      expect(promptArg.contents).not.toContain("import {");
      expect(promptArg.contents).not.toContain("export");
    });

    it("should craft proper analysis prompt", async () => {
      await client.analyze("{}");

      const promptArg = mockGenerateContent.mock.calls[0][0];

      expect(promptArg.contents).toContain("senior software architect");
      expect(promptArg.contents).toContain("dependency graph");
      expect(promptArg.contents).toContain("JSON adjacency list");
      expect(promptArg.contents).toContain("circularDependencies");
      expect(promptArg.contents).toContain("tightCoupling");
      expect(promptArg.contents).toContain("recommendations");
      expect(promptArg.contents).toContain("JSON object only");
    });

    it("should not expose API key in error messages", async () => {
      // This test ensures that even if errors occur, the API key is not leaked
      const client = new GeminiLLMClient({ apiKey: "secret-api-key-12345" });

      const authError = new Error("401 unauthorized - invalid key");
      mockGenerateContent.mockRejectedValue(authError);

      try {
        await client.analyze("{}");
      } catch (error) {
        expect(error instanceof LLMError).toBe(true);
        if (error instanceof Error) {
          expect(error.message).not.toContain("secret-api-key-12345");
        }
      }
    });
  });

  describe("Integration scenarios", () => {
    let client: GeminiLLMClient;

    beforeEach(() => {
      // Set API key in mocked environment for this test group
      jest.replaceProperty(process, "env", {
        ...originalEnv,
        GEMINI_API_KEY: "test-api-key",
      });
      client = new GeminiLLMClient();
    });

    it("should handle complex real-world graph", async () => {
      const complexGraph = {
        "/src/main.ts": ["/src/controllers/UserController.ts"],
        "/src/controllers/UserController.ts": ["/src/services/UserService.ts"],
        "/src/services/UserService.ts": ["/src/models/User.ts"],
        "/src/models/User.ts": [],
      };

      const mockResponse = {
        text: JSON.stringify({
          circularDependencies: [],
          tightCoupling: [],
          recommendations: [
            "Well-structured layered architecture",
            "Consider adding validation layer",
          ],
        }),
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.analyze(JSON.stringify(complexGraph));

      expect(result.circularDependencies).toEqual([]);
      expect(result.tightCoupling).toEqual([]);
      expect(result.recommendations).toHaveLength(2);
    });

    it("should handle graph with circular dependencies", async () => {
      const cyclicGraph = {
        "/src/a.ts": ["/src/b.ts"],
        "/src/b.ts": ["/src/c.ts"],
        "/src/c.ts": ["/src/a.ts"],
      };

      const mockResponse = {
        text: JSON.stringify({
          circularDependencies: [
            "Circular dependency detected: a.ts → b.ts → c.ts → a.ts",
          ],
          tightCoupling: [],
          recommendations: [
            "Break circular dependency by introducing interfaces",
            "Consider extracting shared logic to separate module",
          ],
        }),
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.analyze(JSON.stringify(cyclicGraph));

      expect(result.circularDependencies).toHaveLength(1);
      expect(result.circularDependencies[0]).toContain("Circular dependency");
      expect(result.recommendations).toHaveLength(2);
    });
  });
});
