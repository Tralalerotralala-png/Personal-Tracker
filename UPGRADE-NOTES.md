# Personal Tracker — Dashboard, weather, inventory and language update

## Included
- Overview: time-of-day accent and a daily greeting/event count. Existing layout editor still controls widget positions.
- Weather: existing weather and mud cards remain unchanged, including the six-day outlook and animated conditions.
- Inventory: grid/list display selector remembers the choice on this device. Existing item images and location breadcrumbs remain.
- Settings: English / **Español** toggle with Mexican Spanish vocabulary for common navigation, weather, inventory, and settings labels.
- Existing wallpaper and database code retained.

## Known limitations
- Spanish coverage is partial: many advanced settings, detail dialogs, and generated mud explanations remain in English. User-entered content is not translated.
- Hourly weather graphs, UV display, severe alerts, and drying-time estimates are not yet implemented.
- Full visual location explorer and widget opacity controls are not yet implemented.
- Wallpaper may need a rebuild to include any changes to its own source; this package does not claim a rebuilt wallpaper.

## Deployment
Replace corresponding files in GitHub and commit to main. Preserve your existing config.js. Wait for Pages to deploy and refresh; service worker cache version is v8.
