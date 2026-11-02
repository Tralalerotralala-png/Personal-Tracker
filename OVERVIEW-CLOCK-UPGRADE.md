# Overview clock + weather upgrade

The existing Mud forecast widget now includes a local clock, current weather, and a compact six-day mud forecast. It is shared by Overview and Wallpaper Engine. No new widget or layout reset is required.

## Optional second clock

Open Settings > Overview clocks. Enter an IANA time zone such as `Europe/London`, `America/New_York`, or `Asia/Tokyo`, and optionally a city label. Click Save clocks. Leave the zone empty to hide the second clock.

The local clock uses the device's time zone. The second clock setting is saved with your UI settings and will be included in future wallpaper snapshots.

## Update GitHub

Replace the matching files from this ZIP in your existing repository, preserving the folders. Do not overwrite your existing `config.js`. Commit to `main` and wait for GitHub Pages deployment, then reload the app. If the installed app offers a new version, choose Reload.

## Wallpaper Engine

The wallpaper JavaScript bundle was rebuilt. If your Wallpaper Engine wallpaper is using a local copy of the wallpaper folder, replace its `wallpaper.js` and related files from this package. The wallpaper refresh interval controls when the updated settings and weather arrive.

## Validation

JavaScript syntax checks passed; 134 of 135 automated tests passed. The remaining test requires `.github/workflows/keep-alive.yml`, which was absent from the source archive. Live browser and Wallpaper Engine testing was not performed.
