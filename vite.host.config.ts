import { defineConfig } from "vite";

// Test-only: the page that plays the MCP host in scripts/e2e.mjs.
export default defineConfig({
  root: "test/host",
  build: { outDir: "../../dist/host", emptyOutDir: true },
});
