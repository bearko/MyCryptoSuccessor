/**
 * 段 UIX3w：ランドマップ（航路図）・進出の確かめ・となりの町の窓（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：ランドマップと進出」）。
 * - 航路図：島の形の上に、セクタの札（ランクの字・状態の絵・名前）と道。いまいる所は琥珀の札とピン、行ける所は水色の枠と矢印、
 *   行けない所は網目と錠（色だけにしない：絵と言葉を添える）。押すと下の帯に名前と状態が出て、くわしい札が替わる。
 * - くわしい札：ひと言・特徴・目標と制覇の進み・数字・進出の決め。足りないときは「あと N G」と目盛り。入国料を払う進出はレバー。
 * - ランクが上がる進出：失うもの／残るもの・支度金・マインちゃんのひと言（寄付）・レバー（進出）・「まだやめておく」。
 * 器は今の札（open()）：閉じ方・時間の止め方は今のまま。出す中身・押せる操作は、今の画面（p1/landui.ts）と同じだけそろえる。
 * セクター長・復興の箱とセクタごとの売上の棒は、今の要素を暗い計器の板に入れる（中の操作は今のまま）。
 */
import { t } from '../../../i18n';
import { el, type Kid } from '../dom';
import { later } from '../loop';
import { rollNumber, uxKey, uxLamp, uxLever, uxMeter, uxTape, type LampKind } from '../parts';
import { isCalm } from '../prefs';
import { uxScene, uxSfx } from '../sound';
import { bare, sayParts } from './conquer';
import { safe } from './s-press';
import { W } from './w-deps';
import { wIcon } from './w-icons';
import './land.css';
import type { SectorState } from '../../p1/company';
import type { SectorDef } from '../../p1/data';
import type { P1State } from '../../p1/model';
import type { Ctx } from '../../p1/screens';
import type { SectorCardView } from './w-slots';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）

/** 札の見た目（状態ごと）：絵・言葉・ランプ。色だけで見分けない */
export interface NodeLook {
  /** 絵の名前（雲は「？」） */
  ico: string | null;
  word: string;
  lamp: LampKind | null;
  /** 行ける（押すと進出・移動を決められる） */
  can: boolean;
}
export function nodeLook(st: SectorState, noLetter = false): NodeLook {
  switch (st) {
    case 'here':
      return { ico: 'pin', word: t('いまここ', 'You are here'), lamp: '', can: false };
    case 'mine':
      return { ico: 'flag', word: t('出店済み', 'Opened'), lamp: 'good', can: true };
    case 'open':
      return noLetter ? { ico: 'mail', word: t('依頼状が要る', 'Needs a request'), lamp: null, can: false } : { ico: 'next', word: t('行ける', 'Can go'), lamp: 'cyan', can: true };
    case 'soon':
      return { ico: 'gear', word: t('準備中', 'Coming soon'), lamp: null, can: false };
    case 'locked':
      return { ico: 'lock', word: t('まだ行けない', 'Locked'), lamp: null, can: false };
    default:
      return { ico: null, word: t('雲の向こう', 'Under clouds'), lamp: null, can: false };
  }
}
/** 進出の決め方（くわしい札・となりの町の窓） */
export type GoKind = 'here' | 'go' | 'move' | 'short' | 'rankup' | 'letter' | 'locked' | 'soon' | 'cloud';
export function goKind(st: SectorState, o: { noLetter: boolean; rankUp: boolean; fee: number; money: number }): GoKind {
  if (st === 'here') return 'here';
  if (st === 'mine') return 'go';
  if (st === 'cloud' || st === 'locked' || st === 'soon') return st;
  if (o.noLetter) return 'letter';
  if (o.rankUp) return 'rankup';
  return o.money < o.fee ? 'short' : 'move';
}
/** 目盛り（0〜1）：持っている／要る */
export const gapRate = (have: number, need: number) => (need <= 0 ? 1 : Math.max(0, Math.min(1, have / need)));
/** 名前の札の幅（航路図の幅に対する割合。100 で全幅）：横に並ぶ数で決まる（Common は 4 つ・Uncommon と Epic は 3 つ・Rare は 2 つ） */
export const NAME_W: Record<string, number> = { C: 23, U: 29, R: 34, E: 24, L: 24 };

// ---------------------------------------------------------------- 部品

