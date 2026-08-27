import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.expo/**",
      "**/coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    // Root-level tooling config files (babel.config.js, etc.) run under
    // Node's CommonJS loader, not the app's ESM/TS module graph.
    files: ["**/*.config.js", "**/.eslintrc.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
  {
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Placeholder modules (packages/auth, packages/db) export intentionally
      // unused scaffolding until the follow-up PRs fill them in.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
)
