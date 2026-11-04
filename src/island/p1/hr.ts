/**
 * 人事（段 E2。docs/ISLAND_PHASE1.md「カリスマ度」「士気と給与」）：経営者のカリスマ度と雇えるレアリティ・ヒーローの士気・給与（相場と段）。
 * DOM なし。数字は data.ts の CHARISMA・MORALE・SALARY・PAY の 1 か所。テストは tests/island-p1-e2.test.ts。
 *
 * - カリスマ度は記録（制覇・研究成果の発表・ブランド力のいちばん高かった値・研究パネル）から毎回数え直す：ランクアップの災害でも失わず、
 *   古いセーブもさかのぼって同じ数になる。P1State.charisma は「お知らせ済みの値」（上がったときのトースト）。
 * - 士気は Staff.morale（0〜100）。毎日、目標へ少しずつ寄り、出来事（休み・働きすぎ・レベルアップ・昇進・昇格・昇給・賞与）で上下する。
 *   チュートリアル（タオックスの 1 か月目＝growthOn が false）のあいだは動かない（初めの 70 は「ふつう」の帯なので、働きの速さは ×1）。
 * - 給与は Staff.wage（月給。いままでどおり）と Staff.lv（給与の段。昇給 +1・下げる −1）。払う額は wage × wageMul（パネル）で、
 *   月次報告・決算書の人件費の行と同じ合計になる。
 */
import { t } from '../../i18n';
import { CHARISMA, DEPT_SKILLS, HIRE_POOL, SKILL, HERO_RARITY, HIRE_RARITIES, MORALE, PAY, SALARY, SECTORS, capLv, type HeroRarity, type Task, type Tier } from './data';
import { heroRarityOf, rarIdx } from './hero';
import { fatigueMorale } from './ga';
import { duoMorale } from './duo';
import { goalMorale } from './board';
import { assign, growthOn, has, lvMul, staffOf, uncommonHeroes, wageMul, wageOf, ringOpen, type P1State, type Staff } from './model';
import { heroById } from '../../game/catalog';

/**
 * 段 E2 を止める（自動プレイ・テストで「段 E2 の前」と比べるためだけ。ふつうのゲームでは使わない）：士気は動かず（×1）、
 * 雇えるレアリティは段 E2 の前と同じ（パネルしだいで Rare まで。格の候補は来ない）
 */
export const HR_OFF = { on: false };

// ---------------------------------------------------------------- カリスマ度

const tierOfSector = (id: string): Tier => SECTORS.find((x) => x.id === id)?.tier ?? 'C';

/** 制覇した町のランク（いまの町・ランドの写しの記録から。同じ町は 1 回） */
export function clearedTiers(s: P1State): Tier[] {
  const out: Tier[] = [];
  const cur = s.land?.cur ?? s.sector ?? 'c1';
  if (s.cleared) out.push(s.tier ?? tierOfSector(cur));
  for (const [id, r] of Object.entries(s.land?.recs ?? {})) {
    if (id === cur) continue;
    const snap = r.snap as { cleared?: boolean; tier?: Tier } | undefined;
    if (snap?.cleared) out.push(snap.tier ?? tierOfSector(id));
  }
  return out;
}

export interface CharismaParts {
  clear: number;
  present: number;
  brand: number;
  panel: number;
  /** テストの札・監査で足す分（ふつうのゲームでは 0） */
  extra: number;
  total: number;
}
/** カリスマ度の内訳（記録から数え直す） */
export function charismaParts(s: P1State): CharismaParts {
  const clear = clearedTiers(s).reduce((a, x) => a + CHARISMA.clear[x], 0);
  const present = [...new Set(s.presented ?? [])].reduce((a, id) => a + CHARISMA.present[tierOfSector(id)], 0);
  const peak = Math.max(s.brandPeak ?? 0, s.brand ?? 0);
  const brand = Math.min(CHARISMA.brand.max, Math.floor(peak / CHARISMA.brand.per));
  const panel = has(s, 'hr_brand') ? CHARISMA.panel : 0;
  const extra = s.charismaBonus ?? 0;
  const total = Math.max(0, Math.min(CHARISMA.max, clear + present + brand + panel + extra));
  return { clear, present, brand, panel, extra, total };
}
export const charismaOf = (s: P1State) => charismaParts(s).total;

