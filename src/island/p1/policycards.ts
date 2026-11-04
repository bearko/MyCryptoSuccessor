/**
 * 段 K3：経営方針発表会のカードの中身（DOM なし。画面は policycardsui.ts）。
 * - cardLines：カードをタップしたときの「As-Is → To-Be」（主要な効き目と副次効果。机の上のほかの方針は同じにして、このカードが無いとき → あるとき）。
 * - reactOf：発表したときの役員（部長）の反応（その部門の士気の ± と、方針の部門が自分の部門か）。
 * 数字はゲームの数字そのもの（policy.ts の sumsOf・tiltOfSet、hr.ts の moraleTarget）。表示だけの効果は作らない。
 */
import { t } from '../../i18n';
import { DEPT, FX_DOWN, POLICY_OF, type DeptId, type PolEvKind, type PolFxKind, type PolicyDef, type PolTheme } from './data';
import { deptPolicyOf, fxName, polFx, polStaffMorale, sidesOf, staffDepts, sumsOf, tiltOfSet, type PolSums } from './policy';
import { moraleTarget } from './hr';
import type { P1State } from './model';

/** 提案の種類の名前（副次効果の「提案が増える／減る」） */
export const THEME_NAME: Record<PolTheme, () => string> = {
  sell: () => t('売る手（宣伝・品ぞろえ・お店）', 'selling (ads, range, shops)'),
  store: () => t('在庫と倉庫', 'stock and storage'),
  morale: () => t('士気', 'morale'),
  workplace: () => t('職場の環境', 'the workplace'),
  people: () => t('採用と配置', 'hiring and staffing'),
  sat: () => t('お客様の満足', 'customer satisfaction'),
  brand: () => t('ブランド', 'brand'),
  rp: () => t('研究', 'research'),
  legal: () => t('法務・権利', 'legal and rights'),
  cost: () => t('費用の見直し', 'cost cutting'),
  flow: () => t('仕事の流れ', 'workflow'),
};
/** できごとの短い名前（events.ts の EV_TEXT の見出しを短くしたもの） */
export const EV_NAME: Record<PolEvKind, () => string> = {
  heat: () => t('猛暑の売れ行き', 'heatwave sales'),
  festival: () => t('町のお祭り', 'town festival'),
  tourists: () => t('観光客の団体', 'tour group'),
  trend: () => t('流行', 'a trend'),
  wholesale: () => t('卸の大安売り', 'wholesale clearance'),
  idea: () => t('ひらめき', 'a flash of insight'),
  traveler: () => t('腕自慢の旅人', 'a skilled traveler'),
  celebrity: () => t('有名人の来店', 'a celebrity visit'),
  bigorder: () => t('大口の注文', 'a big order'),
  sponsor: () => t('町の行事への協賛', 'event sponsorship'),
  rain: () => t('大雨', 'heavy rain'),
  matrise: () => t('素材の値上がり', 'material price rise'),
  breakdown: () => t('作業台の故障', 'bench breakdown'),
  rumor: () => t('悪いうわさ', 'a bad rumor'),
  rivalsale: () => t('よその店の大安売り', 'a rival’s sale'),
  scout: () => t('人の引き抜き', 'poaching'),
  complaint: () => t('近所からの苦情', 'neighbor complaints'),
  defect: () => t('品の小さな傷', 'product scratches'),
  roadwork: () => t('道路工事', 'roadwork'),
  tired: () => t('みんなお疲れ気味', 'everyone worn out'),
};
const GOOD_EV: PolEvKind[] = ['heat', 'festival', 'tourists', 'trend', 'wholesale', 'idea', 'traveler', 'celebrity', 'bigorder', 'sponsor'];
export const isGoodEv = (k: PolEvKind) => GOOD_EV.includes(k);

/** As-Is → To-Be の 1 行。dir：見せる数字が増える 1・減る −1・同じ 0。good：プレイヤーに良い true・悪い false・同じ null */
export interface CardLine {
  kind: 'main' | 'fx' | 'mo' | 'up' | 'less' | 'ev';
  label: string;
  now: string;
  next: string;
  dir: 1 | -1 | 0;
  good: boolean | null;
  /** 補足（「いまは人がいない」など） */
  note?: string;
}

