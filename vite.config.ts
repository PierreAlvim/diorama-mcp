import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// The view must be one self-contained HTML file: the host loads it into a sandboxed iframe.
export default defineConfig({
  root: "ui",
  plugins: [react(), viteSingleFile()],
  build: { outDir: "../dist/ui", emptyOutDir: true },
});
