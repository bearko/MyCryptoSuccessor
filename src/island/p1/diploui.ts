
import { landDef } from './diplo';
import { type Ctx } from './screens';
import { h } from './ui';
import { uxh } from '../uix/screens/h-slots';

/** 使者の顔（仮の絵：ランドの色と紋） */
export function crestEl(land: string): HTMLElement {
  const L = landDef(land);
  const c = h('div', 'isl-crest', L.icon);
  c.style.setProperty('--lc', L.color);
  return c;
}

/** 外交の一覧（Epic の町に進出していなければ開かない＝まとめた画面から外れる） */
export function openDiplo(ctx: Ctx) {
  // 段 UIX3h：新しい画面（uix/screens/misc.ts）
  return uxh.diplo!(ctx);
}
