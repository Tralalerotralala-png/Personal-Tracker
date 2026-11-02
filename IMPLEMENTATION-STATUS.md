# Upgrade implementation status

This is an incremental package, not the full requested feature set.

Implemented:
- A visible Every 2 weeks / Cada 2 semanas option in Calendar, saved as a standard RRULE FREQ=WEEKLY;INTERVAL=2 (existing weekday and end-date controls work).
- A Farmacia category with pill icon, seeded for both new and existing accounts.
- Initial category field-default settings data for Tools, Electronics and Farmacia (not yet exposed in UI).

Not implemented yet:
- Category checkbox editor and item-level overrides for durability, quantity, condition and expiration.
- Inventory tracking bars, low-stock alerts, item history, restock lists, QR codes, batches.
- Tasks, notes, notifications, expense tracking, global search, statistics, backup/restore enhancements, themes and status dashboard.
- Complete Mexican Spanish localization for these features.

The original config.js is intentionally excluded from this update. Keep your deployed config.js unchanged.

No Supabase SQL migrations are required for the changes in this incremental package.
