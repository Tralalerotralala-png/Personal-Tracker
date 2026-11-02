# Personal Tracker — Comprehensive Incremental Upgrade

## Important: deploy safely

This release builds on your existing Personal Tracker project. It does **not** contain
`config.js` and does not require SQL changes in Supabase. Before upgrading, download a
backup in the app (Settings > Backup), then upload the extracted files into the same
GitHub repository and commit to `main`. Do not delete your existing `config.js`.
Your already-saved events, items, locations, weather settings, and layouts remain in place.

After GitHub Pages deploys, refresh the app; if an installed/PWA copy is behind, close
it and reopen it so the updated service worker can finish installing.

## New in this release

1. **Calendar language correction:** The biweekly recurrence dropdown now displays
   `Every 2 weeks` in English and `Cada 2 semanas` in Español, never both at once.
   Calendar month and weekday headings now respect the language locale.
2. **Category tracking defaults:** Settings > Categories now contains four independent
   checkboxes per category: Durability, Quantity, Condition, Expiration. Existing
   category defaults are kept, and new categories can be configured there.
3. **Individual item overrides:** Pack > edit item > More details > Inventory tracking.
   Every field can be turned on/off for an item regardless of its category default.
   "Use category defaults" restores inheritance; hidden saved values are retained.
4. **Durability:** Editable 0–100% slider and visual progress bar on item cards.
5. **Quantity:** Remaining quantity, maximum quantity, low-stock warning threshold,
   and plus/minus quantity stepper. Item cards show values like `14/20`.
6. **Condition:** Independent status (Excellent, Good, Worn, Damaged, Needs repair).
7. **Expiration:** Independent date field; alerts for expired or soon-expiring items.
8. **Purchase details:** Optional purchase price, currency, purchase date and warranty
   end date on each inventory item.
9. **Daily overview:** Summary cards for today's events, inventory size, tasks and
   alerts, plus shortcuts to the Personal hub.
10. **Personal hub:** Open from the Overview status panel or Settings. Includes
    actionable alert summaries, recurring tasks (including every two weeks), notes,
    expense log, search across several sections and basic statistics.
11. **Theme adjustments:** Settings > Display supports accent color, panel opacity,
    and reduced animations, alongside existing scanline, typography and layout controls.
12. **Synchronization and backups:** New hub records and item metadata use individual
    synced settings keys, avoiding database migrations; settings are included in JSON
    backups. The Wallpaper Engine bundle is rebuilt.

## Design notes and limitations

- Browser/system push notifications have **not** been added. The Personal hub shows
  *in-app* alerts when it is opened; it does not send operating-system notifications.
- This is an incremental release, not all possible future features. The hourly weather
  chart, mud drying estimate, QR labels, photographic room explorer and full translation
  coverage of every legacy message are not yet included.
- The wallpaper bundle is updated for compatibility but does not yet mirror the new
  interactive task, expense or notification-center UI.
- Item metadata is stored in Supabase `settings` rows prefixed `item_tracking:`;
  Personal hub entries use `hub_task:`, `hub_note:` and `hub_expense:`. This lets
  existing installations adopt the upgrade without SQL migration. As with any
  cross-device data, wait for `Synced` before switching devices or closing the app.
- The included test suite passes all included feature tests; one older test expecting
  a `.github/workflows/keep-alive.yml` file fails because the uploaded repository
  did not contain that file. No new workflow is included.

## Quick verification

- Settings > Language > Español, then Calendar > Add event > Repeats. The option
  should say **Cada 2 semanas** only. Switch to English to see **Every 2 weeks**.
- Settings > Categories > Farmacia: try switching Quantity or Expiration.
- Pack > open an item > More details: turn fields on/off, save and reopen. Check
  that durability/quantity/condition/expiration display correctly.
- Overview > Open personal hub: add a task, a note and an expense; check Insights.
- Settings > Backup: download a fresh JSON backup after everything syncs.
