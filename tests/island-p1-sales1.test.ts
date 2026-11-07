/**
 * 段 SALES1：販売のテコ入れ（エクステの単価を下げ、1 日に売れる数を増やす・自社どうしの取り合いを減らす）。
 * docs/ISLAND_PHASE1.md「売れ方（単価・個数・取り合い）」
 */
import { describe, expect, it } from 'vitest';

const PROBE = !!process.env.SALES1_PROBE;

describe('段 SALES1：下調べ', () => {
  it.runIf(PROBE)(
    '下調べ：通常の自動プレイのランクごとの売れ方',
    async () => {
      const { salesProbe, probeTable } = await import('../scripts/island/salesprobe');
      const p = salesProbe((process.env.SALES1_POLICY as 'normal' | 'rta' | 'full') ?? 'normal', Number(process.env.SALES1_SEED ?? 1));
      console.log(probeTable(p));
      expect(p.tiers.length).toBeGreaterThan(0);
    },
    3_600_000,
  );
});