/** そのレアリティを雇うのに要るカリスマ度（Novice・Common は 0） */
export const capAt = (r: HeroRarity) => CHARISMA.cap[r === 'LL' ? 'L' : r] ?? 0;
/** いまのカリスマ度で雇えるいちばん上のレアリティ（Common まではいつでも） */
export function hireCap(s: P1State, v = charismaOf(s)): HeroRarity {
  if (HR_OFF.on) return 'R';
  let top: HeroRarity = 'C';
  for (const r of HIRE_RARITIES) if (v >= capAt(r)) top = r;
  return top;
}
/** そのヒーローを（カリスマ度で）雇えるか */
export const canHireRarity = (s: P1State, r: HeroRarity, v = charismaOf(s)) => rarIdx(r) <= rarIdx(hireCap(s, v));
/** 次に雇えるようになるレアリティと、あといくつ（Legendary まで届いていれば null） */
export function nextCap(s: P1State, v = charismaOf(s)): { r: HeroRarity; at: number; left: number } | null {
  const r = HIRE_RARITIES.find((x) => capAt(x) > v);
  return r ? { r, at: capAt(r), left: capAt(r) - v } : null;
}
/** カリスマ度の上げ方の候補（いまの町でできること）。gain はそのときの上がる量 */
export interface CharismaWay {
  text: string;
  gain: number;
}
export function charismaWays(s: P1State): CharismaWay[] {
  const tier = s.tier ?? 'C';
  const out: CharismaWay[] = [];
  if (!s.cleared) out.push({ gain: CHARISMA.clear[tier], text: t(`いまの町を制覇する（+${CHARISMA.clear[tier]}）`, `Conquer this town (+${CHARISMA.clear[tier]})`) });
  const cur = s.land?.cur ?? s.sector ?? 'c1';
  if (!(s.presented ?? []).includes(cur)) out.push({ gain: CHARISMA.present[tier], text: t(`荒れ地の研究成果を発表する（+${CHARISMA.present[tier]}）`, `Present your dig findings (+${CHARISMA.present[tier]})`) });
  const p = charismaParts(s);
  if (p.brand < CHARISMA.brand.max) {
    const peak = Math.max(s.brandPeak ?? 0, s.brand ?? 0);
    const need = CHARISMA.brand.per - (peak % CHARISMA.brand.per);
    out.push({ gain: 1, text: t(`ブランド力をあと ${need} 上げる（+1）`, `Raise brand by ${need} more (+1)`) });
  }
  if (!has(s, 'hr_brand') && ringOpen(s, 'U')) out.push({ gain: CHARISMA.panel, text: t(`研究パネル「採用ブランド」を開く（+${CHARISMA.panel}。${SKILL.hr_brand?.rp ?? 0} RP）`, `Research Employer brand (+${CHARISMA.panel}, ${SKILL.hr_brand?.rp ?? 0} RP)`) });
  return out;
}
/** 次に雇えるようになるまでの、いちばん近い上げ方（足りる中でいちばん小さい上がり方。無ければいちばん大きい上がり方） */
export function nearestWay(s: P1State, left: number): CharismaWay | null {
  const ways = charismaWays(s);
  if (!ways.length) return null;
  const enough = ways.filter((w) => w.gain >= left).sort((a, b) => a.gain - b.gain)[0];
  return enough ?? [...ways].sort((a, b) => b.gain - a.gain)[0];
}
/** 内訳（「いまのカリスマ 7：町の制覇 +3・研究成果の発表 +1・ブランド力 +3」） */
export function charismaBreakdown(s: P1State): string {
  const p = charismaParts(s);
  const parts = [p.clear ? t(`町の制覇 +${p.clear}`, `Conquests +${p.clear}`) : '', p.present ? t(`研究成果の発表 +${p.present}`, `Findings +${p.present}`) : '', p.brand ? t(`ブランド力 +${p.brand}`, `Brand +${p.brand}`) : '', p.panel ? t(`採用ブランド +${p.panel}`, `Employer brand +${p.panel}`) : ''].filter(Boolean);
  return t(`いまのカリスマ ${p.total}${parts.length ? `：${parts.join(t('・', ', '))}` : ''}`, `Charisma now ${p.total}${parts.length ? `: ${parts.join(', ')}` : ''}`);
}
/**
 * 雇える候補が 0 人のときの、理由と次の一手（雇う画面）。候補がいれば空
 * 「Common のヒーローは全員仲間になりました。次は Uncommon：カリスマ 10（あと 3）。…」
 */