const COUNT: PolFxKind[] = ['morale', 'apt', 'brand'];
const r1 = (v: number) => Math.round(v * 10) / 10;
const sgn = (v: number) => (Math.abs(v) < 0.05 ? '±0' : `${v > 0 ? '+' : '−'}${r1(Math.abs(v))}`);
const pct = (v: number) => `${r1(v * 100)}%`;
const mulTxt = (v: number) => `×${Math.round(v * 100) / 100}`;
/** 効き目の値の見せ方（数える種類は ±点、下げる種類は 100% から引いた値、ほかは 100% に足した値） */
export function fxShow(k: PolFxKind, v: number): string {
  if (COUNT.includes(k)) return sgn(v);
  if ((FX_DOWN as string[]).includes(k)) return pct(1 - v);
  return pct(1 + v);
}
const dirOf = (a: number, b: number): 1 | -1 | 0 => (Math.abs(b - a) < 1e-9 ? 0 : b > a ? 1 : -1);
function fxLineOf(kind: 'main' | 'fx', k: PolFxKind, a: PolSums, b: PolSums): CardLine {
  const x = (a[k] as number | undefined) ?? 0;
  const y = (b[k] as number | undefined) ?? 0;
  const down = (FX_DOWN as string[]).includes(k) && !COUNT.includes(k);
  const d = dirOf(x, y);
  return { kind, label: fxName(k), now: fxShow(k, x), next: fxShow(k, y), dir: (down ? -d : d) as 1 | -1 | 0, good: d === 0 ? null : y > x };
}

/** その部門の人（部長・リーダー・持ち場の人） */
export const deptStaff = (s: P1State, d: DeptId) => s.staff.filter((st) => staffDepts(st).includes(d));

/**
 * カードの As-Is → To-Be（base：机の上のほかの方針の id。このカードを除いた組 → 足した組）。
 * 主要な効き目（強さを掛けた値）→ 部門の士気 → ほかの指標 → 提案の傾向 → できごとの起きやすさ の順
 */
export function cardLines(s: P1State, p: PolicyDef, base: string[]): CardLine[] {
  const ids = base.filter((x) => x !== p.id && POLICY_OF[x]);
  const A = sumsOf(s, ids.map((x) => POLICY_OF[x]));
  const B = sumsOf(s, [...ids.map((x) => POLICY_OF[x]), p]);
  const out: CardLine[] = p.fx.map((f) => fxLineOf('main', f.k, A, B));
  const sides = sidesOf(p);
  // 部門の士気（いまの目指す値の平均から、いま効いている方針のぶんを引いて、組ごとに足し直す）
  for (const x of sides) {
    if (x.k !== 'mo') continue;
    const xs = deptStaff(s, x.d);
    const ga = ((A.morale as number | undefined) ?? 0) + (A.mo[x.d] ?? 0);
    const gb = ((B.morale as number | undefined) ?? 0) + (B.mo[x.d] ?? 0);
    const label = t(`${DEPT[x.d].name}の士気（目指す値）`, `${DEPT[x.d].name} morale (target)`);
    if (!xs.length) {
      out.push({ kind: 'mo', label, now: sgn(ga), next: sgn(gb), dir: dirOf(ga, gb), good: x.v > 0, note: t('いまは人がいない（入ると効く）', 'nobody there yet (applies when staffed)') });
      continue;
    }
    // 1 人ずつ：いまの目指す値 − いま効いている方針のぶん ＋ 組の方針のぶん（その人の部門ぜんぶ）
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    const of = (S: PolSums, st: (typeof xs)[number]) => ((S.morale as number | undefined) ?? 0) + staffDepts(st).reduce((v, d) => v + (S.mo[d] ?? 0), 0);
    let a = 0;
    let b = 0;
    for (const st of xs) {
      const raw = moraleTarget(s, st) - polFx(s, 'morale') - polStaffMorale(s, st);
      a += clamp(raw + of(A, st)) / xs.length;
      b += clamp(raw + of(B, st)) / xs.length;
    }
    out.push({ kind: 'mo', label, now: String(Math.round(a)), next: String(Math.round(b)), dir: dirOf(a, b), good: x.v > 0, note: t(`${xs.length} 人`, `${xs.length} people`) });
  }
  for (const x of sides) if (x.k === 'fx') out.push(fxLineOf('fx', x.fx, A, B));
  // 提案の傾向（増える＝themes・減る＝less）
  const up = (th: PolTheme, kind: 'up' | 'less') => {
    const a = tiltOfSet(ids, th);
    const b = tiltOfSet([...ids, p.id], th);
    const label = kind === 'up' ? t(`「${THEME_NAME[th]()}」の提案が増え、上に並ぶ`, `More “${THEME_NAME[th]()}” proposals, ranked higher`) : t(`「${THEME_NAME[th]()}」の提案が減り、下に並ぶ`, `Fewer “${THEME_NAME[th]()}” proposals, ranked lower`);
    out.push({ kind, label, now: mulTxt(a), next: mulTxt(b), dir: dirOf(a, b), good: kind === 'up' ? (b !== a ? true : null) : b !== a ? false : null, note: b === a ? t('ほかの方針で、もうこの値', 'already set by another policy') : undefined });
  };
  for (const th of p.themes) up(th, 'up');
  for (const x of sides) if (x.k === 'less') up(x.th, 'less');
  // できごとの起きやすさ（良いできごと・困りごとの中で、その種類が選ばれる重み）
  for (const x of sides) {
    if (x.k !== 'ev') continue;
    const a = A.ev[x.ev] ?? 1;
    const b = B.ev[x.ev] ?? 1;
    const good = isGoodEv(x.ev);
    const label = good ? t(`良いできごと「${EV_NAME[x.ev]()}」の起きやすさ`, `Chance of the good event “${EV_NAME[x.ev]()}”`) : t(`困りごと「${EV_NAME[x.ev]()}」の起きやすさ`, `Chance of the trouble “${EV_NAME[x.ev]()}”`);
    const d = dirOf(a, b);
    out.push({ kind: 'ev', label, now: mulTxt(a), next: mulTxt(b), dir: d, good: d === 0 ? null : good ? d > 0 : d < 0 });
  }
  return out;
}

