import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests of the pure logic. They run in CI on every land (npm test): no browser, no network.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});
