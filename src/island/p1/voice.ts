/**
 * 段 P2：ヒーローの声と適性（DOM なし）。史実の調査（docs/heroes/research）を scripts/heroes/build.mjs で小さくしたデータを使う。
 * - 適性（fit.json。いつも読み込む・約 3 kB）：部門・役職ごとの S〜D。任せた部門の出来（deleg.ts の quality）・持ち場の速さ（model.ts の speed）・
 *   セクター長の売上に、data.ts の HERO_FIT.mul の倍率を掛ける（倍率の表は 1 か所。掛ける所は fitDept・fitTask・fitSector の 3 つの入り口だけ）。
 * - 声（voice.json。日本語の表示のときだけ、起動のあとに別のファイルで読み込む・gzip で約 100 kB）：一人称・社長の呼び方・口ぐせ・場面のセリフ・適性の根拠。
 *   読み込む前・英語の表示・調査の無いヒーロー（ノービスなど）は、いまの口調の型（persona.ts）のまま。
 * - レプリカ（id = オリジナル + 10000・同じ名前）はオリジナルと同じデータを使う（名前で対応づける）。
 * 仕様は docs/ISLAND_PHASE1.md「ヒーローの声と適性」。
 */
import { isEn, t } from '../../i18n';
import { heroById } from '../../game/catalog';
import { CARD, DEPT, HERO_FIT, type DeptId, type Task } from './data';
import fitRaw from './heroes/fit.json';

// ---------------------------------------------------------------- 止める（比べの計測・テスト）

/** 段 P2 を止める（fit：適性の倍率を 1 に・duo：組み合わせを出さない・効かない）。計測の「P2 なし」とテストで使う */
export const P2_OFF = { fit: false, duo: false };

// ---------------------------------------------------------------- 適性

export const FIT_KEYS = ['strategy', 'logistics', 'sales', 'marketing', 'support', 'systems', 'rnd', 'legal', 'hr', 'general', 'accounting', 'sector_head', 'shop', 'craft', 'buyer', 'digger'] as const;
export type FitKey = (typeof FIT_KEYS)[number];
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';
const FIT = fitRaw as { k: string[]; g: Record<string, string>; best: Record<string, number[]>; st?: Record<string, string> };

/** 調査のある id（レプリカはオリジナルへ。名前が同じものだけ）。無ければ null */
const baseCache = new Map<number, number | null>();
export function baseId(id: number): number | null {
  if (baseCache.has(id)) return baseCache.get(id)!;
  let out: number | null = null;
  if (FIT.g[String(id)]) out = id;
  else {
    const h = heroById.get(id) as { name?: string; category?: string } | undefined;
    if (h?.category === 'replica') {
      const o = heroById.get(id - 10000) as { name?: string } | undefined;
      if (o && o.name === h.name && FIT.g[String(id - 10000)]) out = id - 10000;
      else for (const [k, v] of heroById) if ((v as { name?: string; category?: string }).category === 'original' && (v as { name?: string }).name === h.name && FIT.g[String(k)]) out = k;
    }
  }
  baseCache.set(id, out);
  return out;
}
/** 適性（S〜D）。調査が無ければ null */
export function gradeOf(hero: number, key: FitKey): Grade | null {
  const b = baseId(hero);
  if (b == null) return null;
  return (FIT.g[String(b)]?.[FIT_KEYS.indexOf(key)] as Grade | undefined) ?? null;
}
/** 向いている順の役（best_roles） */
export const bestFits = (hero: number): FitKey[] => {
  const b = baseId(hero);
  return b == null ? [] : (FIT.best[String(b)] ?? []).map((n) => FIT_KEYS[n]);
};
/** 倍率（調査の無いヒーロー・止めているときは 1） */
export function fitMul(hero: number | undefined, key: FitKey | null | undefined): number {
  if (P2_OFF.fit || hero == null || !key) return 1;
  const g = gradeOf(hero, key);
  return g ? HERO_FIT.mul[g] : 1;
}
/** 持ち場（仕事）→ 適性の欄。セクター長・リーダー・修行・バイトは別（リーダー・部長は部門の出来、セクター長は fitSector） */
export const TASK_FIT: Partial<Record<Task, FitKey>> = { craft: 'craft', shop: 'shop', buy: 'buyer', dig: 'digger', transport: 'logistics', explore: 'marketing', intel: 'marketing' };
/** 入り口 1：任せた部門の出来（deleg.ts の quality）に掛ける */
export const fitDept = (hero: number | undefined, d: DeptId) => fitMul(hero, d);
/** 入り口 2：持ち場の速さ（model.ts の speed）に掛ける */
export const fitTask = (hero: number | undefined, task: Task) => fitMul(hero, TASK_FIT[task]);
/** 入り口 3：セクター長の売上の倍率（model.ts の runSector の rate）に足す（倍率 − 1） */
export const fitSector = (hero: number | undefined) => fitMul(hero, 'sector_head') - 1;

