import { resolve } from 'node:path';
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import remToPixel from 'postcss-rem-to-responsive-pixel';
import type { Plugin } from 'vite';

const extensionRoot = resolve(__dirname);

/**
 * Vite plugin that resolves bare module imports from files outside the
 * extension directory (e.g. integrations/star/extension/) to this project's
 * node_modules.
 *
 * Uses a synthetic importer inside the extension root so Vite's resolver
 * walks node_modules from extension/ with full ESM support.
 */
function resolveExternalIntegrations(): Plugin {
  const syntheticImporter = resolve(extensionRoot, '__virtual_importer__.tsx');

  return {
    name: 'resolve-external-integrations',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (
        !importer ||
        source.startsWith('.') ||
        source.startsWith('/') ||
        source.startsWith('~') ||
        source.startsWith('@scrollr') ||
        source.startsWith('\0') ||
        importer.includes('node_modules') ||
        importer.startsWith(extensionRoot)
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
  modules: ['@wxt-dev/module-react'],
  alias: {
    '@scrollr': resolve('..', 'integrations'),
  },
  manifest: {
    name: 'Scrollr',
    description: 'Real-time financial and sports data feed for your browser',
    permissions: ['storage', 'identity', 'alarms'],
    host_permissions: [
      'https://api.myscrollr.relentnet.dev/*',
      'https://auth.myscrollr.relentnet.dev/*',
    ],
    browser_specific_settings: {
      gecko: {
        id: 'scrollr@relentnet.dev',
      },
    },
  },
  vite: () => ({
    plugins: [tailwindcss(), resolveExternalIntegrations()],
    css: {
      postcss: {
        plugins: [
          remToPixel({
            rootValue: 16,
            propList: ['*'],
            transformUnit: 'px',
          }),
        ],
      },
    },
  }),
});
