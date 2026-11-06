/**
 * 発掘画面と研究ノート（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の「15 秒の発掘」「発掘場の画面」「研究ノート」）。
 *
 * - 地図の荒れ地をタップ → 吹き出しの「⛏ 発掘する（15 秒）」で、**画面全体が発掘画面** になる（発掘作業）。
 *   町の描画は止める（main.ts。ゲームの計算はふだんどおり進む）。作業の始めと終わりは 0.3 秒の暗転。
 *   **発掘作業のあいだは時間を止めない**（憲章 1-2 の例外）。シート（screens.ts の open）ではなく、全部を覆う画面。
 * - 正面の壁（横 7 × 縦 9）：マスを叩くと手前の層から 1 枚ずつはがれる（どのマスも最初から叩ける。奥ほど硬い）。
 *   埋まっているものは、ひびの隙間から少しずつ見える（覗き見）。2 × 2 の大きいもの（Epic 以上）は 4 マスとも掘ると取れる。
 * - 段 DIG3：なぞって掘る。PC はカーソルを当てたマスを自動で打ち続け、スマホは指でなぞった所を掘る（回数の制限は無い。打てるのは作業のあいだだけ）。
 * - 時間切れか「発掘を終える」で、画面の中に「発掘終了」の札（今回の出土）。月をまたいでいたら、そのあと main.ts がまとめ報告を出す。
 * - 出土の演出は 1 つだけ大きく（憲章 3）：はがれたら小さく砕ける粒、エクステは画面の中央に大きく出て研究ノートのボタンへ吸い込まれる、
 *   お題と大きな遺物（2 × 2）は画面全体。石板は読み物の小さな窓。
 * 表示の計算は digview.ts（純粋な関数）。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { icon } from '../../ui/dom';
import { PRODUCT, TABLET, type Mat, type Tier } from './data';
import { RARITY_JA } from '../../game/catalog';
import { blastSize, bombPower, bombsLeft, dig, digRepeatMs, digSite, drill, drillLen, DRILL_FUEL, extName, extRank, extRarity, hasDrill, layersOf, epicRelicsOpen, rareRelicsOpen, reachCells, sessionSec, type DigErr, type DigFound, type DigHit, type DigItem, type DigLayout, type RunEnd } from './model';
import { bulletEl } from './chartkit';
import { DEEP_LOCK, DUNGEON_TAB, EPIC_VALUE_TEXT, RARE_RELIC_NOTE, seriesTag, aimStep, anyPeek, biggestFx, cellOf, cellView, crewInfo, digBlock, digErrText, digRec, digSpec, digSpecText, digStatus, dungeonNotes, findLabel, fxOf, gotLines, lockedLayer, nextLvText, noteEntries, noteTablets, noteTabs, noteTotals, relicLine, runBar, stars, type Aim, type CellView } from './digview';
import { AGAIN_TIP, DEEP_TIP, MEET_WALL, PEEK_TIP } from './digmeet';
import { polSync, tabletKnow } from './policy';
import { FX_PAL, FX_RARITY, fxAtEl, playFx } from '../fx/layer';
import { open, refreshSheet, sheetOpen, type Ctx } from './screens';
import { btn, extImage, h, heroIcon, matIcon, money, rich } from './ui';

/** 発掘画面からほかの画面へ（main.ts が渡す） */
export interface DigHooks {
  /** 「発掘を終える」を押した（main.ts が endRun と発掘終了の札・まとめ報告を出す） */
  end: () => void;
  /** 閉じた（町の描画と地図の UI を戻す） */
  closed: () => void;
  /** 打った（掘りきった・発掘との出会い） */
  hit?: (hits: DigHit[]) => void;
  /** 「発掘を終える」を出さない（発掘との出会いの最初の 1 回は、時間切れの「発掘終了」を見せる） */
  noEnd?: () => boolean;
  /** 復刻品を工房で作る（発掘終了の札の「工房で作る」。市場データの「工房で作る」と同じ動き） */
  make?: (key: string) => void;
  /** スキルツリーのそのパネルへ（発掘終了の札の「次の強化のおすすめ」・作業の外で「🔒 深い層の許可が要る」を押した） */
  skill?: (id: string) => void;
  /** 「深い層の許可が要る」マスを初めて押した（マインちゃんの一言を出したら true を返す。main.ts が flags に記録） */
  deepTip?: () => boolean;
  /** 初めてひびの隙間から何か見えた（マインちゃんの一言を出したら true を返す。main.ts が flags に記録） */
  peekTip?: () => boolean;
  /** 発掘との出会いの最初の作業（壁の掘り方の一言を出す） */
  meetFirst?: () => boolean;
  /** 再発掘（ランクアップの災害のあと）で初めて RP が入った（マインちゃんの一言を出したら true。main.ts が flags に記録） */
  againTip?: () => boolean;
}

/** ランク → カタログのレアリティ */
const TIER_RARITY = { C: 'Common', U: 'Uncommon', R: 'Rare', E: 'Epic', L: 'Legendary' } as const;
/** エクステの絵（MCH の 64×64。整数倍か半分で） */
export function extIcon(id: number, size = 64): HTMLElement {
  const e = icon(extImage(id), 'px isl-ext');
  e.style.width = `${size}px`;
  e.style.height = `${size}px`;
  return e;
}
/** 石板の仮の絵（CSS で描いた石の板。docs/ISLAND_ART_TODO.md） */
export function tabletIcon(size = 32): HTMLElement {
  const e = h('i', 'isl-tablet');
  e.style.setProperty('--sz', `${size}px`);
  return e;
}
function itemIcon(it: DigItem, size: number): HTMLElement {
  if (it.kind === 'ext') return extIcon(it.id, size);
  if (it.kind === 'mat') return matIcon(it.mat as Mat, size);
  return tabletIcon(size);
}

// ---------------------------------------------------------------- ひび（仮。コードで描く割れ目。docs/ISLAND_ART_TODO.md）

/** 割れ目の形（48 × 48 の中の 3 本。1 本目がいちばん大きい）。マスごとに 4 つの形から選ぶ */
const CRACKS: string[][] = [
  ['M6 3 L17 15 L14 25 L24 33 L21 45', 'M41 5 L32 17 L37 26', 'M45 31 L34 35 L30 42'],
  ['M25 2 L22 14 L31 22 L26 32 L33 46', 'M3 19 L14 24 L22 22', 'M36 29 L46 24'],
  ['M2 10 L14 14 L21 26 L34 30 L46 40', 'M30 3 L28 14 L37 18', 'M9 41 L18 34 L25 37'],
  ['M45 4 L34 14 L36 24 L26 30 L20 45', 'M4 6 L12 17 L20 18', 'M7 32 L18 30 L22 39'],
];
const crackOfCell = (x: number, y: number) => CRACKS[(x * 7 + y * 3) % CRACKS.length];
/** 見える割合 → 割れ目の幅（48 の中で。12% は髪の毛ほど・40% で細く・90% でほぼ全部） */
const maskWidth = (frac: number) => Math.round((1 + frac * frac * 36) * 10) / 10;
/** 割れ目のマスク（白い線。この線の中だけアイコンが見える） */
function maskUrl(paths: string[], w: number): string {
  const d = paths.join(' ');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><path d='${d}' fill='none' stroke='white' stroke-width='${w}' stroke-linecap='round' stroke-linejoin='round'/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}
const SVGNS = 'http://www.w3.org/2000/svg';
/** マスの面の割れ目（暗い線）：n 本・幅 w */
function crackSvg(paths: string[], n: number, w: number): SVGSVGElement {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('class', 'isl-dig-crk');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths.slice(0, n)) {
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke-width', String(w));
    svg.append(path);
  }
  return svg;
}

// ---------------------------------------------------------------- 発掘画面（全画面）

interface Panel {
  ctx: Ctx;
  hooks: DigHooks;
  el: HTMLElement;
  title: HTMLElement;
  endBtn: HTMLButtonElement;
  timer: HTMLElement;
  fill: HTMLElement;
  sec: HTMLElement;
  info: HTMLElement;
  spec: HTMLElement;
  tools: HTMLElement;
  why: HTMLElement;
  wallBox: HTMLElement;
  wall: HTMLElement;
  legend: HTMLElement;
  notes: HTMLButtonElement;
  cells: HTMLButtonElement[];
  /** マス 1 つの大きさ（px） */
  cs: number;
  sector: string;
  site: number;
  /** いま描いている壁（ダンジョンは入るたびに作り直すので、壁そのもので見分ける） */
  lay: DigLayout | null;
  /** 次に押したマスで掘削ドリル（奥へ） */
  drillArm: boolean;
  /** この作業で「深い層の許可が要る」マスを押した（終わりの札のおすすめを深い層の許可に） */
  deepHit: boolean;
  /** 直前の「打てない理由」・お知らせ（数秒だけ出す） */
  err: { text: string; until: number; good?: boolean } | null;
  /** 残り 3 秒の音を鳴らした秒 */
  ticked: number;
  /** 発掘終了の札を出している */
  over: boolean;
  resize: () => void;
  /** なぞって掘る（段 DIG3）：カーソル・指の下のマス／打っている所と次に打つ時刻／打てなかったマス（同じマスを打ち続けない） */
  hover: [number, number] | null;
  aim: Aim | null;
  dead: string | null;
  raf: number;
  /** 打っているマスの上のツルハシ（仮の絵：絵文字。docs/ISLAND_ART_TODO.md）と、効く範囲の点線の枠 */
  pick: HTMLElement;
  reach: HTMLElement;
  /** 段 DIG3：発掘隊の隊員（壁の上を歩いて打つ。仮の絵：replica のヒーロー ＋ 絵文字のツルハシ。docs/ISLAND_ART_TODO.md） */
  crew: HTMLElement;
  /** 段 DIG3：「終える」を 1 回押した（この時刻まで、もう 1 回押すと終える） */
  confirmUntil: number;
}
let P: Panel | null = null;
let saveTimer = 0;