const ico = (name: string, color = '#f4ecd4', scale = 1) => wIcon(name, { color, hi: color, scale });
const inkIco = (name: string, scale = 1) => wIcon(name, { color: '#1a1c2e', hi: '#1a1c2e', lo: '#1a1c2e', scale });
const SVG = 'http://www.w3.org/2000/svg';
const sv = (tag: string, attrs: Record<string, string>) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
/** ランクの札（字は数字の書体。色はランクの色の帯で、字も添える） */
function tierPlate(d: SectorDef, big = false): HTMLElement {
  const p = el(`span.uxw-tier${big ? '.uxw-tier--big' : ''}`, { 'aria-hidden': 'true' }, el('b.ux-num', d.tier));
  p.style.setProperty('--tc', W.TIERS[d.tier].color);
  return p;
}
/** 状態の貼り札（ランプ・絵・言葉） */
function stateTape(look: NodeLook): HTMLElement {
  return el('span.uxw-state', look.lamp != null ? uxLamp(look.lamp, true, look.can) : null, look.ico ? inkIco(look.ico) : null, el('b', look.word));
}
/** 見出しの貼り札（節） */
const secHead = (label: string, icoName?: string) => el('div.uxw-sec', icoName ? ico(icoName, '#5fe4ff') : null, el('b', label));
/** 1 行（絵・文）。kind：warn（琥珀）・good・bad・dim */
const line = (icoName: string | null, text: Kid, kind = '') => el(`p.uxw-line${kind ? '.is-' + kind : ''}`, icoName ? ico(icoName, kind === 'warn' ? '#ffb81f' : kind === 'good' ? '#36e08b' : kind === 'bad' ? '#ff5964' : '#97a1cf') : null, el('span', text));
/** 「あと N G」と目盛り（責めない言い方） */
function gapBox(label: string, need: number, have: number): HTMLElement {
  const m = uxMeter(0);
  if (isCalm()) m.set(gapRate(have, need));
  else later(120, () => m.set(gapRate(have, need)));
  return el(
    'div.uxw-gap',
    el('div.uxw-gap-row', el('span', label), el('b.ux-num', W.money(need))),
    m.el,
    el('p.uxw-gap-say', ico('coin', '#ffb81f'), el('span', t(`あと ${W.money(Math.max(0, need - have))}。売上がたまれば届きます。`, `${W.money(Math.max(0, need - have))} to go. Sales will get you there.`))),
  );
}
/** 進出のレバー：左に「何を・いくらで」とランプ、右にレバー。落ちたら go（1 回だけ） */
function leverBox(o: { what: string; rows: [string, string][]; label: string; cap: string; done: [string, string]; danger?: boolean; go: () => void }): HTMLElement {
  const lv = uxLever({ label: o.label, aria: o.what, cap: o.cap, doneText: o.done, onDone: () => later(isCalm() ? 0 : 260, safe(o.go)) });
  return el(
    `div.uxw-go${o.danger ? '.is-danger' : ''}`,
    el('div.uxw-go-side', el('b.uxw-go-what', o.what), o.rows.map(([k, v]) => el('div.uxw-go-row', el('span', k), el('b.ux-num', v))), lv.lamps, lv.done),
    lv.el,
  );
}
/** 今の要素（セクター長・復興の箱・グラフ）を入れる、暗い計器の板 */
function legacyBox(...kids: Kid[]): HTMLElement {
  const box = el('div.uxw-legacy', kids);
  swapEmoji(box, '#ffb81f');
  return box;
}

// ---------------------------------------------------------------- ランドマップ（航路図）

let sel: string | null = null;
let selCur: string | null = null;
let lastBody: HTMLElement | null = null;
let sceneOff: (() => void) | null = null;

export function openLandUx(ctx: Ctx) {
  W.open(
    ctx,
    t('ランドマップ', 'Land map'),
    (body) => render(ctx, body),
    () => {
      sceneOff?.();
      sceneOff = null;
      lastBody = null;
    },
  );
}

