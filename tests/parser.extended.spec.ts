import { writeFile, mkdir, rm } from "fs/promises";
import { join, resolve } from "path";
import { parseImports, ImportResolver } from "../src/parser.js";

describe("Extended Import Parser", () => {
  const TEST_TEMP_DIR = resolve("temp-parser-extended-test");

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

  describe("Dynamic imports", () => {
    it("should parse basic dynamic imports", async () => {
      const fileContent = `
        export async function loadModule() {
          const utils = await import("./utils");
          const helpers = await import("./helpers");
          const lodash = await import("lodash"); // External module
          
          return utils.helper();
        }
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        switch (specifier) {
          case "./utils":
            return join(TEST_TEMP_DIR, "utils.ts");
          case "./helpers":
            return join(TEST_TEMP_DIR, "helpers.ts");
          default:
            return null; // External modules
        }
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([
        join(TEST_TEMP_DIR, "helpers.ts"),
        join(TEST_TEMP_DIR, "utils.ts"),
      ]);
    });

    it("should parse dynamic imports in different contexts", async () => {
      const fileContent = `
        // In function
        async function loadA() {
          return import("./moduleA");
        }
        
        // In arrow function
        const loadB = () => import("./moduleB");
        
        // In conditional
        if (condition) {
          import("./moduleC").then(mod => {});
        }
        
        // In promise chain
        Promise.resolve().then(() => import("./moduleD"));
        
        // Ignore external modules
        import("react").then(React => {});
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        if (specifier.startsWith("./module")) {
          return join(TEST_TEMP_DIR, specifier.substring(2) + ".ts");
        }
        return null; // External modules
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([
        join(TEST_TEMP_DIR, "moduleA.ts"),
        join(TEST_TEMP_DIR, "moduleB.ts"),
        join(TEST_TEMP_DIR, "moduleC.ts"),
        join(TEST_TEMP_DIR, "moduleD.ts"),
      ]);
    });

    it("should ignore dynamic imports with non-string arguments", async () => {
      const fileContent = `
        const moduleName = "./utils";
        const condition = true;
        
        // These should be ignored (non-literal arguments)
        import(moduleName);
        import(condition ? "./a" : "./b");
        import(\`./template-\${name}\`);
        
        // This should be captured (string literal)
        import("./static");
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        if (specifier === "./static") {
          return join(TEST_TEMP_DIR, "static.ts");
        }
        return null;
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([join(TEST_TEMP_DIR, "static.ts")]);
    });
  });

  describe("Re-exports", () => {
    it("should parse export * from re-exports", async () => {
      const fileContent = `
        // Re-export everything
        export * from "./utils";
        export * from "./helpers";
        export * from "lodash"; // External module (ignored)
        
        // Regular export (not a re-export)
        export const localVar = 42;
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        switch (specifier) {
          case "./utils":
            return join(TEST_TEMP_DIR, "utils.ts");
          case "./helpers":
            return join(TEST_TEMP_DIR, "helpers.ts");
          default:
            return null; // External modules
        }
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([
        join(TEST_TEMP_DIR, "helpers.ts"),
        join(TEST_TEMP_DIR, "utils.ts"),
      ]);
    });

    it("should parse named re-exports", async () => {
      const fileContent = `
        // Named re-exports
        export { add, subtract } from "./math";
        export { default as Component } from "./component";
        export { helper1, helper2 as h2 } from "./helpers";
        export { External } from "external-lib"; // External (ignored)
        
        // Regular export (not a re-export)
        export { localFunction };
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        switch (specifier) {
          case "./math":
            return join(TEST_TEMP_DIR, "math.ts");
          case "./component":
            return join(TEST_TEMP_DIR, "component.ts");
          case "./helpers":
            return join(TEST_TEMP_DIR, "helpers.ts");
          default:
            return null; // External modules
        }
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([
        join(TEST_TEMP_DIR, "component.ts"),
        join(TEST_TEMP_DIR, "helpers.ts"),
        join(TEST_TEMP_DIR, "math.ts"),
      ]);
    });

    it("should ignore type-only re-exports", async () => {
      const fileContent = `
        // Type-only re-exports (should be ignored)
        export type { User, Admin } from "./types";
        export type * from "./interfaces";
        
        // Regular re-exports (should be captured)
        export { validateUser } from "./types";
        export * from "./utils";
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        switch (specifier) {
          case "./types":
            return join(TEST_TEMP_DIR, "types.ts");
          case "./interfaces":
            return join(TEST_TEMP_DIR, "interfaces.ts");
          case "./utils":
            return join(TEST_TEMP_DIR, "utils.ts");
          default:
            return null;
        }
      };

      const result = await parseImports([filePath], mockResolver);

      // Should only include non-type re-exports
      expect(result[filePath]).toEqual([
        join(TEST_TEMP_DIR, "types.ts"),
        join(TEST_TEMP_DIR, "utils.ts"),
      ]);
    });
  });

  describe("Mixed import forms", () => {
    it("should parse all import forms together", async () => {
      const fileContent = `
        // Static imports
        import { add } from "./math";
        import * as utils from "./utils";
        
        // Dynamic imports
        const loadHelper = () => import("./helper");
        
        // Re-exports
        export * from "./types";
        export { Component } from "./component";
        
        // Type-only (should be ignored)
        import type { Config } from "./config";
        export type { Theme } from "./theme";
        
        // Side-effects (should be ignored)
        import "./styles.css";
        
        // External modules (should be ignored)
        import React from "react";
        import("lodash");
        export * from "external-lib";
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        const localModules = [
          "./math",
          "./utils",
          "./helper",
          "./types",
          "./component",
          "./config",
          "./theme",
        ];

        if (localModules.includes(specifier)) {
          return join(TEST_TEMP_DIR, specifier.substring(2) + ".ts");
        }
        return null; // External modules or non-TS files
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([
        join(TEST_TEMP_DIR, "component.ts"),
        join(TEST_TEMP_DIR, "helper.ts"),
        join(TEST_TEMP_DIR, "math.ts"),
        join(TEST_TEMP_DIR, "types.ts"),
        join(TEST_TEMP_DIR, "utils.ts"),
      ]);
    });
  });

  describe("Side-effect imports handling", () => {
    it("should ignore side-effect imports", async () => {
      const fileContent = `
        // Side-effect imports (should be ignored)
        import "reflect-metadata";
        import "./polyfills";
        import "./styles.css";
        import "./global.scss";
        
        // Regular imports (should be captured)
        import { helper } from "./utils";
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        if (specifier === "./utils") {
          return join(TEST_TEMP_DIR, "utils.ts");
        }
        return null; // Side-effect imports or external modules
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([join(TEST_TEMP_DIR, "utils.ts")]);
    });
  });

  describe("Non-TypeScript file filtering", () => {
    it("should filter out non-TypeScript resolved paths", async () => {
      const fileContent = `
        import { helper } from "./utils";
        import { config } from "./config.json";
        import { styles } from "./styles.css";
        
        export * from "./constants";
        export * from "./data.json";
        
        import("./component").then(comp => {});
        import("./image.png").then(img => {});
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        const mapping: Record<string, string> = {
          "./utils": join(TEST_TEMP_DIR, "utils.ts"),
          "./config.json": join(TEST_TEMP_DIR, "config.json"),
          "./styles.css": join(TEST_TEMP_DIR, "styles.css"),
          "./constants": join(TEST_TEMP_DIR, "constants.ts"),
          "./data.json": join(TEST_TEMP_DIR, "data.json"),
          "./component": join(TEST_TEMP_DIR, "component.ts"),
          "./image.png": join(TEST_TEMP_DIR, "image.png"),
        };

        return mapping[specifier] || null;
      };

      const result = await parseImports([filePath], mockResolver);

      // Should only include TypeScript files
      expect(result[filePath]).toEqual([
        join(TEST_TEMP_DIR, "component.ts"),
        join(TEST_TEMP_DIR, "constants.ts"),
        join(TEST_TEMP_DIR, "utils.ts"),
      ]);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty specifiers gracefully", async () => {
      const fileContent = `
        import { helper } from "./utils";
        // Malformed imports would be syntax errors, 
        // but we handle empty specifiers gracefully
        export const test = () => {};
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        if (specifier === "./utils") {
          return join(TEST_TEMP_DIR, "utils.ts");
        }
        return null;
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([join(TEST_TEMP_DIR, "utils.ts")]);
    });

    it("should deduplicate imports across different forms", async () => {
      const fileContent = `
        // Same module imported in different ways
        import { add } from "./math";
        import { subtract } from "./math";  // Static import
        
        export { multiply } from "./math";  // Re-export
        
        const loadMath = () => import("./math"); // Dynamic import
        
        // Different module
        import { helper } from "./utils";
      `;

      const filePath = join(TEST_TEMP_DIR, "test.ts");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        switch (specifier) {
          case "./math":
            return join(TEST_TEMP_DIR, "math.ts");
          case "./utils":
            return join(TEST_TEMP_DIR, "utils.ts");
          default:
            return null;
        }
      };

      const result = await parseImports([filePath], mockResolver);

      // Should be deduplicated and sorted
      expect(result[filePath]).toEqual([
        join(TEST_TEMP_DIR, "math.ts"),
        join(TEST_TEMP_DIR, "utils.ts"),
      ]);
    });
  });

  describe("TSX file support", () => {
    it("should handle imports in TSX files", async () => {
      const fileContent = `
        import React from "react";
        import { Button } from "./components";
        
        // Dynamic import in component
        const LazyComponent = React.lazy(() => import("./LazyComponent"));
        
        // Re-export
        export * from "./types";
        
        export const App = () => (
          <div>
            <Button />
            <LazyComponent />
          </div>
        );
      `;

      const filePath = join(TEST_TEMP_DIR, "App.tsx");
      await writeFile(filePath, fileContent);

      const mockResolver: ImportResolver = (fromFile, specifier) => {
        switch (specifier) {
          case "./components":
            return join(TEST_TEMP_DIR, "components.tsx");
          case "./LazyComponent":
            return join(TEST_TEMP_DIR, "LazyComponent.tsx");
          case "./types":
            return join(TEST_TEMP_DIR, "types.ts");
          default:
            return null; // External modules
        }
      };

      const result = await parseImports([filePath], mockResolver);

      expect(result[filePath]).toEqual([
        join(TEST_TEMP_DIR, "LazyComponent.tsx"),
        join(TEST_TEMP_DIR, "components.tsx"),
        join(TEST_TEMP_DIR, "types.ts"),
      ]);
    });
  });
});