export const digOpen = () => !!P;

/** 発掘画面を閉じる（0.3 秒で暗転して町へ。町の描画は main.ts が戻す） */
export function closeDig() {
  if (!P) return;
  const p = P;
  const hooks = p.hooks;
  flushSave();
  stopAim(p);
  cancelAnimationFrame(p.raf);
  removeEventListener('resize', p.resize);
  document.querySelector('.isl-dig-big')?.remove();
  P = null;
  p.el.classList.add('is-out');
  p.el.style.pointerEvents = 'none';
  window.setTimeout(() => p.el.remove(), 300);
  hooks.closed();
}

function flushSave() {
  if (!saveTimer || !P) return;
  clearTimeout(saveTimer);
  saveTimer = 0;
  P.ctx.save();
}
/** 打つたびに保存すると重いので、少しまとめる */
function soonSave() {
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    P?.ctx.save();
  }, 800);
}

/** 発掘画面を開く（発掘作業のあいだだけ。s.digRun の荒れ地の壁）。note：最初に出すひとこと */
export function openDig(ctx: Ctx, hooks: DigHooks, note?: string) {
  const s = ctx.s();
  if (!digSite(s) || !s.dig) {
    ctx.toast(digErrText('no-site'));
    return;
  }
  let fresh = true;
  if (P) {
    fresh = false;
    const old = P;
    P = null;
    cancelAnimationFrame(old.raf);
    removeEventListener('resize', old.resize);
    old.el.remove();
  }
  const el = h('section', `isl-dig ${fresh ? 'is-in' : ''}`);
  el.setAttribute('aria-label', t('発掘作業', 'Digging'));
  // 地図のドラッグ・タップに渡さない
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  // 1. 上の帯：荒れ地の名前・残り時間のバー・「発掘を終える」
  const top = h('div', 'isl-dig-top');
  const head = h('div', 'isl-dig-head');
  const title = h('h2', '');
  // 段 DIG3：閉じる（終える）は右上の 1 か所。作業中は 2 回押し（1 回目「本当に終える？」。2.5 秒で戻る）
  const endBtn = btn(t('✕ 終える', '✕ Stop'), () => {
    const p = P;
    if (!p) return;
    if (p.over) return closeDig();
    if (p.confirmUntil > performance.now()) {
      p.confirmUntil = 0;
      hooks.end();
      return;
    }
    p.confirmUntil = performance.now() + 2500;
    p.ctx.sfx?.('tap');
    refreshDig();
    window.setTimeout(() => P === p && refreshDig(), 2600);
  }, 'isl-dig-end');
  head.append(title, endBtn);
  const timer = h('div', 'isl-dig-timer');
  const fill = h('i', 'isl-dig-timer-fill');
  const sec = h('b', 'isl-dig-timer-sec');
  timer.append(fill, h('span', 'isl-dig-timer-k', t('⏱ 残り', '⏱ Left')), sec);
  const spec = h('div', 'isl-dig-spec');
  top.append(head, timer, spec);
  // 2. 小さな帯：日付・今月の売上・RP・今回の出土・掘った割合・お題
  const info = h('div', 'isl-dig-info');
  // 3. 壁
  const wallBox = h('div', 'isl-dig-wallbox');
  const wall = h('div', 'isl-dig-wall');
  const legend = h('div', 'isl-dig-legend');
  wallBox.append(wall);
  // なぞって掘る（段 DIG3）：効く範囲の点線の枠と、打っているマスのツルハシ（壁の上に重ねる。押せない）
  const reach = h('div', 'isl-dig-reach');
  const pick = h('i', 'isl-dig-pick', '⛏');
  const crew = h('div', 'isl-dig-crew');
  bindWall(wall);
  // 4. 下の帯：ひとこと・道具・発掘隊・研究ノート
  const foot = h('div', 'isl-dig-foot');
  const why = h('p', 'isl-dig-why');
  const tools = h('div', 'isl-dig-tools');
  const notes = btn(t('📖 研究ノート', '📖 Notebook'), () => openNotes(ctx, { fromDig: hooks }), 'isl-dig-notes');
  foot.append(legend, why, tools);
  el.append(top, info, wallBox, foot);
  ctx.root.append(el);
  const resize = () => fitWall();
  P = { ctx, hooks, el, title, endBtn, timer, fill, sec, info, spec, tools, why, wallBox, wall, legend, notes, cells: [], cs: 40, sector: s.dig.sector, site: s.dig.cur, lay: null, drillArm: false, deepHit: false, err: note ? { text: note, until: performance.now() + 3500, good: true } : null, ticked: 99, over: false, resize, hover: null, aim: null, dead: null, raf: 0, pick, reach, crew, confirmUntil: 0 };
  addEventListener('resize', resize);
  buildWall();
  P.raf = requestAnimationFrame(aimLoop);
  refreshDig();
  refreshTimer();
  fitWall();
  requestAnimationFrame(() => fitWall());
  // 上の帯・吹き出し・「次の月へ」の位置を合わせる
  ctx.refresh();
  // 発掘との出会いの最初の作業：壁の掘り方（作業を止めない小さな吹き出し）
  if (hooks.meetFirst?.()) mineSay(MEET_WALL(), 9000);
}

/** 発掘画面の外枠（main.ts が「次の月へ」の位置に使う） */
export const digRect = () => P?.el.getBoundingClientRect() ?? null;

/** 壁のマスの大きさを、画面の幅・高さいっぱいの正方形に合わせる */
function fitWall() {
  const p = P;
  if (!p) return;
  const L = digSite(p.ctx.s());
  if (!L) return;
  // （開くときの拡大の動きに左右されないように、変形の前の大きさで）
  const r = { width: p.wallBox.clientWidth, height: p.wallBox.clientHeight };
  // 箱の余白（6 × 2）と壁のふち（6 × 2）・マスの間（3）を除いた、いっぱいの正方形
  const gap = 3;
  const pad = 26;
  const cs = Math.max(24, Math.floor(Math.min((r.width - pad - gap * (L.w - 1)) / L.w, (r.height - pad - gap * (L.h - 1)) / L.h)));
  if (cs === p.cs && p.wall.style.getPropertyValue('--cs')) return;
  p.cs = cs;
  p.wall.style.setProperty('--cs', `${cs}px`);
  // 覗き見のアイコンの大きさが変わるので描き直す
  for (const c of p.cells) delete c.dataset.k;
  paintCells();
  paintCrew();
  paintAim();
}

function buildWall() {
  const p = P!;
  const s = p.ctx.s();
  const L = digSite(s)!;
  p.lay = L;
  p.el.classList.toggle('is-dungeon', !!L.dungeon);
  p.wall.replaceChildren();
  p.wall.style.setProperty('--w', String(L.w));
  p.wall.style.setProperty('--h', String(L.h));
  p.wall.style.setProperty('--hole', layersOf(L)[L.depth - 1].color);
  p.cells = [];
  for (let y = 0; y < L.h; y++)
    for (let x = 0; x < L.w; x++) {
      const b = h('button', 'isl-dig-cell');
      b.type = 'button';
      b.dataset.x = String(x);
      b.dataset.y = String(y);
      // キーボード（Enter・Space）：1 打。マウス・指は壁ごと（bindWall）
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.detail === 0) strike(x, y);
      });
      p.cells.push(b);
      p.wall.append(b);
    }
  p.wall.append(p.reach, p.crew, p.pick);
  p.crew.replaceChildren();
  stopAim(p);
}

// ---------------------------------------------------------------- 発掘隊（段 DIG3：シャドーヒーロー。壁の上を歩いて打つ）

