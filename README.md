# TypeScript Dependency Analysis Tool

A TypeScript program for analyzing dependency complexity in TypeScript projects. This tool reads and parses TypeScript files to extract import statements, builds a dependency graph, integrates with Large Language Models (LLMs) for intelligent insights, and outputs structured results.

## Features

- **Comprehensive Import Analysis**: Supports static imports, dynamic imports, re-exports, and TypeScript path aliases
- **Dependency Graph Construction**: Builds directed graphs representing file dependencies
- **LLM Integration**: Uses Google Gemini API for intelligent analysis of circular dependencies, tight coupling, and refactoring recommendations
- **Programmatic Fallback**: Built-in programmatic analysis
- **Performance Controls**: Configurable concurrency and file limits for scalable analysis
- **Structured Logging**: Observable analysis pipeline with configurable log levels
- **Flexible Output**: Console or file output in structured JSON format
- **REST API**: Express server providing HTTP endpoints for analysis
- **Security-First**: Only dependency relationships are sent to LLM, never source code

## Quick Start

### Prerequisites

- Node.js 20+
- Google Gemini API key (optional, for LLM analysis)

### Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd ai-analyzer
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables (optional):

   ```bash
   cp .env.example .env
   # Edit .env and add your GEMINI_API_KEY
   ```

4. Build the project:

   ```bash
   npm run build
   ```

### Basic Usage

Analyze a TypeScript project with LLM insights:

```bash
npm start -- --dir ./sample-src
```

Use programmatic analysis only (no LLM):

```bash
npm start -- --dir ./sample-src --use-programmatic-analysis
```

Save results to a file:

```bash
npm start -- --dir ./sample-src --output analysis-results.json
```

## CLI Options

| Option                        | Description                     | Default        | Example                       |
| ----------------------------- | ------------------------------- | -------------- | ----------------------------- |
| `-d, --dir <path>`            | Directory to analyze (required) | -              | `--dir ./src`                 |
| `-o, --output <file>`         | Output file path (optional)     | Console output | `--output results.json`       |
| `--tsconfig <path>`           | Path to tsconfig.json           | Auto-detected  | `--tsconfig ./tsconfig.json`  |
| `--max-files <number>`        | Maximum files to analyze        | Unlimited      | `--max-files 100`             |
| `--concurrency <number>`      | Concurrent file processing      | 10             | `--concurrency 5`             |
| `--use-programmatic-analysis` | Skip LLM, use programmatic only | false          | `--use-programmatic-analysis` |

### Environment Variables

| Variable         | Description                                            | Required                        |
| ---------------- | ------------------------------------------------------ | ------------------------------- |
| `GEMINI_API_KEY` | Google Gemini API key for LLM analysis                 | No (falls back to programmatic) |
| `LOG_LEVEL`      | Logging level (trace, debug, info, warn, error, fatal) | No (default: info)              |
| `NODE_ENV`       | Environment mode (development, production, test)       | No (default: development)       |
| `PORT`           | Server port (server mode only)                         | No (default: 3000)              |
| `HOST`           | Server host (server mode only)                         | No (default: localhost)         |

## Output Format

The tool outputs structured JSON with the following format:

```json
{
  "graph": {
    "src/fileA.ts": ["src/fileB.ts", "src/fileC.ts"],
    "src/fileB.ts": ["src/fileC.ts"],
    "src/fileC.ts": []
  },
  "insights": {
    "circularDependencies": [
      "Circular dependency detected: src/moduleA.ts -> src/moduleB.ts -> src/moduleA.ts"
    ],
    "tightCoupling": [
      "Module src/utils.ts has high fan-in (8 dependencies), consider splitting"
    ],
    "recommendations": [
      "Consider extracting common functionality from src/utils.ts into smaller modules",
      "Review circular dependency between authentication modules"
    ]
  }
}
```

## REST API

The Express server provides HTTP endpoints for dependency analysis with the same functionality as the CLI.

### Starting the Server

```bash
# Build and start the server
npm run build
npm run start:server
```

### API Endpoints

#### `GET /api/`

API information and usage documentation.

#### `GET /api/analyze`

Analyze TypeScript dependencies.

**Query Parameters:**

| Parameter                 | Type    | Required | Description                              | Example           |
| ------------------------- | ------- | -------- | ---------------------------------------- | ----------------- |
| `dir`                     | string  | Yes      | Directory to analyze                     | `./src`           |
| `tsconfig`                | string  | No       | Path to tsconfig.json                    | `./tsconfig.json` |
| `maxFiles`                | number  | No       | Maximum files to analyze                 | `100`             |
| `concurrency`             | number  | No       | Concurrent file processing (default: 10) | `5`               |
| `useProgrammaticAnalysis` | boolean | No       | Use programmatic analysis only           | `true`            |

**Response:**

