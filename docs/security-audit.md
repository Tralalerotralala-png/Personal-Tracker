# Security and release checks

This is a public codebase. Do not commit passwords, service-role/secret API keys, private records, personal addresses, account exports, logs, or user screenshots. Browser project URLs and **publishable** Supabase keys are not secrets; privileged keys belong only in server-side secrets. Avoid account-specific examples in tests or documentation.

Account data is protected by owner-scoped database policies. Local browser storage and Wallpaper Engine's optional offline snapshot are **not encrypted by those policies**; protect shared devices and use the wallpaper clear-data option when needed. Wallpaper access keys can be revoked from the app.

## Code review and deployment

The November 2026 review led to changes in the feed proxy's outbound URL/DNS guard, sync/event cleanup, asynchronous weather/dashboard updates, wallpaper privacy controls, and widget fitting. Verify the generated wallpaper bundle with `npm run build:wallpaper` and run `npm test`; CI also checks mobile/desktop browser behavior and isolated database authentication/policies.

**Release gate:** The feed proxy's outbound-network protection still requires end-to-end checks in a disposable Supabase Edge deployment before it is enabled in production. Other manual gates are mobile weather-day navigation, 1/3/6/7-day forecast layout at multiple widths, PWA update, and Wallpaper Engine/privacy settings.

Do not treat a passing client-side test as a production security audit. If any real secret has ever been committed, revoke or rotate it; deleting a file in a later commit does not erase public Git history.

## Public source and private media

New installations do not auto-seed any individual's books, films, albums or rating preferences. Media entries live in account-scoped settings; book/comic interior images are processed in the browser and stored in device-local IndexedDB metadata only, not uploaded to the database or checked into Git. The device must still be trusted: these local images are not encrypted at rest.

Use the automated repository privacy test for a first-pass scan of tracked source files and obvious credential patterns. It is not a replacement for GitHub secret scanning or a full historical audit: previously removed content can still exist in earlier public commits, forks, downloads and caches. Revoke any exposed credential; contact the repository administrator before attempting a history rewrite.
