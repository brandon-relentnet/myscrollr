import './style.css';
import ReactDOM from 'react-dom/client';
import App from './App';
import { feedEnabled, disabledSites, enabledSites } from '~/utils/storage';
import { FRONTEND_URL } from '~/utils/constants';
import type { ClientMessage } from '~/utils/messaging';

/** Check if the feed should show on the current URL. */
async function shouldShowOnSite(url: string): Promise<boolean> {
  const globalEnabled = await feedEnabled.getValue();
  if (!globalEnabled) return false;

  const disabled = await disabledSites.getValue();
  if (disabled.some((pattern) => urlMatchesPattern(url, pattern))) return false;

  const enabled = await enabledSites.getValue();
  if (enabled.length === 0) return true; // Empty = show everywhere
  return enabled.some((pattern) => urlMatchesPattern(url, pattern));
}

/** Simple wildcard URL pattern matching. */
function urlMatchesPattern(url: string, pattern: string): boolean {
  try {
    // Convert simple wildcard pattern to regex
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(url);
  } catch {
    return false;
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    type UiHandle = Awaited<ReturnType<typeof createShadowRootUi<ReactDOM.Root>>>;
    let ui: UiHandle | null = null;

    /** Mount or unmount the feed bar based on whether it should show on the given URL. */
    async function evaluate(url: string) {
      const show = await shouldShowOnSite(url);

      if (show && !ui) {
        ui = await createShadowRootUi(ctx, {
          name: 'scrollr-feed',
          position: 'overlay',
          anchor: 'body',
          onMount(container) {
            const wrapper = document.createElement('div');
            wrapper.id = 'scrollr-root';
            container.append(wrapper);

            const root = ReactDOM.createRoot(wrapper);
            root.render(<App ctx={ctx} />);
            return root;
          },
          onRemove(root) {
            root?.unmount();
          },
        });
        ui.mount();
      } else if (!show && ui) {
        ui.remove();
        ui = null;
      }
    }

    // Evaluate on initial page load
    await evaluate(window.location.href);

    // Re-evaluate on SPA navigations (pushState, replaceState, popstate, hashchange)
    ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => {
      evaluate(newUrl.href);
    });

    // ── Content script bridge ──────────────────────────────────────
    // On myscrollr.com, listen for config-changed events dispatched by
    // the website after stream CRUD or preference updates. This gives
    // free-tier users instant config sync without needing SSE/CDC.
    if (window.location.origin === FRONTEND_URL) {
      ctx.addEventListener(document, 'scrollr:config-changed' as any, () => {
        browser.runtime
          .sendMessage({ type: 'FORCE_REFRESH' } satisfies ClientMessage)
          .catch(() => {});
      });
    }
  },
});
