import { InsightPayload } from "./types";

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