/** 隊員が最後に打ったマス（隊員の番号 → マス。画面を閉じても覚えておく） */
const crewAt = new Map<number, [number, number]>();
/** 1 日ごと（main.ts）：発掘隊が打った結果。隊員をそのマスへ動かして振る */
export function noteCrewHits(hits: DigHit[]) {
  const p = P;
  let moved = false;
  for (const x of hits) {
    if (x.crew == null || x.splash || x.blast || x.pierce) continue;
    crewAt.set(x.crew, [x.x, x.y]);
    moved = true;
    if (!p || p.over) continue;
    const c = cellAt(x.x, x.y);
    if (c) dust(c, x.broke ? 6 : 3, x.broke);
    const man = p.crew.children[x.crew] as HTMLElement | undefined;
    if (man) {
      man.classList.remove('is-swing');
      void man.offsetWidth;
      man.classList.add('is-swing');
    }
  }
  if (moved && p) paintCrew();
}
/** 隊員を描く（人数ぶん。最後に打ったマスの足もとへ。まだなら下の段に並ぶ） */
function paintCrew() {
  const p = P;
  if (!p) return;
  const s = p.ctx.s();
  const L = digSite(s);
  if (!L) return;
  const cw = crewInfo(s);
  while (p.crew.children.length > cw.n) p.crew.lastElementChild?.remove();
  while (p.crew.children.length < cw.n) {
    const n = p.crew.children.length;
    const man = h('span', 'isl-dig-crewman');
    man.append(heroIcon(cw.heroes[n] ?? cw.heroes[0], 32), h('i', 'isl-dig-crewpick', '⛏'));
    man.title = t(`発掘隊 ${n + 1}`, `Crew ${n + 1}`);
    p.crew.append(man);
  }
  for (let n = 0; n < cw.n; n++) {
    const man = p.crew.children[n] as HTMLElement;
    const at = crewAt.get(n) ?? [Math.min(L.w - 1, 1 + n * 2) % L.w, L.h - 1];
    const c = cellAt(at[0], at[1]);
    if (!c) continue;
    man.style.left = `${c.offsetLeft + c.offsetWidth / 2}px`;
    man.style.top = `${c.offsetTop + c.offsetHeight}px`;
  }
  p.crew.classList.toggle('is-idle', !s.digRun || p.over);
}

/** 層の並び（手前 → 奥。掘れない層は 🔒。押すと「深い層の許可が要る」） */
function paintLegend() {
  const p = P!;
  const s = p.ctx.s();
  const L = digSite(s)!;
  const lock = lockedLayer(s);
  const key = `${L.tier}|${L.dungeon ? 'd' : 'w'}|${lock}`;
  if (p.legend.dataset.k === key) return;
  p.legend.dataset.k = key;
  p.legend.replaceChildren(h('small', 'isl-dim', t('手前', 'Front')));
  layersOf(L).forEach((st, n) => {
    const locked = lock != null && n >= lock;
    const c = h(locked ? 'button' : 'span', `isl-dig-lay ${locked ? 'is-locked' : ''}`);
    c.style.setProperty('--lc', st.color);
    c.append(h('i'), document.createTextNode(`${locked ? '🔒' : ''}${st.name}`));
    if (locked && c instanceof HTMLButtonElement) {
      c.type = 'button';
      c.title = DEEP_LOCK();
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        deepPressed();
      });
    }
    if (n > 0) p.legend.append(h('small', 'isl-dim', '›'));
    p.legend.append(c);
  });
  p.legend.append(h('small', 'isl-dim', t('奥', 'Back')));
}

/** 毎フレーム（main.ts）：残り時間のバー。残り 5 秒で赤く点滅、残り 3 秒から 1 秒ごとに音 */
export function refreshTimer() {
  const p = P;
  if (!p) return;
  const s = p.ctx.s();
  const rb = runBar(s);
  p.timer.hidden = !rb && !p.over;
  if (!rb) {
    p.fill.style.width = '0%';
    p.sec.textContent = t('0.0 秒', '0.0 s');
    p.timer.classList.remove('is-warn');
    return;
  }
  p.fill.style.width = `${(rb.frac * 100).toFixed(1)}%`;
  const txt = t(`${rb.sec} 秒`, `${rb.sec} s`);
  if (p.sec.textContent !== txt) p.sec.textContent = txt;
  p.timer.classList.toggle('is-warn', rb.warn);
  const whole = Math.ceil(Number(rb.sec));
  if (rb.tick && whole < p.ticked && whole > 0) {
    p.ticked = whole;
    p.ctx.sfx?.('tap');
  }
}

/** 1 日ごと・打つたびに：帯・道具・壁を描き直す（画面を作り直さない） */
export function refreshDig() {
  const p = P;
  if (!p) return;
  const s = p.ctx.s();
  if (!s.dig || !digSite(s)) return closeDig();
  if (s.dig.sector !== p.sector || s.dig.cur !== p.site || digSite(s) !== p.lay) {
    p.sector = s.dig.sector;
    p.site = s.dig.cur;
    buildWall();
    fitWall();
  }
  // 上の帯の小さな 1 行：作業時間・1 打の強さ・掘れる層・研究 Lv の上限
  const sp = digSpec(s);
  p.spec.replaceChildren(...(sp ? digSpecText(sp).map((x) => h('b', '', x)) : []));
  const st = digStatus(s)!;
  p.title.textContent = t(`⛏ ${st.name}`, `⛏ ${st.name}`);
  // 「終える」：作業のあいだ（出会いの最初の 1 回は出さない）。1 回押すと「本当に終える？」、札を出したあとは ✕（町に戻る）
  const arming = !p.over && p.confirmUntil > performance.now();
  p.endBtn.textContent = p.over ? t('✕ 町に戻る', '✕ Back to town') : arming ? t('本当に終える？', 'Really stop?') : t('✕ 終える', '✕ Stop');
  p.endBtn.classList.toggle('is-arm', arming);
  p.endBtn.hidden = !p.over && !!p.hooks.noEnd?.();
  p.endBtn.setAttribute('aria-label', p.over ? t('町に戻る', 'Back to town') : t('発掘を終える', 'Stop digging'));
  // 小さな帯：日付（時間が流れている）・今月の売上・RP・今回の出土・掘った割合・お題（SCM の詰まりは、作業のあいだは出さない：発掘に集中）
  p.info.replaceChildren();
  const chip = (cls: string, k: string, v: string) => {
    const c = h('span', `isl-dig-chip ${cls}`);
    if (k) c.append(h('small', '', k));
    c.append(h('b', '', v));
    p.info.append(c);
    return c;
  };
  chip('is-date', '📅', st.date);
  chip('is-sales', t('売上', 'Sales'), money(st.sales));
  // 段 UX1（C-4）：帯の「研」は累計、終了の札の「研究ポイント +N」は今回。同じ言葉で混ざっていたので、帯に今回の増えも添える
  chip('is-rp', t('研', 'RP'), s.digRun ? t(`${st.rp}（今回 +${st.rpNow}）`, `${st.rp} (+${st.rpNow} now)`) : `${st.rp}`);
  chip('is-got', t('出土', 'Finds'), t(`新 ${st.found}・Lv↑ ${st.lvUp}`, `New ${st.found} · Lv↑ ${st.lvUp}`));
  // 段 DIG3：埋まっている爆弾（残りの数・威力（はがす層）・範囲）。掘り出すと減る
  const bombs = bombsLeft(s, s.dig.cur).length;
  const bc = chip(`is-bomb ${bombs ? '' : 'is-none'}`, '💣', `${bombs}`);
  bc.append(h('small', '', t(`威力 ${bombPower(s)}・${blastSize(s)}×${blastSize(s)}`, `pow ${bombPower(s)} · ${blastSize(s)}×${blastSize(s)}`)));
  bc.title = t(`地中に埋まっている爆弾：あと ${bombs} 個。掘り出すと爆発して、まわり ${blastSize(s)} × ${blastSize(s)} の層を ${bombPower(s)} 枚一度にはがす（費用なし。スキル → 発掘の「発破」で増える）`, `Bombs still buried: ${bombs}. Dig one up and it blasts ${bombPower(s)} layer(s) off the ${blastSize(s)} × ${blastSize(s)} around it (free; more with Skills → Digging: Blasting)`);
  if (st.dungeon) {
    // ダンジョン：この作業でいちばん深くはがした層と最深記録・掘れる層（深い層の許可）
    const dg = st.dungeon;
    chip(`is-deep ${dg.deep > 0 && dg.deep >= dg.best ? 'is-done' : ''}`, t('最深', 'Deepest'), t(`${dg.deep} 層（記録 ${dg.best}）`, `${dg.deep} (best ${dg.best})`));
    chip(dg.limit < dg.all ? 'is-lock' : '', t('掘れる', 'Can dig'), t(`${dg.limit} / ${dg.all} 層`, `${dg.limit} / ${dg.all}`));
  } else {
    chip('', t('掘った', 'Dug'), s.digRun ? t(`${st.pct}%（今回 ${st.cellsNow} マス）`, `${st.pct}% (${st.cellsNow} cells now)`) : `${st.pct}%`);
    chip(st.topics[0] >= st.topics[1] ? 'is-done' : '', t('お題', 'Targets'), `${st.topics[0]} / ${st.topics[1]}`);
  }
  // 道具：発破・掘削ドリル（スキル → 発掘で開いていれば）・発掘隊・研究ノート
  p.tools.replaceChildren();
  if (hasDrill(s)) {
    const n = drillLen(s);
    const b = btn(p.drillArm ? t('🔩 ドリル：マスを押す（やめる）', '🔩 Drill: tap a cell (cancel)') : t(`🔩 ドリル 奥へ ${n}（${money(DRILL_FUEL)}）`, `🔩 Drill ${n} deep (${money(DRILL_FUEL)})`), () => {
      p.drillArm = !p.drillArm;
      p.ctx.sfx?.('tap');
      refreshDig();
    }, `isl-dig-drill ${p.drillArm ? 'is-on' : ''}`);
    b.title = t(`燃料代で、押したマス 1 つを奥へ ${n} 層一気にはがす`, `Pay for fuel to peel ${n} layers off one cell`);
    if (s.money < DRILL_FUEL) {
      b.disabled = true;
      b.title = digErrText('money', DRILL_FUEL);
    }
    p.tools.append(b);
  }
  // 段 DIG3：発掘隊はシャドーヒーロー（研究パネル「発掘隊の手際」の Lv で人数・威力・行動規則）。押すとそのパネルへ
  const cw = crewInfo(s);
  const who = h('button', `isl-dig-auto ${cw.n ? '' : 'is-empty'}`);
  who.type = 'button';
  if (cw.n) {
    for (const id of cw.heroes.slice(0, 2)) who.append(heroIcon(id, 28));
    who.append(h('span', '', t(`発掘隊 ${cw.n} 人・1 打 ${cw.power}・${cw.ruleText}`, `Crew ${cw.n} · power ${cw.power} · ${cw.ruleText}`)));
  } else who.append(h('span', '', t('発掘隊（スキル → 発掘の「発掘隊の手際」）', 'Dig crew (Skills → Digging: Skilled crew)')));
  who.title = t('発掘隊（名前のない隊員）が、作業のあいだ 1 人につき 1 日 3 打ぶん手伝う。スキル → 発掘の「発掘隊の手際」で人数・威力・行動規則', 'The crew (nameless diggers) helps 3 strikes a day each while you dig. Skills → Digging: Skilled crew sets size, power and behaviour');
  who.addEventListener('click', (e) => {
    e.stopPropagation();
    const go = p.hooks.skill;
    if (!go) return;
    closeDig();
    go('dig_crew');
  });
  p.tools.append(who, p.notes);
  paintCrew();
  // ひとこと：打てない理由（画面全体：作業が終わった など）・直前に押したマスの理由（数秒だけ）・道具の使い方・掘り方
  const block = p.over ? null : digBlock(s);
  const now = performance.now();
  const live = p.err && p.err.until > now;
  const msg = live
    ? p.err!.text
    : block
      ? digErrText(block)
      : p.drillArm
        ? t(`ドリル：マスを押すと、そのマスが奥へ ${drillLen(s)} 層はがれる`, `Drill: tap a cell to peel ${drillLen(s)} layers off it`)
        : t('マスにカーソルを当てる・指でなぞると掘れる（手前の層から 1 枚ずつ）', 'Hover a cell or drag your finger to dig (one layer at a time)');
  p.why.textContent = msg;
  p.why.className = `isl-dig-why ${live && p.err!.good ? 'is-warn' : live || block ? 'is-bad' : ''}`;
  p.el.classList.toggle('is-drill', p.drillArm);
  paintLegend();
  paintCells();
  // 初めてひびの隙間から何か見えた：マインちゃんの小さな一言（1 回だけ・作業は止めない）
  if (!p.over && s.digRun && !p.el.querySelector('.isl-dig-mine') && anyPeek(s) && p.hooks.peekTip?.()) mineSay(PEEK_TIP(), 6000);
}

