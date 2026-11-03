// My Crypto Successor: the workshop's hammer sparks (docs/ISLAND_FX.md). Written against pixelfx 0.3.0's core
// (MIT, Copyright (c) 2026 Patch, Hugo Duprez) in its style; the game's own effect.
// 製造：小さな槌が少し振りかぶって打ち下ろされ、当たった所で白く光り、金の火花が上に散って床で跳ねる。槌は跳ね返って消える。0.8 秒
import { Particles, Lights, P, Rng, fit, sparkle, ease, clamp, WHITE, hex } from "../../core/index.js";

export const meta = {
  name: "Hammer sparks",
  desc: "A small hammer swings down onto the spot, a white flash, gold sparks fan up and bounce, the hammer lifts and fades.",
  tags: ["craft", "hammer", "sparks", "one-shot"],
  size: [84, 56],
  origin: [42, 46],
  duration: 0.8,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#3d1e17", "#704536", "#b55f1d", "#d4892f", "#f2b844", "#ffdb57", "#f7f0bc", "#ffffff"], seed: 2 },
};
const HIT = -6, LIFT = 0.07, SWING = 0.18;
const WOOD = ["#3d1e17", "#5e382a", "#805940", "#a17e5a"].map(hex), IRON = ["#181818", "#46577d", "#627e9e", "#82a8bf", "#c4eaf2"].map(hex);
const L = 13, PX = L, PY = HIT - 4;
// the hammer: a handle from the grip (PX, PY) to the head at angle a (pi = pointing left, y down)
function hammer(p, a, al) {
  const ca = Math.cos(a), sa = Math.sin(a), px = PX, py = PY;
  for (let d = 0; d <= L - 2; d += 0.5) p.dot(px + ca * d, py + sa * d, WOOD[3], al), p.dot(px + ca * d - sa, py + sa * d + ca, WOOD[1], al);
  // the head: a block across the handle's end
  const hx = px + ca * L, hy = py + sa * L, nx = -sa, ny = ca;
  for (let u = -4; u <= 4; u += 0.5)
    for (let v = -2; v <= 2; v += 0.5) {
      const x = hx + nx * u + ca * v, y = hy + ny * u + sa * v;
      p.dot(x, y, Math.abs(u) > 3.5 || Math.abs(v) > 1.6 ? IRON[0] : v < 0 ? IRON[3] : IRON[2], al);
    }
}
export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed);
  const ps = new Particles({ rng: R, ground: () => 0, sparks: [C[7], C[6], C[5], C[3]] }), lights = new Lights();
  let t = 0, hit = false;
  return {
    update(dt) {
      t += dt;
      if (!hit && t >= SWING) {
        hit = true;
        for (let i = 0; i < 14; i++) {
          const a = -Math.PI / 2 + R.range(-0.85, 0.75) - 0.1, sp = R.range(80, 170);
          ps.spawn(P.SPARK, R.range(-2, 2), HIT, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.25, 0.55), 0, 1, R.range(0, 0.03));
        }
        lights.add(0, HIT, 18, C[5], 0.7, 0.18);
      }
      ps.update(dt);
      lights.update(dt);
    },
    draw(p) {
      // a wind-up (it lifts a little higher), the swing down onto the spot, a bounce off it, and it's gone
      const up = ease.outQuad(clamp(t / LIFT)), s = ease.inQuad(clamp((t - LIFT) / (SWING - LIFT)));
      const e0 = t - SWING, bounce = e0 > 0 ? Math.sin(Math.PI * clamp(e0 / 0.16)) * 0.35 : 0;
      const a = Math.PI + (1.0 + 0.3 * up) * (1 - s) + bounce;
      if (t < SWING + 0.2) hammer(p, a, 1);
      const e = t - SWING;
      if (e > 0 && e < 0.08) sparkle(p, 0, HIT, 7 * (1 - e / 0.08), WHITE, C[6], 0.6);
      const k = e / 0.22;
      if (k > 0 && k < 1) p.ellipse(0, HIT + 1, 3 + 6 * ease.outCubic(k), (3 + 6 * ease.outCubic(k)) * 0.35, (d) => (d > 0.8 ? C[5] : 0), 1 - k);
      ps.draw(p, "front");
      lights.draw(p);
    },
  };
}
