/**
 * 段 S1：教え（ヒーロー → 社長への Successor。DOM なし）。ビジョン 0 章のオチ：偉人たちの仕事の流儀が、提案・会話・組み合わせのできごとを通じて社長に残る。
 * - データ：型（8 つ）は fit.json の ls（いつも読み込む。効き目の計算に使う）、名前・中身・もとは lesson.json（日本語の表示のときだけ、あとから読み込む）。
 *   どちらも scripts/heroes/build.mjs（作り方は lessons.mjs）が史実の調査から作る。新しい人物の事実は作らない。
 * - 1 人のヒーローから 1 つ（レプリカはオリジナルと同じ人物なので、どちらかで 1 つ）。調査に流儀の無いヒーロー（コラボ・いまも信仰される神・ノービス）には無い。
 * - 残るとき（月の締め。lessonMonth）：そのヒーローの提案を承認して、翌月の締めで見込みの向きに数字が動いた／そのヒーローと LESSON.need 回かかわった（meetHero）。
 *   最初の町の 1 か月目（チュートリアル）は残らない。1 回の締めで LESSON.perMonth まで。
 * - 効き目（lessonFx）：型ごとの数（LESSON.cap まで）× LESSON.fx。いまのモデルの数字だけに効く（model.ts の fxSum・hr.ts・cs.ts・budget.ts・提案の読みの誤差）。
 * 仕様は docs/ISLAND_PHASE1.md「教え（段 S1）」。
 */
import { isEn, t } from '../../i18n';
import fitRaw from './heroes/fit.json';
import { DELEG, LESSON, type LessonType } from './data';
import { baseId } from './voice';
import type { P1State, Report } from './model';

// ---------------------------------------------------------------- 型

/** 型の並び（fit.json の ls の数字。scripts/heroes/lessons.mjs の LESSON_TYPES と同じ順） */
export const LESSON_TYPES: LessonType[] = ['decide', 'speed', 'steady', 'novel', 'people', 'customer', 'numbers', 'deal'];
/** 型の仮のアイコン（絵文字。docs/ISLAND_ART_TODO.md） */
export const LESSON_ICON: Record<LessonType, string> = { decide: '🎯', speed: '⚡', steady: '🧱', novel: '💡', people: '🌱', customer: '🛍️', numbers: '📊', deal: '🤝' };
/** 型の札の色（棒・札の縁。色だけに頼らず、アイコンと名前を添える） */
export const LESSON_COLOR: Record<LessonType, string> = { decide: '#e8885a', speed: '#f2b544', steady: '#8f9bb8', novel: '#9a7ae0', people: '#5fc4b0', customer: '#c0609a', numbers: '#3a8fd8', deal: '#6fb36a' };
export const lessonTypeName = (k: LessonType): string =>
  ({
    decide: t('決断', 'Decision'),
    speed: t('速さ', 'Speed'),
    steady: t('堅実', 'Steady'),
    novel: t('奇策', 'Novelty'),
    people: t('人を育てる', 'Growing people'),
    customer: t('顧客', 'Customers'),
    numbers: t('数字', 'Numbers'),
    deal: t('交渉', 'Negotiation'),
  })[k];

const FIT = fitRaw as { ls?: Record<string, number> };
/** 教えのあるヒーロー（調査の id。並びは id の順） */
export const LESSON_IDS: number[] = Object.keys(FIT.ls ?? {})
  .map(Number)
  .sort((a, b) => a - b);
/** そのヒーローの教えの型（調査の無いヒーロー・教えの無いヒーローは null） */
export function lessonTypeOf(hero: number): LessonType | null {
  const b = baseId(hero);
  if (b == null) return null;
  const y = FIT.ls?.[String(b)];
  return y == null ? null : (LESSON_TYPES[y] ?? null);
}

// ---------------------------------------------------------------- 名前・中身・もと（日本語だけ。あとから読み込む）

type LessonText = { n: string; b: string; r: string };
let TEXT: Record<string, LessonText> | null = null;
let loading: Promise<void> | null = null;
/** lesson.json を読み込む（日本語の表示のときだけ。読めなかったら型の文のまま） */
export function loadLessons(): Promise<void> {
  if (TEXT) return Promise.resolve();
  return (loading ??= import('./heroes/lesson.json').then((m) => {
    TEXT = (m.default ?? m) as unknown as Record<string, LessonText>;
  }));
}
/** テスト：読み込みを捨てる（型の文に戻す） */
export const unloadLessons = () => {
  TEXT = null;
  loading = null;
};
if (!isEn) void loadLessons().catch(() => undefined);

