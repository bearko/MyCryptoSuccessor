/**
 * 段 UIX3w：世界の場面（町の制覇・ランドマップと進出・発掘）の新しい画面を、差し込み口へ入れる（s-boot.ts の install から呼ぶ）。
 * 切のときは、このファイルも、ここから読む画面と CSS も読まない。
 */
import type { UxwDeps } from '../../p1/uxw';
import { openCheerUx, openLetterUx } from './conquer';
import { decoWorldUx, openLandUx, openRankUpUx, openSectorCardUx } from './land';
import { setW } from './w-deps';
import { uxw } from './w-slots';

/** 本体の関数の束を受け取って、差し込み口へ入れる */
export function installW(d: UxwDeps) {
  setW(d);
  uxw.letter = openLetterUx;
  uxw.cheer = openCheerUx;
  uxw.land = openLandUx;
  uxw.rankUp = openRankUpUx;
  uxw.sectorCard = openSectorCardUx;
  uxw.deco = decoWorldUx;
}