function render(ctx: Ctx, body: HTMLElement) {
  const s = ctx.s();
  const land = s.land;
  const again = body === lastBody;
  lastBody = body;
  body.classList.add('uxw-ln', 'ux-root');
  body.classList.toggle('is-again', again);
  // 曲はセクタ選択へ（閉じたら戻る）
  sceneOff ??= uxScene('sector');
  if (!land) {
    body.append(el('div.uxw-ln-none', ico('lock', '#97a1cf', 3), el('p', t('ランドのふちの関所を開くと、ほかのランドセクタへ行けるようになります。', 'Open the gate at the edge of the land to reach other sectors.'))));
    return;
  }
  if (selCur !== land.cur) {
    selCur = land.cur;
    sel = null;
  }
  sel ??= land.cur;

  // ---- 航路図
  const chart = el('div.uxw-ln-chart', { role: 'group', 'aria-label': t('ランドの航路図', 'Land chart') });
  const svg = sv('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', class: 'uxw-ln-svg', 'aria-hidden': 'true' });
  svg.append(sv('path', { d: 'M4,62 C0,48 6,36 14,32 C14,18 30,12 42,10 C46,2 58,2 62,8 C76,10 88,16 88,30 C96,36 100,50 97,62 C100,76 98,94 86,97 C66,100 34,100 14,97 C2,95 0,76 4,62 Z', class: 'uxw-ln-isle' }));
  for (const [a, b] of W.ROADS) {
    const A = W.sectorDef(a).at;
    const B = W.sectorDef(b).at;
    const on = land.mine.includes(a) && land.mine.includes(b);
    svg.append(sv('line', { x1: `${A[0]}`, y1: `${A[1]}`, x2: `${B[0]}`, y2: `${B[1]}`, class: `uxw-ln-road${on ? ' is-on' : ''}` }));
  }
  chart.append(svg, el('i.uxw-ln-scan'));
  const nodes = new Map<string, HTMLElement>();
  W.SECTORS.forEach((d, k) => {
    const st = W.sectorState(land, d.id);
    const noLetter = W.letterLocked(s, d.id);
    const look = nodeLook(st, noLetter);
    const name = st === 'cloud' ? '???' : d.name;
    const b = el<HTMLButtonElement>(`button.uxw-ln-node.is-${st}${look.can ? '.is-can' : ''}`, { type: 'button', 'aria-label': t(`${name}：${look.word}`, `${name}: ${look.word}`), 'data-ux-quiet': '' });
    b.dataset.sector = d.id;
    b.style.left = `${d.at[0]}%`;
    b.style.top = `${d.at[1]}%`;
    b.style.setProperty('--tc', W.TIERS[d.tier].color);
    b.style.setProperty('--nw', String(NAME_W[d.tier] ?? 24));
    b.style.animationDelay = `${k * 18}ms`;
    const key = el('span.uxw-ln-key', el('b.ux-num', d.tier), look.ico ? ico(look.ico, st === 'here' ? '#1a1c2e' : st === 'mine' ? '#36e08b' : look.can ? '#5fe4ff' : '#97a1cf') : el('i.uxw-ln-q', '?'));
    b.append(key);
    // 右上：制覇した町は王冠、まだなら最新の順位。1 位を 2 か月続けたのに発表がまだなら、王冠と手紙
    if (st === 'here' || st === 'mine') {
      const rk = W.lastRank(s, d.id);
      const crown = W.crowned(s, d.id);
      const wait = st === 'here' && W.clearWaiting(s);
      if (rk || crown) b.append(el(`span.uxw-ln-rank${crown ? '.is-crown' : ''}`, crown ? inkIco('crown') : wait ? [inkIco('crown'), inkIco('mail')] : el('b.ux-num', t(`${rk}位`, `#${rk}`))));
      const rv = W.reviveView(s, d.id);
      // 被災した町：赤い札（復興を任せているあいだは、槌の絵の琥珀の札）。軒数は、選ぶと下の帯とくわしい札に出る
      if (rv && rv.ruins > 0) {
        const fixing = rv.hero != null && rv.fund > 0;
        b.append(el(`span.uxw-ln-ruin${fixing ? '.is-fix' : ''}`, { title: W.reviveLine(rv).replace(/\p{Extended_Pictographic}\uFE0F?\s*/gu, '') }, ico(fixing ? 'hammer' : 'warn', '#1a1c2e')));
        const hit = fixing ? t(`復興中 ${rv.fixed}/${rv.all}`, `rebuilding ${rv.fixed}/${rv.all}`) : t('被災', 'hit');
        b.setAttribute('aria-label', t(`${name}：${look.word}・${hit}`, `${name}: ${look.word}, ${hit}`));
      }
    }
    if (st === 'here') b.append(el('i.uxw-ln-pin', wIcon('pin', { color: '#ffb81f', scale: 2 })));
    b.append(el('span.uxw-ln-name', name));
    b.addEventListener('click', () => pick(d.id));
    nodes.set(d.id, b);
    chart.append(b);
  });

  // ---- 見分け方（絵と言葉）
  const legend = el(
    'div.uxw-ln-legend',
    { 'aria-label': t('札の見分け方', 'Legend') },
    (['here', 'mine', 'open', 'locked'] as SectorState[]).map((st) => {
      const lk = nodeLook(st);
      return el(`span.uxw-ln-leg.is-${st}`, el('i', lk.ico ? ico(lk.ico, st === 'here' ? '#1a1c2e' : st === 'mine' ? '#36e08b' : lk.can ? '#5fe4ff' : '#97a1cf') : null), el('span', st === 'locked' ? t('まだ', 'Locked') : lk.word));
    }),
  );
  const intro = el('p.uxw-ln-intro', t('いまいるランドの全体図。ほかのセクタに出店すると、いまのセクタはセクター長が運営し、利益の一部が本社に入ります。', 'The whole land. When you open in another sector, a sector head runs this one and sends part of the profit to HQ.'));

  // ---- 下の帯（選んだセクタ）と、くわしい札
  const bar = el('div.uxw-ln-bar');
  const slot = el('div.uxw-ln-slot');
  const paint = (flap: boolean) => {
    const id = sel!;
    for (const [k, n] of nodes) n.classList.toggle('is-sel', k === id);
    const d = W.sectorDef(id);
    const st = W.sectorState(land, id);
    const look = nodeLook(st, W.letterLocked(s, id));
    const more = uxKey(t('くわしく', 'Details'), () => slot.scrollIntoView({ block: 'start', behavior: isCalm() ? 'auto' : 'smooth' }), { ico: 'down' });
    const lamp = look.lamp != null ? uxLamp(look.lamp, true, look.can) : null;
    bar.replaceChildren(el('div.uxw-ln-barin', tierPlate(d), el('div.uxw-ln-barid', el('b', st === 'cloud' ? '???' : d.name), el('span', lamp, st === 'cloud' ? look.word : W.stateText(s, d, st))), more));
    slot.replaceChildren(detail(ctx, s, id));
    if (flap) {
      bar.classList.remove('is-flap');
      slot.classList.remove('is-flap');
      void bar.offsetWidth;
      bar.classList.add('is-flap');
      slot.classList.add('is-flap');
    }
  };
  const pick = (id: string) => {
    if (id === sel) return slot.scrollIntoView({ block: 'nearest', behavior: isCalm() ? 'auto' : 'smooth' });
    sel = id;
    uxSfx('flap');
    paint(true);
  };
  paint(false);
  body.append(el('div.uxw-ln-top', legend), chart, bar, slot, intro);
  // 開いたとき：いまいる町が見える所まで送る（下の帯に隠れない）
  if (!again) requestAnimationFrame(() => nodes.get(land.cur)?.querySelector('.uxw-ln-key')?.scrollIntoView({ block: 'center' }));

  // ---- 出店したセクタの先月の売上の比べ（今のグラフ：縦の棒）
  if (land.mine.length >= 2) {
    const bars = W.sectorBars({ id: land.cur, rev: s.reports[s.reports.length - 1]?.revenue ?? null }, land.recs, land.mine, (id) => W.sectorDef(id).name);
    const top = Math.max(1, ...bars.map((b) => b.v));
    const tags = bars.filter((b) => b.none || !b.head).map((b) => t(`${b.name}：${b.none ? '締めの記録なし' : 'セクター長なし'}`, `${b.name}: ${b.none ? 'no close yet' : 'no head'}`));
    body.append(
      el(
        'section.uxw-ln-sales',
        { 'aria-label': t('セクタごとの先月の売上', 'Last month’s sales by sector') },
        secHead(t('セクタごとの先月の売上', 'Last month’s sales by sector'), 'coin'),
        el('p.uxw-ln-tags', t(`いちばんは${bars[0].name}`, `Top: ${bars[0].name}`)),
        el(
          'div.uxw-vbars',
          bars.map((b, k) => {
            const bar = el('i');
            bar.style.transform = `scaleY(${Math.max(0.02, b.v / top).toFixed(3)})`;
            bar.style.animationDelay = `${k * 70}ms`;
            return el(`div.uxw-vbar${b.me ? '.is-me' : ''}`, el('b.ux-num', W.money(b.v)), el('span.uxw-vbar-col', bar), el('span.uxw-vbar-name', b.me ? ico('pin', '#ffb81f') : null, el('span', b.name)));
          }),
        ),
        tags.length ? line('warn', tags.join(t('・', ' · ')), 'dim') : null,
      ),
    );
  }
}

