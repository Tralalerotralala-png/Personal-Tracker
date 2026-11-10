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
- **Dream Diary:** An encrypted four-digit-PIN journal. Unlock via the **Logs** tab; the journal then occupies the **main page**, not a side drawer. Its sections include dreams, sleep, moods, habits, and Private Vault. Writing in the full-page editor automatically saves a **PIN-encrypted draft**, with an unsaved-change warning when leaving. A dream supports tags, vividness, dream type, and optional small illustration. There is **no voice recorder**. It stays unlocked across tabs and locks after 40 minutes of inactivity, or whenever you press Lock now. The PIN cannot be recovered.
- **Pack:** Inventory and places, custom sprites/photos, rarity, quantity, loss/expiry/tracking information, and a general procedural 16×16 pixel-icon generator. No dedicated Methotrexate button.
- **Weather:** Shared colored pixel-art weather icons, short-term hourly rain timing, six-day forecast with ground estimates, 7/14/30-day expandable past data, and an upcoming astronomical-events watch. Sky-event dates are approximate; the app does not calculate eclipse visibility at your exact location.
- **Calendar:** Events, recurring dates, and `.ics` import.
- **Feed:** Bluesky, Mastodon, RSS/Atom (subject to browser CORS or optional proxy).
- **Settings:** Six theme palettes plus user-saved named palettes, typography, language, backup, sync, wallpaper access, widget layouts.
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


### November 2026 interface fix

The Phrase of the Day is a dashboard widget. On desktop open Overview > Edit layout to move or resize it; older saved layouts receive it once during migration. The Dreams tab shows PIN entry and unlocked journal in the main content area; entry editors remain dialogs. Existing config.js and synced records are preserved during installation.


## Game Library and appearance (2026 update)

The **Games** tab is a personal bookshelf or cover grid. Add games with a title, optional cover image (HTTPS URL or upload up to 120 KB), platform, shelf, status, rating and notes. **Look up cover** searches Wikipedia and may return an unrelated image; always verify the result. Game metadata is saved through the existing synced settings store. No new Supabase tables are required. The optional **Currently playing** widget can be added using Overview → Edit layout.

Settings → Appearance / Display provides six editable color presets (Original / Classic, Vault Terminal, Amber CRT, Midnight Observatory, Deep Ocean and Paper Archive) and Compact / Adaptive / Full width desktop layout modes. Changing individual colors preserves your choices as a custom palette.

The Dreams icon follows the approximate current moon phase. The private diary now relocks after 40 minutes without interaction or when you manually lock it, and stays unlocked when switching tabs. Its four-digit PIN remains weak against offline guessing; don't store passwords in the diary.

Weather is the navigation label for the former Mud tab. It retains the ground-drying model under Ground conditions and adds Spanish translations for common weather terms and ground explanations.


## November 2026 compact widgets and Logs update

