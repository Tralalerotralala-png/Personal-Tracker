# Personal Tracker — repository-wide code review
**Date:** 2026-11-21
**Base reviewed:** main at `7a1dc855b1e12510c8598eb73f0c623dda4f7382`
**Companion fix:** PR #56 (`fix/weather-seven-day-centered-2026-11-21`)
**Review type:** source-level cross-cutting review with existing GitHub Actions results, not a penetration test or a claim that every runtime behavior was exercised.

## Executive summary
The tracker has a surprisingly broad set of protective mechanisms for an offline-first single-owner PWA: an account-bound local database, server-side restrictive owner policies, soft deletes, sync conflict recovery, portable archive integrity checks, encrypted Logs, an offline shell, and a separate Wallpaper Engine build. Existing automated tests include Node, browser smoke, owner-RLS, and real Auth-issued JWT scenarios.

The confirmed seven-day visual bug came from `js/widgets/registry.js` rendering only **six** future days while `css/app.css` reserved **seven** columns. PR #56 renders seven when present, uses the actual count when fewer arrive, centers incomplete wrapped rows at narrow widget widths, syncs the generated wallpaper sources, bumps the PWA cache version, and adds regression checks.

I found **one security-hardening priority**, **several reproducible lifecycle/race risks**, and **testing/maintenance gaps**. These are recommendations; unless expressly marked as a demonstrated source-level defect, do not treat them as proven production incidents.

## Findings by severity

### F-01 — High-priority hardening: DNS-based SSRF exposure in the feed proxy
- **Where:** `supabase/functions/feed-proxy/index.ts`, approximately lines 25–40 and 57–80.
- **Evidence:** `blockedHost()` filters localhost, some private IP literals, and known internal hostname suffixes. It **does not resolve DNS** to determine whether an apparently public hostname points to a private/link-local address; the source comments acknowledge this. Each redirect target is hostname-checked but is fetched with the same unverified DNS resolution.
- **Exposure:** A signed-in owner or a compromised authorized session can make the function request private/internal endpoints through DNS rebinding or a malicious feed host, depending on the Supabase Edge runtime network boundary. This is **not** an unauthenticated open proxy: `auth.getUser` and `tracker_account_allowed` are enforced.
- **Fix:** Reject prohibited resolved addresses for both IPv4 and IPv6, including IPv4-mapped IPv6; apply the check at every redirect and enforce it at the network connection boundary to avoid DNS time-of-check/time-of-use attacks. Prefer a restricted outbound proxy / allowlist where feasible. Consider blocking nonstandard ports and add a request-level budget.
- **Regression tests:** public hostname resolving to `127.0.0.1` / `169.254.169.254` / `::1`, DNS rebinding between validation and connect, redirect to an internal service, credential-bearing URL, max redirects, oversized feed and timeout.
- **Confidence:** high in the missing enforcement, environment-dependent exploitability.

### F-02 — Medium: repeated start/stop of sync leaves event listeners registered
- **Where:** `js/data/sync.js`, lines 227–247.
- **Evidence:** `start()` adds anonymous `online`, `offline`, and `visibilitychange` listeners. `stop()` clears the interval and kick timer, but cannot remove those listeners.
- **Effect:** Repeated `start() → stop() → start()` installs duplicates. Old offline callbacks may still change status after stopping, and visibility/online events trigger redundant work.
- **Fix:** Use named listeners created once per sync instance and remove them in `stop()`, or bind an `AbortController` signal for the group. Retain idempotent `start()`.
- **Regression tests:** start/stop twice then dispatch online/offline/visibility events; assert one callback while running and none after stop.
- **Confidence:** high, source-level lifecycle defect.

### F-03 — Medium: concurrent overview renders are not invalidated
- **Where:** `js/ui/overview.js`, lines 20–42, 44–51 and 62–68.
- **Evidence:** `render()` awaits `loadLayout()`, then clears all existing cards and installs a new grid. Calls from breakpoint changes, layout writes, mount, and show can overlap without a generation token.
- **Effect:** When an older layout read resolves after a newer one, its stale render may replace the correct grid. The async observer callback also does not handle a rejected `render()` promise.
- **Fix:** Increment a render revision on each render/hide, check it immediately after each `await`, and catch/report failed renders. Tear down the superseded cards only when committing the newest revision.
- **Regression tests:** resolve two mocked layout loads in reverse order while switching between desktop/mobile; assert last-request-wins.
- **Confidence:** high for potential race, not observed in a live user session.