// ---------------------------------------------------------------- 施策の好み（段 I2b）

/**
 * 施策の好み（経営会議の部長の「来期の計画」の選び方と言い回し）：atk 攻め +1／守り −1・spd 速さ +1／堅実 −1・odd 奇策（新しい手）+1／正攻法 −1・grow 人を育てる 1。
 * 調査のあるヒーローは fit.json の st（scripts/heroes/build.mjs の styleOf：調査の性格・強み・弱み・口調の言葉から）。調査の無いヒーローは口調の型（persona.ts）から
 */
export interface HeroStyle {
  atk: -1 | 0 | 1;
  spd: -1 | 0 | 1;
  odd: -1 | 0 | 1;
  grow: 0 | 1;
}
/** 調査の無いヒーロー：口調の型ごとの好み（4 字。st と同じ書き方） */
const TONE_STYLE: Record<string, string> = { scholar: '-SO-', warrior: 'AF--', leader: 'A--N', polite: 'D-O-', cheer: 'AFK-', merchant: '--K-', easy: 'DS--', quiet: '-S--' };
export function styleCode(hero: number, tone: string): string {
  const b = baseId(hero);
  return (b != null ? FIT.st?.[String(b)] : null) ?? TONE_STYLE[tone] ?? '----';
}
export function parseStyle(code: string): HeroStyle {
  const c = (k: number) => code[k] ?? '-';
  return { atk: c(0) === 'A' ? 1 : c(0) === 'D' ? -1 : 0, spd: c(1) === 'F' ? 1 : c(1) === 'S' ? -1 : 0, odd: c(2) === 'K' ? 1 : c(2) === 'O' ? -1 : 0, grow: c(3) === 'N' ? 1 : 0 };
}
/** 好みの札（画面：「攻め・速さ・新しい手・人を育てる」。どちらでもない軸は出さない） */
export function styleTags(st: HeroStyle): string[] {
  const out: string[] = [];
  if (st.atk) out.push(st.atk > 0 ? t('攻め', 'Bold') : t('守り', 'Careful'));
  if (st.spd) out.push(st.spd > 0 ? t('速さ', 'Fast') : t('堅実', 'Steady'));
  if (st.odd) out.push(st.odd > 0 ? t('新しい手', 'Novel') : t('正攻法', 'Orthodox'));
  if (st.grow) out.push(t('人を育てる', 'Grows people'));
  return out;
}

/** 欄の名前 */
export function fitName(k: FitKey): string {
  if (k in DEPT) return DEPT[k as DeptId].name;
  switch (k) {
    case 'sector_head':
      return t('セクター長', 'Sector head');
    case 'shop':
      return t('店長', 'Shopkeeper');
    case 'craft':
      return t('職人', 'Crafter');
    case 'buyer':
      return t('買い付け', 'Buyer');
    case 'digger':
      return t('発掘', 'Digger');
  }
  return k;
}
/** 札の色（S 金・A 緑・B 青・C 灰・D 赤みの灰） */
export const GRADE_COLOR: Record<Grade, string> = { S: '#f2c14e', A: '#5fd18a', B: '#6aa8ff', C: '#9aa3ad', D: '#c98a7a' };

// ---------------------------------------------------------------- 声（あとから読み込む）

export type Scene = 'greet' | 'propose' | 'approved' | 'rejected' | 'tired' | 'success';
/**
 * 段 UI9b（追加 2）：語尾の型（scripts/heroes/build.mjs の registerOf。summary.ts が語尾を置き換える）。
 * polite：です・ます／genki：〜だよ！／assert：〜である・〜せよ／tosa：〜ぜよ・〜じゃき／archaic：〜でござる／gentle：〜ですね／terse：体言止め／rough：〜だ・〜だぜ
 */
