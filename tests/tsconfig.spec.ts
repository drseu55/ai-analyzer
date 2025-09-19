import { writeFile, mkdir, rm } from "fs/promises";
import { join, resolve } from "path";
import {
  loadTsConfig,
  createPathResolver,
  makeRelativePath,
  isExternalModule,
  TsConfigPaths,
  PathResolver,
} from "../src/utils/tsconfig.js";

describe("TypeScript Configuration Utilities", () => {
  const TEST_TEMP_DIR = resolve("temp-tsconfig-test");
  let originalWarn: typeof console.warn;

  // Clean up temporary test directories and mock console
  beforeEach(async () => {
    originalWarn = console.warn;
    console.warn = jest.fn(); // Mock console.warn to avoid cluttering test output

    try {
      await rm(TEST_TEMP_DIR, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
    await mkdir(TEST_TEMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    console.warn = originalWarn; // Restore original console.warn

    try {
      await rm(TEST_TEMP_DIR, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("loadTsConfig", () => {
    it("should load a valid tsconfig.json file", async () => {
      const tsconfigContent = {
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@app/*": ["src/*"],
            "@utils/*": ["src/utils/*"],
          },
        },
      };

      const tsconfigPath = join(TEST_TEMP_DIR, "tsconfig.json");
      await writeFile(tsconfigPath, JSON.stringify(tsconfigContent, null, 2));

      const result = await loadTsConfig(tsconfigPath);

      expect(result.baseUrl).toBe(".");
      expect(result.paths).toEqual({
        "@app/*": ["src/*"],
        "@utils/*": ["src/utils/*"],
      });
    });

    it("should handle tsconfig.json with comments", async () => {
      const tsconfigContent = `{
        // TypeScript configuration
        "compilerOptions": {
          "baseUrl": ".", // Base URL for resolution
          "paths": {
            "@app/*": ["src/*"], // App alias
            /* Utils alias */
            "@utils/*": ["src/utils/*"]
          }
        }
      }`;

      const tsconfigPath = join(TEST_TEMP_DIR, "tsconfig.json");
      await writeFile(tsconfigPath, tsconfigContent);

      const result = await loadTsConfig(tsconfigPath);

      expect(result.baseUrl).toBe(".");
      expect(result.paths).toEqual({
        "@app/*": ["src/*"],
        "@utils/*": ["src/utils/*"],
      });
    });

    it("should return empty object for non-existent file", async () => {
      const result = await loadTsConfig("/non/existent/tsconfig.json");

      expect(result).toEqual({});
    });

    it("should handle tsconfig.json without compilerOptions", async () => {
      const tsconfigContent = {
        extends: "@tsconfig/node18/tsconfig.json",
      };

      const tsconfigPath = join(TEST_TEMP_DIR, "tsconfig.json");
      await writeFile(tsconfigPath, JSON.stringify(tsconfigContent));

      const result = await loadTsConfig(tsconfigPath);

      expect(result.baseUrl).toBeUndefined();
      expect(result.paths).toBeUndefined();
    });

    it("should handle invalid JSON gracefully", async () => {
      const tsconfigContent = "{ invalid json content";

      const tsconfigPath = join(TEST_TEMP_DIR, "tsconfig.json");
      await writeFile(tsconfigPath, tsconfigContent);

      const result = await loadTsConfig(tsconfigPath);

      expect(result).toEqual({});
    });
  });

  describe("createPathResolver", () => {
    let resolver: PathResolver;
    const rootDir = "/project";

    beforeEach(() => {
      const tsConfig: TsConfigPaths = {
        baseUrl: ".",
        paths: {
          "@app/*": ["src/*"],
          "@utils/*": ["src/utils/*"],
          "@components/*": ["src/components/*"],
          "@exact": ["src/exact.ts"],
        },
      };
      resolver = createPathResolver(rootDir, tsConfig);
    });

    describe("relative path resolution", () => {
      it("should resolve relative imports with ./", () => {
        const fromFile = "/project/src/components/Button.tsx";
        const result = resolver(fromFile, "./Icon");

        expect(result).toBe("/project/src/components/Icon.ts");
      });

      it("should resolve relative imports with ../", () => {
        const fromFile = "/project/src/components/Button.tsx";
        const result = resolver(fromFile, "../utils/helpers");

        expect(result).toBe("/project/src/utils/helpers.ts");
      });

      it("should resolve nested relative paths", () => {
        const fromFile = "/project/src/components/forms/Input.tsx";
        const result = resolver(fromFile, "../../utils/validation");

        expect(result).toBe("/project/src/utils/validation.ts");
      });

      it("should handle relative paths with extensions", () => {
        const fromFile = "/project/src/main.ts";
        const result = resolver(fromFile, "./config.ts");

        expect(result).toBe("/project/src/config.ts");
      });
    });

    describe("path mapping resolution", () => {
      it("should resolve wildcard path mappings", () => {
        const fromFile = "/project/src/main.ts";
        const result = resolver(fromFile, "@app/components/Button");

        expect(result).toBe("/project/src/components/Button.ts");
      });

      it("should resolve nested wildcard mappings", () => {
        const fromFile = "/project/src/main.ts";
        const result = resolver(fromFile, "@utils/string/helpers");

        expect(result).toBe("/project/src/utils/string/helpers.ts");
      });

      it("should resolve exact path mappings", () => {
        const fromFile = "/project/src/main.ts";
        const result = resolver(fromFile, "@exact");

        expect(result).toBe("/project/src/exact.ts");
      });

      it("should prefer path mappings over baseUrl", () => {
        const fromFile = "/project/src/main.ts";
        const result = resolver(fromFile, "@app/config");

        // Should use path mapping, not baseUrl resolution
        expect(result).toBe("/project/src/config.ts");
      });
    });

    describe("baseUrl resolution", () => {
      it("should resolve imports using baseUrl when no path mapping matches", () => {
        const tsConfig: TsConfigPaths = {
          baseUrl: "src",
          paths: {
            "@app/*": ["components/*"],
          },
        };
        const baseUrlResolver = createPathResolver(rootDir, tsConfig);

        const fromFile = "/project/src/main.ts";
        const result = baseUrlResolver(fromFile, "utils/helpers");

        expect(result).toBe("/project/src/utils/helpers.ts");
      });
    });

    describe("external module handling", () => {
      it("should return null for external modules", () => {
        const fromFile = "/project/src/main.ts";

        expect(resolver(fromFile, "lodash")).toBeNull();
        expect(resolver(fromFile, "react")).toBeNull();
        expect(resolver(fromFile, "@types/node")).toBeNull();
        expect(resolver(fromFile, "some-npm-package")).toBeNull();
      });
    });

    describe("absolute path handling", () => {
      it("should handle absolute paths", () => {
        const fromFile = "/project/src/main.ts";
        const result = resolver(fromFile, "/absolute/path/to/file");

        expect(result).toBe("/absolute/path/to/file");
      });
    });

    describe("unresolvable paths", () => {
      it("should return null for unresolvable imports", () => {
        const fromFile = "/project/src/main.ts";

        expect(resolver(fromFile, "@unknown/module")).toBeNull();
        expect(resolver(fromFile, "unknown-specifier")).toBeNull();
      });
    });

    describe("file extension handling", () => {
      it("should handle TypeScript extensions", () => {
        const fromFile = "/project/src/main.ts";

        const tsResult = resolver(fromFile, "./config.ts");
        const tsxResult = resolver(fromFile, "./Component.tsx");

        expect(tsResult).toBe("/project/src/config.ts");
        expect(tsxResult).toBe("/project/src/Component.tsx");
      });

      it("should reject non-TypeScript extensions", () => {
        const tsConfig: TsConfigPaths = {
          baseUrl: ".",
          paths: {
            "@styles/*": ["src/styles/*"],
          },
        };
        const strictResolver = createPathResolver(rootDir, tsConfig);

        const fromFile = "/project/src/main.ts";
        const result = strictResolver(fromFile, "@styles/main.css");

        expect(result).toBeNull();
      });
    });

    describe("edge cases", () => {
      it("should handle empty path mappings", () => {
        const tsConfig: TsConfigPaths = {
          baseUrl: ".",
          paths: {},
        };
        const emptyResolver = createPathResolver(rootDir, tsConfig);

        const fromFile = "/project/src/main.ts";
        const result = emptyResolver(fromFile, "./config");

        expect(result).toBe("/project/src/config.ts");
      });

      it("should handle missing baseUrl", () => {
        const tsConfig: TsConfigPaths = {
          paths: {
            "@app/*": ["src/*"],
          },
        };
        const noBaseUrlResolver = createPathResolver(rootDir, tsConfig);

        const fromFile = "/project/src/main.ts";
        const result = noBaseUrlResolver(fromFile, "@app/config");

        expect(result).toBe("/project/src/config.ts");
      });

      it("should handle empty string specifiers", () => {
        const fromFile = "/project/src/main.ts";
        const result = resolver(fromFile, "");

        expect(result).toBeNull();
      });
    });
  });

  describe("makeRelativePath", () => {
    it("should make absolute paths relative to base directory", () => {
      const absolutePath = "/project/src/components/Button.tsx";
      const baseDir = "/project";

      const result = makeRelativePath(absolutePath, baseDir);

      expect(result).toBe("src/components/Button.tsx");
    });

    it("should handle paths not under base directory", () => {
      const absolutePath = "/other/project/file.ts";
      const baseDir = "/project";

      const result = makeRelativePath(absolutePath, baseDir);

      expect(result).toBe("/other/project/file.ts");
    });

    it("should handle base directory itself", () => {
      const absolutePath = "/project";
      const baseDir = "/project";

      const result = makeRelativePath(absolutePath, baseDir);

      expect(result).toBe("");
    });
  });

  describe("isExternalModule", () => {
    it("should identify external modules", () => {
      expect(isExternalModule("lodash")).toBe(true);
      expect(isExternalModule("react")).toBe(true);
      expect(isExternalModule("@types/node")).toBe(true);
      expect(isExternalModule("some-package")).toBe(true);
    });

    it("should identify internal modules", () => {
      expect(isExternalModule("./config")).toBe(false);
      expect(isExternalModule("../utils")).toBe(false);
      expect(isExternalModule("/absolute/path")).toBe(false);
      expect(isExternalModule("@/app/config")).toBe(false);
    });

    it("should handle edge cases", () => {
      expect(isExternalModule("")).toBe(false);
      expect(isExternalModule("@app/config")).toBe(true); // This is an external module (not @/ or ~/ prefixed)
    });
  });

  describe("Integration tests", () => {
    it("should work with complex real-world tsconfig", async () => {
      const complexTsConfig = {
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["src/*"],
            "@/components/*": ["src/components/*"],
            "@/utils/*": ["src/utils/*"],
            "@/types": ["src/types/index.ts"],
            "~/*": ["src/assets/*"],
          },
        },
      };

      const tsconfigPath = join(TEST_TEMP_DIR, "tsconfig.json");
      await writeFile(tsconfigPath, JSON.stringify(complexTsConfig, null, 2));

      const loadedConfig = await loadTsConfig(tsconfigPath);
      const resolver = createPathResolver("/project", loadedConfig);

      const fromFile = "/project/src/pages/Home.tsx";

      // Test various import scenarios
      expect(resolver(fromFile, "@/components/Header")).toBe(
        "/project/src/components/Header.ts",
      );
      expect(resolver(fromFile, "@/utils/api")).toBe(
        "/project/src/utils/api.ts",
      );
      expect(resolver(fromFile, "@/types")).toBe("/project/src/types/index.ts");
      expect(resolver(fromFile, "~/icons/logo")).toBe(
        "/project/src/assets/icons/logo.ts",
      );
      expect(resolver(fromFile, "./components/Footer")).toBe(
        "/project/src/pages/components/Footer.ts",
      );
      expect(resolver(fromFile, "../shared/Button")).toBe(
        "/project/src/shared/Button.ts",
      );
      expect(resolver(fromFile, "react")).toBeNull();
    });

    it("should handle resolution with no tsconfig", () => {
      const resolver = createPathResolver("/project", {});
      const fromFile = "/project/src/main.ts";

      // Should still resolve relative paths
      expect(resolver(fromFile, "./config")).toBe("/project/src/config.ts");
      expect(resolver(fromFile, "../utils/helpers")).toBe(
        "/project/utils/helpers.ts",
      );

      // Should return null for non-relative paths
      expect(resolver(fromFile, "@app/config")).toBeNull();
      expect(resolver(fromFile, "external-module")).toBeNull();
    });
  });
});
