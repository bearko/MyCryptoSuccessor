/**
 * 段 UIX3a：この段の画面を、差し込み口（uxc）へ入れる（入のときだけ。s-boot.ts の install() から呼ぶ）。
 * 切のときは、このファイルも、ここから読む画面と CSS も読まない。
 */
import type { UxcDeps } from '../../p1/uxc';
import { setC } from './c-deps';
import { uxc } from './c-slots';
import { drawerUx, pickExtUx, pickHeroUx } from './picker';
import { showTalkUx } from './talk';

export function installC(d: UxcDeps) {
  setC(d);
  uxc.talk = showTalkUx;
  uxc.drawer = drawerUx;
  uxc.pickHero = pickHeroUx;
  uxc.pickExt = pickExtUx;
}
