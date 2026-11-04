# Updating an existing Personal Tracker installation

The update ZIP contains the **project files at its top level**, not another nested project folder. Extract it once; copy those files into the existing GitHub repository root once; allow Windows to replace `index.html`, CSS and JavaScript files. **Do not delete, overwrite, or lose your existing `config.js`.** The update does not include it. Make a backup in Settings before uploading. On GitHub, use the repository's file tree to remove obsolete `*-UPGRADE.md` files if you want the clean structure shown in this release. GitHub Pages may cache the previous version briefly; refresh after the commit.

For a fresh installation, follow the setup procedure below.

---

# Setting up Personal Tracker, start to finish

Everything here is free. It takes about 45 minutes the first time. You will end up with:
the app on your computer and phone (synced), a mud forecast, a calendar, a news feed, and
a live Wallpaper Engine wallpaper.

**You need:** a computer, an email address you can open on that computer, and free
accounts on **Supabase** (the database) and **GitHub** (hosts the app). Wallpaper Engine
(on Steam) is only needed for the wallpaper.

Do the parts in order. At the end of each part there is a line starting **You will know it
worked when...** If you do not see that, stop and use "If something goes wrong" at the
bottom.

---

## Part 1. Unzip the project (1 minute)

Extract the downloaded ZIP somewhere you can find it. The update ZIP has the app files
**directly at its root** (`index.html`, `js`, `css`, `wallpaper`, `supabase`, etc.).
For a new installation put them into one project folder. Do not create duplicate
`Personal-Tracker-main` folders or copy the files twice.

---

## Part 2. Create the database on Supabase (10 minutes)

1. Go to **supabase.com** and sign up (the GitHub sign-in button is fine).
2. Click **New project**. Give it a name (for example `tracker`), choose a **Region near
   you**, and make a **database password**. Save that password in a password manager.
   Choose the **Free** plan. Click **Create new project** and wait about 2 minutes.
3. In the left menu open **SQL Editor** and click **New query**.
4. On your computer open `personal-tracker/supabase/schema.sql` in Notepad (or any text
   editor), select **all** of it, copy, and paste it into the query box. Click **Run**.

   **You will know it worked when...** the result says **Success. No rows returned.**
   If it shows a red error, copy the whole error message and send it to me. Do not
   continue until it succeeds. (It is safe to run again.)
5. Find your two connection values. In the Supabase dashboard open **Project Settings**:
   - **Project address** (also called the Project URL or API URL). It looks like
     `https://abcdefghijkl.supabase.co`. It is under **Project Settings -> Data API**
     (or **API**).
   - **Public key.** Under **Project Settings -> API Keys**, copy the **Publishable key**
     (it starts with `sb_publishable_`). If you only see older keys, copy the one called
     **anon** (a very long text starting with `eyJ`). Either works.
   - **Never use** a key called `secret` or `service_role`. Those are private.
6. Set up the sign-in email so it contains a 6-digit code (this matters on your phone).
   Open **Authentication -> Email Templates**. Open the **Magic Link** template and add
   this line anywhere in the message: `<p>Your code: {{ .Token }}</p>` then Save.
   Do the same in the **Confirm signup** template (your very first sign-in uses that
   one).

You will do the web-address settings in Part 6, once you know your address.

---

## Part 3. Tell the app about your database (3 minutes)

1. In the `personal-tracker` folder, make a copy of `config.example.js` and name the copy
   exactly `config.js`.
2. Open `config.js` in Notepad. It looks like this. Replace the two values with yours from
   Part 2, step 5, keeping the quotation marks:

```js
export const CONFIG = {
  SUPABASE_URL: 'https://abcdefghijkl.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_xxxxxxxxxxxxxxxx',
  ALLOW_NEW_USER: true,
};
```

3. Save the file. Leave `ALLOW_NEW_USER: true` for now.

These two values are meant to be public: they only let someone *ask* the database, and
your data is protected by sign-in. That is why it is fine that this file goes on GitHub.

---

## Part 4. (Optional) Try it on your own computer first (5 minutes)

Skip this if you do not have Python installed; Part 5 will test it online instead.

1. Open a terminal in the `personal-tracker` folder (on Windows: open the folder, click the
   address bar, type `cmd`, press Enter).
2. Run `python -m http.server 8080` (on Mac/Linux: `python3 -m http.server 8080`).
3. In your browser open **http://localhost:8080**.

You will see the app asking you to sign in, which means it found your database. Signing in
by email will not work until Part 6, so come back to this later if you like.

---

## Part 5. Put it online with GitHub (10 minutes)

1. Go to **github.com**, sign up or sign in, and click **New repository** (the green button
   or the **+** at the top).
2. Name it, for example, `personal-tracker`. Choose **Public** (free hosting needs a public
   repository). Click **Create repository**.