/** 発掘画面の中のマインちゃんの小さな吹き出し（作業を止めない。OK か時間で消える） */
function mineSay(text: string, ms: number) {
  const p = P;
  if (!p) return;
  p.el.querySelector('.isl-dig-mine')?.remove();
  const w = h('div', 'isl-dig-mine');
  const mi = h('img');
  mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
  mi.alt = '';
  const txt = h('p');
  txt.append(rich(text));
  w.append(mi, txt, btn('OK', () => w.remove(), 'is-on'));
  p.el.append(w);
  window.setTimeout(() => w.isConnected && w.remove(), ms);
}

/**
 * 発掘終了の札（今回の出土）を 1.2 秒。月をまたいでいたら then（まとめ報告）へ。
 * またいでいなければ「⛏ もう一度（15 秒）」「町に戻る」（6 秒たったら町に戻る）
 */
export function showEndCard(end: RunEnd, o: { then?: () => void; again?: () => void; after?: () => void }) {
  const p = P;
  if (!p) {
    o.then?.();
    o.after?.();
    return;
  }
  p.over = true;
  stopAim(p);
  p.drillArm = false;
  p.el.querySelector('.isl-dig-mine')?.remove();
  p.el.querySelector('.isl-dig-endcard')?.remove();
  const card = h('div', 'isl-dig-endcard');
  const box = h('div', 'isl-dig-endbox');
  box.append(h('b', 'isl-dig-endtitle', t('⛏ 発掘終了', '⛏ Dig over')), h('small', 'isl-dim', t('今回の出土', 'This dig')));
  const g = h('div', 'isl-dig-endgrid');
  for (const [k, v] of gotLines(end.got)) {
    const c = h('span', 'isl-dig-endstat');
    c.append(h('small', '', k), h('b', '', v));
    g.append(c);
  }
  box.append(g);
  // 段 DIG3：見つけた出土品の札（見つけた順。発掘中の演出をここにまとめる：お題・大きな遺物は大きく、石板は読める）
  const finds = end.got.finds ?? [];
  if (finds.length) box.append(foundCards(finds, end.got.bombs ?? 0));
  else if (end.got.bombs) box.append(h('p', 'isl-dim', t(`💣 爆弾 ${end.got.bombs} 個を掘り出した`, `💣 Set off ${end.got.bombs} bomb(s)`)));
  // ダンジョン：最深記録（初めての層に届いたら「新記録！」）
  if (end.isDungeon) {
    const rec = h('p', `isl-dig-deeprec ${end.record ? 'is-new' : ''}`);
    rec.append(h('b', '', t(`最深 ${end.deep ?? 0} 層`, `Deepest: layer ${end.deep ?? 0}`)));
    if (end.record) rec.append(h('span', 'isl-dig-newrec', t('新記録！', 'New record!')));
    box.append(rec);
  }
  if (end.found != null) box.append(h('p', 'isl-gold', t('この荒れ地は掘りきった！ 底から古い石の階段が…ダンジョンの入り口が見つかった！', 'This wasteland is fully dug! Old stone stairs at the bottom… a dungeon entrance!')));
  else if (end.revived) box.append(h('p', 'isl-gold', t(`この荒れ地は掘りきった！ 町に戻ると復興するよ（家 +${end.revived.homes}）`, `This wasteland is fully dug! It will be revived back in town (homes +${end.revived.homes})`)));
  else if (end.done) box.append(h('p', 'isl-gold', t('この荒れ地は掘りきった！', 'This wasteland is fully dug!')));
  // 新しいレシピ（復刻品）：エクステの絵 64px と「工房で作る」
  const recipes = end.got.recipes ?? [];
  if (recipes.length) box.append(recipeCards(recipes, (key) => p.hooks.make?.(key)));
  // 次の強化のおすすめ（いちばん安い発掘のパネルの次の Lv。「深い層の許可が要る」マスを押した作業のあとは、深い層の許可）
  const rec = digRec(p.ctx.s(), p.deepHit ? 'dig_deep' : undefined);
  if (rec && p.hooks.skill) {
    const rb = btn('', () => {
      const go = p.hooks.skill;
      closeDig();
      go?.(rec.id);
    }, 'isl-dig-rec');
    rb.replaceChildren(h('small', '', t('次の強化のおすすめ（スキル → 発掘）', 'Next upgrade (Skills → Digging)')), document.createTextNode(`▶ ${rec.text}`));
    box.append(rb);
  }
  const acts = h('div', 'isl-row isl-dig-endacts');
  box.append(acts);
  card.append(box);
  p.el.append(card);
  p.ctx.sfx?.('check');
  refreshDig();
  refreshTimer();
  window.setTimeout(() => {
    if (P !== p || !p.el.isConnected) return;
    // 段 DIG3：月の締めと重なっていても、リザルトは必ず見せる（自分で「▶ 月次報告へ」を押すまで残す。前は 1.2 秒で月次報告に飛んでいた）
    if (end.crossed && o.then) {
      const go = o.then;
      acts.append(btn(t('▶ 月次報告へ', '▶ Monthly report'), () => {
        closeDig();
        go();
      }, 'is-on'));
      o.after?.();
      return;
    }
    const sec = sessionSec(p.ctx.s());
    if (o.again && !end.done) acts.append(btn(end.isDungeon ? t(`⛏ もう一度潜る（${sec} 秒）`, `⛏ Dive again (${sec} s)`) : t(`⛏ もう一度（${sec} 秒）`, `⛏ Again (${sec} s)`), () => o.again?.(), 'is-on'));
    acts.append(btn(t('町に戻る', 'Back to town'), () => closeDig()));
    o.after?.();
    // 新しいレシピ・出土品の札があるときは、自分で閉じるまで残す（「工房で作る」を押せるように・札を眺められるように）
    if (!recipes.length && !finds.length)
      window.setTimeout(() => {
        if (P === p && p.over && p.el.isConnected) closeDig();
      }, 6000);
  }, 1200);
}
/** 段 DIG3：リザルトの出土品の札（見つけた順）。お題・大きな遺物は大きい札（光つき）、石板は押すと読める。研究ノートに残ったことが分かる */
function foundCards(finds: DigFound[], bombs: number): HTMLElement {
  const box = h('div', 'isl-dig-finds');
  const head = h('div', 'isl-dig-finds-head');
  head.append(h('b', '', t(`見つけたもの ${finds.length}`, `Finds ${finds.length}`)));
  if (bombs) head.append(h('small', '', t(`💣 爆弾 ${bombs}`, `💣 bombs ${bombs}`)));
  box.append(head);
  const list = h('div', 'isl-dig-finds-list');
  finds.forEach((f, n) => {
    const it = f.item;
    const rar = it.kind === 'ext' ? extRarity(it.id) : 'Common';
    const c = h(it.kind === 'tablet' ? 'button' : 'div', `isl-dig-find is-${it.kind} is-r${it.kind === 'ext' ? extRank(it.id) : 'C'} ${f.big ? 'is-big' : ''} ${f.first ? 'is-first' : ''}`);
    c.style.animationDelay = `${Math.min(12, n) * 70}ms`;
    if (f.big) c.append(h('i', 'isl-dig-big-rays'));
    const ic = itemIcon(it, f.big ? 96 : 56);
    c.append(ic);
    const tag = it.kind === 'tablet' ? t('石板', 'Tablet') : it.kind === 'ext' && it.topic ? t('お題を発見！', 'Target found!') : f.big ? t(`${RARITY_JA[rar as keyof typeof RARITY_JA] ?? ''}の大きな遺物！`, `A large ${rar} relic!`) : f.first ? t('新発見！', 'New find!') : f.again ? t('再発見', 'Found again') : f.lv ? t(`研究 Lv${f.lv}`, `Research Lv${f.lv}`) : t('研究ノートへ', 'To the notebook');
    c.append(h('b', 'isl-dig-find-tag', tag), h('span', 'isl-dig-find-name', it.kind === 'tablet' ? (TABLET[it.id]?.title ?? '') : it.kind === 'ext' ? extName(it.id) : ''));
    if (f.rp) c.append(h('small', 'isl-gold', `+${f.rp} RP`));
    if (f.recipe) c.append(h('small', 'isl-dig-find-recipe', t('📜 新レシピ', '📜 New recipe')));
    if (it.kind === 'tablet' && c instanceof HTMLButtonElement) {
      c.type = 'button';
      c.title = t('押すと読む', 'Tap to read');
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        readTablet(it.id, f.rp);
      });
    }
    if (f.big && it.kind === 'ext') {
      const sg = seriesTag(it.id);
      if (sg && !sg[1]) c.append(h('small', 'isl-dig-epicval', EPIC_VALUE_TEXT()));
      window.setTimeout(() => c.isConnected && beamBehind(c, ic, it.id, 2400), 200 + n * 70);
      window.setTimeout(() => c.isConnected && fxAtEl('collect-burst', ic, { palette: FX_RARITY[rar] ?? FX_PAL.gold, dy: 30 }), 400 + n * 70);
    }
    list.append(c);
  });
  box.append(list);
  return box;
}

