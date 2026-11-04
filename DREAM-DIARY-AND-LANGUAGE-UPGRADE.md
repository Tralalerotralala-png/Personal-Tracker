# Personal Tracker — Dream Diary and Language Practice Update

## Install

1. Back up your current data in Settings before updating.
2. Extract this ZIP. Upload the **contents of Personal-Tracker-main** to your GitHub repository's root and commit to `main`.
3. **Keep your existing `config.js` unchanged.** It is intentionally not included in this ZIP.
4. Refresh GitHub Pages after deployment; the service worker cache version is bumped to `v12`.
5. No Supabase SQL migration is required; private journal data is saved as encrypted data in the existing settings table.

## Daily language practice

- A daily phrase appears on Overview, with Mandarin Chinese characters, tone-marked Pinyin, German, German IPA pronunciation, and an English meaning.
- Hover, focus, or tap individual Chinese characters to see their **context-specific** literal gloss and Pinyin.
- Hover, focus, or tap German **words** to see their meanings (German alphabet letters do not have individual lexical meanings).
- Lessons are curated and stored offline, and change with the device's local calendar date.
- The Overview phrase is intentionally excluded from Wallpaper Engine by default. The existing wallpaper bundle is still included and rebuilt.

## Dream Diary and related private journals

- New Dreams navigation tab opens a PIN-protected journal.
- Create a 4-digit PIN, then record dreams (type, vividness, tags, illustration attachment up to 100 KB), sleep logs, moods, habit check-ins, and private vault notes.
- The Dreams tab includes a count of lucid dreams and recurring tags.
- Entries are AES-GCM encrypted in the browser before they are written to the existing synced settings row. The backup system exports only this encrypted record, not plaintext.
- The journal locks after five minutes without interaction or when you leave the tab. The private journal is excluded from global search and Wallpaper Engine.
- Change the PIN from inside the unlocked journal. **There is no PIN recovery** if the PIN is forgotten.
- **Important security limitation:** a four-digit PIN has only 10,000 possibilities. PBKDF2 slows guessing, but it does NOT make the encryption resistant to determined offline brute-force attacks against a stolen encrypted backup. This is a convenience privacy lock, not a high-security vault. Avoid storing passwords, recovery codes, or other highly sensitive secrets in it.
- No microphone or voice recording is included.
- Illustrations can be uploaded; AI-generated dream illustrations are **not** implemented in this release.

## Other changes

- Removed the special `Use Methotrexate icon` button. The existing automatic icon display for an item named Methotrexate remains.
- Kept existing Supabase configuration, keep-alive workflow, inventory, calendar, weather, moon-phase icons, themes, and Wallpaper Engine.
- Existing custom navigation order is preserved when the new Dreams tab is introduced.

## Known limitations

- The private journal currently uses one encrypted synced record. Simultaneous edits from multiple devices can overwrite one another; avoid editing the diary on two devices at the same time.
- A four-digit PIN is not a substitute for a strong passphrase. No account-independent PIN reset is possible without destroying the encrypted journal.
- The private diary has a chronological archive and basic dream statistics, not a full dream calendar, voice recording, advanced sleep analytics, or AI illustration generation.
- German IPA uses a standard German pronunciation guide; audio playback is not included.
- Automated tests pass, but a complete interactive browser test could not be performed in this environment.
