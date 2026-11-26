#!/usr/bin/env python3
"""
2×2 の空き地の土台（scripts/island/bases/empty_2x2.png・400×340）を、1×2 の土台（empty_2x1.png）を 2 本つなげて作る。
  python3 scripts/island/base2x2.py scripts/island/bases/empty_2x1.png scripts/island/bases/empty_2x2.png
つなぎ目の歩道は土の色で塗りつぶし、両端の出っ張りは同じ辺のれんが 4 つぶん先を写して直す。
"""
import sys
from PIL import Image, ImageFilter
src, out = sys.argv[1], sys.argv[2]
b = Image.open(src).convert('RGBA')  # 300x255, front corner (100, 224)
W, H = 400, 340
def comp(order):
    c = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for off in order:
        c.alpha_composite(b, off)
    return c
front, back = (100, 85), (0, 30)
c = comp([back, front])
# dirt palette from the interior of the 2x1
inner = b.crop((120, 120, 200, 160))
dirt = set(inner.getdata())  # noqa
alpha = c.split()[3].point(lambda v: 255 if v > 0 else 0)
er = alpha.filter(ImageFilter.MinFilter(29))
px = c.load(); m = er.load()
# dirt texture source: the 2x1 dirt tiled
tex = Image.new('RGBA', (W, H))
for y in range(0, H, 40):
    for x in range(0, W, 80):
        tex.paste(inner, (x, y))
t = tex.load()
n = 0
for y in range(H):
    for x in range(W):
        if m[x, y] and px[x, y] not in dirt:
            px[x, y] = t[x, y]; n += 1
c.save(out)
print('fixed', n, c.getbbox())
# 継ぎ目の両端の出っ張り：同じ辺の、れんが 4 つぶん先のきれいな所を写す
def patch(box, d):
    x0, y0, x1, y1 = box
    src = c.crop((x0 + d[0], y0 + d[1], x1 + d[0], y1 + d[1]))
    c.paste(src, (x0, y0))
patch((270, 136, 310, 166), (-40, -22))
patch((88, 232, 128, 266), (40, 22))
c.save(out)
