// 段 UI7f（docs/ISLAND_PHASE1.md「倉庫があふれる先の見込み（段 UI7f）」）：月末の倉庫の中身を記録し、同じペースで伸ばして
// あふれる日を見込む。見積もり（このままの線があふれる日から下がる）・ヒーローの言葉・グラフの数字がそろう。予測が当たるか（自動で日を進めた実際の日との差）
import { describe, expect, it } from 'vitest';
import { MATS, PRODUCTS, sku, type Mat, type Sku } from '../src/island/p1/data';
import { deserializeP1, madeSkus, myShops, poolCap, poolUsed, procMats, recipeOf, serializeP1, step, type P1State } from '../src/island/p1/model';
import { planOf } from '../src/island/p1/plan';
import { briefOf } from '../src/island/p1/brief';
import { enqueue, newCards, planOfChoice, sayOf, shownRec, stockDraft, storeAct, type Card } from '../src/island/p1/card';
import { monthName, storeChart, storeFc, poolHist, storeNote } from '../src/island/p1/storefc';
import { longLine, projLines } from '../src/island/p1/slides';
import { EVENT_OFF } from '../src/island/p1/events';
import type { PropAct } from '../src/island/p1/deleg';
import { runOnce } from '../scripts/island/sim';

/** 最初の町（通常の自動プレイ。倉庫があり、置き場所 250 以上・作業台が動いている月）のセーブ。シードごとに 1 回 */
const saves = new Map<number, string>();
function town(seed: number): P1State {
  if (!saves.has(seed))
    runOnce('normal', seed, {
      onlyFirst: true,
      onMonth: (s, _sector, m) => {
        if (!saves.has(seed) && m >= 3 && poolCap(s) >= 250 && myShops(s).length && s.slots.some((x) => x.sku && x.worker != null)) saves.set(seed, serializeP1(s));
      },
    });
  const s = deserializeP1(saves.get(seed)!)!;
  s.tut = 99;
  s.money = 500_000;
  return s;
}
/**
 * 使わない素材が毎日入ってくる町（荒れ地の出土品のように）：いまの空きを span 日で埋める速さ。inj は 1 日ぶん入れる
 */
function inflow(s: P1State, span: number): () => void {
  const used = new Set<string>([...procMats(s).map((o) => o.m), ...madeSkus(s).flatMap((x) => Object.keys(recipeOf(x)))]);
  const dead = (Object.keys(MATS) as Mat[]).find((m) => !used.has(m))!;
  const per = (poolCap(s) - poolUsed(s)) / span;
  let carry = 0;
  return () => {
    carry += per;
    const n = Math.floor(carry);
    carry -= n;
    s.mats[dead] = (s.mats[dead] ?? 0) + n;
  };
}
/** 月の締めの日まで進める（記録がそろう） */
function toMonthEnd(s: P1State, inj: () => void) {
  do {
    inj();
    step(s);
  } while ((s.day - (s.open ?? 0)) % 30 !== 0);
}

describe('月末の倉庫の記録', () => {
  it('月の締めごとに報告に残り、セーブを通っても残る。古いセーブ（記録なし）は先月の流れの数から見込む', () => {
    EVENT_OFF.on = true;
    try {
      const s = town(1);
      const h = poolHist(s);
      expect(h.length).toBeGreaterThanOrEqual(2);
      const last = s.reports[s.reports.length - 1].pool!;
      expect(last.mats + last.goods).toBe(Math.round(poolUsed(s)));
      expect(last.cap).toBe(poolCap(s));
      const back = deserializeP1(serializeP1(s))!;
      expect(poolHist(back)).toEqual(h);
      // 古いセーブ：記録が無い
      for (const r of back.reports) delete r.pool;
      const f = storeFc(back);
      expect(f.hist.length).toBe(0);
      expect(f.src).toBe('flow');
    } finally {
      EVENT_OFF.on = false;
    }
  });
});

describe('あふれる日の予測が当たるか（自動で日を進めた実際の日との差）', () => {
  it('使わない素材が毎日入る町：2 か月の記録から見込んだ日と、実際に置き場所を超えた日の差（中央値 30% 以内）', () => {
    EVENT_OFF.on = true;
    try {
      const rows: { seed: number; span: number; pred: number; real: number }[] = [];
      for (const seed of [1, 2, 3])
        for (const span of [180, 260]) {
          const s = town(seed);
          const inj = inflow(s, span);
          for (let d = 0; d < 60; d++) {
            inj();
            step(s);
          }
          toMonthEnd(s, inj);
          const f = storeFc(s);
          expect(f.src).toBe('hist');
          expect(f.days).not.toBeNull();
          let k = 0;
          while (poolUsed(s) < poolCap(s) && k < 400) {
            inj();
            step(s);
            k++;
          }
          rows.push({ seed, span, pred: f.days!, real: k });
        }
      const err = rows.map((r) => Math.abs(r.pred - r.real) / Math.max(1, r.real)).sort((a, b) => a - b);
      const med = (err[2] + err[3]) / 2;
      console.log(rows.map((r) => `seed ${r.seed} span ${r.span}: 予測 ${r.pred.toFixed(0)} 日・実際 ${r.real} 日`).join('\n'), `\n中央値 ${(med * 100).toFixed(0)}%`);
      expect(med).toBeLessThanOrEqual(0.3);
      // 入る速さが速いほど、早くあふれる見込み（シードごと）
      for (const seed of [1, 2, 3]) {
        const [a, b] = rows.filter((r) => r.seed === seed);
        expect(a.pred).toBeLessThan(b.pred);
      }
    } finally {
      EVENT_OFF.on = false;
    }
  });
});

