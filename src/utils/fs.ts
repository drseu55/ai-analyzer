import { readdir, stat } from "fs/promises";
import { join, resolve, extname } from "path";
import {
  DEFAULT_IGNORES,
  isTypeScriptExtension,
} from "../constants/filesystem.js";

/**
 * Options for TypeScript file discovery
 */
export interface FindTypeScriptFilesOptions {
  /** Maximum number of files to return (for performance) */
  maxFiles?: number;
  /** Additional directories/files to ignore */
  ignore?: string[];
}

/**
 * Recursively finds all TypeScript files in a directory
 * @param rootDir - Root directory to search from
 * @param options - Optional configuration
 * @returns Promise resolving to array of absolute file paths
 */
export async function findTypeScriptFiles(
  rootDir: string,
  options: FindTypeScriptFilesOptions = {},
): Promise<string[]> {
  const { maxFiles, ignore = [] } = options;
  const ignorePaths = new Set([...DEFAULT_IGNORES, ...ignore]);
  const results: string[] = [];

  // Normalize to absolute path
  const absoluteRootDir = resolve(rootDir);

  /**
   * Recursively scan directory for TypeScript files
   */
  async function scanDirectory(currentDir: string): Promise<void> {
    if (maxFiles && results.length >= maxFiles) {
      return;
    }

    try {
      const entries = await readdir(currentDir);

      for (const entry of entries) {
        if (maxFiles && results.length >= maxFiles) {
          break;
        }

        if (ignorePaths.has(entry)) {
          continue;
        }

        const fullPath = join(currentDir, entry);

        try {
          const stats = await stat(fullPath);

          if (stats.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (stats.isFile()) {
            const extension = extname(entry);
            if (isTypeScriptExtension(extension)) {
              results.push(fullPath);
            }
          }
        } catch (error) {
          console.warn(`Warning: Could not access ${fullPath}:`, error);
          continue;
        }
      }
    } catch (error) {
      throw new Error(`Failed to read directory ${currentDir}: ${error}`);
    }
  }

  await scanDirectory(absoluteRootDir);

  return results.sort();
}

/**
 * Check if a path should be ignored based on ignore patterns
 * @param path - Path to check
 * @param ignorePatterns - Array of ignore patterns
 * @returns true if path should be ignored
 */
export function shouldIgnorePath(
  path: string,
  ignorePatterns: string[],
): boolean {
  const allIgnores = [...DEFAULT_IGNORES, ...ignorePatterns];
  const pathParts = path.split("/");

  return allIgnores.some((pattern) =>
    pathParts.some((part) => part === pattern),
  );
}

/**
 * Convert absolute paths to relative paths from a base directory
 * @param absolutePaths - Array of absolute file paths
 * @param baseDir - Base directory to make paths relative to
 * @returns Array of relative paths
 */
export function toRelativePaths(
  absolutePaths: string[],
  baseDir: string,
): string[] {
  const absoluteBaseDir = resolve(baseDir);

  return absolutePaths.map((path) => {
    const absolutePath = resolve(path);
    if (absolutePath.startsWith(absoluteBaseDir)) {
      return absolutePath.slice(absoluteBaseDir.length + 1);
    }
    return absolutePath;
  });
}

/**
 * Validate that a directory exists and is accessible
 * @param dirPath - Directory path to validate
 * @returns Promise resolving to true if valid
 * @throws Error if directory doesn't exist or isn't accessible
 */
export async function validateDirectory(dirPath: string): Promise<boolean> {
  try {
    const absolutePath = resolve(dirPath);
    const stats = await stat(absolutePath);

    if (!stats.isDirectory()) {
      throw new Error(`Path ${dirPath} is not a directory`);
    }

    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Directory ${dirPath} does not exist`);
    }
    throw new Error(`Cannot access directory ${dirPath}: ${error}`);
  }
}
