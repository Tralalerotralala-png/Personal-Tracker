"""Generates Personal Tracker's pixel-art PNG icons (app emblem, maskable,
Apple touch, Library shelf, Games controller, and Wallpaper preview).
Run: python scripts/make_icons.py  (requires Pillow)."""
from PIL import Image
import math
import os


def blend(c1, c2, t):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(3))


def make_app_emblem(grid=32):
    """32x32 pixel-art Chronometer Weather-Clock Compass emblem."""
    img = Image.new("RGBA", (grid, grid), (0, 0, 0, 0))
    px = img.load()
    cx = cy = (grid - 1) / 2.0

    # 12-hour weather-clock ring palette around the dial (top=noon -> clockwise)
    ring_colors = [
        (240, 135, 58),   # 12h high UV
        (232, 197, 90),   # 1h clear sun
        (232, 197, 90),   # 2h clear sun
        (120, 184, 168),  # 3h partly cloudy
        (76, 155, 232),   # 4h rain
        (153, 102, 240),  # 5h storm
        (51, 69, 115),    # 6h night
        (51, 69, 115),    # 7h night
        (51, 69, 115),    # 8h night
        (120, 184, 168),  # 9h dawn mist
        (232, 197, 90),   # 10h morning sun
        (240, 135, 58),   # 11h midday UV
    ]

    for y in range(grid):
        for x in range(grid):
            dx, dy = x - cx, y - cy
            r = math.hypot(dx, dy)
            ang = (math.degrees(math.atan2(dy, dx)) + 90.0) % 360.0
            sector = int(ang // 30.0) % 12

            if r > 15.2:
                continue
            if r > 14.0:
                # Crisp dark pixel outline
                px[x, y] = (18, 15, 22, 255)
            elif r > 12.1:
                # Sculpted burnished brass bezel (lit top-left, shaded bottom-right)
                light = (-dx - dy) / 26.0
                if light > 0.25:
                    px[x, y] = (250, 214, 120, 255)
                elif light > -0.15:
                    px[x, y] = (218, 164, 62, 255)
                else:
                    px[x, y] = (142, 98, 34, 255)
            elif r > 9.4:
                # Inlaid 12-hour color-coded weather clock ring
                base = ring_colors[sector]
                if r > 11.4 or r < 10.0:
                    px[x, y] = (*blend(base, (18, 22, 34), 0.35), 255)
                else:
                    px[x, y] = (*base, 255)
            elif r > 8.6:
                px[x, y] = (22, 26, 38, 255)
            else:
                # Deep observatory dial face with subtle radial glow
                t = min(1.0, r / 8.6)
                px[x, y] = (*blend((34, 46, 68), (18, 22, 34), t), 255)

    # Cardinal hour ticks (12, 3, 6, 9)
    for tx, ty in [(15, 7), (16, 7), (24, 15), (24, 16), (15, 24), (16, 24), (7, 15), (7, 16)]:
        px[tx, ty] = (244, 232, 200, 255)

    # Hour hand pointing ~10:10 (warm parchment)
    for step in range(1, 6):
        hx = int(round(cx - step * 0.85))
        hy = int(round(cy - step * 0.55))
        px[hx, hy] = (245, 238, 218, 255)
        px[hx, hy + 1] = (205, 192, 165, 255)

    # Minute hand pointing ~2:00 (luminous teal)
    for step in range(1, 8):
        mx = int(round(cx + step * 0.88))
        my = int(round(cy - step * 0.50))
        px[mx, my] = (96, 232, 218, 255)
        px[mx, my + 1] = (54, 178, 166, 255)

    # Glowing center turquoise jewel
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            x, y = int(round(cx)) + dx, int(round(cy)) + dy
            if dx == 0 and dy == 0:
                px[x, y] = (210, 255, 248, 255)
            elif abs(dx) + abs(dy) == 1:
                px[x, y] = (67, 215, 202, 255)
            else:
                px[x, y] = (28, 92, 92, 255)

    # Subtle top-left brass glint
    px[9, 5] = (255, 245, 210, 255)
    px[10, 4] = (255, 245, 210, 255)
    return img


def render_app_icon(size, art_fraction):
    bg = Image.new("RGBA", (size, size), (17, 20, 30, 255))
    bpx = bg.load()
    cx = cy = size / 2.0
    max_r = math.hypot(cx, cy)
    for y in range(size):
        for x in range(size):
            t = min(1.0, math.hypot(x - cx, y - cy) / max_r)
            col = blend((30, 40, 58), (14, 16, 24), t)
            bpx[x, y] = (*col, 255)

    emblem = make_app_emblem(32)
    cell = max(1, int(size * art_fraction) // 32)
    art_sz = 32 * cell
    scaled = emblem.resize((art_sz, art_sz), Image.NEAREST)
    ox = (size - art_sz) // 2
    bg.alpha_composite(scaled, (ox, ox))
    return bg.convert("RGB")


def make_library_icon(size=72):
    """32x32 pixel-art bookshelf with leather books and peeking vinyl disc."""
    g = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    px = g.load()

    def rect(x, y, w, h, c):
        for j in range(y, y + h):
            for i in range(x, x + w):
                if 0 <= i < 32 and 0 <= j < 32:
                    px[i, j] = c

    # Vinyl disc peeking out right side
    for y in range(7, 25):
        for x in range(16, 30):
            r = math.hypot(x - 21.5, y - 16.0)
            if r <= 7.8:
                if r > 7.0:
                    px[x, y] = (18, 18, 28, 255)
                elif r <= 2.3:
                    px[x, y] = (240, 182, 74, 255) if r > 0.9 else (20, 20, 30, 255)
                else:
                    groove = int(r * 2) % 2 == 0
                    px[x, y] = (46, 54, 76, 255) if groove else (30, 36, 54, 255)

    # Hardcover books on shelf
    rect(3, 6, 8, 20, (24, 18, 22, 255))
    rect(4, 7, 6, 18, (196, 86, 78, 255))
    rect(4, 7, 2, 18, (232, 128, 114, 255))
    rect(5, 10, 4, 2, (244, 206, 118, 255))
    rect(5, 20, 4, 2, (244, 206, 118, 255))

    rect(11, 4, 9, 22, (20, 22, 32, 255))
    rect(12, 5, 7, 20, (67, 168, 158, 255))
    rect(12, 5, 2, 20, (116, 214, 204, 255))
    rect(13, 8, 5, 3, (245, 232, 198, 255))
    rect(13, 21, 5, 2, (42, 116, 110, 255))

    # Wooden shelf base
    rect(2, 25, 28, 4, (28, 18, 12, 255))
    rect(3, 26, 26, 2, (166, 112, 58, 255))
    rect(3, 26, 26, 1, (204, 148, 86, 255))
    return g.resize((size, size), Image.NEAREST)


def make_controller_icon(size=72):
    """32x32 pixel-art sculpted retro gamepad."""
    g = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    px = g.load()

    def rect(x, y, w, h, c):
        for j in range(y, y + h):
            for i in range(x, x + w):
                if 0 <= i < 32 and 0 <= j < 32:
                    px[i, j] = c

    # Outer outline
    rect(4, 9, 24, 14, (20, 22, 32, 255))
    rect(2, 11, 28, 10, (20, 22, 32, 255))
    rect(3, 20, 7, 5, (20, 22, 32, 255))
    rect(22, 20, 7, 5, (20, 22, 32, 255))
    # Main body
    rect(5, 10, 22, 12, (62, 74, 98, 255))
    rect(3, 12, 26, 8, (62, 74, 98, 255))
    rect(4, 20, 5, 4, (50, 60, 82, 255))
    rect(23, 20, 5, 4, (50, 60, 82, 255))
    # Top bevel highlight
    rect(6, 10, 20, 2, (108, 126, 158, 255))
    # D-pad (warm gold)
    rect(8, 13, 2, 6, (240, 200, 106, 255))
    rect(6, 15, 6, 2, (240, 200, 106, 255))
    rect(8, 15, 2, 2, (255, 232, 168, 255))
    # Center start/select
    rect(14, 17, 2, 1, (164, 178, 204, 255))
    rect(17, 17, 2, 1, (164, 178, 204, 255))
    # Jewel action buttons
    rect(22, 12, 2, 2, (94, 222, 206, 255))  # top teal
    rect(25, 15, 2, 2, (238, 112, 128, 255)) # right coral
    rect(19, 15, 2, 2, (152, 212, 118, 255)) # left green
    rect(22, 18, 2, 2, (244, 188, 86, 255))  # bottom amber
    return g.resize((size, size), Image.NEAREST)


def make_wallpaper_preview(w=512, h=288):
    img = Image.new("RGBA", (w, h), (16, 20, 30, 255))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = min(1.0, math.hypot((x - w * 0.28) / (w * 0.7), (y - h * 0.25) / (h * 0.8)))
            px[x, y] = (*blend((34, 48, 66), (14, 16, 24), t), 255)
    emblem = make_app_emblem(32).resize((160, 160), Image.NEAREST)
    img.alpha_composite(emblem, ((w - 160) // 2, (h - 160) // 2))
    return img.convert("RGB")


if __name__ == "__main__":
    root = os.path.join(os.path.dirname(__file__), "..")
    icons_dir = os.path.join(root, "icons")
    wall_dir = os.path.join(root, "wallpaper")
    os.makedirs(icons_dir, exist_ok=True)
    os.makedirs(wall_dir, exist_ok=True)

    render_app_icon(192, 0.86).save(os.path.join(icons_dir, "icon-192.png"))
    render_app_icon(512, 0.86).save(os.path.join(icons_dir, "icon-512.png"))
    render_app_icon(180, 0.86).save(os.path.join(icons_dir, "apple-touch-icon.png"))
    render_app_icon(512, 0.64).save(os.path.join(icons_dir, "icon-maskable-512.png"))
    make_library_icon(72).save(os.path.join(icons_dir, "library-media-pixel.png"))
    make_controller_icon(72).save(os.path.join(icons_dir, "games-controller-pixel.png"))
    make_wallpaper_preview().save(os.path.join(wall_dir, "preview.png"))
    print("Redesigned PNG icons written to", os.path.abspath(icons_dir))