describe('8 割の倉庫：あふれる先の損を見積もり、グラフを指して言う', () => {
  /** 使わない素材が入り続け、月末に倉庫が 8 割を超えた町 */
  function eighty(): P1State {
    const s = town(1);
    const inj = inflow(s, 120);
    for (let n = 0; n < 8; n++) {
      toMonthEnd(s, inj);
      if (poolUsed(s) >= poolCap(s) * 0.8) break;
    }
    expect(poolUsed(s) / poolCap(s)).toBeGreaterThanOrEqual(0.8);
    expect(poolUsed(s)).toBeLessThan(poolCap(s));
    return s;
  }
  it('このままの線はあふれる日から下がり、倉庫の手はあふれる日を延ばす。要約の一言・カードのセリフ・グラフの札がそろう', () => {
    EVENT_OFF.on = true;
    try {
      const s = eighty();
      const f = storeFc(s);
      expect(f.days).not.toBeNull();
      s.cards = newCards();
      const d = stockDraft(s)!;
      expect(d).toBeTruthy();
      const fix = d.choices.find((c) => c.act.k === 'do' && storeAct(c.act.a))!;
      expect(fix).toBeTruthy();
      const plan = planOf(s, [(fix.act as { a: PropAct }).a], { hero: d.hero, q: 0.9, dept: 'logistics' });
      const B = briefOf(s, plan);
      const M = B.vals.months!;
      expect(M).toBeTruthy();
      expect(M.full0).not.toBeNull();
      expect(Math.abs(M.full0! - f.days!)).toBeLessThan(1);
      // 承認後は置き場所が増えて、あふれる日が延びる（来ない）
      expect(M.full1 == null || M.full1 > M.full0!).toBe(true);
      // このままの月の利益は、あふれたあと（在庫を売り切ると）下がる（作る数が減る）。承認後はその分が後ろにずれる
      expect(M.ramp ?? M.cut).toBeGreaterThan(0);
      expect(M.now[11]).toBeLessThan(M.now[1]);
      expect(M.after.reduce((a, v) => a + v, 0)).toBeGreaterThan(M.now.reduce((a, v) => a + v, 0) - 1e-6);
      // 折れ線の縦の点線・説明の行
      expect(projLines(B, (x) => x, (u) => `${u}`).some((x) => x.includes('あふれ'))).toBe(true);
      const L = longLine(B);
      expect(L.now.length).toBe(12);
      // 推奨が承認なら、要約の一言はあふれる先から
      if (B.rec === 'ok') expect(B.pitch).toContain('あふれ');
      // グラフ：同じペースの予想で置き場所を超える月の札があり、承認後の容量の線
      const c = storeChart(s, null);
      expect(c.days0).toBeCloseTo(f.days!, 6);
      if (f.days! <= 6 * 30) expect(c.over0).not.toBeNull();
      expect(c.bars.filter((b) => !b.fc).length).toBeGreaterThanOrEqual(2);
      // カード：推奨とセリフの結び
      const card = enqueue(s, d) as Card;
      const best = card.choices[shownRec(s, card)];
      const say = sayOf(s, card);
      if (best.act.k === 'do' && storeAct(best.act.a)) {
        expect(say).toContain('グラフのとおり');
        expect(say).toContain('あふれ');
      } else if (best.act.k === 'skip') expect(say).toContain('このまま');
    } finally {
      EVENT_OFF.on = false;
    }
  });
  it('増えていない倉庫（9 割でも同じ量のまま）：あふれる日は無く、見積もりはいままでどおり', () => {
    EVENT_OFF.on = true;
    try {
      const s = town(2);
      const none = () => {};
      toMonthEnd(s, none);
      toMonthEnd(s, none);
      const f = storeFc(s);
      // 自動の流れだけでは、置き場所はほぼ横ばい（月 ±数十個）
      if (f.days == null) {
        const B = briefOf(s, planOf(s, [{ k: 'ad', id: 'flyer' }], { hero: null, q: 0.9, dept: 'marketing' }));
        expect(B.vals.months?.full0 ?? null).toBeNull();
      } else expect(f.days).toBeGreaterThan(0);
    } finally {
      EVENT_OFF.on = false;
    }
  });
});