/** 型ごとの文（英語の表示・読み込む前）。名前と、型の考え方の 1 文 */
const GENERIC: Record<LessonType, () => { n: string; b: string }> = {
  decide: () => ({ n: t('迷ったら、決めて動く', 'Decide, then move'), b: t('決めるのが仕事だ。決めたら迷わず進めよう。', 'Deciding is the job. Once decided, go.') }),
  speed: () => ({ n: t('速さは力', 'Speed is power'), b: t('先に動いた者が、いちばん良い場所を取る。', 'Whoever moves first gets the best spot.') }),
  steady: () => ({ n: t('一歩ずつ、やり抜く', 'Step by step, see it through'), b: t('派手な手より、続けられる手を。', 'Choose what you can keep doing over what looks flashy.') }),
  novel: () => ({ n: t('まず、新しい手を試す', 'Try the new way first'), b: t('小さく試せば、外れても痛くない。', 'Small trials make misses cheap.') }),
  people: () => ({ n: t('人を育て、任せる', 'Grow people, then trust them'), b: t('任せた人が育てば、会社が育つ。', 'When the people you trust grow, the company grows.') }),
  customer: () => ({ n: t('お客の声が先', 'Customers first'), b: t('不満の裏には、本当の願いがある。', 'Behind every complaint is a real wish.') }),
  numbers: () => ({ n: t('まず、測ってから決める', 'Measure, then decide'), b: t('数字は嘘をつかない。読みは測って確かめよう。', 'Numbers don’t lie. Check your read by measuring.') }),
  deal: () => ({ n: t('相手と手を結ぶ', 'Make the deal work for both'), b: t('相手の得も考えれば、話は早くまとまる。', 'Think of their gain too and talks go fast.') }),
};
/** 教えの文：名前・中身（その人の言葉）・もと（適性の根拠か逸話の 1 文。無ければ空）。教えの無いヒーローは null */
export function lessonText(hero: number): { type: LessonType; name: string; body: string; root: string } | null {
  const type = lessonTypeOf(hero);
  if (!type) return null;
  const x = !isEn ? TEXT?.[String(baseId(hero))] : undefined;
  if (x) return { type, name: x.n, body: x.b, root: x.r };
  const g = GENERIC[type]();
  return { type, name: g.n, body: g.b, root: '' };
}

// ---------------------------------------------------------------- 記録（セーブ）

export interface LessonGot {
  /** 教えてくれたヒーロー（レプリカならその id）・受け継いだ日・その町の報告の月・どうして残ったか（提案の結果・かかわった回数） */
  hero: number;
  day: number;
  month: number;
  via: 'prop' | 'meet';
}
/**
 * 段 S1（s.lessons。無くてよい項目なのでセーブの版は上げない。古いセーブは教えなしから）：受け継いだ教え（調査の id → 記録）・
 * かかわった回数と最後にかかわった日（まだ受け継いでいないヒーロー）・まだ知らせていない教え（ヒーローの id。画面のお知らせで 1 回）・受け継いだ数
 */
export interface LessonState {
  got: Record<string, LessonGot>;
  met: Record<string, number>;
  last: Record<string, number>;
  fresh: number[];
  n: number;
}
export const newLessons = (): LessonState => ({ got: {}, met: {}, last: {}, fresh: [], n: 0 });
const L = (s: P1State): LessonState => (s.lessons ??= newLessons());
/** 段 S1 を止める（計測の「S1 なし」とテスト）：残らない・効かない */
export const LESSON_OFF = { on: false };

const inTut = (s: Pick<P1State, 'tut'>) => typeof s.tut === 'number' && s.tut < 99;
/** 受け継いだか（調査の id で。レプリカとオリジナルは同じ） */
export const hasLesson = (s: Pick<P1State, 'lessons'>, hero: number) => {
  const b = baseId(hero);
  return b != null && !!s.lessons?.got[String(b)];
};
/** 受け継いだ数 */
export const lessonN = (s: Pick<P1State, 'lessons'>) => s.lessons?.n ?? 0;

