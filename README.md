# Personal Tracker

Offline-first, single-owner web dashboard built with vanilla JavaScript, CSS, and IndexedDB, with optional Supabase synchronization and a Wallpaper Engine desktop view.

## Features

- **Dashboard:** Configurable widget grid, themes, and pixel-art icons.
- **Inventory & Media Library:** Track items, locations, photos, games, books, films, albums, and optional cloud-backed audio or game saves.
- **Calendar & Tracking:** Recurring events, ICS import, reminders, medication schedules, expenses, notes, and a passphrase-encrypted journal.
- **Weather & Calendar Clock:** Unified color-coded 24-hour weather clock linking hourly sky/rain, UV index, ground mud modeling, 7-day forecasts, and Calendar events across full views and widgets.
- **Offline & Desktop:** Installable PWA with local storage; optional read-only Wallpaper Engine bundle.

See [DESIGN.md](DESIGN.md) for the visual system, 24-hour weather clock grammar, and architecture specification.

## Quick Start

Serve the repository over HTTP (do not open `index.html` via `file://`):

```bash
git clone https://github.com/<your-username>/Personal-Tracker.git
cd Personal-Tracker
python3 -m http.server 8080
```

Open `http://localhost:8080`.

- **Local-only mode:** Runs out of the box with sample data in IndexedDB (the committed `config.js` contains placeholders only).
- **Cloud sync mode:** Connect your own Supabase project either directly inside **Settings → Account and sync** (saved in `localStorage`), via an untracked, git-ignored `config.local.js` copied from the placeholder `config.js`, then follow [SETUP.md](SETUP.md). Do not commit live credentials or reuse another deployment's backend.

## Development

Requires Node.js 22+:

```bash
npm test                     # Run 10 consolidated domain test suites
npm run build:wallpaper      # Rebuild wallpaper/ assets (< 375 KiB bundle)
npm run verify               # Run test suite and verify wallpaper build
```

Entry point: `index.html`, modules in `js/`, styles in `css/app.css`, generated desktop bundle in `wallpaper/`.

## Privacy & Security

- General IndexedDB storage and JSON/TAR exports are not encrypted at rest.
- The encrypted journal uses client-side AES-GCM with PBKDF2; forgotten passphrases cannot be recovered.
- Cloud deployments must configure Row Level Security and single-owner policies as described in [SETUP.md](SETUP.md).

## License

GNU AGPL-3.0. See [LICENSE](LICENSE).
