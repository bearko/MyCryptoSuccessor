// スクリプトで描くドット絵（地形・駅・物流センター・車・ドット絵にしたランドの背景）を、ファイルに書かずに作って返す。
// いまのゲームの画面では使っていない。`npm run pixel:lint`（scripts/pixel-lint.mjs）が検査の対象として作る。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pngjs from 'pngjs';
import { LAND_BACKGROUNDS, landBackground } from './backgrounds.mjs';
import { sprites } from './sprites.mjs';

const { PNG } = pngjs;

/**
 * @param {{ src: string }} o src は MCH の素材（vendor/mycryptoheroes）
 * @returns {{ name: string, kind: string, canvas: import('./core.mjs').Canvas }[]}
 */
export function pixelArt({ src }) {
  const list = sprites().map((s) => ({ name: s.name, kind: s.kind, canvas: s.canvas }));
  for (const [land, id] of Object.entries(LAND_BACKGROUNDS)) {
    const png = PNG.sync.read(readFileSync(join(src, `Image/Backgrounds/${id}.png`)));
    list.push({ name: `bg-${land}`, kind: 'bg', canvas: landBackground(png) });
  }
  return list;
}
