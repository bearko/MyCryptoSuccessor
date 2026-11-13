/**
 * 段 UIX3k：スキルツリー（方向 C「管制卓」の回路図。入のときだけ。docs/ISLAND_UIX.md「画面：スキルツリー」）。
 * 木の並べ方（p1/treelayout.ts）・パネルの中身・値段・条件・開け方（2 度押し）・チュートリアルの目印は、今の画面（p1/tree.ts）のまま。
 * 作り直したのは見せ方と手応え：
 * - 線は回路の配線（縦と横・角は 45° に面取り・枝分かれに接点）。状態は色だけでなく、線の種類（実線・点線）とランプで分かる
 * - パネルは回路の部品（研究ポイント＝四角いチップ・お金＝菱形）。取れる＝琥珀のランプがまたたく／足りない＝目盛り／済み＝緑のランプ／鍵＝網目と錠
 * - 選ぶと、つながり（先に要る側＝琥珀・その先＝水色）が点く。研究すると、ポイントが回って減り、パネルに電気が入り、つながる先が順に点く
 * - **木は 1 回だけ組み、あとは変わった所だけ直す**（選び直しで木を作り直さない：2 度押しの間に間に合うように）
 * 器は今の札（p1/screens.ts の open()。keep）：閉じ方・時間の止め方・マインちゃんの一言は今のまま。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { sparks } from '../fx';
import { later } from '../loop';
import { Odo, uxKey, uxLamp, uxMeter, uxPlus, uxTape, vibrate } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpGap, uxpReplay, uxpStamp } from '../sparts';
import { K } from './k-deps';
import { K_EMOJI, dotEmoji, kIcon, kIconUrl, noEmoji } from './k-icons';
import './tree.css';
import type { DeptId, Skill, Tier } from '../../p1/data';
import type { P1State } from '../../p1/model';
import type { Ctx } from '../../p1/screens';
import type { TreeState } from '../../p1/tree';
import type { P, TreeEdge } from '../../p1/treelayout';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）

/** 配線の角の面取り（px） */
export const CHAMFER = 6;
/** 配線の横の通り道どうしの間（px） */
export const TRACK_GAP = 4;
export interface Wire {
  /** SVG の道 */
  d: string;
  /** 折れ点（電気の粒が通る道） */
  poly: [number, number][];
}
export interface WireOpts {
  /** 木の上の位置 → 画面の位置 */
  px: (p: P) => P;
  /** 線の上の端・下の端を縮める長さ（px。パネルの縁まで） */
  cutTop: (e: TreeEdge) => number;
  cutBot: (e: TreeEdge) => number;
  /** その高さに、パネルの行があるか（横の通り道を、パネルの行から離す） */
  isRow: (y: number) => boolean;
}
/**
 * 配線の道を決める：通る点（treelayout の pts）のあいだを「縦 → 横 → 縦」でつなぎ、角は 45° に面取りする。
 * 同じ所から同じ段へ出る線は、1 本の横の通り道（母線）を分け合う。別の母線が同じ高さで重ならないよう、段のあいだに通り道を分けて割り当てる。
 * 返す dots は、母線から枝が分かれる所の接点（回路図の決まり：点がある所だけがつながっている）
 */
export function routeWires(edges: readonly TreeEdge[], o: WireOpts): { wires: Wire[]; dots: { x: number; y: number; e: number }[] } {
  interface Seg {
    e: number;
    i: number;
    a: P;
    b: P;
    lo: number;
    hi: number;
    bus: string;
    gap: string;
  }
  const r = (v: number) => Math.round(v);
  const segs: Seg[] = [];
  const ptsOf: P[][] = edges.map((e) => e.pts.map(o.px));
  edges.forEach((e, ei) => {
    const q = ptsOf[ei];
    for (let i = 1; i < q.length; i++) {
      const a = q[i - 1];
      const b = q[i];
      const lo = a.y + Math.max(i === 1 ? o.cutTop(e) : 0, o.isRow(e.pts[i - 1].y) ? 40 : 4);
      const hi = b.y - Math.max(i === q.length - 1 ? o.cutBot(e) : 0, o.isRow(e.pts[i].y) ? 40 : 4);
      segs.push({ e: ei, i, a, b, lo, hi, bus: `${r(a.x)},${r(a.y)}>${r(b.y)}`, gap: `${r(a.y)}>${r(b.y)}` });
    }
  });
  // 母線（同じ所から同じ段へ）ごとの横の幅
  const buses = new Map<string, { gap: string; x0: number; x1: number; ax: number; lo: number; hi: number; xs: Set<number>; straight: boolean; track: number; y: number; e: number }>();
  for (const g of segs) {
    let bus = buses.get(g.bus);
    if (!bus) buses.set(g.bus, (bus = { gap: g.gap, x0: g.a.x, x1: g.a.x, ax: g.a.x, lo: g.lo, hi: g.hi, xs: new Set(), straight: false, track: -1, y: 0, e: g.e }));
    if (Math.abs(g.b.x - g.a.x) < 1) {
      bus.straight = true;
      continue;
    }
    bus.x0 = Math.min(bus.x0, g.b.x);
    bus.x1 = Math.max(bus.x1, g.b.x);
    bus.lo = Math.max(bus.lo, g.lo);
    bus.hi = Math.min(bus.hi, g.hi);
    bus.xs.add(r(g.b.x));
  }
  // 段のあいだごとに、重ならないよう通り道を割り当てる（左から。空いている通り道のうち、いちばん上）
  const byGap = new Map<string, string[]>();
  for (const [k, b] of buses) if (b.xs.size) byGap.set(b.gap, [...(byGap.get(b.gap) ?? []), k]);
  for (const keys of byGap.values()) {
    keys.sort((p, q) => buses.get(p)!.x0 - buses.get(q)!.x0);
    const ends: number[] = [];
    for (const k of keys) {
      const b = buses.get(k)!;
      let tr = ends.findIndex((x) => x < b.x0 - CHAMFER * 2);
      if (tr < 0) tr = ends.length;
      ends[tr] = b.x1;
      b.track = tr;
    }
    const n = ends.length;
    for (const k of keys) {
      const b = buses.get(k)!;
      const top = b.lo + CHAMFER;
      const bot = b.hi - CHAMFER;
      if (bot <= top) b.y = r((b.lo + b.hi) / 2);
      else {
        // 通り道は TRACK_GAP ずつ。入りきらないときは、あいだを詰める
        const step = n > 1 ? Math.min(TRACK_GAP * 2, (bot - top) / (n - 1)) : 0;
        const y0 = (top + bot) / 2 - (step * (n - 1)) / 2;
        b.y = Math.round((y0 + step * b.track) / 2) * 2;
      }
    }
  }
  const f = (v: number) => (Math.round(v * 2) / 2).toString();
  const wires: Wire[] = edges.map((e, ei) => {
    const q = ptsOf[ei];
    const poly: [number, number][] = [];
    const y0 = q[0].y + o.cutTop(e);
    // 1px に満たない横のずれは、まっすぐ下ろす（斜めの線を作らない）
    let x = q[0].x;
    poly.push([x, y0]);
    for (let i = 1; i < q.length; i++) {
      const a = q[i - 1];
      const b = q[i];
      const yEnd = i === q.length - 1 ? b.y - o.cutBot(e) : b.y;
      const dx = b.x - x;
      if (Math.abs(b.x - a.x) >= 1 && Math.abs(dx) >= 1) {
        const bus = buses.get(`${r(a.x)},${r(a.y)}>${r(b.y)}`)!;
        const prevY = poly[poly.length - 1][1];
        // 母線の高さは、この線の上の端と下の端のあいだに収める（段のあいだがせまい所で、線が上へ戻らないように）
        const by = Math.max(prevY, Math.min(yEnd, bus.y));
        // 面取り：横の長さの半分まで・上下の余りまで
        const c = Math.max(0, Math.min(CHAMFER, Math.abs(dx) / 2, by - prevY, yEnd - by));
        const sx = Math.sign(dx);
        poly.push([x, by - c], [x + sx * c, by], [b.x - sx * c, by], [b.x, by + c]);
        x = b.x;
      }
      poly.push([x, yEnd]);
    }
    return { d: poly.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join(''), poly };
  });
  const dots: { x: number; y: number; e: number }[] = [];
  for (const b of buses.values()) {
    if (!b.xs.size) continue;
    const ax = r(b.ax);
    for (const x of new Set([...b.xs, ax])) {
      const inside = x > b.x0 + 1 && x < b.x1 - 1;
      if (inside || (x === ax && b.straight)) dots.push({ x, y: b.y, e: b.e });
    }
  }
  return { wires, dots };
}

/** 菱形の階段の縁（clip-path の polygon。N：箱の大きさ・s：段の大きさ） */
export function stairDiamond(N: number, s = 4): string {
  const h = N / 2;
  const q = Math.round(h / s);
  const tr: [number, number][] = [];
  for (let i = 0; i < q; i++) tr.push([h + s * i, s * i], [h + s * (i + 1), s * i]);
  const br = [...tr].reverse().map(([x, y]) => [x, N - y] as [number, number]);
  const bl = tr.map(([x, y]) => [N - x, N - y] as [number, number]);
  const tl = [...tr].reverse().map(([x, y]) => [N - x, y] as [number, number]);
  return `polygon(${[...tr, ...br, ...bl, ...tl].map(([x, y]) => `${x}px ${y}px`).join(',')})`;
}

/**
 * つながり：そのパネルの「先に要る」側（根もとまで。up）と、その先（down）の線の番号と、関係するパネル。
 * 今の画面の強調（highlight）と同じたどり方
 */
