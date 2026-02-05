# Repository Guidelines

## Project Structure & Module Organization

The repository is divided into two main parts:

1. **Root (Marketing Site & Hub)**: A Vite + React app.
2. **`frontend_wxt/` (Chrome Extension)**: The Scrollr browser extension (WXT + React). See `frontend_wxt/AGENTS.md` for specific guidelines.

### Root (Marketing Site)

The Vite + React app lives in `src/`. `main.tsx` mounts the TanStack Router tree defined under `src/routes/`; add new feature routes there and keep loaders/components co-located. Shared UI sits in `src/components/` (one PascalCase component per file), while typed helpers belong to `src/content/`. Tailwind v4 layers are configured in `styles.css`; extend tokens there instead of editing generated CSS. `src/routeTree.gen.ts` is auto-generated, so never hand edit. Static assets go in `public/`, and build artifacts produced by Vite land in `dist/` (safe to delete).

## Build, Test, and Development Commands

- `npm run dev`: start the Vite dev server on port 3000 with HMR.
- `npm run build`: create a production bundle and run TypeScript checks.
- `npm run serve`: preview the latest production build locally.
- `npm run test`: execute the Vitest suite once in headless jsdom.
- `npm run lint`: apply the @tanstack/eslint-config rule set.
- `npm run format`: run Prettier; pass flags such as `npm run format -- --check src`.
- `npm run check`: run Prettier (write) and ESLint (fix); use before pushing.

## Coding Style & Naming Conventions

Write TypeScript + JSX with Prettier defaults (2 spaces, single quotes, trailing commas, no semicolons). Keep components, hooks, and providers in PascalCase files; route files follow TanStack patterns (`discussions.$slug.tsx` for dynamics). Use Tailwind utilities and motion primitives over inline styles, trim unused imports immediately, and prefer explicit prop typing when exporting shared components.

## Testing Guidelines

Use Vitest with Testing Library and the jsdom environment. Co-locate specs with their source (`Header.test.tsx`) and target observable behavior or loader output instead of implementation detail. New routes, shared UI, and content utilities should ship with coverage. Run `npm run test -- --watch` while iterating and ensure `npm run test` passes cleanly before opening a PR.

## Commit & Pull Request Guidelines

Commit messages mirror existing history: concise sentence-case summaries focused on intent. Group related changes and run `npm run check` prior to committing. Pull requests should describe the purpose, highlight notable UI/data updates, attach before/after screenshots for visual tweaks, and link relevant issues or discussions. Call out follow-up actions and wait for automated checks to finish before requesting review.

## Optional Extras

If you add configuration or secrets, document them via `.env.example` and never commit real credentials. Prefer environment-driven toggles to code branches so deployments stay identical across environments.
