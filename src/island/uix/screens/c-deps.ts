/**
 * 段 UIX3a：本体の関数の束（p1/uxc.ts が渡す）。この段の画面は、本体のモジュールを自分では読まず、ここから使う（C.heroIcon(...) など）。
 * 型だけを読むので、この束（入のときだけ読む）と本体の束のあいだに、共有の束ができない。
 */
import type { UxcDeps } from '../../p1/uxc';

export let C = {} as UxcDeps;
export function setC(d: UxcDeps) {
  C = d;
}