/** マス 1 つを描く（面の色・奥まった影・ひび・覗き見・あと何回・🔒） */
function paintCell(b: HTMLButtonElement, v: CellView, idle: boolean, cs: number) {
  const pk = v.peek;
  const key = `${v.state}|${v.layer}|${v.crack}|${v.taps}|${pk ? `${pk.item.kind}${'id' in pk.item ? pk.item.id : ''}${'mat' in pk.item ? pk.item.mat : ''}:${pk.frac}:${pk.part}:${pk.hint ? 1 : 0}` : ''}|${idle}|${cs}`;
  if (b.dataset.k === key) return;
  b.dataset.k = key;
  b.className = `isl-dig-cell is-${v.state} ${idle ? 'is-idle' : ''} ${pk?.hint ? 'is-hint' : ''} ${pk && !pk.hint ? 'is-peek' : ''}`;
  b.style.setProperty('--lc', v.color);
  b.style.setProperty('--d', String(Math.min(4, v.layer)));
  b.replaceChildren();
  b.disabled = v.state === 'dug';
  b.setAttribute(
    'aria-label',
    v.state === 'dug'
      ? t('いちばん奥まで掘ったマス', 'Dug to the back')
      : v.state === 'locked'
        ? t('深い層の許可が要る', 'Needs a deep-layer permit')
        : v.state === 'wait'
          ? t('大きな遺物：まわりのマスも掘ろう', 'Large relic: dig the cells around it')
          : t(`あと ${v.taps} 回で 1 枚はがれる`, `${v.taps} more strikes to peel`),
  );
  if (v.state === 'dug') return;
  const [x, y] = [v.x, v.y];
  const paths = crackOfCell(x, y);
  const seen = pk && !pk.hint ? pk : null;
  // 割れ目：いまの層の残りの硬さで 1〜3 本。無傷でも中身があれば細いひび 1 本（よく見ると分かる程度）。見える割合が大きいほど幅が広い
  const lines = Math.max(v.crack, seen ? 1 : 0, seen && seen.frac >= 0.4 ? 2 : 0, seen && seen.frac >= 0.7 ? 3 : 0);
  const mw = seen ? maskWidth(seen.frac) : 0;
  const faint = !!seen && seen.frac < 0.3;
  if (lines) b.append(crackSvg(paths, lines, seen && !faint ? mw + 3 : faint ? 1.4 : 1.6 + v.crack * 0.9));
  if (seen) {
    const wrap = h('span', `isl-dig-peek ${seen.item.kind === 'ext' && seen.item.topic ? 'is-topic' : ''} is-${seen.item.kind} ${faint ? 'is-faint' : ''}`);
    const m = maskUrl(paths.slice(0, lines), mw);
    wrap.style.setProperty('mask-image', m);
    wrap.style.setProperty('-webkit-mask-image', m);
    const big = seen.size[0] > 1 || seen.size[1] > 1;
    const sz = seen.item.kind === 'ext' ? Math.round(cs * (big ? 2 : 1) * 0.92 + (big ? 3 : 0)) : Math.round(cs * 0.72);
    const ic = itemIcon(seen.item, sz);
    ic.classList.add('isl-dig-peekic');
    if (big) {
      ic.style.left = `${Math.round(-seen.part[0] * (cs + 3) + cs * 0.04)}px`;
      ic.style.top = `${Math.round(-seen.part[1] * (cs + 3) + cs * 0.04)}px`;
      wrap.classList.add('is-big');
    }
    wrap.append(ic);
    b.append(wrap);
  }
  if (v.state === 'locked') b.append(h('span', 'isl-dig-lock', '🔒'));
  if (v.state === 'face' && v.crack > 0) {
    const pips = h('span', 'isl-dig-pips');
    for (let i = 0; i < Math.min(5, v.taps); i++) pips.append(h('i'));
    b.append(pips);
  }
}

function paintCells() {
  const p = P!;
  const s = p.ctx.s();
  const L = digSite(s)!;
  const none = !!digBlock(s);
  for (let k = 0; k < p.cells.length; k++) paintCell(p.cells[k], cellView(s, k % L.w, Math.floor(k / L.w)), none, p.cs);
}

// ---------------------------------------------------------------- 打つ（なぞって掘る。段 DIG3）

/**
 * なぞって掘る：PC はカーソルを当てたマスを自動で打ち続ける（押さなくてよい。クリックでも 1 打）。
 * スマホは指でなぞった所を掘る（押しっぱなしで続く。指の下のマスが変わればそこを打つ。離すと止まる）。
 * 壁の外（閉じるボタン・帯・札・隊員）では掘らない（cellOf）。打つ間隔は digRepeatMs（aimStep）
 */