3. On the new repository page click **uploading an existing file**.
4. Open the `personal-tracker` folder on your computer, select **everything inside it**
   (including `config.js`), and drag it onto the GitHub page. Wait for the uploads to
   finish. If GitHub complains there are too many files, upload the `js` folder first,
   commit, and then upload the rest.
5. Scroll down and click **Commit changes**.
6. In the repository open **Settings -> Pages**. Under **Build and deployment**, set
   **Source** to **Deploy from a branch**, choose branch **main** and folder
   **/ (root)**, and click **Save**.
7. Wait 1 to 2 minutes and refresh the Pages screen. A box appears saying **Your site is
   live at** `https://YOURNAME.github.io/personal-tracker/`. **Copy that address.**

**You will know it worked when...** opening that address shows the Personal Tracker sign-in
screen. (If you see a plain "404", wait another minute. If it stays 404, check that
`index.html` is at the top level of the repository, not inside a subfolder.)

---

## Part 6. Tell Supabase your address, then sign in (5 minutes)

1. In Supabase open **Authentication -> URL Configuration**.
2. Set **Site URL** to your Pages address, including the final `/`, for example
   `https://yourname.github.io/personal-tracker/`.
3. Under **Redirect URLs** click **Add URL** and add the same address. Save.
4. Open your Pages address in your browser. Type your email and click **Email me a code**.
5. Open the email (check spam), type the 6-digit code into the app, and click **Sign in**.

**You will know it worked when...** you see the **Pack** screen. It starts empty (the sample
data only appears when you run without a database). The small label at the top changes to
**Synced**.

If the email takes a long time, remember Supabase's built-in email sender only allows a
few emails an hour on the free plan. Wait a bit rather than pressing the button again.

---

## Part 7. Lock it down (3 minutes)

Now that your account exists, stop strangers from creating accounts in your project.

1. In Supabase open **Authentication** and find the sign-in settings (named **Sign In /
   Providers** or **Configuration**). Turn **off** "Allow new users to sign up".
2. On GitHub open `config.js` in your repository, click the pencil (**Edit**), change
   `ALLOW_NEW_USER: true` to `ALLOW_NEW_USER: false`, and click **Commit changes**.

Your data was already private to your account; this just closes the door behind you.

---

## Part 8. Put it on your phone (3 minutes)

1. Open your Pages address in your phone's browser (**Safari** on iPhone, **Chrome** on
   Android).
2. Sign in the same way. Type the 6-digit code from the email.
3. **iPhone:** tap Share, then **Add to Home Screen**. **Android:** open the browser menu,
   then **Install app**.
4. Open the app from your home screen. If it asks you to sign in again, use the code
   again (the home-screen app keeps its own sign-in).

**You will know it worked when...** something you add on your phone shows up on your
computer after a few seconds, and the other way round.

---

## Part 9. Fill it with your stuff (as long as you like)

1. **Places first.** Pack -> Places -> Add place. Make a few: your house, rooms inside it,
   a shed, shelves and bins. Tap the **+** beside a place to add another place *inside* it (a shelf inside the shed).
2. **Items.** Pack -> the **+** button. Give it a name and where it is. Photos are
   optional. Open **More details** for rarity and the pixel-art description.
3. **Mud forecast.** Mud tab -> type your nearest town -> pick it from the list.
4. **Feed.** Feed tab -> Add a source. Start with a Bluesky account or a Mastodon account
   (no extras needed). Use **Check it works** before adding.
5. **Layouts (computer only).** Overview tab -> Edit layout. Arrange the **Wallpaper**
   layout (this is what the wallpaper will show), then Save.
6. **Calendar.** Add events, or import an `.ics` file exported from Google, Apple or
   Outlook.

---

## Part 10. The wallpaper (10 minutes)

1. In the app on your computer: click the **gear** at the top, find **Wallpaper**, click **Wallpaper access**, then **Create wallpaper key.** Leave
   "show where items are stored" **off** unless you really want that on your screen.
   You will see three values with **Copy** buttons. **Copy each one into a note now.**
   The wallpaper key is shown only once.
2. Click **Preview in a browser** to see it working before you touch Wallpaper Engine.
3. Copy the `wallpaper` folder from `personal-tracker` to a permanent place (it must not
   be deleted afterwards).
4. In **Wallpaper Engine** choose **Open Wallpaper -> Open from File** and pick
   `project.json` inside that `wallpaper` folder. If that does not work, use
   **Wallpaper Editor -> Create Wallpaper -> Web**, pick `index.html`, and add the settings
   by hand using the names in `wallpaper/project.json`.
5. In the wallpaper's settings panel paste the three values: project address, public
   key, wallpaper key.

