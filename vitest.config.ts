import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  test: { globals: true, environment: "node", include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"] },
});
