# Medication and health tracking
Open Calendar → Medications & health. Enter the prescribed dose with its unit and a daily or one-time schedule. Calendar events support editing and stopping recurrence. Choose a day in the panel and mark a dose taken or skipped. Readings have a measurement timestamp; blood-level entries must include medication and laboratory units. Peak entries are observed effects, not pharmacokinetic predictions.

Original implementation, informed by the medication scheduling and dose-history features of https://github.com/Futsch1/medTimer and https://github.com/waseefakhtar/dose-android (both MIT). No upstream source code is copied.

Reminders use the existing opt-in browser notification system, only while the app is visible. They are not OS background medication alarms. Schedules follow local calendar time. Measurements and dose logs are settings records, included in existing account sync and backups; calendar schedules are events. No medical interpretation or dosage advice is provided. This first version uses English labels.
