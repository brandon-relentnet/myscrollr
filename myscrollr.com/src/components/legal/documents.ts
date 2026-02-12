import type { LucideIcon } from 'lucide-react'
import {
  FileText,
  Shield,
  Cookie,
  TrendingUp,
  Link2,
  Puzzle,
  CreditCard,
  RotateCcw,
  Scale,
  GitPullRequest,
  ShieldAlert,
  Copyright,
  Lock,
  Accessibility,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────

export interface LegalSection {
  heading: string
  content: string[]
  callout?: { type: 'warning' | 'info'; text: string }
}

export interface LegalDocument {
  slug: string
  title: string
  shortTitle: string
  icon: LucideIcon
  category: 'core' | 'data' | 'commerce' | 'community' | 'compliance'
  lastUpdated: string
  effectiveDate: string
  badge?: string
  sections: LegalSection[]
}

// ── Categories ───────────────────────────────────────────────────

export const CATEGORIES: Record<string, string> = {
  core: 'Core',
  data: 'Data & Privacy',
  commerce: 'Commerce',
  community: 'Community',
  compliance: 'Compliance',
}

// ── Documents ────────────────────────────────────────────────────

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  // ─────────────────────────────────────────────────────────────
  // 1. TERMS OF SERVICE
  // ─────────────────────────────────────────────────────────────
  {
    slug: 'terms',
    title: 'Terms of Service',
    shortTitle: 'Terms',
    icon: FileText,
    category: 'core',
    lastUpdated: 'February 2026',
    effectiveDate: 'February 11, 2026',
    sections: [
      {
        heading: 'Acceptance of Terms',
        content: [
          'By accessing or using Scrollr ("the Platform"), including the website at myscrollr.com, the Scrollr browser extension, and any associated APIs or services, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Platform.',
          'We may update these Terms from time to time. Continued use of the Platform after changes constitutes acceptance of the revised Terms. We will indicate the date of the most recent revision at the top of this page.',
        ],
      },
      {
        heading: 'Eligibility',
        content: [
          'You must be at least 13 years of age to use the Platform. If you are under 18, you represent that you have your parent or guardian\'s permission to use the Platform. By using the Platform, you represent and warrant that you meet these eligibility requirements.',
        ],
      },
      {
        heading: 'Account Registration',
        content: [
          'Certain features of the Platform require you to create an account through our authentication provider (Logto). You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.',
          'You agree to provide accurate information during registration and to update your information as necessary. We reserve the right to suspend or terminate accounts that violate these Terms.',
        ],
      },
      {
        heading: 'Use of the Platform',
        content: [
          'The Platform aggregates publicly available and third-party data including financial market data, sports scores, RSS news feeds, and fantasy sports information. This data is provided for informational and entertainment purposes only.',
          'You may use the Platform for personal, non-commercial purposes in accordance with these Terms and our Acceptable Use Policy. You may not use the Platform in any way that violates applicable laws or regulations.',
        ],
      },
      {
        heading: 'Browser Extension',
        content: [
          'The Scrollr browser extension operates by injecting a scrollbar feed overlay onto web pages you visit. The extension communicates with our servers to receive real-time data updates via Server-Sent Events (SSE). The extension does not read, collect, or transmit the content of web pages you visit.',
          'By installing the extension, you grant it the permissions listed in the extension manifest, which include storage access and communication with our API servers.',
        ],
      },
      {
        heading: 'Intellectual Property',
        content: [
          'The Scrollr platform source code is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). This means the source code is freely available, and you may use, modify, and distribute it in accordance with the terms of that license.',
          'The Scrollr name, logo, and branding are trademarks of the project maintainers and may not be used without permission. Third-party data displayed through the Platform (market data, sports scores, news feeds, fantasy sports data) remains the property of its respective owners.',
        ],
      },
      {
        heading: 'Limitation of Liability',
        content: [
          'THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.',
          'IN NO EVENT SHALL THE SCROLLR PROJECT, ITS MAINTAINERS, CONTRIBUTORS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR USE OF OR INABILITY TO USE THE PLATFORM.',
          'THIS LIMITATION APPLIES WHETHER THE DAMAGES ARE BASED ON WARRANTY, CONTRACT, TORT, STATUTE, OR ANY OTHER LEGAL THEORY, AND WHETHER OR NOT WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.',
        ],
      },
      {
        heading: 'Termination',
        content: [
          'We may suspend or terminate your access to the Platform at any time, with or without cause, and with or without notice. Upon termination, your right to use the Platform ceases immediately.',
          'You may terminate your account at any time by discontinuing use of the Platform. Provisions of these Terms that by their nature should survive termination shall survive, including but not limited to limitation of liability and intellectual property provisions.',
        ],
      },
      {
        heading: 'Governing Law',
        content: [
          'These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to conflict of law principles. Any disputes arising from these Terms or your use of the Platform shall be resolved in the courts of competent jurisdiction within the United States.',
        ],
      },
      {
        heading: 'Contact',
        content: [
          'If you have questions about these Terms, please reach out via our GitHub repository or community channels listed on the Platform.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 2. PRIVACY POLICY
  // ─────────────────────────────────────────────────────────────
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    shortTitle: 'Privacy',
    icon: Shield,
    category: 'data',
    lastUpdated: 'February 2026',
    effectiveDate: 'February 11, 2026',
    sections: [
      {
        heading: 'Overview',
        content: [
          'Scrollr ("we," "our," or "the Platform") respects your privacy. This Privacy Policy describes what information we collect, how we use it, and your rights regarding that information.',
          'This policy applies to the Scrollr website (myscrollr.com), the Scrollr browser extension, and all associated APIs and services.',
        ],
      },
      {
        heading: 'Information We Collect',
        content: [
          'Account Information: When you create an account, our authentication provider (Logto) collects your email address, username, and display name. We store a unique identifier (Logto sub) to associate your account with your preferences and data streams.',
          'User Preferences: We store your feed display preferences (position, mode, behavior, enabled/disabled sites) in our PostgreSQL database, associated with your account identifier.',
          'Stream Configuration: We store which data streams you have enabled (finance, sports, RSS, fantasy) and their configuration settings.',
          'Yahoo Fantasy Data: If you connect your Yahoo Fantasy account, we store an encrypted refresh token (AES-256-GCM encryption) to maintain your connection. We also store your Yahoo user identifier, league data, standings, rosters, and matchup information that Yahoo provides through their API.',
          'Usage Data: We collect basic usage metrics including active SSE connection counts. We do not track individual page visits, browsing history, or behavioral analytics.',
        ],
      },
      {
        heading: 'How We Use Your Information',
        content: [
          'We use your information to provide and operate the Platform, including delivering real-time data to your browser extension and web dashboard, synchronizing your preferences across devices, and maintaining your third-party account connections.',
          'We do not sell, rent, or share your personal information with third parties for marketing purposes. We do not serve advertisements.',
        ],
      },
      {
        heading: 'Data Storage and Security',
        content: [
          'Your data is stored in a PostgreSQL database hosted on our self-hosted infrastructure (Coolify). Sensitive tokens (such as Yahoo OAuth refresh tokens) are encrypted at rest using AES-256-GCM encryption.',
          'Real-time data routing uses Redis for per-user pub/sub channels and caching. Redis data is ephemeral and not persisted long-term.',
          'We implement reasonable security measures to protect your information, but no method of transmission or storage is 100% secure.',
        ],
      },
      {
        heading: 'Third-Party Services',
        content: [
          'The Platform integrates with several third-party services. Each has its own privacy policy that we encourage you to review:',
          'Logto (authentication) handles your login credentials and identity verification. Finnhub provides financial market data. ESPN provides sports scores and game data. Yahoo provides fantasy sports data when you authorize your account. RSS feed publishers provide news content through their public feeds.',
          'We send your user identifier to our integration APIs via internal HTTP headers (X-User-Sub) to route data to your account. Third-party data providers do not receive your personal information directly from us.',
        ],
      },
      {
        heading: 'Data Retention',
        content: [
          'We retain your account information and preferences for as long as your account is active. RSS articles are automatically deleted after 7 days. Yahoo Fantasy data is refreshed on a sync cycle (default: every 120 seconds for active users).',
          'You may request deletion of your account and associated data by contacting us through our community channels.',
        ],
      },
      {
        heading: 'California Privacy Rights (CCPA)',
        content: [
          'If you are a California resident, you have the right to: know what personal information we collect about you; request deletion of your personal information; opt out of the sale of your personal information (we do not sell personal information); and not be discriminated against for exercising your privacy rights.',
          'To exercise any of these rights, please contact us through the channels listed at the bottom of this policy.',
        ],
      },
      {
        heading: 'Children\'s Privacy',
        content: [
          'The Platform is not directed to children under 13 years of age. We do not knowingly collect personal information from children under 13. If we learn that we have collected information from a child under 13, we will take steps to delete it promptly.',
        ],
      },
      {
        heading: 'Changes to This Policy',
        content: [
          'We may update this Privacy Policy from time to time. We will notify you of material changes by updating the "Last Updated" date at the top of this policy. Your continued use of the Platform after changes constitutes acceptance of the revised policy.',
        ],
      },
      {
        heading: 'Contact',
        content: [
          'For privacy-related inquiries, please reach out via our GitHub repository or community Discord server. Links to both are available on the Platform.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 3. COOKIE & STORAGE POLICY
  // ─────────────────────────────────────────────────────────────
  {
    slug: 'cookies',
    title: 'Cookie & Storage Policy',
    shortTitle: 'Cookies',
    icon: Cookie,
    category: 'data',
    lastUpdated: 'February 2026',
    effectiveDate: 'February 11, 2026',
    sections: [
      {
        heading: 'Overview',
        content: [
          'This policy explains how Scrollr uses cookies, browser storage, and similar technologies across the website and browser extension.',
        ],
      },
      {
        heading: 'Website Cookies',
        content: [
          'Authentication Cookies: We use cookies set by our authentication provider (Logto) to maintain your login session. These are essential cookies required for the Platform to function when you are signed in. They contain encrypted session tokens and expire when you sign out or after a defined session timeout.',
          'We do not use advertising cookies, tracking cookies, or analytics cookies. We do not use any third-party cookie-based tracking services.',
        ],
      },
      {
        heading: 'Browser Extension Storage',
        content: [
          'The Scrollr browser extension uses the browser\'s built-in extension storage API (browser.storage.local) to store the following data locally on your device:',
          'Authentication tokens: Your access token and refresh token for communicating with our API. Feed preferences: Your display settings (position, mode, behavior, visibility). Dashboard state: Cached dashboard data for faster loading. Connection state: SSE connection status and subscription information.',
          'This data is stored locally on your device and is not transmitted to third parties. It is only sent to Scrollr\'s API servers to authenticate requests and retrieve your personalized data.',
        ],
      },
      {
        heading: 'Server-Side Storage',
        content: [
          'Redis: We use Redis for ephemeral data including per-user pub/sub channels for real-time event routing, cached integration data, session state tokens for OAuth flows (10-minute TTL), and integration self-registration with 30-second TTL heartbeats. Redis data is not persisted to disk and is lost on service restart.',
          'PostgreSQL: Persistent data including your account preferences, stream configurations, and encrypted third-party tokens is stored in PostgreSQL. See our Privacy Policy for full details on data retention.',
        ],
      },
      {
        heading: 'Managing Storage',
        content: [
          'Website cookies: You can clear cookies through your browser settings. Note that clearing authentication cookies will sign you out of the Platform.',
          'Extension storage: You can clear extension data by removing and re-installing the extension, or through your browser\'s extension management page. You can also manage your preferences through the extension\'s settings panel or the web dashboard.',
          'Disabling cookies entirely may prevent you from using authenticated features of the Platform.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 4. FINANCIAL DATA DISCLAIMER
  // ─────────────────────────────────────────────────────────────
  {
    slug: 'financial',
    title: 'Financial Data Disclaimer',
    shortTitle: 'Financial',
    icon: TrendingUp,
    category: 'data',
    lastUpdated: 'February 2026',
    effectiveDate: 'February 11, 2026',
    sections: [
      {
        heading: 'Not Investment Advice',
        callout: {
          type: 'warning',
          text: 'Scrollr is NOT a registered broker-dealer, investment advisor, or financial institution. Nothing on this platform constitutes investment advice, financial advice, trading advice, or any other sort of professional advice. Do not make financial decisions based solely on information displayed by Scrollr.',
        },
        content: [
          'The financial data displayed through Scrollr, including stock prices, cryptocurrency values, price changes, and percentage movements, is provided for informational and entertainment purposes only. This data should not be relied upon as the sole basis for any investment, trading, or financial decision.',
        ],
      },
      {
        heading: 'Data Accuracy and Timeliness',
        content: [
          'Financial market data is sourced from Finnhub, a third-party data provider. While we strive to display accurate and timely information, we cannot guarantee that the data shown is accurate, complete, or current at any given moment.',
          'Data may be delayed, interrupted, or incorrect due to network latency, API rate limits, service outages, data provider errors, or other technical factors. Real-time data may not reflect the most recent market activity. Historical data, price changes, and percentage calculations are derived from the data we receive and may not match values from other sources.',
          'The "previous close" values and calculated price changes displayed are based on data provided by Finnhub and may differ from official exchange closing prices.',
        ],
      },
      {
        heading: 'No Broker-Dealer Relationship',
        content: [
          'Use of the Platform does not create a broker-dealer, investment advisor, fiduciary, or any other professional-client relationship between you and Scrollr, its maintainers, or its contributors.',
          'Scrollr does not execute trades, hold securities, manage portfolios, or provide personalized investment recommendations. The Platform is a data display tool, not a trading platform.',
        ],
      },
      {
        heading: 'Limitation of Liability',
        content: [
          'UNDER NO CIRCUMSTANCES SHALL SCROLLR, ITS MAINTAINERS, CONTRIBUTORS, OR DATA PROVIDERS BE LIABLE FOR ANY LOSSES, DAMAGES, OR EXPENSES ARISING FROM YOUR RELIANCE ON FINANCIAL DATA DISPLAYED THROUGH THE PLATFORM. THIS INCLUDES BUT IS NOT LIMITED TO TRADING LOSSES, LOST PROFITS, LOST OPPORTUNITIES, OR ANY OTHER FINANCIAL HARM.',
          'You acknowledge that financial markets carry inherent risk and that past performance does not indicate future results. You are solely responsible for your own investment decisions and should consult with a qualified financial advisor before making any investment.',
        ],
      },
      {
        heading: 'Cryptocurrency Disclaimer',
        content: [
          'Cryptocurrency data displayed through the Platform (sourced via Binance through Finnhub) is subject to high volatility and additional risks. Cryptocurrency markets operate 24/7 and prices can change rapidly. The data displayed may not reflect the most current prices across all exchanges.',
          'Cryptocurrency investments carry a high degree of risk, including the risk of total loss. We do not endorse or recommend any particular cryptocurrency.',
        ],
      },
      {
        heading: 'Third-Party Data Provider',
        content: [
          'Financial data is provided by Finnhub (finnhub.io). Finnhub\'s terms of service and data usage policies apply to the data we display. We are not responsible for the accuracy, availability, or completeness of data provided by Finnhub or any other third-party data source.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 5. THIRD-PARTY DATA & ATTRIBUTION
  // ─────────────────────────────────────────────────────────────
  {
    slug: 'third-party',
    title: 'Third-Party Data & Attribution',
    shortTitle: 'Third-Party',
    icon: Link2,
    category: 'data',
    lastUpdated: 'February 2026',
    effectiveDate: 'February 11, 2026',
    sections: [
      {
        heading: 'Overview',
        content: [
          'Scrollr aggregates data from multiple third-party sources to provide a unified information feed. We do not own the data displayed through these sources and provide it subject to the terms and conditions of each respective data provider.',
        ],
      },
      {
        heading: 'Financial Market Data — Finnhub',
        content: [
          'Real-time and historical market data is provided by Finnhub (finnhub.io). This includes stock prices, cryptocurrency prices, trade data, and derived calculations. Finnhub\'s data is sourced from various exchanges and data providers. Use of this data is subject to Finnhub\'s terms of service.',
          'We track approximately 50 symbols including 45 stocks and 5 cryptocurrency pairs. Data is received via WebSocket connection for real-time updates.',
        ],
      },
      {
        heading: 'Sports Data — ESPN',
        content: [
          'Live sports scores, game schedules, and team information are sourced from ESPN\'s publicly available APIs. This data covers NFL, NBA, NHL, MLB, College Football, Men\'s College Basketball, Women\'s College Basketball, and College Baseball. ESPN is a trademark of ESPN Inc. We are not affiliated with or endorsed by ESPN.',
          'Sports data is polled at regular intervals (approximately every 60 seconds) and may not reflect the absolute latest scores during live games.',
        ],
      },
      {
        heading: 'Fantasy Sports Data — Yahoo',
        content: [
          'Yahoo Fantasy Sports data is accessed through Yahoo\'s official API with explicit user authorization via OAuth 2.0. We only access fantasy sports data for users who have actively connected their Yahoo account. Yahoo and Yahoo Fantasy are trademarks of Yahoo Inc. We are not affiliated with or endorsed by Yahoo.',
          'Fantasy data includes league information, standings, matchups, and roster details. This data is synced periodically for active users.',
        ],
      },
      {
        heading: 'RSS News Feeds',
        content: [
          'News articles and content summaries are sourced from publicly available RSS, Atom, and JSON feeds published by various news organizations and content creators. We display article titles, summaries, publication dates, and links to the original source.',
          'We do not reproduce full article content. All RSS content links back to the original publisher. The inclusion of an RSS feed does not imply endorsement of or affiliation with the publisher. Feed publishers who wish to have their feed removed from our default catalog may contact us.',
          'We currently index over 100 default feeds across 8 categories. Articles are automatically removed from our database after 7 days.',
        ],
      },
      {
        heading: 'Accuracy Disclaimer',
        content: [
          'While we strive to display accurate and timely third-party data, we cannot guarantee the accuracy, completeness, or timeliness of any information provided through the Platform. Data may be delayed, interrupted, or contain errors due to factors outside our control.',
          'We are not responsible for any errors, omissions, or inaccuracies in third-party data, or for any actions taken based on such data.',
        ],
      },
      {
        heading: 'No Endorsement',
        content: [
          'The display of data from any third-party source does not constitute an endorsement of, sponsorship by, or affiliation with that source. All third-party trademarks, service marks, and logos are the property of their respective owners.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 6. BROWSER EXTENSION PRIVACY
  // ─────────────────────────────────────────────────────────────
  {
    slug: 'extension',
    title: 'Browser Extension Privacy',
    shortTitle: 'Extension',
    icon: Puzzle,
    category: 'data',
    lastUpdated: 'February 2026',
    effectiveDate: 'February 11, 2026',
    sections: [
      {
        heading: 'Overview',
        content: [
          'The Scrollr browser extension is available for Chrome and Firefox. This document describes exactly what the extension can and cannot access, how it communicates with our servers, and what data it stores on your device.',
        ],
      },
      {
        heading: 'What the Extension Can Access',
        content: [
          'The extension requests the following permissions: "storage" (to save your preferences and authentication tokens locally), "identity" (to handle the OAuth authentication flow), and "alarms" (for periodic background tasks like token refresh).',
          'The extension also has host permissions to communicate with our API server (api.myscrollr.relentnet.dev) and authentication server (auth.myscrollr.relentnet.dev). These are the only external servers the extension communicates with.',
        ],
      },
      {
        heading: 'What the Extension Cannot Access',
        content: [
          'The extension does NOT read the content of web pages you visit. It does NOT collect your browsing history. It does NOT monitor your keystrokes or form inputs. It does NOT inject advertisements. It does NOT access your bookmarks, downloads, or other browser data.',
          'The extension uses a Shadow Root to render its UI, which is a browser technology that creates an isolated DOM tree. This means the extension\'s interface is completely isolated from the web page content, and the web page cannot access the extension\'s internal state.',
        ],
      },
      {
        heading: 'Data Communication',
        content: [
          'The extension maintains a Server-Sent Events (SSE) connection to our API server to receive real-time data updates. This connection is authenticated using your access token.',
          'The extension uses a message-passing protocol between its background script and content scripts. Messages include: CDC (Change Data Capture) records for real-time updates, subscription management commands, connection and authentication status updates, and dashboard data snapshots.',
          'All communication between the extension and our servers is encrypted via HTTPS/TLS.',
        ],
      },
      {
        heading: 'Local Data Storage',
        content: [
          'The extension stores the following data locally using browser.storage.local: access and refresh tokens (for API authentication), user preferences (feed position, mode, behavior, visibility), dashboard cache (for faster initial loads), feed subscriptions (which data streams you are subscribed to), and connection state.',
          'This data never leaves your device except when sent to Scrollr\'s API servers for authentication and data retrieval. It is not shared with any third party.',
        ],
      },
      {
        heading: 'Permissions Justification',
        content: [
          '"storage": Required to persist your authentication tokens and preferences between browser sessions. "identity": Required to complete the OAuth 2.0 PKCE authentication flow for signing in. "alarms": Required for scheduling periodic token refresh and background maintenance tasks. Host permissions: Required to communicate with Scrollr\'s API and authentication servers.',
        ],
      },
      {
        heading: 'Uninstallation',
        content: [
          'When you uninstall the extension, all locally stored data (tokens, preferences, cache) is automatically deleted by the browser. No data persists on your device after uninstallation. Your server-side account data (preferences, stream configurations) remains on our servers and can be accessed if you reinstall the extension and sign in again.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 7. SUBSCRIPTION & BILLING TERMS
  // ─────────────────────────────────────────────────────────────
  {
    slug: 'billing',
    title: 'Subscription & Billing Terms',
    shortTitle: 'Billing',
    icon: CreditCard,
    category: 'commerce',
    lastUpdated: 'February 2026',
    effectiveDate: 'February 11, 2026',
    badge: 'Effective upon Uplink launch — Q3 2026',
    sections: [
      {
        heading: 'Overview',
        callout: {
          type: 'info',
          text: 'Uplink is currently in development and not yet available for purchase. These terms will become effective when Uplink launches, targeted for Q3 2026. Pricing and features are subject to change before launch.',
        },
        content: [
          'Uplink is the premium tier of the Scrollr platform, offering expanded limits, priority data refresh, and additional features. This document outlines the terms governing Uplink subscriptions.',
        ],
      },
      {
        heading: 'Pricing and Plans',
        content: [
          'Uplink is available in four pricing tiers: Monthly at $4.99 per month, Quarterly at $11.99 per quarter (billed every 3 months, approximately 20% savings), Annual at $39.99 per year (billed annually, approximately 33% savings), and Lifetime at $349.00 (one-time payment, permanent access, limited to 128 slots).',
          'All prices are in US Dollars (USD). Prices may be adjusted with notice to existing subscribers. Existing subscribers will be honored at their original rate for the remainder of their current billing period.',
        ],
      },
      {
        heading: 'Billing and Renewal',
        content: [
          'Monthly, Quarterly, and Annual subscriptions automatically renew at the end of each billing period unless cancelled before the renewal date. You will be charged the applicable subscription fee at the beginning of each billing period.',
          'Lifetime subscriptions are a one-time payment and do not renew. Lifetime access is valid for as long as the Scrollr platform operates.',
        ],
      },
      {
        heading: 'Cancellation',
        content: [
          'You may cancel your Monthly, Quarterly, or Annual subscription at any time through your account settings. Cancellation takes effect at the end of your current billing period. You will continue to have Uplink access until the end of the period you have already paid for.',
          'We do not offer pro-rated refunds for partial billing periods. For refund eligibility, see our Refund Policy.',
        ],
      },
      {
        heading: 'Payment Processing',
        content: [
          'Payments are processed through a third-party payment processor. We do not store your full credit card number, bank account details, or other payment credentials on our servers. All payment information is handled directly by our payment processor in accordance with PCI DSS standards.',
        ],
      },
      {
        heading: 'Free Tier',
        content: [
          'Scrollr offers a free tier with standard features and reasonable limits. The free tier is available indefinitely and is not a trial. You are not required to subscribe to Uplink to use the Platform.',
        ],
      },
      {
        heading: 'Changes to Pricing',
        content: [
          'We reserve the right to change Uplink pricing. If we increase pricing for an active subscription, we will provide at least 30 days notice before the change takes effect. You may cancel before the price change takes effect to avoid being charged the new rate.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 8. REFUND POLICY
  // ─────────────────────────────────────────────────────────────
  {
    slug: 'refunds',
    title: 'Refund Policy',
    shortTitle: 'Refunds',
    icon: RotateCcw,
    category: 'commerce',
    lastUpdated: 'February 2026',
    effectiveDate: 'February 11, 2026',
    badge: 'Effective upon Uplink launch — Q3 2026',
    sections: [
      {
        heading: 'Overview',
        callout: {
          type: 'info',
          text: 'This policy will become effective when Uplink launches, targeted for Q3 2026.',
        },
        content: [
          'We want you to be satisfied with your Uplink subscription. This policy outlines the circumstances under which refunds may be granted.',
        ],
      },
      {
        heading: 'Refund Window',
        content: [
          'Quarterly and Annual subscriptions: You may request a full refund within 7 days of your initial purchase or any renewal charge. Refund requests made after the 7-day window will not be honored.',
          'Lifetime subscriptions: You may request a full refund within 14 days of purchase, provided you have not extensively used Uplink features during that period.',
        ],
      },
      {
        heading: 'How to Request a Refund',
        content: [
          'To request a refund, contact us through our community channels (GitHub or Discord) with your account email and the reason for your request. We will process eligible refunds within 5-10 business days to your original payment method.',
        ],
      },
      {
        heading: 'Non-Refundable Circumstances',
        content: [
          'Refunds will not be granted for: requests made after the applicable refund window; dissatisfaction with third-party data accuracy (we do not control data from Finnhub, ESPN, Yahoo, or RSS publishers); temporary service outages or maintenance periods; or features that are clearly documented as not included in Uplink.',
        ],
      },
      {
        heading: 'Service Disruptions',
        content: [
          'In the event of a prolonged service outage (exceeding 72 consecutive hours) affecting Uplink features, we may, at our discretion, extend your subscription period or provide a pro-rated credit.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 9. OPEN SOURCE LICENSE
  // ─────────────────────────────────────────────────────────────
  {
    slug: 'license',
    title: 'Open Source License',
    shortTitle: 'License',
    icon: Scale,
    category: 'community',
    lastUpdated: 'February 2026',
    effectiveDate: 'February 11, 2026',
    sections: [
      {
        heading: 'License Summary',
        content: [
          'Scrollr is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). This is a copyleft open source license that ensures the software remains free and open.',
        ],
      },
      {
        heading: 'What This Means for Users',
        content: [
          'You are free to use the Scrollr platform without restriction. As a user of the hosted service at myscrollr.com, you are not required to do anything — just use the Platform as you normally would.',
          'The AGPL-3.0 license primarily affects those who modify and redistribute the source code, or who operate a modified version as a network service.',
        ],
      },
      {
        heading: 'What This Means for Developers',
        content: [
          'You are free to view, fork, and modify the Scrollr source code. If you modify the source code and distribute your modified version, or operate it as a network service (e.g., hosting your own instance), you must make your modified source code available under the same AGPL-3.0 license.',
          'You may not use the Scrollr source code in proprietary or closed-source projects that are distributed or operated as network services without complying with the AGPL-3.0 requirements.',
        ],
      },
      {
        heading: 'Key License Terms',
        content: [
          'Freedom to use: Run the software for any purpose. Freedom to study: Access and modify the source code. Freedom to share: Distribute copies of the original software. Freedom to contribute: Distribute your modified versions. Network use: If you run a modified version as a network service, you must make the modified source code available to users of that service.',
        ],
      },
      {
        heading: 'Full License Text',
        content: [
          'The complete AGPL-3.0 license text is available in the LICENSE file in our GitHub repository. For the official license text, visit: https://www.gnu.org/licenses/agpl-3.0.en.html',
        ],
      },
      {
        heading: 'Trademark Notice',
        content: [
          'The AGPL-3.0 license grants rights to the source code, not to the Scrollr name, logo, or branding. If you operate a modified version of Scrollr, you must use a different name and branding to avoid confusion.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 10. CONTRIBUTOR TERMS
  // ─────────────────────────────────────────────────────────────
  {
    slug: 'contributing',
    title: 'Contributor Terms',
    shortTitle: 'Contributing',
    icon: GitPullRequest,
    category: 'community',
    lastUpdated: 'February 2026',
    effectiveDate: 'February 11, 2026',
    sections: [
      {
        heading: 'Overview',
        content: [
          'Thank you for your interest in contributing to Scrollr. By submitting code, documentation, or other contributions ("Contributions") to the Scrollr project, you agree to the following terms.',
        ],
      },
      {
        heading: 'License Grant',
        content: [
          'By submitting a Contribution, you grant the Scrollr project maintainers a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, reproduce, modify, distribute, and sublicense your Contribution under the AGPL-3.0 license (or any compatible open source license the project may adopt in the future).',
          'You represent that you have the legal right to grant this license and that your Contribution does not infringe on any third-party rights.',
        ],
      },
      {
        heading: 'Original Work',
        content: [
          'You represent that each Contribution is your original work, or that you have obtained all necessary permissions from the copyright holder(s) to submit it under the AGPL-3.0 license.',
          'If your Contribution includes code or content from other open source projects, you must ensure compatibility with the AGPL-3.0 license and properly attribute the original source.',
        ],
      },
      {
        heading: 'Community Integrations',
        content: [
          'Scrollr\'s architecture supports community-built integrations. Integrations submitted to the project will be reviewed for security, quality, and compatibility before being accepted. Accepted integrations may be classified as "community" tier in the integration registry.',
          'Submitting an integration does not guarantee its acceptance. The project maintainers reserve the right to reject, modify, or remove any contribution at their discretion.',
        ],
      },
      {
        heading: 'Code of Conduct',
        content: [
          'All contributors are expected to conduct themselves professionally and respectfully. Harassment, discrimination, and abusive behavior will not be tolerated. Violations may result in your contributions being rejected and your access to project channels being revoked.',
        ],
      },
      {
        heading: 'No Compensation',
        content: [
          'Contributions are made voluntarily. You understand that you will not receive compensation for your Contributions unless a separate written agreement is established.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 11. ACCEPTABLE USE POLICY
  // ─────────────────────────────────────────────────────────────
  {
    slug: 'acceptable-use',
    title: 'Acceptable Use Policy',
    shortTitle: 'Acceptable Use',
    icon: ShieldAlert,
    category: 'compliance',
    lastUpdated: 'February 2026',
    effectiveDate: 'February 11, 2026',
    sections: [
      {
        heading: 'Overview',
        content: [
          'This Acceptable Use Policy ("AUP") governs your use of the Scrollr platform, including the website, browser extension, and API services. Violations of this policy may result in suspension or termination of your account.',
        ],
      },
      {
        heading: 'Prohibited Activities',
        content: [
          'You may not use the Platform to: scrape, crawl, or systematically download data from our APIs or website beyond normal personal use; redistribute, resell, or commercially exploit data obtained through the Platform; attempt to circumvent rate limits, authentication mechanisms, or access controls; interfere with or disrupt the Platform\'s infrastructure, including denial-of-service attacks; impersonate other users or misrepresent your identity; use the browser extension to inject malicious code, advertisements, or unauthorized content into web pages; access or attempt to access other users\' accounts or data; or use automated tools (bots, scripts) to interact with the Platform in ways not explicitly supported by our APIs.',
        ],
      },
      {
        heading: 'API Usage',
        content: [
          'The Scrollr API is intended for use by the official Scrollr website and browser extension. While the source code is open and you may operate your own instance, you may not use our hosted API endpoints (api.myscrollr.relentnet.dev) for unauthorized third-party applications without permission.',
          'Excessive API requests that degrade service for other users may be rate-limited or blocked.',
        ],
      },
      {
        heading: 'Extension Modifications',
        content: [
          'You may modify the Scrollr extension source code under the terms of the AGPL-3.0 license. However, modified extensions that connect to our hosted infrastructure must comply with this AUP. We reserve the right to block connections from modified clients that abuse our services.',
        ],
      },
      {
        heading: 'Content and Data',
        content: [
          'The data displayed through Scrollr originates from third-party sources. You may not represent this data as your own, remove attribution or source information, or use it in ways that violate the terms of the original data providers.',
        ],
      },
      {
        heading: 'Enforcement',
        content: [
          'We reserve the right to investigate and take appropriate action against anyone who, in our sole discretion, violates this AUP. Actions may include warning the violator, suspending or terminating their account, blocking their access to the Platform, and/or taking legal action if warranted.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 12. DMCA & COPYRIGHT
  // ─────────────────────────────────────────────────────────────
  {
    slug: 'dmca',
    title: 'DMCA & Copyright Policy',
    shortTitle: 'DMCA',
    icon: Copyright,
    category: 'compliance',
    lastUpdated: 'February 2026',
    effectiveDate: 'February 11, 2026',
    sections: [
      {
        heading: 'Overview',
        content: [
          'Scrollr respects the intellectual property rights of others and expects its users to do the same. This policy outlines the process for reporting and addressing copyright infringement claims in accordance with the Digital Millennium Copyright Act (DMCA).',
        ],
      },
      {
        heading: 'RSS Content and Fair Use',
        content: [
          'Scrollr aggregates publicly available RSS feeds and displays article titles, summaries, and publication dates with links back to the original source. We believe this constitutes fair use, as we display limited metadata to direct users to the original content rather than reproducing full articles.',
          'We do not store or display full article content. Articles are automatically removed from our database after 7 days.',
        ],
      },
      {
        heading: 'Filing a DMCA Takedown Notice',
        content: [
          'If you believe that content displayed through Scrollr infringes your copyright, you may submit a DMCA takedown notice containing the following information: identification of the copyrighted work claimed to be infringed; identification of the material that is claimed to be infringing, with sufficient information for us to locate it; your contact information (name, address, telephone number, and email); a statement that you have a good faith belief that use of the material is not authorized by the copyright owner; a statement, under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorized to act on behalf of the owner; and your physical or electronic signature.',
        ],
      },
      {
        heading: 'Counter-Notification',
        content: [
          'If you believe that content was removed in error, you may file a counter-notification including: identification of the material that was removed and its location before removal; a statement under penalty of perjury that you have a good faith belief that the material was removed by mistake or misidentification; your name, address, telephone number, and a statement consenting to jurisdiction; and your physical or electronic signature.',
        ],
      },
      {
        heading: 'Designated Agent',
        content: [
          'DMCA notices should be sent to the project maintainers via the contact methods listed on the Platform (GitHub or community channels). We will designate a formal DMCA agent and update this section with their contact information.',
        ],
      },
      {
        heading: 'Repeat Infringers',
        content: [
          'In accordance with the DMCA, we will terminate the accounts of users who are determined to be repeat infringers in appropriate circumstances.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 13. SECURITY POLICY
  // ─────────────────────────────────────────────────────────────
  {
    slug: 'security',
    title: 'Security Policy',
    shortTitle: 'Security',
    icon: Lock,
    category: 'compliance',
    lastUpdated: 'February 2026',
    effectiveDate: 'February 11, 2026',
    sections: [
      {
        heading: 'Our Security Practices',
        content: [
          'Scrollr takes the security of its platform and user data seriously. We implement multiple layers of security across our infrastructure:',
          'Encryption: All API communication is encrypted via HTTPS/TLS. Yahoo OAuth refresh tokens are encrypted at rest using AES-256-GCM with a 256-bit key. OAuth state parameters use Redis-backed CSRF tokens with a 10-minute TTL.',
          'Authentication: User authentication is handled by Logto, a self-hosted OIDC provider. Access tokens are validated using JWKS with automatic key rotation. The browser extension uses PKCE (Proof Key for Code Exchange) for its OAuth flow. Integration APIs never validate JWTs directly — they receive trusted user identity from the core API via internal HTTP headers.',
          'Infrastructure: The platform is deployed on self-hosted infrastructure (Coolify) with network isolation between services. Database connections use connection pooling with parameterized queries to prevent SQL injection.',
        ],
      },
      {
        heading: 'Responsible Disclosure',
        content: [
          'If you discover a security vulnerability in Scrollr, we appreciate your help in disclosing it to us responsibly. Please do NOT publicly disclose the vulnerability until we have had a chance to address it.',
          'To report a vulnerability, please contact us through our GitHub repository\'s security advisory feature, or reach out via our community Discord server with a private message to a maintainer.',
        ],
      },
      {
        heading: 'Scope',
        content: [
          'The following are in scope for security reports: the Scrollr web application (myscrollr.com), the Scrollr browser extension, the core API and integration APIs, authentication and authorization flows, and data storage and encryption implementations.',
          'The following are out of scope: third-party services we integrate with (Finnhub, ESPN, Yahoo, Logto itself), denial-of-service attacks, social engineering of Scrollr maintainers, and any testing against production systems without permission.',
        ],
      },
      {
        heading: 'Response Timeline',
        content: [
          'We aim to acknowledge security reports within 48 hours, provide an initial assessment within 5 business days, and develop and deploy fixes for confirmed vulnerabilities within 30 days, depending on severity.',
          'Critical vulnerabilities (authentication bypass, data exposure) will be prioritized and addressed as quickly as possible.',
        ],
      },
      {
        heading: 'Recognition',
        content: [
          'We appreciate the security research community. With your permission, we will acknowledge your contribution in our security advisories. We do not currently offer a bug bounty program, but we may establish one in the future.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 14. ACCESSIBILITY STATEMENT
  // ─────────────────────────────────────────────────────────────
  {
    slug: 'accessibility',
    title: 'Accessibility Statement',
    shortTitle: 'Accessibility',
    icon: Accessibility,
    category: 'compliance',
    lastUpdated: 'February 2026',
    effectiveDate: 'February 11, 2026',
    sections: [
      {
        heading: 'Our Commitment',
        content: [
          'Scrollr is committed to ensuring digital accessibility for people with disabilities. We are continually improving the user experience for everyone and applying relevant accessibility standards.',
        ],
      },
      {
        heading: 'Standards',
        content: [
          'We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA. These guidelines explain how to make web content more accessible to people with a wide range of disabilities, including visual, auditory, physical, speech, cognitive, language, learning, and neurological disabilities.',
        ],
      },
      {
        heading: 'Current Status',
        content: [
          'We recognize that our platform is in active development and may not yet fully meet all WCAG 2.1 AA criteria. Known areas for improvement include: ensuring all interactive elements have sufficient color contrast ratios, providing complete keyboard navigation support across all features, adding comprehensive ARIA labels to dynamic content (especially the real-time data feed), and ensuring screen reader compatibility with the browser extension\'s shadow root UI.',
        ],
      },
      {
        heading: 'Browser Extension',
        content: [
          'The Scrollr browser extension renders its UI within a Shadow Root DOM, which presents unique accessibility challenges. We are working to ensure that the extension\'s feed overlay is navigable via keyboard and compatible with screen readers.',
        ],
      },
      {
        heading: 'Feedback',
        content: [
          'We welcome your feedback on the accessibility of the Scrollr platform. If you encounter accessibility barriers, please let us know through our GitHub repository or community Discord server. We take accessibility feedback seriously and will work to address issues promptly.',
        ],
      },
      {
        heading: 'Continuous Improvement',
        content: [
          'Accessibility is an ongoing effort. As we develop new features and update existing ones, we will continue to evaluate and improve the accessibility of the Platform. We are committed to making Scrollr usable by as many people as possible.',
        ],
      },
    ],
  },
]

// ── Helpers ──────────────────────────────────────────────────────

export function getDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug)
}

export function getDocumentsByCategory(): Array<{
  category: string
  label: string
  docs: LegalDocument[]
}> {
  const order: Array<LegalDocument['category']> = [
    'core',
    'data',
    'commerce',
    'community',
    'compliance',
  ]
  return order
    .map((cat) => ({
      category: cat,
      label: CATEGORIES[cat],
      docs: LEGAL_DOCUMENTS.filter((d) => d.category === cat),
    }))
    .filter((g) => g.docs.length > 0)
}
