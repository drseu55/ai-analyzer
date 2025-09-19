import {
  Project,
  ImportDeclaration,
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
} from "ts-morph";
import { extname } from "path";

/**
 * Function type for resolving import specifiers to absolute file paths
 */
export type ImportResolver = (
  fromFile: string,
  specifier: string,
) => string | null;

/**
 * Represents the parsed imports from a collection of files.
 * Key: absolute file path, Value: array of imported absolute file paths
 */
export type ParsedImports = Record<string, string[]>;

/**
 * Parses static import statements from TypeScript files and resolves them to file paths.
 *
 * @param files - Array of absolute file paths to parse
 * @param resolve - Function to resolve import specifiers to absolute paths
 * @returns Promise resolving to mapping of file paths to their imported file paths
 */
export async function parseImports(
  files: string[],
  resolve: ImportResolver,
): Promise<ParsedImports> {
  // Validate inputs
  if (!files || files.length === 0) {
    return {};
  }

  if (!resolve || typeof resolve !== "function") {
    throw new Error("resolve function is required");
  }

  // Filter to only TypeScript files
  const typeScriptFiles = files.filter(isTypeScriptFile);

  if (typeScriptFiles.length === 0) {
    return {};
  }

  // Create ts-morph project without in-memory filesystem
  // We'll use the real filesystem since we're working with real files
  const project = new Project({
    compilerOptions: {
      target: ScriptTarget.ESNext,
      module: ModuleKind.ESNext,
      moduleResolution: ModuleResolutionKind.NodeNext,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
    },
  });

  // Add files to project
  const sourceFiles = typeScriptFiles.map((filePath) => {
    return project.addSourceFileAtPath(filePath);
  });

  const result: ParsedImports = {};

  // Process each source file
  for (const sourceFile of sourceFiles) {
    const filePath = sourceFile.getFilePath();
    const imports = new Set<string>();

    // Get all import declarations
    const importDeclarations = sourceFile.getImportDeclarations();

    for (const importDecl of importDeclarations) {
      // Skip type-only imports
      if (importDecl.isTypeOnly()) {
        continue;
      }

      // Skip side-effect imports (imports without 'from' clause)
      const moduleSpecifier = importDecl.getModuleSpecifier();
      if (!moduleSpecifier) {
        continue;
      }

      // Get the import specifier string
      const specifier = moduleSpecifier.getLiteralValue();

      if (!specifier || specifier.trim() === "") {
        continue;
      }

      // Resolve the import specifier to an absolute path
      const resolvedPath = resolve(filePath, specifier);

      if (resolvedPath && isTypeScriptFile(resolvedPath)) {
        imports.add(resolvedPath);
      }
    }

    // Convert to sorted array and store
    result[filePath] = Array.from(imports).sort();
  }

  return result;
}

/**
 * Checks if a file path represents a TypeScript file (.ts or .tsx)
 * @param filePath - File path to check
 * @returns True if the file is a TypeScript file
 */
function isTypeScriptFile(filePath: string): boolean {
  const ext = extname(filePath);
  return ext === ".ts" || ext === ".tsx";
}

/**
 * Extracts import specifiers from an import declaration.
 * Handles different import forms: default, named, namespace.
 *
 * @param importDecl - The import declaration node
 * @returns Array of import specifier information
 */
export function extractImportSpecifiers(
  importDecl: ImportDeclaration,
): ImportSpecifierInfo[] {
  const specifiers: ImportSpecifierInfo[] = [];

  // Default import: import foo from 'module'
  const defaultImport = importDecl.getDefaultImport();
  if (defaultImport) {
    specifiers.push({
      name: defaultImport.getText(),
      type: "default",
      isTypeOnly: false, // Default imports are already filtered at declaration level
    });
  }

  // Namespace import: import * as foo from 'module'
  const namespaceImport = importDecl.getNamespaceImport();
  if (namespaceImport) {
    specifiers.push({
      name: namespaceImport.getText(),
      type: "namespace",
      isTypeOnly: false,
    });
  }

  // Named imports: import { foo, bar } from 'module'
  const namedImports = importDecl.getNamedImports();
  for (const namedImport of namedImports) {
    specifiers.push({
      name: namedImport.getName(),
      alias: namedImport.getAliasNode()?.getText(),
      type: "named",
      isTypeOnly: namedImport.isTypeOnly(),
    });
  }

  return specifiers;
}

/**
 * Information about an import specifier
 */
export interface ImportSpecifierInfo {
  /** The imported name */
  name: string;
  /** The alias if used (e.g., 'as alias') */
  alias?: string;
  /** Type of import */
  type: "default" | "named" | "namespace";
  /** Whether this is a type-only import */
  isTypeOnly: boolean;
}
