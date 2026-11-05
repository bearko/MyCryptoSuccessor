// 段 N2（docs/ISLAND_PHASE1.md「ニュースのテロップ」の「束ね方」）：「ほか N 件」をやめ、同じ種類の知らせを意味のある 1 文に束ねる。
// 種類のアイコン・困りごとの注意色・「NEWS」の札の光（newsFx）をやめた
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeQueue, mergedText, NEWS_ICON, newsSpeed, slotOf, type Queued } from '../src/island/p1/ticker';

const fill = (items: Queued[]) => items.reduce<Queued[]>((q, x) => mergeQueue(q, x), []);
const lv = (name: string): Queued => ({ text: `${name}が Lv 5 に！`, n: 1, kind: 'hr', group: 'levelup', parts: [{ name }] });
const mat = (name: string, qty: number): Queued => ({ text: `誰かが${name} ${qty} 個を届けてくれました`, n: 1, kind: 'logi', group: 'delivered', parts: [{ name, value: qty }] });
const sec = (name: string, v: number): Queued => ({ text: `${name}：利益 ${v} G`, n: 1, kind: 'sale', group: 'sector', parts: [{ name, value: v }] });

describe('段 N2：ニュースの束ね', () => {
  it('同じ種類（kind と group）は 1 文に束なる：レベルアップは名前を並べる', () => {
    const q = fill([lv('A'), lv('B'), lv('C')]);
    expect(q.length).toBe(1);
    expect(q[0].text).toBe('3 人がレベルアップ（A・B・C）');
    expect(q[0].n).toBe(1);
    expect(q[0].parts?.length).toBe(3);
  });

  it('素材は種類の数と合計の個数・セクタの利益は合計の G', () => {
    const q = fill([mat('木材', 5), mat('鉄', 3), mat('布', 2)]);
    expect(q[0].text).toBe('素材が 3 種届いた（木材・鉄・布・計 10 個）');
    const q2 = fill([sec('よろず屋', 8745), sec('工房', 8745), sec('市場', 8745), sec('港', 8745)]);
    expect(q2[0].text).toBe('4 つのセクタで利益 +34,980 G（よろず屋・工房・市場・港）');
    expect(mergedText('sector', [{ name: 'a', value: -100 }, { name: 'b', value: -50 }])).toContain('赤字 −150 G');
  });

  it('同じ文は ×2 のまま（中身の数は足しておく：あとで別の名前と束なったとき合計に入る）', () => {
    const q = fill([mat('木材', 5), mat('木材', 5)]);
    expect(q.length).toBe(1);
    expect(q[0].n).toBe(2);
    expect(q[0].text).toBe('誰かが木材 5 個を届けてくれました');
    const q2 = mergeQueue(q, mat('鉄', 1));
    expect(q2[0].text).toBe('素材が 2 種届いた（木材・鉄・計 11 個）');
    expect(q2[0].n).toBe(1);
  });

  it('「ほか N 件」は出ない。順は古い順。種類の無い知らせ・group の無い知らせは束ねない', () => {
    const q = fill([{ text: 'x1', n: 1 }, lv('A'), { text: 'x2', n: 1 }, lv('B'), { text: 'x3', n: 1, kind: 'logi' }, { text: 'x4', n: 1, kind: 'logi' }, mat('木材', 1), { text: 'x5', n: 1 }, { text: 'x6', n: 1 }, { text: 'x7', n: 1 }]);
    expect(q.map((x) => x.text)).toEqual(['x1', '2 人がレベルアップ（A・B）', 'x2', 'x3', 'x4', '誰かが木材 1 個を届けてくれました', 'x5', 'x6', 'x7']);
    expect(q.some((x) => /ほか \d+ 件/.test(x.text))).toBe(false);
    // 別の種類とは束ねない
    const q2 = fill([lv('A'), { text: 'Aが思いとどまってくれた', n: 1, kind: 'hr', group: 'stay', parts: [{ name: 'A' }] }]);
    expect(q2.length).toBe(2);
  });

  it('純粋な関数：元の列は変えない。slotOf はその知らせが入った所を返す', () => {
    const q = fill([lv('A')]);
    const q2 = mergeQueue(q, lv('B'));
    expect(q[0].text).toBe('Aが Lv 5 に！');
    expect(q2[0].text).toBe('2 人がレベルアップ（A・B）');
    expect(slotOf(q2, lv('C'))).toBe(q2[0]);
    expect(slotOf(q2, { text: 'zzz', n: 1 })).toBeUndefined();
  });

  it('名前が多いときは 4 つと「ほか N 人」', () => {
    const q = fill(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(lv));
    expect(q[0].text).toBe('7 人がレベルアップ（A・B・C・D・ほか 3 人）');
  });

  it('速さは 1.6 倍まで（省かないぶん、速める。段 UX1 で 2.2 倍 → 1.6 倍）', () => {
    // 段 UX1（C-8）：上限は 1.6 倍（160 px/秒）
    expect(newsSpeed(true, 3)).toBeCloseTo(160, 5);
    expect(newsSpeed(true, 99)).toBeCloseTo(160, 5);
  });

  it('種類のアイコンは 6 つ。「NEWS」の札の光（newsFx）は無い', () => {
    expect(Object.keys(NEWS_ICON).sort()).toEqual(['build', 'hr', 'logi', 'promo', 'sale', 'trouble']);
    const src = readFileSync('src/island/p1/main.ts', 'utf8');
    expect(src).not.toMatch(/function newsFx|newsFx\(/);
    // 困りごと（店長が休みで閉まった・依頼の期限切れ・ブランド力が下がった）は trouble
    for (const k of ["group: 'closed'", "group: 'late'", "e.d < 0 ? 'trouble'"]) expect(src).toContain(k);
    const css = readFileSync('src/island/p1/ticker.css', 'utf8');
    expect(css).toMatch(/\.isl-news-item\.is-trouble/);
    expect(css).not.toContain('is-sum');
  });
});
