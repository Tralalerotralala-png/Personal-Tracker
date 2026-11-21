# Layered pixel-art sprites

Personal Tracker uses a plain JavaScript/SVG renderer, not Godot. The inventory
sprite system was updated using the technique described in SpriteCook's
[Sprite Stack Generator](https://www.spritecook.ai/sprite-stack-generator) and
[full written guide](https://www.spritecook.ai/blog/sprite-stacking-pixel-art).

## What changed

- Every built-in inventory asset in `js/ui/inventory-assets.js` now defaults to
  a **horizontal-slice sprite stack**, drawn and outlined on whole pixels.
  Random unnamed item sprites use the same renderer. It pre-bakes a front-left
  and front-right angle, then switches direction on hover/focus without drawing
  100+ stacks every animation frame. All existing item names, metadata, icon
  choices, saved colors, photos, and storage keys remain unchanged.
- Navigation, status, weather, moon, and medical glyphs retain the familiar
  face/shape that is essential at 24–32 px. The shared glyph renderer gives
  decorative icons a stepped bevel, but **does not rotate** symbolic controls.
  Weather and celestial effects are not physical 3D objects and remain their
  own coherent, pixel-aligned sprites.
- **Settings → Appearance → Sprite style** lets you switch between
  `Layered pixel-art objects` and `Classic flat icons`. This preference syncs
  in the existing `ui` setting. `Static sprite depth`, Reduce animations,
  and `prefers-reduced-motion` prevent directional hover transitions.
- The module `js/ui/sprite-stack.js` has no network dependencies and works
  offline after the service worker installs. Each instance is an SVG assembled
  entirely from integer pixel rectangles, not a blurred CSS 3D transform.

## How the geometry works

`renderLayeredSprite(grid, {angle, hoverAngle, depth, squash, spacing})`
accepts a 2D color grid for existing hand-authored art. Rows are extruded into
simple orthographic slices. Each slice rotates by the same angle, is flattened
vertically by `squash` (default 0.75), then lifted in integer screen pixels by
its height index (default spacing 1). Lower slices are composited first. A dark
outline is added **only around the completed composite**, which prevents
unwanted dark speckles between slices.

**Important distinction:** Our existing 16×16 object recipes only provide a
front silhouette. Their generated thickness is an informed approximation,
not a full 3D model; it cannot faithfully reconstruct concavities, overhangs,
the backs of handles, or the exact hidden geometry in the original sprite.
The screenshots from an existing sprite should be reviewed manually before
calling it a physically faithful reconstruction.

For better art, build four matching orthographic pixel arrays at a shared
resolution and call:

```js
import { renderOrthographicSprite } from './js/ui/sprite-stack.js';

const svg = renderOrthographicSprite({
  top: topPixels,   // top-down, object pointing down
  side: sidePixels, // profile, object pointing left
  front: frontPixels,
  back: backPixels
}, { squash: .75, spacing: 1 });
```

The arrays contain `#rrggbb` or `null` per pixel. The top view defines width
and length; side defines height and length; front and back define height and
width. A voxel is kept only if the orthographic silhouettes agree. Perspective
drawings, inconsistent scales, and nontransparent backgrounds should be
corrected before slicing. Four-view source sheets produced by SpriteCook can
be converted to arrays through an image editor or a separate build tool;
the app does not upload them to a third-party service.

## Performance and review

- Output is crisp inline SVG with only two direction groups per icon; it does
  not run a per-frame Canvas rendering loop.
- Source colors are strictly validated hex RGB, and user-provided strings are
  never interpolated into SVG attributes.
- The existing 2D rendering path remains available as a fallback.
- UI tests check the complete inventory catalog, both directions, safe colors,
  the original flat style, reduced motion and the browser's actual SVG bounds.
- The same renderer can accept real top/front/side/back views without changing
  inventory's record schema, but individual hand-made four-view sheets have
  **not** yet been supplied for each of the catalog's objects.

The linked X thread's videos could not be accessed by the development tools.
This implementation follows the **accessible written tutorial**, not an
unverified claim about what any inaccessible video demonstrates.