/** くわしい札（今の detail() と同じ中身） */
function detail(ctx: Ctx, s: P1State, id: string): HTMLElement {
  const land = s.land!;
  const d = W.sectorDef(id);
  const st = W.sectorState(land, id);
  const T = W.TIERS[d.tier];
  const noLetter = W.letterLocked(s, id);
  const look = nodeLook(st, noLetter);
  const kind = goKind(st, { noLetter, rankUp: st === 'open' && !!W.rankUpTier(s, id), fee: d.fee, money: s.money });
  const box = el(`section.uxw-ln-detail.ux-plate.is-${st}`, { 'aria-label': st === 'cloud' ? '???' : d.name }, el('div.ux-screws'));
  box.dataset.sector = id;
  box.dataset.go = kind;
  const img = el<HTMLImageElement>('img.uxw-ln-dico', { alt: '', draggable: 'false' });
  img.src = W.sectorIcon(d.tier);
  box.append(el('div.uxw-ln-dhead', img, el('div.uxw-ln-did', el('h3', st === 'cloud' ? '???' : d.name), el('span.uxw-ln-dtier', tierPlate(d), el('span', W.tierLabel(d.tier)), stateTape(look)))));
  if (st === 'cloud') {
    box.append(line('lock', t('雲に覆われていて、まだ移動できない。', 'Covered in clouds. You cannot go there yet.'), 'dim'));
    return box;
  }
  if (d.profile.tag) box.append(el('p.uxw-ln-tag', d.profile.tag));
  box.append(el('p.uxw-ln-note', W.TIER_NOTE[d.tier]));
  if (d.teaser) box.append(line('star', d.teaser, 'warn'));
  // 目標（2 か月続けて 1 位＋研究成果の発表）と、制覇の進み
  if (st === 'here' || st === 'mine') {
    const rk = W.lastRank(s, id);
    const done = W.crowned(s, id);
    box.append(
      line(
        done ? 'crown' : 'flag',
        done
          ? t(`このセクタを制覇しました（2 か月続けて 1 位＋研究成果の発表。最新 ${rk ?? 1} 位）`, `Conquered: #1 two months running + findings (latest #${rk ?? 1})`)
          : rk
            ? t(`目標：2 か月続けてエリア 1 位＋研究成果の発表（最新 ${rk} 位）`, `Goal: #1 in the area two months running + present findings (latest #${rk})`)
            : t('目標：2 か月続けてエリア 1 位＋研究成果の発表（まだ月の締めがありません）', 'Goal: #1 in the area two months running + present findings (no monthly close yet)'),
        done ? 'good' : 'dim',
      ),
    );
    if (!done) {
      if (st === 'here') {
        const g = W.clearGoal(s);
        if (g.all > 0) box.append(line('check', bare(W.clearCondText(g.streak, g)[0]), g.top && !g.present ? 'warn' : 'dim'));
      } else if (W.DIG_SITES[id]) box.append(line('pick', s.presented.includes(id) ? t('研究成果の発表 済（あとは 1 位を 2 か月）', 'Findings presented (now #1 for 2 months)') : t('研究成果の発表：まだ（このセクタのお題をそろえよう）', 'Findings: not yet (find this sector’s targets)'), 'dim'));
    }
  }
  // 数字
  const tune = W.RIVAL_TUNE[d.tier];
  const rb = tune ? Math.round(T.rival * tune.base * (tune.town[id] ?? 1) * 10) / 10 : null;
  const stat = (k: string, v: string, sub = '') => el('div.uxw-ln-stat', el('span', k), el('b.ux-num', v), sub ? el('small', sub) : null);
  box.append(
    el(
      'div.uxw-ln-stats',
      stat(t('地図', 'Map'), `${T.n}×${T.n}`, t('マス', 'cells')),
      stat(t('商売敵の規模', 'Rivals'), `×${T.rival}`, rb ? t(`売上 ×${rb}`, `sales ×${rb}`) : ''),
      stat(t('お客さん', 'Customers'), `×${T.demand}`),
      stat(t('Common の売れやすさ', 'Common goods'), `×${T.commonPull}`),
    ),
  );
  // 進出の決め
  if (kind === 'here') {
    box.append(line('pin', t('いまこのセクタを経営しています。', 'You are running this sector now.'), 'good'));
    const rv = W.reviveView(s, id);
    if (rv && rv.ruins > 0) box.append(line('warn', t(`この町は被災しています（廃墟 ${rv.ruins} 軒）。廃墟をタップして修繕しよう。ほかの町へ移るときは、ヒーローに復興を任せられます。`, `This town was hit (${rv.ruins} ruins). Tap a ruin to repair it. When you move on, you can leave the recovery to a hero.`), 'warn'));
  } else if (kind === 'letter') {
    box.append(secHead(t('進出', 'Expand'), 'compass'), el('div.uxw-gap-row', el('span', t('出店許可申請', 'Permit')), el('b.ux-num', W.money(d.fee))), line('mail', W.letterLockOf(s, id), 'warn'), uxKey(t('出店する', 'Open here'), undefined, { disabled: true }));
  } else if (kind === 'rankup') {
    box.append(
      secHead(t('進出', 'Expand'), 'compass'),
      line('warn', t(`${W.TIER_NAME[d.tier]} へ進出すると、ランドの復興のため大きな災害と徴収が起きます（出店許可申請の費用はかかりません）。`, `Expanding into ${W.TIER_NAME[d.tier]} brings a great disaster and a levy for the land’s recovery (no permit fee).`), 'warn'),
      uxKey(t(`${W.TIER_NAME[d.tier]} へ進出する…`, `Expand into ${W.TIER_NAME[d.tier]}…`), safe(() => openRankUpUx(ctx, id)), { kind: 'main', big: true, ico: 'next' }),
    );
  } else if (kind === 'short') {
    box.append(secHead(t('進出', 'Expand'), 'compass'), gapBox(t('出店許可申請', 'Permit'), d.fee, s.money), uxKey(t('出店する', 'Open here'), undefined, { disabled: true }));
    if (W.hasBusiness(s)) box.append(line(null, t('いまのセクタは、セクター長に任せます（次に選びます）。', 'You will pick a sector head for the current sector next.'), 'dim'));
  } else if (kind === 'move') {
    box.append(
      secHead(t('進出', 'Expand'), 'compass'),
      leverBox({
        what: t(`${d.name}に出店する`, `Open in ${d.name}`),
        rows: [
          [t('出店許可申請', 'Permit'), W.money(d.fee)],
          [t('払ったあとの資金', 'Funds after'), W.money(Math.round(s.money - d.fee))],
        ],
        label: t('出店', 'GO'),
        cap: t('引いて出店', 'Pull to open'),
        done: [t('未申請', 'Pending'), t('申請済', 'Filed')],
        go: () => W.startMove(ctx, id),
      }),
    );
    if (W.hasBusiness(s)) box.append(line(null, t('いまのセクタは、セクター長に任せます（次に選びます）。', 'You will pick a sector head for the current sector next.'), 'dim'));
  } else if (kind === 'go') {
    const rv = W.reviveView(s, id);
    box.append(legacyBox(rv && rv.ruins > 0 ? W.reviveBox(ctx, s, id) : W.managerBox(ctx, s, id)));
    box.append(uxKey(t('このセクタへ移動する', 'Go to this sector'), safe(() => W.startMove(ctx, id)), { kind: 'main', big: true, ico: 'next' }));
  } else if (kind === 'locked') {
    const have = d.need ? land.mine.filter((x) => W.sectorDef(x).tier === d.need!.tier).length : 0;
    const m = uxMeter(gapRate(have, d.need?.n ?? 1), 'cyan');
    box.append(secHead(t('開放の条件', 'To unlock'), 'lock'), line('lock', W.needText(s, d), 'warn'), m.el);
  } else if (kind === 'soon') {
    box.append(line('gear', t('開放されました！ このセクタの遊びは準備中です。', 'Unlocked! This sector is coming soon.'), 'dim'));
  }
  return box;
}