export function chainOf(id: string, edges: readonly Pick<TreeEdge, 'from' | 'to'>[]): { up: number[]; down: number[]; rel: string[] } {
  const up: number[] = [];
  const down: number[] = [];
  const seen = new Set<string>([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.pop()!;
    edges.forEach((e, i) => {
      if (e.to !== cur) return;
      up.push(i);
      if (e.from && !seen.has(e.from)) {
        seen.add(e.from);
        queue.push(e.from);
      }
    });
  }
  const rel = new Set<string>();
  edges.forEach((e, i) => {
    if (e.from !== id) return;
    down.push(i);
    rel.add(e.to);
  });
  for (const x of seen) if (x !== id) rel.add(x);
  return { up, down, rel: [...rel] };
}

/** 足りないときの目盛り（パネルの下の 4 段。0〜4：少しでもあれば 1 段は点ける） */
export const gaugeSteps = (have: number, cost: number) => (cost <= 0 ? 4 : Math.max(have > 0 ? 1 : 0, Math.min(3, Math.floor((Math.max(0, have) / cost) * 4))));

/** パネルの様子（見た目を決める元）。同じなら描き直さない */
export interface NodeDesc {
  st: TreeState;
  /** 取れないが、目標として絵を見せる（Epic・Legendary の閉じた帯） */
  goalTier: boolean;
  lv: number;
  mx: number;
  canUp: boolean;
  inf: boolean;
  donate: number;
  /** 修行の進み（0〜1。修行していなければ -1） */
  train: number;
  carried: boolean;
  tip: boolean;
  hot: boolean;
  /** 目標の道の順番（0 から。道に無ければ -1）・目標そのもの・待っている理由の札 */
  step: number;
  goal: boolean;
  wait: string;
  /** 絞り込みに合わない */
  dim: boolean;
  /** 条件の札（★30・エンブレム 3）と、満たしているか */
  brand: number;
  brandOk: boolean;
  emblem: number;
  emblemOk: boolean;
  /** 足りないときの目盛り（0〜4。出さないときは -1） */
  gauge: number;
}
export const descKey = (d: NodeDesc) => `${d.st}|${+d.goalTier}|${d.lv}|${d.mx}|${+d.canUp}|${+d.inf}|${d.donate}|${d.train < 0 ? -1 : Math.round(d.train * 20)}|${+d.carried}|${+d.tip}|${+d.hot}|${d.step}|${+d.goal}|${d.wait}|${+d.dim}|${d.brand}${+d.brandOk}|${d.emblem}${+d.emblemOk}|${d.gauge}`;

/** ランプの様子（色だけに頼らない：点く・またたく・消えている） */
export function lampOf(st: TreeState): { kind: '' | 'good' | 'bad' | 'cyan'; on: boolean; blink: boolean } {
  if (st === 'done') return { kind: 'good', on: true, blink: false };
  if (st === 'open') return { kind: '', on: true, blink: true };
  if (st === 'training') return { kind: 'cyan', on: true, blink: true };
  if (st === 'poor') return { kind: '', on: false, blink: false };
  return { kind: '', on: false, blink: false };
}
/** 状態の言葉（くわしい板の札。色と形に添える） */
export function stateWord(st: TreeState, research: boolean): string {
  switch (st) {
    case 'done':
      return research ? t('研究済', 'Researched') : t('開放済', 'Unlocked');
    case 'training':
      return t('修行中', 'Training');
    case 'open':
      return research ? t('研究できる', 'Ready') : t('開放できる', 'Ready');
    case 'poor':
      return t('あと少し', 'Almost');
    case 'locked':
      return t('手前がまだ', 'Locked');
    case 'ring':
      return t('帯が未開放', 'Band closed');
    case 'sealed':
      return t('封印', 'Sealed');
    case 'soon':
      return t('準備中', 'Soon');
    default:
      return t('雲の中', 'Hidden');
  }
}

// ---------------------------------------------------------------- 画面の外に覚えておくこと（入のときだけ）

/** スマホのくわしい板を広げている（上に引く・「くわしく」） */
let more = false;
let moreFor: string | null = null;
/** 研究の施策の板を開いている */
let studyOpen = false;
/** 本社を開放した時刻（電源が入る演出のあいだ） */
let burst = 0;
/** 発掘の枝が雲から出てくる演出の始めた時刻 */
let digReveal = 0;
/** 帯が開く演出（ランク・始めた時刻・マインちゃんの一言まで進んだか） */
let ringFx: { tier: Tier; t0: number; talk: boolean } | null = null;
/** チュートリアルで、この段に入ってから「人材の募集」へカメラを寄せたか */
let tutFocused = false;
let lastTap: { id: string; t: number } | null = null;
/** いま開いている木（1 つだけ） */
let inst: { body: HTMLElement; key: string; sync: () => void; drop: () => void } | null = null;

const ZMIN = 0.14;
const ZMAX = 1.8;
const HEAD_PX = 52;
const NS = 'http://www.w3.org/2000/svg';
const setText = (e: Element, text: string) => {
  if (e.textContent !== text) e.textContent = text;
};
const setCls = (e: Element, cls: string) => {
  if (e.getAttribute('class') !== cls) e.setAttribute('class', cls);
};
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
/** 1 回きりの CSS の動きをやり直す */
function replay(e: Element, cls: string) {
  e.classList.remove(cls);
  void (e as HTMLElement).offsetWidth;
  e.classList.add(cls);
}
/** 絵の印（背景の絵として使い回す。パネルごとに canvas を作らない） */
function glyph(name: string, cls: string, color = '#f4ecd4'): HTMLElement {
  const g = el(`i.uxk-g.${cls}`);
  g.style.backgroundImage = `url(${kIconUrl(name, color, color === '#1a1c2e' ? '#1a1c2e' : '#fffdf3', color === '#1a1c2e' ? '#8a7f5c' : '#0b0d17')})`;
  return g;
}
const lite = (name: string, color = '#f4ecd4') => kIcon(name, { color, hi: color, lo: '#0b0d17', scale: 1 });

/** またたきの周期の半分（ランプが点いている・消えている時間。今の ux-blink の 0.9 秒の半分） */
export const BLINK_HALF_MS = 450;
/**
 * またたきの時計：BLINK_HALF_MS ごとに el の data-ph を入れ替える（CSS は data-ph="1" のときだけ、ランプを暗く・矢印を上へ）。
 * class ではなく data 属性にするのは、class の変化を見張っている着せ替え（c-dress.ts）を、またたくたびに起こさないため。
 * 動きを減らすとき・タブが裏のとき・木が外れたときは止まった形（data-ph なし）。止める関数を返す
 */
export function blinkClock(el: HTMLElement, calm: () => boolean = isCalm): () => void {
  const id = setInterval(() => {
    if (!el.isConnected || calm() || (typeof document !== 'undefined' && document.hidden)) {
      if (el.dataset.ph) delete el.dataset.ph;
      return;
    }
    if (el.dataset.ph) delete el.dataset.ph;
    else el.dataset.ph = '1';
  }, BLINK_HALF_MS);
  return () => clearInterval(id);
}
/** 部門へ寄るときの目当て：その部門のパネルのいちばん上の段（y の最小） */
export const arriveTop = (ys: number[]) => Math.min(...ys);
/** 部門の絵（下の帯のタブと同じ絵） */
export const DEPT_ICO: Record<string, string> = { marketing: 'horn', logistics: 'truck', sales: 'tag', support: 'headset', systems: 'gear', rnd: 'flask', legal: 'scales', hr: 'people', general: 'office', accounting: 'receipt', strategy: 'star4' };

/** パネルの絵：今の画面と同じ決め方（建物・商品・エクステ・素材）。絵文字で仮に置いてある分は、ドットの絵に替える */
function panelIcon(id: string, size: number): HTMLElement {
  const e = K.tree.iconOf(id, size);
  if (!e.classList.contains('isl-tree-emoji')) {
    e.classList.add('uxk-pi');
    return e;
  }
  const ch = (e.textContent ?? '').replace(/️/g, '');
  const g = glyph(K_EMOJI[ch] ?? 'star4', 'uxk-pi.is-dot');
  g.style.width = g.style.height = `${Math.round(size * 0.75)}px`;
  return g;
}

// ---------------------------------------------------------------- 開く

/** スキルツリーを開く（p1/tree.ts の openSkills から。見ている場所・選んだパネルは K.tree.view） */
export function openSkillsUx(ctx: Ctx, o: { lift: boolean; focus?: string }) {
  let lift = o.lift;
  // 部門へ寄る（部門の画面の「この部門のパネルを見る」）：その部門のいちばん上のパネルが見える所まで送り、見出しを光らせる
  let arrive: DeptId | null = o.focus && K.DEPT[o.focus as DeptId] ? (o.focus as DeptId) : null;
  K.open(
    ctx,
    t('スキルツリー', 'Skill tree'),
    (body) => {
      const key = structKey(ctx);
      if (inst && inst.body === body && inst.key === key && body.firstElementChild) return inst.sync();
      inst?.drop();
      body.replaceChildren();
      inst = build(ctx, body, key, lift, arrive);
      lift = false;
      arrive = null;
    },
    () => {
      inst?.drop();
      inst = null;
    },
    true,
  );
}
/** 木の組み立てが変わる条件（本社の開放前・チュートリアルで開けてよいパネル・発掘の枝が雲の中か）。変わったら組み直す */
function structKey(ctx: Ctx): string {
  const s = ctx.s();
  const sealed = !K.hqOpen(s);
  return `${+sealed}|${ctx.step?.() === 'recruit' ? 'hire' : ''}|${+(!sealed && K.digBranchOpen(s))}|${burst}`;
}

function build(ctx: Ctx, body: HTMLElement, key: string, liftFirst: boolean, arriveAt: DeptId | null = null) {
  const T = K.tree;
  const V = T.view;
  const F = T.filt;
  const UNIT = K.UNIT;
  const HQ = T.HQ;
  let alive = true;
  let liftOnce = liftFirst;
  let arriveOnce = arriveAt;
  const offs: (() => void)[] = [];
  const S = () => ctx.s();
  const s0 = S();
  // 本社を開放するまでは、本社だけが見える
  const sealed = !K.hqOpen(s0);
  // チュートリアル（人材の募集を開放する段）：開放してよいのはこのパネルだけ。ほかは押せる（説明は見られる）が、開放はマインちゃんが止める
  const only = ctx.step?.() === 'recruit' ? 'hire' : null;
  if (!only) tutFocused = false;
  const bursting = !sealed && performance.now() - burst < T.BURST_MS;
  // 発掘の枝：出会いの前は雲の中。出会いのあと、はじめて開いたときに雲から出てくる
  const digOn = !sealed && K.digBranchOpen(s0);
  if (digOn && !s0.flags.digBranch && !ctx.step?.()) {
    s0.flags.digBranch = 'new';
    digReveal = performance.now();
    ctx.save();
    later(500, () => uxSfx('stamp'));
  }
  const revealing = digOn && performance.now() - digReveal < T.DIG_REVEAL_MS;
  const hidden = (d: DeptId) => d === 'rnd' && !digOn;
  if (sealed) {
    V.x = 0;
    V.y = 0;
  }
  const phone = innerWidth < 600;
  const fine = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  body.classList.add('is-tree');

  // ---------------------------------------------------------------- 器
  const wrap = el(`div.isl-tree.uxk-tree${sealed ? '.is-sealed' : ''}${phone ? '.is-phone' : ''}`);
  wrap.style.setProperty('--uxk-dia', stairDiamond(64));
  wrap.style.setProperty('--uxk-dia-in', stairDiamond(56));
  const vp = el('div.uxk-vp');
  const world = el(`div.uxk-world${bursting ? '.is-burst' : ''}`);
  if (bursting) later(Math.max(0, T.BURST_MS - (performance.now() - burst)), () => world.classList.remove('is-burst'));
  const B = K.BOUNDS;
  const span = { w: (B.x1 - B.x0 + 4) * UNIT, h: (B.y1 - B.y0 + 4) * UNIT };
  const ox = (-B.x0 + 2) * UNIT;
  const oy = (-B.y0 + 2) * UNIT;
  const px = (p: P): P => ({ x: ox + p.x * UNIT, y: oy + p.y * UNIT });
  world.style.width = `${span.w}px`;
  world.style.height = `${span.h}px`;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'uxk-wires');
  svg.setAttribute('width', `${span.w}`);
  svg.setAttribute('height', `${span.h}`);
  const svgHl = document.createElementNS(NS, 'svg');
  svgHl.setAttribute('class', 'uxk-wires uxk-wires-hl');
  svgHl.setAttribute('width', `${span.w}`);
  svgHl.setAttribute('height', `${span.h}`);
  world.append(svg, svgHl);
  /** 本社からの縦の距離 → 電源が入る演出の遅れ（秒。上から下へ） */
  const delayOf = (p: P) => `${(0.2 + Math.max(0, p.y) * 0.09).toFixed(2)}s`;

  // ---- ランクの帯（横の帯。まだ開いていない帯は網目で暗く）。札は画面の左に固定（place()）
  const bands: { tier: Tier; rect: SVGRectElement; line: SVGPathElement | null; lab: HTMLElement; lock: HTMLElement; on: boolean }[] = [];
  if (!sealed)
    K.BAND_TIERS.forEach((tier, i) => {
      const Bd = K.BANDS[tier];
      const next = K.BAND_TIERS[i + 1];
      const yb = next ? K.BANDS[next].line : B.y1 + 0.4;
      const L0 = px({ x: B.x0 - 1, y: Bd.line });
      const L1 = px({ x: B.x1 + 1, y: yb });
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', `${L0.x}`);
      rect.setAttribute('y', `${L0.y}`);
      rect.setAttribute('width', `${L1.x - L0.x}`);
      rect.setAttribute('height', `${L1.y - L0.y}`);
      rect.setAttribute('fill', K.TIERS[tier].color);
      svg.append(rect);
      let line: SVGPathElement | null = null;
      if (tier !== 'C') {
        line = document.createElementNS(NS, 'path');
        line.setAttribute('d', `M${L0.x} ${L0.y}H${L1.x}`);
        line.setAttribute('stroke', K.TIERS[tier].color);
        svg.append(line);
      }
      const im = el<HTMLImageElement>('img', { src: T.tierImg(tier), alt: '', draggable: 'false' });
      const lock = el('span.uxk-band-lock', lite('lock', '#97a1cf'));
      const lab = el('div.uxk-band-lab', im, el('b', K.TIER_NAME[tier]), lock);
      lab.style.setProperty('--tc', K.TIERS[tier].color);
      bands.push({ tier, rect, line, lab, lock, on: false });
    });

  // ---- 配線
  const rowYs = new Set<number>();
  for (const p of K.POS.values()) rowYs.add(Math.round(p.y * 100));
  const edges = sealed ? [] : K.EDGES.filter((e) => !(hidden(e.br) || (e.from && hidden(K.deptOf(K.SKILL[e.from])))));
  const topCut = (e: TreeEdge) => (e.from ? K.halfOf(e.from) + 0.06 : e.gate ? 0.08 : K.KNOTPOS.has(e.g) ? 0.14 : 0.3) * UNIT;
  const botCut = (e: TreeEdge) => (K.halfOf(e.to) + 0.06) * UNIT;
  const routed = routeWires(edges, { px, cutTop: topCut, cutBot: botCut, isRow: (y) => rowYs.has(Math.round(y * 100)) });
  const edgeEls: SVGPathElement[] = edges.map((e, i) => {
    const l = document.createElementNS(NS, 'path');
    l.setAttribute('d', routed.wires[i].d);
    l.style.setProperty('--d', delayOf(e.pts[0]));
    return l;
  });
  // 本社 → 部門の見出し（電源の母線）。物流は見出し → 束の札
  const trunks: TreeEdge[] = [];
  if (!sealed)
    for (const d of K.DEPTS) {
      if (hidden(d.id)) continue;
      const hp = K.HUBPOS.get(d.id)!;
      trunks.push({ from: null, to: d.id, br: d.id, g: '@hq', kind: 'all', pts: [{ x: 0, y: 0 }, hp] });
      for (const g of K.DEPT_LAYOUT[d.id].groups) if (K.KNOTPOS.has(g.key)) trunks.push({ from: null, to: g.key, br: d.id, g: `@hub:${d.id}`, kind: 'all', pts: [hp, K.KNOTPOS.get(g.key)!] });
    }
  const trunkWires = routeWires(trunks, { px, cutTop: (e) => (e.g === '@hq' ? 0.45 : 0.3) * UNIT, cutBot: (e) => (e.g === '@hq' ? 0.3 : 0.16) * UNIT, isRow: () => false });
  trunks.forEach((e, i) => {
    const l = document.createElementNS(NS, 'path');
    l.setAttribute('d', trunkWires.wires[i].d);
    l.setAttribute('stroke', K.DEPT_LAYOUT[e.br].color);
    l.setAttribute('class', `uxk-w is-trunk${e.g === '@hq' ? '' : ' is-knot'}`);
    l.style.setProperty('--d', '0s');
    svg.append(l);
  });
  for (const l of edgeEls) svg.append(l);
  // 接点（母線から枝が分かれる所）
  for (const d of routed.dots) {
    const c = document.createElementNS(NS, 'rect');
    c.setAttribute('x', `${d.x - 3}`);
    c.setAttribute('y', `${d.y - 3}`);
    c.setAttribute('width', '6');
    c.setAttribute('height', '6');
    c.setAttribute('fill', K.DEPT_LAYOUT[edges[d.e].br].color);
    c.setAttribute('class', 'uxk-dot');
    svg.append(c);
  }

  // ---- 帯の入口・合流点・束の札
  const gates: { tier: Tier; el: HTMLElement }[] = [];
  if (!sealed)
    for (const [gk, q] of K.GATES) {
      const [g, tier] = gk.split('|') as [string, Tier];
      const gr = K.EDGES.find((e) => e.g === g)?.br;
      if (gr && hidden(gr)) continue;
      const p = px(q);
      const dot = el('i.uxk-gate', { title: T.ringNeed({ tier } as Skill) });
      dot.style.left = `${p.x}px`;
      dot.style.top = `${p.y}px`;
      dot.style.setProperty('--tc', K.TIERS[tier].color);
      gates.push({ tier, el: dot });
      world.append(dot);
    }
  const juncs: { id: string; el: HTMLElement }[] = [];
  if (!sealed)
    for (const [id] of K.JUNCTIONS) {
      const k = K.SKILL[id];
      if (!k?.anyOf || hidden(K.deptOf(k))) continue;
      const p = px(K.POS.get(id)!);
      const j = el('span.uxk-junc.ux-num');
      j.style.left = `${p.x}px`;
      j.style.top = `${p.y - 46}px`;
      j.style.setProperty('--br', T.colorOf(k));
      juncs.push({ id, el: j });
      world.append(j);
    }
  if (!sealed)
    for (const [gk, q] of K.KNOTPOS) {
      const p = px(q);
      const g = gk.split(':')[1] as keyof typeof K.GROUP_STAGE;
      const kn = el('span.uxk-knot', K.GROUP_STAGE[g] ?? '');
      kn.style.left = `${p.x}px`;
      kn.style.top = `${p.y}px`;
      kn.style.setProperty('--br', K.DEPT_LAYOUT.logistics.color);
      kn.style.setProperty('--d', delayOf(q));
      world.append(kn);
    }

  // ---- 本社
  const rootB = el<HTMLButtonElement>('button.isl-tree-root.uxk-root', { type: 'button' });
  const rp0 = px({ x: 0, y: 0 });
  rootB.style.left = `${rp0.x}px`;
  rootB.style.top = `${rp0.y}px`;
  const hqLamp = uxLamp(sealed ? '' : 'good', true, sealed);
  rootB.append(
    el('i.uxk-root-f'),
    el<HTMLImageElement>('img.uxk-root-b', { src: K.assetUrl('island/b/hq/rd.png'), alt: '', draggable: 'false' }),
    el('b.uxk-root-n', t('本社', 'HQ')),
    hqLamp,
  );
  if (sealed) rootB.append(el('span.uxk-root-cta', lite('bolt', '#1a1c2e'), t('タップして開放', 'Tap to unlock')));
  world.append(rootB);

  // ---- 発掘の枝の雲（出会いの前。R&D の列を網目の雲がおおう。出てくるあいだは、薄れて消える）
  if (!sealed && (!digOn || revealing)) {
    const L = K.DEPT_LAYOUT.rnd;
    T.DIG_PUFFS.forEach((r, k) => {
      const q = px({ x: L.cx + (k % 2 ? 0.7 : -0.6) * Math.min(1, (L.x1 - L.x0) / 3), y: K.BANDS.C.y + r });
      const puff = el(`i.uxk-cloud${digOn ? '.is-leaving' : ''}`);
      puff.style.left = `${q.x}px`;
      puff.style.top = `${q.y}px`;
      puff.style.setProperty('--sz', `${Math.round(((1.8 + (k % 3) * 0.35) * UNIT) / 4) * 4}px`);
      puff.style.setProperty('--d', `${(k * 0.08).toFixed(2)}s`);
      world.append(puff);
    });
    const c = px(T.digCloudAt());
    const q = el(`div.uxk-cloudq.ux-num${digOn ? '.is-leaving' : ''}`, { title: t('雲の向こうに、まだ何かある', 'Something lies beyond the clouds') }, '?');
    q.style.left = `${c.x}px`;
    q.style.top = `${c.y}px`;
    world.append(q);
  }

  // ---- 部門の見出し（列の上。画面の上に固定。色は部門の色）：絵・名前と理解度・「取った数／全部」と縦の計器
  const heads = el('div.uxk-heads');
  const headEls: { d: DeptId; el: HTMLButtonElement; tx: HTMLElement; n: HTMLElement; fill: HTMLElement; lock: HTMLElement }[] = [];
  if (!sealed)
    for (const d of K.DEPTS) {
      const L = K.DEPT_LAYOUT[d.id];
      const tx = el('span.uxk-head-tx');
      const n = el('span.uxk-head-n.ux-num');
      const fill = el('i');
      const lock = el('span.uxk-head-lock');
      const hub = el<HTMLButtonElement>(`button.uxk-head${hidden(d.id) ? '.is-cloud' : ''}`, { type: 'button' }, el('span.uxk-head-ic', lite(DEPT_ICO[d.id] ?? 'star4', L.color)), tx, n, el('i.uxk-head-bar', fill), lock);
      hub.style.setProperty('--br', L.color);
      hub.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = K.deptCenter(d.id);
        V.x = p.x;
        V.y = Math.max(V.y, p.y - 1);
        uxSfx('slide', { step: 5 });
        place();
      });
      headEls.push({ d: d.id, el: hub, tx, n, fill, lock });
      heads.append(hub);
    }

  // ---- パネル
  interface NodeView {
    k: Skill;
    el: HTMLButtonElement;
    key: string;
    d: NodeDesc | null;
  }
  const nodes = new Map<string, NodeView>();
  /** 見えている名前（読み上げ） */
  const aria = (s: P1State, k: Skill, st: TreeState) => (st === 'ring' && !T.isGoalTier(k) ? '?' : T.shownName(s, k));
  if (!sealed)
    for (const k of K.SKILLS) {
      if (hidden(K.deptOf(k))) continue;
      const q = K.POS.get(k.id)!;
      const p = px(q);
      const tier = K.skillTier(k);
      const n = el<HTMLButtonElement>('button', { type: 'button' });
      n.style.left = `${p.x - 32}px`;
      n.style.top = `${p.y - 32}px`;
      n.style.setProperty('--br', T.colorOf(k));
      n.style.setProperty('--tc', K.TIERS[tier].color);
      n.style.setProperty('--d', delayOf(q));
      n.dataset.id = k.id;
      if (revealing && k.branch === 'dig') {
        n.dataset.pop = '1';
        n.style.setProperty('--d', `${(0.35 + Math.hypot(q.x, q.y) * 0.06).toFixed(2)}s`);
      }
      n.addEventListener('click', (e) => {
        e.stopPropagation();
        if (moved) return;
        tapNode(k);
      });
      n.addEventListener('pointerdown', () => !moved && uxSfx('press'));
      hover(n, () => infoCard(S(), k, 'hover'), k.id);
      nodes.set(k.id, { k, el: n, key: '', d: null });
      world.append(n);
    }
  vp.append(world);

  // ---- 上の計器の帯：資金・研究ポイント・ブランド力・エンブレム／上げられる・絞り込み・研究の施策
  const tip = el('div.uxk-tip');
  const fundsOdo = new Odo({ digits: Math.max(6, String(Math.max(0, Math.round(s0.money))).length), size: 's', value: Math.max(0, s0.money), cls: 'ux-odo--amber' });
  const rpOdo = new Odo({ digits: Math.max(4, String(Math.round(s0.rp ?? 0)).length), size: 's', value: s0.rp ?? 0, cls: 'uxk-odo-rp' });
  const fundsBox = el('span.uxk-cur.is-money', { title: t('資金', 'Funds') }, el('span.uxk-cur-k', lite('coin', '#ffb81f'), el('b', t('資金', 'Funds'))), fundsOdo.el, el('span.uxk-cur-u.ux-num', 'G'));
  const rpBox = el('span.uxk-cur.is-rp', { title: t('研究ポイント', 'Research points') }, el('span.uxk-cur-k', lite('flask', '#5fe4ff'), el('b', t('研究', 'Research'))), rpOdo.el, el('span.uxk-cur-u.ux-num', 'RP'));
  const brandV = el('b.ux-num');
  const brandBox = el('span.uxk-cur.is-brand', { title: t('ブランド力', 'Brand') }, el('span.uxk-cur-k', lite('star', '#ffb81f'), el('b', t('ブランド力', 'Brand'))), brandV);
  const embV = el('b.ux-num');
  const embBox = el('span.uxk-cur.is-emblem', { title: t('エンブレム', 'Emblems') }, el('span.uxk-cur-k', lite('crown', '#ffb81f'), el('b', t('エンブレム', 'Emblems'))), embV);
  const canN = el('b.ux-num');
  const canKey = uxKey(el('span.uxk-can', uxLamp('', true, true), el('b', t('上げられる', 'Can upgrade')), canN), () => {
    const best = K.bestSkillMove(S());
    if (best) flyTo(best.id);
  }, { ico: 'up', cls: 'uxk-tkey uxk-tkey-can' });
  const findKey = uxKey(el('b.uxk-tkey-t', t('絞り込み', 'Filter')), () => {
    F.panel = !F.panel;
    studyOpen = false;
    sync();
  }, { ico: null, cls: 'uxk-tkey uxk-tkey-find', attrs: { title: t('部門・開けられるもので絞り込む・名前で探す', 'Filter by department or what you can unlock, or search by name') } });
  findKey.firstElementChild?.prepend(lite('search'));
  const studyLamp = uxLamp('cyan', false, true);
  const studyKey = uxKey(el('b.uxk-tkey-t', t('研究の施策', 'Research work')), () => {
    studyOpen = !studyOpen;
    F.panel = false;
    sync();
  }, { ico: null, cls: 'uxk-tkey uxk-tkey-study', attrs: { title: t('出土品の整理・文献調査（月に 1 回ずつ）と、月の研究ポイントの入り方', 'Sorting finds and literature surveys (once a month each), and monthly RP by source') } });
  studyKey.firstElementChild?.prepend(lite('flask'), studyLamp);
  const fchipT = el('b');
  const fchip = uxKey(el('span.uxk-fchip', fchipT, lite('close')), () => {
    F.dept = null;
    F.open = false;
    sync();
  }, { ico: null, cls: 'uxk-tkey uxk-tkey-fchip', attrs: { title: t('絞り込みを外す', 'Clear the filter') } });
  const cur = el('div.uxk-top-row', el('div.uxk-curs', fundsBox, rpBox, brandBox, embBox), el('div.uxk-tkeys', canKey, findKey, studyKey, fchip));
  const gband = el('div.uxk-goal');
  const top = el('div.uxk-top', tip, cur, gband);
  if (sealed) cur.hidden = true;

  // ---- マインちゃんが止める（チュートリアル中に、ほかのパネルを開放しようとした）
  const stop = el('div.uxk-stop', { hidden: true });
  let stopOff: (() => void) | null = null;
  const halt = () => {
    uxSfx('deny');
    stop.replaceChildren(el<HTMLImageElement>('img', { src: K.assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png'), alt: '' }), el('p', t('ちょっと待って！ いまは光っている「人材の募集」を研究しよう！', 'Wait! For now, research the glowing Recruiting panel!')));
    stop.hidden = false;
    replay(stop, 'is-shake');
    stopOff?.();
    stopOff = later(2600, () => (stop.hidden = true));
  };

  // ---- くわしい板（下）・ズーム・マウスを乗せたときの札・絞り込みと研究の施策の板
  const board = el('div.uxk-board');
  const zoomUi = el('div.uxk-zoom');
  const card = el('div.uxk-hover', { hidden: true });
  const fpanel = el('div.uxk-panel.uxk-fpanel', { hidden: true });
  const spanel = el('div.uxk-panel.uxk-spanel', { hidden: true });
  for (const pnl of [fpanel, spanel]) pnl.addEventListener('pointerdown', (e) => e.stopPropagation());
  const curtain = el('div.uxk-curtain', { hidden: true });
  wrap.append(vp, heads, ...bands.map((x) => x.lab), top, zoomUi, board, card, stop, fpanel, spanel, curtain);
  if (sealed) zoomUi.hidden = true;
  body.append(wrap);

  // ---------------------------------------------------------------- いまの様子を読む
  /** 絞り込みに合うか（部門・開けられるものだけ。取得済みでレベルを上げられるものも「開けられる」） */
  const passes = (s: P1State, k: Skill, st: TreeState) => (!F.dept || K.deptOf(k) === F.dept) && (!F.open || st === 'open' || (st === 'done' && !k.donate && K.lvOf(s, k.id) < K.maxLv(k) && T.canLevel(s, k)));
  let goal: string | null = null;
  let path: string[] = [];
  let nx: ReturnType<typeof K.goalNext> = null;
  let tips = new Set<string>();
  let target: string | null = null;
  const waitTag = (w: { id: string; why: string | null }): string => {
    const k = K.SKILL[w.id];
    if (w.why === 'brand') return `★${k.brand}`;
    if (w.why === 'emblem') return `E${k.emblem}`;
    if (w.why === 'ring') return K.TIER_NAME[K.skillTier(k)];
    if (w.why === 'dept') return t(`理解度 ${k.deptLv}`, `Lv ${k.deptLv}`);
    if (w.why === 'busy') return t('修行中', 'training');
    return t('鍵', 'locked');
  };
  const softWait = (why: string | null | undefined) => !!why && why !== 'rp' && why !== 'money' && why !== 'floor';
  function descOf(s: P1State, k: Skill): NodeDesc {
    const st = T.stateOf(s, k);
    const lv = K.lvOf(s, k.id);
    const mx = K.maxLv(k);
    const tr = K.trainingOf(s, k.id);
    const pi = path.indexOf(k.id);
    const research = K.isResearch(k);
    let gauge = -1;
    if (st === 'poor') gauge = k.donate ? gaugeSteps(s.money, K.nextDonateCost(s)) : research ? gaugeSteps(s.rp ?? 0, K.rpCost(k)) : gaugeSteps(s.money, k.cost);
    return {
      st,
      goalTier: st === 'ring' && T.isGoalTier(k),
      lv,
      mx,
      canUp: st === 'done' && !only && !k.donate && lv < mx && T.canLevel(s, k),
      inf: !!k.inf,
      donate: k.donate ? K.donations(s) : 0,
      train: tr ? 1 - tr.left / tr.total : -1,
      carried: st === 'done' && K.carriedRp(s, k.id),
      tip: tips.has(k.id) && st !== 'done',
      hot: target === k.id,
      step: pi,
      goal: k.id === goal,
      wait: pi >= 0 && nx?.id === k.id && softWait(nx.why) ? waitTag(nx) : '',
      dim: !passes(s, k, st),
      brand: k.brand ?? 0,
      brandOk: (s.brand ?? 0) >= (k.brand ?? 0),
      emblem: k.emblem ?? 0,
      emblemOk: (s.emblem ?? 0) >= (k.emblem ?? 0),
      gauge,
    };
  }
  /** パネル 1 枚を描く（様子が変わったときだけ呼ぶ） */
  function drawNode(s: P1State, nv: NodeView, d: NodeDesc) {
    const k = nv.k;
    const n = nv.el;
    const tier = K.skillTier(k);
    const shape = K.shapeOf(k) === 'square' ? 'is-research' : 'is-money';
    const cls = ['isl-tree-node', 'uxk-node', shape, `is-${d.st}`];
    if (k.big) cls.push('is-dust');
    if (tier !== 'C') cls.push(`is-tier-${tier}`);
    if (d.goalTier) cls.push('is-goal');
    if (d.dim) cls.push('is-dimf');
    if (d.hot) cls.push('is-hot');
    if (d.step >= 0) cls.push('is-path');
    if (d.carried) cls.push('is-carried');
    if (d.st === 'done' && d.mx > 1 && d.lv >= d.mx) cls.push('is-max');
    if (d.canUp) cls.push('is-up');
    if (V.sel === k.id) cls.push('is-sel');
    if (n.dataset.pop) cls.push('is-digpop');
    n.className = cls.join(' ');
    n.setAttribute('aria-label', aria(s, k, d.st));
    const kids: (HTMLElement | null)[] = [el('i.uxk-n-f')];
    const lamp = lampOf(d.st);
    if (d.st === 'ring' && !d.goalTier) kids.push(el('span.uxk-n-q.ux-num', '?'));
    else {
      kids.push(panelIcon(k.id, 32));
      if (d.st !== 'ring' && d.st !== 'sealed' && d.st !== 'soon') kids.push(el(`i.uxk-n-l${lamp.kind ? '.is-' + lamp.kind : ''}${lamp.on ? '.is-on' : ''}${lamp.blink ? '.is-blink' : ''}`));
      const marks = el('span.uxk-n-m');
      if (d.goalTier || d.st === 'locked' || d.st === 'sealed') marks.append(glyph('lock', 'uxk-n-st'));
      else if (d.st === 'soon') marks.append(glyph('clock', 'uxk-n-st'));
      else if (d.st === 'training') marks.append(glyph('hourglass', 'uxk-n-st', '#5fe4ff'));
      else if (d.st === 'done' && d.inf) marks.append(glyph('inf', 'uxk-n-st', '#36e08b'));
      else if (d.st === 'done') marks.append(glyph('check', 'uxk-n-st', '#36e08b'));
      if (d.st !== 'sealed' && !d.goalTier && (d.brand || d.emblem)) {
        const tags = el('span.uxk-n-tags');
        if (d.brand) tags.append(el(`span.uxk-n-tag.ux-num${d.brandOk ? '.is-ok' : ''}`, glyph('star', 'uxk-n-tg', d.brandOk ? '#36e08b' : '#ffb81f'), String(d.brand)));
        if (d.emblem) tags.append(el(`span.uxk-n-tag.ux-num${d.emblemOk ? '.is-ok' : ''}`, glyph('crown', 'uxk-n-tg', d.emblemOk ? '#36e08b' : '#ffb81f'), String(d.emblem)));
        marks.append(tags);
      }
      if (k.donate) {
        if (d.donate > 0) marks.append(el('b.uxk-n-lv.ux-num', `×${d.donate}`));
      } else if (d.st === 'done' && d.inf) marks.append(el('b.uxk-n-lv.ux-num', `Lv${d.lv}`));
      else if (d.st === 'done' && d.mx > 1 && !only && d.lv >= 2) marks.append(el(`b.uxk-n-lv.ux-num${d.lv >= d.mx ? '.is-max' : ''}`, `Lv${d.lv}`));
      if (d.canUp) marks.append(glyph('up', 'uxk-n-up', '#36e08b'));
      if (d.tip) marks.append(glyph('bulb', 'uxk-n-hint', '#ffb81f'));
      if (d.step >= 0) marks.append(d.goal ? glyph('target', 'uxk-n-step.is-goal', '#1a1c2e') : el('b.uxk-n-step.ux-num', String(d.step + 1)));
      if (d.wait) marks.append(el('span.uxk-n-wait', d.wait));
      kids.push(marks);
      if (d.gauge >= 0) {
        const g = el('i.uxk-n-g');
        for (let i = 0; i < 4; i++) g.append(el(i < d.gauge ? 'i.is-on' : 'i'));
        kids.push(g);
      }
      if (d.train >= 0) {
        const bar = el('i');
        bar.style.transform = `scaleX(${Math.round(d.train * 20) / 20})`;
        kids.push(el('i.uxk-n-prog', bar));
      }
    }
    n.replaceChildren(...kids.filter((x): x is HTMLElement => !!x));
  }

  // ---------------------------------------------------------------- つながりの強調
  const hlNow = { id: null as string | null };
  let relEls: Element[] = [];
  function highlight(id: string | null) {
    if (hlNow.id === id) return;
    hlNow.id = id;
    for (const e of relEls) e.classList.remove('is-rel');
    relEls = [];
    svgHl.replaceChildren();
    const k = id ? K.SKILL[id] : null;
    if (!k) return;
    const c = chainOf(k.id, edges);
    // 下の配線は描き直さない（暗くしない）：強調の線を、暗い縁取りつきで上に重ねる（400 本の線を塗り直すと、選ぶたびに重い）
    const add = (i: number, cls: string) => {
      for (const part of ['is-rim', 'is-core']) {
        const l = document.createElementNS(NS, 'path');
        l.setAttribute('d', routed.wires[i].d);
        l.setAttribute('class', `uxk-hl ${cls} ${part}`);
        svgHl.append(l);
      }
    };
    for (const i of c.down) add(i, 'is-down');
    for (const i of c.up) add(i, 'is-up');
    for (const r of c.rel) {
      const n = nodes.get(r)?.el;
      if (n) {
        n.classList.add('is-rel');
        relEls.push(n);
      }
    }
  }

  // ---------------------------------------------------------------- 押す・選ぶ・開ける
  const isDouble = (id: string) => {
    const now = performance.now();
    const yes = !!lastTap && lastTap.id === id && now - lastTap.t < T.DOUBLE_MS;
    lastTap = yes ? null : { id, t: now };
    return yes;
  };
  /** 選ぶ（木は作り直さない：選んだ印・つながり・くわしい板だけ直す） */
  function select(id: string | null, feel = true) {
    const prev = V.sel;
    V.sel = id;
    if (prev && prev !== id) (prev === HQ ? rootB : nodes.get(prev)?.el)?.classList.remove('is-sel');
    const cur = id === HQ ? rootB : id ? nodes.get(id)?.el : null;
    if (cur) {
      cur.classList.add('is-sel');
      // 押し込まれた動き（class の付け直しだと、その場で全体の並べ直しが走る。Web Animations なら走らない）
      if (feel && prev !== id && !isCalm() && typeof cur.animate === 'function') cur.animate([{ transform: 'scale(0.9)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 140, easing: 'steps(3, end)' });
    }
    if (feel && prev !== id) uxSfx('toggle', { step: 1 });
    highlight(id && K.SKILL[id] ? id : null);
    drawBoard(S());
    // 板の高さを測るのは、次のコマの並べ直しのとき（ここで測ると、押したその場で全体の並べ直しが走る）
    requestAnimationFrame(() => {
      if (!alive) return;
      measure();
      placeZoom();
      placeHeads();
      if (cur && feel) reveal(cur);
    });
  }
  /** 選んだパネルが、下の板・上の見出しに隠れていたら、見える所まで木を送る（220ms） */
  function reveal(n: HTMLElement) {
    if (drag || pinch) return;
    const r = n.getBoundingClientRect();
    const v = vp.getBoundingClientRect();
    const lo = v.top + insetT + HEAD_PX + 8;
    const hi = v.bottom - insetB - 16;
    const dy = r.bottom > hi ? r.bottom - hi : r.top < lo ? r.top - lo : 0;
    const dx = r.right > v.right - 8 ? r.right - v.right + 8 : r.left < v.left + 8 ? r.left - v.left - 8 : 0;
    if (!dx && !dy) return;
    const a = { x: V.x, y: V.y };
    fly(220, (e) => {
      V.x = a.x + (dx / (UNIT * V.zoom)) * e;
      V.y = a.y + (dy / (UNIT * V.zoom)) * e;
    });
  }
  function tapNode(k: Skill) {
    const s = S();
    const st = T.stateOf(s, k);
    // 続けて 2 回押したら開放（取れないものは理由を返す。チュートリアル中のほかのパネルはマインちゃんが止める）
    if (isDouble(k.id)) {
      if (only && k.id !== only) return halt();
      if (k.donate) return st === 'open' || st === 'poor' ? tryDonate() : undefined;
      if (st === 'open' || st === 'poor') return tryLearn(k);
      if (st === 'done' && !only && K.lvOf(s, k.id) < K.maxLv(k)) return tryLevel(k);
    }
    select(k.id);
  }
  rootB.addEventListener('click', (e) => {
    e.stopPropagation();
    if (moved) return;
    if (isDouble(HQ) && sealed) return unlockHQ();
    select(HQ);
  });
  hover(rootB, () => hqCard(S()));

  /** 足りない・まだ取れないとき：責めない言い方で返す（くわしい板の目盛りが進む・理由の行が光る・やわらかい音） */
  function deny(k: Skill, text: string) {
    if (V.sel !== k.id) select(k.id, false);
    const n = nodes.get(k.id)?.el;
    if (n) replay(n, 'is-nope');
    // 足りないだけのときは、板の「あと N」の目盛りが進む（同じことを、お知らせで重ねない）
    if (gap?.short) return gap.nudge();
    uxSfx('deny');
    const why = board.querySelector('.uxk-need.is-ng, .uxk-conds:not(.is-ok)');
    if (why) replay(why, 'is-nudge');
    ctx.toast(text);
  }
  const shortText = (s: P1State, k: Skill) =>
    K.isResearch(k) ? t(`あと ${fmt(K.rpCost(k) - (s.rp ?? 0))} RP。発掘で貯まります`, `${fmt(K.rpCost(k) - (s.rp ?? 0))} RP to go. Digging earns RP`) : t(`あと ${K.money(k.cost - s.money)}。売上がたまれば届きます`, `${K.money(k.cost - s.money)} to go. Sales will get you there`);
  const capNote = (s: P1State, rpBefore: number) => {
    if ((s.rp ?? 0) > rpBefore) later(900, () => ctx.toast(t(`研究 Lv の上限が上がった！ 止まっていたエクステの研究が進んだ（研究ポイント +${(s.rp ?? 0) - rpBefore}）`, `Research cap raised! Held-back finds levelled up (RP +${(s.rp ?? 0) - rpBefore})`)));
  };
  /** 開けた・上げた手応え：数字が回って減る → パネルに電気が入る → つながる先が順に点く */
  function powerOn(id: string, pay: { rp: number; money: number }, word: string) {
    const before = new Map<string, TreeState>();
    for (const [nid, nv] of nodes) if (nv.d) before.set(nid, nv.d.st);
    V.sel = id;
    uxSfx('cash');
    // 減ったぶんは赤（土台の「-N」は色が付かないので、ここで付ける）
    if (pay.rp) uxPlus(rpOdo.el, -pay.rp, `-${fmt(pay.rp)} RP`).classList.add('uxk-minus');
    if (pay.money) uxPlus(fundsOdo.el, -pay.money).classList.add('uxk-minus');
    K.after(ctx);
    if (!alive) return;
    const n = nodes.get(id)?.el;
    if (!n) return;
    stampWord = word;
    drawBoard(S());
    if (isCalm()) return;
    later(120, () => {
      if (!n.isConnected) return;
      replay(n, 'is-poweron');
      uxSfx('stamp');
      vibrate(18);
      const r = n.getBoundingClientRect();
      sparks({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 16, ['#36e08b', '#fffdf3', '#ffb81f']);
    });
    // つながる先：線の上を電気の粒が走り、着いた先のランプが点く
    const outs = edges.map((e, i) => ({ e, i })).filter((x) => x.e.from === id && nodes.has(x.e.to));
    outs.forEach((x, n2) => {
      later(300 + n2 * 70, () => {
        if (!alive) return;
        pulse(routed.wires[x.i].poly, K.DEPT_LAYOUT[x.e.br].color);
        later(360, () => {
          const to = nodes.get(x.e.to);
          if (!to?.el.isConnected) return;
          const woke = before.get(x.e.to) !== to.d?.st && (to.d?.st === 'open' || to.d?.st === 'poor');
          replay(to.el, woke ? 'is-wake' : 'is-blip');
          uxSfx('lamp', { step: n2 });
        });
      });
    });
  }
  /** 線の上を走る電気の粒（transform だけで動かす） */
  function pulse(poly: [number, number][], color: string) {
    if (isCalm() || typeof world.animate !== 'function' || poly.length < 2) return;
    const dot = el('i.uxk-pulse');
    dot.style.setProperty('--br', color);
    world.append(dot);
    let total = 0;
    const lens = poly.map((p, i) => (i ? (total += Math.hypot(p[0] - poly[i - 1][0], p[1] - poly[i - 1][1])) : 0));
    const frames = poly.map((p, i) => ({ transform: `translate3d(${p[0]}px, ${p[1]}px, 0)`, offset: total ? lens[i] / total : 0 }));
    dot.animate(frames, { duration: 340, easing: 'steps(12, end)' }).onfinish = () => dot.remove();
  }
  let stampWord = '';

  function tryLearn(k: Skill) {
    const s = S();
    if (only && k.id !== only) return halt();
    // 技：修行に出す職人を選んでから（修行は 1 つずつ）
    if (k.train && !K.has(s, k.id) && K.skillLock(s, k) === null) {
      if (K.trainingOf(s, k.id)) return;
      if (s.training) return deny(k, K.plain(t(`いまは${K.heroName(s.training.hero)}が「${K.SKILL[s.training.id]?.name ?? ''}」を修行中です（あと ${s.training.left} 日）。修行は 1 つずつ`, `${K.heroName(s.training.hero)} is training ${K.SKILL[s.training.id]?.name ?? ''} (${s.training.left} d left). One at a time`)));
      if (!K.trainees(s).length) return deny(k, t('修行に出せる職人がいません', 'No crafter is free to train'));
      K.pickHero(ctx.root, s, {
        title: t(`「${k.name}」の修行に出す職人`, `Who trains in ${k.name}?`),
        task: 'craft',
        current: null,
        note: t(`製造の適性が高いほど早く身につきます（${k.train} 日から最大 −40%）。修行のあいだ、その職人は作業台に立てません（終わったら元の配置に戻ります）。`, `Higher crafting aptitude learns faster (${k.train} days, up to −40%). The crafter leaves their bench while training and returns afterwards.`),
        extra: (st) => t(`修行 ${K.trainDays(s, k.id, st)} 日`, `${K.trainDays(s, k.id, st)} days`),
        badge: t('いちばん早く身につく', 'Fastest learner'),
        onPick: (hero) => {
          if (hero == null) return;
          const rpB = s.rp ?? 0;
          const mB = s.money;
          const e = K.learn(s, k.id, hero);
          if (e) {
            deny(k, e === 'money' || e === 'rp' ? shortText(s, k) : t('いまは修行に出せません', 'Can’t start training now'));
            K.after(ctx);
            return;
          }
          ctx.toast(t(`${K.heroName(hero)}が「${k.name}」の修行を始めました（${s.training?.total ?? 0} 日）`, `${K.heroName(hero)} started training in ${k.name} (${s.training?.total ?? 0} days)`));
          powerOn(k.id, { rp: Math.max(0, rpB - (s.rp ?? 0)), money: Math.max(0, mB - s.money) }, t('修行開始', 'Training'));
        },
      });
      return;
    }
    const rpB = s.rp ?? 0;
    const mB = s.money;
    const e = K.learn(s, k.id);
    if (e === 'money' || e === 'rp') return deny(k, shortText(s, k));
    if (e === 'brand') return deny(k, t(`ブランド力 ${k.brand} が要ります（いま ${s.brand ?? 0}）`, `Needs brand ${k.brand} (now ${s.brand ?? 0})`));
    if (e === 'emblem') return deny(k, t(`エンブレム ${k.emblem} が要ります（いま ${s.emblem ?? 0}）`, `Needs ${k.emblem} emblem(s) (now ${s.emblem ?? 0})`));
    if (e === 'ring' || e === 'sealed') return deny(k, T.ringNeed(k));
    if (e === 'soon') return deny(k, t('準備中です', 'Coming soon'));
    if (e === 'requires') return deny(k, t('先に要るパネルがあります（くわしい板の「先に要る」を押すと、そこへ寄ります）', 'Needs earlier panels first (tap one under “Needs” to jump there)'));
    if (e === 'dept') return deny(k, t(`${K.DEPT[K.deptOf(k)].name}の理解度 ${k.deptLv} が要ります（いま ${K.deptLevel(s, K.deptOf(k))}）`, `Needs ${K.DEPT[K.deptOf(k)].name} understanding ${k.deptLv} (now ${K.deptLevel(s, K.deptOf(k))})`));
    if (e === 'hidden') return deny(k, t('まだ雲の向こう（発掘と出会うと開く）', 'Still beyond the clouds (opens once you meet digging)'));
    if (e) return deny(k, t('いまは開けられません', 'Can’t unlock this now'));
    // 研究の目利き：上限で止まっていたエクステの研究 Lv が上がり、RP が入ることがある
    const paidRp = K.isResearch(k) ? K.rpCost(k) : 0;
    if ((s.rp ?? 0) > rpB - paidRp) later(900, () => ctx.toast(t(`研究 Lv の上限が上がった！ 止まっていたエクステの研究が進んだ（研究ポイント +${(s.rp ?? 0) - (rpB - paidRp)}）`, `Research cap raised! Held-back finds levelled up (RP +${(s.rp ?? 0) - (rpB - paidRp)})`)));
    ctx.toast(K.isResearch(k) ? t(`研究ポイント ${K.rpCost(k)} で「${k.name}」を開放しました`, `Unlocked ${k.name} with ${K.rpCost(k)} RP`) : t(`「${k.name}」を開放しました`, `Unlocked: ${k.name}`));
    powerOn(k.id, { rp: paidRp, money: Math.max(0, mB - s.money) }, K.isResearch(k) ? t('研究済', 'Researched') : t('開放済', 'Unlocked'));
  }
  /** レベルを上げる（くわしい板のキー・取得済みのパネルの 2 度押し）。チュートリアル中は上げない */
  function tryLevel(k: Skill) {
    const s = S();
    if (only) return halt();
    const rpB = s.rp ?? 0;
    const mB = s.money;
    const byRp = !!k.inf || K.r2Panel(k);
    const cost = byRp ? K.nextLevelRp(s, k) : K.nextLevelCost(s, k);
    const e = K.levelUp(s, k.id);
    if (e === 'money') return deny(k, t(`あと ${K.money(cost - s.money)}。売上がたまれば届きます`, `${K.money(cost - s.money)} to go. Sales will get you there`));
    if (e === 'rp') return deny(k, t(`あと ${fmt(cost - (s.rp ?? 0))} RP。発掘で貯まります`, `${fmt(cost - (s.rp ?? 0))} RP to go. Digging earns RP`));
    if (e === 'max') return deny(k, t('最大レベルです', 'Already at max level'));
    if (e) return deny(k, t('いまは上げられません', 'Can’t level up now'));
    ctx.toast(t(`「${k.name}」を Lv ${K.lvOf(s, k.id)} に上げました`, `${k.name} is now Lv ${K.lvOf(s, k.id)}`));
    if (byRp) capNote(s, rpB - cost);
    powerOn(k.id, { rp: byRp ? cost : 0, money: Math.max(0, mB - s.money) }, `Lv ${K.lvOf(s, k.id)}`);
  }
  /** 研究への寄付：G を払って RP */
  function tryDonate() {
    const s = S();
    if (only) return halt();
    const k = K.SKILL.dig_donate;
    const r = K.donate(s);
    if (r === 'money') return deny(k, t(`あと ${K.money(K.nextDonateCost(s) - s.money)}。売上がたまれば届きます`, `${K.money(K.nextDonateCost(s) - s.money)} to go. Sales will get you there`));
    if (r === 'closed') return deny(k, T.DONATE_NEED());
    if (typeof r === 'string') return deny(k, t('いまは寄付できません', 'Can’t donate now'));
    ctx.toast(t(`+${r.rp} RP（次は ${K.money(r.next)}）`, `+${r.rp} RP (next ${K.money(r.next)})`));
    // いつもの「研究ポイント +N」のお知らせは重ねない
    ctx.rpNoted?.();
    uxPlus(rpOdo.el, r.rp, `+${fmt(r.rp)} RP`);
    powerOn('dig_donate', { rp: 0, money: r.cost }, t('寄付済', 'Donated'));
  }
  function unlockHQ() {
    const s = S();
    if (!K.openHQ(s)) return;
    burst = performance.now();
    V.sel = null;
    V.x = 0;
    V.y = 0;
    V.zoom = -1; // 組み直したあと、全体が見える大きさに
    uxSfx('clunk');
    later(700, () => uxSfx('rankup'));
    vibrate(24);
    ctx.toast(t('本社を開放しました！ 部門の枝が広がります', 'HQ unlocked! Department branches spread out'));
    ctx.save();
    K.after(ctx);
    // 本社の上で自社の色の花火を 1 発（電源が入る演出のあいだ）
    later(250, () => K.fxAtEl('firework-burst', ctx.root.querySelector('.isl-tree-root'), { palette: K.FX_PAL.ours, opts: { core: K.FX_PAL.core }, seed: 5 }));
  }

  // ---------------------------------------------------------------- くわしい板・マウスを乗せたときの札
  let gap: ReturnType<typeof uxpGap> | null = null;
  const need = (ok: boolean, text: string) => el(`div.uxk-need${ok ? '.is-ok' : '.is-ng'}`, uxLamp(ok ? 'good' : '', ok), lite(ok ? 'check' : 'lock', ok ? '#36e08b' : '#97a1cf'), el('span', text));
  /** 区分の 1 行：研究パネル／お金パネルと、レベルのランプ */
  function catLine(s: P1State, k: Skill, tut: boolean): HTMLElement {
    const lv = K.lvOf(s, k.id);
    const mx = K.maxLv(k);
    const research = K.isResearch(k);
    const lamps = (n: number) => {
      const box = el('span.uxk-lvl');
      for (let i = 1; i <= n; i++) box.append(uxLamp('good', i <= lv));
      return box;
    };
    let text: string;
    let dots: HTMLElement | null = null;
    if (k.inf) text = lv > 0 ? t(`研究パネル（Lv ${lv} / ∞・上限なし）`, `Research panel (Lv ${lv} / ∞, no cap)`) : t('研究パネル（Lv の上限なし ∞）', 'Research panel (no level cap ∞)');
    else if (k.donate) text = t(`お金パネル（寄付 ${K.donations(s)} 回・上限なし）`, `Money panel (${K.donations(s)} donations, no limit)`);
    else if (research && K.r2Panel(k)) {
      text = tut ? t('研究パネル', 'Research panel') : lv <= 0 ? t(`研究パネル（Lv 1〜${mx}・RP で上げる）`, `Research panel (Lv 1–${mx}, level up with RP)`) : lv >= mx ? t(`研究パネル（Lv ${lv} / ${mx}・最大）`, `Research panel (Lv ${lv} / ${mx}, max)`) : t(`研究パネル（Lv ${lv} / ${mx}）`, `Research panel (Lv ${lv} / ${mx})`);
      if (!tut && lv > 0) dots = lamps(mx);
    } else if (research) text = t('研究パネル（レベルなし）', 'Research panel (no levels)');
    else {
      text = tut ? t('お金パネル', 'Money panel') : lv >= mx ? t(`お金パネル（Lv ${lv} / ${mx}・最大）`, `Money panel (Lv ${lv} / ${mx}, max)`) : t(`お金パネル（Lv ${lv} / ${mx}）`, `Money panel (Lv ${lv} / ${mx})`);
      if (!tut && lv > 0) dots = lamps(mx);
    }
    return el(`div.uxk-cat${research ? '.is-research' : '.is-money'}`, lite(research ? 'chip' : 'dia', research ? '#5fe4ff' : '#ffb81f'), el('span', text), dots);
  }
  /** いまの効果と次のレベルの効果（「クラフトの日数 −30% → −35%」） */
  function effLines(s: P1State, k: Skill): HTMLElement | null {
    const lv = K.lvOf(s, k.id);
    const row = (label: string, cur: string, nxt: string | null) => el('div.uxk-eff-row', el('span.uxk-eff-k', label), el('b.uxk-eff-v', cur), nxt != null && nxt !== cur ? [lite('next', '#97a1cf'), el('b.uxk-eff-v.is-next', nxt)] : null);
    if (k.inf) return el('div.uxk-eff', row(T.INF_LABEL[k.inf](), T.infText(s, k, lv), T.infText(s, k, lv + 1)));
    const mx = K.maxLv(k);
    const { base, up } = K.shownOf(k);
    if (!base.length && !up.length) return null;
    const box = el('div.uxk-eff');
    const lin2 = K.r2Panel(k);
    const line = (x: (typeof base)[number], isUp: boolean) => {
      const cur = K.shownText(x, lv, isUp, lin2);
      const nxt = lv < mx ? K.shownText(x, k.branch === 'dig' && K.isResearch(k) && !k.donate ? K.digRpLv(k) : lv + 1, isUp, lin2) : null;
      box.append(row(x.label, cur ?? t('なし', 'none'), nxt));
    };
    for (const x of base) line(x, false);
    for (const x of up) line(x, true);
    return box;
  }
  /** 先に要るものの札（全部要る・n 個要る）。満たしたものは緑のランプ。押すと、そのパネルへ寄って光らせる */
  function condRows(s: P1State, k: Skill, go?: (id: string) => void): HTMLElement[] {
    const out: HTMLElement[] = [];
    const chip = (id: string, ok: boolean, lv = 1) => {
      const kk = K.SKILL[id];
      const kids = [uxLamp('good', ok), panelIcon(id, 20), el('span', `${kk ? T.shownName(s, kk) : id}${lv > 1 ? ` Lv${lv}` : ''}`)];
      const c = go ? el<HTMLButtonElement>(`button.uxk-cond${ok ? '.is-ok' : ''}`, { type: 'button' }, kids) : el(`span.uxk-cond${ok ? '.is-ok' : ''}`, kids);
      if (go)
        c.addEventListener('click', (e) => {
          e.stopPropagation();
          go(id);
        });
      c.style.setProperty('--br', kk ? T.colorOf(kk) : 'var(--ux-k4)');
      return c;
    };
    const conds = K.condsOf(s, k);
    for (const c of conds) if (c.kind === 'any') out.push(el(`div.uxk-conds.is-any${c.ok ? '.is-ok' : ''}`, el('span.uxk-conds-k', t(`${c.n} 個要る（${Math.min(c.got, c.n)}/${c.n}）`, `Any ${c.n} (${Math.min(c.got, c.n)}/${c.n})`)), c.ids.map((id) => chip(id, K.has(s, id)))));
    const req = conds.filter((c): c is Extract<(typeof conds)[number], { kind: 'req' }> => c.kind === 'req');
    if (req.length) out.unshift(el(`div.uxk-conds.is-all${req.every((c) => c.ok) ? '.is-ok' : ''}`, el('span.uxk-conds-k', req.length > 1 ? t(`全部要る（${req.filter((c) => c.ok).length}/${req.length}）`, `All of (${req.filter((c) => c.ok).length}/${req.length})`) : t('先に要る', 'Needs')), req.map((c) => chip(c.id, c.ok, c.lv))));
    return out;
  }
  /** 修行中の札：職人・残りの日数・進みの計器 */
  function trainBox(s: P1State, k: Skill): HTMLElement | null {
    const tr = K.trainingOf(s, k.id);
    if (!tr) return null;
    const m = uxMeter(1 - tr.left / tr.total, 'cyan');
    const face = K.heroIcon(tr.hero, 32);
    face.classList.add('ux-hero');
    return el('div.uxk-train', el('span.uxk-train-top', face, el('span', t(`${K.heroName(tr.hero)}が修行中（あと ${tr.left} 日）`, `${K.heroName(tr.hero)} is training (${tr.left} d left)`))), m.el);
  }
  /** パネルの説明の行（くわしい板と、マウスを乗せたときの札で同じもの） */
  function infoLines(s: P1State, k: Skill, st: TreeState, go?: (id: string) => void): HTMLElement[] {
    const out: HTMLElement[] = [];
    const tier = K.skillTier(k);
    if (st === 'ring' || st === 'sealed') return [need(false, T.ringNeed(k))];
    if (tier !== 'C') out.push(el('span.uxk-tier', uxTape(T.tierArea(tier), 'dark')));
    if (st === 'soon') out.push(need(false, t('準備中（まだ取れない）', 'Coming soon (not available yet)')));
    out.push(...condRows(s, k, go));
    // 引き継いだ研究パネル（ランクアップの災害で、お金のパネルだけが未取得に戻る。RP のパネルは残って、そのまま効く）
    if (st === 'done' && K.carriedRp(s, k.id)) {
      out.push(need(true, t('取得済み（引き継ぎ）：いまも効いています', 'Unlocked (carried over): still active')));
      const front = K.missingFront(s, k.id);
      if (front.length) out.push(el('div.uxk-note.is-warn', lite('warn', '#ffb81f'), el('span', t(`手前の「${front.map((r) => K.SKILL[r]?.name ?? r).join('」「')}」は未取得です。開けると線がつながります（この研究は払い直しなし）`, `Not yet re-unlocked in front: ${front.map((r) => K.SKILL[r]?.name ?? r).join(', ')}. Unlock it to reconnect the line (no RP to pay again)`))));
    }
    if (k.brand) out.push(need((s.brand ?? 0) >= k.brand, t(`ブランド力 ${k.brand}（いま ${s.brand ?? 0}）`, `Brand ${k.brand} (now ${s.brand ?? 0})`)));
    if (k.emblem) out.push(need((s.emblem ?? 0) >= k.emblem, t(`エンブレム ${k.emblem}（いま ${s.emblem ?? 0}）`, `${k.emblem} emblem(s) (now ${s.emblem ?? 0})`)));
    if (k.deptLv) {
      const d = K.deptOf(k);
      out.push(need(K.deptLevel(s, d) >= k.deptLv, t(`${K.DEPT[d].name}の理解度 ${k.deptLv}（いま ${K.deptLevel(s, d)}）`, `${K.DEPT[d].name} understanding ${k.deptLv} (now ${K.deptLevel(s, d)})`)));
    }
    if (k.train && st !== 'done' && st !== 'training') out.push(el('div.uxk-note', lite('hourglass', '#97a1cf'), el('span', T.trainNote(k))));
    const tb = trainBox(s, k);
    if (tb) out.push(tb);
    return out;
  }
  const titleEl = (s: P1State, k: Skill) => el('div.uxk-title', uxTape(T.branchName(k), 'dark'), el('b', T.shownName(s, k)));
  const iconBox = (k: Skill, st: TreeState) => {
    const ic = el(`div.uxk-dicon${K.isResearch(k) ? '.is-research' : '.is-money'}.is-${st}`, el('i.uxk-n-f'), st === 'ring' && !T.isGoalTier(k) ? el('span.uxk-n-q.ux-num', '?') : panelIcon(k.id, 32));
    ic.style.setProperty('--br', T.colorOf(k));
    return ic;
  };
  const tipRow = () => el('div.uxk-note.is-good', lite('bulb', '#ffb81f'), el('span', t('地図の印によく出る困りごとを無くすパネル', 'Fixes a trouble that keeps showing on the map')));
  /** 足りないぶん（目盛りに出す） */
  function shortOf(s: P1State, k: Skill, st: TreeState): { have: number; cost: number; unit: string; hint: string } | null {
    const rpHint = t('発掘で貯まります', 'Digging earns RP');
    if (k.donate) return st === 'poor' ? { have: s.money, cost: K.nextDonateCost(s), unit: 'G', hint: '' } : null;
    if (st === 'poor') return K.isResearch(k) ? { have: s.rp ?? 0, cost: K.rpCost(k), unit: 'RP', hint: rpHint } : { have: s.money, cost: k.cost, unit: 'G', hint: '' };
    if (st === 'done' && !only && K.lvOf(s, k.id) < K.maxLv(k) && !T.canLevel(s, k)) return k.inf || K.r2Panel(k) ? { have: s.rp ?? 0, cost: K.nextLevelRp(s, k), unit: 'RP', hint: rpHint } : { have: s.money, cost: K.nextLevelCost(s, k), unit: 'G', hint: '' };
    return null;
  }
  /** マウスを乗せたときの札（PC）・くわしい板の中身 */
  function infoCard(s: P1State, k: Skill, mode: 'hover' | 'board'): HTMLElement {
    const st = T.stateOf(s, k);
    const tut = !!only;
    const hoverMode = mode === 'hover';
    const lampS = lampOf(st);
    const stateTag = el(`span.uxk-state.is-${st}`, uxLamp(lampS.kind, lampS.on || st === 'poor', lampS.blink), el('b', stateWord(st, K.isResearch(k))));
    const txt = el('div.uxk-dtxt', el('div.uxk-dhead', titleEl(s, k), stateTag));
    if (st !== 'ring' && st !== 'sealed' && st !== 'soon') txt.append(catLine(s, k, tut));
    // 取ったパネルで数字の効果の行があるものは、説明の代わりに「いまの効果 → 次のレベル」を出す（札では両方）
    if ((st !== 'ring' || T.isGoalTier(k)) && !k.sealed && (hoverMode || !(st === 'done' && !tut && K.shownOf(k).base.length))) txt.append(el('p.uxk-desc', k.note));
    if (st !== 'done' && tips.has(k.id)) txt.append(tipRow());
    txt.append(...infoLines(s, k, st, hoverMode ? undefined : (id) => flashTo(id)));
    if ((st === 'done' || (k.branch === 'dig' && K.isResearch(k) && !k.inf && (st === 'open' || st === 'poor' || st === 'locked'))) && !tut) {
      const eff = effLines(s, k);
      if (eff) txt.append(eff);
    }
    const c = el(`div.uxk-info.is-${mode}`, el('div.uxk-dtop', iconBox(k, st), txt));
    c.style.setProperty('--br', K.isResearch(k) ? T.colorOf(k) : 'var(--ux-amber)');
    if (!hoverMode) return c;
    // 札の最後：値段と、2 度押しで開けられること
    if (st === 'ring' || st === 'sealed' || st === 'soon') return c;
    const foot = (tone: string, text: string) => c.append(el(`div.uxk-hfoot.is-${tone}`, text));
    if (k.donate) {
      foot(st === 'open' ? 'good' : st === 'poor' ? 'warn' : 'dim', st === 'locked' ? T.DONATE_NEED() : st === 'poor' ? t(`${T.donateLabel(s)}（あと ${K.money(K.nextDonateCost(s) - s.money)}）`, `${T.donateLabel(s)} (${K.money(K.nextDonateCost(s) - s.money)} to go)`) : t(`${T.donateLabel(s)}・ダブルクリック`, `${T.donateLabel(s)} · double-click`));
      return c;
    }
    if (st === 'done' && !tut) {
      const lv = K.lvOf(s, k.id);
      if (lv < K.maxLv(k)) foot(T.canLevel(s, k) ? 'good' : 'dim', T.canLevel(s, k) ? t(`Lv ${lv + 1} に上げる ${T.nextPrice(s, k)}・ダブルクリック`, `Lv ${lv + 1} for ${T.nextPrice(s, k)} · double-click`) : t(`Lv ${lv + 1} に上げる ${T.nextPrice(s, k)}（まだ足りない）`, `Lv ${lv + 1} for ${T.nextPrice(s, k)} (not yet)`));
      return c;
    }
    const price = K.isResearch(k) ? `${K.rpCost(k)} RP` : T.priceOf(k);
    const sh = shortOf(s, k, st);
    foot(st === 'open' ? 'good' : st === 'poor' ? 'warn' : 'dim', st === 'done' ? stateWord(st, K.isResearch(k)) : st === 'training' ? t('修行中', 'Training') : st === 'locked' ? t(`${price}（手前がまだ）`, `${price} (locked)`) : st === 'poor' && sh ? t(`${price}（あと ${fmt(sh.cost - sh.have)} ${sh.unit}）`, `${price} (${fmt(sh.cost - sh.have)} ${sh.unit} to go)`) : t(`${T.learnLabel(k)}・ダブルクリック`, `${T.learnLabel(k)} · double-click`));
    return c;
  }
  function hqCard(s: P1State): HTMLElement {
    const c = el('div.uxk-info.is-hover', el('div.uxk-dtxt', el('div.uxk-title', el('b', t('本社', 'HQ'))), el('p.uxk-desc', T.HQ_NOTE), el(`div.uxk-hfoot.is-${sealed ? 'good' : 'dim'}`, sealed ? t('ダブルクリックで開放（無料）', 'Double-click to unlock (free)') : t(`開放したスキル ${s.skills.length} / ${K.LEARNABLE().length}`, `Unlocked ${s.skills.length} / ${K.LEARNABLE().length}`))));
    c.style.setProperty('--br', 'var(--ux-amber)');
    return c;
  }
  /** 主役のキー（今の目印：.isl-tree-detail .isl-btn.is-on）。今のボタンと同じ要素・同じ class なので、手応えは土台の着せ方のまま。主役は前の層 */
  function mainKey(label: string, fn: () => void, on: boolean, disabled: boolean): HTMLButtonElement {
    const b = el<HTMLButtonElement>(`button.isl-btn.uxk-go${on ? '.is-on.ux-front' : ''}`, { type: 'button' }, label);
    b.disabled = disabled;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
    });
    return b;
  }
  function drawBoard(s: P1State) {
    gap = null;
    board.className = 'uxk-board isl-tree-detail';
    board.hidden = false;
    const kids: (HTMLElement | null)[] = [];
    const sel = V.sel && V.sel !== HQ ? K.SKILL[V.sel] : null;
    if (V.sel !== moreFor) {
      moreFor = V.sel;
      more = false;
    }
    if (V.sel === HQ) {
      const ic = el('div.uxk-dicon.is-hq', el<HTMLImageElement>('img.uxk-root-b', { src: K.assetUrl('island/b/hq/rd.png'), alt: '' }));
      const txt = el('div.uxk-dtxt', el('div.uxk-dhead', el('div.uxk-title', el('b', t('本社', 'HQ'))), el(`span.uxk-state.is-${sealed ? 'open' : 'done'}`, uxLamp(sealed ? '' : 'good', true, sealed), el('b', sealed ? t('開放できる', 'Ready') : t('稼働中', 'Online')))), el('p.uxk-desc', T.HQ_NOTE));
      if (!sealed) txt.append(el('div.uxk-note', t(`開放したスキル ${s.skills.length} / ${K.LEARNABLE().length}`, `Unlocked ${s.skills.length} / ${K.LEARNABLE().length}`)));
      kids.push(el('div.uxk-info.is-board', el('div.uxk-dtop', ic, txt)));
      if (sealed) kids.push(el('div.uxk-acts', mainKey(t('本社を開放する', 'Unlock HQ'), () => unlockHQ(), true, false)));
    } else if (sel) {
      const st = T.stateOf(s, sel);
      const info = infoCard(s, sel, 'board');
      const tr = K.trainingOf(s, sel.id);
      const lv = K.lvOf(s, sel.id);
      const mx = K.maxLv(sel);
      const research = K.isResearch(sel);
      const levelable = st === 'done' && lv < mx && !only;
      const sh = shortOf(s, sel, st);
      const hints: HTMLElement[] = [];
      const hint = (text: string, tone = '') => hints.push(el(`div.uxk-hint${tone ? '.is-' + tone : ''}`, text));
      let key: HTMLButtonElement;
      if (sel.donate) {
        key = mainKey(st === 'locked' ? t('まだ寄付できない', 'Not open yet') : T.donateLabel(s), () => tryDonate(), st === 'open', st !== 'open' && !(only && st !== 'locked'));
        if (st === 'locked') hints.push(need(false, T.DONATE_NEED()));
        else if (st !== 'poor') hint(t(`寄付した回数 ${K.donations(s)}（押すたびに額が上がる）・パネルを 2 度押ししても寄付できます`, `${K.donations(s)} donations so far (each costs more) · double-tap the panel to donate too`));
      } else {
        const label =
          st === 'done'
            ? research && !sel.inf && !(K.r2Panel(sel) && !only && lv < mx)
              ? K.carriedRp(s, sel.id)
                ? t('研究済み（引き継ぎ）', 'Researched (carried over)')
                : t('研究済み', 'Researched')
              : only
                ? t('開放済み', 'Unlocked')
                : lv >= mx
                  ? t('最大レベル', 'Max level')
                  : t(`Lv ${lv + 1} に上げる ${T.nextPrice(s, sel)}`, `Level up to ${lv + 1} · ${T.nextPrice(s, sel)}`)
            : tr
              ? t(`修行中（あと ${tr.left} 日）`, `Training (${tr.left} d left)`)
              : st === 'ring' || st === 'sealed'
                ? t('まだ開いていない', 'Not open yet')
                : st === 'soon'
                  ? t('準備中', 'Coming soon')
                  : st === 'locked'
                    ? t('まだ開放できない', 'Locked')
                    : T.learnLabel(sel);
        const on = st === 'open' || (levelable && T.canLevel(s, sel));
        // チュートリアル中のほかのパネルは、押せるがマインちゃんが止める
        const off = levelable ? !T.canLevel(s, sel) : st !== 'open' && !(only && sel.id !== only && st !== 'done');
        key = mainKey(label, () => (st === 'done' ? tryLevel(sel) : tryLearn(sel)), on, off);
        if (sel.big && on) key.classList.add('is-dust');
        if (levelable && T.canLevel(s, sel)) hint(t('取ったパネルを 2 度押ししても上げられます', 'Double-tap an unlocked panel to level it up too'));
        if (st === 'open') hint(research ? t('パネルを 2 度押ししても研究できます', 'Double-tap a panel to research it too') : t('パネルを 2 度押ししても開放できます', 'Double-tap a panel to unlock it too'));
      }
      if (sh) {
        gap = uxpGap(sh.have, sh.cost, { unit: sh.unit, hint: sh.hint });
        gap.el.classList.add('uxk-gap');
      }
      const stamp = uxpStamp(stampWord || stateWord(st, research), { kind: 'good' });
      stamp.el.classList.add('uxk-stamp');
      const acts = el('div.uxk-acts', key);
      // まだ取れないパネル：「ここまで進める」（目標は 1 つ。別のパネルを選ぶと置き換わる）。目標のパネルなら「目標を外す」
      if (!sel.donate && !only && st !== 'done' && st !== 'open' && K.goalable(s, sel) && st !== 'training') {
        const isGoal = s.flags.goal === sel.id;
        acts.append(
          uxKey([lite('target'), el('b', isGoal ? t('目標を外す', 'Clear goal') : t('ここまで進める', 'Research up to here'))], () => {
            K.setGoal(s, isGoal ? null : sel.id);
            ctx.save();
            if (!isGoal) ctx.toast(t(`目標：「${sel.name}」。RP とお金が入るたびに、道の順に自動で取ります`, `Goal: ${sel.name}. Panels on the way unlock automatically as RP and funds come in`));
            uxSfx(isGoal ? 'toggle' : 'confirm', isGoal ? { step: 0 } : undefined);
            K.after(ctx);
          }, { ico: null, cls: `uxk-goalkey${isGoal ? ' is-set' : ''}` }),
        );
      }
      info.querySelector('.uxk-dhead')?.append(stamp.el);
      kids.push(info, gap?.el ?? null, ...hints, acts);
      if (stampWord) {
        const w = stampWord;
        stampWord = '';
        if (w && !isCalm()) later(420, () => stamp.el.isConnected && stamp.hit(board));
        else stamp.show();
        info.querySelector('.uxk-state')?.classList.add('is-gone');
      }
      // スマホの板は小さく（名前・区分・足りないぶんとキー）。上に引くか「くわしく」で全部（チュートリアルのあいだは今までどおり全部）
      if (phone && !only) {
        // 小さな板でも、止めている理由の 1 行めは出す
        info.querySelector('.uxk-need.is-ng, .uxk-conds:not(.is-ok)')?.classList.add('uxk-keep');
        board.classList.add('is-mini');
        board.classList.toggle('is-more', more);
        const mb = uxKey(more ? t('とじる', 'Less') : t('くわしく', 'More'), () => {
          more = !more;
          uxSfx('toggle', { step: more ? 1 : 0 });
          drawBoard(S());
          measure();
          placeZoom();
        }, { ico: more ? 'down' : 'up', cls: 'uxk-more' });
        kids.unshift(mb);
      }
    } else if (sealed) kids.push(el('p.uxk-legend', t('真ん中の本社を押して、開放しましょう。開放すると、11 の部門の枝が広がります。', 'Tap HQ in the middle to unlock it. Branches for the 11 departments will spread out.')));
    else if (!phone || only) kids.push(legend());
    else board.hidden = true;
    board.replaceChildren(...kids.filter((x): x is HTMLElement => !!x));
  }
  /** 見分け方（形・ランプ・線）。色だけに頼らない */
  function legend(): HTMLElement {
    const it = (pic: HTMLElement, text: string) => el('span.uxk-leg', pic, el('span', text));
    const lamp = (kind: '' | 'good' | 'cyan', on: boolean, blink = false) => uxLamp(kind, on, blink);
    return el(
      'div.uxk-legend',
      it(lite('chip', '#5fe4ff'), t('四角＝研究ポイント', 'Square = RP')),
      it(lite('dia', '#ffb81f'), t('菱形＝お金', 'Diamond = money')),
      it(lamp('', true, true), t('取れる', 'Ready')),
      it(el('i.uxk-n-g.is-leg', el('i.is-on'), el('i.is-on'), el('i'), el('i')), t('あと少し', 'Almost')),
      it(lamp('good', true), t('済み', 'Done')),
      it(lite('lock', '#97a1cf'), t('手前がまだ', 'Locked')),
    );
  }
  // 上に引くと広げる・下に引くと閉じる（スマホの小さな板）
  let boardY: number | null = null;
  board.addEventListener('pointerdown', (e) => (boardY = e.clientY));
  board.addEventListener('pointerup', (e) => {
    if (boardY == null || !board.classList.contains('is-mini')) return;
    const dy = e.clientY - boardY;
    boardY = null;
    if ((dy < -28 && !more) || (dy > 28 && more)) {
      more = dy < 0;
      drawBoard(S());
      measure();
      placeZoom();
    }
  });

  // ---- PC：パネルにマウスを乗せると、くわしい説明と、つながり
  function hover(target: HTMLElement, fill: () => HTMLElement, id?: string) {
    if (!fine) return;
    target.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || drag || ringFx) return;
      card.replaceChildren(fill());
      card.hidden = false;
      if (id) highlight(id);
      const r = target.getBoundingClientRect();
      const w = wrap.getBoundingClientRect();
      const cw = Math.min(320, w.width - 16);
      card.style.width = `${cw}px`;
      let left = r.right - w.left + 10;
      if (left + cw > w.width - 8) left = r.left - w.left - cw - 10;
      card.style.left = `${Math.max(8, left)}px`;
      card.style.top = `${Math.max(8, Math.min(w.height - card.offsetHeight - 8, r.top - w.top))}px`;
    });
    target.addEventListener('pointerleave', () => {
      card.hidden = true;
      // マウスが離れたら、選んでいるパネルの強調に戻す
      if (id) highlight(V.sel && K.SKILL[V.sel] ? V.sel : null);
    });
  }

  // ---------------------------------------------------------------- 上の帯・目標の帯・板
  function drawGoal(s: P1State) {
    gband.hidden = !goal;
    if (!goal) return gband.replaceChildren();
    const gk = K.SKILL[goal];
    const rpLeft = path.reduce((a, id) => a + K.rpCost(K.SKILL[id]), 0);
    const gLeft = path.reduce((a, id) => a + (K.isResearch(K.SKILL[id]) ? 0 : K.SKILL[id].cost), 0);
    const go = uxKey(el('span.uxk-goal-go', lite('target', '#ffb81f'), panelIcon(goal, 20), el('b', T.shownName(s, gk))), () => flyTo(goal!), { ico: null, cls: 'uxk-gkey', attrs: { title: t('目標のパネルへ', 'Go to the goal panel') } });
    go.style.setProperty('--br', T.colorOf(gk));
    const mo = K.goalMonths(s);
    const floor = uxKey(t(`残す資金 ${mo} か月ぶん（${K.money(K.goalFloor(s))}）`, `Keep ${mo} mo of costs (${K.money(K.goalFloor(s))})`), () => {
      const ms = K.GOAL.months;
      s.flags.goalMonths = ms[(ms.indexOf(mo) + 1) % ms.length];
      ctx.save();
      K.after(ctx);
    }, { ico: 'coin', cls: 'uxk-gkey uxk-gkey-floor', attrs: { title: t('自動で払ったあとも残す資金（ひと月の固定費の何か月ぶん）。押すと 0.5・1・2・3 か月を切り替え', 'Funds kept after auto-paying (months of fixed costs). Tap to switch 0.5 / 1 / 2 / 3') } });
    const x = uxKey(el('span.ux-vh', t('目標を外す', 'Clear the goal')), () => {
      K.setGoal(s, null);
      ctx.save();
      K.after(ctx);
    }, { ico: 'close', cls: 'uxk-gkey uxk-gkey-x', attrs: { title: t('目標を外す', 'Clear the goal'), 'aria-label': t('目標を外す', 'Clear the goal') } });
    const wt = nx ? waitLine(s, nx) : '';
    gband.replaceChildren(go, el('span.uxk-goal-left', t(`あと ${path.length} 枚・${fmt(rpLeft)} RP・${K.money(gLeft)}`, `${path.length} left · ${fmt(rpLeft)} RP · ${K.money(gLeft)}`)), el(`span.uxk-goal-next${softWait(nx?.why) ? '.is-wait' : ''}`, wt), floor, x);
  }
  /** 目標の道の次のパネルが待っている理由（目標の帯の 1 行） */
  function waitLine(s: P1State, w: { id: string; why: string | null }): string {
    const k = K.SKILL[w.id];
    const nm = k?.name ?? w.id;
    switch (w.why) {
      case null:
        return t(`次：「${nm}」を取れる`, `Next: ${nm} is ready`);
      case 'rp':
        return t(`次：「${nm}」（あと ${K.rpCost(k) - (s.rp ?? 0)} RP）`, `Next: ${nm} (${K.rpCost(k) - (s.rp ?? 0)} RP to go)`);
      case 'money':
        return t(`次：「${nm}」（あと ${K.money(k.cost - s.money)}）`, `Next: ${nm} (${K.money(k.cost - s.money)} to go)`);
      case 'floor':
        return t(`次：「${nm}」（残す資金を守って待つ・あと ${K.money(k.cost + K.goalFloor(s) - s.money)}）`, `Next: ${nm} (keeping funds; ${K.money(k.cost + K.goalFloor(s) - s.money)} more)`);
      default:
        return t(`次：「${nm}」は ${waitTag(w)} を待つ`, `Next: ${nm} waits for ${waitTag(w)}`);
    }
  }
  /** 部門の札の中身（絞り込みの板）：名前・理解度・取った数 */
  function deptStat(s: P1State, d: DeptId) {
    const mine = K.SKILLS.filter((k) => K.deptOf(k) === d && !k.sealed && !k.soon && !k.donate && K.ringOpen(s, K.skillTier(k)));
    return { got: mine.filter((k) => K.has(s, k.id)).length, all: mine.length };
  }
  function drawFilter(s: P1State) {
    fpanel.hidden = !F.panel || sealed || !!only;
    if (fpanel.hidden) return fpanel.replaceChildren();
    const q = el<HTMLInputElement>('input.uxk-fq', { type: 'search', placeholder: t('パネルの名前で探す', 'Search panels by name') });
    q.value = F.q;
    const hits = el('div.uxk-fhits');
    const fill = () => {
      F.q = q.value.trim();
      hits.replaceChildren();
      if (!F.q) return;
      const low = F.q.toLowerCase();
      const found = K.SKILLS.filter((k) => !hidden(K.deptOf(k)) && T.shownName(s, k).toLowerCase().includes(low)).slice(0, 8);
      if (!found.length) hits.append(el('span.uxk-fnone', t('見つかりません', 'No match')));
      for (const k of found) {
        const b = uxKey(el('span.uxk-fhit', panelIcon(k.id, 24), el('b', T.shownName(s, k)), el('span', T.branchName(k))), () => {
          F.panel = false;
          drawFilter(S());
          flyTo(k.id);
        }, { ico: null, cls: 'uxk-fhitkey' });
        b.style.setProperty('--br', T.colorOf(k));
        hits.append(b);
      }
    };
    q.addEventListener('input', fill);
    fill();
    const open1 = uxKey(el('span.uxk-fopen', uxLamp('', F.open), el('b', t('開けられるものだけ', 'Only what I can unlock'))), () => {
      F.open = !F.open;
      uxSfx('toggle', { step: F.open ? 1 : 0 });
      sync();
    }, { ico: null, cls: `uxk-fkey${F.open ? ' is-set' : ''}`, attrs: { 'aria-pressed': String(F.open), 'data-ux-quiet': '' } });
    const all = uxKey(t('すべて表示', 'Show all'), () => {
      F.dept = null;
      F.open = false;
      sync();
    }, { ico: null, cls: 'uxk-fkey' });
    const depts = el('div.uxk-fdepts');
    for (const d of K.DEPTS) {
      if (hidden(d.id)) continue;
      const L = K.DEPT_LAYOUT[d.id];
      const st = deptStat(s, d.id);
      const sub = L.groups.length ? t(`理解度 ${K.deptLevel(s, d.id)}・${st.got}/${st.all}`, `Lv ${K.deptLevel(s, d.id)} · ${st.got}/${st.all}`) : K.deptOpen(s, d.id) ? t('パネルは次の更新', 'Panels next update') : K.deptLockText(d.id);
      const b = uxKey(el('span.uxk-fdept', lite(DEPT_ICO[d.id] ?? 'star4', L.color), el('b', d.short), el('span.uxk-fdept-s', !L.groups.length && !K.deptOpen(s, d.id) ? lite('lock', '#97a1cf') : null, sub)), () => {
        F.dept = F.dept === d.id ? null : d.id;
        F.panel = false;
        if (F.dept) {
          const p = K.deptCenter(d.id);
          V.x = p.x;
          V.y = p.y;
          select(null, false);
        }
        sync();
        place();
      }, { ico: null, cls: `uxk-fkey uxk-fdeptkey${F.dept === d.id ? ' is-set' : ''}`, attrs: { title: d.name, 'data-dept': d.id, 'aria-pressed': String(F.dept === d.id) } });
      b.style.setProperty('--br', L.color);
      depts.append(b);
    }
    const x = uxKey(el('span.ux-vh', t('閉じる', 'Close')), () => {
      F.panel = false;
      sync();
    }, { ico: 'close', cls: 'uxk-px', attrs: { 'aria-label': t('閉じる', 'Close') } });
    fpanel.replaceChildren(
      el('div.uxk-phead', lite('search'), el('b', t('絞り込み・探す', 'Filter & search')), el('span.uxk-phead-n', lite('star', '#ffb81f'), el('span.ux-num', String(s.brand ?? 0)), lite('crown', '#ffb81f'), el('span.ux-num', String(s.emblem ?? 0))), x),
      q,
      hits,
      el('div.uxk-frow', open1, all),
      el('div.uxk-fk', uxTape(t('部門', 'Departments'), 'dark')),
      depts,
      legend(),
    );
  }
  function drawStudy(s: P1State) {
    spanel.hidden = !studyOpen || sealed || !!only || !K.digBranchOpen(s);
    if (spanel.hidden) return spanel.replaceChildren();
    const x = uxKey(el('span.ux-vh', t('閉じる', 'Close')), () => {
      studyOpen = false;
      sync();
    }, { ico: 'close', cls: 'uxk-px', attrs: { 'aria-label': t('閉じる', 'Close') } });
    const study = K.studyEl(s, { done: () => (ctx.save(), K.after(ctx)), toast: (m) => ctx.toast(noEmoji(m)), sfx: (k) => ctx.sfx?.(k) });
    const stack = K.rpStackEl(s);
    const bodyEl = el('div.uxk-study', study, stack);
    spanel.replaceChildren(el('div.uxk-phead', lite('flask', '#5fe4ff'), el('b', t('研究の施策', 'Research work')), el('span.uxk-phead-n', el('span.ux-num', `${fmt(s.rp ?? 0)} RP`)), x), bodyEl);
    dotEmoji(bodyEl);
  }

  // ---- ズーム（＋／−で 1 段ずつ・「全体」・列を 1 つずつ送る）
  const sendCol = (dir: 1 | -1) => {
    const ids = K.DEPTS.map((d) => d.id);
    const i = ids.indexOf(K.deptAtX(V.x));
    const next = ids[Math.max(0, Math.min(ids.length - 1, i + dir))];
    V.x = K.DEPT_LAYOUT[next].cx;
    uxSfx('slide', { step: 5 + dir });
    place();
  };
  // 絵は自分で入れる（土台のキーの ico は、土台の絵しか描けない）
  const zk = (ico: string, label: string, fn: () => void, cls = '') => uxKey([kIcon(ico, { color: '#f4ecd4', hi: '#f4ecd4', lo: '#0b0d17', scale: 2 }), el('span.ux-vh', label)], fn, { ico: null, cls: `uxk-zkey ${cls}`.trim(), attrs: { 'aria-label': label, title: label } });
  zoomUi.append(
    zk('left', t('左の列へ', 'Previous column'), () => sendCol(-1), 'uxk-zkey-col'),
    zk('left', t('右の列へ', 'Next column'), () => sendCol(1), 'uxk-zkey-col uxk-flip'),
    zk('plus', t('拡大', 'Zoom in'), () => stepZoom(1)),
    zk('minus', t('縮小', 'Zoom out'), () => stepZoom(-1)),
    uxKey([lite('fit'), el('b', t('全体', 'All'))], () => {
      // 「全体」：閉じた帯も含めて、木の全部が 1 画面に収まる大きさ。選んでいたパネルは外す（下の板が短くなり、木が隠れない）
      V.zoom = T.ALL;
      if (V.sel) select(null, false);
      place();
    }, { ico: null, cls: 'uxk-zkey uxk-zkey-all' }),
  );

  // ---------------------------------------------------------------- 帯が開く演出（終わるまで操作を受けない。最後にマインちゃんの一言と「OK」）
  function ringSay(fx: NonNullable<typeof ringFx>) {
    fx.talk = true;
    const p = el('p');
    p.append(K.rich(t(`[[${T.tierArea(fx.tier)}]]が開いた！ 外周のパネルが取れるよ`, `The [[${T.tierArea(fx.tier)}]] is open! Outer panels are available`)));
    const ok = uxKey(t('OK', 'OK'), () => {
      ringFx = null;
      curtain.hidden = true;
      curtain.replaceChildren();
      wrap.classList.remove('is-ringfx');
      for (const b of bands) b.lab.classList.remove('is-glow');
      sync();
    }, { kind: 'main', cls: 'uxk-ring-ok' });
    curtain.replaceChildren(el('div.uxk-ringtalk', el<HTMLImageElement>('img', { src: K.assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png'), alt: '' }), el('div.uxk-ringtalk-body', uxTape(t('開放', 'OPEN'), 'good'), p, ok)));
    curtain.classList.add('is-talk');
    uxSfx('stamp');
  }
  function ringShow() {
    const fx = ringFx;
    wrap.classList.toggle('is-ringfx', !!fx);
    curtain.hidden = !fx;
    if (!fx) return;
    const left = Math.max(0, T.RING_MS - (performance.now() - fx.t0));
    for (const b of bands) {
      const glow = b.tier === fx.tier;
      b.lab.classList.toggle('is-glow', glow);
      b.rect.classList.toggle('is-glow', glow);
      b.line?.classList.toggle('is-glow', glow);
    }
    if (fx.talk || left <= 0) {
      if (!curtain.classList.contains('is-talk')) ringSay(fx);
      return;
    }
    if (curtain.dataset.run === String(fx.t0)) return;
    curtain.dataset.run = String(fx.t0);
    curtain.classList.remove('is-talk');
    // 開放の板：ランクの札・9 つのランプが順に点く（音が上がっていく）→「開放」が打たれる
    const lamps = Array.from({ length: 9 }, () => uxLamp('', false));
    const word = el('b.uxk-ring-word', t('開放中…', 'Opening…'));
    const stamp = uxpStamp(t('開放', 'OPEN'), { kind: 'good' });
    const im = el<HTMLImageElement>('img', { src: T.tierImg(fx.tier), alt: '' });
    const plate = el('div.uxk-ring-plate', im, el('div.uxk-ring-main', el('div.uxk-ring-head', uxTape(T.tierArea(fx.tier), 'amber'), word, stamp.el), el('div.uxk-ring-lamps', lamps)));
    plate.style.setProperty('--tc', K.TIERS[fx.tier].color);
    curtain.replaceChildren(plate);
    const lampAt = (i: number) => 500 + i * 200;
    lamps.forEach((l, i) =>
      offs.push(
        later(isCalm() ? 0 : lampAt(i), () => {
          l.classList.add('is-on');
          if (alive && !isCalm()) uxSfx('lamp', { step: i });
        }),
      ),
    );
    offs.push(
      later(isCalm() ? 0 : lampAt(9) + 200, () => {
        if (!alive) return;
        word.hidden = true;
        stamp.hit(plate);
        for (const l of lamps) l.classList.add('ux-lamp--good');
        const r = plate.getBoundingClientRect();
        if (!isCalm()) sparks({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 22, [K.TIERS[fx.tier].color, '#fffdf3', '#ffb81f']);
        vibrate(24);
      }),
    );
    // 開くランクのパネルは、上の段から順に点く
    const order = K.SKILLS.filter((k) => K.skillTier(k) === fx.tier && nodes.has(k.id)).sort((a, b) => K.POS.get(a.id)!.y - K.POS.get(b.id)!.y || K.POS.get(a.id)!.x - K.POS.get(b.id)!.x);
    const per = Math.min(60, 1800 / Math.max(1, order.length));
    order.forEach((k, i) => {
      const n = nodes.get(k.id)!.el;
      n.style.setProperty('--d', `${(0.5 + (i * per) / 1000).toFixed(2)}s`);
      n.classList.add('is-ringpop');
    });
    offs.push(later(T.RING_MS + 400, () => order.forEach((k) => nodes.get(k.id)?.el.classList.remove('is-ringpop'))));
    offs.push(later(left, () => alive && ringFx === fx && ringSay(fx)));
  }

  // ---------------------------------------------------------------- 値を合わせる（木は作り直さない）
  function sync() {
    if (!alive) return;
    const s = S();
    // 帯の開放：そのランクのセクタに出店したあと、はじめて開いたとき（チュートリアル中・本社の開放前は待つ）
    if (!ringFx && !sealed && !ctx.step?.()) {
      const due = K.ringsDue(s);
      if (due.length && K.openRing(s, due[0])) {
        ringFx = { tier: due[0], t0: performance.now(), talk: false };
        V.sel = null;
        V.zoom = T.RINGFIT;
        ctx.save();
        uxSfx('clunk');
        offs.push(later(900, () => uxSfx('rankup')));
      }
    }
    target = only && !sealed && !K.has(s, only) ? only : null;
    goal = !sealed && !only && s.flags.goal && K.SKILL[s.flags.goal] ? s.flags.goal : null;
    path = goal ? K.goalPath(s, goal) : [];
    nx = goal ? K.goalNext(s) : null;
    tips = K.tipPanels(s);
    const filtering = !sealed && !only && (!!F.dept || F.open);
    wrap.classList.toggle('is-filtering', filtering);
    // 帯
    for (const b of bands) {
      const on = K.ringOpen(s, b.tier);
      b.on = on;
      setCls(b.rect, `uxk-band${on ? ' is-on' : ''}${ringFx?.tier === b.tier ? ' is-glow' : ''}`);
      if (b.line) setCls(b.line, `uxk-bandline${on ? ' is-on' : ''}`);
      b.lab.classList.toggle('is-on', on);
      b.lock.hidden = on;
      b.lab.title = on ? T.tierArea(b.tier) : t(`${T.tierArea(b.tier)}：進出すると開く`, `${T.tierArea(b.tier)}: expand to open`);
    }
    for (const g of gates) g.el.classList.toggle('is-on', K.ringOpen(s, g.tier));
    // パネル（様子が変わったものだけ描き直す）
    for (const nv of nodes.values()) {
      const d = descOf(s, nv.k);
      const dk = descKey(d);
      if (dk !== nv.key) {
        nv.key = dk;
        nv.d = d;
        drawNode(s, nv, d);
      } else nv.el.classList.toggle('is-sel', V.sel === nv.k.id);
    }
    // 配線（状態：取得済みどうし＝通電・手前が済み＝つながる・手前がまだ＝細い点線・帯が閉じている＝薄い点線）
    const pathSet = new Set(path);
    edges.forEach((e, i) => {
      const k = K.SKILL[e.to];
      const closed = !K.ringOpen(s, K.skillTier(k)) || !!k.sealed;
      const up = e.from ? K.has(s, e.from) : true;
      const got = K.has(s, k.id) || (!!k.donate && K.donations(s) > 0);
      const onPath = pathSet.has(e.to) && (e.from ? pathSet.has(e.from) || K.has(s, e.from) : true);
      const st = closed ? 'is-closed' : up && got ? 'is-done' : up ? 'is-open' : 'is-lock';
      const dim = filtering && !passes(s, k, nodes.get(k.id)?.d?.st ?? T.stateOf(s, k));
      const cls = `uxk-w ${st}${e.kind === 'any' ? ' is-any' : ''}${e.cross ? ' is-cross' : ''}${dim ? ' is-dimf' : ''}${onPath ? ' is-path' : ''}`;
      const l = edgeEls[i];
      if (l.getAttribute('class') !== cls) {
        l.setAttribute('class', cls);
        l.setAttribute('stroke', onPath ? 'var(--ux-amber)' : K.DEPT_LAYOUT[e.br].color);
      }
    });
    for (const j of juncs) {
      const k = K.SKILL[j.id];
      const got = k.anyOf!.ids.filter((r) => K.has(s, r)).length;
      setText(j.el, `${Math.min(got, k.anyOf!.n)}/${k.anyOf!.n}`);
      j.el.classList.toggle('is-ok', got >= k.anyOf!.n);
      j.el.title = t(`${k.anyOf!.ids.length} 枚のうち ${k.anyOf!.n} 枚を取ると開放できる（いま ${got}）`, `Unlocks after any ${k.anyOf!.n} of ${k.anyOf!.ids.length} (now ${got})`);
    }
    // 本社
    rootB.classList.toggle('is-sealed', sealed);
    rootB.classList.toggle('is-sel', V.sel === HQ);
    // 部門の見出し
    for (const hd of headEls) {
      const d = K.DEPT[hd.d];
      const hid = hidden(hd.d);
      const st = deptStat(s, hd.d);
      setText(hd.tx, hid ? '?' : `${d.short} ${K.deptLevel(s, hd.d)}`);
      setText(hd.n, hid ? '' : `${st.got}/${st.all}`);
      hd.fill.style.transform = `scaleY(${st.all ? Math.round((st.got / st.all) * 20) / 20 : 0})`;
      const locked = !K.deptOpen(s, hd.d) && !hid;
      hd.lock.hidden = !locked;
      if (locked && !hd.lock.firstChild) hd.lock.append(lite('lock', '#97a1cf'), el('span', K.deptLockText(hd.d)));
      hd.el.title = hid ? t('雲の向こう（発掘と出会うと開く）', 'Beyond the clouds (opens once you meet digging)') : t(`${d.name}：理解度 ${K.deptLevel(s, hd.d)}・取ったパネル ${st.got}/${st.all}`, `${d.name}: understanding ${K.deptLevel(s, hd.d)} · panels ${st.got}/${st.all}`);
    }
    // 上の計器の帯
    fundsBox.classList.toggle('is-neg', s.money < 0);
    fundsOdo.set(Math.max(0, s.money), { dur: 700, onTick: () => uxSfx('tick') });
    rpOdo.set(s.rp ?? 0, { dur: 700, onTick: () => uxSfx('tick') });
    setText(brandV, String(s.brand ?? 0));
    setText(embV, String(s.emblem ?? 0));
    const nCan = sealed || only ? 0 : K.affordableSkills(s).length;
    canKey.hidden = nCan <= 0;
    setText(canN, String(nCan));
    findKey.hidden = sealed || !!only;
    findKey.classList.toggle('is-set', F.panel);
    const dug = !sealed && !only && K.digBranchOpen(s);
    studyKey.hidden = !dug;
    if (dug) {
      const can = K.STUDY_KINDS.some((k) => K.studyLock(s, k) === null);
      studyLamp.classList.toggle('is-on', can);
      studyLamp.classList.toggle('is-blink', can);
      studyKey.classList.toggle('is-set', studyOpen);
    }
    fchip.hidden = !filtering;
    if (filtering) {
      setText(fchipT, [F.dept ? K.DEPT[F.dept].short : '', F.open ? t('開けられる', 'Unlockable') : ''].filter(Boolean).join(t('・', ' · ')));
      fchip.style.setProperty('--br', F.dept ? K.DEPT_LAYOUT[F.dept].color : 'var(--ux-k4)');
    }
    drawGoal(s);
    // マインちゃんの一言（チュートリアル）
    tip.replaceChildren();
    K.mineTip(ctx, 'skills', tip);
    // チュートリアル：開放できたら ✕ を光らせて、元の画面に戻ってもらう
    wrap.closest('.isl-sheet')?.querySelector('.isl-sheet-head .isl-btn')?.classList.toggle('is-guide', !!only && K.has(s, only));
    // 選んでいるパネルのつながり・くわしい板
    if (V.sel && V.sel !== HQ && !nodes.has(V.sel)) V.sel = null;
    hlNow.id = '';
    highlight(V.sel && K.SKILL[V.sel] ? V.sel : null);
    drawBoard(s);
    drawFilter(s);
    drawStudy(s);
    ringShow();
    measure();
    if (V.zoom === T.ALL || V.zoom === T.RINGFIT || V.zoom < 0 || !V.zoom) place();
    else placeHeads();
    placeZoom();
    tutFocus();
  }
  /** チュートリアル：本社が開いたら、「人材の募集」へカメラを寄せる（電源が入る演出が終わってから） */
  function tutFocus() {
    if (!target || tutFocused) return;
    tutFocused = true;
    const goTo = K.POS.get(target)!;
    const from = { z: V.zoom };
    const wait = bursting ? Math.max(0, T.BURST_MS - (performance.now() - burst)) + 200 : 300;
    offs.push(
      later(wait, () => {
        if (!alive) return;
        const z1 = innerWidth < 600 ? 0.8 : 0.95;
        const a = { x: V.x, y: V.y, z: V.zoom > 0 ? V.zoom : from.z > 0 ? from.z : 0.6 };
        // 下にマインちゃんの一言と説明の板があるので、パネルは画面の上のほう（高さの 35%）に
        const lift = (vp.clientHeight * 0.15) / (UNIT * z1);
        fly(900, (e) => {
          V.x = a.x + (goTo.x - a.x) * e;
          V.y = a.y + (goTo.y + lift - a.y) * e;
          V.zoom = a.z + (z1 - a.z) * e;
        });
      }),
    );
  }

  // ---------------------------------------------------------------- 置く・動かす
  let insetT = 0;
  let insetB = 0;
  /** 上の帯の下の端・下の板の上の端（木の見える範囲）。動かすたびには測らない */
  function measure() {
    const v = vp.getBoundingClientRect();
    wrap.classList.toggle('is-wide', v.width >= 1040);
    insetT = Math.max(0, top.getBoundingClientRect().bottom - v.top);
    insetB = board.hidden ? 0 : Math.max(0, v.bottom - board.getBoundingClientRect().top);
  }
  /** 「全体」：木の全部（閉じた帯も）が、上の帯と見出しの下・下の板の上に収まる大きさ。開く演出のあいだは、その帯まで */
  function fitAll(upto?: Tier) {
    const hh = Math.max(120, vp.clientHeight - insetT - insetB - 8);
    const lab = innerWidth < 600 ? 0 : 120;
    const yb = upto ? K.BANDS[upto].bottom + 1 : B.y1;
    const w = B.x1 - B.x0 + 1;
    const hgt = yb - B.y0 + 0.4;
    V.zoom = Math.max(ZMIN, Math.min(1, (vp.clientWidth - 16 - lab) / (w * UNIT), hh / (hgt * UNIT)));
    V.x = (B.x0 + B.x1) / 2 - lab / 2 / (UNIT * V.zoom);
    V.y = B.y0 - 0.2 + (vp.clientHeight / 2 - insetT) / (UNIT * V.zoom);
  }
  /** はじめて開いたとき：本社と見出しが上に来る大きさと位置 */
  function firstView() {
    V.zoom = innerWidth < 600 ? 0.7 : 0.8;
    if (sealed) {
      V.x = 0;
      V.y = 0;
      return;
    }
    if (!V.x) {
      const best = K.bestSkillMove(S());
      V.x = best && K.POS.has(best.id) ? K.DEPT_LAYOUT[K.deptOf(K.SKILL[best.id])].cx : K.DEPT_LAYOUT.logistics.cx;
    }
    // 本社が横に見える列：本社と見出しが上に来る。本社が画面の外の列：その列の見出しを上の帯のすぐ下に（本社の段の空きを見せない）
    const hqSeen = Math.abs(V.x) * UNIT * V.zoom < vp.clientWidth / 2 - 48;
    V.y = hqSeen ? -0.75 + (vp.clientHeight / 2 - insetT) / (UNIT * V.zoom) : K.HEAD_Y + (vp.clientHeight / 2 - insetT - HEAD_PX + 12) / (UNIT * V.zoom);
  }
  const zoomSteps = () => {
    const keep = { x: V.x, y: V.y, zoom: V.zoom };
    fitAll();
    const lo = V.zoom;
    V.x = keep.x;
    V.y = keep.y;
    V.zoom = keep.zoom;
    const r = Math.pow(1.4 / lo, 1 / 6);
    return Array.from({ length: 7 }, (_, k) => Math.round(lo * Math.pow(r, k) * 1000) / 1000);
  };
  function stepZoom(dir: 1 | -1, at?: { cx: number; cy: number }) {
    const zs = zoomSteps();
    const cur0 = V.zoom;
    const next = dir > 0 ? (zs.find((z) => z > cur0 * 1.02) ?? zs[zs.length - 1]) : ([...zs].reverse().find((z) => z < cur0 / 1.02) ?? zs[0]);
    if (next === cur0) return uxSfx('deny');
    uxSfx('lever', { step: Math.max(0, zs.indexOf(next)) });
    if (at) {
      const w = worldAt(at.cx, at.cy);
      V.zoom = next;
      pinTo(w, at.cx, at.cy);
    } else V.zoom = next;
    place();
  }
  let curBr: DeptId | null = null;
  function placeHeads() {
    const z = V.zoom;
    const cw = vp.clientWidth;
    const chh = vp.clientHeight;
    const sx = (x: number) => cw / 2 + (x - V.x) * UNIT * z;
    const sy = (y: number) => chh / 2 + (y - V.y) * UNIT * z;
    const far = z < 0.42;
    heads.classList.toggle('is-far', far);
    heads.style.top = `${insetT}px`;
    const yHead = Math.max(0, sy(K.HEAD_Y) - insetT - 24);
    const best = K.deptAtX(V.x);
    for (const { d, el: e } of headEls) {
      const L = K.DEPT_LAYOUT[d];
      const w = Math.max(far ? 44 : 72, (L.x1 - L.x0) * UNIT * z - 4);
      const cx = sx(L.cx);
      // 画面の端にかかる列は、見える所だけに縮める（はみ出さない）
      const l = Math.max(0, cx - w / 2);
      const r = Math.min(cw, cx + w / 2);
      const hide = r - l < 44;
      if (e.hidden !== hide) e.hidden = hide;
      if (hide) continue;
      e.style.width = `${Math.round(r - l)}px`;
      e.style.transform = `translate3d(${Math.round(l)}px, ${Math.round(yHead)}px, 0)`;
      e.classList.toggle('is-narrow', r - l < 104);
      if (best !== curBr) e.classList.toggle('is-cur', d === best);
    }
    curBr = best;
    for (const b of bands) {
      const y = sy(K.BANDS[b.tier].line);
      const hide = y < insetT + HEAD_PX - 4 || y > chh - insetB;
      if (b.lab.hidden !== hide) b.lab.hidden = hide;
      if (!hide) b.lab.style.transform = `translate3d(0, ${Math.round(y)}px, 0)`;
    }
  }
  /** 部門へ寄った：その部門のいちばん上のパネルが下半分にあれば、見出しのすぐ下まで送る。見出しを光らせる（1 回だけ） */
  function arriveDept(d: DeptId) {
    arriveOnce = null;
    const ys = K.SKILLS.filter((k) => K.deptOf(k) === d && K.POS.has(k.id)).map((k) => K.POS.get(k.id)!.y);
    if (ys.length && V.zoom > 0) {
      const top = arriveTop(ys);
      const sy = vp.clientHeight / 2 + (top - V.y) * UNIT * V.zoom;
      if (sy > vp.clientHeight * 0.55) V.y = top - (insetT + HEAD_PX + 72 - vp.clientHeight / 2) / (UNIT * V.zoom);
    }
    const h = headEls.find((x) => x.d === d);
    if (h && !isCalm()) {
      uxpReplay(h.el, 'is-arrive');
      uxSfx('lamp', { step: 4 });
    }
  }
  function place() {
    if (V.zoom === T.ALL) fitAll();
    if (V.zoom === T.RINGFIT) fitAll(ringFx?.tier);
    if (V.zoom < 0 || !V.zoom) firstView();
    if (arriveOnce && vp.clientHeight > 0) arriveDept(arriveOnce);
    if (liftOnce && !board.hidden) {
      liftOnce = false;
      V.y += insetB / 2 / (UNIT * V.zoom);
    }
    const c = px({ x: V.x, y: V.y });
    world.style.transform = `translate3d(${(vp.clientWidth / 2 - c.x * V.zoom).toFixed(1)}px, ${(vp.clientHeight / 2 - c.y * V.zoom).toFixed(1)}px, 0) scale(${V.zoom})`;
    const lw = Math.min(10, 3 / V.zoom).toFixed(2);
    const hs = Math.min(1.7, Math.max(1, 1 / V.zoom)).toFixed(3);
    if (world.dataset.lw !== lw) {
      world.dataset.lw = lw;
      // 線の太さは画面の上で 3px 前後に（引いて見たときは細くなりすぎないよう、木の上で 10px まで）
      world.style.setProperty('--lw', `${lw}px`);
      // 引いて見ても字が 12px より小さくならないように、札と角の印は縮んだぶん大きく（引きすぎたら角の印は出さない）
      world.style.setProperty('--hs', hs);
      world.classList.toggle('is-mid', V.zoom < 0.9);
      world.classList.toggle('is-far', V.zoom < 0.6);
    }
    placeHeads();
  }
  function placeZoom() {
    // 板が高くなっても、ズームのキーが隠れないように
    zoomUi.style.bottom = `${Math.max(phone ? 8 : 16, insetB + 8)}px`;
  }
  let flying = 0;
  /** カメラを動かす（k：0〜1 のなめらかな進み）。動きを減らすときは、すぐ着く */
  function fly(ms: number, step: (e: number) => void, done?: () => void) {
    const run = ++flying;
    if (isCalm()) {
      step(1);
      place();
      return done?.();
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      if (!alive || run !== flying) return;
      const k = Math.min(1, (now - t0) / ms);
      step(1 - Math.pow(1 - k, 3));
      place();
      if (k < 1) requestAnimationFrame(tick);
      else done?.();
    };
    requestAnimationFrame(tick);
  }
  /** そのパネルへカメラを寄せて選ぶ（「上げられる：N」・目標・探すから） */
  function flyTo(id: string) {
    const goTo = K.POS.get(id);
    if (!goTo || !nodes.has(id)) return;
    select(id);
    const a = { x: V.x, y: V.y, z: V.zoom };
    const z1 = Math.max(a.z, innerWidth < 600 ? 0.72 : 0.85);
    const lift = (vp.clientHeight * 0.12) / (UNIT * z1);
    uxSfx('zoom');
    fly(700, (e) => {
      V.x = a.x + (goTo.x - a.x) * e;
      V.y = a.y + (goTo.y + lift - a.y) * e;
      V.zoom = a.z + (z1 - a.z) * e;
    });
  }
  /** 先に要るパネルの札を押した：そのパネルへ寄って光らせる（選んでいるパネルは変えない） */
  function flashTo(id: string) {
    const goTo = K.POS.get(id);
    if (!goTo) return;
    const a = { x: V.x, y: V.y };
    const lift = (vp.clientHeight * 0.12) / (UNIT * V.zoom);
    fly(600, (e) => {
      V.x = a.x + (goTo.x - a.x) * e;
      V.y = a.y + (goTo.y + lift - a.y) * e;
    }, () => {
      const n = nodes.get(id)?.el;
      if (!n) return;
      replay(n, 'is-flash');
      uxSfx('lamp', { step: 4 });
      later(1800, () => n.classList.remove('is-flash'));
    });
  }
  // 引っぱって動かす・2 本指でつまんで拡大縮小（スマホ）・ホイールで拡大（PC）
  const pts = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; vx: number; vy: number } | null = null;
  let pinch: { d0: number; z0: number; wx: number; wy: number } | null = null;
  let moved = false;
  let vr: DOMRect | null = null;
  const worldAt = (cx: number, cy: number, zoom = V.zoom) => {
    const r = vr ?? vp.getBoundingClientRect();
    return { x: V.x + (cx - r.left - r.width / 2) / (UNIT * zoom), y: V.y + (cy - r.top - r.height / 2) / (UNIT * zoom) };
  };
  const pinTo = (w: { x: number; y: number }, cx: number, cy: number) => {
    const r = vr ?? vp.getBoundingClientRect();
    V.x = w.x - (cx - r.left - r.width / 2) / (UNIT * V.zoom);
    V.y = w.y - (cy - r.top - r.height / 2) / (UNIT * V.zoom);
  };
  const mid = () => {
    const [a, b] = [...pts.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  vp.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    vr = vp.getBoundingClientRect();
    flying++;
    if (pts.size === 2) {
      const m = mid();
      const w = worldAt(m.x, m.y);
      pinch = { d0: Math.max(10, m.d), z0: V.zoom, wx: w.x, wy: w.y };
      drag = null;
      moved = true;
      card.hidden = true;
    } else if (pts.size === 1) {
      drag = { x: e.clientX, y: e.clientY, vx: V.x, vy: V.y };
      moved = false;
    }
  });
  vp.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const m = mid();
      V.zoom = Math.max(ZMIN, Math.min(ZMAX, (pinch.z0 * m.d) / pinch.d0));
      pinTo({ x: pinch.wx, y: pinch.wy }, m.x, m.y);
      place();
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) {
      moved = true;
      card.hidden = true;
    }
    if (!moved) return;
    V.x = drag.vx - dx / (UNIT * V.zoom);
    V.y = drag.vy - dy / (UNIT * V.zoom);
    place();
  });
  const end = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    // 2 本指のあと 1 本だけ残ったら、その指で引っぱり直す
    const rest = [...pts.values()][0];
    drag = rest ? { x: rest.x, y: rest.y, vx: V.x, vy: V.y } : null;
    if (!pts.size) setTimeout(() => (moved = false), 0);
  };
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', end);
  // ホイールは 1 段ずつ（続けて回したときは 0.12 秒に 1 段）
  let wheelAt = 0;
  vp.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now - wheelAt < 120) return;
      wheelAt = now;
      vr = vp.getBoundingClientRect();
      stepZoom(e.deltaY < 0 ? 1 : -1, { cx: e.clientX, cy: e.clientY });
    },
    { passive: false },
  );
  const onResize = () => {
    if (!alive) return;
    measure();
    place();
    placeZoom();
  };
  addEventListener('resize', onResize);

  // ---------------------------------------------------------------- はじめの 1 回
  sync();
  requestAnimationFrame(() => {
    if (!alive) return;
    measure();
    place();
    placeZoom();
  });
  // 開いたとき：数字の計器が点く（止まらない画面）
  if (!isCalm() && !sealed) replay(top, 'is-boot');

  // ---- またたきの時計：ランプのまたたきと上向きの矢印を、1 つの時計でそろえて動かす（パネルごとの CSS の動きにしない：開いたままの重さ）
  offs.push(blinkClock(world));

  return {
    body,
    key,
    sync,
    drop() {
      alive = false;
      for (const f of offs) f();
      stopOff?.();
      removeEventListener('resize', onResize);
    },
  };
}
