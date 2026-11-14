/**
 * 段 UIX5t：部長との対話の新しい画面を、差し込み口へ入れる（s-boot.ts の install から呼ぶ）。
 * 切のときは、このファイルも、ここから読む画面と CSS も読まない。
 */
import type { UxtDeps } from '../../p1/uxt';
import { setT } from './t-deps';
import { uxt } from './t-slots';
import { headTalkUx } from './t-talk';

/** 本体の関数の束を受け取って、差し込み口へ入れる */
export function installT(d: UxtDeps) {
  setT(d);
  uxt.headTalk = headTalkUx;
}
