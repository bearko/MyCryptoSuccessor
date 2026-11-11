// 台本の数字（作り物）。ゲーム本体のデータは使わない。
const INIT = () => ({
  funds: 26400,
  sales: 118400,
  brand: 16,
  rank: 2,
  year: 1,
  month: 5,
  day: 18,
  frac: 0,
  speed: 1,
  held: false,
  scene: 'title',
  visited: false,
  propReady: false,
  approved: false,
  bought: false,
  reported: false,
  conquered: false,
  made: 1240,
  months: [31200, 48300, 66800, 97440],
  sel: 0,
  benches: [
    { hero: 'gennai', name: '平賀源内', item: 'sense', itemName: 'センス', qty: 80, dur: 9, p: 0.64, auto: true, run: true, stock: 320 },
    { hero: 'michel', name: 'ミケランジェロ', item: 'palette', itemName: '見習い筆パレ', qty: 40, dur: 14, p: 0.3, auto: true, run: true, stock: 160 },
    { hero: 'wright', name: 'ライト兄弟', item: 'watch', itemName: '懐中時計', qty: 30, dur: 19, p: 0.8, auto: true, run: true, stock: 90 },
  ],
});
export const S = INIT();
export function resetState() {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, INIT());
}
/** 曲の層の数：台本が進んで勢いが出るほど重なる */
export const layersOf = () => 1 + (S.visited ? 1 : 0) + (S.bought ? 1 : 0) + (S.approved ? 1 : 0) + (S.rank === 1 ? 1 : 0);
export const PRICE = { factory: 30000, jig: 8000, lathe: 45000 };