```json
{
  "success": true,
  "requestId": "abc123",
  "duration": 1542,
  "timestamp": "2025-09-21T18:05:46.989Z",
  "result": {
    "graph": {
      "src/fileA.ts": ["src/fileB.ts"]
    },
    "insights": {
      "circularDependencies": [...],
      "tightCoupling": [...],
      "recommendations": [...]
    }
  }
}
```

**Error Response:**

```json
{
  "success": false,
  "requestId": "abc123",
  "error": {
    "message": "Directory path does not exist or is not accessible",
    "code": "DIR_NOT_FOUND",
    "statusCode": 404
  },
  "timestamp": "2025-09-21T18:06:52.365Z"
}
```

### Example Usage

```bash
# Basic analysis with LLM
curl "http://localhost:3000/api/analyze?dir=./src"

# Programmatic analysis with limits
curl "http://localhost:3000/api/analyze?dir=./src&useProgrammaticAnalysis=true"
```

## Architecture

The tool follows a layered, modular architecture inspired by clean architecture principles:

### High-Level Architecture

```text
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Input Layer   │    │  Domain Layer   │    │Infrastructure   │
│                 │    │                 │    │     Layer       │
│  • CLI (main.ts)│    │ • Parser        │    │ • LLM Client    │
│  • Config       │    │ • Graph Builder │    │ • File System   │
│  • Validation   │    │ • Analyzer      │    │ • Logger        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │Presentation     │
                    │     Layer       │
                    │                 │
                    │ • Reporter      │
                    │ • JSON Output   │
                    └─────────────────┘
```

### Core Components

1. **Parser** (`src/parser.ts`): Extracts imports from TypeScript AST using `ts-morph`
2. **Graph Builder** (`src/graph-builder.ts`): Constructs dependency graphs using `@dagrejs/graphlib`
3. **Analyzer** (`src/analyzer.ts`): Orchestrates programmatic and LLM analysis
4. **LLM Client** (`src/llm-client.ts`): Handles Google Gemini API integration with retries
5. **Reporter** (`src/reporter.ts`): Formats and outputs analysis results
6. **Main** (`src/main.ts`): CLI orchestration and pipeline coordination

## Development

### Project Structure

```text
ai-analyzer/
├── src/
│   ├── main.ts                 # CLI entry point
│   ├── parser.ts               # Import extraction
│   ├── graph-builder.ts        # Dependency graph logic
│   ├── analyzer.ts             # Analysis orchestration
│   ├── llm-client.ts           # LLM API integration
│   ├── reporter.ts             # Output formatting
│   ├── types.ts                # TypeScript interfaces
│   ├── server/                 # Express server
│   │   ├── index.ts           # Server entry point
│   │   ├── routes.ts          # API routes and handlers
│   │   └── service.ts         # Analysis service wrapper
│   ├── constants/              # Constants and defaults
│   └── utils/                  # Utilities (fs, tsconfig, logger)
├── tests/                      # Test suite
├── sample-src/                 # Sample TypeScript files for testing
├── dist/                       # Compiled output
└── README.md                   # This file
```

### Scripts

- `npm start -- <args>`: Run the CLI analysis tool
- `npm run start:server`: Start the Express server
- `npm test`: Run all tests
- `npm run coverage`: Generate coverage report
- `npm run build`: Compile TypeScript to JavaScript
- `npm run dev`: Development mode with auto-rebuild
- `npm run lint`: Run ESLint
- `npm run format`: Format code with Prettier

### Testing

Run tests:

```bash
# All tests
npm test

# Specific test file
npm test tests/parser.spec.ts

# With coverage
npm run coverage
```

## Examples

### Basic Project Analysis

```bash
# Analyze a simple TypeScript project
npm start -- --dir ./my-project/src

# Output results to file
npm start -- --dir ./my-project/src --output ./analysis.json

# Limit analysis to 50 files with 5 concurrent processes
npm start -- --dir ./my-project/src --max-files 50 --concurrency 5
```

## Architecture Documentation

This project maintains comprehensive Architecture Decision Records (ADRs) that document the key design decisions, trade-offs, and architectural patterns used throughout the codebase.

### What are ADRs?

Architecture Decision Records (ADRs) are documents that capture important architectural decisions made during the development process. They provide context about why certain technologies, patterns, or approaches were chosen, helping current and future developers understand the reasoning behind the implementation.

### Available ADRs

The ADR collection includes detailed documentation for:

- **[TypeScript Path Resolution Architecture](docs/adr/20250919-typescript-path-resolution-architecture.md)** - How the TypeScript path mappings and import resolution are handled
- **[TypeScript AST Parsing Architecture](docs/adr/20250921-typescript-ast-parsing-architecture.md)** - Design decisions for import extraction using AST parsing
- **[Dependency Graph Construction Architecture](docs/adr/20250921-dependency-graph-construction-architecture.md)** - Graph algorithms and analysis strategies

### Browsing ADRs

You can explore the complete architecture knowledge base in the [`docs/adr/`](docs/adr/) directory. There is a [README](docs/adr/README.md) file which describes the `log4brains` commands for proper viewing of the ADR documentation.
