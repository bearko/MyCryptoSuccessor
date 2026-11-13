/**
 * 段 UIX4r：残りの画面（セクター長の箱・復興の箱・建築の札・ミッションの一覧・設定）を、差し込み口へ入れる（s-boot.ts の install から呼ぶ）。
 * 切のときは、このファイルも、ここから読む画面と CSS も読まない。
 */
import type { UxrDeps } from '../../p1/uxr';
import { setR } from './r-deps';
import { uxr } from './r-slots';
import { delegateUx, managerBoxUx, reviveBoxUx, sectorHeadsUx } from './sector';
import { missionsUx } from './mission';
import { buildUx } from './build';
import { settingsUx } from './sys';
import { GUIDE_SEL } from './c-dress';

/**
 * 下の帯のタブ・サブタブ・速さのキーの強調（チュートリアル）を、札の中と同じ光る枠（c-dress.ts の .uxc-guide）にそろえる。
 * 枠を付ける相手の一覧のうしろに足す（札・吹き出しの中の相手が先）。帯の側の四隅のかぎ・またたく縁は r-screens.css で止める（html.uxr-tg）
 */
export const TAB_GUIDE = ['.uxm-hud .isl-speed .isl-btn.is-guide', '.uxm-hud .isl-speed.is-guide', '.isl-sub.is-guide', '.isl-tab.is-guide'];

/** 本体の関数の束を受け取って、差し込み口へ入れる */
export function installR(d: UxrDeps) {
  setR(d);
  uxr.managerBox = managerBoxUx;
  uxr.reviveBox = reviveBoxUx;
  uxr.delegate = delegateUx;
  uxr.sectorHeads = sectorHeadsUx;
  uxr.missions = missionsUx;
  uxr.build = buildUx;
  uxr.settings = settingsUx;
  for (const sel of TAB_GUIDE) if (!GUIDE_SEL.includes(sel)) GUIDE_SEL.push(sel);
  document.documentElement.classList.add('uxr-tg');
}
