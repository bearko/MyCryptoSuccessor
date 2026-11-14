
import { t } from '../../i18n';
import { DEF } from '../defs';
import { MATS, PRODUCT, rivalDef, SECTORS, SKILL, TASKS, aptitude, skuParts, skuPrice, techSkill, type Mat, type Sku, type Task } from './data';
import { assign, canSwap, DAYS, relicMinCraft, sellEstimate, batchOf, craftCheck, craftDays, has, knownOf, monopolyLeft, recipeOf, saturated, staffOf, trainingOf, unitCost, type Need, type P1State, type Staff } from './model';
import { bar, h, heroIcon, heroName, matIcon, money, skuIcon, skuName } from './ui';
import { seriesTag } from './digview';
import { roleOf, roleText } from './deleg';
import { uxc } from '../uix/screens/c-slots';

export const TASK_NAME: Record<Task, string> = { ...(Object.fromEntries(TASKS.map((x) => [x.key, x.name])) as Record<Task, string>), side: t('バイト', 'Part-time'), manager: t('セクター長', 'Sector head'), train: t('修行', 'Training'), dig: t('発掘', 'Digging'), lead: t('リーダー・部長', 'Leader / head') };

/**
 * 適性のランク：0〜100 の数を G・F・E・D・C・B・A・S の 8 段に。
 * 見習いの 3 人は G〜F（得意な仕事だけ F）。最初に雇えるコモンは良くて E、D があればすごい。
 * S はレジェンダリーの得意な仕事くらい。区切りは RANK_AT。
 */
export const RANKS = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'] as const;
export type Rank = (typeof RANKS)[number];
/** F・E・D・C・B・A・S になる適性の下限 */
export const RANK_AT = [30, 42, 55, 62, 69, 77, 85];
export const aptN = (apt: number) => Math.max(0, Math.min(100, Math.round(apt)));
/** 見せる数（ヒーローの育成で 100 を超えることがある。ランクは S のまま、数はそのまま。図の上では 100 で頭打ち） */
export const aptShow = (apt: number) => Math.max(0, Math.round(apt));
export function rankOf(apt: number): Rank {
  const n = aptN(apt);
  for (let k = RANKS.length - 1; k > 0; k--) if (n >= RANK_AT[k - 1]) return RANKS[k];
  return 'G';
}
/** ランクと数（「E 45」） */
export function rankEl(apt: number): HTMLElement {
  const r = rankOf(apt);
  const e = h('span', `isl-rankv is-${r.toLowerCase()}`);
  e.append(h('b', '', r), h('small', '', `${aptShow(apt)}`));
  return e;
}

