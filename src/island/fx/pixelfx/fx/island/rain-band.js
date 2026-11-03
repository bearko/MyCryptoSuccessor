// My Crypto Successor: rain over a band of the screen for the rank-up disaster (docs/ISLAND_FX.md). Written against
// pixelfx 0.3.0's core (MIT, Copyright (c) 2026 Patch, Hugo Duprez) in its style; the game's own effect.
// 災害の雨：画面の一部（町の札の帯）だけに、細い斜めの雨すじ（奥は暗く短く・手前は明るく長く）が降り、床で小さくはねる。
// 帯の上から稲光が 1 本、2 コマ光ってもう一度ちらつく。ループ 2.6 秒。count（粒の数）・bolt（稲光）で軽くできる
import { fit, smooth, rng, bolt, WHITE } from "../../core/index.js";

export const meta = {
  name: "Rain band",
  desc: "Rain over a band of the screen: thin slanted streaks, dim far and bright near, tiny splashes on the floor, a bolt now and then.",
  tags: ["weather", "rain", "storm", "loop"],
  size: [180, 100],
  origin: [90, 94],
  duration: 2.6,
  loop: true,
  fps: 30,
  bg: "dark",
  options: { palette: ["#2e365c", "#3c547d", "#557b9e", "#73a6bf", "#94d2e0", "#c4eaf2", "#ffffff"], count: 170, bolt: true, seed: 5 },
};

const W2 = 90, TOP = -84, SLANT = 0.28, BOLT = [0.3, 0.36];

// 帯の端で薄くする（四角く見えないように）
const edge = (x, y) => smooth(0, 14, W2 - Math.abs(x)) * smooth(0, 12, y - TOP);

export function draw(p, t, o) {
  const C = fit(o.palette, 7), T = meta.duration;
  // 粒は等間隔に生まれる（どのコマでもだいたい同じ数が見える）。ループの継ぎ目が出ないよう、生まれる時刻は周期で回す
  const n = o.count;
  for (let i = 0; i < n; i++) {
    const r = rng(o.seed, i, 911), born = ((i + r.next() * 0.7) / n) * T, life = r.range(0.32, 0.5);
    const age = (((t - born) % T) + T) % T;
    if (age >= life) continue;
    const near = r.chance(0.4), fall = life - 0.1, x0 = r.range(-W2, W2 + 26);
    const floor = near ? -r.range(0, 3) : -r.range(4, 10);
    if (age < fall) {
      const u = age / fall, y = Math.round(TOP + (floor - TOP) * u), x = x0 - (y - TOP) * SLANT;
      const len = near ? 8 : 4, k = edge(x, y);
      if (k <= 0) continue;
      // 頭は明るく、尾は暗く。尾の最後の 2 ドットだけディザで薄れる（すじが点線に見えないように）
      for (let d = 0; d < len; d++) {
        const c = d === 0 ? (near ? C[5] : C[3]) : d < len / 2 ? (near ? C[4] : C[2]) : near ? C[3] : C[1];
        p.dot(x + d * SLANT, y - d, c, k * (d < len - 2 ? 1 : 0.55));
      }
      continue;
    }
    // はね：2 ドットが左右に跳ねて消える（手前の粒は床にも 1 ドット）
    const sp = (age - fall) / 0.1, x = x0 - (floor - TOP) * SLANT, k = edge(x, floor) * (1 - sp * 0.6);
    if (k <= 0) continue;
    p.dot(x - 1 - sp * 2, floor - 1 - sp * 1.5, C[near ? 5 : 3], k);
    p.dot(x + 1 + sp * 2, floor - 1 - sp * 1.5, C[near ? 5 : 3], k);
    if (near) p.dot(x, floor, C[4], k);
  }
  if (!o.bolt) return;
  // 稲光：帯の上から 2 コマ光って、もう一度ちらつく
  const ph = t / T;
  for (const [i, b] of BOLT.entries()) {
    const e = (ph - b) * T;
    if (e < 0 || e > 0.09) continue;
    const r = rng(o.seed, 77), x0 = r.range(-40, 40), pts = bolt(r, x0, TOP + 2, x0 + r.range(-16, 16), -18, { jag: 0.28, depth: 4 });
    const k = i === 0 ? 1 : 0.6;
    p.polyline(pts, WHITE, k);
    p.polyline(pts.map(([x, y]) => [x + 1, y]), C[5], k * 0.8);
    for (const [x, y] of pts.filter((_, n) => n % 4 === 0)) p.glow(x, y, 8, C[5], 0.35 * k);
    // 帯を照らす光（広すぎると重いので半径 48 まで）
    p.glow(x0, TOP + 36, 48, C[4], 0.22 * k);
  }
}
