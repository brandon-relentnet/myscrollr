# DMG installer assets

This directory holds the artwork shown inside the macOS `.dmg` installer
window when a user double-clicks the downloaded Scrollr installer. The
goal is to make the "drag the app icon to the Applications folder" step
visually obvious to first-time users.

## Files

| File                       | Purpose                                                                  |
|----------------------------|--------------------------------------------------------------------------|
| `background.svg`           | **Source** artwork. Edit this, then regenerate the rasters.              |
| `background-1x.png`        | 660×400 raster, generated from the SVG. Goes into the TIFF.              |
| `background-2x.png`        | 1320×800 raster, generated from the SVG. Goes into the TIFF.             |
| `background.tiff`          | Multi-resolution TIFF (referenced by `tauri.conf.json`). **Do not edit.** |
| `preview.svg`              | Dev-only composite for visualizing icon overlay. Not shipped.            |
| `preview-with-icons.png`   | Final preview with the real Scrollr.app + Applications icons.            |

## Wiring

`desktop/src-tauri/tauri.conf.json → bundle.macOS.dmg`:

```json
{
  "background": "dmg/background.tiff",
  "windowSize":                 { "width": 660, "height": 400 },
  "appPosition":                { "x": 180,  "y": 170 },
  "applicationFolderPosition":  { "x": 480,  "y": 170 }
}
```

- All coordinates are in **logical points** (the DMG window is 660×400
  points). Finder draws icons at 128×128 points (`create-dmg`'s default
  `ICON_SIZE`), centered on the configured positions.
- Filename labels under each icon are drawn by Finder itself at runtime
  with `TEXT_SIZE=16`. We do **not** draw them in the background.

## Why TIFF and not PNG?

macOS Finder draws DMG backgrounds at **1 image pixel = 1 point**. A
single 1320×800 PNG would render as a 1320×800-point background, which:

- Forces Finder to expand the window past the configured 660×400, OR
- Crops the background to whatever fits in the window.

Either way, the result is broken. The fix is a multi-resolution `.tiff`
that contains both a 660×400 representation (1× / non-retina) and a
1320×800 representation (2× / retina). Finder picks whichever matches
the display, so the window stays at 660×400 points and the background
looks crisp on both display types.

We build the TIFF with macOS's `tiffutil -cathidpicheck`, which:

- Validates the second image is exactly 2× the first.
- Tags each rep with the correct DPI so Finder can pick it.

## Regenerating after editing the SVG

```sh
# One-time: install librsvg if you don't have it
brew install librsvg

cd desktop/src-tauri/dmg
rsvg-convert -w 660  -h 400 -o background-1x.png background.svg
rsvg-convert -w 1320 -h 800 -o background-2x.png background.svg
tiffutil -cathidpicheck background-1x.png background-2x.png -out background.tiff
```

That's the full pipeline. `tauri build` will then pick up the new TIFF.

## Previewing with mock icons (without rebuilding the DMG)

```sh
# Extract a 128×128 Scrollr icon from the icns
sips -s format png ../icons/icon.icns --out /tmp/scrollr-icns.png
magick /tmp/scrollr-icns.png -resize 128x128 /tmp/scrollr-128.png

# Extract the macOS Applications-folder icon
sips -s format png \
  /System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/ApplicationsFolderIcon.icns \
  --out /tmp/apps-icns.png
magick /tmp/apps-icns.png -resize 128x128 /tmp/apps-128.png

# Composite at the same positions tauri.conf.json uses:
#   Scrollr.app  center (180, 170) → top-left (116, 106)
#   Applications center (480, 170) → top-left (416, 106)
magick background-1x.png \
  /tmp/scrollr-128.png -geometry +116+106 -composite \
  /tmp/apps-128.png    -geometry +416+106 -composite \
  -fill white -pointsize 12 -font "Helvetica" -gravity NorthWest \
  -annotate +154+250 "Scrollr" \
  -annotate +445+250 "Applications" \
  preview-with-icons.png

open preview-with-icons.png
```

## Building and testing the real DMG

```sh
# From the desktop root
cd desktop
npm run tauri:build

# Output lives here
open src-tauri/target/release/bundle/dmg/Scrollr_*_aarch64.dmg
```

The first time you mount a fresh DMG, **eject any previous mounts** of
the same volume name first (or rename the volume in
`tauri.conf.json → bundle.macOS.dmg → volumeName`, but we don't set
that — it defaults to the product name). macOS Finder caches window
size and icon positions per-volume-name in user-side state; a stale
cache can override the AppleScript-positioned icons on first mount.

## Design constraints

### Why the installer is light-themed (not dark like the app)

The DMG background is a static bitmap baked at build time. **Finder
draws the filename labels under each icon using the system
`labelColor`**, which is dark in light mode and near-white in dark
mode — and we cannot override it from inside a DMG.

If we shipped a dark background (matching the app's `#141420`
`base-100`), light-mode users would get dark-on-dark labels and the
icon filenames would be unreadable. Most macOS users default to light
mode, so we made the inverse trade-off: light background so light-mode
users get a fully polished experience, and dark-mode users still see
all the install signals (icons, arrow, "Drag to install" pill, footer
copy) even if the Finder-drawn `Scrollr` / `Applications` labels are
low-contrast.

This is the same call Slack, Notion, Linear, and most polished macOS
installers make.

Preview both modes with `preview-light-mode.png` and `preview-dark-mode.png`.

### Palette

- Surface: `#fafafa` (zinc-50)
- Surface bottom: `#e4e4e7` (zinc-200) — vignette toward bottom
- Foreground: `#18181b` (zinc-900)
- Muted: `#71717a` (zinc-500)
- Faint: `#a1a1aa` (zinc-400) — drop-zone outlines
- Brand: `#10b981` (emerald-500) — arrow, mark, emphasis. Deeper than
  the app's `#34d399` so it carries weight on a light surface.
- Brand strong: `#047857` (emerald-700) — "Drag to install" pill text

### Fonts

No remote fonts — text uses generic `-apple-system` sans so the PNG
renders consistently on any build host (CI uses Ubuntu via
`tauri-action`, which doesn't have Plus Jakarta Sans). If we ever
want pixel-perfect Plus Jakarta Sans rendering, outline the text to
paths in the SVG before rasterizing.

### Layout

- Icon filename captions are **not** drawn in the background — Finder
  draws them itself directly under each icon at the system label color.
- Bottom margin is tight (about 14pt below the sub-text). Don't push
  any new copy below `y=346` in the 400pt SVG viewBox.