export type Register = 'polite' | 'genki' | 'assert' | 'tosa' | 'archaic' | 'gentle' | 'terse' | 'rough';
export interface Voice {
  /** 一人称・社長の呼び方・口ぐせ */
  fp: string;
  to: string;
  tic: string[];
  l: Record<Scene, string[]>;
  /** 適性の根拠（FIT_KEYS の順） */
  why: string[];
  /** 語尾の型（無ければ polite） */
  reg?: Register;
}
let VOICE: Record<string, Voice> | null = null;
let loading: Promise<void> | null = null;
/** 声のデータを読み込む（別のファイル。何度呼んでも 1 回）。英語の表示では読み込まない */
export function loadVoice(): Promise<void> {
  if (VOICE || isEn) return Promise.resolve();
  return (loading ??= import('./heroes/voice.json').then((m) => {
    VOICE = (m as unknown as { default: Record<string, Voice> }).default ?? (m as unknown as Record<string, Voice>);
  }));
}
/** 声が使えるか（読み込み済み・日本語） */
export const voiceReady = () => !!VOICE && !isEn;
/** テスト：読み込んだ声を外す（いまの型のセリフに戻るのを確かめる） */
export const unloadVoice = () => {
  VOICE = null;
  loading = null;
};
// 起動したらすぐ読み込み始める（日本語の表示だけ。はじめの描画は待たない）
if (!isEn) void loadVoice().catch(() => undefined);

/** そのヒーローの声（無ければ null） */
export function voiceOf(hero: number | null | undefined): Voice | null {
  if (hero == null || !VOICE || isEn) return null;
  const b = baseId(hero);
  return b == null ? null : VOICE[String(b)] ?? null;
}
/** 適性の根拠の 1 行（日本語・声を読み込んでいるときだけ） */
export const whyOf = (hero: number, k: FitKey): string => voiceOf(hero)?.why[FIT_KEYS.indexOf(k)] ?? '';
/** 「人事 S：家臣の才を見抜き登用した。」（根拠が無ければ「人事 S」） */
export function fitLine(hero: number, k: FitKey): string {
  const g = gradeOf(hero, k);
  if (!g) return '';
  const w = whyOf(hero, k).replace(/。$/, '');
  return w ? t(`${fitName(k)} ${g}：${w}`, `${fitName(k)} ${g}`) : `${fitName(k)} ${g}`;
}

const mix = (n: number) => {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  return (x ^ (x >>> 13)) >>> 0;
};
/** 場面のセリフ（salt で回す）。声が無ければ null */
export function lineOf(hero: number | null | undefined, scene: Scene, salt = 0): string | null {
  const v = voiceOf(hero);
  const xs = v?.l[scene];
  if (!xs?.length) return null;
  return xs[mix((hero ?? 0) * 31 + salt) % xs.length];
}

/** [[ ]] を除いた字数 */
const len = (x: string) => [...x.replace(/\[\[|\]\]/g, '')].length;
/**
 * カードの課題のセリフ（UI1）：「社長の呼び方、＋ 課題 ＋ 。」。CARD.sayMax 字を超えたら呼び方を落とす。声が無ければ null（いまの型）
 */
export function voiceSay(hero: number | null | undefined, core: string): string | null {
  const v = voiceOf(hero);
  if (!v) return null;
  const a = `${v.to}、${core}。`;
  return len(a) <= CARD.sayMax ? a : `${core}。`;
}
/** ウィットの一言の種類（persona.ts の QuipCat と同じ） */
type Cat = 'sell' | 'craft' | 'buy' | 'idle' | 'head' | 'cs' | 'flame' | 'rally' | 'quit' | 'tax';
/**
 * カードのウィットの一言（UI1）：辞めたい → 疲れたときのセリフ、ほか → 提案のセリフと口ぐせを月で回す。声が無ければ null（いまの型の一言）
 */
export function voiceQuip(hero: number | null | undefined, cat: Cat, turn: number): string | null {
  const v = voiceOf(hero);
  if (!v) return null;
  const pool = cat === 'quit' ? v.l.tired : [...v.l.propose, ...v.tic];
  if (!pool.length) return null;
  return pool[(mix((hero ?? 0) * 131 + cat.length) + turn) % pool.length];
}
/** トーストの一行：「💬 織田信長「で、あるか。ならば今日から動く。」」（声が無ければ null） */
export function voiceToast(hero: number | null | undefined, scene: Scene, name: string, salt = 0): string | null {
  const x = lineOf(hero, scene, salt);
  return x ? `💬 ${name}「${x}」` : null;
}
