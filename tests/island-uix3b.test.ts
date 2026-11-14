// 段 UIX3b：事業の画面（調達・お店・サプライチェーン・素材 → 商品・販売管理・在庫と倉庫・商圏の取り合い・関税・問い合わせ・顧客満足度・
// 市場の見通し・広報・宣伝広報・市場調査・まとめた画面の器）の新しい画面（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md）。
// 入のときだけ新しい画面に分かれること・今の目印が残ること・出す中身が今の画面とそろうこと・主役のキーが前の層に出ること・
// 動きを減らすと全部すぐ出ること。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { uxsDeps } from '../src/island/p1/uxs';
import { uxbDeps } from '../src/island/p1/uxb';
import { uxb } from '../src/island/uix/screens/b-slots';
import { quitLeft, riskLamps } from '../src/island/uix/screens/trade';
import { cheaperThere } from '../src/island/uix/screens/tariff';
import { PART_SEEN_PX, seenPart } from '../src/island/uix/screens/together';
import { STOCK_STAMP_MS } from '../src/island/uix/screens/stock';
import { orderEta, orderWhy } from '../src/island/uix/screens/buy';
import { shelfLook, shopTabs } from '../src/island/uix/screens/shop';
import { STAGES, beltDots } from '../src/island/uix/screens/supply';
import { firstReply, gradeStars } from '../src/island/uix/screens/cs';
import { marginRate, stackParts } from '../src/island/uix/screens/biz';
import { RARE_AREA } from '../src/island/p1/data';

