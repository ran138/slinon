import { fileURLToPath } from "node:url";
import { defineConfig } from "../product/node_modules/vitest/dist/config.js";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const productRoot = fileURLToPath(new URL("../product", import.meta.url));

export default defineConfig({
  root: productRoot,
  resolve: {
    alias: [
      { find: "@", replacement: productRoot },
      { find: /^server-only$/, replacement: fileURLToPath(new URL("./stubs/server-only.ts", import.meta.url)) },
      { find: /^vitest$/, replacement: fileURLToPath(new URL("../product/node_modules/vitest/dist/index.js", import.meta.url)) },
      { find: /^openai$/, replacement: fileURLToPath(new URL("../product/node_modules/openai/index.mjs", import.meta.url)) },
      { find: /^music-metadata$/, replacement: fileURLToPath(new URL("../product/node_modules/music-metadata/lib/index.js", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    include: [
      "../tests/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    exclude: ["**/*.integration.test.ts"],
    restoreMocks: true,
    clearMocks: true,
  },
});

export { repositoryRoot };
