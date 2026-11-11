// 台本のデータ（見本用の作り物）。絵はゲームの素材を相対パスで使う。
// スプライトの表（mch-atlas）は中身のハッシュが名前に付く。名前が変わっていたら resolveAtlas() が今の名前を探す。
export const ATLAS = {
  hero: '../../mch-atlas/hero-0.93946ffc46.png',
  ext: '../../mch-atlas/ext-0.def5e40422.png',
};

/** 表の名前が変わっていたら（素材が更新されたら）、サイトのオフライン用の一覧から今の名前を探す */
export async function resolveAtlas() {
  const ok = (src) =>
    new Promise((res) => {
      const im = new Image();
      im.onload = () => res(true);
      im.onerror = () => res(false);
      im.src = src;
    });
  if (await ok(ATLAS.hero)) return;
  try {
    const sw = await fetch('../../sw.js').then((r) => (r.ok ? r.text() : ''));
    const hero = /mch-atlas\/hero-0\.[0-9a-f]+\.png/.exec(sw);
    const ext = /mch-atlas\/ext-0\.[0-9a-f]+\.png/.exec(sw);
    if (hero) ATLAS.hero = `../../${hero[0]}`;
    if (ext) ATLAS.ext = `../../${ext[0]}`;
  } catch {
    /* 見つからなければ、人影だけで続ける */
  }
}

/** ヒーロー：cell は表の升の番号（16 列）・cx は体の中心・right は右向きの絵・voice は喋る音（波形と高さ） */
export const HERO = {
  hokusai: { cell: 184, name: '葛飾北斎', role: '工房の職人', cx: 32.1, voice: { wave: 'p50', deg: 0, oct: 4, len: 0.045, vol: 0.085 } },
  davinci: { cell: 165, name: 'レオナルド・ダ・ビンチ', role: '職人', cx: 32.7, voice: { wave: 'tri', deg: 2, oct: 4, vol: 0.12 } },
  gennai: { cell: 58, name: '平賀源内', role: '職人', cx: 33.9, right: true, voice: { wave: 'p25', deg: 3, oct: 4, vol: 0.08 } },
  polo: { cell: 113, name: 'マルコ・ポーロ', role: '物流部長', cx: 31.1, voice: { wave: 'tri', deg: 2, oct: 5, len: 0.04, vol: 0.13 } },
  ryoma: { cell: 168, name: '坂本龍馬', role: '経営企画部長', cx: 35.1, voice: { wave: 'p25', deg: 0, oct: 5, len: 0.04, vol: 0.085 } },
};
/** 町を歩く人たち（升の番号・体の中心・右向きか） */
export const WALKERS = [
  [0, 32.7], [4, 34.7], [13, 31], [25, 32], [36, 31.4], [71, 32.4], [89, 35.3], [159, 29.1], [196, 35.7], [42, 35.5], [29, 33.5], [112, 32.9], [170, 34.1], [107, 24.5, 1],
];
export const EXT = {
  sensu: { cell: 29, name: 'センス' },
  katana: { cell: 5, name: 'ノービスカタナ' },
  book: { cell: 6, name: 'ノービスブック' },
};

export const TOWN = 'グリーン・マウス';
export const COMPANY = 'あなたの商会';

/** はじめの数字（1 年目 5 月 18 日） */
export const START = {
  funds: 86400,
  sales: 577300,
  brand: 16,
  rank: 2,
  year: 1,
  month: 5,
  day: 18,
};
/** 月次報告（5 月）の数字 */
export const REPORT = {
  sales: 1046849,
  last: 540984,
  ranking: [
    { id: 'midori', name: 'みどり商会', sales: 912300 },
    { id: 'me', name: COMPANY, sales: 1046849, prev: 540984 },
    { id: 'konoha', name: 'このは屋', sales: 488120 },
    { id: 'wakaba', name: 'わかば時計店', sales: 301560 },
  ],
  trend: [
    { m: '1月', v: 42000 },
    { m: '2月', v: 118500 },
    { m: '3月', v: 311200 },
    { m: '4月', v: 540984 },
    { m: '5月', v: 1046849 },
  ],
};

export const NEWS = [
  '港に、となり町からの荷が着きました',
  'みどり商会が、駅前に 5 軒目の店を出しました',
  '今月の流行は「センス」。よろず屋の棚が空きがちです',
  '町の長「1 位の商会には、町の鍵を預けたい」',
  'このは屋の時計が、広場で評判です',
];

/** 工房の吹き出しのセリフ（短い・長い・短い） */
export const WS_LINES = ['いらっしゃい。今日もいい扇が上がっていますよ。', 'センスは今月 80 本。素材さえ切らさなければ、まだまだ作れます。作業台だって、もう 1 台置けますからね。', 'さて、何を作りましょうか。'];
