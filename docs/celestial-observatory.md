# Celestial observatory

Design references (interaction concepts, no copied implementation):
- [Stellarium Web Engine](https://github.com/Stellarium/stellarium-web-engine) — layer controls and observer-centric sky.
- [SkyEngine](https://github.com/drakkB/skyengine) — drag, zoom, object search and horizon view.
- [Solar Observatory](https://github.com/iefanx/solar-observatory) — object tracking and detail panels.

Positions use the existing pinned Astronomy Engine 2.1.19 (MIT), with user-selected weather location and simulated time. See [JavaScript API](https://github.com/cosinekitty/astronomy/blob/master/source/js/README.md). The original sprites, projected dome and controls are native JS/SVG/CSS and do not depend on WebGL. Mean diameters and body classifications reference [NASA Solar System Sizes](https://science.nasa.gov/resource/solar-system-sizes/) and [Solar System Facts](https://science.nasa.gov/solar-system/solar-system-facts/). Rounded J2000 bright-star coordinates are approximate; guide figures are simplified asterisms, not official boundaries. Planet sprite surface details and Saturn's ring tilt are illustrative, not current telescope imagery or physical sizes. Rise/set assumes a standard horizon, not local terrain or current weather. Star distances are omitted because the engine's user-defined stars use a placeholder distance. The sky is not a full catalog or a visibility guarantee.
