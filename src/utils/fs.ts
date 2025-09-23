import { readdir, stat } from "fs/promises";
import { join, resolve, extname } from "path";
import {
  DEFAULT_IGNORES,
  isTypeScriptExtension,
} from "../constants/filesystem";

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
