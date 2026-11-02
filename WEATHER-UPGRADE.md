# Weather upgrade

The Mud tab now begins with a current-conditions dashboard and six-day outlook, followed by the original mud scoring and observed/forecast day cards.

- Current weather: temperature, feels-like, humidity, wind and WMO weather description.
- Daily high/low, precipitation and six-day outlook.
- Subtle pixel-art CSS weather animations, disabled when reduced motion is preferred.
- Weather data continues to come from Open-Meteo and uses the existing offline cache and location settings.
- If current conditions are unavailable, the dashboard displays daily high/low instead.

## Deploying the upgrade to an existing GitHub Pages installation

Upload the updated project files to your existing repository, preserving folder paths. In particular, replace `js/weather/open-meteo.js`, `js/weather/service.js`, `js/ui/mud.js`, `css/app.css`, `sw.js`, and (if you use the bundled Wallpaper Engine files) `wallpaper/wallpaper.js`.

**Do not overwrite your existing `config.js`.** It is deliberately not included in this archive. Keep your current Supabase URL and publishable key.

The service-worker version is now v5 so an installed app can detect the update. Reload after GitHub Pages finishes publishing.

No SQL migrations or Supabase configuration changes are needed.
