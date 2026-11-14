
import { uxk } from '../uix/screens/k-slots';
import type { P1State, PBuilding } from './model';

/** 拠点の吹き出しの「📦 輸入」（この拠点が境の拠点でなければ null） */
export function feedBox(s: P1State, b: PBuilding, done: (msg?: string) => void): HTMLElement | null {
  // 段 UIX3k：新しい箱（uix/screens/feed.ts）へ
  return uxk.feed!(s, b, done);
}