/** レーダーチャートの軸の順：サプライチェーンの 4 つ（調達 → 製造 → 運搬 → 販売）、そのあと開拓・調査 */
const RADAR: Task[] = ['buy', 'craft', 'transport', 'shop', 'intel', 'explore'];
const SVG = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/** 仕事ごとの適性のレーダーチャート。角ごとに仕事の名前とランク・数 */
export function radar(stats: Parameters<typeof aptitude>[0], size = 210): SVGSVGElement {
  const R = 62;
  const cx = 105;
  const cy = 100;
  const root = svg('svg', { viewBox: '0 0 210 200', width: size, height: Math.round((size * 200) / 210), class: 'isl-radar', role: 'img' });
  const pt = (k: number, r: number) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / RADAR.length;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  // 目盛り（25・50・75・100）
  for (const f of [0.25, 0.5, 0.75, 1]) root.append(svg('polygon', { points: RADAR.map((_, k) => pt(k, R * f).join(',')).join(' '), class: f === 1 ? 'isl-radar-edge' : 'isl-radar-ring' }));
  RADAR.forEach((_, k) => {
    const [x, y] = pt(k, R);
    root.append(svg('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'isl-radar-ring' }));
  });
  const vals = RADAR.map((task) => aptitude(stats, task));
  root.append(svg('polygon', { points: vals.map((v, k) => pt(k, (R * aptN(v)) / 100).join(',')).join(' '), class: 'isl-radar-area' }));
  vals.forEach((v, k) => {
    const [x, y] = pt(k, (R * aptN(v)) / 100);
    root.append(svg('circle', { cx: x, cy: y, r: 2.6, class: 'isl-radar-dot' }));
  });
  // 角のラベル：仕事の名前、その下にランクと数
  RADAR.forEach((task, k) => {
    const [x, y] = pt(k, R + 20);
    const anchor = Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end';
    const dx = anchor === 'start' ? -6 : anchor === 'end' ? 6 : 0;
    const name = svg('text', { x: x + dx, y: y - 4, 'text-anchor': anchor, class: 'isl-radar-name' });
    name.textContent = TASK_NAME[task];
    const r = rankOf(vals[k]);
    const val = svg('text', { x: x + dx, y: y + 10, 'text-anchor': anchor, class: `isl-radar-val is-${r.toLowerCase()}` });
    const rk = svg('tspan', { class: 'isl-radar-rank' });
    rk.textContent = r;
    const n = svg('tspan', { dx: 3 });
    n.textContent = `${aptShow(vals[k])}`;
    val.append(rk, n);
    root.append(name, val);
  });
  return root;
}

/** いまの仕事（短く） */
export function jobLabel(s: P1State, st: Staff): string {
  switch (st.task) {
    case 'craft':
      return t(`製造・作業台 ${(st.target as number) + 1}`, `Craft · bench ${(st.target as number) + 1}`);
    case 'transport':
      return t('運搬係', 'Hauler');
    case 'shop': {
      const b = s.buildings.find((x) => x.uid === st.target);
      return t(`販売・${b ? DEF[b.id].name : ''}`, `Sell · ${b ? DEF[b.id].name : ''}`);
    }
    case 'buy':
      return t('調達係', 'Buyer');
    case 'explore':
      return t(`開拓・${MATS[st.target as Mat]?.name ?? ''}`, `Scout · ${MATS[st.target as Mat]?.name ?? ''}`);
    case 'intel':
      return t(`調査・${rivalDef(String(st.target))?.name ?? ''}`, `Research · ${rivalDef(String(st.target))?.name ?? ''}`);
    case 'side':
      return t(`バイト・${rivalDef(String(st.target))?.name ?? ''}`, `Part-time · ${rivalDef(String(st.target))?.name ?? ''}`);
    case 'manager':
      return t(`セクター長：${SECTORS.find((x) => x.id === st.target)?.name ?? ''}`, `Sector head: ${SECTORS.find((x) => x.id === st.target)?.name ?? ''}`);
    case 'lead': {
      // 任せ方の 4 段（段 D）：チームリーダー・事業部長
      const r = roleOf({ task: st.task, target: st.target });
      return r ? roleText(r) : t('リーダー', 'Leader');
    }
    case 'train': {
      const name = SKILL[String(st.target)]?.name ?? '';
      const left = s.training?.hero === st.hero ? s.training.left : 0;
      return t(`修行中：${name}（あと ${left} 日）`, `Training: ${name} (${left} d left)`);
    }
    default:
      // 段 UI5b：事業部長の役職だけ（持ち場の仕事なし）
      return st.heads?.length ? roleText({ kind: 'head', dept: st.heads[0] }) : t('待機中', 'Free');
  }
}

/** スタミナの細い棒 */
function stamina(st: Staff): HTMLElement {
  const v = st.stamina / st.stats.hp;
  return bar(v, v > 0.3 ? 'var(--isl-good)' : 'var(--isl-bad)');
}

/**
 * 担当の枠（四角）。ヒーローがいれば顔・名前・その仕事の適性、いなければ「＋」。
 * 押すと onTap（ふつうはヒーローを選ぶ引き出しを開く）。
 */
export function slot(s: P1State, o: { label: string; task: Task; hero: number | null; onTap: () => void; hot?: boolean; onRemove?: () => void }): HTMLElement {
  const b = h('button', `isl-slot ${o.hero == null ? 'is-empty' : ''} ${o.hot ? 'is-hot' : ''}`);
  b.type = 'button';
  b.append(h('small', 'isl-slot-label', o.label));
  const st = o.hero != null ? staffOf(s, o.hero) : null;
  if (st) {
    const apt = Math.round(aptitude(st.stats, o.task));
    b.append(heroIcon(st.hero, 52), h('b', 'isl-slot-name', heroName(st.hero)), rankEl(apt), stamina(st));
    // ヒーローの育成（段 E1）：Lv（小さく）
    if ((st.level ?? 1) > 1) b.append(h('small', 'isl-slot-lv', `Lv ${st.level}`));
    if (st.resting) b.append(h('span', 'isl-slot-tag', t('休憩中', 'Resting')));
    if (o.onRemove) {
      const x = h('span', 'isl-slot-x', '×');
      x.title = t('外す', 'Remove');
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        o.onRemove?.();
      });
      b.append(x);
    }
  } else b.append(h('span', 'isl-slot-plus', '+'), h('small', 'isl-slot-hint', t('タップで割り当て', 'Tap to assign')));
  b.addEventListener('click', o.onTap);
  return b;
}

