# Scrollr

Scrollr is a Chrome extension that pins a customizable ticker on top of any tab (or casted TV) so people can keep fantasy scores, wagers, stocks, crypto, or RSS updates in view without switching context. This repo powers the marketing site and knowledge base.

## Features

- **Floating Ticker:** A persistent overlay that sits on top of any website
- **Live Data:** Curated feeds for sports (NFL, NBA, MLB, NHL), finance (Stocks, Crypto), and custom RSS links
- **Precision Style:** High-contrast terminal aesthetic with pulse lime accents

## Project Structure

```text
src/
├── components/        // UI components (Header, Footer, Scrollr widgets)
├── hooks/             // React hooks for data
├── lib/               // Core logic and utilities
├── routes/            // Page routes (TanStack Router)
└── styles.css         // Tailwind and design tokens
```

## Local Development

1.  **Clone the repo**
2.  **Install dependencies**: `npm install`
3.  **Start dev server**: `npm run dev` (Site runs on port 3000)

## Integration & Extensions

Scrollr is designed to be extensible. Each "card" in the ticker is a React component that can be powered by any data source.
