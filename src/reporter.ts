import { writeFile } from "fs/promises";
import { dirname } from "path";
import { mkdir } from "fs/promises";

/**
 * Reporter module for outputting analysis results in JSON format.
 * Provides minimal functions for console output and file writing with consistent formatting.
 */

/**
 * Pretty-prints JSON data to stdout with consistent formatting.
 * Uses 2-space indentation for readability and stable output.
 *
 * @param data - The data to print as JSON
 */
export function printJson(data: unknown): void {
  const jsonString = JSON.stringify(data, null, 2);
  console.log(jsonString);
}

/**
 * Writes JSON data to a file with pretty formatting.
 * Creates parent directories if they don't exist.
 * Appends newline at end for POSIX compliance.
 *
 * @param filePath - The file path to write to
 * @param data - The data to write as JSON
 * @throws Error if file writing fails or data cannot be serialized
 */
export async function writeJsonToFile(
  filePath: string,
  data: unknown,
): Promise<void> {
  try {
    // Ensure parent directory exists
    const parentDir = dirname(filePath);
    if (parentDir && parentDir !== ".") {
      await mkdir(parentDir, { recursive: true });
    }

    // Format JSON with consistent 2-space indentation
    const jsonString = JSON.stringify(data, null, 2);

    // Write to file with newline at end for POSIX compliance
    await writeFile(filePath, jsonString + "\n", "utf8");
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(
      `Failed to write JSON to file ${filePath}: ${errorMessage}`,
    );
  }
}