/** 引き出し（下から出る小さな窓）。閉じる関数を返す */
export function drawer(root: HTMLElement, title: string, note: string, fill: (box: HTMLElement, close: () => void) => void): () => void {
  // 段 UIX3a：新しい画面の引き出しの器
  return uxc.drawer!(root, title, note, fill);
}

/** 引き出しの外（main.ts）につなぐもの：トースト・効果音・担当を外したあとの描き直し・チュートリアル中か（付け替えはチュートリアルのあと） */
export const pickHooks: { toast?: (text: string) => void; sfx?: (k: 'tap' | 'error') => void; changed?: () => void; tutorial?: () => boolean } = {};

/** ほかの担当についている人を押して付け替えられるか（チュートリアルが終わってから。修行中・マネージャー・休憩中は付け替えない） */
export const swapOn = (st: Staff) => !pickHooks.tutorial?.() && canSwap(st);

/**
 * ヒーロー選びのカードの見分け（docs/ISLAND_PHASE1.md「ヒーロー選びの見分け」）。
 * current：いまの引き出しで選んでいる担当の人（灰色にしない）／free：待機中／busy：ほかの担当（灰色・✕ で外すと選べる）／
 * resting：スタミナ切れで休憩中（灰色・選べない）／training：修行中（選べない）
 */
export type PickKind = 'current' | 'free' | 'busy' | 'resting' | 'training';
export function pickKind(st: Staff, current: number | null): PickKind {
  if (st.task === 'train') return 'training';
  if (st.hero === current) return 'current';
  if (st.resting) return 'resting';
  return st.task == null ? 'free' : 'busy';
}
/** 押して選べるか（current・free だけ） */
export const pickable = (k: PickKind) => k === 'current' || k === 'free';
/** カードの右上の ✕ で担当を外せるか（ほかの担当についている人。修行中は外せない） */
export const canRelease = (st: Staff, current: number | null) => st.hero !== current && st.task != null && st.task !== 'train' && st.task !== 'manager' && st.task !== 'lead';
/** 引き出しの ✕：担当を外す（選べる状態に戻る）。外せなければ false */
export function releaseHero(s: P1State, hero: number): boolean {
  const st = staffOf(s, hero);
  if (!st || st.task == null || st.task === 'train' || st.task === 'manager' || st.task === 'lead') return false;
  return assign(s, hero, null) == null;
}

/** ヒーローを選ぶ引き出し：待機中が先、担当済み・休憩中はあと（灰色）。同じ組の中は、その仕事の適性が高い順 */
export function pickHero(
  root: HTMLElement,
  s: P1State,
  o: { title: string; task: Task; current: number | null; onPick: (hero: number | null) => void; note?: string; extra?: (st: Staff) => string | null; badge?: string },
) {
  // 段 UIX3a：新しい画面のヒーローを選ぶ引き出し（選んで、下のキーで決める）
  return uxc.pickHero!(root, s, o);
}

// ---------------------------------------------------------------- エクステ（素材 → 商品）

