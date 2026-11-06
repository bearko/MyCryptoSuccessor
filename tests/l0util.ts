// 段 L0 のテスト用の手助け：会社が出店したことのある最高ランク（company.ts の topTierOf）を上げる。
// 段 L0 から、チームリーダーは Uncommon・事業部長と提案は Rare の町を開いてから（stage.ts の heroStage）。
// Common の町で部長・提案を確かめていた前のテストは、ここで Rare の町を開いた状態に移す（テストの意図はそのまま）
import { newLand } from '../src/island/p1/company';
import type { P1State } from '../src/island/p1/model';

const ID: Record<'U' | 'R' | 'E', string> = { U: 'u1', R: 'r1', E: 'e1' };
/** その段の町（u1・r1・e1）に出店したことにする（いまの町・ランクはそのまま。ランドの出店の記録に足すだけ） */
export function openTier<T extends Pick<P1State, 'land' | 'sector'>>(s: T, r: 'C' | 'U' | 'R' | 'E' = 'R'): T {
  if (r === 'C') return s;
  s.land ??= newLand(s.sector ?? 'c1');
  if (!s.land.mine.includes(ID[r])) s.land.mine.push(ID[r]);
  return s;
}
