// ゲームの素材（相対パス）。ドット絵は 64px の升を 16 列に並べた版。
// 版の名前には中身のハッシュが付く（scripts/sync-assets.mjs が作る）。素材を入れ替えたら、ここの 2 行を直す。
export const ATLAS = {
  hero: '../../mch-atlas/hero-0.93946ffc46.png',
  ext: '../../mch-atlas/ext-0.def5e40422.png',
};
/** ヒーローの升の番号 */
export const HERO = {
  gennai: 58, // 平賀源内（工房の職人）
  gama: 48, // ヴァスコ・ダ・ガマ（貿易部長）
  michel: 30, // ミケランジェロ（職人）
  wright: 8, // ライト兄弟（職人）
  ichiyo: 42, // 樋口一葉（経理）
  inou: 4,
  ikkyu: 36,
  okuni: 37,
  kai: 1,
  andersen: 29,
};
/** エクステンションの升の番号 */
export const EXT = { sense: 29, palette: 87, watch: 94 };
export const preload = () => Promise.all(Object.values(ATLAS).concat(['img/town.webp']).map((u) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = () => r(); i.src = u; })));
