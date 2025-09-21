import { GoogleGenAI } from "@google/genai";
import { InsightPayload, InsightPayloadSchema } from "./types";
import { logger } from "./utils/logger";

/**
 * Interface for LLM clients that can analyze dependency graphs and provide insights.
 *
 * This abstraction allows for different LLM implementations (Gemini, OpenAI, etc.)
 * while maintaining a consistent API for the analyzer.
 */
export interface ILLMClient {
  /**
   * Analyzes a dependency graph represented as JSON and returns insights.
   *
   * @param graphJson - JSON string representation of the dependency graph (adjacency list)
   * @returns Promise resolving to insights about the graph
   */
  analyze(graphJson: string): Promise<InsightPayload>;
}

/**
 * Error class for LLM-specific failures.
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "LLMError";
  }

  static networkError(message: string): LLMError {
    return new LLMError(message, "NETWORK_ERROR", undefined, true);
  }

  static authenticationError(message: string): LLMError {
    return new LLMError(message, "AUTH_ERROR", 401, false);
  }

  static rateLimitError(message: string): LLMError {
    return new LLMError(message, "RATE_LIMIT", 429, true);
  }

  static invalidResponseError(message: string): LLMError {
    return new LLMError(message, "INVALID_RESPONSE", undefined, false);
  }
}

/**
 * Configuration options for GeminiLLMClient.
 */
export interface GeminiLLMClientOptions {
  /** API key for Gemini (defaults to process.env.GEMINI_API_KEY) */
  apiKey?: string;
  /** Model name to use (defaults to 'gemini-1.5-flash') */
  modelName?: string;
  /** Maximum number of retry attempts (defaults to 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in milliseconds (defaults to 1000) */
  baseDelay?: number;
  /** Request timeout in milliseconds (defaults to 120000) */
  timeout?: number;
}

/**
 * Production-ready Gemini LLM client with retry logic and security features.
 */
export class GeminiLLMClient implements ILLMClient {
  private readonly genai: GoogleGenAI;
  private readonly options: Required<GeminiLLMClientOptions>;

  constructor(options: GeminiLLMClientOptions = {}) {
    logger.debug(
      {
        modelName: options.modelName,
        maxRetries: options.maxRetries,
        timeout: options.timeout,
      },
      "Initializing Gemini LLM client",
    );

    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;

    if (!apiKey) {
      logger.error("Gemini API key is missing");
      throw new LLMError(
        "Gemini API key is required. Set GEMINI_API_KEY environment variable or pass apiKey option.",
        "MISSING_API_KEY",
      );
    }

    this.genai = new GoogleGenAI({ apiKey });
    this.options = {
      apiKey,
      modelName: options.modelName ?? "gemini-2.5-flash",
      maxRetries: options.maxRetries ?? 3,
      baseDelay: options.baseDelay ?? 1000,
      timeout: options.timeout ?? 120000,
    };

    logger.info(
      {
        modelName: this.options.modelName,
        maxRetries: this.options.maxRetries,
      },
      "Gemini LLM client initialized successfully",
    );
  }

  /**
   * Analyzes a dependency graph using Gemini and returns structured insights.
   *
   * @param graphJson - JSON string representation of the dependency graph
   * @returns Promise resolving to validated insights
   */
  async analyze(graphJson: string): Promise<InsightPayload> {
    logger.info(
      {
        inputSize: graphJson.length,
        modelName: this.options.modelName,
      },
      "Starting Gemini analysis",
    );

    // Sanitize and validate input
    logger.debug("Sanitizing graph JSON for LLM");
    const sanitizedGraphJson = this.sanitizeGraphJson(graphJson);

    // Craft prompt for analysis
    logger.debug("Crafting analysis prompt");
    const prompt = this.craftAnalysisPrompt(sanitizedGraphJson);

    // Execute with retry logic
    logger.debug("Executing LLM request with retry logic");
    const response = await this.executeWithRetries(prompt);

    // Parse and validate response
    logger.debug("Parsing and validating LLM response");
    const result = this.parseAndValidateResponse(response);

    logger.info("Gemini analysis completed successfully");
    return result;
  }

