import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import remToPixel from 'postcss-rem-to-responsive-pixel';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
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
    plugins: [tailwindcss()],
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
