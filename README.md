# Personal Tracker

**New here? Open `SETUP.md` first.** It walks through everything in order, with what you should see at each step. This README is the reference.

All five stages are done: the data layer and Supabase schema, the inventory app
that installs on your phone, the mud forecast and calendar, the news feed and
layout editor, and now the Wallpaper Engine wallpaper.

## Stage 2: what you can do now

- **Where is it?** Type an item name; the answer is the place, shown as nested
  chips (House > Garage > Shelf 2 > Blue bin) with the final container highlighted.
- **Inventory grid** with rarity-coloured frames, quantities, generated pixel
  sprites (or your own photos), filters by category / rarity / place, sorting.
- **Lost quests:** mark an item "I cannot find this"; it is listed with how long
  it has been missing and where it was last seen. **Today's loot** picks one item.
- **Places:** add, rename, nest and delete rooms and containers; tap one to see
  what is in it.
- **Photos:** take or choose one on your phone. It is shrunk to 800 px, cached
  for offline, and uploaded to your private bucket (queued if you are offline).
- **Settings:** rename the rarity tiers and say what they mean, manage
  categories, scanlines on/off, backup and restore, sign out.
- **Works offline and installs like an app** (service worker + manifest).

## Stage 3: mud forecast and calendar

**Mud tab**
- Type the nearest town or city and pick it from the matches. The app stores its
  name, coordinates and elevation (in meters). Change it any time in the Mud tab
  or Settings.
- The top card answers the question: today's label and score, why, and where it
  is heading ("Getting muddier, peaking on Monday at Swamp").
- Below it: five observed days, today, and five forecast days, each with a label
  (Dry, Tacky, Muddy, Swamp), a 0 to 100 bar, the rain that fell, and a one-line
  reason. Tap a day to see exactly how its score was built.
- Works offline from the last saved forecast and says so. Fetches again only when
  the saved copy is over an hour old, or when you press Refresh.

**How the Mud Index works** ("How is this scored?" in the app explains it too):
four factors, each 0 to 100%: recent rain (older rain counts less, and snow
counts when it melts), soil moisture in the top 9 cm, poor drying (low
evaporation), and freeze-thaw (frozen ground thawing). They are combined with
adjustable weights, then faded out when there is almost no water about (so a
cold, dull, dry week is not "muddy") and cut when the ground is frozen solid.

**Tuning (desktop):** Mud tab -> "Tune the model", or Settings. Weight sliders,
where each label starts, and seven parameters, with a live colour preview of the
eleven days using your saved forecast. Nothing changes until you press Save.

**Calendar**
- Month grid with a coloured square for the mud forecast on each of the eleven
  days that have one, plus your events. Tap a day for its events and mud details.
- Add events with a date, time or all-day, colour, notes, and repeats (every N
  days, weeks, months or years; chosen weekdays; stop date). Repeating events
  keep their local time across clock changes.
- "Coming up" lists the next two weeks.
- **Import:** choose an .ics file exported from Google, Apple or Outlook. Importing
  the same file again updates events instead of duplicating them. A calendar
  link field exists but usually fails, because most calendar sites do not let a
  web page read their feeds; the message tells you to use the file instead.
- Settings: week starts on Monday or Sunday.

**What this stage cannot do (on purpose or by limit)**
- The mud score is a transparent estimate built from weather data, not a
  measurement. The defaults are sensible starting points, not calibrated to your
  ground. Compare it with the real mud for a couple of weeks and tune it.
- Weather data covers a grid cell a few kilometers across, so a valley or
  hillside near your place may differ.
- Editing a single occurrence of a repeating event is not supported (you edit or
  delete the whole series). No reminders or notifications.

Weather data is by [Open-Meteo.com](https://open-meteo.com/) (free for
non-commercial use, no key needed; the app shows the credit).

## Stage 4: news feed, Overview and layout editor

**Feed tab.** Nothing is preset: you start with an empty feed and add sources.
- **Bluesky account** (`name.bsky.social` or a profile link): that account's own
  posts. Needs no key and no proxy.
- **Mastodon account or hashtag** (`https://mastodon.social/@name`,
  `@name@server`, or `https://server/tags/weather`). Needs no key and no proxy.
- **News feed link (RSS or Atom).** Works if the site allows browsers to read it.
  Most do not, and the app then says so and points you to the proxy below.
- **X (Twitter)** is a clearly marked empty slot: it needs paid API access, so it
  is not connected. Adding it later means adding one adapter in `js/feed/sources.js`.
- Each source has a **"Check it works"** button before you add it, an on/off switch,
  and a status line. One broken source never hides the others, and saved headlines
  keep showing when you are offline.
