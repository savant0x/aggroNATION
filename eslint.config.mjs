import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import unusedImports from "eslint-plugin-unused-imports";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default defineConfig([
  globalIgnores([
    "resources/**",
    ".agents/**",
    "**/node_modules/**",
    "**/.next/**",
    "**/coverage/**",
    ".heroui-docs/**",
    "scripts/**",
  ]),
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    plugins: {
      "unused-imports": unusedImports,
      prettier: prettierPlugin,
    },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": "warn",
      "prettier/prettier": "warn",
      // ECHO Law 6: no type safety shortcuts.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  prettierConfig,
]);