  /**
   * Sanitizes graph JSON to ensure only dependency structure is sent to LLM.
   *
   * @param graphJson - Raw graph JSON string
   * @returns Sanitized graph JSON containing only file paths and dependencies
   */
  private sanitizeGraphJson(graphJson: string): string {
    try {
      const graph = JSON.parse(graphJson);

      if (typeof graph !== "object" || graph === null || Array.isArray(graph)) {
        throw new LLMError("Graph must be an object", "INVALID_GRAPH_FORMAT");
      }

      // Create sanitized graph with only file paths and dependency relationships
      const sanitized: Record<string, string[]> = {};

      for (const [key, value] of Object.entries(graph)) {
        if (typeof key === "string" && Array.isArray(value)) {
          // Only include string arrays (dependency lists)
          const dependencies = value.filter(
            (dep): dep is string => typeof dep === "string",
          );
          sanitized[key] = dependencies;
        }
      }

      return JSON.stringify(sanitized);
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }
      throw new LLMError(
        `Failed to sanitize graph JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
        "SANITIZATION_ERROR",
      );
    }
  }

  /**
   * Crafts a detailed prompt for dependency graph analysis.
   *
   * @param graphJson - Sanitized graph JSON
   * @returns Analysis prompt string
   */
  private craftAnalysisPrompt(graphJson: string): string {
    return `You are a senior software architect analyzing a TypeScript project's dependency graph. 

Your task is to analyze the dependency relationships and provide architectural insights.

## Dependency Graph (JSON adjacency list):
${graphJson}

## Analysis Requirements:
1. **Circular Dependencies**: Identify any circular import cycles
2. **Tight Coupling**: Find modules with high fan-in (many dependents) or high fan-out (many dependencies)
3. **Architecture Recommendations**: Suggest improvements for better maintainability and separation of concerns

## Response Format:
Respond with a JSON object in this exact format:
{
  "circularDependencies": [
    "Description of each circular dependency found"
  ],
  "tightCoupling": [
    "Description of each tight coupling issue found"
  ],
  "recommendations": [
    "Specific architectural recommendations"
  ]
}

## Guidelines:
- Use descriptive, actionable language
- Be specific about which modules are involved
- Provide concrete suggestions for improvement
- If no issues are found, return empty arrays for circularDependencies and tightCoupling
- Always provide at least one recommendation, even for well-structured code
- Focus on practical, implementable suggestions

Analyze the dependency graph and respond with the JSON object only (no additional text).`;
  }

  /**
   * Executes the LLM request with exponential backoff retry logic.
   *
   * @param prompt - Analysis prompt
   * @returns Raw response text from LLM
   */
  private async executeWithRetries(prompt: string): Promise<string> {
    logger.debug(
      {
        maxRetries: this.options.maxRetries,
        timeout: this.options.timeout,
      },
      "Starting LLM request with retry logic",
    );

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      logger.debug(
        { attempt, maxRetries: this.options.maxRetries },
        "Attempting LLM request",
      );

      const timeoutInfo = this.createTimeoutPromise();

      try {
        const result = await Promise.race([
          this.genai.models.generateContent({
            model: this.options.modelName,
            contents: prompt,
          }),
          timeoutInfo.promise,
        ]);

        // Clear timeout since request completed successfully
        timeoutInfo.cleanup();

        if (!result.text) {
          logger.warn({ attempt }, "Empty response received from Gemini");
          throw new LLMError(
            "Empty response received from Gemini",
            "EMPTY_RESPONSE",
          );
        }

        logger.debug(
          {
            attempt,
            responseLength: result.text.length,
          },
          "LLM request successful",
        );

        return result.text;
      } catch (error) {
        // Ensure timeout is cleaned up even on error
        timeoutInfo.cleanup();

        lastError = error instanceof Error ? error : new Error(String(error));

        logger.warn(
          {
            attempt,
            error: lastError.message,
            retryable: this.isRetryableError(error),
          },
          "LLM request failed",
        );

        // Don't retry on non-retryable errors
        if (!this.isRetryableError(error)) {
          logger.error(
            { error: lastError.message },
            "Non-retryable error encountered, aborting",
          );
          throw this.convertToLLMError(error);
        }

        // If this was the last attempt, throw the error
        if (attempt === this.options.maxRetries) {
          logger.error(
            {
              maxRetries: this.options.maxRetries,
              finalError: lastError.message,
            },
            "Max retries exceeded, aborting",
          );
          throw this.convertToLLMError(lastError);
        }

        // Wait before retrying
        const delay = this.calculateRetryDelay(attempt);
        logger.debug({ attempt, delayMs: delay }, "Waiting before retry");
        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript requires it
    throw this.convertToLLMError(lastError ?? new Error("Unknown error"));
  }

  /**
   * Parses and validates the LLM response using Zod schema.
   *
   * @param responseText - Raw response text from LLM
   * @returns Validated InsightPayload
   */
  private parseAndValidateResponse(responseText: string): InsightPayload {
    try {
      // Try to extract JSON from response (in case LLM added extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : responseText;

      const parsed = JSON.parse(jsonText);

      // Validate against schema
      const result = InsightPayloadSchema.safeParse(parsed);

      if (!result.success) {
        throw new LLMError(
          `Invalid response format: ${result.error.message}`,
          "INVALID_RESPONSE_FORMAT",
        );
      }

      return result.data;
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }

      throw new LLMError(
        `Failed to parse LLM response: ${error instanceof Error ? error.message : "Unknown error"}`,
        "RESPONSE_PARSE_ERROR",
      );
    }
  }

  /**
   * Creates a timeout promise for request cancellation.
   */
  private createTimeoutPromise(): {
    promise: Promise<never>;
    cleanup: () => void;
  } {
    let timeoutId: NodeJS.Timeout;

    const promise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new LLMError("Request timeout", "TIMEOUT", undefined, true));
      }, this.options.timeout);
    });

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };

    return { promise, cleanup };
  }

  /**
   * Determines if an error should be retried.
   *
   * @param error - Error to check
   * @returns True if the error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof LLMError) {
      return error.retryable;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("network") ||
        message.includes("timeout") ||
        message.includes("econnreset") ||
        message.includes("enotfound") ||
        message.includes("429") ||
        message.includes("5") // 5xx errors
      );
    }

    return false;
  }

  /**
   * Converts any error to an appropriate LLMError.
   *
   * @param error - Error to convert
   * @returns LLMError instance
   */
  private convertToLLMError(error: unknown): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes("401") || message.includes("unauthorized")) {
        return LLMError.authenticationError(error.message);
      }

      if (message.includes("429") || message.includes("rate limit")) {
        return LLMError.rateLimitError(error.message);
      }

      if (message.includes("network") || message.includes("timeout")) {
        return LLMError.networkError(error.message);
      }

      return new LLMError(error.message, "UNKNOWN_ERROR");
    }

    return new LLMError(String(error), "UNKNOWN_ERROR");
  }

  /**
   * Calculates retry delay with exponential backoff.
   *
   * @param attempt - Current attempt number (0-based)
   * @returns Delay in milliseconds
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = this.options.baseDelay * Math.pow(2, attempt);
    // Add some jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.min(delay + jitter, 30000); // Cap at 30 seconds
  }

  /**
   * Sleep utility for delays.
   *
   * @param ms - Milliseconds to sleep
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