function bindWall(wall: HTMLElement) {
  const under = (e: PointerEvent): [number, number] | null => cellOf(document.elementFromPoint(e.clientX, e.clientY));
  wall.addEventListener('pointermove', (e) => {
    const p = P;
    if (!p) return;
    // マウスはホバーで、指・ペンは押しているあいだだけ
    if (e.pointerType !== 'mouse' && !(e.buttons & 1)) return;
    p.hover = under(e);
  });
  wall.addEventListener('pointerdown', (e) => {
    const p = P;
    if (!p || e.button !== 0) return;
    p.hover = under(e);
    // クリック（タップ）：すぐ 1 打（当てていたマスでも、押した瞬間に打つ）
    p.aim = null;
    p.dead = null;
  });
  const stop = (e: PointerEvent) => {
    const p = P;
    if (!p) return;
    if (e.pointerType === 'mouse') p.hover = under(e);
    else p.hover = null;
  };
  wall.addEventListener('pointerup', stop);
  wall.addEventListener('pointercancel', stop);
  wall.addEventListener('pointerleave', () => P && (P.hover = null));
  // 指でなぞるあいだ、画面をスクロールさせない
  wall.style.touchAction = 'none';
}
function stopAim(p: Panel) {
  p.hover = null;
  p.aim = null;
  p.dead = null;
  p.pick.hidden = true;
  p.reach.replaceChildren();
}
/** 毎フレーム：当てているマスを間隔で打つ・ツルハシと点線の枠を動かす */
function aimLoop() {
  const p = P;
  if (!p) return;
  p.raf = requestAnimationFrame(aimLoop);
  const s = p.ctx.s();
  const hover = p.over || !s.digRun ? null : p.hover;
  const r = aimStep(p.aim, hover, performance.now(), digRepeatMs(s));
  const moved = !!r.aim !== !!p.aim || r.aim?.x !== p.aim?.x || r.aim?.y !== p.aim?.y;
  p.aim = r.aim;
  if (moved) {
    p.dead = null;
    paintAim();
  }
  if (r.strike && r.aim && p.dead !== `${r.aim.x},${r.aim.y}`) {
    const got = strike(r.aim.x, r.aim.y);
    // 打てないマス（待っている・許可が要る・掘りきった）は、当てているあいだ打ち直さない（音とゆれを繰り返さない）
    if (got === 'err') p.dead = `${r.aim.x},${r.aim.y}`;
    else swingPick();
  }
}
/** ツルハシと効く範囲の点線の枠を、当てているマスへ */
function paintAim() {
  const p = P;
  if (!p) return;
  const a = p.aim;
  if (!a) {
    p.pick.hidden = true;
    p.reach.replaceChildren();
    return;
  }
  const c = cellAt(a.x, a.y);
  if (!c) return;
  p.pick.hidden = false;
  p.pick.style.left = `${c.offsetLeft + c.offsetWidth / 2}px`;
  p.pick.style.top = `${c.offsetTop + c.offsetHeight / 2}px`;
  p.reach.replaceChildren();
  for (const [x, y] of reachCells(p.ctx.s(), a.x, a.y)) {
    const d = cellAt(x, y);
    if (!d) continue;
    const f = h('i', `isl-dig-reach-cell ${x === a.x && y === a.y ? 'is-center' : ''}`);
    f.style.left = `${d.offsetLeft}px`;
    f.style.top = `${d.offsetTop}px`;
    f.style.width = `${d.offsetWidth}px`;
    f.style.height = `${d.offsetHeight}px`;
    p.reach.append(f);
  }
}
function swingPick() {
  const p = P;
  if (!p) return;
  p.pick.classList.remove('is-swing');
  void p.pick.offsetWidth;
  p.pick.classList.add('is-swing');
}

/** 打つ：'more'（まだはがれていない）／'broke'／'err' */
function strike(x: number, y: number): 'more' | 'broke' | 'err' {
  const p = P;
  if (!p || p.over) return 'err';
  const s = p.ctx.s();
  // 作業が終わった（時間切れの直後）：何もしない
  if (!s.digRun) return 'err';
  const useDrill = p.drillArm;
  const r = useDrill ? drill(s, x, y) : dig(s, x, y);
  if (typeof r === 'string') {
    if (r === 'deep') return deepPressed(x, y), 'err';
    fail(x, y, r, DRILL_FUEL);
    return 'err';
  }
  // 広く掘る・貫通・爆弾の爆発：隣のマス・下の層に当たった結果も（extra）
  const hits = Array.isArray(r) ? r : [r, ...(r.extra ?? [])];
  if (useDrill) p.drillArm = false;
  p.err = null;
  soonSave();
  // 段 DIG3：爆弾を掘り出した（爆発）
  const boom = hits.filter((x) => x.bomb);
  showHits(hits, boom.length > 0, useDrill);
  for (const b of boom) bombFx(b);
  p.hooks.hit?.(hits);
  // 再発掘で初めて RP が入った（この周回で初めて掘り出した出土品・石板）：1 回だけ
  if (hits.some((x) => x.again && x.rp > 0) && p.hooks.againTip?.()) mineSay(AGAIN_TIP(), 6000);
  // 資金・RP の帯と吹き出しを描き直す
  p.ctx.refresh();
  refreshDig();
  const main = hits[0];
  if (main?.wait) p.err = { text: digErrText('wait'), until: performance.now() + 2200 };
  return hits.some((h2) => h2.broke) ? 'broke' : main?.wait ? 'err' : 'more';
}

/**
 * 「深い層の許可が要る」マス・層の札を押した：画面のひとことと、初めてならマインちゃんの一言。
 * 作業の外（札のあと）なら、スキルツリーの「深い層の許可」へ。作業のあいだは、終わりの札のおすすめを深い層の許可にする
 */
function deepPressed(x?: number, y?: number) {
  const p = P;
  if (!p) return;
  const s = p.ctx.s();
  if (!s.digRun && p.hooks.skill) {
    const go = p.hooks.skill;
    closeDig();
    go('dig_deep');
    return;
  }
  p.deepHit = true;
  p.ctx.sfx?.('error');
  if (x != null && y != null) {
    const c = cellAt(x, y);
    if (c) {
      c.classList.remove('is-shake');
      void c.offsetWidth;
      c.classList.add('is-shake');
    }
  }
  p.err = { text: `${DEEP_LOCK()}　${digErrText('deep')}`, until: performance.now() + 2600 };
  if (p.hooks.deepTip?.()) mineSay(DEEP_TIP(), 7000);
  refreshDig();
  window.setTimeout(() => P && refreshDig(), 2700);
}

function fail(x: number, y: number, e: DigErr, cost?: number) {
  const p = P!;
  p.ctx.sfx?.('error');
  p.err = { text: digErrText(e, cost), until: performance.now() + 2600 };
  const c = cellAt(x, y);
  if (c) {
    c.classList.remove('is-shake');
    void c.offsetWidth;
    c.classList.add('is-shake');
  }
  refreshDig();
  window.setTimeout(() => P && refreshDig(), 2700);
}

const cellAt = (x: number, y: number) => {
  const p = P;
  if (!p) return null;
  const L = digSite(p.ctx.s());
  return L ? (p.cells[y * L.w + x] ?? null) : null;
};

// ---------------------------------------------------------------- 出土の演出

function showHits(hits: DigHit[], wasBlast: boolean, wasDrill = false) {
  const p = P!;
  const big = biggestFx(hits);
  // 段 DIG3：数字の飛び（減らした硬さ。会心は金色で大きく・貫通は青・隣への力は小さく薄く）
  hits.forEach((hit, n) => {
    if (!hit.dmg || hit.dmg >= 1e6) return;
    const c = cellAt(hit.x, hit.y);
    if (!c) return;
    const r = c.getBoundingClientRect();
    const pr = p.el.getBoundingClientRect();
    const f = h('b', `isl-dig-dmg ${hit.crit ? 'is-crit' : ''} ${hit.pierce ? 'is-pierce' : ''} ${hit.splash ? 'is-splash' : ''}`, `${hit.pierce ? '↓' : ''}${Math.round(hit.dmg * 10) / 10}`);
    f.style.left = `${r.left - pr.left + r.width * (hit.pierce ? 0.72 : 0.5)}px`;
    f.style.top = `${r.top - pr.top + r.height * (hit.pierce ? 0.55 : 0.35)}px`;
    f.style.animationDelay = `${Math.min(3, n) * 40}ms`;
    p.el.append(f);
    window.setTimeout(() => f.remove(), 700);
  });
  // 会心（2 倍）：マスの上に「会心！」
  for (const hit of hits.filter((x) => x.crit)) {
    const c = cellAt(hit.x, hit.y);
    if (!c) continue;
    const r = c.getBoundingClientRect();
    const pr = p.el.getBoundingClientRect();
    const f = h('b', 'isl-dig-crit', t('会心！', 'Critical!'));
    f.style.left = `${r.left - pr.left + r.width / 2}px`;
    f.style.top = `${r.top - pr.top}px`;
    p.el.append(f);
    window.setTimeout(() => f.remove(), 800);
  }
  // ドリル：同じマスが奥へ何度も沈む（発破と同じくらいの大きさの演出）
  if (wasDrill) {
    p.el.classList.add('is-drillboom');
    window.setTimeout(() => P?.el.classList.remove('is-drillboom'), 450);
    const c = cellAt(hits[0]?.x ?? 0, hits[0]?.y ?? 0);
    if (c) {
      c.style.setProperty('--n', String(hits.length));
      c.classList.remove('is-drillhit');
      void c.offsetWidth;
      c.classList.add('is-drillhit');
    }
  }
  // 音：はがれるたびに「ゴツッ」（奥の層ほど低く硬い音）。エクステ・石板は宝箱の音、お題・大きな遺物は採掘完了の音（大きい演出のときだけ）
  const deep = Math.max(0, ...hits.map((x) => x.layer));
  p.ctx.sfx?.('dig', 1 + deep * 0.18, 1 - deep * 0.13);
  if (big === 'topic' || big === 'epic') window.setTimeout(() => p.ctx.sfx?.('mining'), 120);
  else if (big === 'rare') {
    window.setTimeout(() => p.ctx.sfx?.('treasure'), 90);
    window.setTimeout(() => p.ctx.sfx?.('levelup'), 420);
  } else if (big === 'ext' || big === 'tablet') window.setTimeout(() => p.ctx.sfx?.('treasure'), 90);
  else if (big === 'mat') window.setTimeout(() => p.ctx.sfx?.('check'), 90);
  if (wasBlast) p.el.classList.add('is-boom');
  window.setTimeout(() => P?.el.classList.remove('is-boom'), 400);
  let delay = 0;
  for (const hit of hits) {
    const f = fxOf(hit);
    const c = cellAt(hit.x, hit.y);
    if (!c) continue;
    if (f === 'chip') {
      shake(c);
      dust(c, 3, false);
      continue;
    }
    dust(c, 8, true);
    if (wasBlast) {
      c.classList.remove('is-peel');
      void c.offsetWidth;
      c.classList.add('is-peel');
    }
    // 置き場所がいっぱいなら、入ったぶんだけ（「置き場所がいっぱい」）
    if (f === 'mat' && hit.item?.kind === 'mat') floatUp(c, matIcon(hit.item.mat as Mat, 24), hit.matFull ? (hit.mat ? t(`+${hit.mat}（置き場所がいっぱい）`, `+${hit.mat} (storage full)`) : t('置き場所がいっぱい', 'Storage full')) : `+${hit.mat ?? hit.item.n}`);
    // 段 DIG3：発掘中の演出（エクステ・Rare・石板・お題・大きな遺物・レシピ）は出さない。見つけた瞬間は小さなトースト（1 秒）と音だけ、
    // 中身はリザルト（発掘終了の札）にまとめる（見つけた順に札を並べる：got.finds）
    else if (hit.item && hit.item.kind !== 'mat') {
      const it = hit.item;
      const big = f === 'topic' || f === 'epic';
      window.setTimeout(() => findPing(c, it, hit, big), delay);
      delay += 160;
      // 段 FX2 の光の柱だけ残す（すぐ消える。次に打てば消える）
      const r = c.getBoundingClientRect();
      if (it.kind === 'ext' && r.width) playFx('loot-beam', r.left + r.width / 2, r.bottom - r.height * 0.2, { palette: FX_RARITY[extRarity(it.id)] ?? FX_RARITY.Common, opts: { item: false }, scale: innerWidth < 600 ? 1 : 1.5, life: 700, seed: it.id, thin: big ? undefined : 'dig-beam' });
    }
  }
}
/** 段 DIG3：見つけた瞬間の小さなトースト（マスの上に絵 32px と札。1 秒で消える。作業は止めない） */
function findPing(c: HTMLElement, it: DigItem, hit: DigHit, big: boolean) {
  const p = P;
  if (!p) return;
  const r = c.getBoundingClientRect();
  const pr = p.el.getBoundingClientRect();
  const f = h('div', `isl-dig-ping ${big ? 'is-big' : ''} is-${it.kind}`);
  const label = it.kind === 'tablet' ? t('石板！', 'Tablet!') : hit.recipe ? t('📜 新レシピ！', '📜 New recipe!') : findLabel(hit) || t('出土！', 'Found!');
  f.append(itemIcon(it, big ? 48 : 32), h('b', '', label), ...(hit.rp ? [h('small', '', `+${hit.rp} RP`)] : []));
  f.style.left = `${Math.max(60, Math.min(pr.width - 60, r.left - pr.left + r.width / 2))}px`;
  f.style.top = `${r.top - pr.top}px`;
  p.el.append(f);
  window.setTimeout(() => f.remove(), 1000);
  // 研究ノートのボタンが少し光る（続けて来たら 1 秒に 1 つ）
  if (it.kind === 'ext') {
    p.notes.classList.remove('is-gulp');
    void p.notes.offsetWidth;
    p.notes.classList.add('is-gulp');
  }
}