- **Keywords:** headlines containing your words are highlighted, and one tap shows
  only those. Headlines are shown as plain text only and links open in a new tab.

**Optional feed proxy (for news-site RSS).** A small Supabase function
(`supabase/functions/feed-proxy`) fetches feeds for you. It only answers requests
that carry your own sign-in token, only fetches http(s) addresses, refuses
obvious private addresses, and limits size and time.
1. Install the Supabase CLI and log in (`supabase login`), then in this folder run
   `supabase link --project-ref YOUR-PROJECT-REF`.
2. `supabase functions deploy feed-proxy --no-verify-jwt` (the function checks
   your sign-in itself).
3. In the app: Feed -> Sources and keywords -> Feed proxy -> "Use my Supabase
   address" -> Save proxy.
It is **untested** (see below), so try one feed and check the result.

**Overview tab.** All your widgets on one screen, in the layout you chose:
Mud forecast, Coming up (calendar), Loot and lost quests, Headlines, Pack stats,
and Clock. On a computer it follows the "computer" layout; on a phone the widgets
stack using the "phone" layout. Widget titles link to their tabs.

**Layout editor** (computer only: Overview -> Edit layout, or Settings -> Layout).
- Three layouts: **Wallpaper** (a true 16:9 screen, 12 by 8 cells), **Overview on a
  computer**, and **Overview on a phone**. The wallpaper stage will draw exactly
  the layout you save here.
- Drag a widget to move it; drag its bottom-right corner to resize; or set its
  exact column, row, width and height in the side panel. With the keyboard:
  arrow keys move, Shift+arrows resize, Delete removes.
- Widgets never overlap and never leave the canvas. A drop that does not fit
  snaps back and the ghost outline turns red while you drag.
- Add and remove widgets from the side list. Widgets show live data in the editor.
- Nothing is saved until you press Save; Cancel asks before discarding changes.

## Stage 5: the Wallpaper Engine wallpaper

The `wallpaper/` folder is a ready-made Wallpaper Engine web wallpaper. It draws
exactly the **Wallpaper** layout you saved in the layout editor: the same widgets, on
a 12 by 8 grid stretched to fill whatever screen you have (1080p, 1440p, ultrawide,
4K), with text that scales to the screen height.

### Set it up

1. **Update Supabase.** Open the SQL Editor and run the latest `supabase/schema.sql`
   again (it is safe to re-run). Section 6 adds the wallpaper functions.
2. **Make a wallpaper key.** In the app: Settings -> Wallpaper -> "Create wallpaper
   key". It shows three values once, each with a Copy button: your project address,
   your public (anon) key, and the new wallpaper key. "Preview in a browser" opens the
   wallpaper right away so you can check it before touching Wallpaper Engine.
3. **Install the wallpaper.** Copy the whole `wallpaper/` folder somewhere permanent.
   In Wallpaper Engine use "Open Wallpaper" -> "Open from File" and choose
   `project.json` in that folder. (If your version will not open it, use the
   Wallpaper Editor: Create Wallpaper -> Web, choose `index.html`, then add the
   settings below by hand with the same names.)
4. **Paste the three values** into the wallpaper's settings panel. It starts within
   a few seconds.

Wallpaper settings: refresh interval (default 10 minutes), text size, screen margin,
scanline effect, accent colour. Change the layout any time in the app; the wallpaper
picks it up at its next refresh.

### What the wallpaper can and cannot see

The wallpaper has no sign-in. It holds the long random key and can do exactly one
thing with it: ask for a small, fixed summary of your data. It cannot change
anything.

| Included | Never included |
| --- | --- |
| Your wallpaper layout | Event notes |
| Your place and mud settings, rarity names, keywords | Photos and pixel descriptions |
| Event titles, times and colours | Backups, other settings |
| Item names, quantities, rarity, which are lost | Anything about other accounts |
| Your feed source names and addresses | |
| **Only if you turn it on:** where items are stored | Where items are stored (the default) |

Where things are stored is **off by default**, because a wallpaper is visible to
anyone who walks past your screen. Turn it on or off any time in Settings ->
Wallpaper. The key is stored in the database only as a hash, so a database export
cannot reveal it. "Make a new key" instantly invalidates the old one, and "Turn off
wallpaper access" deletes it.

### How it behaves

- It keeps the last good snapshot on the PC, so it still shows your data if you are
  offline or your free project has paused (a small note in the corner says so).
- It refreshes only while visible, and nothing animates continuously, so it is light
  on the PC.
