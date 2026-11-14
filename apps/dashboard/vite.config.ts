import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@lumi/foundation": path.resolve(__dirname, "../../packages/foundation/src/index.ts"),
      "@lumi/module-kit": path.resolve(__dirname, "../../packages/module-kit/src/index.ts"),
      "@lumi/cache": path.resolve(__dirname, "../../packages/cache/src/index.ts"),
    },
  },
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({ out: "build" }),
      csp: {
        mode: "auto",
        directives: {
          "default-src": ["self"],
          "script-src": ["self"],
          "style-src": ["self", "unsafe-inline"],
          "img-src": [
            "self",
            "https://cdn.discordapp.com",
            "https://media.discordapp.net",
            "data:",
          ],
          "connect-src": ["self"],
          "object-src": ["none"],
          "frame-ancestors": ["none"],
          "base-uri": ["self"],
          "form-action": ["self"],
        },
      },
    }),
  ],
  ssr: {
    noExternal: ["@lumi/foundation", "@lumi/module-kit", "@lumi/cache"],
  },
});