/** 段 DIG3：爆弾を掘り出した：そのマスから爆発の光（pixelfx の花火を橙で）と煙。画面はゆれる（is-boom） */
function bombFx(hit: DigHit) {
  const p = P;
  if (!p) return;
  const c = cellAt(hit.x, hit.y);
  if (!c) return;
  const r = c.getBoundingClientRect();
  if (!r.width) return;
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const sc = innerWidth < 600 ? 1 : 1.5;
  playFx('firework-burst', x, y, { palette: FX_PAL.fire, opts: { core: FX_PAL.gold }, scale: sc, life: 900, seed: hit.x * 7 + hit.y });
  playFx('poof', x, y + 6, { palette: FX_PAL.smoke, scale: sc * 1.5, delay: 120, life: 900, seed: hit.y * 7 + hit.x });
  const f = h('b', 'isl-dig-bombtag', t('💥 爆発！', '💥 Boom!'));
  const pr = p.el.getBoundingClientRect();
  f.style.left = `${x - pr.left}px`;
  f.style.top = `${y - pr.top}px`;
  p.el.append(f);
  window.setTimeout(() => f.remove(), 900);
  p.ctx.sfx?.('mining');
}

function shake(c: HTMLElement) {
  c.classList.remove('is-hit');
  void c.offsetWidth;
  c.classList.add('is-hit');
}
/** 砕ける粒（はがれたら多めに、層の色で） */
function dust(c: HTMLElement, n: number, broke: boolean) {
  const p = P!;
  const r = c.getBoundingClientRect();
  const pr = p.el.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const d = h('i', `isl-dig-dust ${broke ? 'is-big' : ''}`);
    d.style.left = `${r.left - pr.left + r.width / 2}px`;
    d.style.top = `${r.top - pr.top + r.height / 2}px`;
    d.style.setProperty('--lc', c.style.getPropertyValue('--lc'));
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.6;
    const dist = (broke ? 22 : 12) + Math.random() * (broke ? 18 : 8);
    d.style.setProperty('--dx', `${Math.round(Math.cos(a) * dist)}px`);
    d.style.setProperty('--dy', `${Math.round(Math.sin(a) * dist + (broke ? 14 : 6))}px`);
    p.el.append(d);
    window.setTimeout(() => d.remove(), 650);
  }
}
/** 素材：アイコンが少し浮いて消える */
function floatUp(c: HTMLElement, ic: HTMLElement, text: string) {
  const p = P!;
  const r = c.getBoundingClientRect();
  const pr = p.el.getBoundingClientRect();
  const f = h('div', 'isl-dig-float');
  f.append(ic, h('b', '', text));
  f.style.left = `${r.left - pr.left + r.width / 2}px`;
  f.style.top = `${r.top - pr.top}px`;
  p.el.append(f);
  window.setTimeout(() => f.remove(), 1200);
}
/** 段 FX2：札・窓の中の絵の後ろに、レアリティの色の光の柱（host の中に。絵の足もとから上へ。放射の模様の上・文字と絵の下） */
function beamBehind(host: HTMLElement, icon: HTMLElement, id: number, life: number) {
  const rays = host.querySelector(':scope > .isl-dig-rare-rays, :scope > .isl-dig-big-rays');
  const x = icon.offsetLeft + icon.offsetWidth / 2;
  const y = icon.offsetTop + icon.offsetHeight * 0.85;
  playFx('loot-beam', x, y, { host, under: rays?.nextElementSibling ?? icon, palette: FX_RARITY[extRarity(id)] ?? FX_RARITY.Common, opts: { item: false }, ink: false, scale: innerWidth < 600 ? 4 / 3 : 2, life, seed: id });
}
/** 新しいレシピの札（発掘終了の札の中）：エクステの絵 64px・「『復刻 ○○』を工房で作れるようになった」・「工房で作る」 */
export function recipeCards(keys: string[], make: (key: string) => void): HTMLElement {
  const box = h('div', 'isl-dig-recipes');
  box.append(h('b', 'isl-gold', t(`📜 新しいレシピ！（${keys.length}）`, `📜 New recipes! (${keys.length})`)));
  for (const key of keys) {
    const prod = PRODUCT[key];
    if (!prod?.relic) continue;
    const row = h('div', 'isl-dig-recipe-row');
    const txt = h('div', 'isl-col');
    txt.append(h('b', '', prod.name), h('small', '', t(`「${prod.name}」を工房で作れるようになった`, `You can now make ${prod.name} in the workshop`)));
    // 売れるシリーズの札（Rare の復刻品：Rare の町で売れる／売れない）
    const sg = seriesTag(prod.relic.ext, P?.ctx.s().tier);
    if (sg) txt.append(h('small', `isl-note-series ${sg[1] ? 'is-good' : 'is-bad'}`, sg[0]));
    row.append(extIcon(prod.relic.ext, 64), txt, btn(t('工房で作る', 'Make it'), () => make(key), 'is-on'));
    box.append(row);
  }
  return box;
}
/** 撮影スクリプト用：発掘の画面に石板の読み物の窓を出す */
export const debugTablet = (id: string) => readTablet(id, 0);
/** 石板：読み物の小さな窓（画面の中。時間は止めない） */
function readTablet(id: string, rp: number) {
  const p = P;
  if (!p) return;
  p.el.querySelector('.isl-dig-read')?.remove();
  const tab = TABLET[id];
  if (!tab) return;
  const w = h('div', 'isl-dig-read');
  const head = h('div', 'isl-dig-read-head');
  head.append(tabletIcon(32), h('b', '', t(`石板「${tab.title}」`, `Tablet: ${tab.title}`)));
  w.append(head, h('p', '', tab.text));
  // 段 K：ランドの運営のノウハウの一節と、開いた経営方針
  const kn = tabletKnow(p.ctx.s(), id);
  if (kn) {
    w.append(h('p', 'isl-dig-know', `「${kn.know}」`), h('small', kn.open ? 'isl-dig-know-open' : 'isl-dim', kn.line));
    polSync(p.ctx.s());
  }
  if (rp) w.append(h('small', 'isl-gold', t(`研究 +${rp} RP・研究ノートに残りました`, `RP +${rp} · saved to your notebook`)));
  w.append(btn(t('閉じる', 'Close'), () => w.remove(), 'is-on'));
  p.el.append(w);
}
// ---------------------------------------------------------------- 研究ノート