export function hireEmptyLines(s: P1State): string[] {
  if (!has(s, 'hire') || s.hirePool.length) return [];
  const v = charismaOf(s);
  const free = (id: number) => heroById.has(id) && !s.staff.some((x) => x.hero === id);
  const out: string[] = [];
  const commonLeft = HIRE_POOL.filter(free).length;
  out.push(commonLeft ? t('いまは雇える候補がいません。来月の入れ替えを待ちましょう。', 'No candidates right now. Wait for next month’s refresh.') : t('Common のヒーローは全員仲間になりました。', 'Every Common hero has joined.'));
  // 次のレアリティ
  const nx = nextCap(s, v);
  const uLeft = uncommonHeroes().filter(free).length;
  if (nx && nx.r === 'U') {
    out.push(t(`次は Uncommon：カリスマ ${nx.at}（あと ${nx.left}）。カリスマは町の制覇・研究成果の発表・ブランド力で上がる。`, `Next is Uncommon: charisma ${nx.at} (${nx.left} to go). Charisma rises with conquests, findings and brand.`));
    out.push(charismaBreakdown(s));
    const w = nearestWay(s, nx.left);
    if (w) out.push(t(`いちばん近い上げ方：${w.text}`, `Nearest way: ${w.text}`));
  } else if (uLeft && hireCap(s, v) !== 'C') {
    out.push(t('Uncommon の候補は、来月の入れ替えで来ます。', 'Uncommon candidates arrive at next month’s refresh.'));
  } else if (!uLeft && hireCap(s, v) !== 'C') {
    out.push(t('Uncommon のヒーローも全員仲間になりました。', 'Every Uncommon hero has joined.'));
    if (!has(s, 'headhunt')) out.push(t('次は Rare：研究パネル「ヘッドハンティング」を開くと、カリスマ 35 から 1 人ずつ来ます。', 'Next is Rare: research Headhunting (charisma 35) for one a month.'));
    else if (nx && nx.r === 'R') out.push(t(`次は Rare：カリスマ ${nx.at}（あと ${nx.left}）。`, `Next is Rare: charisma ${nx.at} (${nx.left} to go).`));
  }
  return out;
}
/** 雇う画面の 1 行：「カリスマ 42：Rare まで雇える（Epic まであと 18）」 */
export function charismaLine(s: P1State, v = charismaOf(s)): string {
  const cap = HERO_RARITY[hireCap(s, v)].name;
  const nx = nextCap(s, v);
  return nx
    ? t(`カリスマ ${v}：${cap}まで雇える（${HERO_RARITY[nx.r].name}まで あと ${nx.left}）`, `Charisma ${v}: can hire up to ${cap} (${HERO_RARITY[nx.r].name} in ${nx.left})`)
    : t(`カリスマ ${v}：${cap}まで雇える`, `Charisma ${v}: can hire up to ${cap}`);
}
/** カリスマ度が上がったか（お知らせ済みの値と比べて、上がっていれば覚え直す）。雇えるレアリティが上がったら cap */
export function syncCharisma(s: P1State): { from: number; to: number; cap: HeroRarity | null } | null {
  const v = charismaOf(s);
  const was = s.charisma ?? v;
  if (s.charisma == null || v < was) {
    s.charisma = v;
    return null;
  }
  if (v === was) return null;
  s.charisma = v;
  const a = hireCap(s, was);
  const b = hireCap(s, v);
  (s.hrMonth ??= newHrMonth()).charisma += v - was;
  return { from: was, to: v, cap: a !== b ? b : null };
}

// ---------------------------------------------------------------- 給与

