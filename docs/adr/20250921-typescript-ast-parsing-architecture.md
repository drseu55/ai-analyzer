# TypeScript AST Parsing Architecture

- Status: accepted
- Date: 2025-09-21

Technical Story: Implementation of robust TypeScript import extraction using Abstract Syntax Tree (AST) parsing to accurately identify all forms of dependencies in TypeScript projects for dependency analysis.

## Context and Problem Statement

The dependency analysis tool requires accurate extraction of import dependencies from TypeScript source files. TypeScript supports multiple import patterns including static imports, dynamic imports, re-exports, and type-only imports. Additionally, large projects may contain hundreds or thousands of files, requiring efficient parsing strategies. The solution must handle all import forms while providing reliable results for dependency graph construction.

## Decision Drivers

- **Accuracy**: Must detect all forms of TypeScript dependencies (static, dynamic, re-exports)
- **Maintainability**: Clear separation between parsing logic and path resolution
- **TypeScript Support**: Handle modern TypeScript syntax and features correctly
- **Selective Processing**: Filter out type-only imports that don't affect runtime dependencies

## Considered Options

- **Option 1**: Use TypeScript Compiler API directly for import extraction
- **Option 2**: Use ts-morph library for AST manipulation and parsing
- **Option 3**: Use regex-based parsing for import detection

## Decision Outcome

Chosen option: "ts-morph library for AST manipulation and parsing", because it provides the best balance of accuracy, performance, and developer experience while handling all TypeScript language features correctly.

### Positive Consequences

- **Complete TypeScript support**: Handles all syntax features and language constructs correctly
- **Robust AST manipulation**: Reliable detection of complex import patterns
- **Performance optimized**: Efficient parsing with built-in caching and optimization
- **Clean API design**: Simplified code compared to raw TypeScript Compiler API
- **Comprehensive pattern support**: Static imports, dynamic imports, and re-exports
- **Error resilience**: Graceful handling of syntax errors in source files

### Negative Consequences

- **External dependency**: Adds ts-morph as a dependency to the project
- **Memory usage**: AST parsing requires more memory than regex-based approaches
- **Learning curve**: Requires understanding of TypeScript AST concepts

## Pros and Cons of the Options

### Option 1: TypeScript Compiler API

- Good, because it's the official TypeScript parsing implementation
- Good, because it handles all TypeScript language features
- Good, because it provides complete type information
- Bad, because it has a complex API that's difficult to use correctly
- Bad, because it requires significant boilerplate for basic operations
- Bad, because it's designed for compilation, not analysis

### Option 2: ts-morph library

- Good, because it provides a simplified API over TypeScript Compiler API
- Good, because it handles all TypeScript syntax correctly
- Good, because it includes built-in optimizations and caching
- Good, because it has excellent TypeScript integration
- Good, because it simplifies AST traversal and manipulation
- Bad, because it adds an external dependency
- Bad, because it has some overhead compared to raw Compiler API

### Option 3: Regex-based parsing

- Good, because it's simple to implement and understand
- Good, because it has minimal memory footprint
- Good, because it's very fast for simple cases
- Bad, because it cannot handle complex TypeScript syntax correctly
- Bad, because it's fragile and breaks with language evolution
- Bad, because it cannot distinguish between different import types
- Bad, because it cannot handle nested expressions or complex patterns

## Architecture Details

### Core Design Principles

#### Separation of Concerns

The parser module follows a clear separation between:

- **Import extraction logic**: Pure AST processing functions
- **Path resolution**: Delegated to injected resolver function
- **File filtering**: TypeScript-specific file validation
- **Concurrency control**: Configurable batch processing

This separation enables independent testing and makes the module flexible for different use cases.

#### Comprehensive Import Pattern Support

The parser handles all major TypeScript dependency patterns:

```typescript
// Static imports
import { foo } from "./module";
import * as bar from "./module";
import baz from "./module";

// Dynamic imports
const module = await import("./dynamic-module");

// Re-exports
export * from "./module";
export { specific } from "./module";
```

#### Performance Optimization Strategy

**Batch Processing with Concurrency Control**:

- Files are processed in configurable batch sizes (default: 10)
- Uses `Promise.all()` for concurrent file processing within batches
- Sequential batch processing prevents memory exhaustion
- Configurable concurrency through `ParseImportsOptions`

**Efficient AST Operations**:

- Single AST traversal per file for all import types
- Early filtering of non-TypeScript files
- Memory-efficient Set usage for duplicate prevention

#### Type-Only Import Filtering

The parser correctly identifies and excludes type-only imports that don't affect runtime dependencies:

```typescript
import type { TypeDef } from "./types"; // Excluded
import { type TypeDef, runtimeValue } from "./module"; // Only runtimeValue included
```

This filtering is crucial for accurate dependency analysis since type-only imports don't create runtime dependencies.

#### Error Resilience

- Input validation with meaningful error messages
- Safe handling of malformed source files
- Continuation of processing despite individual file errors
- Comprehensive logging for debugging and monitoring

### Implementation Details

#### Import Processing Functions

**`processStaticImports()`**: Handles traditional import declarations

- Iterates through `ImportDeclaration` AST nodes
- Filters out type-only imports using `isTypeOnly()`
- Extracts module specifier strings safely
- Resolves paths through injected resolver function

**`processDynamicImports()`**: Handles dynamic import expressions

- Traverses AST to find `CallExpression` nodes with `ImportKeyword`
- Validates argument structure and types
- Extracts string literal import specifiers
- Handles complex expressions safely

**`processReExports()`**: Handles re-export declarations

- Processes `ExportDeclaration` nodes with module specifiers
- Filters out type-only re-exports
- Treats re-exports as dependencies for graph construction
- Ensures proper dependency tracking through re-export chains

#### Concurrency Architecture

The parser implements a sophisticated concurrency model:

1. **File Batching**: Files are divided into batches based on concurrency setting
2. **Concurrent Processing**: Each batch processes files in parallel using `Promise.all()`
3. **Sequential Batches**: Batches are processed sequentially to control memory usage
4. **Result Aggregation**: Results are merged after each batch completion

This approach provides optimal performance while preventing memory exhaustion on large codebases.