/** 技が要る商品の、作れない理由（「技：ガラス細工が要る（スキルツリー）」）。技が要らなければ null */
export function techNeed(key: string, s?: P1State): string | null {
  const tech = PRODUCT[key]?.tech;
  if (!tech) return null;
  const name = SKILL[techSkill(tech)]?.name ?? tech;
  const tr = s ? trainingOf(s, techSkill(tech)) : null;
  if (tr) return t(`技：${name}（修行中 あと ${tr.left} 日）`, `Skill: ${name} (training, ${tr.left} d left)`);
  return t(`技：${name}が要る（スキルツリー）`, `Needs the ${name} skill (skill tree)`);
}

/** 作るのに足りないもの（model の needFor）を 1 行で。s があれば修行中の残りの日数も */
export function needText(n: Need, s?: P1State): string {
  switch (n.kind) {
    case 'tech': {
      const tr = s ? trainingOf(s, n.skill) : null;
      if (tr) return t(`技：${SKILL[n.skill]?.name ?? n.skill}（修行中 あと ${tr.left} 日）`, `Skill: ${SKILL[n.skill]?.name ?? n.skill} (training, ${tr.left} d left)`);
      return t(`技：${SKILL[n.skill]?.name ?? n.skill}（スキルツリー）`, `Skill: ${SKILL[n.skill]?.name ?? n.skill} (skill tree)`);
    }
    case 'route':
      return t(`素材：${SKILL[n.skill]?.name ?? MATS[n.mat].name}（スキルツリー）`, `Material: ${SKILL[n.skill]?.name ?? MATS[n.mat].name} (skill tree)`);
    case 'pot':
      return t(`アンコモン：${SKILL.pot.name}（スキルツリー）`, `Uncommon: ${SKILL.pot.name} (skill tree)`);
    case 'dev':
      return t('アンコモン：商品開発がまだ（R&D → 商品開発）', 'Uncommon: not developed yet (R&D → Product development)');
  }
}

/** いまの素材で作れるロット数 */
export function lotsFromStock(s: P1State, x: Sku): number {
  let n = Infinity;
  for (const [m, q] of Object.entries(recipeOf(x))) n = Math.min(n, Math.floor((s.mats[m as Mat] ?? 0) / (q ?? 1)));
  return Number.isFinite(n) ? n : 0;
}

/** 1 作業台・1 日あたりの粗利（効率の目安） */
export const profitPerDay = (s: P1State, x: Sku) => ((skuPrice(x) - unitCost(s, x)) * batchOf(x, s)) / craftDays(s, x);

/** 素材のアイコン ×数（保有数）。足りなければ赤 */
function matLine(s: P1State, need: Partial<Record<Mat, number>>, showHave: boolean): HTMLElement {
  const row = h('div', 'isl-ext-mats');
  for (const [m, q] of Object.entries(need)) {
    const have = s.mats[m as Mat] ?? 0;
    const c = h('span', `isl-bom-mat ${showHave && have < (q ?? 0) ? 'is-bad' : ''}`);
    c.title = MATS[m as Mat].name;
    c.append(matIcon(m as Mat, 22), h('small', '', `×${q}`));
    if (showHave) c.append(h('small', 'isl-ext-have', t(`（保有 ${have}）`, `(have ${have})`)));
    row.append(c);
  }
  return row;
}

/** 1 つの作業台で作り続けたときの、ひと月の見込み（作れる数・売れる数・利益） */
export function monthOutlook(s: P1State, x: Sku) {
  const [k] = skuParts(x);
  const make = Math.round((DAYS / craftDays(s, x)) * batchOf(x, s));
  const demand = Math.round(s.demand[k] ?? PRODUCT[k].demand);
  const margin = skuPrice(x) - unitCost(s, x);
  // 売れる数：お店の場所・他社との取り合いを入れた見込み（作れる数が上限）
  const sell = Math.min(make, Math.round(sellEstimate(s, k, skuParts(x)[1])));
  return { make, demand, margin, sell, profit: Math.round(sell * margin) };
}

/**
 * エクステのカード（2 列）。
 * 左：名前・販売価格・1 ロットの素材（保有数）・生産可能数（ロット）・全部作るときの素材。
 * 右：生産ペース・粗利／個・需要・見込利益／月・取扱企業。
 */
