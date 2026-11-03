/**
 * 自動プレイの計測ハーネス（scripts/island/sim.ts）。
 * ふだんの `npm test` では短い通し（最短の方針・1 シード・タオックスだけ）でハーネスが壊れていないかを見る。
 * `npm run island:sim` のときだけ、3 方針 × 3 シードを回して docs/ISLAND_BALANCE.md を書き直す。
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runAll, runOnce, tables, observations, writeDoc } from '../scripts/island/sim';

const FULL = process.env.npm_lifecycle_event === 'island:sim' || !!process.env.ISLAND_SIM;

describe('自動プレイの計測ハーネス', () => {
  it.runIf(!FULL)('最短の方針でタオックスの 1 位まで回り、月数と行動の数が残る', () => {
    const r = runOnce('rta', 1, { onlyFirst: true });
    expect(r.done).toBe(true);
    expect(r.sectors[0].months).toBeGreaterThan(0);
    expect(r.sectors[0].actTop).toBeGreaterThan(0);
  });

  it.runIf(FULL)(
    '3 方針 × 3 シードを回して docs/ISLAND_BALANCE.md に表を書く',
    () => {
      const rep = runAll(undefined, { ablation: true });
      const path = 'docs/ISLAND_BALANCE.md';
      writeDoc(path, rep, existsSync(path) ? readFileSync(path, 'utf8') : null);
      console.log(tables(rep));
      console.log(observations(rep));
      console.log(`計測 ${(rep.ms / 1000).toFixed(1)} 秒`);
      expect(rep.runs.length).toBe(9);
    },
    // v25：計測が 60 分を超えるようになった（3,847 秒。v24 は 3,120 秒）ので 90 分に。v26：できごとなしの 9 回を足した（計測 4,075 秒）。CPU を分け合うと 2 時間を超えることがあるので 180 分に
    10_800_000,
  );
});