let noteTab: string | null = null;

/** 研究ノート（図鑑）：セクタごとのタブ（いまのセクタが先頭）・エクステの絵と研究 Lv の ★・お題の印・石板の読み物 */
export function openNotes(ctx: Ctx, o: { fromDig?: DigHooks; sector?: string } = {}) {
  const s0 = ctx.s();
  noteTab = o.sector ?? s0.sector ?? 'c1';
  if (o.fromDig) closeDig();
  open(
    ctx,
    t('研究ノート', 'Research notebook'),
    (body) => {
      const s = ctx.s();
      const tabs = noteTabs(s);
      if (!tabs.some((x) => x.id === noteTab)) noteTab = tabs[0]?.id ?? null;
      const tot = noteTotals(s);
      // 段 UI8c：見つけた割合はメーター（数と % と、そろえば ✔）
      const sum = h('div', 'isl-note-sum isl-note-meters');
      sum.append(
        bulletEl({ label: t('見つけた出土品', 'Finds'), v: tot.found, target: tot.all, tName: '', fmt: (x) => t(`${x} 種`, `${x}`), over: 'progress' }),
        bulletEl({ label: t('石板', 'Tablets'), v: tot.tablets, target: tot.allTablets, tName: '', fmt: (x) => t(`${x} 枚`, `${x}`), over: 'progress' }),
      );
      body.append(sum);
      const row = h('div', 'isl-note-tabs');
      for (const x of tabs) {
        const b = btn(`${x.here ? '📍 ' : ''}${x.name}`, () => {
          noteTab = x.id;
          ctx.sfx?.('tap');
          refreshSheet();
        }, `isl-note-tab ${x.id === noteTab ? 'is-on' : ''} ${x.visited ? '' : 'is-far'}`);
        if (!x.visited) b.title = t('まだ出店していないセクタ（出店すると、ここの荒れ地を掘れる）', 'Not opened yet (open a shop there to dig)');
        row.append(b);
      }
      body.append(row);
      if (!noteTab) return;
      // ダンジョン：入り口が見つかったセクタごとに、奥で出る上のランクの遺物（未発見はシルエット）
      if (noteTab === DUNGEON_TAB) {
        body.append(h('p', 'isl-dim isl-note-dnote', RARE_RELIC_NOTE(rareRelicsOpen(s), epicRelicsOpen(s))));
        for (const d of dungeonNotes(s)) {
          body.append(h('h4', 'isl-note-h', d.best != null ? t(`${d.name}のダンジョン（最深 ${d.best} 層）`, `${d.name} dungeon (deepest ${d.best})`) : t(`${d.name}のダンジョン`, `${d.name} dungeon`)));
          for (const r of d.ranks) {
            const g = h('div', 'isl-note-grid');
            for (const e of r.items) g.append(noteCard(e, r.tier, rareRelicsOpen(s), epicRelicsOpen(s), s.tier));
            const rn = RARITY_JA[TIER_RARITY[r.tier]];
            body.append(h('small', `isl-note-rank is-${r.tier}`, t(`${rn}（奥の層ほど出やすい）`, `${rn} (more likely deeper)`)), g);
          }
        }
        return;
      }
      const list = noteEntries(s, noteTab);
      const tabsHere = tabs.find((x) => x.id === noteTab);
      // お題（上の層から）
      body.append(h('h4', 'isl-note-h', t('お題（各層に 1 つ。そろえて町の長に発表）', 'Targets (one per layer; find all and present)')));
      const tg = h('div', 'isl-note-grid');
      for (const e of list.filter((x) => x.topic)) tg.append(noteCard(e, undefined, rareRelicsOpen(s), epicRelicsOpen(s), s.tier));
      body.append(tg);
      body.append(h('h4', 'isl-note-h', t('出土品（何度も出る。重なるほど研究 Lv が上がる）', 'Finds (repeat finds raise research level)')));
      const fg = h('div', 'isl-note-grid');
      for (const e of list.filter((x) => !x.topic)) fg.append(noteCard(e, undefined, rareRelicsOpen(s), epicRelicsOpen(s), s.tier));
      body.append(fg);
      // 石板（読み物）
      body.append(h('h4', 'isl-note-h', t('石板', 'Tablets')));
      const tl = h('div', 'isl-note-tablets');
      for (const { tab, read } of noteTablets(s, noteTab)) {
        const b = h('button', `isl-note-tablet ${read ? '' : 'is-unread'}`);
        b.type = 'button';
        b.append(tabletIcon(32), h('b', '', read ? tab.title : t('？？？（まだ見つけていない）', '??? (not found yet)')));
        if (read) {
          const txt = h('p', '', tab.text);
          txt.hidden = true;
          b.append(txt);
          // 段 K：ノウハウの一節と、開いた経営方針（開いているときは方針の名前も札に）
          const kn = tabletKnow(s, tab.id);
          const kx: HTMLElement[] = [];
          if (kn) {
            b.append(h('small', kn.open ? 'isl-note-pol is-open' : 'isl-note-pol', kn.open ? t(`📜 ${kn.policy.name}`, `📜 ${kn.policy.name}`) : t(`📜 ${kn.policy.name}（1 / 2）`, `📜 ${kn.policy.name} (1 / 2)`)));
            kx.push(h('p', 'isl-note-know', `「${kn.know}」`), h('small', kn.open ? 'isl-dig-know-open' : 'isl-dim', kn.line));
            for (const x of kx) {
              x.hidden = true;
              b.append(x);
            }
          }
          b.addEventListener('click', () => {
            txt.hidden = !txt.hidden;
            for (const x of kx) x.hidden = txt.hidden;
            b.classList.toggle('is-open', !txt.hidden);
          });
        } else b.append(h('small', 'isl-dim', t('この町の荒れ地のどこかに眠っている', 'Somewhere under this town’s wastelands')));
        tl.append(b);
      }
      body.append(tl);
      const foot = h('div', 'isl-row');
      if (tabsHere?.here && s.dig && o.fromDig && s.digRun) foot.append(btn(t('⛏ 発掘に戻る', '⛏ Back to digging'), () => closeNotes(), 'is-on'));
      else if (tabsHere && !tabsHere.visited) foot.append(h('small', 'isl-dim', t('このセクタに出店すると、ここの荒れ地を掘れます。', 'Open a shop in this sector to dig here.')));
      body.append(foot);
    },
    () => {
      noteTab = null;
      // 発掘場から開いたときは、閉じたら発掘場に戻る（ほかの画面に切り替えたときは戻らない）
      if (o.fromDig) {
        const back = o.fromDig;
        window.setTimeout(() => {
          if (!sheetOpen() && !P && ctx.s().dig && ctx.s().digRun) openDig(ctx, back);
        }, 0);
      }
    },
  );
}

/** 研究ノートを閉じる（発掘場から開いたときは、閉じると発掘場に戻る） */
function closeNotes() {
  const x = document.querySelector<HTMLButtonElement>('.isl-sheet-head .isl-btn');
  x?.click();
}

function noteCard(e: ReturnType<typeof noteEntries>[number], tier?: string, rareOpen = false, epicOpen = false, here?: Tier): HTMLElement {
  const c = h('div', `isl-note-card ${e.n ? '' : 'is-unknown'} ${e.topic ? 'is-topic' : ''} ${tier ? `is-r${tier}` : ''}`);
  if (e.topic) c.append(h('span', 'isl-note-topic', t('お題', 'Target')));
  const pic = h('span', 'isl-note-pic');
  pic.append(extIcon(e.id, 64));
  c.append(pic, h('b', 'isl-note-name', e.n ? e.name : t('？？？', '???')), h('span', `isl-note-stars ${e.lv >= 5 ? 'is-max' : ''}`, stars(e.lv)), h('small', 'isl-dim', nextLvText(e)));
  // 復刻品：研究 Lv3 でレシピ（見つけたものだけ）
  const rl = e.n ? relicLine(e, rareOpen, epicOpen) : null;
  if (rl) c.append(h('small', `isl-note-relic ${rl[1] ? 'is-on' : ''}`, rl[0]));
  // 売れるシリーズの札（Rare の復刻品のあるエクステ。見つけたものだけ）
  // 段 H1：Epic の町の中では「骨董として人気」「Epic の町で売れる」（緑）
  const sg = e.n ? seriesTag(e.id, here === 'E' ? 'E' : undefined) : null;
  if (sg) c.append(h('small', `isl-note-series ${sg[1] ? 'is-good' : 'is-bad'}`, sg[0]));
  if (e.n) c.title = t(`研究 Lv${e.lv}（掘った数 ${e.n}）`, `Research Lv${e.lv} (dug ${e.n})`);
  return c;
}
