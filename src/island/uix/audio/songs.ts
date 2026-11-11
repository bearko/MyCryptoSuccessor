/**
 * 段 UIX1s：曲のデータ。16 分音符の格子に置く。
 * ・地図・月次報告・制覇（祝いの曲）は、見本（public/uixlab/c/js/music.js）の値のまま。
 * ・セクタ選択・発掘・経営会議・タイトルは、同じ音色の決まり（矩形波の旋律・三角波の低音・細い矩形波の分散和音・ノイズの太鼓・
 *   幅の広い矩形波の和音）と同じ調（ハ長調／イ短調）で、この段で足した。
 * ・地図の曲は長く流れるので、見本の 16 小節を 1 巡めにして、64 小節（約 2 分 12 秒）でひと回りする構成にした（MAP_FORM）。
 */
import type { Wave } from './engine';

export const LAYERS = ['lead', 'bass', 'arp', 'drums', 'pad'] as const;
export type Layer = (typeof LAYERS)[number];

export type ChordName = 'C' | 'F' | 'G' | 'Am' | 'Dm' | 'Em';
export const CHORD: Record<ChordName, number[]> = {
  C: [0, 4, 7],
  F: [5, 9, 0],
  G: [7, 11, 2],
  Am: [9, 0, 4],
  Dm: [2, 5, 9],
  Em: [4, 7, 11],
};
/** 調（ハ長調）の音階。SE の音階にも使う */
export const SCALE = [0, 2, 4, 5, 7, 9, 11];
export const PENTA = [0, 2, 4, 7, 9];

/** 太鼓（と、それに合わせた低音・分散和音）の型 */
export type DrumStyle = 'map' | 'light' | 'soft' | 'march' | 'dig' | 'board';

/** 1 小節の和音。2 つ並べると、小節の前半と後半で替わる */
export type BarChord = ChordName | [ChordName, ChordName];

/** その小節だけの変化 */
export interface BarMod {
  /** 旋律の音色 */
  leadWave?: Wave;
  /** 太鼓の型 */
  drums?: DrumStyle;
  /** この小節では休む層 */
  rest?: Layer[];
  /** 分散和音を別の順で */
  arpAlt?: boolean;
  /** 小節の終わりに太鼓の連打 */
  fill?: boolean;
}

export interface NoteEv {
  /** 小節の中の位置（16 分音符） */
  pos: number;
  /** MIDI の番号 */
  m: number;
  /** 長さ（16 分音符の数） */
  len: number;
}

export interface Song {
  bpm: number;
  bars: number;
  chords: BarChord[];
  leadEv: NoteEv[][];
  leadWave?: Wave;
  /** 旋律の下に和音の音を 2 つ重ねる（祝いの曲） */
  harmony?: boolean;
  drums: DrumStyle;
  /** 層を固定する曲（省くと、勢いの段 level で決まる＝地図の曲） */
  layers?: Layer[];
  /** 1 回だけ鳴らして、次の曲へ移る */
  once?: boolean;
  mods: (BarMod | undefined)[];
}

export type SongName = 'map' | 'report' | 'fanfare' | 'sector' | 'dig' | 'board' | 'title';
export const SONG_NAMES: SongName[] = ['map', 'report', 'fanfare', 'sector', 'dig', 'board', 'title'];

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (name: string): number => {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) throw new Error(`bad note name: ${name}`);
  return PC[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
};
/** "A4:2 C5:2 -:4" → [{pos, m, len}]（len は 16 分音符の数） */
export const line = (s: string): NoteEv[] => {
  let pos = 0;
  const out: NoteEv[] = [];
  for (const tok of s.trim().split(/\s+/)) {
    const [n, l] = tok.split(':');
    const len = Number(l);
    if (n !== '-') out.push({ pos, m: midi(n), len });
    pos += len;
  }
  return out;
};
/** 1 小節ぶんの長さ（16 分音符の数。16 のはず。テストで確かめる） */
export const lineLen = (s: string): number => s.trim().split(/\s+/).reduce((a, tok) => a + Number(tok.split(':')[1]), 0);

// ---------------------------------------------------------------- 地図の曲

/** 節：和音と旋律（8 小節ずつ） */
interface Section {
  chords: BarChord[];
  lead: string[];
}

/** A：見本の前半。覚えやすい「上がって伸ばす」動機を、和音に合わせて 1 段ずつ下げて繰り返す */
const MAP_A: Section = {
  chords: ['F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'C'],
  lead: ['A4:2 C5:2 F5:4 E5:2 F5:2 G5:4', 'G5:6 D5:2 B4:4 D5:4', 'G4:2 B4:2 E5:4 D5:2 E5:2 G5:4', 'E5:6 C5:2 A4:8', 'F4:2 A4:2 D5:4 C5:2 D5:2 F5:4', 'E5:2 D5:2 B4:4 G4:2 B4:2 D5:4', 'C5:6 E5:2 G5:4 E5:4', 'C5:8 -:4 G4:2 C5:2'],
};
/** B：見本の後半。高い所へ跳んで、開いて終わる */
const MAP_B: Section = {
  chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'G'],
  lead: ['E5:4 A5:4 G5:2 E5:2 C5:4', 'F5:4 A5:4 G5:2 F5:2 C5:4', 'E5:4 G5:4 C6:4 G5:4', 'D5:6 E5:2 D5:4 B4:4', 'E5:4 A5:4 G5:2 E5:2 C5:4', 'F5:4 A5:4 C6:2 A5:2 F5:4', 'G5:2 A5:2 B5:4 D6:4 B5:4', 'G5:8 -:8'],
};
/**
 * A の「休み」：矩形波の旋律は休み、三角波のやわらかい声が、長い音で和音をなぞる（分散和音が前に出る）。
 * 最後の 2 音は A と同じ弾みにして、B へつなぐ
 */
