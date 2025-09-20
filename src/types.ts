import { z } from "zod";

// Core domain interfaces

/**
 * Represents a dependency graph as an adjacency list.
 * Key: file path, Value: array of imported file paths
 */
export interface DependencyGraph {
  [filePath: string]: string[];
}

/**
 * LLM analysis insights payload
 */
export interface InsightPayload {
  circularDependencies: string[];
  tightCoupling: string[];
  recommendations: string[];
}

/**
 * Complete analysis output combining graph and insights
 */
export interface AnalysisOutput {
  graph: DependencyGraph;
  insights: InsightPayload;
}

/**
 * Parser results for individual files
 * Key: file path, Value: array of imported modules/files
 */
export type ParsedFileImports = Record<string, string[]>;

// Zod schemas for validation

/**
 * Schema for dependency graph validation
 */
export const DependencyGraphSchema = z.record(z.string(), z.array(z.string()));

/**
 * Schema for LLM insights validation
 */
export const InsightPayloadSchema = z.object({
  circularDependencies: z.array(z.string()),
  tightCoupling: z.array(z.string()),
  recommendations: z.array(z.string()),
});

/**
 * Schema for complete analysis output validation
 */
export const AnalysisOutputSchema = z.object({
  graph: DependencyGraphSchema,
  insights: InsightPayloadSchema,
});

/**
 * Schema for parser results validation
 */
export const ParsedFileImportsSchema = z.record(
  z.string(),
  z.array(z.string()),
);

// Type inference from Zod schemas for runtime validation
export type DependencyGraphType = z.infer<typeof DependencyGraphSchema>;
export type InsightPayloadType = z.infer<typeof InsightPayloadSchema>;
export type AnalysisOutputType = z.infer<typeof AnalysisOutputSchema>;
export type ParsedFileImportsType = z.infer<typeof ParsedFileImportsSchema>;
