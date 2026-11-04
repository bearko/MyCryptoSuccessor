// 段 N1（docs/ISLAND_PHASE1.md「ニュースのテロップ（段 N1）」）：日々の知らせは上の帯の下のテロップへ。
// 同じ知らせは束ねる・たまったら速める・もっとたまったら古いものを「ほか N 件」にまとめる・同じ日にできた物は 1 つの知らせに
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { craftedText, newsSpeed, packQueue } from '../src/island/p1/ticker';

type Q = Parameters<typeof packQueue>[0];
const fill = (texts: string[]) => texts.reduce<Q>((q, x) => packQueue(q, x), []);

describe('段 N1：ニュースのテロップ', () => {
  it('同じ知らせは束ねる（×2）', () => {
    const q = fill(['鉄が届きました', 'ハサミができました', '鉄が届きました']);
    expect(q.map((x) => [x.text, x.n])).toEqual([
      ['鉄が届きました', 2],
      ['ハサミができました', 1],
    ]);
  });

  it('6 件を超えてたまったら、古いものを「ほか N 件」にまとめ、新しい 3 件を残す', () => {
    const q = fill(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']);
    expect(q.length).toBe(4);
    expect(q[0].sum).toBe(4);
    expect(q[0].text).toContain('4');
    expect(q.slice(1).map((x) => x.text)).toEqual(['a5', 'a6', 'a7']);
    // さらにたまると、まとめの数に足していく（束ねた数も数える）
    const q2 = fill(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a8', 'a9', 'a10', 'a11']);
    const sum = q2.find((x) => x.sum)?.sum ?? 0;
    const rest = q2.filter((x) => !x.sum).reduce((a, x) => a + x.n, 0);
    expect(sum + rest).toBe(12);
    expect(q2.filter((x) => x.sum).length).toBe(1);
    expect(q2[0].sum).toBeGreaterThan(0);
  });

  it('たまっているほど速く流す（上限あり）。PC はスマホより少し速い', () => {
    expect(newsSpeed(false, 0)).toBe(84);
    expect(newsSpeed(true, 0)).toBe(100);
    expect(newsSpeed(false, 2)).toBeGreaterThan(newsSpeed(false, 0));
    expect(newsSpeed(false, 50)).toBe(newsSpeed(false, 4));
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
