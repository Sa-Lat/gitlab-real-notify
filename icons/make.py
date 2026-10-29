# Erzeugt die Toolbar-Icons: Git-Branch-Symbol auf der Plakette.
#   icon*  Akzent-Pink, Normalzustand
#   busy*  Lila, solange GitLab abgefragt wird
#
#   python icons/make.py   (braucht Pillow)

import pathlib
from PIL import Image, ImageDraw

S = 512  # groß zeichnen, dann verkleinern -> saubere Kanten
INK = (42, 31, 53, 255)
HERE = pathlib.Path(__file__).resolve().parent


def make(top, bottom, name):
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

    for n in (16, 48, 128):
        img.resize((n, n), Image.LANCZOS).save(HERE / f"{name}{n}.png")


make((255, 214, 228), (240, 103, 155), "icon")
make((226, 218, 255), (157, 136, 240), "busy")
