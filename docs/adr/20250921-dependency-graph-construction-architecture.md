# Dependency Graph Construction Architecture

- Status: accepted
- Date: 2025-09-21

Technical Story: Implementation of dependency graph construction and analysis using directed graph algorithms to identify circular dependencies, coupling metrics, and architectural insights from TypeScript project dependency relationships.

## Context and Problem Statement

The dependency analysis tool needs to construct and analyze dependency graphs from parsed import relationships. The system must detect circular dependencies, compute coupling metrics (fan-in/fan-out), and provide insights about architectural quality.

## Decision Drivers

- **Algorithm Reliability**: Must use proven graph algorithms for cycle detection and analysis
- **Performance**: Should handle large dependency graphs efficiently
- **Deterministic Output**: Results must be consistent and reproducible for testing
- **Extensibility**: Easy to add new analysis metrics and algorithms
- **Error Resilience**: Graceful handling of edge cases and malformed data
- **Architectural Insights**: Provide meaningful metrics beyond basic cycle detection

## Considered Options

- **Option 1**: Implement custom graph data structure and algorithms
- **Option 2**: Use established graph library (@dagrejs/graphlib)
- **Option 3**: Use specialized dependency analysis libraries

## Decision Outcome

Chosen option: "Use established graph library (@dagrejs/graphlib)", because it provides battle-tested algorithms, excellent performance, and comprehensive graph operations while maintaining simplicity and reliability.

### Positive Consequences

- **Proven algorithms**: Reliable cycle detection and graph analysis using well-tested implementations
- **Performance optimized**: Efficient graph operations optimized for large datasets
- **Rich API**: Comprehensive set of graph operations and algorithms
- **Active maintenance**: Well-maintained library with ongoing improvements
- **Standard algorithms**: Implements standard graph algorithms correctly

### Negative Consequences

- **External dependency**: Adds graphlib as a project dependency
- **API learning curve**: Requires understanding of graphlib's specific API patterns
- **CommonJS dependency**: Requires special handling for ES module imports

## Pros and Cons of the Options

### Option 1: Custom graph implementation

- Good, because it provides complete control over implementation
- Good, because it has no external dependencies
- Good, because it could be optimized for specific use cases
- Bad, because it requires implementing complex algorithms from scratch
- Bad, because it's prone to bugs in algorithm implementation
- Bad, because it requires extensive testing and validation
- Bad, because it would need ongoing maintenance for performance optimizations

### Option 2: @dagrejs/graphlib

- Good, because it provides proven, well-tested algorithms
- Good, because it has excellent performance characteristics
- Good, because it includes comprehensive graph operations
- Good, because it's actively maintained and widely used
- Good, because it implements standard graph theory algorithms correctly
- Bad, because it adds an external dependency
- Bad, because it uses CommonJS requiring import adaptation

### Option 3: Specialized dependency analysis libraries

- Good, because they might provide domain-specific optimizations
- Good, because they could include pre-built analysis features
- Bad, because they may not be as well-maintained as general graph libraries
- Bad, because they might be over-engineered for our specific needs
- Bad, because they could have limited flexibility for custom analysis
- Bad, because they might not provide the low-level control we need

## Architecture Details

### Core Design Principles

#### Separation of Graph Construction and Analysis

The architecture cleanly separates:

- **Graph Construction**: Building graph structure from adjacency data
- **Graph Analysis**: Computing metrics and detecting patterns
- **Graph Serialization**: Converting between different representations
- **Metric Computation**: Calculating coupling and complexity metrics

#### Deterministic Output Strategy

All graph operations produce deterministic, reproducible results:

- **Sorted node processing**: All iterations use sorted node lists
- **Consistent cycle ordering**: Cycles are sorted by first element and length
- **Stable metric computation**: Fan-in/fan-out calculations use consistent ordering
- **Deterministic serialization**: Adjacency output has sorted keys and values

#### Immutable Graph Operations

Graph analysis functions treat the graph as immutable:

- **Read-only operations**: Analysis functions don't modify the input graph
- **Pure functions**: All analysis functions are side-effect free

### Cycle Detection Algorithm

#### Algorithm Choice

Uses graphlib's `alg.findCycles()` which implements a depth-first search based algorithm.

#### Cycle Processing and Reporting

```typescript
export function findCycles(graph: Graph): Cycle[] {
  const cycles = alg.findCycles(graph);

  // Sort cycles for deterministic output
  const sortedCycles = cycles
    .map((cycle) => cycle.sort()) // Sort nodes within each cycle
    .sort((a, b) => {
      // Sort cycles by first element, then by length
      const firstComparison = a[0].localeCompare(b[0]);
      if (firstComparison !== 0) {
        return firstComparison;
      }
      return a.length - b.length;
    });

  return sortedCycles;
}
```

**Processing Strategy**:

- **Individual cycle sorting**: Nodes within cycles are sorted alphabetically
- **Cycle array sorting**: Cycles are ordered by first node, then by length
- **Consistent representation**: Same cycles always appear in same order
- **Logging integration**: Structured logging with cycle details

### Coupling Metrics Architecture

#### Fan-In and Fan-Out Computation

The system computes two key coupling metrics:

**Fan-In (Afferent Coupling)**:

- Number of incoming dependencies (who depends on this module)
- High fan-in indicates modules that are widely used
- Calculated using `graph.predecessors(node)`

**Fan-Out (Efferent Coupling)**:

- Number of outgoing dependencies (what this module depends on)
- High fan-out indicates modules with many dependencies
- Calculated using `graph.successors(node)`

#### High Coupling Detection

```typescript
export function findHighCouplingNodes(
  graph: Graph,
  options: {
    fanInThreshold?: number;
    fanOutThreshold?: number;
  } = {},
): {
  highFanIn: Array<{ node: string; count: number }>;
  highFanOut: Array<{ node: string; count: number }>;
} {
  const { fanInThreshold = 5, fanOutThreshold = 10 } = options;
  const { fanIn, fanOut } = computeFanInOut(graph);

  // Find and sort nodes exceeding thresholds
  const highFanIn = Object.entries(fanIn)
    .filter(([, count]) => count >= fanInThreshold)
    .map(([node, count]) => ({ node, count }))
    .sort((a, b) => b.count - a.count || a.node.localeCompare(b.node));

  // Similar processing for fan-out...

  return { highFanIn, highFanOut };
}
```

**Threshold Strategy**:

- **Configurable thresholds**: Different projects may have different coupling norms
- **Deterministic ties**: Alphabetical ordering for nodes with same coupling

### Performance Characteristics

**Memory Usage**:

- Graph structure scales linearly with number of files and dependencies
- Efficient representation using graphlib's optimized data structures
- Temporary collections are cleaned up after processing

The architecture provides good performance characteristics suitable for analyzing large TypeScript projects with many files and complex dependency relationships.