- Weather comes straight from Open-Meteo, and Bluesky or Mastodon sources straight
  from those services. **News-site RSS that needs the proxy will not appear on the
  wallpaper**, because the proxy needs your sign-in.
- A wrong or replaced key, a missing function (schema not updated), and a down
  project each show a plain explanation instead of a blank screen.

### If you change the app's code

`wallpaper/wallpaper.js` is generated from the files under `js/`. After changing
anything the wallpaper uses, run `node scripts/build-wallpaper.mjs`. A test fails if
the shipped file is out of date. The bundle is one classic script (about 110 KB)
because a page opened from a folder cannot reliably load ES modules.

### Keeping a free Supabase project awake

`.github/workflows/keep-alive.yml` makes one harmless request to your project every
third day, so a free project does not auto-pause after a week of no activity. Add the
repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Settings -> Secrets and
variables -> Actions), then run it once by hand from the Actions tab and read the
log. The wallpaper's own refreshes may also count as activity while your PC is on,
but that is not guaranteed. GitHub turns scheduled jobs off after 60 days without
repository activity; re-enable it from the Actions tab if that happens.

## Deploy to GitHub Pages (so your phone can install it)

1. Create a **public** repository on GitHub (free Pages needs a public repo).
2. Copy `config.example.js` to `config.js` and fill in your Supabase URL and
   anon/publishable key. **Commit config.js.** It only holds the public key;
   your data is protected by sign-in and row-level security. Never put the
   service_role / secret key in it.
3. Upload everything in this folder to the repo (drag-and-drop on github.com
   works, or `git push`). Include the hidden `.nojekyll` file.
4. Repository Settings -> Pages -> Source: "Deploy from a branch", branch
   `main`, folder `/ (root)`. After a minute your site is at
   `https://YOUR-NAME.github.io/YOUR-REPO/`.
5. In Supabase: Authentication -> URL Configuration. Set the Site URL to that
   address (with the trailing slash) and add it to the redirect URLs.
6. Open the address on your phone and sign in. Then **iPhone:** Safari -> Share
   -> Add to Home Screen. **Android:** Chrome menu -> Install app.
7. Turn off new signups in Supabase and set `ALLOW_NEW_USER: false` in
   `config.js` (commit the change).

**Updating later:** push your changes, and change `VERSION` in `sw.js` (for
example `v1` to `v2`). Installed copies show "A new version is ready" with a
Reload button.

## Checking it works

- `node --test` runs the 135 logic tests (data layer, sync, mud model, weather
  client, repeating events, .ics import, feed parsing and sources, layout engine,
  wallpaper configuration, snapshot, bundler, and checks that the SQL and the code
  agree).
- With the folder served (`python3 -m http.server 8099`), these drive the real
  app in headless Chromium: `python3 tests/ui-smoke.py` (inventory),
  `python3 tests/ui-mud-calendar.py` (mud tab, calendar, tuning) and
  `python3 tests/ui-feed-layout.py` (feed, overview, layout editor with real mouse
  drags) and `python3 tests/ui-wallpaper.py` (the shipped wallpaper opened from a
  file:// path at several screen sizes, plus the key screen). The weather, news and
  Supabase services are replaced with fake responses so they run offline. They need `pip install playwright`.

## Not planned

- **Barcode scanning.** Decided against it.

## What's here

```
supabase/schema.sql        Tables, row-level security, last-write-wins trigger, photo bucket
config.example.js          Copy to config.js and add your Supabase URL + key
index.html + js/ + css/     The app (stage 2)
sw.js, manifest, icons/    Offline support and install-to-phone
stage1-check.html          Plain page to verify sign-in, sync, search and backup
js/data/
  app-data.js              initData(): picks local or cloud mode, wires everything
  store.js                 The API the app uses (list/get/upsert/remove/settings)
  sync.js                  Offline-first sync (outbox, incremental pull, conflicts)
  schema.js                Client-side table definitions + validation
  adapters.js              IndexedDB (browser) and in-memory (tests) storage
  supabase.js              Supabase remote + sign-in helpers
  inventory-logic.js       Location paths/tree, search, "Where is it?"
  backup.js                JSON export / import
  defaults.js              First-run categories, settings, layouts
  sample-data.js           12 sample items, location tree, events (local mode)
tests/data-layer.test.mjs  30 tests, including two simulated devices
```

## Try it locally (no Supabase needed)

ES modules don't load from `file://`, so serve the folder:

```
cd personal-tracker
python3 -m http.server 8080
```

Open <http://localhost:8080/stage1-check.html>. With no `config.js` it runs in
**local-only mode**: sample data, stored in your browser's IndexedDB.
Try the "Where is it?" box (`headlamp`, `shed`, `allen`).

Run the tests (Node 18+ , no installs needed): `node --test`

## Set up Supabase (cloud mode)

1. **Create a project** at supabase.com on the Free plan. Pick a region near
   you and keep the database password somewhere safe.
2. **Run the schema:** SQL Editor -> New query -> paste `supabase/schema.sql` -> Run.
   It is safe to run again later.
3. **Copy your keys:** Project Settings -> API. Copy `config.example.js` to
   `config.js` and fill in the Project URL and the anon (or "publishable") key.
   Never use the `service_role` / secret key in the browser.
4. **Allow your address to receive sign-in links:** Authentication -> URL
   Configuration. Set the Site URL to where you serve the app
   (`http://localhost:8080` for now) and add it to the redirect URLs. Add your
   real hosting address later (stage 2).
5. **Get a 6-digit code in the email, not only a link:** Authentication ->
   Email Templates -> Magic Link. Add `{{ .Token }}` to the body. This matters
   on a phone: a link opens in the browser, but an installed home-screen app
   keeps its own separate storage (especially on iPhone), so typing the code
   into the app is the reliable way to sign in there.
6. **Open `stage1-check.html`,** enter your email, then use the link or code.
   The sync pill should turn `synced` and the counts show your default
   categories, settings and layouts.
7. **Lock it down:** once you're signed in, turn off new signups in the
   Supabase Authentication settings and set `ALLOW_NEW_USER: false` in
   `config.js`. Row-level security already stops anyone else reading your
   data; this also stops strangers creating accounts in your project.

Notes: Supabase's built-in email sender has a low hourly limit (check the
current number in the dashboard), so don't spam sign-in requests. If that
becomes annoying, add a custom SMTP provider.

