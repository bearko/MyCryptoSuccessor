/**
 * 段 UIX3b：事業の新しい画面を、差し込み口（uxb）へ入れる（入のときだけ。s-boot.ts の install() から呼ぶ）。
 * 切のときは、このファイルも、ここから読む画面と CSS も読まない。
 */
import type { UxbDeps } from '../../p1/uxb';
import { setB } from './b-deps';
import { uxb } from './b-slots';
import { openAdsUx, openBomUx, openSalesUx } from './biz';
import { openBuyUx } from './buy';
import { openShopUx } from './shop';
import { openSupplyUx } from './supply';

/** 本体の関数の束を受け取って、差し込み口へ入れる */
export function installB(d: UxbDeps) {
  setB(d);
  uxb.buy = openBuyUx;
  uxb.shop = openShopUx;
  uxb.supply = openSupplyUx;
  uxb.bom = openBomUx;
  uxb.sales = openSalesUx;
  uxb.ads = openAdsUx;
}
