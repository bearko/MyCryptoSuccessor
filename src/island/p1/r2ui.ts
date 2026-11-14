
import type { P1State } from './model';
import { uxh } from '../uix/screens/h-slots';

/** 月の RP の入り方の縦の積み上げ棒（過去 5 か月 ＋ 今月） */
export function rpStackEl(s: P1State): HTMLElement {
  // 段 UIX3h：新しい画面（uix/screens/misc.ts）
  return uxh.rpStack!(s);
}

/** 研究の施策のボタン（出土品の整理・文献調査。月に 1 回ずつ）。done：押したあと（描き直し） */
export function studyEl(s: P1State, o: { done: () => void; toast: (m: string) => void; sfx?: (k: 'error' | 'levelup') => void }): HTMLElement {
  return uxh.study!(s, o);
}