export function extCard(s: P1State, x: Sku, o: { worker?: number | null; on?: boolean; best?: boolean; badge?: string; making?: boolean; onTap?: () => void; compact?: boolean; off?: boolean } = {}): HTMLElement {
  const [k, r] = skuParts(x);
  const card = h(o.onTap ? 'button' : 'div', `isl-ext-card is-2col ${o.on ? 'is-on' : ''} ${o.best || o.badge ? 'is-best' : ''} ${o.off ? 'is-off' : ''}`);
  if (card instanceof HTMLButtonElement) card.type = 'button';
  const left = h('div', 'isl-ext-l');
  const right = h('div', 'isl-ext-r');
  const top = h('div', 'isl-ext-top');
  const name = h('div');
  name.append(h('b', '', skuName(x)), h('div', 'isl-gold', money(skuPrice(x))));
  top.append(skuIcon(x, o.compact ? 40 : 52), name);
  left.append(top);
  const tags = h('div', 'isl-ext-tags');
  if (o.making) tags.append(h('span', 'isl-tag is-good', t('工房で作っている', 'Being crafted')));
  // 復刻品：「復刻」の札と独占の残り（遺物の絵のまま。docs/ISLAND_ART_TODO.md）
  if (PRODUCT[k]?.relic) {
    tags.append(h('span', 'isl-tag isl-relic-tag', t('復刻', 'Revival')));
    const left = monopolyLeft(s, k);
    if (left > 0) tags.append(h('span', 'isl-tag is-gold', s.recipes?.[k]?.sold != null ? t(`独占 あと ${left} か月`, `Monopoly ${left} mo`) : t(`独占 ${left} か月`, `Monopoly ${left} mo`)));
    // 売れるシリーズの札（Rare の復刻品：Rare の町で売れる／この町では売れない）
    const sg = seriesTag(PRODUCT[k].relic!.ext, s.tier);
    if (sg) tags.append(h('span', `isl-tag ${sg[1] ? 'is-good' : 'is-bad'}`, sg[0]));
  }
  const err = craftCheck(s, x, o.worker ?? null);
  if (err === 'tech') tags.append(h('span', 'isl-tag is-bad', techNeed(k, s) ?? ''));
  if (r === 'U' && err === 'skill') tags.append(h('span', 'isl-tag is-bad', t(`製造の適性 ${relicMinCraft(k)} 以上が要る`, `Needs aptitude ${relicMinCraft(k)}+`)));
  if (tags.childElementCount) left.append(tags);
  // 1 ロットの素材（保有数）→ できる数
  const recipe = recipeOf(x);
  const lot = h('div', 'isl-ext-lot');
  lot.append(h('small', 'isl-dim', t('1 ロット', '1 lot')), matLine(s, recipe, true), h('span', 'isl-bom-arrow', '→'));
  const out = h('span', 'isl-bom-out');
  out.append(skuIcon(x, 26), h('small', '', `×${batchOf(x, s)}`));
  lot.append(out);
  left.append(lot);
  const lots = lotsFromStock(s, x);
  left.append(h('div', `isl-ext-can ${lots > 0 ? 'is-good' : 'is-bad'}`, lots > 0 ? t(`生産可能数：${lots * batchOf(x, s)} 個（${lots} ロット）`, `Can make: ${lots * batchOf(x, s)} (${lots} lots)`) : t('生産可能数：0 個（素材が足りない）', 'Can make: 0 (not enough materials)')));
  if (lots > 0) {
    const all = Object.fromEntries(Object.entries(recipe).map(([m, q]) => [m, (q ?? 0) * lots])) as Partial<Record<Mat, number>>;
    const use = h('div', 'isl-ext-use');
    use.append(h('small', 'isl-dim', t('全部作ると', 'To make all')), matLine(s, all, false));
    left.append(use);
  }
  // 右：数字
  const m = monthOutlook(s, x);
  const sellers = s.rivals.filter((v) => (v.sells[k] ?? 0) > 0).length;
  const sat = saturated(s, k);
  const stat = (label: string, value: string, cls = '') => {
    const row = h('div', `isl-ext-stat ${cls}`);
    row.append(h('small', '', label), h('b', '', value));
    right.append(row);
  };
  stat(t('生産ペース', 'Pace'), t(`${craftDays(s, x).toFixed(1)} 日（1 ロット）`, `${craftDays(s, x).toFixed(1)} d / lot`));
  stat(t('粗利', 'Margin'), t(`${money(m.margin)}／個`, `${money(m.margin)} / pc`));
  stat(t('需要', 'Demand'), t(`${m.demand} 個／月`, `${m.demand} / mo`));
  stat(t('見込利益', 'Est. profit'), t(`${money(m.profit)}／月`, `${money(m.profit)} / mo`), 'is-gold');
  right.lastElementChild?.append(h('small', '', t(`売れる見込み ${m.sell} 個／月`, `~${m.sell} sold / mo`)));
  stat(t('取扱企業', 'Sellers'), sellers ? (sat ? t(`${sellers} 社（供給が足りている）`, `${sellers} (well supplied)`) : t(`${sellers} 社`, `${sellers}`)) : t('なし', 'None'), sellers ? (sat ? 'is-bad' : '') : 'is-good');
  // 新商品の認知（このセクタで知られている割合。最初の町では出さない）
  const kn = knownOf(s, k);
  if (kn < 1) right.append(knownBar(kn));
  card.append(left, right);
  if (o.badge) card.append(h('span', 'isl-best', o.badge));
  else if (o.best) card.append(h('span', 'isl-best', t('いちばん効率がよい', 'Most efficient')));
  if (o.onTap) card.addEventListener('click', o.onTap);
  return card;
}

