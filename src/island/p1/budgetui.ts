
import { type Ctx } from './screens';
import { uxk } from '../uix/screens/k-slots';
import './i1.css';

/** 予算と部門の画面 */
export function openBudget(ctx: Ctx) {
  // 段 UIX3k：新しい画面（uix/screens/budget.ts）へ
  return uxk.budget!(ctx);
}
