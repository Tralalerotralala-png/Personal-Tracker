# Personal Tracker

A customizable, offline-first personal dashboard for organizing everyday life. Built with vanilla JavaScript, CSS and IndexedDB, with optional Supabase sign-in and synchronization.

Personal Tracker brings collections, planning, finances and useful daily information into one retro-inspired, widget-based web app. It's a personal project designed primarily for a single owner, not a hosted multi-user service.

## Features

- **Dashboard:** Rearrangeable widgets, customizable layouts, themes and pixel-art icons.
- **Inventory:** Track belongings, categories, locations and photos.
- **Media Library:** Organize games, books and comics, films and TV, and albums. Track progress, notes, covers and decimal ratings; optionally store game backups and upload music privately with Supabase Storage.
- **Calendar:** Events, repeating schedules, reminders, an agenda and ICS calendar imports.
- **Weather and sky:** Local forecasts, estimated ground conditions, UV, moon phases and astronomical events.
- **Personal records:** Expenses, dream diary, personal notes and a passphrase-encrypted Logs journal.
- **News and learning:** A configurable news feed and daily language practice.
- **Offline use:** Installable progressive web app (PWA) with local browser storage; optional Wallpaper Engine desktop version.

Weather, news and cloud synchronization need an internet connection. Some weather and ground readings are *model estimates*, not measurements at your address.

## Getting started

No JavaScript framework or application build step is required to serve the website. Use a local HTTP server rather than opening `index.html` directly:

```bash
git clone https://github.com/Tralalerotralala-png/Personal-Tracker.git
cd Personal-Tracker
python3 -m http.server 8080
```

Open **http://localhost:8080** in your browser.

**Choose your data mode before running a fork:**

- **Local-only:** Remove `config.js` from your own copy (or replace it with placeholder values). The app uses browser IndexedDB and starts with sample data.
- **Private cloud sync:** Use `config.example.js` to configure **your own** Supabase project, then follow [SETUP.md](SETUP.md) for database, authentication, Storage and owner-access policies.

This repository includes deployment configuration. **Do not reuse the original project's Supabase backend for your fork.** Browser configuration may contain only a public/publishable key, never a secret or service-role key.

## Development

Node.js 22 is used in CI. Useful commands:

```bash
npm test                     # JavaScript tests
npm run build:wallpaper      # Regenerate Wallpaper Engine files
```

The website starts at `index.html`; application modules live in `js/`, and `css/app.css` is the source stylesheet. `wallpaper/` contains generated desktop assets. GitHub Actions also runs browser and database-policy tests.

## Data and privacy

Local-only records are stored on your device; general IndexedDB data is **not encrypted at rest**. Cloud mode uses account-specific browser caches and Supabase synchronization. The existing hosted backend is owner-restricted; self-hosted deployments must configure and verify their own Row Level Security and access policies.

The private Logs journal uses passphrase-based encryption, with **no forgotten-passphrase recovery**. JSON exports can contain readable personal data and do not include uploaded photos, game-backup files or music tracks. Back up those files separately.

**Never commit personal records, exported backups, passwords or private credentials.** For detailed deployment and recovery guidance, see [SETUP.md](SETUP.md).
