import { readFile } from "fs/promises";
import { resolve, dirname, extname, isAbsolute } from "path";

/**
 * TypeScript configuration paths structure
 */
export interface TsConfigPaths {
  baseUrl?: string;
  paths?: Record<string, string[]>;
}

/**
 * Complete TypeScript configuration structure (subset we care about)
 */
interface TsConfig {
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
}

/**
 * Path resolver function type
 */
export type PathResolver = (
  fromFile: string,
  specifier: string,
) => string | null;

/**
 * Load TypeScript configuration from tsconfig.json
 * @param tsconfigPath - Optional path to tsconfig.json file
 * @returns Promise resolving to TsConfigPaths or empty object if not found
 */
export async function loadTsConfig(
  tsconfigPath?: string,
): Promise<TsConfigPaths> {
  const configPath = tsconfigPath || "tsconfig.json";
  const absoluteConfigPath = resolve(configPath);

  try {
    const configContent = await readFile(absoluteConfigPath, "utf8");

    // Parse JSON with support for comments (basic implementation)
    const cleanContent = removeJsonComments(configContent);
    const config: TsConfig = JSON.parse(cleanContent);

    return {
      baseUrl: config.compilerOptions?.baseUrl,
      paths: config.compilerOptions?.paths,
    };
  } catch (error) {
    // Return empty config if file doesn't exist or can't be parsed
    // Only log warnings for unexpected errors, not ENOENT
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.warn(
        `Warning: Could not load tsconfig from ${absoluteConfigPath}:`,
        error,
      );
    }
    return {};
  }
}

/**
 * Create a path resolver function for resolving import specifiers
 * @param rootDir - Root directory of the project
 * @param tsConfig - TypeScript configuration paths
 * @returns Function that resolves import specifiers to file paths
 */
export function createPathResolver(
  rootDir: string,
  tsConfig: TsConfigPaths,
): PathResolver {
  const absoluteRootDir = resolve(rootDir);
  const baseUrl = tsConfig.baseUrl
    ? resolve(absoluteRootDir, tsConfig.baseUrl)
    : absoluteRootDir;
  const pathMappings = tsConfig.paths || {};

  return (fromFile: string, specifier: string): string | null => {
    // Handle empty specifiers
    if (!specifier || specifier.trim() === "") {
      return null;
    }

    // Handle relative imports (starts with ./ or ../)
    if (specifier.startsWith(".")) {
      return resolveRelativePath(fromFile, specifier);
    }

    // Handle absolute paths (rare but possible)
    if (isAbsolute(specifier)) {
      return specifier;
    }

    // Try to resolve using path mappings first
    const mappedPath = resolvePathMapping(specifier, pathMappings, baseUrl);
    if (mappedPath) {
      return mappedPath;
    }

    // Check if it's likely an external module before trying baseUrl
    if (isExternalModule(specifier)) {
      return null;
    }

    // Try to resolve using baseUrl
    if (tsConfig.baseUrl) {
      const baseUrlPath = resolveWithBaseUrl(specifier, baseUrl);
      if (baseUrlPath) {
        return baseUrlPath;
      }
    }

    // Return null for unresolvable paths
    return null;
  };
}

/**
 * Resolve relative import paths
 * @param fromFile - Source file path
 * @param specifier - Import specifier (e.g., "./utils", "../components")
 * @returns Resolved absolute path or null
 */
function resolveRelativePath(
  fromFile: string,
  specifier: string,
): string | null {
  try {
    const fromDir = dirname(resolve(fromFile));
    const resolvedPath = resolve(fromDir, specifier);

    // Try to find actual file with TypeScript extensions
    return findActualFile(resolvedPath);
  } catch {
    return null;
  }
}

/**
 * Resolve import using TypeScript path mappings
 * @param specifier - Import specifier
 * @param pathMappings - Path mappings from tsconfig paths
 * @param baseUrl - Base URL for resolution
 * @returns Resolved absolute path or null
 */
function resolvePathMapping(
  specifier: string,
  pathMappings: Record<string, string[]>,
  baseUrl: string,
): string | null {
  // Sort patterns to prefer exact matches over wildcard matches
  const sortedPatterns = Object.entries(pathMappings).sort(
    ([patternA], [patternB]) => {
      const hasWildcardA = patternA.includes("*");
      const hasWildcardB = patternB.includes("*");

      // Exact matches (no wildcards) come first
      if (!hasWildcardA && hasWildcardB) return -1;
      if (hasWildcardA && !hasWildcardB) return 1;

      // If both are exact or both have wildcards, sort by length (longer first for more specific matches)
      return patternB.length - patternA.length;
    },
  );

  for (const [pattern, replacements] of sortedPatterns) {
    const match = matchPattern(specifier, pattern);
    if (match !== null) {
      // Try each replacement path
      for (const replacement of replacements) {
        const resolvedPath = applyReplacement(match, replacement, baseUrl);
        const actualFile = findActualFile(resolvedPath);
        if (actualFile) {
          return actualFile;
        }
      }
    }
  }

  return null;
}

/**
 * Resolve import using baseUrl
 * @param specifier - Import specifier
 * @param baseUrl - Base URL for resolution
 * @returns Resolved absolute path or null
 */
function resolveWithBaseUrl(specifier: string, baseUrl: string): string | null {
  try {
    const resolvedPath = resolve(baseUrl, specifier);
    return findActualFile(resolvedPath);
  } catch {
    return null;
  }
}

/**
 * Match a specifier against a pattern with wildcard support
 * @param specifier - Import specifier to match
 * @param pattern - Pattern from tsconfig paths (e.g., "@app/*")
 * @returns Matched parts object or null if no match
 */