/** 1 段の額（G。もとの月給の 15%、最低 100 G。PAY.raiseWage） */
export const stepWage = (hero: number) => Math.max(100, Math.round(wageOf(hero) * PAY.raiseWage));
/** 給与の段（昇給 +・下げた −） */
export const payStep = (st: Pick<Staff, 'lv'>) => st.lv ?? 0;
/** もとの月給（給与の段が 0 のときの月給。創業の 3 人は 0） */
export const baseWage = (st: Pick<Staff, 'hero' | 'wage' | 'lv'>) => Math.max(0, st.wage - payStep(st) * stepWage(st.hero));
/** 相場の段（レアリティと Lv で決まる。0〜PAY.raiseMax）：もとのレアリティの上限 Lv で atCap、昇格 1 回ごとに promo、上限より先は 1 Lv ごとに beyond */
export function marketStep(st: Pick<Staff, 'hero' | 'level' | 'rarity' | 'baseRarity'>): number {
  const base = st.baseRarity ?? heroRarityOf(st.hero);
  const cap0 = capLv(base);
  const L = Math.max(1, st.level ?? 1);
  const promos = Math.max(0, rarIdx(st.rarity ?? base) - rarIdx(base));
  const M = SALARY.market;
  const v = (M.atCap * (Math.min(L, cap0) - 1)) / Math.max(1, cap0 - 1) + M.promo * promos + M.beyond * Math.max(0, L - cap0);
  return Math.max(0, Math.min(PAY.raiseMax, v));
}
/** 相場との差（段。+ なら相場より上） */
export const payGap = (st: Staff) => payStep(st) - marketStep(st);
/** いま払っている月給（G。給料の倍率込み。月の締めに払う額と同じ） */
export const payOf = (s: P1State, st: Staff) => st.wage * wageMul(s);
/** 相場の月給（G。給料の倍率込み） */
export const marketPay = (s: P1State, st: Staff) => (baseWage(st) + marketStep(st) * stepWage(st.hero)) * wageMul(s);
/** 月の給料の合計（G。月の締めの人件費の行と同じ） */
export const payroll = (s: P1State) => Math.round(s.staff.reduce((a, st) => a + st.wage, 0) * wageMul(s));

export type PayErr = 'no-staff' | 'max' | 'min';
/** 給与を 1 段下げる（月給 − 1 段。士気が下がる）。0 G より下・SALARY.min より下には下げない */
export function cutPay(s: P1State, hero: number): PayErr | null {
  const st = staffOf(s, hero);
  if (!st) return 'no-staff';
  const step = stepWage(hero);
  if (payStep(st) <= SALARY.min || st.wage - step < 0) return 'min';
  st.lv = payStep(st) - 1;
  st.wage -= step;
  moraleAdd(s, st, MORALE.ev.cut);
  return null;
}
/** 給与の段の上げ下げの目安（相場に合わせるには、あと何段か。+ は上げる） */
export const toMarket = (st: Staff) => Math.round(marketStep(st)) - payStep(st);

// ---------------------------------------------------------------- 士気

