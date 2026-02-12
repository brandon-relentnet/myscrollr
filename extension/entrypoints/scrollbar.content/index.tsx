import './style.css';
import ReactDOM from 'react-dom/client';
import App from './App';
import { feedEnabled, disabledSites, enabledSites } from '~/utils/storage';
import { FRONTEND_URL } from '~/utils/constants';
import type { ClientMessage, AuthSyncLoginMessage, BackgroundMessage } from '~/utils/messaging';

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
    // On myscrollr.com, bridge auth and config events between the
    // website and extension background. This enables:
    //   - Config sync: website config changes → extension re-fetches
    //   - Auth sync (website→ext): website login/logout → extension syncs
    //   - Auth sync (ext→website): extension login/logout → website syncs
    if (window.location.origin === FRONTEND_URL) {
      // ── Inbound: website → extension ────────────────────────────

      // Config changes (existing)
      ctx.addEventListener(document, 'scrollr:config-changed' as any, () => {
        browser.runtime
          .sendMessage({ type: 'FORCE_REFRESH' } satisfies ClientMessage)
          .catch(() => {});
      });

      // Website login → extension picks up tokens
      ctx.addEventListener(document, 'scrollr:auth-login' as any, ((
        e: CustomEvent<{ accessToken: string; refreshToken: string | null; expiresAt: number }>,
      ) => {
        const { accessToken, refreshToken, expiresAt } = e.detail;
        if (accessToken) {
          browser.runtime
            .sendMessage({
              type: 'AUTH_SYNC_LOGIN',
              accessToken,
              refreshToken: refreshToken ?? null,
              expiresAt,
            } satisfies AuthSyncLoginMessage)
            .catch(() => {});
        }
      }) as EventListener);

      // Website logout → extension logs out
      ctx.addEventListener(document, 'scrollr:auth-logout' as any, () => {
        browser.runtime
          .sendMessage({ type: 'AUTH_SYNC_LOGOUT' } satisfies ClientMessage)
          .catch(() => {});
      });

      // ── Outbound: extension → website ───────────────────────────
      // Listen for DISPATCH_AUTH_EVENT from background and relay as
      // CustomEvents on document so the website JS can react.
      browser.runtime.onMessage.addListener((message: unknown) => {
        const msg = message as BackgroundMessage;
        if (msg.type === 'DISPATCH_AUTH_EVENT') {
          if (msg.event === 'login' && msg.tokens) {
            document.dispatchEvent(
              new CustomEvent('scrollr:ext-auth-login', {
                detail: msg.tokens,
              }),
            );
          } else if (msg.event === 'logout') {
            document.dispatchEvent(
              new CustomEvent('scrollr:ext-auth-logout'),
            );
          }
        }
      });
    }
  },
});