const MAP_A_REST: Section = {
  chords: MAP_A.chords,
  lead: ['C5:8 A4:8', 'B4:8 D5:4 -:4', 'B4:8 G4:8', 'A4:8 C5:4 -:4', 'A4:8 F4:8', 'G4:8 B4:4 -:4', 'G4:4 C5:4 E5:8', 'C5:8 -:4 G4:2 C5:2'],
};
/** C：つなぎの 8 小節（この段で足した）。A とは逆に「下りて、上り直す」形で、主和音から始める */
const MAP_C: Section = {
  chords: ['C', 'Em', 'F', 'G', 'Am', 'Em', 'Dm', 'G'],
  lead: ['G5:4 E5:2 C5:2 E5:4 G5:4', 'B5:6 G5:2 E5:8', 'A5:4 F5:2 C5:2 F5:4 A5:4', 'B5:4 A5:2 G5:2 D5:8', 'C6:4 A5:2 E5:2 A5:4 C6:4', 'B5:6 G5:2 E5:4 G5:4', 'F5:2 E5:2 D5:4 F5:2 A5:2 D6:4', 'B5:8 -:4 G4:2 C5:2'],
};

interface FormPart {
  sec: Section;
  /** 節の中の小節（0〜7）ごとの変化 */
  mod?: (bar: number) => BarMod | undefined;
}
/**
 * 地図の曲の構成（8 小節 × 8 ＝ 64 小節）。
 *  1 巡め：A → B（見本のまま）
 *  2 巡め：A の休み（旋律が三角波の長い音に替わり、太鼓は軽く。終わりの連打で戻る）→ B（分散和音を別の順で）
 *  3 巡め：C（つなぎ）→ B
 *  4 巡め：A（はじめの 4 小節は分散和音が休み、5 小節めから入り直す）→ B（分散和音を別の順で。終わりに連打）
 */
export const MAP_FORM: FormPart[] = [
  { sec: MAP_A, mod: (b) => (b === 7 ? { fill: true } : undefined) },
  { sec: MAP_B, mod: (b) => (b === 7 ? { fill: true } : undefined) },
  { sec: MAP_A_REST, mod: (b) => ({ leadWave: 'tri', drums: 'light', fill: b === 7 }) },
  { sec: MAP_B, mod: (b) => ({ arpAlt: true, fill: b === 7 }) },
  { sec: MAP_C, mod: (b) => (b === 7 ? { fill: true } : undefined) },
  { sec: MAP_B, mod: (b) => (b === 7 ? { fill: true } : undefined) },
  { sec: MAP_A, mod: (b) => (b < 4 ? { rest: ['arp'] } : b === 7 ? { fill: true } : undefined) },
  { sec: MAP_B, mod: (b) => ({ arpAlt: true, fill: b === 7 }) },
];

interface SongDef {
  bpm: number;
  chords: BarChord[];
  lead: string[];
  leadWave?: Wave;
  harmony?: boolean;
  drums: DrumStyle;
  fillBars?: number[];
  layers?: Layer[];
  once?: boolean;
  mods?: (BarMod | undefined)[];
}

const fromForm = (form: FormPart[]): Pick<SongDef, 'chords' | 'lead' | 'mods'> => {
  const chords: BarChord[] = [];
  const lead: string[] = [];
  const mods: (BarMod | undefined)[] = [];
  for (const p of form)
    p.sec.chords.forEach((c, b) => {
      chords.push(c);
      lead.push(p.sec.lead[b]);
      mods.push(p.mod?.(b));
    });
  return { chords, lead, mods };
};