### F-04 — Medium: weather recomputation can apply stale results during a place or setting change
- **Where:** `js/weather/service.js`, lines 133–140, 151–167.
- **Evidence:** `refresh()` is guarded by `placeVersion`; `recompute()` reads a place/cache and awaits `compute()`, then calls `set()` without repeating a version/place check. Every settings-table change schedules `recompute()` without sequencing or cancellation.
- **Effect:** A slower recompute can publish results for a previous location or old tuning after newer state has been requested.
- **Fix:** Capture `placeVersion`, place key, and a recompute sequence; recheck before `set()`. Debounce or coalesce settings-derived recomputes.
- **Regression tests:** delay one `compute()` while changing location or weights; assert an older result cannot overwrite the latest.
- **Confidence:** high for possible stale write, depends on timing.

### F-05 — Medium: Wallpaper bearer key and snapshot persist in client-side storage
- **Where:** `js/wallpaper/config.js`, lines 43–63; `js/wallpaper/snapshot.js`, lines 78–89; `docs/security-audit.md`.
- **Evidence:** The revocable wallpaper access key is accepted from URL query/hash parameters and `saveConfig()` persists its value in `localStorage`; `saveCachedSnapshot()` persists a summary containing personal items, locations and events as JSON. The project itself acknowledges that browser-profile access is not encrypted.
- **Effect:** Someone with access to the desktop's browser/Wallpaper Engine profile may read cached records and key material. Query-string keys are also captured in history and can be copied accidentally.
- **Fix:** Prefer Wallpaper Engine properties to URL-delivered keys; strip credentials from the address once parsed; add an explicit clear-cache/revoke flow, device-shared warning, and an option not to retain sensitive wallpaper data on disk. Keep the SQL-side key revocation.
- **Confidence:** confirmed storage design; impact depends on local device threat model.

### F-06 — Medium/low: views register recurring work without a teardown path
- **Where:** `js/ui/mud.js`, lines 296–304; `js/ui/feed.js`, lines 25–27 and 96–101; `js/ui/overview.js`, lines 45–60.
- **Evidence:** `weather.subscribe(render)`, `feed.subscribe(render)`, several `store.subscribe()` calls, and one-minute/thirty-second intervals are created, while the view objects expose `hide()` but no `destroy()` or explicit unsubscribe.
- **Effect:** Currently these may be singleton views, so the practical effect can be minor. If views are recreated after route/login changes or in tests, callbacks can accumulate or update detached elements.
- **Fix:** Standardize view contracts with `destroy()` and retain/call subscription removers; clear timers and window event listeners.
- **Regression tests:** mount/destroy/remount a view; assert subscriber counts and timers return to baseline.
- **Confidence:** high as a lifecycle gap; currently observed leak severity unverified.

### F-07 — Low/medium: forecast and other widget CSS is spread across overlapping overrides
- **Where:** `css/app.css`, approximately lines 875, 1408–1458, 1516–1549, 1930–1946, 2253–2304 and 2395+.
- **Evidence:** Multiple later `.w-forecast-cards` declarations override width, height, layout mode, responsiveness and fixed column count; this is the direct context of PR #56's missing-card bug. The CSS file is ~171 KB and duplicated in `wallpaper/app.css`.
- **Effect:** Visually correct changes can regress at another size or only in the wallpaper copy.
- **Fix:** Consolidate forecast widget styling into one component section with explicit compact/wide/narrow rules, preferably extract component-specific CSS and let the build script create the wallpaper copy. Retain CSS order/specificity regression tests.
- **Regression tests:** screenshots at 320, 390, 650, 900 and 1270px; 1, 3, 6 and 7 forecast rows; short/tall widget cards; Wallpaper Engine.
- **Confidence:** high, maintainability risk confirmed.

### F-08 — Low: fit calculation measures the overflow control but omits it from initial budget
- **Where:** `js/widgets/fit.js`, lines 46–79, especially line 58.
- **Evidence:** `moreSize` is measured and then unused while `used` starts from `fixed + gap * 2`. The post-layout overflow loop only trims when more than one row is visible.
- **Effect:** Compact calendar/sky widgets may briefly overestimate available vertical space or leave an overflow control cramped at the minimum size.
- **Fix:** Reserve the real overflow control height during the initial fit pass; allow the single-row case to show a deliberate `More` fallback rather than clipping.
- **Regression tests:** small 1- and 2-grid-row widgets at increased font sizes and zoom, checking `scrollHeight <= clientHeight` when scrolling is disabled.
- **Confidence:** high for unused variable, medium for observed UI impact.

