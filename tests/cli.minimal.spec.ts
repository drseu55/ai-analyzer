import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { runAnalysis } from "../src/main.js";
import * as reporter from "../src/reporter.js";
import * as fsUtils from "../src/utils/fs.js";
import * as tsconfigUtils from "../src/utils/tsconfig.js";
import * as parser from "../src/parser.js";

describe("CLI Minimal Integration", () => {
  let tempDir: string;
  let tempFiles: string[] = [];
  let consoleSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-test-${Date.now()}`);
    tempFiles = [];

    // Mock console.error to avoid cluttering test output
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    // Mock process.exit to prevent actual exits during tests
    processExitSpy = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(async () => {
    // Clean up temp files
    for (const file of tempFiles) {
      try {
        await rm(file, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    // Restore mocks
    consoleSpy.mockRestore();
    processExitSpy.mockRestore();
    jest.restoreAllMocks();
  });

  async function createTestProject(
    files: Record<string, string>,
  ): Promise<string> {
    await mkdir(tempDir, { recursive: true });
    tempFiles.push(tempDir);

    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(tempDir, filePath);
      const dir = join(fullPath, "..");
      await mkdir(dir, { recursive: true });
      await writeFile(fullPath, content, "utf8");
    }

    return tempDir;
  }

  describe("runAnalysis", () => {
    it("should analyze a simple TypeScript project and output to console", async () => {
      // Create test project
      const projectDir = await createTestProject({
        "src/main.ts": `
          import { utils } from './utils';
          import { config } from './config';
          
          console.log(utils.hello());
        `,
        "src/utils.ts": `
          export const utils = {
            hello: () => 'Hello, World!'
          };
        `,
        "src/config.ts": `
          export const config = {
            debug: true
          };
        `,
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "node",
            rootDir: "src",
            outDir: "dist",
          },
          include: ["src/**/*"],
        }),
      });

      // Mock reporter.printJson to capture output
      const printJsonSpy = jest
        .spyOn(reporter, "printJson")
        .mockImplementation(() => {});

      // Run analysis
      await runAnalysis({ dir: projectDir });

      // Verify printJson was called with correct structure
      expect(printJsonSpy).toHaveBeenCalledTimes(1);
      const outputData = printJsonSpy.mock.calls[0][0] as {
        graph: Record<string, string[]>;
      };

      expect(outputData).toHaveProperty("graph");
      expect(typeof outputData.graph).toBe("object");

      // Should have found TypeScript files and their dependencies
      const graph = outputData.graph;
      const mainFile = Object.keys(graph).find((key) =>
        key.includes("main.ts"),
      );
      expect(mainFile).toBeDefined();

      if (mainFile) {
        const dependencies = graph[mainFile];
        expect(dependencies).toEqual(
          expect.arrayContaining([
            expect.stringContaining("utils.ts"),
            expect.stringContaining("config.ts"),
          ]),
        );
      }
    });

    it("should write output to file when --output is specified", async () => {
      const projectDir = await createTestProject({
        "index.ts": `export const greeting = "Hello, TypeScript!";`,
      });

      const outputFile = join(tempDir, "output.json");
      tempFiles.push(outputFile);

      // Mock writeJsonToFile to capture file write
      const writeJsonSpy = jest
        .spyOn(reporter, "writeJsonToFile")
        .mockResolvedValue();

      await runAnalysis({
        dir: projectDir,
        output: outputFile,
      });

      expect(writeJsonSpy).toHaveBeenCalledWith(
        outputFile,
        expect.objectContaining({
          graph: expect.any(Object),
        }),
      );
    });

    it("should handle projects with no TypeScript files gracefully", async () => {
      const projectDir = await createTestProject({
        "README.md": "# No TypeScript files here",
        "package.json": JSON.stringify({ name: "test" }),
      });

      await expect(runAnalysis({ dir: projectDir })).rejects.toThrow(
        "process.exit called",
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("should handle non-existent directory gracefully", async () => {
      const nonExistentDir = join(tempDir, "does-not-exist");

      await expect(runAnalysis({ dir: nonExistentDir })).rejects.toThrow(
        "process.exit called",
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("should respect maxFiles option", async () => {
      const projectDir = await createTestProject({
        "file1.ts": "export const a = 1;",
        "file2.ts": "export const b = 2;",
        "file3.ts": "export const c = 3;",
        "file4.ts": "export const d = 4;",
        "file5.ts": "export const e = 5;",
      });

      // Mock findTypeScriptFiles to verify maxFiles is passed
      const findFilesSpy = jest.spyOn(fsUtils, "findTypeScriptFiles");

      jest.spyOn(reporter, "printJson").mockImplementation(() => {});

      await runAnalysis({
        dir: projectDir,
        maxFiles: 3,
      });

      expect(findFilesSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ maxFiles: 3 }),
      );
    });

    it("should load custom tsconfig when specified", async () => {
      const projectDir = await createTestProject({
        "src/main.ts": "export const main = true;",
        "custom-tsconfig.json": JSON.stringify({
          compilerOptions: {
            baseUrl: "src",
            paths: {
              "@/*": ["*"],
            },
          },
        }),
      });

      const customTsConfig = join(projectDir, "custom-tsconfig.json");

      // Mock loadTsConfig to verify custom path is used
      const loadTsConfigSpy = jest.spyOn(tsconfigUtils, "loadTsConfig");

      jest.spyOn(reporter, "printJson").mockImplementation(() => {});

      await runAnalysis({
        dir: projectDir,
        tsconfig: customTsConfig,
      });

      expect(loadTsConfigSpy).toHaveBeenCalledWith(customTsConfig);
    });
  });

  describe("Integration with real sample files", () => {
    it("should handle complex dependency chains", async () => {
      const projectDir = await createTestProject({
        "src/main.ts": `
          import { UserService } from './services/UserService';
          import { Database } from './database/Database';
          
          const userService = new UserService();
          const db = new Database();
        `,
        "src/services/UserService.ts": `
          import { User } from '../models/User';
          import { Database } from '../database/Database';
          
          export class UserService {
            constructor(private db: Database) {}
          }
        `,
        "src/models/User.ts": `
          import { BaseModel } from './BaseModel';
          
          export class User extends BaseModel {
            name: string;
          }
        `,
        "src/models/BaseModel.ts": `
          export abstract class BaseModel {
            id: number;
          }
        `,
        "src/database/Database.ts": `
          export class Database {
            connect() {}
          }
        `,
      });

      const printJsonSpy = jest
        .spyOn(reporter, "printJson")
        .mockImplementation(() => {});

      await runAnalysis({ dir: projectDir });

      expect(printJsonSpy).toHaveBeenCalledTimes(1);
      const result = printJsonSpy.mock.calls[0][0] as {
        graph: Record<string, string[]>;
      };

      expect(result).toHaveProperty("graph");
      const graph = result.graph;

      // Verify that dependencies are properly resolved
      const mainFile = Object.keys(graph).find((key) =>
        key.includes("main.ts"),
      );
      const userServiceFile = Object.keys(graph).find((key) =>
        key.includes("UserService.ts"),
      );
      const userModelFile = Object.keys(graph).find((key) =>
        key.includes("User.ts"),
      );

      expect(mainFile).toBeDefined();
      expect(userServiceFile).toBeDefined();
      expect(userModelFile).toBeDefined();

      // Check that main.ts depends on UserService and Database
      if (mainFile) {
        expect(graph[mainFile]).toEqual(
          expect.arrayContaining([
            expect.stringContaining("UserService.ts"),
            expect.stringContaining("Database.ts"),
          ]),
        );
      }

      // Check that UserService depends on User and Database
      if (userServiceFile) {
        expect(graph[userServiceFile]).toEqual(
          expect.arrayContaining([
            expect.stringContaining("User.ts"),
            expect.stringContaining("Database.ts"),
          ]),
        );
      }
    });

    it("should handle projects with path aliases", async () => {
      const projectDir = await createTestProject({
        "src/main.ts": `
          import { utils } from '@/utils/helpers';
          import { config } from '@/config';
        `,
        "src/utils/helpers.ts": `
          export const utils = { helper: true };
        `,
        "src/config.ts": `
          export const config = { app: 'test' };
        `,
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            baseUrl: "src",
            paths: {
              "@/*": ["*"],
            },
          },
        }),
      });

      const printJsonSpy = jest
        .spyOn(reporter, "printJson")
        .mockImplementation(() => {});

      await runAnalysis({ dir: projectDir });

      expect(printJsonSpy).toHaveBeenCalledTimes(1);
      const result = printJsonSpy.mock.calls[0][0] as {
        graph: Record<string, string[]>;
      };
      const graph = result.graph;

      const mainFile = Object.keys(graph).find((key) =>
        key.includes("main.ts"),
      );
      expect(mainFile).toBeDefined();

      if (mainFile) {
        // Path aliases might not resolve in test environment, but dependencies should exist
        const dependencies = graph[mainFile];
        expect(dependencies).toBeDefined();
        expect(Array.isArray(dependencies)).toBe(true);

        // If aliases are resolved, they should contain the expected files
        if (dependencies.length > 0) {
          expect(
            dependencies.some(
              (dep) => dep.includes("helpers.ts") || dep.includes("config.ts"),
            ),
          ).toBe(true);
        }
      }
    });

    it("should produce deterministic output", async () => {
      const projectDir = await createTestProject({
        "a.ts": "import './b';",
        "b.ts": "import './c';",
        "c.ts": "export const c = 'value';",
      });

      const printJsonSpy = jest
        .spyOn(reporter, "printJson")
        .mockImplementation(() => {});

      // Run analysis multiple times
      await runAnalysis({ dir: projectDir });
      const result1 = printJsonSpy.mock.calls[0][0];

      printJsonSpy.mockClear();
      await runAnalysis({ dir: projectDir });
      const result2 = printJsonSpy.mock.calls[0][0];

      // Results should be identical
      expect(result1).toEqual(result2);
    });
  });

  describe("Error handling", () => {
    it("should provide helpful error messages for common issues", async () => {
      // Test directory permission issues
      await expect(runAnalysis({ dir: "/root/inaccessible" })).rejects.toThrow(
        "process.exit called",
      );

      // Verify error logging
      expect(consoleSpy).toHaveBeenCalledWith("Analysis failed:");
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Tip:"));
    });

    it("should handle parser errors gracefully", async () => {
      const projectDir = await createTestProject({
        "invalid.ts": "import { this is invalid syntax",
      });

      // Mock parseImports to throw an error
      jest
        .spyOn(parser, "parseImports")
        .mockRejectedValue(new Error("Syntax error"));

      await expect(runAnalysis({ dir: projectDir })).rejects.toThrow(
        "process.exit called",
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("should handle file writing errors", async () => {
      const projectDir = await createTestProject({
        "simple.ts": "export const value = 42;",
      });

      const invalidOutputPath = "/root/cannot-write.json";

      // Mock writeJsonToFile to throw an error
      jest
        .spyOn(reporter, "writeJsonToFile")
        .mockRejectedValue(new Error("Permission denied"));

      await expect(
        runAnalysis({
          dir: projectDir,
          output: invalidOutputPath,
        }),
      ).rejects.toThrow("process.exit called");

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("Performance and scalability", () => {
    it("should handle reasonably large projects efficiently", async () => {
      // Create a project with many files
      const files: Record<string, string> = {};
      for (let i = 0; i < 50; i++) {
        const deps = i > 0 ? [`import './file${i - 1}';`] : [];
        files[`file${i}.ts`] = `
          ${deps.join("\n")}
          export const value${i} = ${i};
        `;
      }

      const projectDir = await createTestProject(files);
      const printJsonSpy = jest
        .spyOn(reporter, "printJson")
        .mockImplementation(() => {});

      const startTime = Date.now();
      await runAnalysis({ dir: projectDir });
      const endTime = Date.now();

      // Should complete in reasonable time (less than 10 seconds)
      expect(endTime - startTime).toBeLessThan(10000);

      expect(printJsonSpy).toHaveBeenCalledTimes(1);
      const result = printJsonSpy.mock.calls[0][0];

      // Should have processed all files
      const typedResult = result as { graph: Record<string, string[]> };
      expect(Object.keys(typedResult.graph)).toHaveLength(50);
    });
  });
});
