import { Graph, alg } from "@dagrejs/graphlib";

/**
 * Represents an adjacency mapping for dependency graphs.
 * Key: file path, Value: array of imported file paths
 */
export type AdjacencyMapping = Record<string, string[]>;

/**
 * Represents a cycle in the dependency graph.
 * Array of file paths forming a circular dependency.
 */
export type Cycle = string[];

/**
 * Builds a directed dependency graph from an adjacency mapping.
 *
 * @param adjacency - Mapping of file paths to their imported dependencies
 * @returns Directed graph with nodes and edges representing dependencies
 */
export function buildGraph(adjacency: AdjacencyMapping): Graph {
  const graph = new Graph({ directed: true });

  // Collect all unique nodes (files)
  const allNodes = new Set<string>();

  // Add all source files as nodes
  for (const sourceFile of Object.keys(adjacency)) {
    allNodes.add(sourceFile);
  }

  // Add all target files as nodes
  for (const dependencies of Object.values(adjacency)) {
    for (const dependency of dependencies) {
      allNodes.add(dependency);
    }
  }

  // Add all nodes to the graph
  for (const node of allNodes) {
    graph.setNode(node);
  }

  // Add edges from importer to importee
  for (const [sourceFile, dependencies] of Object.entries(adjacency)) {
    for (const dependency of dependencies) {
      graph.setEdge(sourceFile, dependency);
    }
  }

  return graph;
}

/**
 * Serializes a graph back to an adjacency mapping format.
 * Returns a stable, deterministic representation with sorted arrays and keys.
 *
 * @param graph - The graph to serialize
 * @returns Adjacency mapping with sorted keys and values
 */
export function serializeAdjacency(graph: Graph): AdjacencyMapping {
  const result: AdjacencyMapping = {};

  // Get all nodes and sort them for deterministic output
  const nodes = graph.nodes().sort();

  for (const node of nodes) {
    // Get all outgoing edges (successors) for this node
    const successors = graph.successors(node) || [];

    // Sort successors for deterministic output
    result[node] = successors.sort();
  }

  return result;
}

/**
 * Finds all cycles in the dependency graph.
 *
 * @param graph - The graph to analyze for cycles
 * @returns Array of cycles, where each cycle is an array of node IDs forming a loop
 */
export function findCycles(graph: Graph): Cycle[] {
  try {
    // Use graphlib's built-in cycle detection algorithm
    const cycles = alg.findCycles(graph);

    // Sort cycles for deterministic output
    // Sort each individual cycle and then sort the array of cycles
    return cycles
      .map((cycle) => cycle.sort()) // Sort nodes within each cycle
      .sort((a, b) => {
        // Sort cycles by their first element, then by length
        const firstComparison = a[0].localeCompare(b[0]);
        if (firstComparison !== 0) {
          return firstComparison;
        }
        return a.length - b.length;
      });
  } catch (error) {
    // Handle any errors in cycle detection gracefully
    console.warn("Error during cycle detection:", error);
    return [];
  }
}

/**
 * Gets basic statistics about the dependency graph.
 *
 * @param graph - The graph to analyze
 * @returns Object containing graph statistics
 */
export function getGraphStats(graph: Graph): {
  nodeCount: number;
  edgeCount: number;
  hasCycles: boolean;
  maxDepth: number;
} {
  const nodeCount = graph.nodeCount();
  const edgeCount = graph.edgeCount();
  const cycles = findCycles(graph);
  const hasCycles = cycles.length > 0;

  // Calculate maximum depth using topological sort if acyclic
  let maxDepth = 0;
  if (!hasCycles && nodeCount > 0) {
    try {
      const topoOrder = alg.topsort(graph);
      maxDepth = calculateMaxDepth(graph, topoOrder);
    } catch (_error) {
      // If topological sort fails, graph might have cycles we missed
      maxDepth = -1;
    }
  }

  return {
    nodeCount,
    edgeCount,
    hasCycles,
    maxDepth,
  };
}

/**
 * Calculates the maximum depth of the dependency graph.
 *
 * @param graph - The dependency graph
 * @param topoOrder - Topologically sorted nodes
 * @returns Maximum depth of the graph
 */
function calculateMaxDepth(graph: Graph, topoOrder: string[]): number {
  const depths = new Map<string, number>();

  // Initialize all nodes with depth 0
  for (const node of topoOrder) {
    depths.set(node, 0);
  }

  // Calculate depths in topological order
  for (const node of topoOrder) {
    const currentDepth = depths.get(node) || 0;
    const successors = graph.successors(node) || [];

    for (const successor of successors) {
      const successorDepth = depths.get(successor) || 0;
      depths.set(successor, Math.max(successorDepth, currentDepth + 1));
    }
  }

  // Return the maximum depth
  return Math.max(...depths.values());
}

/**
 * Validates that an adjacency mapping is well-formed.
 *
 * @param adjacency - The adjacency mapping to validate
 * @returns True if valid, throws error if invalid
 */
export function validateAdjacencyMapping(adjacency: AdjacencyMapping): boolean {
  if (!adjacency || typeof adjacency !== "object") {
    throw new Error("Adjacency mapping must be a non-null object");
  }

  for (const [sourceFile, dependencies] of Object.entries(adjacency)) {
    if (typeof sourceFile !== "string" || sourceFile.trim() === "") {
      throw new Error(`Invalid source file: ${sourceFile}`);
    }

    if (!Array.isArray(dependencies)) {
      throw new Error(`Dependencies for ${sourceFile} must be an array`);
    }

    for (const dependency of dependencies) {
      if (typeof dependency !== "string" || dependency.trim() === "") {
        throw new Error(
          `Invalid dependency: ${dependency} for source ${sourceFile}`,
        );
      }
    }
  }

  return true;
}
