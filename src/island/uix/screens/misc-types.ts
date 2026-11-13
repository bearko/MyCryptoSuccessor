/**
 * 段 UIX3h：地図の表示の画面に、呼ぶ側（p1/mapsetui.ts の openMapSet）が渡す物の型（型だけ）。
 */
import type { MAPSET_ITEMS, MapSetKey } from '../../p1/mapsetui';
import type { P1State } from '../../p1/model';

export interface MapSetApi {
  MAPSET_ITEMS: typeof MAPSET_ITEMS;
  mapSetLocked: (s: P1State, k: MapSetKey) => boolean;
  mapSetOn: (s: P1State, k: MapSetKey) => boolean;
  toggleMapSet: (s: P1State, k: MapSetKey) => boolean;
}