/** カードの一言の副次効果（「マーケの士気 +3・人事の士気 −2・…」。方針の画面の行） */
export function sideText(p: PolicyDef): string {
  const xs: string[] = [];
  const pm = (v: number) => `${v > 0 ? '+' : '−'}${r1(Math.abs(v))}`;
  for (const x of sidesOf(p)) {
    if (x.k === 'mo') xs.push(t(`${DEPT[x.d].name}の士気 ${pm(x.v)}`, `${DEPT[x.d].name} morale ${pm(x.v)}`));
    else if (x.k === 'fx') xs.push(`${fxName(x.fx)} ${(FX_DOWN as string[]).includes(x.fx) ? (x.v > 0 ? '−' : '+') : x.v > 0 ? '+' : '−'}${COUNT.includes(x.fx) ? r1(Math.abs(x.v)) : pct(Math.abs(x.v))}`);
    else if (x.k === 'less') xs.push(t(`「${THEME_NAME[x.th]()}」の提案 ▼`, `“${THEME_NAME[x.th]()}” proposals ▼`));
    else xs.push(`${EV_NAME[x.ev]()} ×${Math.round((1 + x.v) * 100) / 100}`);
  }
  return xs.join(t('・', ', '));
}

/**
 * 発表したときの部長の反応：その部門の士気の ±（全員の士気の ± も）と、方針の部門が自分の部門（相性）。
 * score > 0 喜ぶ・< 0 渋い顔・0 うなずく。why は理由の 1 行（「マーケの士気 +3」「方針の部門」）
 */
export function reactOf(s: P1State, d: DeptId, ids: string[]): { score: number; mo: number; fit: boolean } {
  const xs = ids.map((x) => POLICY_OF[x]).filter(Boolean);
  const S = sumsOf(s, xs);
  let mo = S.mo[d] ?? 0;
  for (const p of xs) for (const f of p.fx) if (f.k === 'morale') mo += f.v;
  const fit = xs.some((p) => p.dept === d);
  return { score: mo + (fit ? 1 : 0), mo, fit };
}

/** 事業別の方針の机のほかの組（全社方針 ＋ ほかの部門の方針。発表会の選び、無ければいまの方針） */
export function deptBase(s: P1State, corp: string[], pick: Partial<Record<DeptId, string>>, except: DeptId, depts: DeptId[]): string[] {
  const out = [...corp];
  for (const d of depts) {
    if (d === except) continue;
    const id = pick[d] ?? deptPolicyOf(s, d);
    if (id) out.push(id);
  }
  return out;
}