/**
 * そのヒーローとかかわった（カードを選んだ・部長の提案を決めた・部長と話した・組み合わせのできごと・経営会議の報告）。
 * 同じ日は 1 回だけ数える。チュートリアルのあいだ・教えの無いヒーロー・受け継いだあとは数えない
 */
export function meetHero(s: P1State, hero: number | null | undefined) {
  if (LESSON_OFF.on || hero == null || inTut(s)) return;
  const b = baseId(hero);
  if (b == null || FIT.ls?.[String(b)] == null) return;
  const S = L(s);
  const k = String(b);
  if (S.got[k] || S.last[k] === s.day) return;
  S.last[k] = s.day;
  S.met[k] = (S.met[k] ?? 0) + 1;
}

/**
 * 月の締め（model.ts の step。delegMonth の結果のあと）：教えが残るヒーローを選んで記録し、知らせる列に入れる。返り値は残ったヒーローの id。
 * 候補：先月承認した提案の結果が見込みの向きに動いた人（先）・かかわった回数が LESSON.need に届いた人（多い順）。どちらも、いま会社にいる人だけ
 */
export function lessonMonth(s: P1State, r: Report): number[] {
  if (LESSON_OFF.on || inTut(s) || s.reports.length < LESSON.first) return [];
  const S = L(s);
  const here = new Set(s.staff.map((x) => x.hero));
  const seen = new Set<string>();
  const cands: { hero: number; via: LessonGot['via']; k: number }[] = [];
  const add = (hero: number, via: LessonGot['via'], k: number) => {
    const b = baseId(hero);
    if (b == null || FIT.ls?.[String(b)] == null || S.got[String(b)] || seen.has(String(b)) || !here.has(hero)) return;
    seen.add(String(b));
    cands.push({ hero, via, k });
  };
  for (const x of r.deleg?.results ?? []) if (x.est > 0 && x.real > 0) add(x.hero, 'prop', 1000 + Math.min(999, x.real / Math.max(1e-9, x.est)));
  for (const st of [...s.staff].sort((a, b) => a.hero - b.hero)) {
    const b = baseId(st.hero);
    const m = b == null ? 0 : (S.met[String(b)] ?? 0);
    if (m >= LESSON.need) add(st.hero, 'meet', m);
  }
  const out: number[] = [];
  for (const c of cands.sort((a, b) => b.k - a.k || a.hero - b.hero).slice(0, LESSON.perMonth)) {
    const k = String(baseId(c.hero));
    S.got[k] = { hero: c.hero, day: s.day, month: r.month, via: c.via };
    delete S.met[k];
    delete S.last[k];
    S.n = Object.keys(S.got).length;
    S.fresh.push(c.hero);
    out.push(c.hero);
  }
  return out;
}
/** まだ知らせていない教え（画面が 1 回だけ出す。取り出したら空に） */
export function takeFresh(s: P1State): number[] {
  const S = s.lessons;
  if (!S?.fresh.length) return [];
  return S.fresh.splice(0);
}

// ---------------------------------------------------------------- 効き目

/** 型ごとの数（受け継いだ教え。キャッシュ：記録と数が同じなら使い回す） */
const countCache = new WeakMap<object, { n: number; c: Record<LessonType, number> }>();
export function lessonCounts(s: Pick<P1State, 'lessons'>): Record<LessonType, number> {
  const S = s.lessons;
  const zero = () => Object.fromEntries(LESSON_TYPES.map((k) => [k, 0])) as Record<LessonType, number>;
  if (!S) return zero();
  const hit = countCache.get(S.got);
  if (hit && hit.n === S.n) return hit.c;
  const c = zero();
  for (const [k, g] of Object.entries(S.got)) {
    const y = lessonTypeOf(g.hero) ?? (FIT.ls?.[k] != null ? LESSON_TYPES[FIT.ls[k]] : null);
    if (y) c[y]++;
  }
  countCache.set(S.got, { n: S.n, c });
  return c;
}
/** 効き目の種類 → 型（汎用の効き目 FxKind の名前と、教えだけの 4 つ：labor・morale・sat・err） */
const KIND_TYPE: Record<string, LessonType> = { labor: 'decide', haulDays: 'speed', buyDays: 'speed', upkeep: 'steady', rp: 'novel', morale: 'people', sat: 'customer', err: 'numbers', matPrice: 'deal' };
/** 効いている型の数（LESSON.cap まで） */
export const lessonLive = (s: Pick<P1State, 'lessons'>, k: LessonType) => Math.min(LESSON.cap, lessonCounts(s)[k]);
/**
 * 効き目の大きさ（その種類。止めているとき・教えが無いときは 0）。model.ts の fxSum（haulDays・buyDays・upkeep・matPrice）・budget.ts（labor）・
 * model.ts の研究ポイント（rp）・hr.ts（morale：役目のある人の士気の目指す値 +点）・cs.ts（sat：下がり方 −割合）・読みの誤差（err：−割合）
 */