## Using the data layer

```js
import { initData } from './js/data/app-data.js';
const { mode, store, auth } = await initData();   // mode: 'local' | 'cloud'

const item = await store.upsert('items', { name: 'Headlamp', rarity: 'rare', location_id });
await store.upsert('items', { id: item.id, quantity: 2 });   // update = pass the id
await store.remove('items', item.id);                        // soft delete
await store.list('items', { where: (i) => i.is_lost });
await store.getSetting('location');                          // falls back to defaults
await store.setSetting('location', { name: 'Home', lat: 0, lon: 0, elevation_m: 120 });

store.subscribe((e) => { /* e.type: 'change' (e.tables) | 'sync' (e.status) */ });
store.sync?.syncNow();           // cloud mode only
store.sync.getStatus();          // {state, pending, failed, lastSyncAt, error}
```

Sync states: `idle`, `syncing`, `synced`, `offline`, `unreachable` (repeated
failures while the browser says it's online, e.g. a paused project),
`auth-required`, `error` (the server rejected some changes).

Tables: `categories`, `locations`, `items`, `events`, `news_sources`,
`settings`, `widget_layout`. Elevation is stored in meters (`elevation_m`).

## Design decisions worth knowing

- **Everything reads from the local cache.** The UI is instant and works
  offline; sync happens in the background.
- **Deletes are tombstones** (`deleted_at`), so other devices learn about them.
- **Last-write-wins, enforced on the server** by comparing each edit's
  `updated_at`. A device clock far in the future is clamped to server time + 1
  minute. Two devices with clocks that differ by minutes can still produce
  surprising winners; keep automatic time on.
- **No foreign keys between app tables.** Offline devices sync in any order, and
  a foreign key would turn that into failures. A missing reference shows as
  "(unknown location)" instead.
- **One bad row can't jam sync.** Rejected rows are parked and reported;
  everything else keeps flowing.
- **Pulling re-reads a 10-second overlap** so a transaction that commits just
  behind the cursor is never missed. Re-applying rows is harmless.
- **Default categories/settings use fixed ids**, so two devices seeding at once
  don't create duplicates.

## What has and hasn't been tested

Tested automatically (135 logic tests plus four browser walkthroughs): validation,
sync between two simulated devices (offline edits, conflicts, deletions, a bad
row, network and sign-in failures), backup and restore, the mud model against
realistic weather (a dry spell, heavy rain then drying, a downpour on dry
ground, hard frost, thaw with melting snow, missing data), weather requests and
parsing, caching and offline fallback, repeating events across a daylight-saving
change, .ics import, RSS/Atom/Bluesky/Mastodon parsing (including escaped HTML and
unsafe links), the proxy fallback, and the layout engine (collisions, bounds,
minimum sizes). The browser walkthroughs click through search, adding
items, places, the Mud tab, the calendar, importing, the offline banner, and
tuning, and fail on any stray "null" text, JavaScript error, or page that is
wider than a phone screen.

**Never run here (stage 5):** the new SQL has never been executed on a real
Postgres, because none was available. I reviewed it line by line and automated
checks confirm its shape (every function is security definer with a fixed search
path, only the snapshot function is open to the wallpaper, the returned fields match
what the wallpaper reads, no private columns are returned). Wallpaper Engine itself
was also not available, so loading `project.json`, its settings panel, and how its
browser behaves are untested. I checked the file format and the settings hook
against Wallpaper Engine's documentation, and the wallpaper is tested in a real
browser from a `file://` path. The keep-alive workflow has not run either.

**Not tested here** because this environment has no network or phone: the real
Open-Meteo service, the real Bluesky and Mastodon services (their request formats
were checked against documentation, but whether a given Mastodon server allows
browser access is up to that server), the feed proxy function (never run), the
Open-Meteo service (the request format and variable names were checked against
its documentation, and a problem with the optional soil data cannot block the
main forecast), the real Supabase client, sign-in emails, the SQL running on
Supabase, the IndexedDB adapter on a real phone, camera capture, and the pixel
font (the sandbox could not download it). Your first run of each is the real test.
If something fails, copy me the message shown.

## Putting it all live, in order

1. **Supabase:** create a free project, run `supabase/schema.sql` in the SQL Editor,
   copy the project address and public key into `config.js` (copy `config.example.js`).
2. **Try it on your computer:** `python3 -m http.server 8080` in this folder, open
   <http://localhost:8080>, sign in with your email (type the 6-digit code). If the
   schema throws an error, that is the single most likely thing to need a fix: send
   me the message.
3. **Put it online for your phone:** push this folder to a public GitHub repository,
   turn on Pages, add the Pages address to Supabase (Authentication -> URL
   Configuration), open it on your phone and Add to Home Screen.
4. **Make it yours:** type your nearest town on the Mud tab, add a few feed sources
   (Bluesky and Mastodon work with no extras), arrange the Wallpaper layout.
5. **Wallpaper:** Settings -> Wallpaper -> create a key, then install the `wallpaper/`
   folder in Wallpaper Engine and paste the three values.
6. **Lock it down:** turn off new signups in Supabase and set `ALLOW_NEW_USER: false`.
7. **Optional:** the feed proxy (for news-site RSS) and the keep-alive job.

## Assumptions I made

- It is for one person (you). Row-level security keeps everything private to your
  account; new signups should be switched off after your first sign-in.
- Metric everywhere: millimeters of rain, degrees C, km/h, and elevation in meters.
- The Mud Index defaults (weights 40/30/20/10, "soaked" at 40 mm of weighted rain,
  labels starting at 20, 45 and 70) are my estimates, not calibrated to your ground.
  Treat them as a starting point to tune.
- Weather is one grid cell a few kilometers across, and soil moisture is the top 9 cm.
- Weeks start on Monday (a setting). All-day events are stored as midnight UTC of
  their date. Two devices decide conflicts by their clocks, so keep automatic time on.
- Feed headlines are plain text only. Bluesky shows an account's own posts (not
  reposts or replies). X (Twitter) is not connected.
