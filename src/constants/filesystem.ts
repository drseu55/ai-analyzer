/**
 * Filesystem-related constants for the dependency analysis tool
 */

/**
 * Default directories and patterns to ignore during file discovery
 * These are commonly ignored paths in TypeScript/JavaScript projects
 */
export const DEFAULT_IGNORES = [
  "node_modules",
  "jspm_packages",
  "dist",
  "build",
  "out",
  "coverage",
  ".git",
  ".svn",
  ".hg",
  ".vscode",
  ".idea",
  ".DS_Store",
  ".next",
  ".nuxt",
  ".cache",
  ".parcel-cache",
  ".nyc_output",
  "temp",
  "tmp",
] as const;

/**
 * Valid TypeScript file extensions
 * Includes both .ts and .tsx files
 */
export const TS_EXTENSIONS = [".ts", ".tsx"] as const;

/**
 * Type definitions for the constants
 */
export type TSExtension = (typeof TS_EXTENSIONS)[number];

/**
 * Helper function to check if a file extension is a TypeScript extension
 */
export function isTypeScriptExtension(
  extension: string,
): extension is TSExtension {
  return (TS_EXTENSIONS as readonly string[]).includes(extension);
}