export function lessonFx(s: object, kind: string): number {
  const S = (s as Partial<Pick<P1State, 'lessons'>>).lessons;
  if (LESSON_OFF.on || !S?.n) return 0;
  const y = KIND_TYPE[kind];
  if (!y) return 0;
  return lessonLive({ lessons: S }, y) * LESSON.fx[y];
}
/** 提案の読みの誤差の大きさ（DELEG.prop.err × 数字の教え） */
export const propErrK = (s: object) => DELEG.prop.err * (1 - lessonFx(s, 'err'));
/** 提案の読みの誤差（±割合。担当の出来 q から。2 桁で丸める） */
export const readErr = (s: object, q: number) => Math.round((1 - q) * propErrK(s) * 100) / 100;

/** 型の効き目の文（n 個ぶん。n を省くと 1 つあたり） */
export function fxLine(k: LessonType, n = 1): string {
  const v = LESSON.fx[k] * n;
  const p = Math.round(v * 100);
  switch (k) {
    case 'decide':
      return t(`部長の施策に使える労力 +${p}%`, `Head’s labor for measures +${p}%`);
    case 'speed':
      return t(`運ぶ日数・調達の日数 −${p}%`, `Hauling and buying days −${p}%`);
    case 'steady':
      return t(`建物の維持費 −${p}%`, `Building upkeep −${p}%`);
    case 'novel':
      return t(`入る研究ポイント +${p}%`, `Research points gained +${p}%`);
    case 'people':
      return t(`役目のある人の士気 +${Math.round(v)}`, `Morale of leads & heads +${Math.round(v)}`);
    case 'customer':
      return t(`顧客満足度の下がり方 −${p}%`, `Satisfaction drops −${p}%`);
    case 'numbers':
      return t(`提案の読みの誤差 −${p}%`, `Proposal read error −${p}%`);
    case 'deal':
      return t(`素材の値段 −${p}%`, `Material prices −${p}%`);
  }
}

// ---------------------------------------------------------------- 図鑑

export interface LessonRow {
  /** 調査の id・教えてくれたヒーロー（受け継いだ人。まだならいま会社にいる人か調査の id） */
  id: number;
  hero: number;
  type: LessonType;
  got: LessonGot | null;
  /** かかわった回数（まだのとき） */
  met: number;
  /** いま会社にいる */
  here: boolean;
}
/** 図鑑の行：受け継いだもの（新しい順）→ まだで会社にいる人（かかわった回数の多い順）。会社にいない、まだのヒーローは数だけ（rest） */
export function lessonDex(s: P1State): { got: LessonRow[]; near: LessonRow[]; rest: number; total: number } {
  const S = s.lessons;
  const got: LessonRow[] = [];
  const near: LessonRow[] = [];
  const herePer = new Map<number, number>();
  for (const st of s.staff) {
    const b = baseId(st.hero);
    if (b != null && !herePer.has(b)) herePer.set(b, st.hero);
  }
  for (const id of LESSON_IDS) {
    const type = LESSON_TYPES[FIT.ls![String(id)]];
    const g = S?.got[String(id)] ?? null;
    const hh = herePer.get(id);
    if (g) got.push({ id, hero: g.hero, type, got: g, met: 0, here: hh != null });
    else if (hh != null) near.push({ id, hero: hh, type, got: null, met: S?.met[String(id)] ?? 0, here: true });
  }
  got.sort((a, b) => b.got!.day - a.got!.day || a.id - b.id);
  near.sort((a, b) => b.met - a.met || a.id - b.id);
  return { got, near, rest: LESSON_IDS.length - got.length - near.length, total: LESSON_IDS.length };
}