**You will know it worked when...** within a few seconds your layout appears on the
desktop. Change something in the app (add an event); it appears on the wallpaper within
about 10 minutes (the refresh interval is a setting).

---

## Part 11. Optional extras

- **Stop the free database pausing** (it pauses after about a week of no use). In your
  GitHub repository open **Settings -> Secrets and variables -> Actions**, add two secrets
  named `SUPABASE_URL` and `SUPABASE_ANON_KEY` (same values as `config.js`), then in the
  **Actions** tab run **Keep Supabase awake** once and read the log.
- **News-site RSS feeds** need a small helper (the "feed proxy"). The README explains it.
  Skip it unless you want those sites; Bluesky and Mastodon work without it.

---

## Updating the app later

Change a file, upload it to GitHub to replace the old one, and (if the app's own files
changed) edit `sw.js` and change `const VERSION = 'v4'` to `'v5'`. Your phone then shows
**A new version is ready** with a **Reload** button. If you change any code the wallpaper
uses, rebuild it first with `node scripts/build-wallpaper.mjs`.

---

## If something goes wrong

| What you see | What to do |
| --- | --- |
| Blank page, or "The app could not start" | Check `config.js` is in the repository and both values are correct. Open `YOUR-ADDRESS/config.js` in a browser: it should show text, not 404. |
| The schema gives a red error in Part 2 | Send me the whole error text. |
| No email arrives | Check spam, wait a few minutes (free plan limit), and check Part 6's Site URL. |
| The email has a link but no code | Redo Part 2, step 6 (add `{{ .Token }}` to both templates). |
| The label says **Can't reach database** | Your free project may have paused. In Supabase open the project and click **Restore**. |
| The label says **Offline** or a number in brackets | You are offline or changes are waiting; they upload by themselves when back online. |
| The wallpaper says "key was not accepted" | Make a new key (gear -> Wallpaper -> Wallpaper access -> Make a new key) and paste it again. |
| The wallpaper says "does not have the wallpaper function" | Run the latest `supabase/schema.sql` again (Part 2). |
| Phone shows an old version | Close the app fully and reopen it, or tap **Reload** when offered. |
| Anything else | Tell me exactly what you clicked and the exact words on screen. |

**Honest note:** I built and tested this in a sandbox with no internet, a real browser but
fake Supabase, and no Wallpaper Engine. So the *first time* you do Parts 2, 6 and 10 are
the real tests. If anything fails, it will most likely be one of those three, and the
exact error message is all I need to fix it.


## Updating the app

The update archive contains project files at its root. Upload them to the GitHub repository root, replacing matching files. Keep your existing `config.js` and do not publish Supabase secret/service-role keys. GitHub's web uploader does not delete old files automatically. The only required top-level Markdown documentation is `README.md` and `SETUP.md`; old upgrade-note Markdown files may be removed. Existing Supabase records and widget layouts are not reset.


## Optional real AI pixel-art generator

This feature requires a separate paid API service; the offline geometric-sprite generator is still available without it. The GitHub Pages app **must never** hold the secret provider key.

1. In your Supabase project, deploy the supplied Edge Function (requires Supabase CLI authentication): `supabase functions deploy pixel-icon-ai --no-verify-jwt`. The function checks the signed-in user's token on every request.
2. Set the provider secret on Supabase, never in GitHub or `config.js`: `supabase secrets set OPENAI_API_KEY=...` (enter your own key).
3. Open an inventory item, enter a description, choose **Generate with AI**, review the 16×16 preview, then save the item to apply.
4. Generation incurs OpenAI API charges. The Edge Function includes a best-effort per-worker request budget but this is **not** a durable account-wide quota; set your provider's usage budget.

If you do not deploy the function, the AI button shows an explanatory error and other features continue working normally. An uploaded PNG or an offline generated sprite is still supported. The function calls an image model and converts its output to a transparent, limited-color 16×16 icon on your device. Do not send private information in prompts.

## Upgrading safely

Upload this release's contents to the repository root, **except `config.js`**, which is intentionally absent and must be preserved. Remove the obsolete `stage1-check.html` and `js/ui/mud-format.js` if present on GitHub. Keep the root `index.html` and `wallpaper/index.html` in their respective folders. No database schema changes are needed for the Media Library, saved themes, daily lessons, or encrypted journal drafts.

## Expenses and Personal Hub

Personal Hub and Expenses are separate tabs. Expense records continue using your existing `hub_expense:<id>` settings entries; no additional Supabase tables, functions, or migrations are required.

Expenses includes monthly/category budgets, reports, manual income and expense entries, a tip/tax/split calculator, and CSV import/export. CSV files are not encrypted; do not publish them to GitHub or share them casually. Recurrence fields describe planned repeating payments; the app does not automatically record or charge them. It never aggregates different currency amounts into one balance.