const DEFS: Record<SongName, SongDef> = {
  // 地図：港町の昼
  map: { bpm: 116, drums: 'map', ...fromForm(MAP_FORM) },
  // 月次報告：同じ速さで、静かに数字を待つ。太鼓は刻みだけ（見本のまま）
  report: {
    bpm: 116,
    chords: ['C', 'C', 'Am', 'Am', 'F', 'F', 'G', 'G'],
    lead: ['E5:4 -:4 G5:4 -:4', 'E5:2 D5:2 C5:4 -:8', 'E5:4 -:4 A5:4 -:4', 'E5:2 D5:2 C5:4 -:8', 'F5:4 -:4 A5:4 -:4', 'G5:2 F5:2 E5:4 -:8', 'D5:4 -:4 G5:4 -:4', 'B4:2 D5:2 G5:4 -:8'],
    leadWave: 'tri',
    drums: 'soft',
    layers: ['lead', 'bass', 'arp', 'drums'],
  },
  // 制覇：4 小節の祝いの曲。終わったら元の場面の曲へ戻る（見本のまま）
  fanfare: {
    bpm: 116,
    chords: ['C', ['F', 'G'], ['C', 'F'], ['G', 'C']],
    lead: ['G4:1 G4:1 G4:2 C5:4 E5:4 G5:4', 'A5:3 A5:1 A5:4 B5:3 B5:1 B5:4', 'C6:6 G5:2 A5:4 C6:4', 'D6:4 B5:2 D6:2 C6:8'],
    leadWave: 'p50',
    harmony: true,
    drums: 'march',
    layers: ['lead', 'bass', 'arp', 'drums', 'pad'],
    once: true,
  },
  // セクタ選択（ランドマップ）：ランドの全体を見わたす。長い音で上がっていき、落ち着かない和音で止めて、次の行き先を待つ
  sector: {
    bpm: 116,
    chords: ['Dm', 'G', 'C', 'Am', 'Dm', 'G', 'Em', 'Em'],
    lead: ['D5:6 F5:2 A5:8', 'G5:6 D5:2 B4:8', 'C5:6 E5:2 G5:8', 'E5:4 C5:4 A4:8', 'F5:6 A5:2 D6:8', 'B5:6 G5:2 D5:8', 'E5:4 G5:4 B5:8', 'B5:2 G5:2 E5:4 -:8'],
    leadWave: 'tri',
    drums: 'soft',
    layers: ['lead', 'bass', 'arp', 'drums', 'pad'],
  },
  // 発掘：地面の下。短く切った動機と休みで、掘る手の拍を作る。太鼓は半分の速さで重く、つるはしの「チッ」が裏に入る
  dig: {
    bpm: 116,
    chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'Dm', 'Em'],
    lead: ['A4:2 -:2 C5:2 E5:2 -:4 E5:2 D5:2', 'C5:4 A4:4 -:8', 'F4:2 -:2 A4:2 C5:2 -:4 C5:2 A4:2', 'B4:4 D5:4 -:4 G4:2 B4:2', 'A4:2 -:2 C5:2 E5:2 -:4 A5:2 G5:2', 'E5:4 C5:4 -:8', 'D5:2 -:2 F5:2 A5:2 -:4 F5:2 D5:2', 'E5:6 B4:2 E5:4 -:4'],
    drums: 'dig',
    layers: ['lead', 'bass', 'arp', 'drums'],
  },
  // 経営会議：背すじの伸びる歩みの拍。幅の広い矩形波で、付点の弾みをくり返す。分散和音は入れず、乾いた響きに
  board: {
    bpm: 116,
    chords: ['Am', 'Em', 'F', 'C', 'Dm', 'Am', 'Dm', 'G'],
    lead: ['A4:3 A4:1 C5:4 E5:4 C5:4', 'B4:3 B4:1 E5:4 G5:4 E5:4', 'A4:3 A4:1 C5:4 F5:6 E5:2', 'E5:8 -:4 G4:2 C5:2', 'D5:3 D5:1 F5:4 A5:4 F5:4', 'E5:3 E5:1 C5:4 A4:8', 'D5:4 F5:4 E5:2 D5:2 A4:4', 'B4:6 D5:2 G5:4 -:4'],
    leadWave: 'p50',
    drums: 'board',
    layers: ['lead', 'bass', 'drums', 'pad'],
  },
  // タイトル：地図の曲の主題を、ゆっくり・三角波で。前半は低音と太鼓が休み、後半で入る
  title: {
    bpm: 100,
    chords: [...MAP_A.chords, ...MAP_B.chords],
    lead: [...MAP_A.lead, ...MAP_B.lead],
    leadWave: 'tri',
    drums: 'soft',
    layers: ['lead', 'bass', 'arp', 'drums', 'pad'],
    mods: Array.from({ length: 16 }, (_, b) => (b < 8 ? { rest: ['bass', 'drums'] as Layer[] } : undefined)),
  },
};

const build = (d: SongDef): Song => {
  const mods = d.chords.map((_, b) => {
    const m = d.mods?.[b];
    return d.fillBars?.includes(b) ? { ...m, fill: true } : m;
  });
  return { bpm: d.bpm, bars: d.chords.length, chords: d.chords, leadEv: d.lead.map(line), leadWave: d.leadWave, harmony: d.harmony, drums: d.drums, layers: d.layers, once: d.once, mods };
};

export const SONGS: Record<SongName, Song> = Object.fromEntries(SONG_NAMES.map((k) => [k, build(DEFS[k])])) as Record<SongName, Song>;
/** 確かめ用：旋律の書き方（1 小節が 16 になっているかをテストで見る） */
export const SONG_LEAD_TEXT: Record<SongName, string[]> = Object.fromEntries(SONG_NAMES.map((k) => [k, DEFS[k].lead])) as Record<SongName, string[]>;
