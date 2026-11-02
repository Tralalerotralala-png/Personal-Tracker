# Search, Settings & Clock Upgrade

Changes:
- Sticky global search field in the top app header, across all tabs. Results include Pack items, places, events, tasks, notes, and expenses.
- Removed the Overview greeting. Overview's daily status summary remains below the app header.
- Settings organized into five sections: General, Overview & weather, Pack, Appearance, and Data & tools. The last visited section is remembered for the browser session.
- Second clock accepts `GMT-4` and `UTC+3` (integer offsets) in addition to IANA zones like `America/New_York`.
  The input `GMT-4` is saved internally as `Etc/GMT+4`, with a human-readable clock label. An IANA city zone is recommended when daylight saving time matters.
- Restored js/wallpaper/config.js (no credentials) so the wallpaper bundle can be rebuilt and automated checks succeed.
- Bumped service worker cache to v10.

To deploy: extract this ZIP, upload/replace files in the corresponding paths in your GitHub repo, commit main. Keep your existing personal config.js. Do not copy any keys into public files.

Tests: `npm test` 139 passed, 0 failed on the packaged project, 2026-11-02.
