
import { type Ctx } from './screens';
import { uxh } from '../uix/screens/h-slots';

/** 展示の画面 */
export function openMuseum(ctx: Ctx) {
  // 段 UIX3h：新しい画面（uix/screens/trophy.ts）
  return uxh.museum!(ctx);
}
