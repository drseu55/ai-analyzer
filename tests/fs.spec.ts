import { join, resolve } from "path";
import { mkdir, writeFile, rm } from "fs/promises";
import {
  findTypeScriptFiles,
  FindTypeScriptFilesOptions,
} from "../src/utils/fs";

describe("Filesystem Utilities", () => {
  const SAMPLE_SRC_PATH = resolve("sample-src");
  const TEST_TEMP_DIR = resolve("temp-test-dir");

  afterEach(async () => {
    try {
      await rm(TEST_TEMP_DIR, { recursive: true });
    } catch {}
  });

  describe("findTypeScriptFiles", () => {
    it("should find all TypeScript files in sample-src directory", async () => {
      const files = await findTypeScriptFiles(SAMPLE_SRC_PATH);

      expect(files.length).toBe(5);
      expect(files.every((file) => file.endsWith(".ts"))).toBe(true);
      expect(files.every((file) => file.includes("sample-src"))).toBe(true);

      // Check that all expected files are found
      const fileNames = files.map((file) => file.split("/").pop());
      expect(fileNames).toContain("arrayUtils.ts");
      expect(fileNames).toContain("mathUtils.ts");
      expect(fileNames).toContain("statsUtils.ts");
      expect(fileNames).toContain("stringUtils.ts");
      expect(fileNames).toContain("templateUtils.ts");
    });

    it("should return absolute paths", async () => {
      const files = await findTypeScriptFiles(SAMPLE_SRC_PATH);

      files.forEach((file) => {
        expect(file).toMatch(/^\/.*\/sample-src\/.+\.ts$/);
      });
    });

    it("should return sorted results for consistent ordering", async () => {
      const files1 = await findTypeScriptFiles(SAMPLE_SRC_PATH);
      const files2 = await findTypeScriptFiles(SAMPLE_SRC_PATH);

      expect(files1).toEqual(files2);

      // Verify sorting
      const sorted = [...files1].sort();
      expect(files1).toEqual(sorted);
    });

    it("should respect maxFiles limit", async () => {
      const options: FindTypeScriptFilesOptions = { maxFiles: 3 };
      const files = await findTypeScriptFiles(SAMPLE_SRC_PATH, options);

      expect(files.length).toBeLessThanOrEqual(3);
      expect(files.length).toBeGreaterThan(0);
    });

    it("should ignore default directories", async () => {
      // Create a temporary directory structure with ignored directories
      await mkdir(TEST_TEMP_DIR, { recursive: true });
      await mkdir(join(TEST_TEMP_DIR, "node_modules"), { recursive: true });
      await mkdir(join(TEST_TEMP_DIR, "dist"), { recursive: true });
      await mkdir(join(TEST_TEMP_DIR, "coverage"), { recursive: true });
      await mkdir(join(TEST_TEMP_DIR, ".git"), { recursive: true });

      // Add TypeScript files in ignored directories
      await writeFile(join(TEST_TEMP_DIR, "main.ts"), "export const main = 1;");
      await writeFile(
        join(TEST_TEMP_DIR, "node_modules", "ignored.ts"),
        "// ignored",
      );
      await writeFile(join(TEST_TEMP_DIR, "dist", "compiled.ts"), "// ignored");
      await writeFile(
        join(TEST_TEMP_DIR, "coverage", "report.ts"),
        "// ignored",
      );
      await writeFile(join(TEST_TEMP_DIR, ".git", "config.ts"), "// ignored");

      const files = await findTypeScriptFiles(TEST_TEMP_DIR);

      expect(files.length).toBe(1);
      expect(files[0]).toContain("main.ts");
      expect(files.some((f) => f.includes("node_modules"))).toBe(false);
      expect(files.some((f) => f.includes("dist"))).toBe(false);
      expect(files.some((f) => f.includes("coverage"))).toBe(false);
      expect(files.some((f) => f.includes(".git"))).toBe(false);
    });

    it("should respect custom ignore patterns", async () => {
      // Create temporary directory with custom structure
      await mkdir(TEST_TEMP_DIR, { recursive: true });
      await mkdir(join(TEST_TEMP_DIR, "src"), { recursive: true });
      await mkdir(join(TEST_TEMP_DIR, "custom-ignore"), { recursive: true });

      await writeFile(
        join(TEST_TEMP_DIR, "src", "main.ts"),
        "export const main = 1;",
      );
      await writeFile(
        join(TEST_TEMP_DIR, "custom-ignore", "ignored.ts"),
        "// ignored",
      );

      const options: FindTypeScriptFilesOptions = { ignore: ["custom-ignore"] };
      const files = await findTypeScriptFiles(TEST_TEMP_DIR, options);

      expect(files.length).toBe(1);
      expect(files[0]).toContain("main.ts");
      expect(files.some((f) => f.includes("custom-ignore"))).toBe(false);
    });

    it("should handle both .ts and .tsx files", async () => {
      // Create temporary directory with both file types
      await mkdir(TEST_TEMP_DIR, { recursive: true });
      await writeFile(
        join(TEST_TEMP_DIR, "component.tsx"),
        "export const Component = () => <div />;",
      );
      await writeFile(
        join(TEST_TEMP_DIR, "utils.ts"),
        "export const utils = {};",
      );
      await writeFile(join(TEST_TEMP_DIR, "styles.css"), "body { margin: 0; }"); // Should be ignored
      await writeFile(join(TEST_TEMP_DIR, "data.json"), "{}"); // Should be ignored

      const files = await findTypeScriptFiles(TEST_TEMP_DIR);

      expect(files.length).toBe(2);
      expect(files.some((f) => f.endsWith(".tsx"))).toBe(true);
      expect(files.some((f) => f.endsWith(".ts"))).toBe(true);
      expect(files.some((f) => f.endsWith(".css"))).toBe(false);
      expect(files.some((f) => f.endsWith(".json"))).toBe(false);
    });

    it("should handle nested directory structures", async () => {
      // Create nested directory structure
      await mkdir(join(TEST_TEMP_DIR, "src", "components"), {
        recursive: true,
      });
      await mkdir(join(TEST_TEMP_DIR, "src", "utils"), { recursive: true });

      await writeFile(join(TEST_TEMP_DIR, "src", "main.ts"), "// main");
      await writeFile(
        join(TEST_TEMP_DIR, "src", "components", "Button.tsx"),
        "// button",
      );
      await writeFile(
        join(TEST_TEMP_DIR, "src", "utils", "helpers.ts"),
        "// helpers",
      );

      const files = await findTypeScriptFiles(TEST_TEMP_DIR);

      expect(files.length).toBe(3);
      expect(files.some((f) => f.includes("main.ts"))).toBe(true);
      expect(files.some((f) => f.includes("Button.tsx"))).toBe(true);
      expect(files.some((f) => f.includes("helpers.ts"))).toBe(true);
    });

    it("should handle non-existent directory gracefully", async () => {
      await expect(findTypeScriptFiles("/non/existent/path")).rejects.toThrow();
    });

    it("should handle empty directory", async () => {
      await mkdir(TEST_TEMP_DIR, { recursive: true });

      const files = await findTypeScriptFiles(TEST_TEMP_DIR);

      expect(files).toEqual([]);
    });
  });

  describe("Integration with sample-src", () => {
    it("should discover all sample TypeScript files with correct structure", async () => {
      const files = await findTypeScriptFiles(SAMPLE_SRC_PATH);

      // Verify we found the expected number of files
      expect(files).toHaveLength(5);

      // Verify all files are TypeScript files
      files.forEach((file) => {
        expect(file).toMatch(/\.tsx?$/);
      });

      // Verify paths are absolute
      files.forEach((file) => {
        expect(file).toMatch(/^\/.*sample-src.*\.ts$/);
      });

      // Convert to relative paths for easier testing
      const relativeFiles = files.map((file) => file.replace(resolve("."), ""));

      const expectedFiles = [
        "/sample-src/arrayUtils.ts",
        "/sample-src/mathUtils.ts",
        "/sample-src/statsUtils.ts",
        "/sample-src/stringUtils.ts",
        "/sample-src/templateUtils.ts",
      ];

      expectedFiles.forEach((expectedFile) => {
        expect(relativeFiles).toContain(expectedFile);
      });
    });

    it("should work with relative path to sample-src", async () => {
      const files = await findTypeScriptFiles("sample-src");

      expect(files).toHaveLength(5);
      files.forEach((file) => {
        expect(file).toMatch(/^\/.*sample-src.*\.ts$/);
      });
    });
  });
});
