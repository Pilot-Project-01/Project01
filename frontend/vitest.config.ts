import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": here("./src") },
  },
  // The task-content guard imports the real task files, which live above the
  // frontend root — allow vitest to read them.
  server: {
    fs: { allow: [here("./"), here("../tasks")] },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
