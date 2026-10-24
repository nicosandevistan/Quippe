import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
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
