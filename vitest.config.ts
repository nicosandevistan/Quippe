import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Compile JSX in test files with the automatic runtime so component tests
  // need no explicit `import React`. The app itself uses `jsx: "preserve"`
  // (Next's compiler handles JSX); this only affects how Vitest/esbuild
  // transforms the `.tsx` test files.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    // Pick up unit tests and property-based tests only.
    include: [
      "tests/unit/**/*.{test,spec}.{ts,tsx}",
      "tests/properties/**/*.{test,spec}.{ts,tsx}",
    ],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
