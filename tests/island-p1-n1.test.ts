// 段 N1（docs/ISLAND_PHASE1.md「ニュースのテロップ（段 N1）」）：日々の知らせは上の帯の下のテロップへ。
// 同じ知らせは束ねる・たまったら速める・同じ日にできた物は 1 つの知らせに（段 N2 で「ほか N 件」はやめた。束ねは tests/island-p1-n2.test.ts）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { craftedText, mergeQueue, newsSpeed, type Queued } from '../src/island/p1/ticker';

const fill = (texts: string[]) => texts.reduce<Queued[]>((q, x) => mergeQueue(q, { text: x, n: 1 }), []);

describe('段 N1：ニュースのテロップ', () => {
  it('同じ知らせは束ねる（×2）', () => {
    const q = fill(['鉄が届きました', 'ハサミができました', '鉄が届きました']);
    expect(q.map((x) => [x.text, x.n])).toEqual([
      ['鉄が届きました', 2],
      ['ハサミができました', 1],
    ]);
  });

  it('段 N2：6 件を超えてたまっても省かない（「ほか N 件」を作らない。古い順のまま）', () => {
    const q = fill(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']);
    expect(q.map((x) => x.text)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']);
    expect(q.some((x) => /ほか \d+ 件/.test(x.text))).toBe(false);
  });

  it('たまっているほど速く流す（上限はおよそ 1.6 倍。段 UX1 で 2.2 → 1.6）。PC はスマホより少し速い', () => {
    expect(newsSpeed(false, 0)).toBe(84);
    expect(newsSpeed(true, 0)).toBe(100);
    expect(newsSpeed(false, 2)).toBeGreaterThan(newsSpeed(false, 0));
    expect(newsSpeed(false, 50)).toBe(newsSpeed(false, 3));
    // 段 UX1（C-8）：速める上限は 2.2 倍 → 1.6 倍
    expect(newsSpeed(false, 50) / newsSpeed(false, 0)).toBeCloseTo(1.6, 5);
  });

  it('同じ日にできた物は 1 つの知らせに（同じ物は個数・4 種類からは「ほか」）', () => {
    expect(craftedText(['ハサミ'])).toBe('ハサミができました');
    expect(craftedText(['ハサミ', '時計'])).toBe('ハサミ・時計ができました');
    expect(craftedText(['ハサミ', 'ハサミ', '時計'])).toBe('ハサミ（2 個）・時計ができました');
    expect(craftedText(['a', 'b', 'c', 'd', 'e'])).toBe('a・b・ほか 3 種類ができました');
  });

  it('日々の知らせはテロップへ・手を止めて見るべき知らせはトーストのまま（main.ts の振り分け）', () => {
    const src = readFileSync('src/island/p1/main.ts', 'utf8');
    // テロップへ：できた・届けた・完成した・レベルアップ・月の締めの知らせ
    for (const k of ['が完成しました！', '個を届けてくれました', 'craftedText(', 'が Lv ${x.to} に！', '四半期の決算が出ました', 'が[[${what}]]を売り始めた']) {
      const line = src.split('\n').find((l) => l.includes(k) && !l.trim().startsWith('//'));
      expect(line, k).toBeDefined();
      expect(line, k).toMatch(/\bnews\(/);
    }
    // 画面に残す：辞めたい・辞めた・炎上・エンブレム・災害のあとの支援金が尽きた・押したことへの返事
    for (const k of ['が「辞めたい」と言っている', 'が会社を辞めました', '🔥 炎上！', 'エンブレムを獲得', '：支援金が尽きた（', '申請料が足りません']) {
      const line = src.split('\n').find((l) => l.includes(k) && !l.trim().startsWith('//'));
      expect(line, k).toBeDefined();
      expect(line, k).toMatch(/\btoast\(/);
      expect(line, k).not.toMatch(/\bnews\(/);
    }
  });
});
