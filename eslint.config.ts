import eslintPluginTs from "@typescript-eslint/eslint-plugin";
import parserTs from "@typescript-eslint/parser";
// import { Linter } from "eslint";

const config = [
  {
    ignores: ["dist/**", "node_modules/**", "sample-src/**", "coverage/**"],
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parser: parserTs,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": eslintPluginTs,
    },
    rules: {
      ...eslintPluginTs.configs.recommended.rules,
    },
  },
  {
    files: [
      "eslint.config.ts",
      "jest.config.ts",
      "tests/**/*.ts",
      "commitlint.config.ts",
    ],
    languageOptions: {
      parser: parserTs,
    },
    plugins: {
      "@typescript-eslint": eslintPluginTs,
    },
    rules: {
      ...eslintPluginTs.configs.recommended.rules,
    },
  },
];

export default config;
