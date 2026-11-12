/**
 * 段 UIX3w：本体の関数の束（p1/uxw.ts が渡す）。世界の場面の新しい画面は、本体のモジュールを自分では読まず、ここから使う（W.money(...) など）。
 * 型だけを読むので、この束（入のときだけ読む）と本体の束のあいだに、共有の束ができない。
 */
import type { UxwDeps } from '../../p1/uxw';

export let W = {} as UxwDeps;
export function setW(d: UxwDeps) {
  W = d;
}
