import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { resolve } from "path";
import type { Plugin } from "vite";

// https://v2.tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST;
const projectRoot = __dirname;

/**
 * Resolves bare module imports from files outside the desktop project root
 * (channels, extension dirs) to desktop/node_modules.
 * Same approach used by myscrollr.com and extension builds.
 */
function resolveExternalChannels(): Plugin {
  const syntheticImporter = resolve(projectRoot, "__virtual_importer__.tsx");

  return {
    name: "resolve-external-channels",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (
        !importer ||
        source.startsWith(".") ||
        source.startsWith("/") ||
        source.startsWith("~/") ||
        source.startsWith("@scrollr") ||
        source.startsWith("\0") ||
        importer.includes("node_modules") ||
        importer.startsWith(projectRoot)
      ) {
        return null;
      }

      const resolved = await this.resolve(source, syntheticImporter, {
        ...options,
        skipSelf: true,
      });
      return resolved;
    },
  };
}

export default defineConfig({
  plugins: [resolveExternalChannels(), react(), tailwindcss()],

  resolve: {
    alias: [
      // Desktop-specific overrides — checked FIRST
      // Redirect the CDC hook to our desktop version (direct fetch, no browser.runtime)
      {
        find: "~/channels/hooks/useScrollrCDC",
        replacement: path.resolve(__dirname, "src/hooks/useScrollrCDC.ts"),
      },
      // Catch-all — everything else resolves to the real extension source
      {
        find: /^~\//,
        replacement: path.resolve(__dirname, "../extension") + "/",
      },
      // Channel components
      {
        find: /^@scrollr\//,
        replacement: path.resolve(__dirname, "../channels") + "/",
      },
    ],
  },

  // Allow importing files from extension/ and channels/ directories
  server: {
    port: 5174,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 5174 } : undefined,
    fs: {
      allow: [
        path.resolve(__dirname, ".."), // monorepo root
      ],
    },
  },

  // Ensure Vite clears the correct output dir
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
  },
});
