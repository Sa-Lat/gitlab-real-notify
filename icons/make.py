# Erzeugt die Toolbar-Icons: Git-Branch-Symbol auf der Plakette.
#   icon*  Akzent-Pink, Normalzustand
#   busy*  Lila, solange GitLab abgefragt wird
# und das GitHub-Social-Preview (.github/social-preview.png, 1280×640).
#
#   python icons/make.py   (braucht Pillow)

import pathlib
from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 512  # groß zeichnen, dann verkleinern -> saubere Kanten
INK = (42, 31, 53, 255)
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
PINK = ((255, 214, 228), (240, 103, 155))
LILAC = ((226, 218, 255), (157, 136, 240))


def plaque(top, bottom):
    shade = lambda y: tuple(int(a + (b - a) * y / S) for a, b in zip(top, bottom)) + (255,)
    img = Image.new("RGBA", (S, S))
    d = ImageDraw.Draw(img)
    for y in range(S):
        d.line([(0, y), (S, y)], fill=shade(y))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=112, fill=255)
    img.putalpha(mask)

    w = 40                                     # Strichstärke
    main_x, top_y, bot_y = 180, 120, 392       # Stamm links
    side = (340, 150)                          # abzweigender Ast oben rechts
    join_y = 330                               # dort mündet der Ast in den Stamm

    d.line([(main_x, top_y), (main_x, bot_y)], fill=INK, width=w)
    # Ast als kubische Bézierkurve: senkrecht runter, dann weich in den Stamm.
    p0, p1, p2, p3 = (side[0], side[1]), (side[0], 280), (main_x, 250), (main_x, join_y)
    pts = []
    for i in range(101):
        t = i / 100
        u = 1 - t
        pts.append((u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                    u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]))
    d.line(pts, fill=INK, width=w, joint="curve")
    for x, y in pts[::4]:
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=INK)  # Lücken im Bogen schließen

    # Knoten als Ringe, innen in der Plakettenfarbe an genau der Höhe.
    for x, y in [(main_x, top_y), (main_x, bot_y), side]:
        d.ellipse([x - 58, y - 58, x + 58, y + 58], fill=INK)
        d.ellipse([x - 22, y - 22, x + 22, y + 22], fill=shade(y))

    return img


def make(colors, name):
    img = plaque(*colors)
    for n in (16, 48, 128):
        img.resize((n, n), Image.LANCZOS).save(HERE / f"{name}{n}.png")


def social():
    # Farben aus dem Dunkelmodus von theme.css.
    W, H = 1280, 640
    img = Image.new("RGBA", (W, H), (34, 26, 43, 255))           # --bg
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([-200, -380, 900, 520], fill=(255, 143, 181, 60))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(140)))

    font = lambda f, size: ImageFont.truetype(str(ROOT / "fonts" / f), size)
    display = font("baloo-2-latin-800-normal.woff2", 92)
    body = font("outfit-latin-400-normal.woff2", 36)
    chip = font("outfit-latin-600-normal.woff2", 26)

    # Raster: Plakette oben = Oberkante der Überschrift, Plakette unten = Chips unten.
    P = 232
    top = (H - P) // 2
    bottom = top + P
    cap = lambda f: -f.getbbox("H", anchor="ls")[1]  # Versalhöhe über der Grundlinie (H: flach, ohne Überhang)
    img.alpha_composite(plaque(*PINK).resize((P, P), Image.LANCZOS), (96, top))
    d = ImageDraw.Draw(img)
    x = 384

    # Oberlängen (b, l, f) sind die höchste Kante der Überschrift — die bündig zur Plakette.
    title = "GitLab Real Notify"
    title_base = top - display.getbbox(title, anchor="ls")[1]
    d.text((x, title_base), title, font=display, fill=(246, 238, 246), anchor="ls")  # --ink

    chip_h = 48
    chip_top = bottom - chip_h
    # Claim mittig zwischen Überschrift und Chips.
    claim_base = title_base + (chip_top - title_base + cap(body)) // 2
    d.text((x, claim_base), "Review me, maybe?", font=body,
           fill=(201, 184, 210), anchor="ls")                                          # --label

    cx = x
    for label in ("Chrome", "Firefox", "read_api", "kein Backend"):
        w = d.textlength(label, font=chip)
        d.rounded_rectangle([cx, chip_top, cx + w + 40, bottom - 1], radius=chip_h // 2,
                            fill=(46, 35, 56), outline=(133, 113, 153), width=2)   # --panel, --field-line
        d.text((cx + 20, chip_top + chip_h // 2), label, font=chip, fill=(246, 238, 246), anchor="lm")
        cx += w + 56

    out = ROOT / ".github" / "social-preview.png"
    out.parent.mkdir(exist_ok=True)
    img.convert("RGB").save(out, optimize=True)


make(PINK, "icon")
make(LILAC, "busy")
social()
