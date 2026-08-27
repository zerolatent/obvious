import { defineConfig } from "vitest/config"

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    name: "web",
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
  },
})
