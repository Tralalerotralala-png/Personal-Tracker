# Design Specification

Architecture and visual specification for Personal Tracker.

## 1. Visual System

- **Aesthetic:** Tactile pixel-craft interface with notched polygon corners (`--notch: 3px`), stepped pixel-depth SVG icons, subtle top-bevel highlights, and low-elevation drop shadows.
- **Color Architecture:** All surfaces derive from semantic CSS custom properties (`--bg`, `--panel`, `--panel-2`, `--edge`, `--edge-hi`, `--ink`, `--ink-dim`, `--accent`, `--accent-ink`, `--ok`, `--warn`, `--danger`) with automatic contrast calculation for `--accent-ink` and `data-color-mode` (`dark` / `light`).
- **Themes:** Curated dark and light presets (including *Classic*, *Obsidian Gold*, *Matcha Studio*, *Solarized Slate*, *Velvet Noir*, *Vault Terminal*, *Midnight Observatory*, *Paper Archive*) plus per-token customization and up to 30 saved palettes.
- **Motion & Accessibility:** All transitions and ambient effects respect `prefers-reduced-motion` and the in-app `reduce_animations` flag. Numeric metrics use `tabular-nums`; keyboard focus uses inset rings compatible with clipped surfaces.

## 2. Unified 24-Hour Weather Clock

Weather, ground mud modeling, UV index, and Calendar scheduling share one color-coded 24-hour visual grammar (`js/ui/clock-ribbon.js`, `js/ui/weather-clock.js`):

| Condition | Hex | Criteria |
| --- | --- | --- |
| Clear night | `#334573` | Outside local sunrise/sunset without precipitation |
| Clear sun | `#e8c55a` | Daytime clear sky (`UV < 6`) |
| High UV sun | `#f0873a` | Daytime clear/mild sky (`UV >= 6`) |
| Partly cloudy | `#78b8a8` | Partly cloudy sky (`cloud_cover >= 40%`) |
| Cloudy / fog | `#8391a4` | Overcast or fog (`cloud_cover >= 80%`) |
| Rain | `#4c9be8` | Rain/drizzle WMO codes, `>= 0.2 mm`, or `>= 55%` probability |
| Snow / freeze | `#b5e7ff` | Snow WMO codes or freezing precipitation (`<= 0°C`) |
| Storm / heavy | `#9966f0` | Thunderstorm WMO codes or heavy rain (`>= 3.0 mm/h`) |

**Surfaces:**
- **Calendar Month Grid:** Each forecast day renders a 24-segment horizontal ribbon (switchable across *Sky 24h*, *UV*, and *Rain/Mud* lenses), live current-hour marker on Today, mud dot, Peak UV pip, and daily high temperature.
- **Overview & Wallpaper Widgets:** Both the Weather widget (`wd-mud`) and Calendar agenda widget (`wd-calendar`) render compact 24-hour ribbons; Calendar widget ribbons mark scheduled event hours. The Weather widget's analog clock (`analogClockSvg`) renders the next 12 color-coded hours as a high-contrast outer bezel aligned to the place's timezone, with an automatic daily summary fallback before hourly data arrives.
- **7-Day Forecast & Day Sheets:** Each 7-day forecast card includes the 24-hour ribbon. Opening any day in Calendar or Weather displays an interactive **Radial 24-Hour Weather Clock** (sun-arc orientation: `12h` top, `00h` bottom) with outer weather ring, inner UV arc, center mud/UV readout, and timed Calendar events pinned to their start hour.

## 3. Layout & Widget Grid

- **Shell:** Adaptive layout with persistent desktop navigation rail (resizable/collapsible) and mobile bottom hotbar, sticky header with `Ctrl+K` command palette, Quick Capture (`+`), sync status pill, and Settings.
- **Overview Grid:** Independent desktop (12-column) and mobile widget layouts stored in `widget_layout`, with a live daily briefing strip above the grid.
- **Wallpaper Engine Bundle:** `scripts/build-wallpaper.mjs` compiles `js/wallpaper/main.js` and its dependencies into a single classic script (`wallpaper/wallpaper.js`, capped under 375 KiB raw) with LF line endings and mirrors `css/app.css` to `wallpaper/app.css`.

## 4. Data, Offline & Security Model

- **Offline-First Storage:** Browser IndexedDB holds structured records, outbox markers, and local media caches; a service worker (`sw.js`) precaches the application shell for offline boot.
- **Optional Cloud Sync:** Supabase provides email-OTP authentication, single-owner restrictive Row Level Security (`tracker_account_allowed()`), private Storage buckets, and revocable read-only wallpaper snapshots (`wallpaper_snapshot`).
- **Encryption Boundaries:** General IndexedDB data and JSON/TAR exports are not encrypted at rest. The private Logs journal encrypts individual entries client-side using AES-GCM with PBKDF2-derived keys (no passphrase recovery).
