/**
 * 段 UIX2s：本体の関数の束（p1/uxs.ts が渡す）。新しい画面は、本体のモジュールを自分では読まず、ここから使う（D.assign(...) など）。
 * 型だけを読むので、この束（入のときだけ読む）と本体の束のあいだに、共有の束ができない。
 */
import type { UxsDeps } from '../../p1/uxs';

export let D = {} as UxsDeps;
export function setDeps(d: UxsDeps) {
  D = d;
}
