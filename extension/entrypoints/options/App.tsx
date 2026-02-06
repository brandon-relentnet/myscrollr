import { useState, useEffect } from 'react';
import type {
  ConnectionStatus,
  FeedPosition,
  FeedMode,
  FeedBehavior,
  FeedCategory,
} from '~/utils/types';
import type { StateSnapshotMessage } from '~/utils/messaging';
import {
  feedEnabled as feedEnabledStorage,
  feedPosition as feedPositionStorage,
  feedHeight as feedHeightStorage,
  feedMode as feedModeStorage,
  feedBehavior as feedBehaviorStorage,
  enabledSites as enabledSitesStorage,
  disabledSites as disabledSitesStorage,
  activeFeedTabs as activeFeedTabsStorage,
} from '~/utils/storage';

// ── Section component ────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-800/50 rounded-lg border border-zinc-700/50 overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-700/50">
        <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

// ── Row component ────────────────────────────────────────────────

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm text-zinc-200">{label}</div>
        {description && (
          <div className="text-xs text-zinc-500 mt-0.5">{description}</div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ── Main options app ─────────────────────────────────────────────

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [authenticated, setAuthenticated] = useState(false);

  // Preferences
  const [enabled, setEnabled] = useState(true);
  const [position, setPosition] = useState<FeedPosition>('bottom');
  const [height, setHeight] = useState(200);
  const [mode, setMode] = useState<FeedMode>('comfort');
  const [behavior, setBehavior] = useState<FeedBehavior>('overlay');
  const [enabledSites, setEnabledSites] = useState<string[]>([]);
  const [disabledSites, setDisabledSites] = useState<string[]>([]);
  const [activeCategories, setActiveCategories] = useState<FeedCategory[]>([
    'finance',
    'sports',
  ]);

  // Site input
  const [newEnabledSite, setNewEnabledSite] = useState('');
  const [newDisabledSite, setNewDisabledSite] = useState('');

  // Load state
  useEffect(() => {
    browser.runtime
      .sendMessage({ type: 'GET_STATE' })
      .then((response: unknown) => {
        const snapshot = response as StateSnapshotMessage | null;
        if (snapshot?.type === 'STATE_SNAPSHOT') {
          setStatus(snapshot.connectionStatus);
          setAuthenticated(snapshot.authenticated);
        }
      })
      .catch(() => {});

    feedEnabledStorage.getValue().then(setEnabled).catch(() => {});
    feedPositionStorage.getValue().then(setPosition).catch(() => {});
    feedHeightStorage.getValue().then(setHeight).catch(() => {});
    feedModeStorage.getValue().then(setMode).catch(() => {});
    feedBehaviorStorage.getValue().then(setBehavior).catch(() => {});
    enabledSitesStorage.getValue().then(setEnabledSites).catch(() => {});
    disabledSitesStorage.getValue().then(setDisabledSites).catch(() => {});
    activeFeedTabsStorage.getValue().then(setActiveCategories).catch(() => {});
  }, []);

  // Listen for auth status changes
  useEffect(() => {
    const handler = (message: unknown) => {
      const msg = message as Record<string, unknown>;
      if (msg.type === 'AUTH_STATUS' && typeof msg.authenticated === 'boolean') {
        setAuthenticated(msg.authenticated);
      }
      if (msg.type === 'CONNECTION_STATUS' && typeof msg.status === 'string') {
        setStatus(msg.status as ConnectionStatus);
      }
    };
    browser.runtime.onMessage.addListener(handler);
    return () => browser.runtime.onMessage.removeListener(handler);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────

  const updateEnabled = async (val: boolean) => {
    setEnabled(val);
    await feedEnabledStorage.setValue(val);
  };

  const updatePosition = async (val: FeedPosition) => {
    setPosition(val);
    await feedPositionStorage.setValue(val);
  };

  const updateHeight = async (val: number) => {
    setHeight(val);
    await feedHeightStorage.setValue(val);
  };

  const updateMode = async (val: FeedMode) => {
    setMode(val);
    await feedModeStorage.setValue(val);
  };

  const updateBehavior = async (val: FeedBehavior) => {
    setBehavior(val);
    await feedBehaviorStorage.setValue(val);
  };

  const addEnabledSite = async () => {
    const site = newEnabledSite.trim();
    if (!site || enabledSites.includes(site)) return;
    const next = [...enabledSites, site];
    setEnabledSites(next);
    await enabledSitesStorage.setValue(next);
    setNewEnabledSite('');
  };

  const removeEnabledSite = async (site: string) => {
    const next = enabledSites.filter((s) => s !== site);
    setEnabledSites(next);
    await enabledSitesStorage.setValue(next);
  };

  const addDisabledSite = async () => {
    const site = newDisabledSite.trim();
    if (!site || disabledSites.includes(site)) return;
    const next = [...disabledSites, site];
    setDisabledSites(next);
    await disabledSitesStorage.setValue(next);
    setNewDisabledSite('');
  };

  const removeDisabledSite = async (site: string) => {
    const next = disabledSites.filter((s) => s !== site);
    setDisabledSites(next);
    await disabledSitesStorage.setValue(next);
  };

  const toggleCategory = async (cat: FeedCategory) => {
    const next = activeCategories.includes(cat)
      ? activeCategories.filter((c) => c !== cat)
      : [...activeCategories, cat];
    setActiveCategories(next);
    await activeFeedTabsStorage.setValue(next);
  };

  const handleLogin = () => {
    browser.runtime.sendMessage({ type: 'LOGIN' });
  };

  const handleLogout = () => {
    browser.runtime.sendMessage({ type: 'LOGOUT' });
  };

  const selectClass =
    'bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500';

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Scrollr Settings
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Configure your real-time feed bar
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                status === 'connected'
                  ? 'bg-emerald-400'
                  : status === 'reconnecting'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-red-400'
              }`}
            />
            <span className="text-xs text-zinc-500 capitalize">{status}</span>
          </div>
        </div>

        <div className="space-y-6">
          {/* Account */}
          <Section title="Account">
            <Row
              label={authenticated ? 'Signed in' : 'Not signed in'}
              description={
                authenticated
                  ? 'You have access to personalized data'
                  : 'Sign in to access your dashboard data'
              }
            >
              {authenticated ? (
                <button
                  onClick={handleLogout}
                  className="px-4 py-1.5 rounded text-sm text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  Sign Out
                </button>
              ) : (
                <button
                  onClick={handleLogin}
                  className="px-4 py-1.5 rounded text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
                >
                  Sign In
                </button>
              )}
            </Row>
          </Section>

          {/* Appearance */}
          <Section title="Appearance">
            <Row label="Feed Enabled" description="Toggle the feed bar globally">
              <button
                onClick={() => updateEnabled(!enabled)}
                className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                  enabled
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                }`}
              >
                {enabled ? 'ON' : 'OFF'}
              </button>
            </Row>

            <Row label="Display Mode" description="Comfort shows more detail, compact saves space">
              <select
                value={mode}
                onChange={(e) => updateMode(e.target.value as FeedMode)}
                className={selectClass}
              >
                <option value="comfort">Comfort</option>
                <option value="compact">Compact</option>
              </select>
            </Row>

            <Row label="Position" description="Where the feed bar appears on the page">
              <select
                value={position}
                onChange={(e) => updatePosition(e.target.value as FeedPosition)}
                className={selectClass}
              >
                <option value="bottom">Bottom</option>
                <option value="top">Top</option>
              </select>
            </Row>

            <Row label="Behavior" description="Overlay floats on top, push adjusts page content">
              <select
                value={behavior}
                onChange={(e) => updateBehavior(e.target.value as FeedBehavior)}
                className={selectClass}
              >
                <option value="overlay">Overlay</option>
                <option value="push">Push Content</option>
              </select>
            </Row>

            <Row label="Default Height" description={`${height}px`}>
              <input
                type="range"
                min={100}
                max={600}
                step={10}
                value={height}
                onChange={(e) => updateHeight(Number(e.target.value))}
                className="w-40 accent-indigo-500"
              />
            </Row>
          </Section>

          {/* Feed Categories */}
          <Section title="Feed Categories">
            <div className="flex gap-3">
              {(['finance', 'sports'] as FeedCategory[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`px-4 py-2 rounded text-sm font-medium transition-colors capitalize ${
                    activeCategories.includes(cat)
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </Section>

          {/* Site Management */}
          <Section title="Allowed Sites">
            <p className="text-xs text-zinc-500">
              Leave empty to show the feed on all websites. Use{' '}
              <code className="text-zinc-400">*</code> as a wildcard (e.g.{' '}
              <code className="text-zinc-400">*://*.google.com/*</code>).
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newEnabledSite}
                onChange={(e) => setNewEnabledSite(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addEnabledSite()}
                placeholder="*://*.example.com/*"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={addEnabledSite}
                className="px-4 py-1.5 rounded text-sm font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors"
              >
                Add
              </button>
            </div>
            {enabledSites.length > 0 && (
              <div className="space-y-1">
                {enabledSites.map((site) => (
                  <div
                    key={site}
                    className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 rounded text-sm"
                  >
                    <code className="text-zinc-300">{site}</code>
                    <button
                      onClick={() => removeEnabledSite(site)}
                      className="text-zinc-600 hover:text-red-400 transition-colors ml-2"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Blocked Sites">
            <p className="text-xs text-zinc-500">
              The feed will never appear on these sites, even if they match an
              allowed pattern.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newDisabledSite}
                onChange={(e) => setNewDisabledSite(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addDisabledSite()}
                placeholder="*://*.example.com/*"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={addDisabledSite}
                className="px-4 py-1.5 rounded text-sm font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors"
              >
                Add
              </button>
            </div>
            {disabledSites.length > 0 && (
              <div className="space-y-1">
                {disabledSites.map((site) => (
                  <div
                    key={site}
                    className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 rounded text-sm"
                  >
                    <code className="text-zinc-300">{site}</code>
                    <button
                      onClick={() => removeDisabledSite(site)}
                      className="text-zinc-600 hover:text-red-400 transition-colors ml-2"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* About */}
          <Section title="About">
            <Row label="Version" description="Scrollr Browser Extension">
              <span className="text-sm text-zinc-400">
                v{browser.runtime.getManifest().version}
              </span>
            </Row>
            <Row label="Website" description="Visit myscrollr.com for more">
              <a
                href="https://myscrollr.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                myscrollr.com
              </a>
            </Row>
          </Section>
        </div>
      </div>
    </div>
  );
}