/** 士気（無ければ初めの値） */
export const moraleOf = (st: Pick<Staff, 'morale'>) => st.morale ?? MORALE.start;
/** 働きの速さの倍率（ふつうの帯は ×1） */
export function moraleMul(st: Pick<Staff, 'morale'>): number {
  const m = moraleOf(st);
  const B = MORALE.band;
  if (m >= B.hi) return 1 + ((B.top - 1) * (m - B.hi)) / (100 - B.hi);
  if (m >= B.lo) return 1;
  if (m >= B.floor) return B.low + ((1 - B.low) * (m - B.floor)) / (B.lo - B.floor);
  return B.low;
}
/** 役目の段：リーダー 1・部長 2・セクター長 3（無ければ 0） */
export function roleRank(st: Pick<Staff, 'task' | 'target' | 'heads'>): number {
  if (st.task === 'manager') return 3;
  if (st.heads?.length) return 2;
  if (st.task === 'lead' && typeof st.target === 'string') return st.target.startsWith('H:') ? 2 : 1;
  return 0;
}
/** 総務の職場の環境のパネル（休憩室・シフト制・福利厚生など）を取った数 */
export const envPanels = (s: P1State) => DEPT_SKILLS.general.filter((k) => has(s, k.id)).length;
/** 同じ仕事が続いた日（リーダー・セクター長・修行・バイトは数えない） */
const countsSame = (task: Task | null) => task != null && task !== 'lead' && task !== 'manager' && task !== 'train' && task !== 'side';
/** 士気の目標の内訳（画面の「士気の内訳」と毎日の寄り先） */
export function moraleParts(s: P1State, st: Staff): { base: number; pay: number; env: number; role: number; same: number; table: number; tired: number; duo: number; goal: number; total: number } {
  const P = MORALE.pay;
  const gap = payGap(st);
  const pay = Math.max(P.lo, Math.min(P.hi, gap >= 0 ? gap * P.up : gap * P.down)) - P.cut * Math.max(0, -payStep(st));
  const env = Math.min(MORALE.envMax, MORALE.env * envPanels(s));
  const role = roleRank(st) > 0 ? MORALE.role : 0;
  const S = MORALE.same;
  const same = countsSame(st.task) ? -Math.min(S.max, Math.floor(Math.max(0, (st.same ?? 0) - S.after) / S.per)) : 0;
  const table = has(s, 'hr_paytable') && gap >= -0.5 ? MORALE.paytable * lvMul(s, 'hr_paytable') : 0;
  // 総務（段 F）：疲れ（スタミナの見せ方）が 60% を超えると下がる。Uncommon から（ga.ts）
  const tired = fatigueMorale(s, st);
  // 段 P2：ヒーローの組み合わせ（盟友・兄弟は +・緊張は −。duo.ts）
  const duo = duoMorale(s, st.hero);
  // 段 I2：経営会議で決めた目標の重さ（目標の上乗せ・予算の増減。board.ts の goalMorale。ここだけで数える）
  const goal = goalMorale(s, st.hero);
  const total = Math.max(0, Math.min(100, MORALE.base + pay + env + role + same + table + tired + duo + goal));
  return { base: MORALE.base, pay, env, role, same, table, tired, duo, goal, total };
}
export const moraleTarget = (s: P1State, st: Staff) => moraleParts(s, st).total;
/** 士気を足す（0〜100） */
export function moraleAdd(s: P1State, st: Staff, d: number) {
  if (!growthOn(s) || HR_OFF.on) return;
  st.morale = Math.max(0, Math.min(100, moraleOf(st) + d));
}
/** 昇進・昇格・レベルアップの士気（キャリアの道すじで上乗せ） */
export const careerMul = (s: P1State) => 1 + MORALE.career * lvMul(s, 'hr_career');
/** 辞めたいの予告の日数（面談のパネルで長く） */
export const quitNotice = (s: P1State) => (has(s, 'hr_talk') ? MORALE.quit.noticeTalk : MORALE.quit.notice);
/** 引き止めの面談で上がる士気（面談のパネルで大きく） */
export const talkGain = (s: P1State) => (has(s, 'hr_talk') ? MORALE.quit.talkPanel : MORALE.quit.talk);
/** 士気の帯（画面の札） */
export type MoraleBand = 'high' | 'ok' | 'low' | 'bad';
export function moraleBand(st: Pick<Staff, 'morale'>): MoraleBand {
  const m = moraleOf(st);
  if (m >= MORALE.band.hi) return 'high';
  if (m >= MORALE.band.lo) return 'ok';
  if (m >= MORALE.quit.below) return 'low';
  return 'bad';
}

/** 今月の人事の記録（月次報告の行。月の締めで報告に移して空にする） */
export interface HrMonth {
  /** 辞めたいの予告が出た人・思いとどまった人・辞めた人 */
  want: number[];
  stay: number[];
  quit: number[];
  /** 今月上がったカリスマ度 */
  charisma: number;
}
export const newHrMonth = (): HrMonth => ({ want: [], stay: [], quit: [], charisma: 0 });
/** 1 日の人事のお知らせ（main.ts のトースト） */
export interface HrDay {
  want: number[];
  stay: number[];
  quit: number[];
  charisma?: { from: number; to: number; cap: HeroRarity | null };
}

/** 新しく雇った人・古いセーブの人：初めの士気と、昇進・Lv・昇格の「見た」印 */
export function initMorale(st: Staff) {
  st.morale ??= MORALE.start;
  st.seen ??= { lv: st.level ?? 1, rar: rarIdx(st.rarity ?? heroRarityOf(st.hero)), role: roleRank(st) };
}

/**
 * 1 日の士気（step から。チュートリアルのあいだは動かさない）。tired：今日スタミナが尽きて休みに入った人（働きすぎ）。
 * 辞めたいの予告・思いとどまり・辞めるもここで
 */
