/**
 * 段 UIX3w：世界の場面の新しい画面（町の制覇・ランドマップと進出・発掘。src/island/uix/screens/）へ渡す、本体の関数の束。
 * p1/uxs.ts と同じ決まり：新しい画面の束は本体のモジュールを自分では読まない（読むと、切のときの読み込みが変わる）。
 * 本体の側（このファイル。p1/main.ts と同じ束）から、使う関数だけを渡す。
 */
import { assetUrl } from '../../render/images';
import { heroIcon, heroName, money } from './ui';

export const uxwDeps = {
  assetUrl,
  heroIcon,
  heroName,
  money,
};
export type UxwDeps = typeof uxwDeps;
