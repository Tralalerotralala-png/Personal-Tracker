# Personal Tracker quality review

Reviewed the GitHub version at `d0778e4` and exercised the app with a clean local profile in Chromium. The test profile used sample or synthetic records. The production Supabase configuration was excluded from that profile.

| Area | Finding | Change |
| --- | --- | --- |
| Global search | Search read a nonexistent `places` table, so one failing read suppressed all results. Matches generally navigated to an entire section. | Search reads the locations table, ranks titles above notes, matches accents and multiple terms, and opens the selected record. The same dialog lists every section without a query. |
| Navigation and accessibility | The mobile bar could leave the current section offscreen. The keyboard shortcut used the initial tab order even after tabs were moved. | Keep the active tab in view, use the current order for shortcuts, add a skip link, and give the search dialog standard keyboard and focus behavior. |
| Dashboard | Overview rendered once during mount and again on initial show. An asynchronous render could finish after navigation and recreate widgets in the background. | Mount once on entry, invalidate older renders, and destroy widget instances on exit. The dated heading and labeled capture control make the main actions easier to find. |
| Records | Search could only reach the Hub, Library or Expenses landing views. Media filters also carried over between unrelated collections. | Open saved items, storage locations, events, tasks, notes, transactions, and media entries directly. Reset media filters when switching shelves. Private Logs stay outside the search index. |
| Expenses | CSV import treated blank amounts as zero and accepted impossible calendar dates. Deduplication missed account and notes, and totals repeatedly scanned expenses by category. | Validate CSV dates and amounts. Match duplicates across all exported fields and preserve their occurrence counts. Aggregate reports in one pass and prevent duplicate saves while the editor is writing. |
| Forecast | A city change during a forecast request could inherit that earlier request. Multiple widgets could also make duplicate hourly requests. | Refresh the newest selected location, ignore stale responses, and share hourly requests for the same location. Unrelated settings changes no longer trigger weather recalculation. |
| Backup and storage | Restore began writing before the user could see whether the file was readable. An invalid replacement could remove records. The in-memory fallback looked like ordinary local storage. | Preview records and validation errors before merge, reject invalid replacement input before writes, and label the temporary storage mode. Backups explain that cloud photos and game save files are separate. |
| Sync and offline shell | Data rows and sync queue entries were written separately. The service worker deleted every other cache on the origin, and a removed config could be served from cache online. | Commit cloud writes and queue entries together. Restrict service worker cleanup to Tracker caches and honor explicit HTTP removal online. |

## Verification

- Opened all nine main sections in a clean Chromium profile.
- Created a task in Quick Capture, reloaded, found the accented title without its accent, and opened the exact editor by keyboard.
- Opened a sample inventory item, a new calendar event, a new income entry, and a new book directly from search.
- Opened the layout editor. Checked navigation and horizontal overflow in narrow 390 and 320 pixel frames, including a direct jump to Expenses from the section picker.
- Checked backup controls and switched to Mexican Spanish in the browser. Verified the localized search dialog and date heading.
- Ran 282 automated tests, including regressions for search ranking, backup validation, sync queue failure, worker cache isolation, and overlapping weather requests. Checked JavaScript syntax and rebuilt the Wallpaper Engine bundle.

## Remaining verification

The browser walkthrough used local mode. It did not use the owner's data, authenticate against production Supabase, deliver browser notifications, or run inside Wallpaper Engine. Its offline behavior was checked at the service worker and data layer, without simulating a full disconnected browser restart. Cloud sync still works at the row level, so edits to the same collection from separate devices can conflict. The journal uses its existing PIN protection and browser reminders still depend on the app being open.
