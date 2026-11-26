# Setup Guide

Deploy Personal Tracker as a static site (for example, GitHub Pages) with an optional Supabase backend for authentication, sync, and private storage.

## 1. Supabase Project & Schema

1. Create a Supabase project.
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql).
3. In **Project Settings → Data API / API Keys**, copy:
   - **Project URL** (`https://<project-ref>.supabase.co`)
   - **Publishable key** (`sb_publishable_...` or legacy `anon` key). Never use a `secret` or `service_role` key in client configuration.
4. In **Authentication → Email Templates**, add `<p>Your code: {{ .Token }}</p>` to both the **Magic Link** and **Confirm signup** templates so sign-in emails include a 6-digit OTP code.

## 2. Client Configuration

Choose whichever option fits your hosting setup:

- **In-browser setup (recommended for GitHub Pages forks):** Open **Settings → Account and sync**, paste your **Supabase URL** and **Publishable key**, and select **Save and reload** (stored locally in `localStorage` under `tracker-runtime-supabase-config-v1`).
- **Untracked local file (local dev):** Copy the placeholder `config.js` to `config.local.js` (git-ignored by `.gitignore`).
- **Private deployment outside Git:** Populate the deployment's configuration outside the tracked source tree. Keep the committed `config.js` credential-free. Use only your project's publishable/anon key:

```js
export const CONFIG = {
  SUPABASE_URL: 'https://<project-ref>.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_...',
  ALLOW_NEW_USER: true,
};
```

## 3. Static Hosting & Redirect URLs

1. Host the repository root (`index.html`, `js/`, `css/`, `sw.js`, `config.js`) on GitHub Pages or any static HTTPS host.
2. In Supabase **Authentication → URL Configuration**, set **Site URL** and add the exact deployment URL (including trailing `/`) under **Redirect URLs**.

## 4. Owner Authorization & Lockout

Complete this step **before entering personal data**:

1. Open the deployed site, enter your email, and sign in with the 6-digit code to create your initial user account.
2. In Supabase, open **Authentication → Users** and copy the account's **User UID**.
3. Open [`supabase/schema.sql`](supabase/schema.sql) Section 8 (**Owner bootstrap reference**), uncomment the block, replace `REPLACE_WITH_OWNER_USER_UUID` with your User UID, and execute it once in **SQL Editor**, then re-run Section 7 (or re-run `supabase/schema.sql`).
   - This creates the fail-closed `tracker_account_allowed()` check, restrictive owner-only RLS policies across all application tables and private Storage buckets, and the wallpaper write guard.
4. Run the read-only verification queries at the bottom of `supabase/schema.sql` and confirm the results match the expected owner-only state.
5. Disable open signups:
   - In Supabase **Authentication → Sign In / Providers**, disable **Allow new users to sign up**.
   - In `config.js` (or Settings → Account and sync), set `ALLOW_NEW_USER: false` and reload.

## 5. Optional Components

- **PWA Installation:** Open the hosted URL on mobile and select **Add to Home Screen** (iOS) or **Install app** (Android).
- **Wallpaper Engine:**
  1. In the app, open **Settings → Wallpaper → Wallpaper access** and create a revocable wallpaper key.
  2. Copy the `wallpaper/` directory to a permanent local path.
  3. In Wallpaper Engine, open `wallpaper/project.json` and paste the project URL, publishable key, and wallpaper key into the wallpaper properties.
- **Private Game Backups & Music:** Already provisioned in [`supabase/schema.sql`](supabase/schema.sql) Section 5; verify the `game-backups` and `music-tracks` Storage buckets are **Private** with owner-scoped policies.
- **Keep-Alive Workflow:** Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as GitHub Actions secrets to enable `.github/workflows/keep-alive.yml`.
- **Optional Edge Functions (disabled by default):**
  - `supabase/functions/feed-proxy`: Deploy and set `ENABLE_FEED_PROXY: true` in `config.js` to proxy RSS feeds.
  - `supabase/functions/pixel-icon-ai`: Deploy with `supabase functions deploy pixel-icon-ai --no-verify-jwt`, set `OPENAI_API_KEY` via `supabase secrets set`, and set `ENABLE_AI_ICONS: true` in `config.js`.

## 6. Updating

- Keep your untracked `config.local.js` or browser-local connection settings when updating repository files. Do not replace the committed placeholder with deployment credentials.
- Bump `VERSION` in `sw.js` after deploying application changes so installed PWAs refresh.
- Run `npm run build:wallpaper` after modifying shared widget/weather/phrase modules.

## 7. Data Backup & Recovery

- **JSON Export (Settings → Data & tools):** Exports structured records and settings (excludes photos, game saves, and audio).
- **Portable TAR Export:** Bundles structured records with media and SHA-256 integrity manifests (bounds: 150 MB per file, 512 MB per archive). Restores are merge-only and bound to the originating account or storage mode.
- **Device Erasure:** Use **Settings → General → Erase account data from device** on shared machines after syncing pending changes.

### Reliability and diagnostics

Browser-local connection settings support optional AI icons and feed proxy flags. Verified legacy account caches remain attached to their original project; new projects use separate local record and audio cache identities. If an old UID-only cache cannot be attributed safely, it is preserved rather than uploaded to a different project. Back up before changing project URLs. The Diagnostics tab reports approximate device photo, audio, weather and pending-cleanup storage usage without listing personal records.

The CI browser benchmark measures fresh credential-free Chromium sessions at five viewport sizes; the JSON artifact contains startup, navigation, resource transfer, heap, storage and overflow metrics. These are local-mode laboratory measurements, not live network/cloud latency or total process memory. To compare locally, run `python tests/browser-benchmark.py --root . --baseline /path/to/previous-checkout` after installing Playwright and Chromium.
