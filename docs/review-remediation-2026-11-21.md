# Review remediation and release checklist — 2026-11-21

This branch incorporates the previously separate weather and phrase fixes and addresses the cross-cutting [code review](code-review-2026-11-21.md). Changes stay in an unmerged pull request until all checks pass. **No deployed Supabase functions or user records have been altered by these commits.**

## Review findings

| Finding | Remediation | Evidence / status |
|---|---|---|
| F-01 Authenticated feed-proxy SSRF | Reject special-use/private address literals, internal/unsafe hostnames, nonstandard ports and credential-bearing URLs. Resolve A and AAAA in Undici's connection-time lookup; reject private answers and pin a validated IP to the socket. Recheck redirects and apply a total timeout. | `supabase/functions/feed-proxy/index.ts`, `safe-target.js`, regression tests. **Edge-runtime integration must be verified in a disposable Supabase project before deployment**; static and unit checks alone cannot establish deployability. |
| F-02 Sync event listener leaks | Stable handlers added on start and removed on stop. | `js/data/sync.js`. |
| F-03 Dashboard render races | Generation/revision guard, teardown on hide, error reporting, subscription and timer cleanup. | `js/ui/overview.js`. |
| F-04 Weather recomputation race | Reject old setting/location/revision results after asynchronous computation. | `js/weather/service.js`. |
| F-05 Wallpaper secrets/cache | Keys not additionally persisted in localStorage by default; URL preview credentials removed from browser address where supported; explicit snapshot-storage and clear controls. | `js/wallpaper/config.js`, `snapshot.js`, `main.js`, `wallpaper/project.json`. Existing Wallpaper Engine property values still remain in that product's own settings. |
| F-06 View teardown | Cleanup functions for Weather, Feed and Overview; stale async Feed data ignored. | `js/ui/mud.js`, `feed.js`, `overview.js`. |
| F-07 Weather CSS complexity | Final seven-day responsive overrides and visual/DOM guards; both shipped stylesheets kept identical. | `css/app.css`, `wallpaper/app.css`. **Remaining work:** a focused CSS extraction/consolidation is desirable; older declarations are intentionally left in place to avoid introducing a new layout regression during this combined release. |
| F-08 Overflow fitting | Reserve actual 'More' control dimensions; permit zero rows when a very small widget cannot fit one. | `js/widgets/fit.js`. |
| F-09 Bundle build hygiene | `npm run build:wallpaper` and `npm run verify` convenience scripts, exact generated parity in CI. | `package.json`, `tests/wallpaper.test.mjs`. |

## Feature behavior

- **Today's Loot:** deleted from the inventory and dashboard, including its algorithm and periodic timer. The previous `loot` widget ID remains solely to preserve customized layouts, now titled **Lost quests**.
- **Mobile weather:** forecast cards are real keyboard-accessible buttons in interactive dashboards and dispatch the selected ISO date; the Weather section opens the matching detail sheet on both initial mount and subsequent visits. Wallpaper cards are noninteractive.
- **Starter library items:** `Johnny the Homicidal Maniac` is an illustrated comic in Books/Comics; `Invader Zim` is an animated television series in Films & TV. Existing title matches are preserved. A per-account one-time marker prevents recreation after user deletion. Cover artwork is intentionally not auto-downloaded.
- **Animations:** comics/books show two page turns and albums show a grooved vinyl disc sliding out of a square sleeve. Films and games retain disc cases; reduced-motion settings disable the new motion.
- **Phrase lessons:** every Mandarin literal gloss has tone-marked pinyin; translation text respects the app's English/Spanish setting. The shorter dialogue reply is foregrounded; longer context is in the detail sheet.

## Contributor commands

Run `node --test` (or `npm test`) and `npm run build:wallpaper` after editing anything imported by `js/wallpaper/main.js`. Commit changes to **both** `wallpaper/wallpaper.js` and `wallpaper/app.css` after building; do not edit generated artifacts independently. Browser smoke is executed by `python tests/ui-regression.py` against a localhost HTTP server with local-only configuration.

## Manual release gates

1. At mobile widths (~320px, 390px and 650px), tap Now and a later weather day; confirm the corresponding detailed day's title/date and the return navigation.
2. Confirm one-time media additions, no duplicates on reopen, no respawn after deletion, and no change to existing media entries.
3. Check book/comic page turns, square vinyl art, film DVD behavior, and reduced motion.
4. Check both English and Spanish for phrase popovers, history and response.
5. Verify offline-to-online PWA cache migration and Wallpaper Engine startup with the new privacy controls.
6. **Do not deploy the modified feed proxy** without a disposable-project end-to-end test of normal RSS, redirects, DNS rebinding/private ranges, timeouts and denial handling. Browser/Node tests cannot replace a network-boundary security audit.

The snapshot access key is revocable through Tracker settings; clearing a local cache does not revoke any existing database key.