describe('提案書の「いま」の一言は、その提案書の手に合わせる（倉庫・在庫の提案）', () => {
  /** 一言の手：倉庫・拠点の手・いまの素材で作る・売りさばく・このまま */
  const kindOf = (say: string) => (say.includes('いまの素材で作') ? 'useup' : say.includes('売りさばこう') ? 'clear' : /(倉庫|拠点)[^。]*(強化|建て)/.test(say) ? 'store' : say.includes('このまま') ? 'skip' : 'other');
  const actKind = (a: PropAct) => (storeAct(a) ? 'store' : a.k === 'useup' ? 'useup' : a.k === 'clear' ? 'clear' : 'other');
  it('8 割で増えている倉庫・素材で埋まった倉庫・売れ残りの商品で埋まった倉庫：選択肢ごとの一言の手 ＝ 提案書の承認事項の手。開かないときの一言は推奨の手', () => {
    EVENT_OFF.on = true;
    try {
      const scenes: P1State[] = [];
      // 8 割で増えている
      {
        const s = town(1);
        const inj = inflow(s, 120);
        for (let n = 0; n < 8 && poolUsed(s) < poolCap(s) * 0.8; n++) toMonthEnd(s, inj);
        scenes.push(s);
      }
      // 素材で埋まった（入荷が止まる）
      {
        const s = town(2);
        const made = madeSkus(s);
        for (const m of Object.keys(s.mats)) s.mats[m as Mat] = 0;
        const x = PRODUCTS.filter((p) => !p.tech && !p.relic && (p.tier ?? 'C') === 'C').map((p) => sku(p.key, 'C')).find((y) => !made.includes(y))!;
        const r = PRODUCTS.find((p) => p.key === x.split(':')[0])!.recipe.C;
        const per = Object.values(r).reduce<number>((a, q) => a + (q ?? 0), 0);
        for (const [m, q] of Object.entries(r)) s.mats[m as Mat] = Math.ceil(((q ?? 0) / per) * poolCap(s));
        scenes.push(s);
      }
      // 売れ残りの商品で埋まった（作っていない商品の在庫）
      {
        const s = town(3);
        const made = madeSkus(s);
        const x = PRODUCTS.filter((p) => !p.tech && !p.relic && (p.tier ?? 'C') === 'C').map((p) => sku(p.key, 'C')).find((y) => !made.includes(y))! as Sku;
        s.stock[x] = Math.round(poolCap(s) * 0.9 - poolUsed(s));
        scenes.push(s);
      }
      let n = 0;
      const seen = new Set<string>();
      for (const s of scenes) {
        s.cards = newCards();
        const d = stockDraft(s);
        if (!d) continue;
        const c = enqueue(s, d) as Card;
        // 開かないとき（カード）：推奨の手
        const rk = c.choices[shownRec(s, c)];
        const k0 = kindOf(sayOf(s, c));
        if (rk.act.k === 'do') expect(k0).toBe(actKind(rk.act.a));
        c.choices.forEach((ch, k) => {
          if (ch.act.k !== 'do') return;
          const plan = planOfChoice(s, c, k)!;
          const say = sayOf(s, c, k);
          // 承認事項の手（提案書の 1 つ目の手）と、一言の手
          expect({ say, kind: kindOf(say) }).toEqual({ say, kind: actKind(plan.acts[0]) });
          // ほかの手の名前を言わない
          if (actKind(plan.acts[0]) === 'store') expect(say).not.toContain('いまの素材で作');
          if (actKind(plan.acts[0]) === 'useup') expect(say).not.toContain('強化すれば');
          seen.add(actKind(plan.acts[0]));
          n++;
        });
      }
      expect(n).toBeGreaterThanOrEqual(5);
      expect([...seen].sort()).toEqual(['clear', 'store', 'useup']);
    } finally {
      EVENT_OFF.on = false;
    }
  });
  it('グラフの札と下の文は、横軸と同じ暦の月（「7 月にあふれる」「9 月まで持つ」・年をまたげば「来年 2 月」）', () => {
    const s = town(1);
    const inj = inflow(s, 120);
    for (let k = 0; k < 8 && poolUsed(s) < poolCap(s) * 0.8; k++) toMonthEnd(s, inj);
    const c = storeChart(s, { cap: poolCap(s) + 100, free: 0 });
    const note = storeNote(c);
    expect(note).toMatch(/このまま：(来年 )?\d+ 月にあふれる/);
    expect(note).not.toContain('か月目');
    for (const b of c.bars) expect(b.name).toMatch(/^(来年 |\d+ 年後の )?\d+ 月$/);
    // 暦：通算の月 → 月（年をまたぐ）
    const s2 = { day: 300, open: 0 } as P1State;
    expect(monthName(s2, 11)).toBe('11 月');
    expect(monthName(s2, 14)).toBe('来年 2 月');
  });
});