export function moraleDay(s: P1State, tired: Set<number>): HrDay | null {
  if (!growthOn(s) || HR_OFF.on) return null;
  const out: HrDay = { want: [], stay: [], quit: [] };
  const E = MORALE.ev;
  const Q = MORALE.quit;
  const mon = (s.hrMonth ??= newHrMonth());
  for (const st of [...s.staff]) {
    initMorale(st);
    // 同じ仕事の続き（仕事が替わったら 0 から）
    const key = st.task ? `${st.task}` : '';
    if (st.sameOf !== key) {
      st.sameOf = key;
      st.same = 0;
    } else if (countsSame(st.task)) st.same = (st.same ?? 0) + 1;
    let m = moraleOf(st);
    m += (moraleTarget(s, st) - m) * MORALE.rate;
    if (st.resting) m += E.rest;
    else if (st.task == null) m += E.idle;
    if (tired.has(st.hero)) m += E.tired;
    // 昇進（役目が上がった）・昇格・レベルアップ（前に見た値と比べる）
    const seen = st.seen!;
    const role = roleRank(st);
    if (role > seen.role) m += E.role * careerMul(s);
    const rar = rarIdx(st.rarity ?? heroRarityOf(st.hero));
    if (rar > seen.rar) m += E.promo * (rar - seen.rar) * careerMul(s);
    const lv = st.level ?? 1;
    if (lv > seen.lv) m += E.level * (lv - seen.lv) * careerMul(s);
    st.seen = { lv: Math.max(seen.lv, lv), rar: Math.max(seen.rar, rar), role: Math.max(seen.role, role) };
    st.morale = Math.max(0, Math.min(100, m));
    // 辞めたい・思いとどまる・辞める
    if (st.quit != null) {
      if (st.morale >= Q.safe) {
        st.quit = undefined;
        st.low = 0;
        st.talked = undefined;
        out.stay.push(st.hero);
        mon.stay.push(st.hero);
      } else if (s.day >= st.quit && s.staff.length > Q.keep) {
        leave(s, st);
        out.quit.push(st.hero);
        mon.quit.push(st.hero);
      }
      continue;
    }
    st.low = st.morale < Q.below ? (st.low ?? 0) + 1 : 0;
    if (st.low >= Q.days && s.staff.length > Q.keep) {
      st.quit = s.day + quitNotice(s);
      st.talked = undefined;
      out.want.push(st.hero);
      mon.want.push(st.hero);
    }
  }
  return out.want.length || out.stay.length || out.quit.length ? out : null;
}
/** 辞めたい人（予告中）：あと何日 */
export const quitLeft = (s: P1State, st: Pick<Staff, 'quit'>) => (st.quit == null ? null : Math.max(0, st.quit - s.day));
/** 辞めたい人の一覧 */
export const wantsToQuit = (s: P1State) => s.staff.filter((x) => x.quit != null);

export type TalkErr = 'no-staff' | 'not-quitting' | 'done';
/** 引き止めの面談（予告 1 回に 1 度）：士気 +15（面談のパネルで +25）。安心の目安まで戻れば、次の日に思いとどまる */
export function talk(s: P1State, hero: number): TalkErr | null {
  const st = staffOf(s, hero);
  if (!st) return 'no-staff';
  if (st.quit == null) return 'not-quitting';
  if (st.talked) return 'done';
  st.talked = true;
  moraleAdd(s, st, talkGain(s));
  return null;
}

/** 辞める：仕事・役目を外して、会社から出る（セクター長なら、その町はセクター長なしに） */
function leave(s: P1State, st: Staff) {
  if (st.task === 'manager' && typeof st.target === 'string') {
    const rec = s.land?.recs[st.target];
    if (rec && rec.manager === st.hero) rec.manager = null;
    st.task = null;
    st.target = null;
  }
  if (st.task === 'lead' || st.task === 'train') {
    if (st.task === 'train' && s.training?.hero === st.hero) s.training = null;
    st.task = null;
    st.target = null;
  }
  if (s.deleg) s.deleg.cover = s.deleg.cover.filter((c) => c.hero !== st.hero && c.for !== st.hero);
  assign(s, st.hero, null);
  s.staff = s.staff.filter((x) => x !== st);
  (s.quits ??= []).push({ hero: st.hero, day: s.day });
}

/** 士気の平均（整数。ヒーローがいなければ null） */
export const moraleAvg = (s: P1State) => (s.staff.length ? Math.round(s.staff.reduce((a, x) => a + moraleOf(x), 0) / s.staff.length) : null);
