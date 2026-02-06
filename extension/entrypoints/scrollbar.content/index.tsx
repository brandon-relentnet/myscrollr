import './style.css';
import ReactDOM from 'react-dom/client';
import App from './App';
import { feedEnabled, disabledSites, enabledSites } from '~/utils/storage';

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
    const show = await shouldShowOnSite(window.location.href);
    if (!show) return;

    const ui = await createShadowRootUi(ctx, {
      name: 'scrollr-feed',
      position: 'overlay',
      anchor: 'body',
      onMount(container) {
        // Create a wrapper div inside the shadow root container
        const wrapper = document.createElement('div');
        wrapper.id = 'scrollr-root';
        container.append(wrapper);

        const root = ReactDOM.createRoot(wrapper);
        root.render(<App />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
