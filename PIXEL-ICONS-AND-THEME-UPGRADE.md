# Pixel icons, theme controls and nighttime weather

This package extends the prior search/settings/clock upgrade; it is a complete replacement source bundle.

## Added
- Compact pixel-art magnifier in header. Click it or press Ctrl+K for global search. Esc closes it.
- Icons/inventory/methotrexate-16.png: actual 16×16 transparent, fewer than eight colors. Pack items named "Methotrexate" (case-insensitive, including trailing qualifiers) automatically show this icon when there is no custom photo. Existing custom photos remain untouched.
- Item editor -> Photo / pixel icon -> "Use Methotrexate icon" to permanently upload this asset as the item's picture. Save item afterwards. Any item can use this button.
- Item editor -> "Generate 16×16 icon" to generate a deterministic geometric pixel-art sprite locally using the existing pixel sprite renderer, with no third-party service. Save item to upload and sync it as a picture. This is procedural generation, NOT a remote AI image generator. For AI icon generation a server-side image-generation provider, authentication, quotas and cost management are required; no API key is exposed in browser code.
- Settings -> Appearance -> Display: separate background, panel, secondary panel, text, muted text, border and accent color pickers, plus panel opacity and reduced motion.
- Overview mud/weather widget: on clear or partly cloudy nights, swap daytime weather icon for current estimated moon phase icon and phase label. For rain/snow/storm nights the hazardous weather icon remains visible. `is_day` from Open-Meteo is used for day/night at the selected location. Lunar phase is an approximate 29.530588853-day synodic-cycle calculation, not an astronomical ephemeris.
- Rebuilt Wallpaper Engine bundle so the night icon update also reaches wallpaper when its forecast widget is used.

## Deployment
1. Download and save a backup from the current app.
2. Upload the CONTENTS of Personal-Tracker-main/ to the GitHub repository root on main.
3. Keep your existing config.js unchanged (not included).
4. After deploying, force-refresh GitHub Pages if necessary.
5. To permanently store the Methotrexate image in the Supabase photo bucket, edit the item, choose Use Methotrexate icon, and Save. Otherwise the built-in image displays automatically in Pack, but is not stored as the item's custom photo.

## Notes
- Item photo sync uses the existing private item-photos storage bucket and current photo permissions. If that bucket is not configured, the in-app upload can fail; the built-in Methotrexate asset still works in Pack.
- Moon phase is calculated by the browser/device date and represents an approximation. Time-zone detection is based on weather API is_day.
- Other previously proposed features (full widget library, undo/recycle bin, offline conflict handling, AI provider integration) are not part of this release.
- Test result: 139/139 existing automated tests passed. No browser/manual Wallpaper Engine test run was performed.
