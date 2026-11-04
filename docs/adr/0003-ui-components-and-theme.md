# 0003. UI components and theme

Date: 2026-11-04
Status: Accepted

## Context

The desktop app needs a component set for chat, approvals, activity logs, forms and charts, with a calm black and white look.

## Decision

- **beUI** provides the components. It has ready-made agent pieces (`approval-card`, `agent-activity`, `message-bubble`) that match the product. It is MIT licensed and has no runtime package: source is copied into `packages/ui` through the shadcn CLI, so the code is ours.
- **`packages/ui` holds the vendored sources and the theme.** `components.json` there registers the `@beui` namespace. beUI files import each other through the `@/` alias, which points at `packages/ui/src` in the renderer Vite config and TypeScript paths.
- **Tailwind CSS 4 and Motion** are required by beUI.
- **Theme:** shadcn semantic tokens in `packages/ui/src/styles.css`, built on `#0A0A0A`, `#242424` and `#FFFFFF`, with light and dark variants. In the dark theme the sidebar is `#0A0A0A` and the main area is `#242424`; raised surfaces and borders use lighter steps (`#303030`, `#3A3A3A`) so they stay visible.
- **Font:** Google Sans (OFL), self-hosted through Fontsource. It covers Latin, Cyrillic and Georgian in one family, which DM Sans and Onest do not.
- **Custom title bar:** the native frame is hidden and the OS draws the window controls through `titleBarOverlay`. The renderer tells main the theme through the `setTheme` bridge method so the controls match.

## Consequences

- Vendored sources are not strict enough for our base TypeScript settings. `packages/ui` and `apps/desktop/tsconfig.web.json` relax `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and the unused checks, and use bundler resolution. `main`, `preload` and all other packages keep the strict settings.
- We changed beUI sources in two places: the import in `text-shimmer.tsx`, which the CLI rewrote to the file itself, and the approval card status colors and label. Reinstalling a component overwrites such changes.
- `AnimatedSidebarMenu` clones its direct children, so wrapping menu items in a fragment breaks it.
- `assetsInlineLimit: 0` keeps fonts as files, so the page CSP does not need to allow `data:`.
- Every Google Sans script subset ships with the app (about 2 MB). Trim to the needed subsets if size matters.
- Screens use placeholder content from `renderer/src/sampleData.ts` until the CRM and agent APIs exist.
