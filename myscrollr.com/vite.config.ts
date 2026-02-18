import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { URL, fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { defineConfig, type Plugin } from 'vite'
import viteReact from '@vitejs/plugin-react'

const pkg = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./package.json', import.meta.url)),
    'utf8',
  ),
)

const monorepoRoot = fileURLToPath(new URL('..', import.meta.url))
const projectRoot = fileURLToPath(new URL('.', import.meta.url))

/**
 * Vite plugin that resolves bare module imports from files outside the project
 * directory (e.g. channels/star/web/) to this project's node_modules.
 *
 * This is needed because Vite's default Node resolution walks up from the
 * importer's directory, which won't find our node_modules for files in
 * ../channels/.
 *
 * We re-resolve using a synthetic importer path inside the project root so
 * Vite uses its normal ESM-aware resolution (respecting package.json exports
 * maps) but searches our node_modules.
 */
function resolveExternalChannels(): Plugin {
  // A synthetic importer inside the project root — used to trick Vite's
  // resolver into searching myscrollr.com/node_modules with full ESM support.
  const syntheticImporter = resolve(projectRoot, '__virtual_importer__.tsx')

  return {
    name: 'resolve-external-channels',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      // Only handle bare imports from channel files outside this project
      if (
        !importer ||
        source.startsWith('.') ||
        source.startsWith('/') ||
        source.startsWith('@/') ||
        source.startsWith('@scrollr') ||
        source.startsWith('\0') ||
        importer.includes('node_modules') ||
        importer.startsWith(projectRoot)
      ) {
        return null
      }

      // Re-resolve the same import as if it came from inside this project.
      // This makes Vite walk node_modules from myscrollr.com/ instead of
      // from the external channels/ directory.
      const resolved = await this.resolve(source, syntheticImporter, {
        ...options,
        skipSelf: true,
      })
      return resolved
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    resolveExternalChannels(),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    viteReact(),
    tailwindcss(),
  ],
  server: {
    allowedHosts: ['dev.olvyx.com'],
    fs: {
      // Allow serving files from the monorepo root (for channels/*/web/)
      allow: [monorepoRoot],
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@scrollr': fileURLToPath(new URL('../channels', import.meta.url)),
    },
  },
})