/** 新商品の認知の小さな棒（「認知 30%」）。並べて日がたつ・宣伝すると育つ */
export function knownBar(v: number): HTMLElement {
  const e = h('div', `isl-known ${v < 0.6 ? 'is-low' : ''}`);
  e.title = t('お客さんがこの商品を知っている割合。並べて日がたつ・宣伝すると育ち、売れる数に掛かります', 'How well customers know this item. Grows while it is on shelves and faster with ads; it scales sales');
  e.append(h('small', '', t(`認知 ${Math.round(v * 100)}%`, `Known ${Math.round(v * 100)}%`)), bar(v, v < 0.6 ? '#ffd27a' : 'var(--isl-good)'));
  return e;
}

/** エクステを選ぶ引き出し：効率（粗利／日）の高い順。今の素材で作れるものの中でいちばんに印 */
export function pickExt(
  root: HTMLElement,
  s: P1State,
  o: {
    title: string;
    items: Sku[];
    current: Sku | null;
    worker?: number | null;
    note?: string;
    onPick: (x: Sku | null) => void;
    allowNone?: boolean;
    badge?: { x: Sku; text: string } | null;
    making?: Sku[];
    blocked?: (x: Sku) => boolean;
    onBlocked?: (x: Sku) => void;
    /** 段 UI3：カードに添える見込み（担当のヒーローの読み「+9 個／月」）。keep：items の順のまま並べる（見込みの大きい順） */
    gain?: (x: Sku) => string | null;
    keep?: boolean;
    /**
     * 段 UI5c：作業台の作る物を選ぶとき。並び（効率の順・いまの素材で作れる）・絞り込み「今のセクタで売れるもの」・ランクアップの印。
     * stock：「いまの素材で作れる」の並びで選んだとき（使い切りの製造）・rank：ランクアップの詳しい窓・tab：開いたときの並び
     */
    craft?: { stock: (x: Sku) => void; rank: (x: Sku, close: () => void) => void; tab?: 'all' | 'stock' };
  },
) {
  // 段 UIX3a：新しい画面のエクステを選ぶ引き出し（作る物を選ぶ並びも）
  return uxc.pickExt!(root, s, o);
}

/** 段 UI5c：作る物の一覧の絞り込み「今のセクタで売れるもの」（初期値オン。この遊びのあいだ覚えておく） */
export const makeView = { sellable: true };

void has;