const src = (f: string) => readFileSync(new URL(`../src/island/${f}`, import.meta.url), 'utf8');
const FILES = ['buy.ts', 'shop.ts', 'supply.ts', 'biz.ts', 'cs.ts', 'trade.ts', 'tariff.ts', 'stock.ts', 'together.ts', 'b-kit.ts', 'b-icons.ts', 'b-boot.ts', 'b-deps.ts', 'b-slots.ts'];
const CSS_FILES = ['buy.css', 'shop.css', 'supply.css', 'biz.css', 'cs.css', 'trade.css', 'stock.css', 'together.css', 'b-kit.css'];
const CSS = CSS_FILES.map((f) => [f, src(`uix/screens/${f}`).replace(/\/\*[\s\S]*?\*\//g, '')] as const);
/** 入口（本体のファイル）と、差し込み口の名前 */
const ENTRIES: [string, string][] = [
  ['p1/screens.ts', 'buy'],
  ['p1/screens.ts', 'shop'],
  ['p1/scm.ts', 'supply'],
  ['p1/screens.ts', 'bom'],
  ['p1/sales.ts', 'sales'],
  ['p1/screens.ts', 'ads'],
  ['p1/screens.ts', 'data'],
  ['p1/csui.ts', 'inbox'],
  ['p1/csui.ts', 'sat'],
  ['p1/csui.ts', 'forecast'],
  ['p1/csui.ts', 'pr'],
  ['p1/tradeui.ts', 'trade'],
  ['p1/tariffui.ts', 'tradeCmp'],
  ['p1/stockui.ts', 'clear'],
  ['p1/stockui.ts', 'shelfChoice'],
  ['p1/stockui.ts', 'rankUp'],
];

afterEach(() => {
  for (const k of Object.keys(uxb)) delete (uxb as Record<string, unknown>)[k];
});

describe('切り替え：入のときだけ新しい画面に分かれる（切のときは今の画面のまま）', () => {
  it('差し込み口は、はじめは空。入れ物は uix/hooks.ts、中身を入れるのは b-boot.ts（s-boot.ts の install から 1 行で呼ぶ）', () => {
    expect(Object.keys(uxb)).toEqual([]);
    expect(src('uix/screens/b-slots.ts').match(/^import (?!type )/gm)).toBeNull();
    expect(src('uix/hooks.ts')).toContain('export const uxbSlots: UxbScreens = {};');
    expect(src('uix/screens/s-boot.ts')).toContain('installB(d.b);');
    expect(src('p1/uxs.ts')).toContain('b: uxbDeps,');
    expect(uxsDeps.b).toBe(uxbDeps);
    const boot = src('uix/screens/b-boot.ts');
    for (const [, k] of ENTRIES) expect(boot, k).toContain(`uxb.${k} = `);
    expect(boot).toContain('uxb.together = ');
  });
  it('入口：どの画面も、差し込み口の新しい画面へ渡すだけ（段 UIX5a で、切のときだけ通っていた今の中身は外した）', () => {
    for (const [f, k] of ENTRIES) expect(src(f), `${f}: ${k}`).toMatch(new RegExp(`return uxb\\.${k}!\\([^\\n]*\\);\\n\\}`));
    expect(src('p1/screens.ts')).toContain('uxb.together?.(body, focus);');
    // 本体から新しい画面を直接読んでいる所は無い（読んでよいのは、空の差し込み口だけ）
    for (const f of ['p1/screens.ts', 'p1/scm.ts', 'p1/sales.ts', 'p1/csui.ts', 'p1/tradeui.ts', 'p1/tariffui.ts', 'p1/stockui.ts', 'p1/uxb.ts']) expect(src(f), f).not.toMatch(/from '\.\.\/uix\/screens\/(?![a-z]-slots')/);
  });
  it('新しい画面の束は、本体のモジュールを自分では読まない（型だけ）。関数は p1/uxb.ts から渡す', () => {
    for (const f of FILES) {
      const code = src(`uix/screens/${f}`);
      expect(code, f).not.toMatch(/from '\.\/(micons|mhooks|mapui|hud|pop|dock)'/);
      for (const m of code.matchAll(/^import (type )?[^;]*? from '([^']+)';/gms)) {
        const outside = /^\.\.\/\.\.\//.test(m[2]);
        if (outside && !m[1]) expect(m[2], `${f}: ${m[0].slice(0, 60)}`).toBe('../../../i18n');
      }
      for (const m of code.matchAll(/\bB\.([A-Za-z_]\w*)/g)) expect(Object.keys(uxbDeps), `${f}: B.${m[1]}`).toContain(m[1]);
    }
  });
  it('新しい CSS は、すべて html.is-uxc の内側。足す class は uxb-（部品の中は uxp- を整えるだけ）。角は丸めない・字は 16px 以上', () => {
    for (const [f, css] of CSS) {
      const flat = css.replace(/@(media|supports)[^{]*\{/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
      for (const m of flat.matchAll(/(^|\})\s*([^{}@]+)\{/g)) for (const sel of m[2].split(',')) if (sel.trim()) expect(sel.trim(), f).toMatch(/^html\.is-uxc[ .:#]/);
      expect(css, f).not.toMatch(/border-radius\s*:\s*[1-9.]/);
      expect(css, f).not.toMatch(/backdrop-filter/);
      for (const m of css.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) expect(Number(m[1]) * (m[2] === 'rem' ? 16 : 1), `${f}: ${m[0]}`).toBeGreaterThanOrEqual(16);
      for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g)) expect(m[1], f).toMatch(/^uxb-/);
      for (const m of css.matchAll(/\.(ux[a-z]-[\w-]+)/g)) expect(m[1], f).toMatch(/^ux[bp]-/);
      // 層を残さない
      expect(css, f).not.toMatch(/animation[^;]*\b(both|forwards)\b/);
      expect(css, f).not.toMatch(/will-change/);
    }
  });
  it('絵文字は出さない：新しい画面の字に絵文字を書かない（絵はドットのアイコン）', () => {
    for (const f of FILES) expect(src(`uix/screens/${f}`), f).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});

describe('主役のキーは前の層・動きを減らす', () => {
  it('作り込んだ画面・組み直した画面には主のキー（前の層に出る）がある', () => {
    for (const f of ['buy.ts', 'shop.ts', 'supply.ts', 'biz.ts', 'cs.ts', 'trade.ts']) expect(src(`uix/screens/${f}`), f).toMatch(/kind: [^,}]*'main'/);
    // 在庫の引き出しは、下に貼りつく決めるキー（uxpDrawer の decide：主のキー）
    expect(src('uix/screens/stock.ts').match(/decide: /g)?.length).toBeGreaterThanOrEqual(3);
  });
  it('動きを減らす：入る動き・札を打つ間・計器の進み・合図は、isCalm のときすぐ出す', () => {
    for (const f of ['b-kit.ts', 'stock.ts', 'together.ts']) expect(src(`uix/screens/${f}`), f).toContain('isCalm()');
    expect(src('uix/screens/stock.ts')).toMatch(/if \(isCalm\(\) \|\| !card\) \{\s*d\.drop\(\);\s*fn\(\);/);
    expect(STOCK_STAMP_MS).toBeLessThanOrEqual(260);
  });
  it('土台の部品の ico は土台の絵しか描けない：見出し・空のときは bHead・bEmpty を通す（この段の絵も描ける）', () => {
    for (const f of ['buy.ts', 'shop.ts', 'supply.ts', 'biz.ts', 'cs.ts', 'trade.ts', 'stock.ts']) {
      const code = src(`uix/screens/${f}`);
      expect(code, f).not.toMatch(/\buxpHead\(/);
      expect(code, f).not.toMatch(/\buxpEmpty\(/);
    }
  });
});

describe('在庫と倉庫の引き出し（在庫を優先して売りさばく・棚が 1 段のお店・ランクアップ）', () => {
  const ST = src('uix/screens/stock.ts');
  const STOCKUI = src('p1/stockui.ts');
  it('押した先の処理は、今の画面と同じ関数（clearChoose・shelfOpts・rankDev）', () => {
    for (const f of ['export function clearChoose(', 'export function shelfOpts(', 'export function rankDev(']) expect(STOCKUI, f).toContain(f);
    expect(ST).toContain('B.clearChoose(ctx, uid, hero, r.cut, done)');
    expect(ST).toContain('B.shelfOpts(s, plan, gate, mainNm)');
    expect(ST).toContain('B.rankDev(ctx, r!');
  });
  it('出す中身：倉庫の割合と個数（素材・商品）・在庫品・段ごとの見込み（月に売れる数・売上）・推奨・いまの方針／3 択の費用と見込み・足りないお金／要るものと今の値・理由', () => {
    for (const k of ['info.rate', 'info.used', 'info.cap', 'info.mats', 'info.goods', 'r.units', 'salesLine(r.sales)', "t('おすすめ', 'Pick')", "t('いま', 'Now')", 'o.sub', 'uxpGap(s.money, o.cost)', 'whyLine(o.off)', 'n.label', 'n.now', 'whyLine(r.why)', 'B.UNCOMMON.price', 'B.UNCOMMON.pull']) expect(ST, k).toContain(k);
    // 今の目印：選択肢の data-cut・data-pick
    expect(ST).toContain("'data-cut'");
    expect(ST).toContain("'data-pick'");
  });
});

describe('商圏の取り合い・関税', () => {
  it('撤退の危険のランプ：2 か月で撤退。下回った月が続いた数と、今月も下回っているか', () => {
    const m = RARE_AREA.quitMonths;
    expect(riskLamps(0, false, m).filter(Boolean).length).toBe(0);
    expect(riskLamps(0, true, m).filter(Boolean).length).toBe(1);
    expect(riskLamps(1, true, m).filter(Boolean).length).toBe(Math.min(2, m));
    expect(quitLeft(0, false, m)).toBe(m);
    expect(quitLeft(m, true, m)).toBe(0);
  });
  it('となり町の比べ：関税こみの合計が、ここより安いときだけ「となり町」に印', () => {
    expect(cheaperThere({ here: 100, base: 70, duty: 20 })).toBe(true);
    expect(cheaperThere({ here: 100, base: 80, duty: 20 })).toBe(false);
  });
  it('出す中身が今の画面とそろう：取り分・推移・地図（今の canvas）・候補地と予測・出店の費用と日数・撤退と空き店舗・他社の店・記録・パネルへ', () => {
    const TR = src('uix/screens/trade.ts');
    for (const k of ['B.companyShares(s)', 'B.shareHist(s.reports)', 'B.areaMiniMap(s, cands', 'B.siteCandidates(s, 3)', 'B.surveyed(s)', 'B.vacantCost(s)', 'B.RARE_AREA.vacant.days', 'B.takeVacant(', 'last?.quit', 'last?.back', 'last?.refill', 'B.refillText(', 'B.storeRows(s)', 'B.quitRule()', 'area.closed', 'area.took', 'B.SALES_MASTERY()', 'hooks.areaView()', 'hooks.panels()', "ctx.build?.('general_store'"]) expect(TR, k).toContain(k);
  });
});

describe('まとめた画面の器（openTogether）', () => {
  const TG = src('uix/screens/together.ts');
  it('呼び方と中の作りの約束は変えない：部分・見出し・近道は今の要素のまま（見出しの字・data-part も）', () => {
    const SC = src('p1/screens.ts');
    expect(SC).toContain("const sec = h('section', 'isl-part');");
    expect(SC).toContain("sec.append(h('h3', 'isl-part-title', p.title));");
    expect(SC).toContain("'isl-part-go'");
    expect(TG).toContain("':scope > .isl-part'");
    expect(TG).toContain("':scope > .isl-part-title'");
    expect(TG).toContain("h3.classList.add('uxb-part-head')");
  });
  it('いま見ている部分：見出しが近道の列の下まで来た、いちばん下の部分', () => {
    expect(seenPart([0, 400, 900], 100)).toBe(0);
    expect(seenPart([-300, 80, 600], 100)).toBe(1);
    expect(seenPart([-900, -300, 50], 100)).toBe(2);
    expect(PART_SEEN_PX).toBeGreaterThan(0);
  });
  it('描き直しのたびに、前の見張りを外す（送りの見張りを重ねない）。合図は開いたときの 1 回だけ', () => {
    expect(TG).toContain('stops.get(body)?.();');
    expect(TG).toContain("removeEventListener('scroll', onScroll)");
    expect(TG).toContain('if (!seen.has(body))');
  });
});

describe('作り込んだ画面・組み直した画面の計算（前の担当の分）', () => {
  it('調達：注文できない理由・届くまでの目盛り', () => {
    expect(orderWhy({ money: 0, left: 10, free: 100 }, 1, 10)).toBe('money');
    expect(orderWhy({ money: 1e9, left: 10, free: 100 }, 1, 10)).toBeNull();
    expect(orderEta({ left: 0, total: 3 })).toBe(1);
    expect(orderEta({ left: 3, total: 3 })).toBe(0);
  });
  it('お店：チュートリアルのあいだは 2 つのタブ（教える画面を変えない）・棚の様子', () => {
    expect(shopTabs(true)).toEqual(['floor', 'sales']);
    expect(shopTabs(false)).toContain('equip');
    expect(shelfLook(null, 0, 0)).toBe('empty');
  });
  it('サプライチェーン：段は 調達 → 製造 → 物流 → 販売', () => {
    expect(STAGES).toEqual(['buy', 'craft', 'haul', 'sell']);
    const dots = beltDots({ buy: { perMonth: 10, stopped: false }, craft: { perMonth: 10, stopped: false }, haul: { perMonth: 10, stopped: false }, sell: { perMonth: 0, stopped: true } });
    expect(dots.sell).toBe(0);
  });
  it('CS：はじめに選んでおく返事は、向いている返事（使えなければ次）・評価の星', () => {
    expect(firstReply('refund', () => false)).toBe('refund');
    expect(firstReply('refund', (r) => r === 'refund')).not.toBe('refund');
    expect(gradeStars(2, 5)).toEqual([true, true, false, false, false]);
  });
  it('販売管理：利益率・売れた・品切れ・取り逃しの積み上げ', () => {
    expect(marginRate(100, 60)).toBeCloseTo(0.4);
    expect(marginRate(0, 60)).toBe(0);
    const p = stackParts({ sold: 5, lost: 3, miss: 2 }, 10);
    expect(p.length).toBe(3);
  });
});
