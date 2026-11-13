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
}
