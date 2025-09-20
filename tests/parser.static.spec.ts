import { writeFile, mkdir, rm } from "fs/promises";
import { join, resolve } from "path";
import { parseImports, ImportResolver } from "../src/parser.js";
import { createPathResolver, loadTsConfig } from "../src/utils/tsconfig.js";

describe("Static Import Parser", () => {
  const TEST_TEMP_DIR = resolve("temp-parser-test");

  beforeEach(async () => {
    try {
      await rm(TEST_TEMP_DIR, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
    await mkdir(TEST_TEMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(TEST_TEMP_DIR, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("parseImports", () => {
    it("should parse default imports", async () => {
      const fileContent = `
        import lodash from "lodash";
        import React from "react";
        import utils from "./utils";
        
        export const test = () => {};
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        if (specifier === "./utils") {
          return join(TEST_TEMP_DIR, "utils.ts");
        }
        return null; // External modules
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([join(TEST_TEMP_DIR, "utils.ts")]);
    });

    it("should parse named imports", async () => {
      const fileContent = `
        import { add, subtract } from "./math";
        import { Component, useState } from "react";
        import { helper1, helper2 as h2 } from "./helpers";
        
        export const calc = () => add(1, 2);
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        switch (specifier) {
          case "./math":
            return join(TEST_TEMP_DIR, "math.ts");
          case "./helpers":
            return join(TEST_TEMP_DIR, "helpers.ts");
          default:
            return null; // External modules
        }
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([
        join(TEST_TEMP_DIR, "helpers.ts"),
        join(TEST_TEMP_DIR, "math.ts"),
      ]);
    });

    it("should parse namespace imports", async () => {
      const fileContent = `
        import * as utils from "./utils";
        import * as React from "react";
        import * as fs from "fs";
        
        export const test = () => utils.helper();
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        if (specifier === "./utils") {
          return join(TEST_TEMP_DIR, "utils.ts");
        }
        return null; // External modules
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([join(TEST_TEMP_DIR, "utils.ts")]);
    });

    it("should parse mixed import forms", async () => {
      const fileContent = `
        import React, { Component, useState } from "react";
        import defaultUtil, { namedUtil } from "./utils";
        import * as helpers from "./helpers";
        import config from "./config";
        
        export const App = () => <div />;
      `;

      const filePath = join(TEST_TEMP_DIR, "test.tsx");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        switch (specifier) {
          case "./utils":
            return join(TEST_TEMP_DIR, "utils.ts");
          case "./helpers":
            return join(TEST_TEMP_DIR, "helpers.ts");
          case "./config":
            return join(TEST_TEMP_DIR, "config.ts");
          default:
            return null; // External modules
        }
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([
        join(TEST_TEMP_DIR, "config.ts"),
        join(TEST_TEMP_DIR, "helpers.ts"),
        join(TEST_TEMP_DIR, "utils.ts"),
      ]);
    });

    it("should ignore type-only imports", async () => {
      const fileContent = `
        import type { User } from "./types";
        import type React from "react";
        import { add } from "./math";
        import type { Config } from "./config";
        
        export const calc = () => add(1, 2);
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        switch (specifier) {
          case "./types":
            return join(TEST_TEMP_DIR, "types.ts");
          case "./math":
            return join(TEST_TEMP_DIR, "math.ts");
          case "./config":
            return join(TEST_TEMP_DIR, "config.ts");
          default:
            return null;
        }
      };

      const result = await parseImports([filePath], mockResolver);

      // Should only include the non-type import
      expect(result[filePath]).toEqual([join(TEST_TEMP_DIR, "math.ts")]);
    });

    it("should ignore individual type-only named imports", async () => {
      const fileContent = `
        import { add, type MathConfig } from "./math";
        import { type User, getName } from "./user";
        
        export const calc = () => add(1, 2);
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        switch (specifier) {
          case "./math":
            return join(TEST_TEMP_DIR, "math.ts");
          case "./user":
            return join(TEST_TEMP_DIR, "user.ts");
          default:
            return null;
        }
      };

      const result = await parseImports([filePath], mockResolver);

      // Should include both files since they have non-type imports
      expect(result[filePath]).toEqual([
        join(TEST_TEMP_DIR, "math.ts"),
        join(TEST_TEMP_DIR, "user.ts"),
      ]);
    });

    it("should ignore side-effect imports", async () => {
      const fileContent = `
        import "reflect-metadata";
        import "./styles.css";
        import { add } from "./math";
        
        export const calc = () => add(1, 2);
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        if (specifier === "./math") {
          return join(TEST_TEMP_DIR, "math.ts");
        }
        return null; // Other imports are external or non-TS
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([join(TEST_TEMP_DIR, "math.ts")]);
    });

    it("should filter out non-TypeScript resolved paths", async () => {
      const fileContent = `
        import { add } from "./math";
        import styles from "./styles.css";
        import config from "./config.json";
        
        export const calc = () => add(1, 2);
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        switch (specifier) {
          case "./math":
            return join(TEST_TEMP_DIR, "math.ts");
          case "./styles.css":
            return join(TEST_TEMP_DIR, "styles.css"); // Non-TS file
          case "./config.json":
            return join(TEST_TEMP_DIR, "config.json"); // Non-TS file
          default:
            return null;
        }
      };

      const result = await parseImports([filePath], mockResolver);

      // Should only include TypeScript files
      expect(result[filePath]).toEqual([join(TEST_TEMP_DIR, "math.ts")]);
    });

    it("should handle multiple files", async () => {
      const file1Content = `
        import { helper } from "./utils";
        export const func1 = () => helper();
      `;

      const file2Content = `
        import { func1 } from "./file1";
        import { helper } from "./utils";
        export const func2 = () => func1();
      `;

      const file1Path = join(TEST_TEMP_DIR, "file1.ts");
      const file2Path = join(TEST_TEMP_DIR, "file2.ts");

      await writeFile(file1Path, file1Content);
      await writeFile(file2Path, file2Content);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        switch (specifier) {
          case "./utils":
            return join(TEST_TEMP_DIR, "utils.ts");
          case "./file1":
            return join(TEST_TEMP_DIR, "file1.ts");
          default:
            return null;
        }
      };

      const result = await parseImports([file1Path, file2Path], mockResolver);

      expect(result[file1Path]).toEqual([join(TEST_TEMP_DIR, "utils.ts")]);
      expect(result[file2Path]).toEqual([
        join(TEST_TEMP_DIR, "file1.ts"),
        join(TEST_TEMP_DIR, "utils.ts"),
      ]);
    });

    it("should return empty object for empty file list", async () => {
      const mockResolver: ImportResolver = () => null;
      const result = await parseImports([], mockResolver);
      expect(result).toEqual({});
    });

    it("should filter out non-TypeScript files from input", async () => {
      const jsFile = join(TEST_TEMP_DIR, "test.js");
      const cssFile = join(TEST_TEMP_DIR, "styles.css");
      const tsFile = join(TEST_TEMP_DIR, "test.ts");

      await writeFile(jsFile, "console.log('js');");
      await writeFile(cssFile, ".class { color: red; }");
      await writeFile(tsFile, "export const test = () => {};");

      const mockResolver: ImportResolver = () => null;
      const result = await parseImports(
        [jsFile, cssFile, tsFile],
        mockResolver,
      );

      // Should only process the TypeScript file
      expect(Object.keys(result)).toEqual([tsFile]);
    });

    it("should handle .tsx files", async () => {
      const fileContent = `
        import React from "react";
        import { Button } from "./components";
        
        export const App = () => <Button />;
      `;

      const filePath = join(TEST_TEMP_DIR, "App.tsx");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        if (specifier === "./components") {
          return join(TEST_TEMP_DIR, "components.tsx");
        }
        return null;
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([join(TEST_TEMP_DIR, "components.tsx")]);
    });

    it("should throw error for invalid resolver", async () => {
      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, "export const test = () => {};");

      await expect(
        parseImports([filePath], null as unknown as ImportResolver),
      ).rejects.toThrow("resolve function is required");

      await expect(
        parseImports([filePath], "not a function" as unknown as ImportResolver),
      ).rejects.toThrow("resolve function is required");
    });

    it("should handle empty import specifiers gracefully", async () => {
      const fileContent = `
        import { add } from "./math";
        // This would be malformed, but we handle it gracefully
        export const calc = () => add(1, 2);
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        if (specifier === "./math") {
          return join(TEST_TEMP_DIR, "math.ts");
        }
        return null;
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([join(TEST_TEMP_DIR, "math.ts")]);
    });

    it("should deduplicate imports and sort results", async () => {
      const fileContent = `
        import { add } from "./math";
        import { subtract } from "./math"; // Same module imported twice
        import { helper } from "./utils";
        import { config } from "./config";
        import { anotherHelper } from "./utils"; // Same module again
        
        export const calc = () => add(1, 2);
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        switch (specifier) {
          case "./math":
            return join(TEST_TEMP_DIR, "math.ts");
          case "./utils":
            return join(TEST_TEMP_DIR, "utils.ts");
          case "./config":
            return join(TEST_TEMP_DIR, "config.ts");
          default:
            return null;
        }
      };

      const result = await parseImports([filePath], mockResolver);

      // Should be deduplicated and sorted
      expect(result[filePath]).toEqual([
        join(TEST_TEMP_DIR, "config.ts"),
        join(TEST_TEMP_DIR, "math.ts"),
        join(TEST_TEMP_DIR, "utils.ts"),
      ]);
    });
  });

  describe("Integration with sample-src files", () => {
    it("should parse real sample files", async () => {
      const sampleDir = resolve("sample-src");
      const tsConfig = await loadTsConfig();
      const resolver = createPathResolver(sampleDir, tsConfig);

      // Get sample files
      const files = [
        join(sampleDir, "arrayUtils.ts"),
        join(sampleDir, "mathUtils.ts"),
        join(sampleDir, "statsUtils.ts"),
      ];

      const result = await parseImports(files, resolver);

      // Verify we get results for each file
      expect(Object.keys(result)).toHaveLength(3);

      // arrayUtils.ts should import mathUtils and stringUtils
      const arrayUtilsPath = join(sampleDir, "arrayUtils.ts");
      expect(result[arrayUtilsPath]).toContain(join(sampleDir, "mathUtils.ts"));
      expect(result[arrayUtilsPath]).toContain(
        join(sampleDir, "stringUtils.ts"),
      );
      expect(result[arrayUtilsPath]).toContain(
        join(sampleDir, "templateUtils.ts"),
      );

      // statsUtils.ts should import multiple files
      const statsUtilsPath = join(sampleDir, "statsUtils.ts");
      expect(result[statsUtilsPath]).toContain(join(sampleDir, "mathUtils.ts"));
      expect(result[statsUtilsPath]).toContain(
        join(sampleDir, "stringUtils.ts"),
      );
      expect(result[statsUtilsPath]).toContain(
        join(sampleDir, "templateUtils.ts"),
      );
      expect(result[statsUtilsPath]).toContain(
        join(sampleDir, "arrayUtils.ts"),
      );

      // All results should be sorted arrays
      Object.values(result).forEach((imports) => {
        expect(imports).toEqual([...imports].sort());
      });
    });
  });
});
