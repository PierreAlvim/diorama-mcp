import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The playground is a static site: an editor page plus the real view in an iframe. Relative base so it can be hosted under any path.
export default defineConfig({
  root: "playground",
  base: "./",
  plugins: [react()],
  server: { fs: { allow: [".."] } },
  build: { outDir: "../dist/playground", emptyOutDir: true, rollupOptions: { input: { index: "playground/index.html", frame: "playground/frame.html" } } },
});
