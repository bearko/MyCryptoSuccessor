// My Crypto Successor's own effect (not part of pixelfx), written against the pixelfx core in its style.
// A sale at a shop: a coin hops out of the door, spins up, glints at the top, flashes and pops into twinkles.
import { Lights, Rng, fit, clamp, seg, ease, WHITE, band } from "../../core/index.js";
import { Layer, coin, glint } from "../pickups/_lib.js";

export const meta = {
  name: "Coin pop",
  desc: "A sale: a gold ring on the ground at the door, a coin hops up spinning, glints at the top, flashes white and pops into twinkles with a thin ring.",
  tags: ["island", "coin", "sale", "one-shot"],
  size: [48, 60],
  origin: [24, 54],
  duration: 1.0,
  loop: false,
  fps: 30,
  bg: "ground",
  // the game's lantern gold (scripts/pixel/palette.mjs), dark to bright
  options: { palette: ["#3d1e17", "#704536", "#b55f1d", "#d4892f", "#f2b844", "#ffdb57", "#f7f0bc", "#ffffff"], seed: 2 },
};

const POP = 0.56, H = 24;

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), L = new Layer(24, 24), lights = new Lights();
  lights.add(0, -3, 14, C[5], 0.5, 0.2);
  // twinkles thrown up and out, each its own size, delay and life; they brake and sink a little as they go out
  const tw = Array.from({ length: 5 }, (_, i) => ({ a: -Math.PI / 2 + (i - 2) * 0.66 + R.range(-0.25, 0.25), sp: R.range(9, 19), d: i === 2 ? 0 : R.range(0, 0.07), life: R.range(0.24, 0.42), arm: i === 2 ? 2.4 : R.range(1, 1.8) }));
  // up fast, hang at the top (fast in, slow out)
  const y = (u) => -4 - H * ease.outCubic(clamp(u / POP));
  let t = 0;
  return {
    update(dt) {
      t += dt;
      if (t >= POP && t - dt < POP) lights.add(0, y(POP), 16, C[6], 0.6, 0.18);
      lights.update(dt);
    },
    draw(p) {
      // a ring on the ground at the door, flat like the map's diamonds
      const g = seg(t, 0, 0.32);
      if (g < 1) band(p, 0, 0, 3 + 10 * ease.outCubic(g), 0.45, 1, 1.2 - g, [C[3], C[4], C[5], C[6]]);
      if (t < POP) {
        // it turns face-on just as it flashes white
        coin(L, p, 0, y(t), 4, 0.2, (t - POP) * 15, C, t > POP - 0.05);
        if (t > 0.3 && t < 0.44) glint(p, -1, y(t) - 2, 2, WHITE, 0.4);
        return lights.draw(p);
      }
      const u = t - POP, cy = y(POP);
      const r = seg(u, 0, 0.14);
      if (u < 0.04) p.circle(0, cy, 3, C[6]);
      if (r < 1) p.ring(0, cy, 4 + 5 * ease.outCubic(r), 1, r < 0.3 ? C[7] : C[6], 1.1 - r * 1.1);
      for (const s of tw) {
        const a = u - s.d;
        if (a < 0 || a > s.life) continue;
        const k = 1 - a / s.life, d = s.sp * ease.outCubic(clamp(a / s.life));
        if (k < 0.25 && Math.floor(a * 30) % 2) continue;
        glint(p, Math.cos(s.a) * d, cy + Math.sin(s.a) * d + 14 * a * a, Math.round(s.arm * Math.min(1, k * 1.6)), k > 0.55 ? C[6] : C[5], 0.3 * k);
      }
      lights.draw(p);
    },
  };
}
