import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "cdk.out/**",
        "node_modules/**",
        "dist/**",
        "**/*.d.ts",
        "coverage/**",
        "**/*.test.ts",
      ],
    },
    setupFiles: [],
  },
});