- Photos are shrunk to 800 px (1 MB cap); backups contain data but not photo files.
- The wallpaper refreshes every 10 minutes and hides where items are stored unless
  you turn that on.
- No notifications or reminders, and no barcode scanning (your decision).

## Five things I would add next

1. **"How muddy was it really?"** A one-tap rating each day. After a couple of weeks
   the app compares its predictions with your ratings and suggests weight changes,
   so the score becomes trustworthy instead of just plausible.
2. **Outdoor events flagged on muddy days.** Mark an event as outdoors; the calendar
   and wallpaper warn when the forecast for that day is Muddy or Swamp.
3. **Collection goals and achievements.** Set a target per category ("12 hand tools")
   with progress bars and small unlockable badges, finishing the game feel of the pack.
4. **Lent out.** Record who has an item and since when, with a quest-style reminder
   list, like the lost-item quests.
5. **Backups that include photos,** and editing a single occurrence of a repeating
   event.

## Known limits (planned for later stages)

- A photo's file may upload a little after the item syncs, so another device
  can briefly show the sprite instead of the photo.
- Backups contain data only, not photo files.
- The wallpaper shows data as of its last refresh (every 10 minutes by default), not
  instantly.
- News-site RSS that needs the feed proxy is not shown on the wallpaper.
- Free-plan limits and behavior change over time; recheck supabase.com/pricing.
