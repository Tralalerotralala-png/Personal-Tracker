"""Draws the app icon as 16x16 pixel art and writes the PNG sizes the
manifest and iOS need. Run: python3 scripts/make_icons.py  (needs Pillow)."""
from PIL import Image
import os

PALETTE = {
    '.': None,
    'K': (26, 18, 11),      # outline
    'w': (138, 90, 43),     # lid, dark
    'W': (185, 122, 58),    # lid, light
    'B': (110, 69, 34),     # body
    'b': (74, 45, 21),      # body shadow band
    'G': (242, 182, 50),    # brass
    'g': (176, 125, 16),    # brass shadow
    'T': (67, 185, 173),    # teal gem
}

CHEST = [
    "................",
    "................",
    "...KKKKKKKKKK...",
    "..KwWWWWWWWWwK..",
    ".KwWWWWWWWWWWwK.",
    ".KwWWWWWWWWWWwK.",
    ".KwwwwwwwwwwwwK.",
    ".KKKKKGGGGKKKKK.",
    ".KbBBBGTTGBBBbK.",
    ".KbBBBGTTGBBBbK.",
    ".KbBBBBGGBBBBbK.",
    ".KbBBBBBBBBBBbK.",
    ".KbbbbbbbbbbbbK.",
    "..KKKKKKKKKKKK..",
    "................",
    "................",
]

BG = (23, 19, 15)


def render(size, art_fraction, bg=BG):
    """Chest centred on a solid background, nearest-neighbour scaled."""
    cell = max(1, int(size * art_fraction) // 16)
    art = 16 * cell
    img = Image.new("RGB", (size, size), bg)
    ox = oy = (size - art) // 2
    px = img.load()
    for y, row in enumerate(CHEST):
        for x, ch in enumerate(row):
            colour = PALETTE[ch]
            if colour is None:
                continue
            for dy in range(cell):
                for dx in range(cell):
                    px[ox + x * cell + dx, oy + y * cell + dy] = colour
    return img


out = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(out, exist_ok=True)
render(192, 0.86).save(os.path.join(out, "icon-192.png"))
render(512, 0.86).save(os.path.join(out, "icon-512.png"))
render(180, 0.86).save(os.path.join(out, "apple-touch-icon.png"))
# Maskable icons get cropped to a circle/squircle: keep the art in the safe zone.
render(512, 0.62).save(os.path.join(out, "icon-maskable-512.png"))
print("icons written to", os.path.abspath(out))
