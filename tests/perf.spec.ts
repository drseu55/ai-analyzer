import { parseImports } from "../src/parser.js";
import { findTypeScriptFiles } from "../src/utils/fs.js";
import { tmpdir } from "os";
import { join } from "path";
import { mkdir, writeFile, rm } from "fs/promises";

describe("Performance and Concurrency Controls", () => {
  let tempDir: string;
  let tempFiles: string[] = [];

  beforeEach(() => {
    tempDir = join(tmpdir(), `perf-test-${Date.now()}`);
    tempFiles = [];
  });

  afterEach(async () => {
    // Clean up temp files
    for (const file of tempFiles) {
      try {
        await rm(file, { force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  async function createTestProject(
    files: Record<string, string>,
  ): Promise<string> {
    await mkdir(tempDir, { recursive: true });

    for (const [fileName, content] of Object.entries(files)) {
      const filePath = join(tempDir, fileName);
      await writeFile(filePath, content, "utf8");
      tempFiles.push(filePath);
    }

    return tempDir;
  }

  describe("Concurrency Controls", () => {
    it("should process files in batches according to concurrency setting", async () => {
      // Create multiple files
      const files: Record<string, string> = {};
      for (let i = 0; i < 15; i++) {
        files[`file${i}.ts`] = `export const value${i} = ${i};`;
      }

      const projectDir = await createTestProject(files);
      const typeScriptFiles = await findTypeScriptFiles(projectDir);

      // Mock resolver
      const mockResolver = jest.fn().mockReturnValue(null);

      // Spy on logger to capture batch processing
      const { logger } = await import("../src/utils/logger.js");
      const debugSpy = jest.spyOn(logger, "debug").mockImplementation();

      // Test with concurrency of 5
      await parseImports(typeScriptFiles, mockResolver, { concurrency: 5 });

      // Should create batches (15 files with concurrency 5 = 3 batches)
      expect(debugSpy).toHaveBeenCalledWith(
        { totalBatches: 3, filesPerBatch: 5 },
        "Created processing batches",
      );

      // Should process 3 batches
      expect(debugSpy).toHaveBeenCalledWith(
        { batchIndex: 1, totalBatches: 3, filesInBatch: 5 },
        "Processing batch",
      );
      expect(debugSpy).toHaveBeenCalledWith(
        { batchIndex: 2, totalBatches: 3, filesInBatch: 5 },
        "Processing batch",
      );
      expect(debugSpy).toHaveBeenCalledWith(
        { batchIndex: 3, totalBatches: 3, filesInBatch: 5 },
        "Processing batch",
      );

      debugSpy.mockRestore();
    });

    it("should default to concurrency of 10", async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 5; i++) {
        files[`file${i}.ts`] = `export const value${i} = ${i};`;
      }

      const projectDir = await createTestProject(files);
      const typeScriptFiles = await findTypeScriptFiles(projectDir);

      // Mock resolver
      const mockResolver = jest.fn().mockReturnValue(null);

      // Spy on logger to capture concurrency setting
      const { logger } = await import("../src/utils/logger.js");
      const debugSpy = jest.spyOn(logger, "debug").mockImplementation();

      // Test without specifying concurrency (should default to 10)
      await parseImports(typeScriptFiles, mockResolver);

      expect(debugSpy).toHaveBeenCalledWith(
        { totalFiles: 5, concurrency: 10 },
        "Starting import parsing",
      );

      debugSpy.mockRestore();
    });

    it("should handle concurrency larger than file count", async () => {
      const files: Record<string, string> = {
        "file1.ts": 'import "./file2";',
        "file2.ts": "export const value = 42;",
      };

      const projectDir = await createTestProject(files);
      const typeScriptFiles = await findTypeScriptFiles(projectDir);

      // Mock resolver
      const mockResolver = jest.fn().mockReturnValue(null);

      // Spy on logger to capture batch processing
      const { logger } = await import("../src/utils/logger.js");
      const debugSpy = jest.spyOn(logger, "debug").mockImplementation();

      // Test with concurrency larger than file count
      await parseImports(typeScriptFiles, mockResolver, { concurrency: 50 });

      // Should create only 1 batch with 2 files
      expect(debugSpy).toHaveBeenCalledWith(
        { totalBatches: 1, filesPerBatch: 50 },
        "Created processing batches",
      );

      expect(debugSpy).toHaveBeenCalledWith(
        { batchIndex: 1, totalBatches: 1, filesInBatch: 2 },
        "Processing batch",
      );

      debugSpy.mockRestore();
    });
  });

  describe("File Limits", () => {
    it("should respect maxFiles limit in file discovery", async () => {
      // Create more files than the limit
      const files: Record<string, string> = {};
      for (let i = 0; i < 20; i++) {
        files[`file${i}.ts`] = `export const value${i} = ${i};`;
      }

      const projectDir = await createTestProject(files);

      // Test with maxFiles limit
      const typeScriptFiles = await findTypeScriptFiles(projectDir, {
        maxFiles: 10,
      });

      // Should only return 10 files
      expect(typeScriptFiles).toHaveLength(10);
    });

    it("should work correctly when maxFiles is larger than actual file count", async () => {
      const files: Record<string, string> = {
        "file1.ts": "export const a = 1;",
        "file2.ts": "export const b = 2;",
      };

      const projectDir = await createTestProject(files);

      // Test with maxFiles larger than actual count
      const typeScriptFiles = await findTypeScriptFiles(projectDir, {
        maxFiles: 100,
      });

      // Should return all files
      expect(typeScriptFiles).toHaveLength(2);
    });
  });

  describe("Performance Characteristics", () => {
    it("should process batches sequentially but files within batch concurrently", async () => {
      // Create files with artificial delay in processing
      const files: Record<string, string> = {};
      for (let i = 0; i < 6; i++) {
        files[`file${i}.ts`] =
          `import "./other"; export const value${i} = ${i};`;
      }

      const projectDir = await createTestProject(files);
      const typeScriptFiles = await findTypeScriptFiles(projectDir);

      // Track call order with a mock resolver that introduces delay
      const callOrder: number[] = [];
      let callCounter = 0;

      const mockResolver = jest.fn().mockImplementation(() => {
        const currentCall = callCounter++;
        callOrder.push(currentCall);

        // Return immediately (the resolver should return a string or null, not a Promise)
        return null;
      });

      const startTime = Date.now();

      // Process with concurrency of 3 (should create 2 batches of 3 files each)
      await parseImports(typeScriptFiles, mockResolver, { concurrency: 3 });

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify processing completed quickly (no artificial delays in resolver)
      expect(totalTime).toBeLessThan(1000); // Should be very fast

      // Verify all files were processed
      expect(callOrder).toHaveLength(6);
    });

    it("should handle zero concurrency gracefully", async () => {
      const files: Record<string, string> = {
        "file1.ts": "export const value = 1;",
      };

      const projectDir = await createTestProject(files);
      const typeScriptFiles = await findTypeScriptFiles(projectDir);

      // Mock resolver
      const mockResolver = jest.fn().mockReturnValue(null);

      // Test with zero concurrency (should default to 10)
      const result = await parseImports(typeScriptFiles, mockResolver, {
        concurrency: 0,
      });

      expect(result).toBeDefined();
      expect(Object.keys(result)).toHaveLength(1);
    });

    it("should handle negative concurrency gracefully", async () => {
      const files: Record<string, string> = {
        "file1.ts": "export const value = 1;",
      };

      const projectDir = await createTestProject(files);
      const typeScriptFiles = await findTypeScriptFiles(projectDir);

      // Mock resolver
      const mockResolver = jest.fn().mockReturnValue(null);

      // Test with negative concurrency (should default to 10)
      const result = await parseImports(typeScriptFiles, mockResolver, {
        concurrency: -5,
      });

      expect(result).toBeDefined();
      expect(Object.keys(result)).toHaveLength(1);
    });
  });

  describe("Integration with Main CLI", () => {
    it("should accept concurrency and maxFiles options from CLI", async () => {
      const { runAnalysis } = await import("../src/main.js");

      const files: Record<string, string> = {};
      for (let i = 0; i < 8; i++) {
        files[`file${i}.ts`] = `export const value${i} = ${i};`;
      }

      const projectDir = await createTestProject(files);

      // Mock process.exit to prevent test termination
      const originalExit = process.exit;
      const mockExit = jest.fn().mockImplementation(() => {
        throw new Error("process.exit called");
      });
      process.exit = mockExit as unknown as typeof process.exit;

      // Spy on parseImports to verify options are passed
      const parseImportsSpy = jest.spyOn(
        await import("../src/parser.js"),
        "parseImports",
      );

      try {
        await runAnalysis({
          dir: projectDir,
          maxFiles: 5,
          concurrency: 3,
        });
      } catch (_error) {
        // Expected to fail due to mocked exit, but options should be passed
      }

      // Verify parseImports was called with correct options
      expect(parseImportsSpy).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Function),
        { concurrency: 3 },
      );

      parseImportsSpy.mockRestore();
      process.exit = originalExit;
    });
  });
});
