/**
 * 段 UIX1a：新しい部品の毎コマの呼び出し（1 つの rAF にまとめる。docs/ISLAND_UIX.md「性能」）。
 * 動かすものが無いあいだは rAF を回さない（地図の描画ループ p1/main.ts の frame とぶつからないよう、待機のときの負荷は 0）。
 * コマの時間を見て、重いときは効果を自動で減らす（fxScale・<html class="is-lite">）。
 */
type Task = (dt: number, now: number) => void;
const tasks = new Set<Task>();
let raf = 0;
let last = 0;
/** 粒の数の倍率（1 → 0.7 → 0.45）。重い端末では自動で下がる */
export const quality = { scale: 1, level: 2 };
const watchers = new Set<() => void>();
let frames = 0;
let acc = 0;
let slow = 0;

function frame(now: number) {
  raf = 0;
  const raw = last ? now - last : 16;
  last = now;
  const dt = Math.min(100, raw);
  for (const fn of [...tasks]) fn(dt, now);
  // 重い端末では、効果を自動で落とす（粒の数・走査線の流れる帯）。見本と同じ決まり：90 コマの平均が 22ms を 2 回続けて超えたら 1 段下げる
  frames++;
  acc += raw;
  if (frames >= 90) {
    const avg = acc / frames;
    frames = 0;
    acc = 0;
    if (avg > 22 && quality.level > 0 && ++slow >= 2) {
      slow = 0;
      quality.level--;
      quality.scale = quality.level === 1 ? 0.7 : 0.45;
      document.documentElement.classList.add('is-lite');
      for (const w of watchers) w();
    } else if (avg <= 22) slow = 0;
  }
  if (tasks.size) raf = requestAnimationFrame(frame);
  else last = 0;
}
function kick() {
  if (!raf && tasks.size && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
}

export const loop = {
  add(fn: Task): () => void {
    tasks.add(fn);
    kick();
    return () => tasks.delete(fn);
  },
  /** テスト用：1 コマ進める */
  run(dt: number, now = 0) {
    for (const fn of [...tasks]) fn(dt, now);
  },
  get size() {
    return tasks.size;
  },
};
/** 効果を落としたときに呼ぶ */
export const onQuality = (fn: () => void) => void watchers.add(fn);

/** 画面の時計で待つ（タブが隠れているあいだは進まない）。返した関数で取り消す */
export function later(ms: number, fn: () => void): () => void {
  let left = ms;
  let dead = false;
  const off = loop.add((dt) => {
    left -= dt;
    if (left <= 0) {
      off();
      if (!dead) fn();
    }
  });
  return () => {
    dead = true;
    off();
  };
}
