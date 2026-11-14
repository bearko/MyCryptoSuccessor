/**
 * 段 UI10：設定の画面の「🗺 地図の表示」の節（ユーザーの声 2026-11-07「右下の『流れ』『印』『商圏』が何を指すのか分からない」）。
 * 地図の上には常に出さず、設定で 名前・何が見えるか（1〜2 行）・色の見本・オン／オフ を並べて切り替える。
 * フラグは今のまま（flags.flowLines 既定オン・flags.issueMarks 既定オン（Rare より前だけ）・flags.areaShow 既定オフ）。セーブの版は変えない。
 * 仕様は docs/SUCCESSOR_ROADMAP.md「段 UI10」。
 */
import { t } from '../../i18n';
import { MARK_KIND, MARK_LEGEND } from './mapmarks';
import { MAPVIZ_COLOR } from './mapviz';
import type { P1State } from './model';
import { type Ctx } from './screens';
import { propsOpen } from './stage';
import { h } from './ui';
import './mapset.css';
import { uxh } from '../uix/screens/h-slots';

export type MapSetKey = 'flow' | 'marks' | 'area';

/** いまオンか（設定の値。チュートリアルの流れの案内で流れを強制オンにするのは main.ts の flowOn） */
export function mapSetOn(s: P1State, k: MapSetKey): boolean {
  if (k === 'flow') return s.flags.flowLines !== false;
  if (k === 'marks') return s.flags.issueMarks !== false;
  return !!s.flags.areaShow;
}
/** 切り替える（既定の値は flags に無いときのまま：流れ＝オン・印＝オン・商圏＝オフ） */
export function toggleMapSet(s: P1State, k: MapSetKey): boolean {
  const v = !mapSetOn(s, k);
  if (k === 'flow') s.flags.flowLines = v;
  else if (k === 'marks') s.flags.issueMarks = v;
  else s.flags.areaShow = v;
  return v;
}
/** 押せないとき（困りごとの印は Rare からは部長の提案に替わる） */
export const mapSetLocked = (s: P1State, k: MapSetKey) => k === 'marks' && propsOpen(s);

interface Item {
  key: MapSetKey;
  name: () => string;
  note: () => string;
  /** 色の見本 */
  keys: () => HTMLElement[];
  /** 添え書き（いつ出るか） */
  when?: (s: P1State) => string;
}

/** 線の見本（点線。色と名前） */
const lineKey = (color: string, name: string) => {
  const x = h('span', 'isl-mapset-key');
  const i = h('i', 'isl-mapset-line');
  i.style.borderTopColor = color;
  x.append(i, h('span', '', name));
  return x;
};
/** 面の見本（半透明の塗りとふち） */
const areaKey = (color: string, name: string) => {
  const x = h('span', 'isl-mapset-key');
  const i = h('i', 'isl-mapset-area');
  i.style.setProperty('--c', color);
  x.append(i, h('span', '', name));
  return x;
};

export const MAPSET_ITEMS: Item[] = [
  {
    key: 'flow',
    name: () => t('物の流れの線', 'Flow lines'),
    note: () => t('素材の店 → 工房（橙の線＝調達）と、工房 → お店（青の線＝輸送）を地図に線で出します。どこから何が運ばれているかが分かります。', 'Draws material shop → workshop (orange = supply) and workshop → shops (blue = haul) on the map, so you can see what moves where.'),
    keys: () => [lineKey(MAPVIZ_COLOR.supply, t('調達', 'Supply')), lineKey(MAPVIZ_COLOR.haul, t('輸送', 'Haul'))],
  },
  {
    key: 'marks',
    name: () => t('困りごとの印', 'Trouble marks'),
    note: () => t('困っている建物の上に印を出します。押すとその手の画面が開きます。', 'Shows a mark above a building in trouble. Tap it to open the screen that fixes it.'),
    keys: () =>
      MARK_LEGEND.map((k) => {
        const x = h('span', 'isl-mapset-key');
        const dot = h('i', 'isl-mapset-mark', MARK_KIND[k].icon);
        dot.style.setProperty('--mk', MARK_KIND[k].color);
        // 橙は素材と製造のどちらにも使う（凡例は 1 つにまとめる）
        x.append(dot, h('span', '', k === 'mats' ? t('素材と製造', 'Materials, crafting') : MARK_KIND[k].name()));
        return x;
      }),
    when: (s) => (propsOpen(s) ? t('Rare からは部長の提案に替わります', 'From Rare, department heads’ proposals take over') : t('Rare より前の町で出ます（チュートリアルのあと 2 か月目から）', 'Shown in towns before Rare (from the 2nd month after the tutorial)')),
  },
  {
    key: 'area',
    name: () => t('お店の商圏', 'Shop trade areas'),
    note: () => t('自分のお店（赤）と他社のお店（青）のお客さんが来る範囲を地図に色で塗ります。どこに出店すれば取り合えるかが分かります。', 'Paints where customers come from for your shops (red) and rivals’ shops (blue), so you can see where a new shop would compete.'),
    keys: () => [areaKey(MAPVIZ_COLOR.mine, t('自分のお店', 'Your shops')), areaKey(MAPVIZ_COLOR.rival, t('他社のお店', 'Rival shops'))],
    when: () => t('お店を押したときはその店だけ・建てるときはいつも出ます', 'Always shown while placing, and for one shop when you tap it'),
  },
];

/** 設定の画面の「🗺 地図の表示」（まとめた設定の画面の 1 節） */
export function openMapSet(ctx: Ctx, changed: () => void) {
  // 段 UIX3h：新しい画面（uix/screens/misc.ts）
  // 項目と切り替えは、ここから渡す（新しい画面の束を本体の束へつなぐ p1/uxh.ts がこのファイルを読むと、地図の表示の CSS の並びが変わるため）
  return uxh.mapSet!(ctx, changed, { MAPSET_ITEMS, mapSetLocked, mapSetOn, toggleMapSet });
}