### F-09 — Low: generated artifact coupling needs explicit developer guardrails
- **Where:** `scripts/build-wallpaper.mjs`, `wallpaper/wallpaper.js`, `wallpaper/app.css`, `.github/workflows/verify.yml`.
- **Evidence:** Wallpaper JS and CSS are checked-in generated output. The script rebuilds both; tests ensure exact parity. This is a good protection, but contributors must remember to regenerate artifacts or the first CI attempt fails.
- **Fix:** Add a contributor note and a `npm run build:wallpaper` convenience script; optionally make the CI mismatch output point at source regeneration instructions.
- **Confidence:** high, process issue, currently mitigated by CI.

## Coverage by subsystem
| Subsystem | Review observations | Suggested follow-up |
| --- | --- | --- |
| Overview and layout editor | Pure grid placement functions and keyboard/pointer editing exist. Render concurrency and lifecycle need stronger guarantees. | Test overlapping rerenders and destroy cycles. |
| Weather and celestial | Open-Meteo daily window is seven days and missing UV stays missing. Weather render discrepancy fixed in PR #56; stale recomputation remains to test. | Browser layout matrix, timezone boundaries and delayed response races. |
| Feed/social readers | URLs normalized; RSS text is stripped before being inserted as text nodes. Edge proxy is authenticated but lacks safe DNS resolution enforcement. | Edge integration and SSRF tests. |
| Data storage and sync | IndexedDB transactions pair rows/outbox markers. Conflict copies and server-owner checks exist. Sync event lifecycle needs cleanup. | Device switching, offline edits and reconnect stress tests. |
| Supabase database/Auth | Restrictive owner policy scripts and tests using actual Auth-issued tokens exist; no public data policy weakening identified in inspected scripts. | Repeat migration/RLS tests against the actual deployment before sensitive use. |
| Photos/game backups/archive | Upload retry and readback paths exist; TAR imports enforce path limits, SHA-256 integrity and account binding. | Power loss and quota-exhaustion/partial-restore end-to-end tests. |
| Encrypted Logs | AES-GCM with PBKDF2 (600k iterations), random IV and associated record identity are implemented; old 4-digit PIN support is legacy only. | Independent cryptographic review, recovery and wrong-passphrase scenarios. |
| Wallpaper Engine | Read-only snapshot, revocable key and parity build checks are present; local credential/snapshot persistence deserves explicit threat-model UX. | Clear data controls; visual smoke test after every widget change. |
| Offline/PWA | Service worker avoids caching Authorization requests and treats app JS/CSS as network-first. PR #56 bumps version for installed clients. | Verify old-version update offline→online and multi-tab cache transition. |
| UI/accessibility | Many labels, roles, dialogs and reduced-motion rules exist. Reflowed forecast must be keyboard- and zoom-tested even though cards are read-only. | Audited accessibility/zoom pass with real browser screenshots. |
| Build/CI | Node tests, syntax checks, generated wallpaper verification, browser smoke, PostgreSQL policies and Auth-issued JWT tests exist. | Add Edge Functions integration, browser screenshots for weather, and negative/error-path matrices. |

## Proposed order of future changes
1. **Security boundary:** F-01 (feed proxy private-network DNS restrictions) and negative integration tests.
2. **Data correctness:** F-04 (weather recompute sequencing) and F-03 (overview async render races).
3. **Lifecycle:** F-02 (sync event listener teardown), then F-06 (view teardown standardization).
4. **Privacy:** F-05 wallpaper key/cached snapshot controls.
5. **Maintainability and responsive polish:** F-07/08/09, browser visual baseline across widths and zoom.

## Verification and limits
- The original PR #56 run `44902039025` passed all four GitHub Actions jobs, including browser smoke, syntax/Node, auth-issuer and database policy. Subsequent commits that center narrow wrapped rows require their own CI verification.
- The code review was performed using the connected repository contents, its tests, CSS, generated wallpaper artifacts, SQL policies, service worker and Edge Function implementations.
- There was no live exploit attempt, no inspection of production Supabase credentials/data and no full manual visual check of the supplied screenshot's exact browser dimensions. Security findings describe code-level exposures, **not confirmed compromise**.
- The report is intentionally kept separate from PR #56's narrow production fix; do not merge broad behavioral changes without targeted tests.