- **Currency Converter** is an editable Overview widget. It starts with 1 MXN → USD and 1 BTC → MXN, allows adding/removing/swapping additional fiat and crypto pairs, and displays the rate timestamp. Amounts and pair choices sync in your user settings. Prices come from [open.er-api.com](https://open.er-api.com/) for fiat and [CoinGecko](https://www.coingecko.com/) for supported cryptocurrencies; their free/public endpoints may rate-limit or be unavailable. Locally cached prices are shown with their timestamp if requests fail. Rates are indicative, not trading quotes.
- **Pack stats** now uses Kinds, Lost and Legendary only; item quantity data is unchanged.
- **Weather** shows compact daily cards with forecast icons, high temperatures, rainfall amounts and ground-drying scores; live weather and moon phases appear in navigation.
- **Logs / Registros** uses the same current moon-phase icon on its lock screen and keeps entry editing inside the main app view. It continues to auto-lock after 40 minutes of inactivity. Unsaved changes trigger a discard confirmation when using the editor's Back button.
- English and Spanish widget labels have been expanded.

This release also repairs legacy imports of the weather-format module and refreshes the app service-worker cache.

### Daily widgets and navigation (November 2026)
The Overview daily status and Daily Loot refresh when the local calendar day changes (and after returning to the tab). Daily Loot uses the local date and avoids repeating the prior day when more than one item is available. Headlines open their source articles in a new tab; widget titles link to their full sections when one exists. The Phrase of the Day title opens its history.

## November 2026 consolidated media, sky, and journal update

- The **Library** tab contains **Games, Books, Films, and Albums**. Existing game records remain at the original `game_library_v1` setting. Books/films/albums are saved separately under `other_media_library_v1`; no database migration is required. Each entry has a cover, creator/platform, status, rating, notes, and dated journal entries.
- Add **Recently played** and **Sky events** under **Overview → Edit layout** if you want those optional widgets. Recently played means *recently opened in Personal Tracker*, not automatically detected PC playtime.
- The Weather tab can expand a **24-hour rain timeline** and choose **7, 14, or 30 days** of available ground/weather history. Weather history uses model-derived weather estimates rather than a sensor at your home. Sky event dates are curated from NASA's eclipse calendar and the American Meteor Society's meteor shower calendar; visibility and event times need separate location-specific verification.
- Phrases follow the **local calendar date**; the November 3–4 rotation collision is corrected. Previous lesson history remains deterministic and offline.
- More clearly styled daytime sun / partly cloudy sprites and optional rain animation honor reduced-motion settings.
- The inventory editor includes an **optional genuine AI image** button backed by a **Supabase Edge Function** (`supabase/functions/pixel-icon-ai/`). It is not active until you deploy that function and configure your own server-side OpenAI API key; see SETUP.md. The existing offline procedural icon generator remains available. **Never put your provider API key in config.js.**
- Removed `stage1-check.html` and the obsolete `js/ui/mud-format.js`. If they exist in your GitHub repo from older releases, delete them. Keep all other app files and directories.

### AI privacy and cost

Generating an AI icon sends the prompt you write to your deployed Supabase function, which sends it to the image provider. Do not include sensitive personal information in icon prompts. API generation is billable, depends on the provider's account access and quotas, and requires a separately deployed server-side function. The app reduces resulting art to a 16×16 PNG with at most eight colors (seven opaque plus transparency); results still need user review.

## November 2026 Personal Hub and Expenses update

- **Personal Hub** is now a dedicated main-window tab for tasks, notes, alerts, search, and insights. Overview's **Open personal hub** button routes directly there instead of opening a sidebar. The old Expenses section is moved out of Personal Hub (existing entries are not deleted).
- **Expenses** is its own tab, with expense and income entries, descriptions, dates, categories, payment methods, optional recurring labels, notes, editable monthly/category budgets, category charts, month/currency filters, and CSV import/export. All expenses remain in the existing `hub_expense:<id>` synced settings records; budgets use `hub_finance_budgets` and the preferred currency uses `hub_finance_preferences`. No database migration.
- **Bill calculator** estimates sales tax, tip, a total, and each person's share. Calculations do not automatically save a transaction. Recurring labels are planning-only and do not automatically create future charges.
- **Privacy:** Expenses are not linked to banks, card accounts, or any external provider. Avoid importing statements containing sensitive account numbers. The CSV export is an unencrypted file, so handle it carefully. Different currencies are never silently summed or converted.
- **Weather icon alignment:** The shared pixel-art icon renderer centers each condition's visible artwork in its canvas, and the current-weather tile is centered across all themes.

Finance features are original implementations informed by the feature sets of [Actual Budget](https://actualbudget.org/docs/) and [Firefly III](https://github.com/firefly-iii/firefly-iii), not copies of their source code.


### Latest interface refinements

- The mobile navigation stays visible at the bottom while Pack and other pages scroll. The redundant daily summary is hidden on phone-sized screens; the individual widgets remain.
- Weather fog and cloud artwork use restrained animation, with reduced-motion support. Forecast cards include the condition label.
- Games, books, films, and albums use a short original CSS case-opening interaction when an entry is opened. No third-party media source code or assets were copied.


### Privacy and a public repository

The source code of this GitHub Pages application is public, including the Supabase URL and **publishable** key in `config.js`. A publishable key is designed to be used in a browser; it is **not** an access-control mechanism. Never put a `service_role`, `sb_secret_`, OpenAI secret, personal wallpaper access key, or private data export in the repository. **Do not commit secret credentials.**

Personal data is intended to live in your browser's IndexedDB and your Supabase database, not in the GitHub project files. GitHub visibility does **not** guarantee database privacy: verify the **live** Supabase project's Row Level Security policies, storage bucket privacy, and authenticated access controls before relying on them. The included `supabase/schema.sql` defines owner-only policies, but having SQL in GitHub does not mean it was applied to the live database.

Read-only check in **Supabase → SQL Editor** (confirm every personal table shows `true` for `rowsecurity`):

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('categories', 'locations', 'items', 'events',
                    'news_sources', 'settings', 'widget_layout', 'wallpaper_access')
order by tablename;
select id, name, public from storage.buckets where id = 'item-photos';
```

Also inspect the `Policies` pages in Supabase for the owner-only access rules (and test unauthenticated access) rather than assuming RLS alone proves every policy is safe. Old commits and forks may remain public even after making a repository private. A private source repository also does not automatically make GitHub Pages private.
