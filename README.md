# Personal Tracker

A modular, offline-capable personal dashboard with Supabase sync and a read-only Wallpaper Engine companion.

**First-time setup:** [SETUP.md](SETUP.md). **Already installed?** Follow the short update instructions below.

## Install an update

1. In the running app, make a backup in **Settings > Backup** before updating.
2. Extract the new ZIP **once**. It contains `index.html`, `js/`, `css/`, `wallpaper/`, etc. **at the ZIP root** rather than under an extra project folder.
3. Upload/copy those files **once** to the **root** of your existing GitHub repository, replacing `index.html` and any other existing app files. Do **not** make a second nested `Personal-Tracker-main` directory.
4. **Keep your existing `config.js`**. It contains your Supabase project address and public key; this distribution intentionally does not include or replace it.
5. Commit to `main` and refresh GitHub Pages after deployment. If an older version is still visible, close/reopen the tab or use a hard reload to give the service worker time to update. The app will indicate when a new version is ready.
6. If desired, manually delete the obsolete `*-UPGRADE.md` files from the GitHub repository. Uploading a ZIP to GitHub does **not** automatically delete files that no longer appear in it.

**If Windows asks to replace `index.html` while the target appears empty:** inspect the *source* and *destination* paths in the copy dialog. There is only **one** `index.html` in the new ZIP. Make sure you are copying the extracted contents and not extracting/copied contents into themselves.

No new Supabase SQL migration is required for this release. The widget-layout migration adds Phrase of the Day once to saved desktop and mobile layouts **without erasing existing positions**; if you remove the widget later, it stays removed.

## Features

- **Overview:** Resizable widgets (mud weather, events, inventory, feeds, statistics, clock, and **Phrase of the Day**) and a daily status summary. Use **Overview > Edit layout** to move/resize them. Desktop, mobile, and wallpaper layouts are configured separately.
- **Phrase of the Day:** Mandarin Hanzi with tone-marked Pinyin, German with IPA, English meaning, and per-character Mandarin/per-word German literal explanations on hover, focus, or tap. The daily phrase changes at **local midnight**, even if the page remains open. **History** lets you revisit lessons from their calendar dates since **2026-11-03**: the last 30 days are listed, and the date picker reaches older lessons. The 30-phrase offline catalog cycles after 30 days. Earlier dates from the first release preserve their previous selection. Since dates deterministically select lessons, no learning-history data is uploaded.
- **Dream Diary:** An encrypted four-digit-PIN journal. Unlock via the **Dreams** tab; the journal then occupies the **main page**, not a side drawer. Its sections include dreams, sleep, moods, habits, and Private Vault. A dream supports tags, vividness, dream type, and optional small illustration. There is **no voice recorder**. It locks when leaving the tab, hiding the app, or after five minutes without activity. The PIN cannot be recovered.
- **Pack:** Inventory and places, custom sprites/photos, rarity, quantity, loss/expiry/tracking information, and a general procedural 16×16 pixel-icon generator. No dedicated Methotrexate button.
- **Mud:** Weather/mud estimates, with moon phases for clear nighttime conditions.
- **Calendar:** Events, recurring dates, and `.ics` import.
- **Feed:** Bluesky, Mastodon, RSS/Atom (subject to browser CORS or optional proxy).
- **Settings:** Theme palettes, typography, language, backup, sync, wallpaper access, widget layouts.
- **Wallpaper Engine:** Separate `wallpaper/` folder, with its own fixed-layout read-only bundle.

## Security and privacy

Personal data is **not included** in the project's downloaded source files; records are held in your browser's local cache and, if connected, in Supabase. A publishable/anon key in `config.js` is *not secret*: Supabase **Row Level Security** and Storage policies must actually be enabled in your live project to protect personal records. **Never commit** a service-role/secret key, a wallpaper access key, private backups, or exported private journal data.

The Dream Diary's `private_journal_v1` setting stores AES-GCM encrypted data using a key derived from the PIN. A four-digit PIN is low-entropy, and an attacker with a copy of the ciphertext might brute-force it offline despite key stretching. Avoid putting passwords, financial credentials, or very sensitive secrets there; there is no PIN recovery. Dream contents are excluded from global search and wallpaper snapshots. General backup exports may contain the encrypted journal record, so store backups safely.

## Project structure

- `index.html`, `css/app.css`, `js/app.js`: site entry, theme, navigation.
- `js/ui/`: independent views including `dream-diary.js` and `daily-phrases.js`.
- `js/widgets/`: dashboard widget definitions, rendering, and layout validation.
- `js/data/`: browser cache, optional Supabase sync, schema, defaults, and backup.
- `js/weather/`, `js/feed/`, `js/calendar/`: feature logic.
- `supabase/schema.sql`: database tables, RLS policies, private photo bucket, wallpaper snapshot function. Follow **SETUP.md** for initial deployment.
- `wallpaper/`: Wallpaper Engine package (copy its folder to a permanent location before using it).
- `scripts/build-wallpaper.mjs`: rebuilds the standalone wallpaper bundle and copies the shared stylesheet.
- `tests/`: data, layout, security-related logic, and widget tests.

**Keep the JavaScript modules separate.** Combining all scripts into one large file would complicate caching, testing, debugging, and updating. The wallpaper bundle is already generated as a single standalone JavaScript file because Wallpaper Engine needs that format. The source tree intentionally retains small modules and technical files required for offline operation.

## Development

Requires Node.js for tests and generating the wallpaper bundle. No package download is needed for the built-in tools:

```sh
node --test
node scripts/build-wallpaper.mjs
```

For local browser testing, run `python -m http.server 8080` in the project root and visit `http://localhost:8080`. Without a configured `config.js`, the app runs in local/demo mode. The site uses native ES modules, so don't run `index.html` directly from `file://`.

The phrase catalog and offline widget behavior are testable locally. Tests do not replace an end-to-end live GitHub Pages / Supabase / Wallpaper Engine check. If a blank screen occurs after deploying, use your browser developer console and confirm that the service worker has refreshed the app files.
