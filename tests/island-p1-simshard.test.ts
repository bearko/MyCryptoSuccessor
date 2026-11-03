/**
 * 自動プレイの計測を分けて回す道具（scripts/island/simshard.ts・.github/workflows/sim.yml）。
 * ふだんの `npm test` では、結果の書き出しと読み込みが中身を失わないかだけを見る。
 * - SIM_SHARD=i/n と SIM_OUT=ファイル があるとき：n 台のうち i 番目の分を回して書き出す
 * - SIM_MERGE=フォルダ があるとき：書き出した結果をまとめて docs/ISLAND_BALANCE.md を書き直す
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SEEDS, tables, observations, writeDoc } from '../scripts/island/sim';
import { collect, decode, encode, loadShards, merge, saveShard } from '../scripts/island/simshard';

const SHARD = process.env.SIM_SHARD;
const MERGE = process.env.SIM_MERGE;

describe('計測を分けて回す道具', () => {
  it('書き出しと読み込みで Infinity・NaN・undefined・配列の穴を失わない', () => {
    const v = { a: Infinity, b: -Infinity, c: NaN, d: undefined, e: [1, undefined, null, Infinity], f: { g: 'x', h: [] as number[] }, i: null };
    const back = decode(JSON.parse(JSON.stringify(encode(v)))) as typeof v;
    expect(back.a).toBe(Infinity);
    expect(back.b).toBe(-Infinity);
    expect(back.c).toBeNaN();
    expect('d' in back).toBe(true);
    expect(back.d).toBeUndefined();
    expect(back.e.length).toBe(4);
    expect(back.e[1]).toBeUndefined();
    expect(1 in back.e).toBe(true);
    expect(back.e[2]).toBeNull();
    expect(back.e[3]).toBe(Infinity);
    expect(back.f).toEqual({ g: 'x', h: [] });
    expect(back.i).toBeNull();
  });

  it.runIf(!!SHARD)(
    '分けた分を回して書き出す',
    () => {
      const [i, n] = SHARD!.split('/').map(Number);
      const runs = collect(i, n);
      saveShard(process.env.SIM_OUT ?? `sim-shard-${i}.json`, runs);
      console.log(`分けた計測 ${i + 1}/${n}：${runs.length} 回・${(runs.reduce((a, x) => a + x.ms, 0) / 1000).toFixed(1)} 秒`);
      expect(runs.every((x) => x.k % n === i)).toBe(true);
    },
    10_800_000,
  );

  it.runIf(!!MERGE)(
    '分けて回した結果をまとめて docs/ISLAND_BALANCE.md に書く',
    () => {
      const rep = merge(loadShards(MERGE!));
      const path = 'docs/ISLAND_BALANCE.md';
      writeDoc(path, rep, existsSync(path) ? readFileSync(path, 'utf8') : null);
      console.log(tables(rep));
      console.log(observations(rep));
      expect(rep.runs.length).toBe(3 * SEEDS.length);
    },
    3_600_000,
  );
});
