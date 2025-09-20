import { readFile, rm, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { printJson, writeJsonToFile } from "../src/reporter.js";

describe("Reporter", () => {
  // Mock console.log for stdout testing
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe("printJson", () => {
    describe("Basic formatting", () => {
      it("should print simple object with pretty formatting", () => {
        const data = { name: "test", value: 42 };
        printJson(data);

        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          JSON.stringify(data, null, 2),
        );
      });

      it("should print array with pretty formatting", () => {
        const data = ["item1", "item2", "item3"];
        printJson(data);

        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          JSON.stringify(data, null, 2),
        );
      });

      it("should print nested object with proper 2-space indentation", () => {
        const data = {
          level1: {
            level2: {
              level3: "deep value",
            },
          },
          array: [1, 2, 3],
        };
        printJson(data);

        const expectedOutput = JSON.stringify(data, null, 2);
        expect(consoleLogSpy).toHaveBeenCalledWith(expectedOutput);

        // Verify it contains 2-space indentation
        expect(expectedOutput).toContain("  ");
        // Level 2 should have 4-space indentation (2 * 2 spaces)
        expect(expectedOutput).toContain("    ");

        // Verify specific indentation structure
        expect(expectedOutput).toContain('{\n  "level1"'); // Level 1: 2 spaces
        expect(expectedOutput).toContain('{\n    "level2"'); // Level 2: 4 spaces
      });
    });

    describe("Data type handling", () => {
      it("should handle null and undefined values correctly", () => {
        const data = { nullValue: null, undefinedValue: undefined };
        printJson(data);

        // JSON.stringify removes undefined properties but keeps null
        const expected = JSON.stringify({ nullValue: null }, null, 2);
        expect(consoleLogSpy).toHaveBeenCalledWith(expected);
      });

      it("should handle empty objects and arrays", () => {
        printJson({});
        printJson([]);

        expect(consoleLogSpy).toHaveBeenNthCalledWith(1, "{}");
        expect(consoleLogSpy).toHaveBeenNthCalledWith(2, "[]");
      });

      it("should handle primitive values", () => {
        printJson("string");
        printJson(42);
        printJson(true);
        printJson(false);
        printJson(null);

        expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '"string"');
        expect(consoleLogSpy).toHaveBeenNthCalledWith(2, "42");
        expect(consoleLogSpy).toHaveBeenNthCalledWith(3, "true");
        expect(consoleLogSpy).toHaveBeenNthCalledWith(4, "false");
        expect(consoleLogSpy).toHaveBeenNthCalledWith(5, "null");
      });

      it("should handle numbers including zero, negative, and float", () => {
        printJson(0);
        printJson(-42);
        printJson(3.14159);
        printJson(Number.MAX_SAFE_INTEGER);

        expect(consoleLogSpy).toHaveBeenNthCalledWith(1, "0");
        expect(consoleLogSpy).toHaveBeenNthCalledWith(2, "-42");
        expect(consoleLogSpy).toHaveBeenNthCalledWith(3, "3.14159");
        expect(consoleLogSpy).toHaveBeenNthCalledWith(4, "9007199254740991");
      });

      it("should handle strings with special characters", () => {
        const data = {
          quotes: 'String with "quotes"',
          newlines: "String\nwith\nnewlines",
          unicode: "String with unicode: 🎯 ñ",
          empty: "",
        };
        printJson(data);

        const expectedOutput = JSON.stringify(data, null, 2);
        expect(consoleLogSpy).toHaveBeenCalledWith(expectedOutput);

        // Verify special characters are properly escaped
        expect(expectedOutput).toContain('\\"quotes\\"');
        expect(expectedOutput).toContain("\\n");
      });
    });

    describe("Complex data structures", () => {
      it("should handle deeply nested objects", () => {
        const data = {
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: "very deep",
                },
              },
            },
          },
        };
        printJson(data);

        const expectedOutput = JSON.stringify(data, null, 2);
        expect(consoleLogSpy).toHaveBeenCalledWith(expectedOutput);

        // Verify deep nesting maintains proper indentation
        expect(expectedOutput).toContain('          "level5"'); // 10 spaces for level 5
      });

      it("should handle mixed arrays and objects", () => {
        const data = {
          users: [
            { id: 1, name: "Alice", roles: ["admin", "user"] },
            { id: 2, name: "Bob", roles: ["user"] },
          ],
          settings: {
            theme: "dark",
            notifications: {
              email: true,
              push: false,
            },
          },
          metadata: null,
        };
        printJson(data);

        const expectedOutput = JSON.stringify(data, null, 2);
        expect(consoleLogSpy).toHaveBeenCalledWith(expectedOutput);

        // Verify structure is maintained
        expect(expectedOutput).toContain('"users": [');
        expect(expectedOutput).toContain('"settings": {');
      });

      it("should handle large objects with many properties", () => {
        const data: Record<string, number> = {};
        for (let i = 0; i < 50; i++) {
          data[`property${i}`] = i;
        }

        printJson(data);

        const expectedOutput = JSON.stringify(data, null, 2);
        expect(consoleLogSpy).toHaveBeenCalledWith(expectedOutput);
        expect(expectedOutput).toContain('"property0": 0');
        expect(expectedOutput).toContain('"property49": 49');
      });
    });

    describe("Error handling", () => {
      it("should handle circular references by throwing", () => {
        const circular: Record<string, unknown> = { prop: "value" };
        circular.self = circular;

        // JSON.stringify throws for circular references
        expect(() => printJson(circular)).toThrow();
      });

      it("should handle functions by omitting them", () => {
        const dataWithFunction = {
          name: "test",
          func: () => "hello",
          value: 42,
        };

        printJson(dataWithFunction);

        // Functions are omitted in JSON.stringify
        const expected = JSON.stringify({ name: "test", value: 42 }, null, 2);
        expect(consoleLogSpy).toHaveBeenCalledWith(expected);
      });

      it("should handle symbols by omitting them", () => {
        const dataWithSymbol = {
          name: "test",
          sym: Symbol("test"),
          value: 42,
        };

        printJson(dataWithSymbol);

        // Symbols are omitted in JSON.stringify
        const expected = JSON.stringify({ name: "test", value: 42 }, null, 2);
        expect(consoleLogSpy).toHaveBeenCalledWith(expected);
      });
    });

    describe("Formatting consistency", () => {
      it("should produce consistent output for same input", () => {
        const data = { a: 1, b: [2, 3], c: { d: 4 } };

        printJson(data);
        printJson(data);
        printJson(data);

        // All calls should produce identical output
        const expectedOutput = JSON.stringify(data, null, 2);
        expect(consoleLogSpy).toHaveBeenCalledTimes(3);
        expect(consoleLogSpy).toHaveBeenNthCalledWith(1, expectedOutput);
        expect(consoleLogSpy).toHaveBeenNthCalledWith(2, expectedOutput);
        expect(consoleLogSpy).toHaveBeenNthCalledWith(3, expectedOutput);
      });

      it("should use exactly 2 spaces for indentation (not tabs or other)", () => {
        const data = { level1: { level2: "value" } };
        printJson(data);

        const output = consoleLogSpy.mock.calls[0][0] as string;
        const lines = output.split("\n");

        // Check that indentation is exactly 2 spaces
        expect(lines[1]).toMatch(/^  "level1": \{$/); // 2 spaces
        expect(lines[2]).toMatch(/^    "level2": "value"$/); // 4 spaces

        // Should not contain tabs
        expect(output).not.toContain("\t");
      });
    });
  });

  describe("writeJsonToFile", () => {
    const tempDir = tmpdir();
    let tempFiles: string[] = [];

    afterEach(async () => {
      // Clean up temporary files
      for (const file of tempFiles) {
        try {
          await rm(file, { force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
      tempFiles = [];
    });

    describe("Basic file operations", () => {
      it("should write JSON to file with pretty formatting", async () => {
        const data = { test: "data", number: 123 };
        const filePath = join(tempDir, `test-${Date.now()}.json`);
        tempFiles.push(filePath);

        await writeJsonToFile(filePath, data);

        const fileContent = await readFile(filePath, "utf8");
        const expectedContent = JSON.stringify(data, null, 2) + "\n";

        expect(fileContent).toBe(expectedContent);
      });

      it("should create parent directories if they don't exist", async () => {
        const data = { nested: "directory test" };
        const filePath = join(
          tempDir,
          `nested-${Date.now()}`,
          "subdir",
          "deep",
          "test.json",
        );
        tempFiles.push(filePath);

        await writeJsonToFile(filePath, data);

        // Verify file was created
        const stats = await stat(filePath);
        expect(stats.isFile()).toBe(true);

        // Verify content
        const fileContent = await readFile(filePath, "utf8");
        const expectedContent = JSON.stringify(data, null, 2) + "\n";
        expect(fileContent).toBe(expectedContent);
      });

      it("should overwrite existing files", async () => {
        const data1 = { version: 1 };
        const data2 = { version: 2 };
        const filePath = join(tempDir, `overwrite-${Date.now()}.json`);
        tempFiles.push(filePath);

        await writeJsonToFile(filePath, data1);
        await writeJsonToFile(filePath, data2);

        const fileContent = await readFile(filePath, "utf8");
        const parsedContent = JSON.parse(fileContent);

        expect(parsedContent).toEqual(data2);
      });
    });

    describe("Data handling", () => {
      it("should handle complex nested objects", async () => {
        const data = {
          level1: {
            level2: {
              array: [1, 2, { nested: true }],
              date: "2023-01-01",
            },
          },
          topLevel: "value",
          numbers: [0, -1, 3.14],
          flags: { enabled: true, debug: false },
        };
        const filePath = join(tempDir, `complex-${Date.now()}.json`);
        tempFiles.push(filePath);

        await writeJsonToFile(filePath, data);

        const fileContent = await readFile(filePath, "utf8");
        const parsedContent = JSON.parse(fileContent);

        expect(parsedContent).toEqual(data);

        // Verify formatting
        expect(fileContent).toContain("  "); // Has indentation
        expect(fileContent.endsWith("\n")).toBe(true); // POSIX compliance
      });

      it("should handle arrays", async () => {
        const data = [
          { id: 1, name: "first" },
          { id: 2, name: "second" },
          "string item",
          42,
          null,
          { nested: { deep: "value" } },
        ];
        const filePath = join(tempDir, `array-${Date.now()}.json`);
        tempFiles.push(filePath);

        await writeJsonToFile(filePath, data);

        const fileContent = await readFile(filePath, "utf8");
        const parsedContent = JSON.parse(fileContent);

        expect(parsedContent).toEqual(data);
      });

      it("should handle edge case data types", async () => {
        const data = {
          nullValue: null,
          zeroNumber: 0,
          emptyString: "",
          emptyArray: [],
          emptyObject: {},
          booleanTrue: true,
          booleanFalse: false,
          largeNumber: Number.MAX_SAFE_INTEGER,
          negativeNumber: -999,
        };
        const filePath = join(tempDir, `edge-cases-${Date.now()}.json`);
        tempFiles.push(filePath);

        await writeJsonToFile(filePath, data);

        const fileContent = await readFile(filePath, "utf8");
        const parsedContent = JSON.parse(fileContent);

        expect(parsedContent).toEqual(data);
      });
    });

    describe("File format compliance", () => {
      it("should append newline for POSIX compliance", async () => {
        const data = { simple: "test" };
        const filePath = join(tempDir, `newline-${Date.now()}.json`);
        tempFiles.push(filePath);

        await writeJsonToFile(filePath, data);

        const fileContent = await readFile(filePath, "utf8");
        expect(fileContent.endsWith("\n")).toBe(true);

        // Should have exactly one newline at the end
        expect(fileContent.endsWith("\n\n")).toBe(false);
      });

      it("should use UTF-8 encoding", async () => {
        const data = {
          unicode: "Unicode test: 🎯 ñ é ü α β γ",
          chinese: "中文测试",
          emoji: "🚀🎉💯",
        };
        const filePath = join(tempDir, `unicode-${Date.now()}.json`);
        tempFiles.push(filePath);

        await writeJsonToFile(filePath, data);

        const fileContent = await readFile(filePath, "utf8");
        const parsedContent = JSON.parse(fileContent);

        expect(parsedContent).toEqual(data);
        expect(parsedContent.unicode).toBe("Unicode test: 🎯 ñ é ü α β γ");
      });

      it("should produce consistent formatting (2-space indentation)", async () => {
        const data = {
          level1: {
            level2: {
              level3: "deep",
            },
          },
        };
        const filePath = join(tempDir, `formatting-${Date.now()}.json`);
        tempFiles.push(filePath);

        await writeJsonToFile(filePath, data);

        const fileContent = await readFile(filePath, "utf8");
        const lines = fileContent.split("\n");

        // Verify exact indentation
        expect(lines[0]).toBe("{");
        expect(lines[1]).toBe('  "level1": {');
        expect(lines[2]).toBe('    "level2": {');
        expect(lines[3]).toBe('      "level3": "deep"');
        expect(lines[4]).toBe("    }");
        expect(lines[5]).toBe("  }");
        expect(lines[6]).toBe("}");
      });
    });

    describe("Error handling", () => {
      it("should throw error for invalid file paths", async () => {
        const data = { test: "data" };
        const invalidPath = "/root/cannot-write.json"; // Assuming no write permission

        await expect(writeJsonToFile(invalidPath, data)).rejects.toThrow(
          /Failed to write JSON to file.*cannot-write\.json/,
        );
      });

      it("should throw error for circular references", async () => {
        const circular: Record<string, unknown> = { prop: "value" };
        circular.self = circular;
        const filePath = join(tempDir, `circular-${Date.now()}.json`);
        tempFiles.push(filePath);

        await expect(writeJsonToFile(filePath, circular)).rejects.toThrow();
      });

      it("should include file path in error messages", async () => {
        const data = { test: "data" };
        const invalidPath = "/root/definitely/does/not/exist/test.json";

        try {
          await writeJsonToFile(invalidPath, data);
          expect(true).toBe(false); // Should have thrown an error
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain(invalidPath);
          expect((error as Error).message).toContain(
            "Failed to write JSON to file",
          );
        }
      });

      it("should handle very deep directory creation", async () => {
        const data = { deep: "test" };
        const deepPath = join(
          tempDir,
          `deep-${Date.now()}`,
          "a",
          "b",
          "c",
          "d",
          "e",
          "f",
          "g",
          "h",
          "i",
          "j",
          "test.json",
        );
        tempFiles.push(deepPath);

        await writeJsonToFile(deepPath, data);

        const fileContent = await readFile(deepPath, "utf8");
        const parsedContent = JSON.parse(fileContent);
        expect(parsedContent).toEqual(data);
      });
    });

    describe("Integration scenarios", () => {
      it("should handle real-world dependency analysis data", async () => {
        const analysisData = {
          graph: {
            "/src/main.ts": ["/src/app.ts", "/src/config.ts"],
            "/src/app.ts": ["/src/utils.ts"],
            "/src/utils.ts": [],
            "/src/config.ts": [],
          },
          metrics: {
            nodeCount: 4,
            edgeCount: 3,
            fanIn: {
              "/src/main.ts": 0,
              "/src/app.ts": 1,
              "/src/utils.ts": 1,
              "/src/config.ts": 1,
            },
            fanOut: {
              "/src/main.ts": 2,
              "/src/app.ts": 1,
              "/src/utils.ts": 0,
              "/src/config.ts": 0,
            },
          },
          insights: {
            circularDependencies: [],
            tightCoupling: [],
            recommendations: [
              "Consider splitting main.ts as it has high fan-out",
            ],
          },
        };
        const filePath = join(tempDir, `analysis-${Date.now()}.json`);
        tempFiles.push(filePath);

        await writeJsonToFile(filePath, analysisData);

        const fileContent = await readFile(filePath, "utf8");
        const parsedContent = JSON.parse(fileContent);

        expect(parsedContent).toEqual(analysisData);

        // Verify it's properly formatted
        expect(fileContent).toContain('"graph": {');
        expect(fileContent).toContain('"insights": {');
        expect(fileContent.endsWith("\n")).toBe(true);
      });

      it("should handle large datasets efficiently", async () => {
        // Create a large but realistic dataset
        const largeData: Record<string, string[]> = {};
        for (let i = 0; i < 1000; i++) {
          const deps: string[] = [];
          for (let j = 0; j < 5; j++) {
            deps.push(`/src/dep${(i + j) % 1000}.ts`);
          }
          largeData[`/src/file${i}.ts`] = deps;
        }

        const data = {
          graph: largeData,
          timestamp: new Date().toISOString(),
        };
        const filePath = join(tempDir, `large-${Date.now()}.json`);
        tempFiles.push(filePath);

        const startTime = Date.now();
        await writeJsonToFile(filePath, data);
        const endTime = Date.now();

        // Should complete reasonably quickly (less than 5 seconds)
        expect(endTime - startTime).toBeLessThan(5000);

        // Verify file was created and is readable
        const stats = await stat(filePath);
        expect(stats.size).toBeGreaterThan(0);

        // Spot check the content
        const fileContent = await readFile(filePath, "utf8");
        expect(fileContent).toContain('"/src/file0.ts"');
        expect(fileContent).toContain('"/src/file999.ts"');
      });
    });
  });
});
