# BasketWise — App Profile

Maintained knowledge for AI agents working in this repo (read automatically
by the Gemini CLI; injected into SchmittyWeather's Claude reviews). Verified
2026-07-14. Update this file when structural facts change.

## What this app is
Single-user/family grocery shopping assistant (PWA). Tracks an item catalog
with per-store prices (Flipp flyer ingestion), builds shopping lists, compares
basket cost across local stores (Food Basics, Metro, ...), and estimates
savings from active sales. No auth, no multi-tenant concerns.

## Stack (verified)
- **Vite + React 19, client-side rendered — no SSR.** `window`/`localStorage`
  access is safe without guards.
- Tailwind CSS 4 (via `@tailwindcss/vite`), lucide-react icons, motion for
  animation.
- **Express backend in `server.ts`** (run with `tsx` in dev; bundled by
  esbuild to `dist/server.cjs` for production). `api/index.ts` also exists —
  check which one actually serves a route before editing either.
- MongoDB (driver v7) for persistence; **offline-first**: IndexedDB via `idb`
  on the client (`src/lib/client/local-db.ts`, `offline-store-context.tsx`,
  `use-offline-store.ts`), synced to MongoDB (`src/lib/client/sync.ts`).
  List changes sync roughly every 10s while working; other updates ~60s.
- Gemini API (`@google/genai`) used server-side for Flipp flyer item
  splitting/matching (`src/lib/gemini-match-service.ts`).

## Layout
- Pages: `src/pages/Home.tsx` (tab container), `src/pages/Admin.tsx` (/admin,
  already desktop-friendly). Tabs in `src/pages/tabs/`: HomeTab, ListsTab,
  DealsTab, BasketsTab, ProfileTab.
- **Shopping list + savings logic: `src/pages/tabs/ListsTab.tsx`** — its
  `groupedByStore` computation already produces per-store totals and savings;
  reuse it, don't reimplement.
- Catalog UI: `src/components/CatalogDrawer.tsx`. Sync status:
  `src/components/SyncIndicator.tsx`.
- Shared types: `src/lib/types.ts`. Price rules: `src/lib/price-utils.ts`
  (expired-sale handling: a sale price only counts if `is_on_sale` and not
  expired per `valid_until`).

## Commands
- `npm run dev` — tsx server.ts (serves app + API)
- `npm run build` — vite build + esbuild server bundle (CI check)
- `npm run lint` — `tsc --noEmit` (typecheck; useful as a pipeline check)
- No test suite yet.

## Gotchas
- `db-storage/*.json` are **runtime data files** the app rewrites while
  running (especially `grocerylist-sync-meta.json`). Never treat their diffs
  as code changes; never commit them as part of a CR.
- Savings definition: per store, regular price minus sale price, only for
  items that have pricing AND an unexpired sale. Items without pricing are
  excluded from totals but still counted in the list.
- Owner preferences: iPhone-first (never regress mobile); side-by-side
  catalog+list on ≥1024px screens; landscape is the primary iPad mode;
  tap-to-toggle add/remove (no drag-and-drop); summary bars should be
  minimizable with state persisted in localStorage.

## SchmittyWeather pipeline notes
- CR work happens on `cr/<n>-<slug>` branches; agents must never commit,
  push, or switch branches themselves.
- Production deploys from GitHub main via Vercel (grocery-list-v2-navy).