// ---------------------------------------------------------------- ランクが上がる進出の確かめ

export function openRankUpUx(ctx: Ctx, target: string) {
  const d = W.sectorDef(target);
  const tn = W.TIER_NAME[d.tier];
  W.open(ctx, t(`${tn} への進出`, `Expanding into ${tn}`), (body) => {
    const s = ctx.s();
    body.classList.add('uxw-ru', 'ux-root');
    const nth = (s.resets?.length ?? 0) + 1;
    const img = el<HTMLImageElement>('img.uxw-ln-dico', { alt: '', draggable: 'false' });
    img.src = W.sectorIcon(d.tier);
    body.append(
      el(
        'div.uxw-ru-head',
        img,
        el(
          'div',
          el('span.uxw-ru-alarm', uxLamp('bad', true, true), ico('warn', '#1a1c2e'), el('b', t('災害と徴収', 'Disaster & levy'))),
          el(
            'p',
            nth > 1
              ? t(`${tn} へ進出すると、ランドの復興のため ${nth} 回目の大きな災害と徴収が起きます`, `Expanding into ${tn} brings great disaster no. ${nth} and a levy for the land’s recovery`)
              : t(`${tn} へ進出すると、ランドの復興のため大きな災害と徴収が起きます`, `Expanding into ${tn} brings a great disaster and a levy for the land’s recovery`),
          ),
        ),
      ),
    );
    const cash = Math.max(0, Math.round(s.money));
    const lose = el(
      'section.uxw-ru-col.is-lose',
      el('h3', ico('minus', '#ff5964'), t('失うもの', 'You lose')),
      el(
        'ul',
        el('li', ico('minus', '#ff5964'), el('span', t('所持金（全部）', 'All funds'), el('span.uxw-ru-cash', rollNumber('uxw.ru.cash', cash, { digits: Math.max(6, String(cash).length), size: 's' }).el, el('b.ux-num', 'G')))),
        [
          t('すべてのセクタの建物（お店・工房・倉庫・展示館など。中の在庫・素材も）', 'Buildings in every sector (shops, workshops, warehouses, museum… with their stock and materials)'),
          t('お金で開けたパネル（菱形）', 'Panels bought with funds (diamonds)'),
          t('設備投資・アルバイト', 'Upgrades and part-timers'),
        ].map((x) => el('li', ico('minus', '#ff5964'), el('span', x))),
      ),
    );
    const rp = Math.round(s.rp ?? 0);
    const ant = W.antiquesHeld(s, d.tier);
    const keep = el(
      'section.uxw-ru-col.is-keep',
      el('h3', ico('check', '#36e08b'), t('残るもの', 'You keep')),
      el(
        'ul',
        el('li', ico('check', '#36e08b'), el('span', t(`研究ポイント（いま ${rp.toLocaleString('en-US')} RP）`, `Research points (now ${rp.toLocaleString('en-US')} RP)`))),
        [
          t('RP で開けたパネル（研究パネル・無限パネル）', 'Panels opened with RP (research and ∞ panels)'),
          t('ヒーロー（能力値も）', 'Heroes (and their stats)'),
          t('研究ノートと研究 Lv・復刻品のレシピ', 'Research notes, research Lv and revival recipes'),
          t('制覇とエンブレム・ブランド力・調査依頼状', 'Conquests, emblems, brand and survey requests'),
          t('ダンジョンの最深記録・研究への寄付の回数', 'Deepest dungeon record and donation count'),
        ].map((x) => el('li', ico('check', '#36e08b'), el('span', x))),
        ant.n > 0
          ? el('li.is-good', ico('box', '#36e08b'), el('span', t(`倉庫の骨董 ${ant.n} 個（${ant.kinds} 種）：新しい町の倉庫へ運ぶ。${tn} の町でそのまま並べられる`, `${ant.n} antiques in storage (${ant.kinds} kinds): moved to the new town’s storage, ready for ${tn}-town shelves`)))
          : d.tier === 'E'
            ? el('li.is-dim', ico('box', '#97a1cf'), el('span', t('骨董（ダンジョンの Rare 以上の復刻品）は、作って倉庫に置いておけば失わずに運べる（いまは 0 個）', 'Antiques (revivals of dungeon Rare-and-up relics) kept in storage come along safely (none now)')))
            : null,
      ),
    );
    body.append(el('div.uxw-ru-cols', lose, keep));
    const n = (s.land?.mine ?? []).length;
    const tiers = [...new Set((s.land?.mine ?? []).map((x) => W.TIER_NAME[W.sectorDef(x).tier]))].join(t('・', ', '));
    body.append(
      el(
        'p.uxw-ru-grant',
        t(
          `新しい町は、ランドからの復興の支度金 ${W.money(W.grantOf(d.tier))} で始めます。被災するのは、いままで出店した ${n} つの町すべて（${tiers}）。被災した町は、手で直すか、ヒーローに復興を任せられます。出店許可申請の費用はかかりません。`,
          `You start the new town with a ${W.money(W.grantOf(d.tier))} recovery grant from the land. All ${n} towns you have opened (${tiers}) are hit. Ruined towns can be repaired by hand or left to a hero. No permit fee.`,
        ),
      ),
    );
    // マインちゃんのひと言（寄付）
    const mi = el<HTMLImageElement>('img.uxw-ru-mine', { alt: '', draggable: 'false' });
    mi.src = W.assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
    body.append(
      el(
        'div.uxw-ru-say',
        mi,
        el('div.uxw-ru-bubble', uxTape(t('マインちゃん', 'Mine'), ''), el('p', sayParts(W.DONATE_LINE()).map(([x, em]) => (em ? el('b.uxw-em', x) : x)))),
        uxKey(t('寄付パネルを開く', 'Open the donation panel'), safe(() => ctx.skills?.('dig_donate')), { ico: 'coin' }),
      ),
    );
    // 決め：レバー（進出）と「まだやめておく」
    body.append(
      el(
        'div.uxw-ru-acts.ux-plate',
        el('div.ux-screws'),
        leverBox({
          what: t(`${tn} へ進出する`, `Expand into ${tn}`),
          rows: [
            [t('支度金', 'Grant'), W.money(W.grantOf(d.tier))],
            [t('被災する町', 'Towns hit'), `${n}`],
          ],
          label: t('進出', 'GO'),
          cap: t('引いて進出', 'Pull to expand'),
          done: [t('未決定', 'Pending'), t('決定', 'Decided')],
          danger: true,
          go: () => W.startMove(ctx, target),
        }),
        uxKey(t('まだやめておく', 'Not yet'), safe(() => W.openLand(ctx)), { kind: 'weak' }),
      ),
    );
  });
}

