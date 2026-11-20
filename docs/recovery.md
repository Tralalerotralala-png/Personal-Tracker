# Data recovery and backup scope

- Cloud records live in Supabase; account-bound IndexedDB caches are not encrypted. A previously authorized account can use its cached records while offline and upload when reconnected.
- Sign-out preserves pending offline edits. For shared computers, **Settings > General > Erase account cache from device** is a separate destructive action blocked when uploads remain.
- Before changing a legacy unverified browser cache, export it from Settings > General. The old cache has no reliable owner stamp. Review the file; never attach it automatically to an account.
- A structured backup contains all seven record tables, including soft deletion markers and personal settings. It does **not** include image binaries, remote game backup files or imported audio. Those must be backed up separately. This remains an open limitation.
- Restore performs complete preflight validation and one atomic local database transaction, but cannot roll back writes already accepted by a remote server. Restore only while your account is stable and the sync queue is healthy.
- The app downloads a safety checkpoint of current structured records before a manual merge restore. Protect that JSON as a sensitive document; it may include private settings and encrypted journal ciphertext.
- Never use a four-digit journal PIN for highly sensitive information. The app supports 12–128 character passphrases; lost secrets cannot be recovered.
