/**
 * 自動プレイの計測（runAll）を、いくつかのマシンに分けて回すための道具（.github/workflows/sim.yml から使う）。
 *
 * - 分けて回す（collect）：runAll をそのまま呼び、最初のセクタだけの回（onlyFirst）以外の runOnce に通し番号をつける。
 *   番号を分けた数で割った余りが自分の番の回だけ本当に回し、ほかは空の結果を返して先へ進む。
 *   onlyFirst の回（スキルを 1 つずつ外す比べ）はどのマシンでも本当に回すので、runAll の中の呼び出しの並びはどのマシンでも同じになる。
 * - まとめる（merge）：もう一度 runAll を呼び、通し番号ごとに、分けて回した結果を差し込む。表と所見は 1 台で回したときと同じものになる。
 *
 * 前提：runAll の中で、onlyFirst でない回の結果を使って次に回すものを決めていないこと（いまはどれも、結果をためるだけ）。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAll, SIM_SHARD, type Report2, type RunResult } from './sim';

/** 1 回ぶんの結果（通し番号・かかった時間・中身） */
export interface ShardRun {
  k: number;
  ms: number;
  key: string;
  r: RunResult;
}

/** JSON にしたときに失われるもの（Infinity・NaN・undefined）を、印のついた値に置き換える */
export function encode(v: unknown): unknown {
  if (v === undefined) return { $u: 1 };
  if (typeof v === 'number' && !Number.isFinite(v)) return { $n: String(v) };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = encode(x);
    return o;
  }
  return v;
}
export function decode(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === '$u') return undefined;
    if (keys.length === 1 && keys[0] === '$n') return Number(o.$n);
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = decode(o[k]);
    return out;
  }
  return v;
}

const keyOf = (p: string, seed: number, o: { ban?: string[] }) => `${p}/${seed}${o.ban?.length ? `/ban:${o.ban.join(',')}` : ''}`;

/** 分けて回す：n 台のうち i 番目（0 始まり）の分だけ本当に回し、その結果を返す */
export function collect(i: number, n: number, ablation = true): ShardRun[] {
  const out: ShardRun[] = [];
  let k = 0;
  SIM_SHARD.hook = (p, seed, o, real) => {
    const me = k++;
    if (me % n !== i) return { policy: p, seed, sectors: [], actions: {}, days: 0, done: false, skillsAt: [] } as unknown as RunResult;
    const t0 = performance.now();
    const r = real();
    out.push({ k: me, ms: performance.now() - t0, key: keyOf(p, seed, o), r });
    return r;
  };
  try {
    runAll(undefined, { ablation });
  } finally {
    SIM_SHARD.hook = null;
  }
  return out;
}

export function saveShard(path: string, runs: ShardRun[]) {
  writeFileSync(path, JSON.stringify(encode(runs)));
}
export function loadShards(dir: string): ShardRun[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => decode(JSON.parse(readFileSync(join(dir, f), 'utf8'))) as ShardRun[]);
}

/** まとめる：分けて回した結果を差し込みながら runAll を呼ぶ。足りない回・呼び出しの並びのずれは止める */
export function merge(runs: ShardRun[], ablation = true): Report2 {
  const byK = new Map(runs.map((x) => [x.k, x]));
  let k = 0;
  SIM_SHARD.hook = (p, seed, o) => {
    const me = k++;
    const x = byK.get(me);
    if (!x) throw new Error(`計測の ${me} 番が見つからない（${keyOf(p, seed, o)}）`);
    if (x.key !== keyOf(p, seed, o)) throw new Error(`計測の ${me} 番の中身がずれている（${x.key} ≠ ${keyOf(p, seed, o)}）`);
    return x.r;
  };
  let rep: Report2;
  try {
    rep = runAll(undefined, { ablation });
  } finally {
    SIM_SHARD.hook = null;
  }
  if (k !== runs.length) throw new Error(`計測の数が合わない（呼び出し ${k}・結果 ${runs.length}）`);
  // かかった時間は、分けて回した回の合計（1 台で回したときに近い数）
  rep.ms = runs.reduce((a, x) => a + x.ms, 0);
  return rep;
}