// ---------------------------------------------------------------- となりの町の窓（境界の名前・縮小の札から）

export function openSectorCardUx(v: SectorCardView) {
  const m = el('div.isl-modal.isl-sectm.ux-root.uxw-sc');
  m.dataset.sector = v.id;
  const close = () => {
    m.remove();
    uxSfx('close');
  };
  const d = W.sectorDef(v.id);
  const cloud = v.state === 'cloud';
  const look = nodeLook(v.state, v.kind === 'letter');
  const p = el('section.uxw-sc-panel.ux-plate', { role: 'dialog', 'aria-label': cloud ? '???' : d.name }, el('div.ux-screws'));
  p.append(el('div.uxw-ln-dhead', tierPlate(d, true), el('div.uxw-ln-did', el('span.uxw-sc-role', ico('compass', '#5fe4ff'), t('となりの町', 'Next town')), el('h3', cloud ? '???' : d.name), el('span.uxw-ln-dtier', el('span', W.tierLabel(d.tier)), stateTape(look)))));
  if (!cloud) {
    if (d.profile.tag) p.append(el('p.uxw-ln-tag', d.profile.tag));
    p.append(el('p.uxw-ln-note', W.TIER_NOTE[d.tier]));
    const facts = el('div.uxw-sc-facts', el('span', ico('shop', '#97a1cf'), t(`他社 ${v.rivals} 社`, `${v.rivals} rivals`)));
    if (v.hot.length) facts.append(el('span.uxw-sc-hot', ico('fire', '#ffb81f'), t('需要の多い商品：', 'In demand: '), v.hot.map((x) => [x.icon, el('b', x.name)])));
    p.append(facts);
  }
  const go = safe(() => {
    close();
    v.go();
  });
  if (v.kind === 'move')
    p.append(
      leverBox({
        what: t(`${d.name}に進出する`, `Expand into ${d.name}`),
        rows: [
          [t('入国料', 'Permit'), W.money(v.fee)],
          [t('払ったあとの資金', 'Funds after'), W.money(Math.round(v.money - v.fee))],
        ],
        label: t('進出', 'GO'),
        cap: t('引いて進出', 'Pull to expand'),
        done: [t('未申請', 'Pending'), t('申請済', 'Filed')],
        go: () => {
          close();
          v.go();
        },
      }),
    );
  else if (v.kind === 'short') p.append(gapBox(t('入国料', 'Permit'), v.fee, v.money));
  else if (v.why) p.append(line(v.kind === 'letter' ? 'mail' : 'lock', bare(v.why), 'warn'));
  const keys = el('div.uxw-sc-keys');
  if (v.kind === 'go') keys.append(uxKey(t(`${d.name}へ移動`, `Go to ${d.name}`), go, { kind: 'main', big: true, ico: 'next' }));
  else if (v.kind === 'rankup') keys.append(uxKey(t('進出する（災害と徴収あり）…', 'Expand (disaster & levy)…'), go, { kind: 'main', big: true, ico: 'next' }));
  else if (v.kind !== 'move') keys.append(uxKey(t(`進出する（入国料 ${W.money(v.fee)}）`, `Expand (permit ${W.money(v.fee)})`), undefined, { disabled: true }));
  keys.append(uxKey(t('閉じる', 'Close'), safe(close), { kind: 'weak' }));
  p.append(keys);
  m.addEventListener('click', (e) => {
    if (e.target === m) close();
  });
  m.addEventListener('pointerdown', (e) => e.stopPropagation());
  m.append(p);
  v.host.append(m);
  uxSfx('open');
}

