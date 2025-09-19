# TypeScript Path Resolution Architecture

- Status: accepted
- Date: 2025-09-19

Technical Story: Implementation of TypeScript path and alias resolution utilities for accurate dependency analysis in TypeScript projects with complex import mappings.

## Context and Problem Statement

The dependency analysis tool needs to accurately resolve TypeScript import specifiers to actual file paths to build correct dependency graphs. TypeScript projects commonly use path mappings (aliases) defined in `tsconfig.json` such as `@app/*` → `src/*`, relative imports, and baseUrl resolution. Without proper path resolution, the dependency analysis would be inaccurate or incomplete.

How should we implement TypeScript path resolution to handle all common patterns while maintaining performance and correctness?

## Decision Drivers

- **Accuracy**: Must correctly resolve all TypeScript import patterns used in real projects
- **Performance**: Should only compute paths without expensive file system operations
- **Maintainability**: Clear separation of concerns and testable components
- **Standards Compliance**: Follow TypeScript's module resolution algorithm
- **Extensibility**: Easy to add support for new resolution patterns
- **Error Resilience**: Handle malformed or missing configuration gracefully

## Considered Options

- **Option 1**: Use TypeScript Compiler API for resolution
- **Option 2**: Implement custom path resolution with priority-based pattern matching
- **Option 3**: Use existing third-party resolution libraries

## Decision Outcome

Chosen option: "Custom path resolution with priority-based pattern matching", because it provides the best balance of accuracy, performance, and control while avoiding heavy dependencies.

### Positive Consequences

- **Pure functions**: No side effects, deterministic output enables easy testing
- **Performance optimized**: Only computes paths without file system access
- **Full control**: Can optimize for specific use cases and add custom logic
- **Pattern prioritization**: Exact matches take precedence over wildcards, avoiding conflicts
- **Comprehensive coverage**: Handles all common TypeScript resolution patterns
- **Error resilience**: Graceful handling of malformed configurations

### Negative Consequences

- **Custom implementation complexity**: Need to maintain our own resolution logic
- **Potential edge cases**: May not handle every obscure TypeScript resolution scenario
- **Testing burden**: Requires comprehensive test coverage for all patterns

## Pros and Cons of the Options

### Option 1: TypeScript Compiler API

- Good, because it's the official TypeScript resolution implementation
- Good, because it handles all edge cases correctly
- Bad, because it's heavy and includes file system operations
- Bad, because it's designed for compilation, not static analysis
- Bad, because it would require mocking file system for testing

### Option 2: Custom path resolution with priority-based pattern matching

- Good, because it's lightweight and focused on our specific needs
- Good, because it enables pure functions without side effects
- Good, because it allows optimization for static analysis use cases
- Good, because it provides full control over resolution behavior
- Bad, because it requires custom implementation and maintenance
- Bad, because it may not handle every TypeScript edge case

### Option 3: Third-party resolution libraries

- Good, because it avoids custom implementation
- Good, because it may handle more edge cases
- Bad, because it adds external dependencies
- Bad, because it may not fit our specific requirements
- Bad, because it may include unnecessary functionality

## Architecture Details

### Core Functions Design

#### `loadTsConfig(tsconfigPath?: string): Promise<TsConfigPaths>`

**Responsibility**: Parse and extract path mapping configuration from tsconfig.json

**Key decisions**:

- **Robust JSON comment parsing**: Implemented character-by-character parser to handle comments in JSON
- **Graceful error handling**: Returns empty config for missing/invalid files instead of throwing
- **Minimal extraction**: Only extracts `baseUrl` and `paths` to avoid unnecessary complexity
- **Async by design**: Uses file system promises for non-blocking operation

**Rationale**: TypeScript configuration files often contain comments, which standard JSON.parse() cannot handle. A robust parser ensures compatibility with real-world projects while maintaining simplicity by only extracting needed fields.

#### `createPathResolver(rootDir: string, tsConfig: TsConfigPaths): PathResolver`

**Responsibility**: Create a pure function that resolves import specifiers to file paths

**Key decisions**:

- **Factory pattern**: Returns a configured resolver function rather than a class
- **Priority-based resolution**: Processes patterns in order: exact matches → wildcards → baseUrl → external check
- **Pattern prioritization**: Sorts path mappings to prefer exact matches over wildcard patterns
- **Pure function output**: The returned resolver has no side effects and is deterministic
- **Comprehensive pattern support**: Handles relative paths, absolute paths, wildcards, and exact mappings

**Rationale**: The factory pattern enables dependency injection and testing while the resolver function remains pure. Pattern prioritization solves conflicts where broader patterns might match more specific cases (e.g., `@/*` matching `@/types` when an exact `@/types` mapping exists).

### Resolution Algorithm

1. **Empty specifier check**: Return null for empty/whitespace-only specifiers
2. **Relative path resolution**: Handle `./` and `../` imports using path operations
3. **Absolute path handling**: Pass through absolute paths unchanged
4. **Path mapping resolution**: Apply tsconfig path mappings with priority ordering
5. **External module detection**: Identify npm packages and node built-ins
6. **BaseUrl fallback**: Attempt baseUrl resolution for non-external specifiers
7. **Extension handling**: Add appropriate TypeScript extensions (.ts/.tsx)

### Pattern Prioritization Strategy

Path mappings are sorted to ensure correct resolution order:

1. **Exact matches** (no wildcards) processed first
2. **Wildcard patterns** processed by length (longer/more specific first)
3. **BaseUrl resolution** as fallback for non-external modules

This prevents conflicts where `@/types` might incorrectly match `@/*` instead of its exact mapping.
