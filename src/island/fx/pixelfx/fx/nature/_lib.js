// Copied from pixelfx 0.3.0 (https://github.com/patch-gg/pixelfx), MIT License,
// Copyright (c) 2026 Patch, Copyright (c) 2026 Hugo Duprez. See ../../LICENSE and ../../NOTICE.md.
// Changed: only drawLeaf is kept (the rest of the nature helpers are left out).

/**
 * A leaf len px long and wid px across at its widest, centered on (x, y), turned by ang and flipping about its
 * midrib by fl (radians: edge on at pi/2, its paler underside showing past it). A pointed blade, lit along its
 * upper half and shaded along the lower, a darker midrib, a stem, a dark rim. pal: [dark, shade, body, light]
 * (dark to bright). alpha dithers it out.
 */
export function drawLeaf(p, x, y, len, wid, ang, fl, pal, alpha = 1) {
  const ca = Math.cos(ang), sa = Math.sin(ang), sq = Math.cos(fl), w = Math.max(0.55, Math.abs(sq) * wid), under = sq < 0;
  const R = Math.ceil(len / 2 + 2), X = Math.round(x), Y = Math.round(y);
  const inside = (i, j) => {
    const u = (i + 0.5) * ca + (j + 0.5) * sa + len / 2, v = -(i + 0.5) * sa + (j + 0.5) * ca;
    if (u < 0 || u > len) return 0;
    const half = w * Math.pow(Math.sin((Math.PI * u) / len), 0.75);
    return Math.abs(v) <= half ? (v < 0 ? 1 : 2) : 0;
  };
  for (let j = -R; j <= R; j++)
    for (let i = -R; i <= R; i++) {
      const s = inside(i, j);
      if (!s) {
        if (inside(i - 1, j) || inside(i + 1, j) || inside(i, j - 1) || inside(i, j + 1)) p.dot(X + i, Y + j, pal[0], alpha);
        continue;
      }
      const u = (i + 0.5) * ca + (j + 0.5) * sa + len / 2, v = -(i + 0.5) * sa + (j + 0.5) * ca;
      const rib = Math.abs(v) < 0.5 && u > len * 0.12 && u < len * 0.88 && w > 1.2;
      p.dot(X + i, Y + j, rib ? pal[1] : (s === 1) !== under ? pal[3] : pal[2], alpha);
    }
  // the stem trails off the base
  p.dot(X - ca * (len / 2 + 1), Y - sa * (len / 2 + 1), pal[1], alpha);
}