// ---------------------------------------------------------------- 地図の上の札（縮小の札・境界の名前・吹き出し）の着せ替え

const EMOJI_ICO: Record<string, string> = { '👑': 'crown', '📍': 'pin', '🔒': 'lock', '📦': 'box', '📜': 'mail', '🗺': 'compass', '🏪': 'shop', '🔥': 'fire', '💴': 'coin', '🏚': 'warn', '🏗': 'hammer', '⚠': 'warn', '⛏': 'pick', '💣': 'bomb', '⏱': 'clock', '📅': 'cal', '🔩': 'drill', '📖': 'book', '💥': 'fire' };
/** 文の中の絵文字を、ドットの絵に替える（知らない絵文字は外す）。root の中の文字だけを書き換える（要素・聞き手はそのまま） */
export function swapEmoji(root: HTMLElement, color = '#1a1c2e') {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  for (const tx of texts) {
    const src = tx.data;
    if (!/\p{Extended_Pictographic}/u.test(src)) continue;
    const out: (Node | string)[] = [];
    let buf = '';
    for (const ch of src) {
      if (/\p{Extended_Pictographic}/u.test(ch)) {
        if (buf) out.push(buf);
        buf = '';
        const name = EMOJI_ICO[ch];
        if (name) out.push(wIcon(name, { color, hi: color, lo: color, scale: 1 }));
      } else if (ch !== '️' && ch !== '‍') buf += ch;
    }
    if (buf.trim() || !out.length) out.push(buf);
    tx.replaceWith(...out);
  }
}
/** 地図の上の札（.isl-wbadge）・吹き出しの中身：絵文字をドットの絵に。見た目は land.css（今の要素を着せ替える） */
export function decoWorldUx(e: HTMLElement, kind: 'badge' | 'pop') {
  e.classList.add('uxw-deco');
  swapEmoji(e, kind === 'badge' ? '#f4ecd4' : '#ffb81f');
}