function matchPattern(
  specifier: string,
  pattern: string,
): { prefix: string; suffix: string; wildcard: string } | null {
  const wildcardIndex = pattern.indexOf("*");

  if (wildcardIndex === -1) {
    // Exact match pattern
    return specifier === pattern
      ? { prefix: "", suffix: "", wildcard: specifier }
      : null;
  }

  // Wildcard pattern
  const prefix = pattern.slice(0, wildcardIndex);
  const suffix = pattern.slice(wildcardIndex + 1);

  if (specifier.startsWith(prefix) && specifier.endsWith(suffix)) {
    const wildcardPart = specifier.slice(
      prefix.length,
      specifier.length - suffix.length,
    );
    return { prefix, suffix, wildcard: wildcardPart };
  }

  return null;
}

/**
 * Apply replacement pattern with wildcard substitution
 * @param match - Matched pattern parts
 * @param replacement - Replacement pattern (e.g., "src/*")
 * @param baseUrl - Base URL for resolution
 * @returns Resolved path
 */
function applyReplacement(
  match: { prefix: string; suffix: string; wildcard: string },
  replacement: string,
  baseUrl: string,
): string {
  // For exact matches (no wildcard in replacement), use replacement as-is
  if (!replacement.includes("*")) {
    return resolve(baseUrl, replacement);
  }

  // For wildcard replacements, substitute the wildcard
  const replacedPath = replacement.replace("*", match.wildcard);
  return resolve(baseUrl, replacedPath);
}

/**
 * Find actual file with TypeScript extensions
 * @param basePath - Base path without extension
 * @returns Actual file path or null if not found
 */
function findActualFile(basePath: string): string | null {
  // If already has extension, check if it's a TypeScript file
  if (extname(basePath)) {
    const ext = extname(basePath);
    if ([".ts", ".tsx"].includes(ext)) {
      return basePath;
    }
    return null;
  }

  // For paths ending with index, add .ts extension
  if (basePath.endsWith("/index") || basePath.endsWith("index")) {
    return basePath + ".ts";
  }

  // For all other paths, add .ts extension
  return basePath + ".ts";
}

/**
 * Remove JSON comments (simple implementation)
 * Removes single-line comments and multi-line comments
 * @param content - JSON content with potential comments
 * @returns Clean JSON content
 */
function removeJsonComments(content: string): string {
  let result = "";
  let inString = false;
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let escapeNext = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (escapeNext) {
      if (inString && !inSingleLineComment && !inMultiLineComment) {
        result += char;
      }
      escapeNext = false;
      continue;
    }

    if (char === "\\" && inString) {
      escapeNext = true;
      result += char;
      continue;
    }

    if (char === '"' && !inSingleLineComment && !inMultiLineComment) {
      inString = !inString;
      result += char;
      continue;
    }

    if (!inString) {
      if (char === "/" && nextChar === "/" && !inMultiLineComment) {
        inSingleLineComment = true;
        i++; // Skip the next '/'
        continue;
      }

      if (char === "/" && nextChar === "*" && !inSingleLineComment) {
        inMultiLineComment = true;
        i++; // Skip the next '*'
        continue;
      }

      if (char === "*" && nextChar === "/" && inMultiLineComment) {
        inMultiLineComment = false;
        i++; // Skip the next '/'
        continue;
      }

      if (char === "\n" && inSingleLineComment) {
        inSingleLineComment = false;
        result += char; // Keep the newline
        continue;
      }
    }

    if (!inSingleLineComment && !inMultiLineComment) {
      result += char;
    }
  }

  return result;
}

/**
 * Normalize a path to be relative to a base directory
 * @param absolutePath - Absolute file path
 * @param baseDir - Base directory
 * @returns Relative path or the original path if not under base
 */
export function makeRelativePath(
  absolutePath: string,
  baseDir: string,
): string {
  const absoluteBase = resolve(baseDir);
  const absoluteTarget = resolve(absolutePath);

  if (
    absoluteTarget.startsWith(absoluteBase + "/") ||
    absoluteTarget === absoluteBase
  ) {
    return absoluteTarget.slice(absoluteBase.length + 1);
  }

  return absolutePath;
}

/**
 * Check if a specifier is likely an external module
 * @param specifier - Import specifier
 * @returns True if likely external (npm package)
 */
export function isExternalModule(specifier: string): boolean {
  // Handle empty strings
  if (!specifier || specifier.trim() === "") {
    return false;
  }

  // Relative imports are not external
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return false;
  }

  // Common path alias patterns are typically not external
  if (specifier.startsWith("@/") || specifier.startsWith("~/")) {
    return false;
  }

  // Consider specific patterns as external modules
  // Node built-in modules
  if (
    /^(fs|path|http|https|url|crypto|util|events|stream|buffer|os|querystring|zlib|child_process)$/.test(
      specifier,
    )
  ) {
    return true;
  }

  // Common npm package patterns
  if (
    /^(lodash|react|vue|angular|express|webpack|babel|typescript)/.test(
      specifier,
    )
  ) {
    return true;
  }

  // Scoped packages (@types/*, @babel/*, etc.)
  if (/^@[a-z0-9][a-z0-9-]*\//.test(specifier)) {
    return true;
  }

  // Simple npm package names (lowercase, possibly with hyphens)
  if (/^[a-z][a-z0-9-]*$/.test(specifier)) {
    return true;
  }

  // For complex patterns that might be path aliases, be conservative
  // and allow baseUrl resolution to try first
  return false;
}
