# React Port Parity Checklist

This checklist tracks the remaining Solid-owned behaviors and user-visible component surfaces that the React runtime under `apps/app/src/react-app` and `apps/app/src/react` must either match or deliberately replace before the Solid tree can be deleted.

The React entry (`apps/app/src/index.react.tsx`) is the shipped runtime. It imports nothing from the Solid tree in `apps/app/src/app/**` except framework-agnostic modules in `app/lib/*`, `app/theme.ts`, `app/utils/*`, `app/constants.ts`, `app/types.ts`, and `app/session/composer-tools.ts`. Everything else in `app/` is legacy.

## 1. Shell and bootstrap
- [x] React root mounts `AppRoot` via `index.react.tsx` with Tanstack Query + Router
- [x] Theme bootstrap (`bootstrapTheme()`) and locale init (`initLocale()`)
- [x] Tauri deep link bridge started pre-render
- [x] HashRouter inside Tauri, BrowserRouter in web
- [x] Deep link event handling for `openwork://connect` invites
- [ ] Status toast host (Solid: `app/shell/status-toasts.tsx`) — React has no equivalent; the store exposes `errorBanner` only
- [ ] Top-right notifications (Solid: `app/shell/top-right-notifications.tsx`) — not yet in React
- [ ] Route-sync for settings tab from URL (Solid: `app/shell/route-sync.ts`) — React uses `useSearchParams` inline in settings screen instead, acceptable
- [ ] Updater orchestration + ready-to-restart UX (Solid: `app/context/updater.ts`) — React `updates-settings.react.tsx` handles this locally

## 2. Workspace and session sidebar
- [x] Workspaces list + active workspace selection
- [x] Worker profile list with connect/remove
- [x] Session tree with parent/child rendering
- [x] Session status pills, descendant counts, last-updated timestamps
- [x] New-session action and delete session inline
- [x] Expand/collapse workspace groups
- [ ] Rename workspace modal (Solid: `app/components/rename-workspace-modal.tsx`) — React has no rename flow yet
- [ ] Share workspace modal (Solid: `app/workspace/share-workspace-modal.tsx`) — React has no share flow yet
- [ ] Workspace recovery action (Solid: `recoverWorkspace`) — partially covered by settings Recovery tab

## 3. Session surface
- [x] React `SessionSurface` with streaming transcript, composer, tool calls
- [x] Composer: skills, MCP, slash commands, agents, models, attachments
- [x] File mention search via `workspaceClient.find.files`
- [x] Shell mode, compact command shortcut
- [x] Question and permission sheets
- [x] Empty-state and missing-session redirects
- [x] Earlier message loading controls
- [ ] Inline todo list (Solid: session todos in `pages/session.tsx`) — React `chat-panel.tsx` already renders it
- [ ] Rename session modal (Solid: `rename-session-modal.tsx`) — React has inline title input (acceptable alt)
- [ ] Session error surface (Solid: session error turns) — partially rendered through transcript

## 4. Settings surface
- [x] React `SettingsScreen` with tabs: general, advanced, appearance, updates, recovery, cloud, skills, extensions, automations, messaging, debug
- [x] Appearance: theme mode + titlebar
- [x] Updates: Tauri updater check/download/restart
- [x] Recovery: reset state, clear cache, cleanup containers
- [x] Tab routing via `?tab=<id>`
- [ ] MCP add/remove flows (Solid: `add-mcp-modal.tsx`, `mcp-auth-modal.tsx`) — React shows MCP list but add/auth modal parity is missing
- [ ] Bundle import/start modals (Solid: `app/bundles/*-modal.tsx`) — not yet in React
- [ ] Provider auth modal (Solid: `app/context/providers/provider-auth-modal.tsx`) — not yet in React
- [ ] Reset modal with typed confirm (Solid: `reset-modal.tsx`) — React Recovery tab uses plain buttons

## 5. Modals and dialogs
- [x] Create workspace dialog (React: `workspace/create-workspace-dialog.tsx`)
- [ ] Create remote workspace (Solid: `create-remote-workspace-modal.tsx`) — React has a simplified variant in the same dialog
- [ ] Share workspace modal (access + template panels)
- [ ] Model picker modal (Solid: `model-picker-modal.tsx`) — React composer uses inline picker
- [ ] Confirm modal primitive (Solid: `confirm-modal.tsx`) — React has no shared primitive
- [ ] Skill destination modal (Solid: `bundles/skill-destination-modal.tsx`)
- [ ] Bundle import + start modals
- [ ] Rename workspace + rename session modals

## 6. Connections
- [ ] Connections provider + modals (Solid: `app/connections/*`) — React side uses the store directly
- [x] OpenWork server connect/disconnect via store actions
- [x] Remote worker profiles and connect flow

## 7. Styling and visual parity
- [x] Uses same Tailwind utility system + OpenWork class tokens (`ow-soft-shell`, `ow-button-*`, `ow-status-pill-*`, `ow-kicker`, etc.)
- [x] Shared `styles.css` with same tokens
- [ ] Transcript polish (scroll-to-bottom, sticky follow-latest, search highlight) — React `SessionSurface` has basic controls only
- [ ] Settings sidebar visual density — React uses Tabs; Solid uses left rail layout (accepted visual change)

## 8. Deletable Solid surfaces after parity is met
All the following can be removed once parity items above are closed:
- `apps/app/src/index.tsx`
- `apps/app/src/app/app.tsx`, `entry.tsx`, `system-state.ts`
- `apps/app/src/app/pages/**`
- `apps/app/src/app/components/**` (except behaviors already relocated)
- `apps/app/src/app/shell/*` except shared utilities if any
- `apps/app/src/app/workspace/*`
- `apps/app/src/app/connections/*`
- `apps/app/src/app/context/*`
- `apps/app/src/app/automations/*`, `bundles/*` (except `bundles/apply.ts` if used), `cloud/*`, `data/*`, `extensions/*`
- `apps/app/src/app/app-settings/*`
- `apps/app/src/app/session/{actions-*,draft-store,react-session-*,share-workspace,run-state}.ts(x)`
- `apps/app/src/react/island.tsx`, `apps/app/src/react/feature-flag.ts`
- `apps/app/src/react/settings/legacy-settings-screen.react.tsx`
- `apps/app/src/react-app/session/session-rail.tsx` and `part-renderer.tsx` (unused by shipped shell)
- `apps/app/src/react-app/workspace/workspace-rail.tsx` (replaced by unified sidebar)
- `apps/app/src/solid-devtools-dev.ts`
- `apps/app/src/app/index.css` (only used by the Solid entry)

## 9. Keep after cut
Modules that the React runtime depends on and are framework-agnostic:
- `apps/app/src/app/constants.ts`
- `apps/app/src/app/mcp.ts` (referenced by tsconfig and shared)
- `apps/app/src/app/theme.ts`
- `apps/app/src/app/types.ts`
- `apps/app/src/app/utils/index.ts`
- `apps/app/src/app/lib/**`
- `apps/app/src/app/session/composer-tools.ts`
- `apps/app/src/i18n/**`

These stay outside `src/react-app/` because they are also usable from scripts and tests, and they do not depend on React.

## 10. Validation gates
- `pnpm --filter @openwork/app typecheck` passes
- `pnpm --filter @openwork/app build` passes
- Dev shell boots against a local OpenWork server and a session can be opened
- Settings tabs all render without console errors
- No imports remain from the deleted Solid modules
