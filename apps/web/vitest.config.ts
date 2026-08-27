import { defineConfig } from "vitest/config"

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    name: "web",
    // jsdom: component tests render real DOM via Testing Library. Route
    // handler tests (Request/Response) run fine here too — Node's fetch
    // globals aren't removed by the jsdom environment.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
  },
})
