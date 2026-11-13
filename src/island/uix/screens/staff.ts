/**
 * 段 UIX3h：ヒーローの配置（名簿と持ち場）・人材登用（候補の札をめくって採る）。方向 C「管制卓」。入のときだけ（docs/ISLAND_UIX.md「画面：職人と採用」）。
 * 出す中身・押す先は今の画面（p1/screens.ts の openStaff・openHire・heroCard・buyerSlot）と同じ。本体の関数は束（H）から使う。
 *
 * ヒーローの配置
 * - 上：数字の札（ヒーロー・待機中・仕事中）
 * - 持ち場 ① 調達 → ② 製造 → ③ 物流 → ④ 販売：節の見出し（埋まった数のランプ）・説明・枠（今の目印 .isl-slot・is-hot・is-empty）
 *   枠は押すキー（顔・名前・その仕事のランク・スタミナの計器・Lv・休憩中）。外すのは枠の右上の「外す」のキー。置いた枠には「配置」が打たれる
 * - 役目の札（チュートリアルの 1 か月目は出さない：今のまま）・そのほかの仕事（開拓・調査・修行の進み）
 * - 待機中の名簿：同じ形のヒーローの札。押して選ぶと、枠が光り、押した枠にそのまま置く（今の「持っている」）
 * - 下に貼りつく帯：給与・労務（弱い）・ヒーローの育成（Lv の上がった人がいれば）・人材登用（主のキー）
 * 人材登用
 * - 待機中の人を配置する（今の目印 .isl-btn.is-on・チュートリアルで is-guide）
 * - 数字の札（資金・候補・名簿）と、名簿の顔の列（雇った人が飛んで入る）
 * - 候補の札：押すとめくれて人事票（能力の縦の棒・契約金と月給・足りなければ「あと N G」）と「雇う」のキー（今の目印 .isl-hero-card・is-rec の中の .isl-btn.is-on）。
 *   はじめは、いちばん向いている人（チュートリアルなら調達にいちばん向いている人）をめくっておく（押す回数は今と同じ）
 * - カリスマ度の札（今の charismaCard。人事の画面で組み直したものを使う）・候補が 0 人のときの理由
 */
import { t } from '../../../i18n';
import { el, type Kid } from '../dom';
import { coinsFly } from '../fx';
import { isCalm } from '../prefs';
import { rollNumber, shake, uxKey, uxLamp, uxMeter } from '../parts';
import { uxSfx } from '../sound';
import { uxpEmpty, uxpFoot, uxpGap, uxpPaper, uxpStamp, uxpStat } from '../sparts';
import { H } from './h-deps';
import { aptBars, bestLine, bestTask, enter, face, flyTo, hIcon, heroCard, ink, keepOpen, keyLabel, lite, liveDraw, mid, rankChip, rarOf, rarTag, sect } from './h-kit';
import { charismaPanel } from './hr';
import { openHeroSheet } from './hero';
import './h-screens.css';
import type { Ctx } from '../../p1/screens';
import type { Task } from '../../p1/data';
import type { P1State, Staff } from '../../p1/model';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）
/** 持ち場の枠の鍵（置いた枠に印を打つため、描き直しの前後で比べる） */
export const slotKey = (task: Task, target: number | string | null, k = 0) => `${task}:${target ?? ''}:${k}`;
/** 前と今の枠の中身から、新しく人が入った枠の鍵 */
export function newlyPut(before: Map<string, number | null>, now: Map<string, number | null>): string[] {
  const out: string[] = [];
  for (const [k, v] of now) if (v != null && before.has(k) && before.get(k) !== v) out.push(k);
  return out;
}
/** チュートリアル（調達係を雇う段）：調達にいちばん向いている候補（今の画面と同じ選び方。見習いの 3 人のほかに誰もいないときだけ） */
export const APPRENTICES = [10001, 10002, 10003];

/** 待機中のヒーローを選んでから枠を押すと、そのまま割り当てる（今の holding と同じ） */
let holding: number | null = null;
/** 前に描いたときの枠の中身（置いた枠に「配置」を打つ。まとめた画面は描き直しのたびに作り直すので、外に覚える） */
let lastSlots = new Map<string, number | null>();

// ================================================================= ヒーローの配置
export function openStaffUx(ctx: Ctx) {
  holding = null;
  lastSlots = new Map();
  keepOpen(ctx, t('ヒーローの配置', 'Hero assignment'), staffScreen);
}

function staffScreen(ctx: Ctx, body: HTMLElement) {
  const root = el('div.uxh-st');
  const tipBox = el('div.uxh-tip');
  const page = el('div.uxh-page');
  const foot = el('div.uxh-footbox');
  root.append(tipBox, page, foot);
  body.append(root);
  const before = () => lastSlots;
  const redraw = () => H.after(ctx);

  return liveDraw(root, (anim: boolean) => {
    const s = ctx.s();
    const motion = anim && !isCalm();
    tipBox.replaceChildren();
    H.mineTip(ctx, 'staff', tipBox);
    const now = new Map<string, number | null>();
    const slotEls = new Map<string, HTMLElement>();
    const out: HTMLElement[] = [];

    const put = (task: Task, target: number | string | null, title: string, current: number | null, remove?: () => void) => () => {
      if (holding != null) {
        if (task === 'buy') for (const x of s.staff) if (x.task === 'buy' && x.hero !== holding) H.assign(s, x.hero, null);
        if (remove && current != null) remove();
        H.assign(s, holding, task, target);
        holding = null;
        redraw();
        return;
      }
      H.pickHero(ctx.root, s, {
        title,
        task,
        current,
        onPick: (v) => {
          if (task === 'buy') for (const x of s.staff) if (x.task === 'buy' && x.hero !== v) H.assign(s, x.hero, null);
          if (v == null) {
            if (current != null) H.assign(s, current, null);
          } else {
            if (remove && current != null && current !== v) remove();
            H.assign(s, v, task, target);
          }
          redraw();
        },
      });
    };
    const slot = (key: string, o: { label: string; task: Task; hero: number | null; hot?: boolean; onTap: () => void; onRemove?: () => void }) => {
      now.set(key, o.hero);
      const e = slotEl(s, o);
      slotEls.set(key, e);
      return e;
    };

    // ---- 数字の札
    const free = s.staff.filter((x) => x.task == null);
    const stats = el(
      'div.uxp-stats.uxh-stats',
      uxpStat(t('ヒーロー', 'Heroes'), s.staff.length, { key: 'uxh.st.n', unit: t('人', ''), digits: 2, size: 's' }).el,
      uxpStat(t('待機中', 'Free'), free.length, { key: 'uxh.st.free', unit: t('人', ''), digits: 2, size: 's', tone: free.length ? 'amber' : '' }).el,
      uxpStat(t('仕事中', 'Working'), s.staff.length - free.length, { key: 'uxh.st.work', unit: t('人', ''), digits: 2, size: 's' }).el,
    );
    out.push(stats);
    out.push(
      el(
        'p.uxh-note',
        t(
          '① 調達 → ② 製造 → ③ 物流 → ④ 販売 の枠にヒーローを置くと、サイクルが自動で回ります。枠を押すと向いているヒーローの順に出ます。下の「待機中」のヒーローを押してから枠を押しても置けます。',
          'Put heroes in ① Buy → ② Craft → ③ Haul → ④ Sell and the cycle runs by itself. Tap a slot to see the best fits, or tap a free hero below, then a slot.',
        ),
      ),
    );

    // ---- 持ち場
    const hot = holding != null;
    const lanes = el('div.uxh-lanes.isl-lanes');
    const lane = (n: string, title: string, slots: HTMLElement[], note: string, filled: number, total: number) =>
      el(
        'section.uxh-lane',
        sect([el('b.ux-num.uxh-lane-n', n), el('b', title)], 'people', { kind: 'dark', right: el('span.uxh-lane-c', uxLamp(filled ? 'good' : '', filled > 0), el('span.ux-num', `${filled}/${total}`)) }),
        el('p.uxh-lane-note', note),
        el('div.uxh-slots.isl-slots', slots),
      );
    // ① 調達
    const buyer = s.staff.find((x) => x.task === 'buy');
    lanes.append(
      lane(
        '①',
        t('調達', 'Buy'),
        [
          slot(slotKey('buy', null), {
            label: t('調達係', 'Buyer'),
            task: 'buy',
            hero: buyer?.hero ?? null,
            hot: hot || (ctx.step?.() === 'hire' && !buyer),
            onTap: put('buy', null, t('調達の担当', 'Buyer'), buyer?.hero ?? null),
            onRemove: buyer ? () => (H.assign(s, buyer.hero, null), redraw()) : undefined,
          }),
        ],
        t('卸問屋まで歩いて素材を買い付ける（適性：INT 寄りのバランス）', 'Walks to the wholesaler to buy materials (balanced, a bit more INT)'),
        buyer ? 1 : 0,
        1,
      ),
    );
    // ② 製造
    lanes.append(
      lane(
        '②',
        t('製造', 'Craft'),
        s.slots.map((sl, k) =>
          slot(slotKey('craft', k), {
            label: t(`作業台 ${k + 1}`, `Bench ${k + 1}`),
            task: 'craft',
            hero: sl.worker,
            hot,
            onTap: put('craft', k, t(`作業台 ${k + 1} の職人`, `Crafter for bench ${k + 1}`), sl.worker),
            onRemove: sl.worker != null ? () => (H.assign(s, sl.worker!, null), redraw()) : undefined,
          }),
        ),
        t('工房でエクステを作る（適性：3 つの能力のバランス）', 'Makes extensions in the workshop (balance of all three stats)'),
        s.slots.filter((x) => x.worker != null).length,
        s.slots.length,
      ),
    );
    // ③ 物流：今いる運搬係＋空きの枠（3 人まで）
    const haulers = s.staff.filter((x) => x.task === 'transport');
    const hs = haulers.map((x, k) =>
      slot(slotKey('transport', null, k), {
        label: t('運搬係', 'Hauler'),
        task: 'transport',
        hero: x.hero,
        hot,
        onTap: put('transport', null, t('物流の担当', 'Hauler'), x.hero, () => H.assign(s, x.hero, null)),
        onRemove: () => (H.assign(s, x.hero, null), redraw()),
      }),
    );
    if (haulers.length < H.MAX_HAULERS)
      hs.push(
        slot(slotKey('transport', null, haulers.length), {
          label: t('運搬係', 'Hauler'),
          task: 'transport',
          hero: null,
          hot: hot || (ctx.step?.() === 'haul' && !haulers.length),
          onTap: put('transport', null, t('物流の担当', 'Hauler'), null),
        }),
      );
    lanes.append(lane('③', t('物流', 'Haul'), hs, t('工房からお店へ荷車で運ぶ（適性：PHY 重視）', 'Carts goods from the workshop to shops (mostly PHY)'), haulers.length, H.MAX_HAULERS));
    // ④ 販売
    const shops = H.myShops(s);
    lanes.append(
      lane(
        '④',
        t('販売', 'Sell'),
        shops.length
          ? shops.map((b) =>
              slot(slotKey('shop', b.uid), {
                label: H.DEF[b.id].name,
                task: 'shop',
                hero: s.shops[b.uid].staff,
                hot,
                onTap: put('shop', b.uid, t(`${H.DEF[b.id].name}の店員`, `Clerk for ${H.DEF[b.id].name}`), s.shops[b.uid].staff),
                onRemove: s.shops[b.uid].staff != null ? () => (H.assign(s, s.shops[b.uid].staff!, null), redraw()) : undefined,
              }),
            )
          : [el('p.uxh-dim', t('お店が開いたら店員を置けます', 'Assign a clerk once a shop opens'))],
        t('お店で棚に並べて売る（適性：INT 重視）', 'Shelves and sells in a shop (mostly INT)'),
        shops.filter((b) => s.shops[b.uid].staff != null).length,
        shops.length,
      ),
    );
    out.push(lanes);

    // ---- 役目（任せ方の 4 段）の札：チュートリアルの 1 か月目は出さない（今のまま。中身は任せる画面の担当）
    if (!ctx.step?.()) {
      const rc = H.rolesCard(ctx, s);
      if (rc) out.push(rc);
    }
    // ---- そのほかの仕事
    const others = s.staff.filter((x) => x.task === 'explore' || x.task === 'intel' || x.task === 'train');
    if (others.length) {
      const list = el('div.uxp-list.uxh-others');
      for (const x of others) {
        const train = x.task === 'train' && s.training?.hero === x.hero ? s.training : null;
        const m = train ? uxMeter(1 - train.left / train.total) : null;
        list.append(heroCard(x.hero, { win: 40, rarity: rarOf(x), level: x.level, desc: el(`span${x.task === 'train' ? '.uxh-amber' : ''}`, H.jobLabel(s, x)), foot: m ? m.el : undefined, cls: 'is-small', right: sheetKey(ctx, x.hero) }));
      }
      out.push(el('section.uxh-sec', sect(t('そのほかの仕事', 'Other jobs'), 'compass'), list));
    }
    // ---- 待機中の名簿
    const bench = el('section.uxh-sec.uxh-bench.isl-bench-free', sect(t(`待機中のヒーロー（${free.length}）`, `Free heroes (${free.length})`), 'people', { kind: 'dark' }));
    if (!free.length) bench.append(uxpEmpty(t('全員が仕事中です。人手が足りなければ「人材登用」で雇えます。', 'Everyone is working. Hire more under Recruiting.'), { ico: 'people' }));
    else {
      const grid = el('div.uxp-grid.uxh-roster');
      for (const x of free) {
        const card = heroCard(x.hero, {
          rarity: rarOf(x),
          level: x.level,
          desc: bestLine(x.stats, t('向いている：', 'Best at: ')),
          selected: holding === x.hero,
          breathe: true,
          cls: 'isl-hero-pick is-free',
          right: sheetKey(ctx, x.hero),
          onTap: () => {
            holding = holding === x.hero ? null : x.hero;
            redraw();
          },
        });
        grid.append(card);
      }
      bench.append(grid);
    }
    if (holding != null) bench.append(el('p.uxh-hold', hIcon('hire', ink), el('span', t(`${H.heroName(holding)}を選んでいます。置きたい枠を押してください。`, `${H.heroName(holding)} selected. Tap a slot.`))));
    out.push(bench);
    page.replaceChildren(...out);

    // ---- 下に貼りつく帯
    const keys: Kid[] = [uxKey(keyLabel('coin', t('給与・労務', 'Pay & welfare')), () => H.openPayroll(ctx), { kind: 'weak', ico: null, cls: 'uxh-k-pay' })];
    // ヒーローの育成（段 E1）：レベルが上がった人がいれば
    if (s.staff.some((x) => (x.level ?? 1) > 1)) keys.push(uxKey(keyLabel('rankup', t('ヒーローの育成', 'Hero growth')), () => H.openGrowth(ctx), { kind: 'weak', ico: null, cls: 'uxh-k-growth' }));
    keys.push(uxKey(keyLabel('hire', t('人材登用（雇う）', 'Recruit'), true), () => openHireUx(ctx), { kind: 'main', ico: null, cls: 'uxh-k-hire' }));
    foot.replaceChildren(uxpFoot(...keys));

    // ---- 動き：はじめて開いたとき＝札が順に入る／置いたとき＝その枠に「配置」が打たれる
    if (motion) enter([...page.querySelectorAll<HTMLElement>('.uxh-slot, .uxh-card')]);
    for (const k of newlyPut(before(), now)) {
      const box = slotEls.get(k);
      const stamp = uxpStamp(t('配置', 'Assigned'), { kind: 'good' });
      box?.closest('.uxh-slotbox')?.append(stamp.el);
      if (box) requestAnimationFrame(() => stamp.hit(box));
    }
    lastSlots = now;
  });
}

/** 人事票を開く小さなキー（名簿の札の右） */
const sheetKey = (ctx: Ctx, hero: number) => uxKey(keyLabel('doc', t('人事票', 'Profile')), () => openHeroSheet(ctx, hero), { kind: 'weak', ico: null, cls: 'uxh-k-sheet', attrs: { 'aria-label': t(`${H.heroName(hero)}の人事票`, `${H.heroName(hero)} profile`) } });

/** 持ち場の枠（今の slot() と同じ中身：ラベル・顔・名前・その仕事のランク・スタミナ・Lv・休憩中。外すのは右上の「外す」のキー） */
function slotEl(s: P1State, o: { label: string; task: Task; hero: number | null; hot?: boolean; onTap: () => void; onRemove?: () => void }): HTMLElement {
  const st: Staff | null = o.hero != null ? H.staffOf(s, o.hero) : null;
  const kids: Kid[] = [el('span.uxh-slot-label', o.label)];
  if (st) {
    const apt = Math.round(H.aptitude(st.stats, o.task));
    const sta = st.stamina / st.stats.hp;
    const m = uxMeter(sta, sta > 0.3 ? 'good' : '');
    m.el.classList.add(sta > 0.3 ? 'is-ok' : 'is-low');
    m.el.setAttribute('aria-label', t(`スタミナ ${Math.round(sta * 100)}%`, `Stamina ${Math.round(sta * 100)}%`));
    kids.push(
      face(st.hero, 56, { off: !!st.resting }),
      el('b.uxh-slot-name', H.heroName(st.hero)),
      el('span.uxh-slot-row', rankChip(apt), (st.level ?? 1) > 1 ? el('span.uxh-lv.ux-num', `Lv ${st.level}`) : null),
      el('span.uxh-slot-sta', m.el),
      st.resting ? el('span.uxh-slot-rest', t('休憩中', 'Resting')) : null,
    );
  } else kids.push(el('span.uxh-slot-plus', hIcon('plus', { ...lite, scale: 3 })), el('span.uxh-slot-hint', t('タップで割り当て', 'Tap to assign')));
  const b = uxKey(el('span.uxh-slot-in', kids), () => o.onTap(), { ico: null, cls: `uxh-slot isl-slot${st ? '' : ' is-empty'}${o.hot ? ' is-hot' : ''}`, attrs: { 'data-task': o.task, ...(st ? { 'data-hero': String(st.hero) } : {}) } });
  const box = el('div.uxh-slotbox', b);
  if (st && o.onRemove) {
    const x = uxKey('', () => o.onRemove!(), { ico: 'close', kind: 'weak', cls: 'uxh-slot-x', attrs: { 'aria-label': t(`${H.heroName(st.hero)}を外す`, `Remove ${H.heroName(st.hero)}`), title: t('外す', 'Remove') } });
    box.append(x);
    b.classList.add('has-x');
  }
  return box;
}

// ================================================================= 人材登用
/** めくってある候補（開き直すと、いちばん向いている人に戻す） */
let flipped: number | null = null;
/** いま雇った人（描き直したあと、名簿の顔に「採用」を打ち、札を飛ばす） */
let justHired: { hero: number; from: DOMRect | null; ghost: HTMLElement | null; fee: number } | null = null;
/** 前に描いたときの候補の並び（候補が替わったら、めくり直す） */
let pool0 = '';

export function openHireUx(ctx: Ctx, opts: { charisma?: boolean } = {}) {
  flipped = null;
  justHired = null;
  pool0 = '';
  keepOpen(ctx, t('人材登用', 'Recruiting'), (c, body) => hireScreen(c, body, opts));
}

function hireScreen(ctx: Ctx, body: HTMLElement, opts: { charisma?: boolean }) {
  const root = el('div.uxh-hr');
  const tipBox = el('div.uxh-tip');
  const page = el('div.uxh-page');
  root.append(tipBox, page);
  body.append(root);

  return liveDraw(root, (anim: boolean) => {
    const s = ctx.s();
    const motion = anim && !isCalm();
    tipBox.replaceChildren();
    H.mineTip(ctx, 'hire', tipBox);
    if (!H.has(s, 'hire')) {
      page.replaceChildren(uxpEmpty(t('スキル「人材の募集」（人材）を習得すると、ヒーローを雇えるようになります。', 'Learn the Recruiting skill (People) to hire heroes.'), { ico: 'lock' }));
      return;
    }
    const out: HTMLElement[] = [];
    const free = s.staff.filter((x) => x.task == null).length;
    // ---- 待機中の人を配置する（今の目印：.isl-btn.is-on。チュートリアルの段では is-guide）
    if (free) {
      const go = el<HTMLButtonElement>(`button.isl-btn.is-on.uxh-go${ctx.step?.() === 'hire' ? '.is-guide' : ''}`, { type: 'button' }, t(`待機中のヒーロー ${free} 人を配置する`, `Assign ${free} free hero(es)`));
      go.addEventListener('click', () => openStaffUx(ctx));
      out.push(el('div.uxh-gorow', go));
    }
    // ---- 数字の札・名簿の顔の列
    const moneyOdo = rollNumber('uxh.hr.money', Math.round(s.money), { digits: Math.max(6, String(Math.round(Math.abs(s.money))).length), size: 's' });
    const moneyStat = el('div.uxp-stat.uxh-money', el('span.uxp-stat-k', t('資金', 'Funds')), el('span.uxp-stat-v', moneyOdo.el, el('span.uxp-stat-u.ux-num', 'G')));
    const roster = el('div.uxh-rlist', { 'aria-label': t(`名簿 ${s.staff.length} 人`, `${s.staff.length} on the roster`) });
    const shown = s.staff.slice(-11);
    for (const x of shown) roster.append(el('span.uxh-rface', { 'data-hero': String(x.hero) }, face(x.hero, 40)));
    if (s.staff.length > shown.length) roster.prepend(el('span.uxh-rmore.ux-num', `+${s.staff.length - shown.length}`));
    out.push(
      el('div.uxp-stats.uxh-stats', moneyStat, uxpStat(t('候補', 'Candidates'), s.hirePool.length, { key: 'uxh.hr.pool', unit: t('人', ''), digits: 2, size: 's' }).el, uxpStat(t('名簿', 'Roster'), s.staff.length, { key: 'uxh.hr.n', unit: t('人', ''), digits: 2, size: 's' }).el),
      el('section.uxh-rbox', el('span.uxh-rbox-k', hIcon('people', lite), el('b', t('名簿', 'Roster'))), roster),
      el('p.uxh-note', t('雇えるヒーローは毎月入れ替わります。棒は仕事ごとの向き不向き（G〜S のランクと 100 までの数）です。', 'Candidates change every month. The bars show aptitude per job (rank G–S and a number up to 100).')),
    );
    // ---- 候補が 0 人のときは、理由と次の一手
    const why = H.hireEmptyLines(s);
    if (why.length) out.push(uxpPaper({ plain: true, cls: 'uxh-why' }, ...why.map((x, k) => el(`p${k === 0 ? '.uxh-warn' : ''}`, x))));
    // ---- カリスマ度（雇えるレアリティ）：チュートリアルの 1 か月目は出さない
    const later = s.reports.length || (s.sector ?? 'c1') !== 'c1';
    if (later && opts.charisma !== false) out.push(charismaPanel(s));
    if (later) for (const x of H.charismaNeeds(s)) out.push(el('p.uxh-warn.uxh-need', hIcon('warn', { ...lite, color: '#ff9a3c' }), el('span', x)));
    // ---- 候補の札
    const recBuy = ctx.step?.() === 'hire' && !s.staff.some((x) => !APPRENTICES.includes(x.hero)) ? [...s.hirePool].sort((a, b) => H.aptitude(H.heroStats(b), 'buy') - H.aptitude(H.heroStats(a), 'buy'))[0] : null;
    const pool = [...s.hirePool].sort((x, y) => (x === recBuy ? -1 : y === recBuy ? 1 : 0));
    // はじめにめくっておく札：チュートリアルなら調達にいちばん向いている人・ほかは並びの先頭（候補が替わったら、めくり直す）
    const key = pool.join(',');
    if (key !== pool0 || flipped == null || !pool.includes(flipped)) flipped = recBuy ?? pool[0] ?? null;
    pool0 = key;
    const list = el('div.uxh-cands.isl-hire-grid');
    for (const id of pool) list.append(candCard(ctx, s, id, id === recBuy));
    if (pool.length) out.push(el('section.uxh-sec', sect(t(`候補（${pool.length}）`, `Candidates (${pool.length})`), 'hire', { kind: 'dark', note: t('押すと、めくれて人事票', 'Tap to turn over') }), list));
    page.replaceChildren(...out);

    if (motion) enter([...list.querySelectorAll<HTMLElement>('.uxh-cand')]);
    // ---- 雇った：札が名簿へ飛んで入り、名簿の顔に「採用」が打たれる。契約金は資金から金貨が飛ぶ
    if (justHired) {
      const j = justHired;
      justHired = null;
      const target = roster.querySelector<HTMLElement>(`.uxh-rface[data-hero="${j.hero}"]`);
      if (j.from && j.ghost) flyTo(j.from, target, j.ghost);
      if (target) {
        const stamp = uxpStamp(t('採用', 'Hired'), { kind: 'good' });
        target.append(stamp.el);
        setTimeout(() => stamp.hit(roster), isCalm() ? 0 : 240);
      }
      if (j.fee > 0 && j.from) coinsFly(mid(moneyStat), { x: j.from.left + j.from.width / 2, y: j.from.top + 20 }, 6);
    }
  });

  /** 候補の札（表：顔・名前・段・いちばん向いている仕事。めくると人事票と「雇う」のキー） */
  function candCard(ctx: Ctx, s: P1State, id: number, rec: boolean): HTMLElement {
    const stats = H.heroStats(id);
    const fee = H.signFee(s, id);
    const wage = H.wageOf(id);
    const open = flipped === id;
    const b = bestTask(stats);
    const card = el(`div.uxh-cand.isl-hero-card${rec ? '.is-rec' : ''}${open ? '.is-open' : ''}`, { 'data-hero': String(id) });
    const front = el(
      'div.uxh-cand-front',
      { role: 'button', tabindex: '0', 'aria-expanded': String(open), 'aria-label': t(`${H.heroName(id)}の人事票`, `${H.heroName(id)} details`) },
      el('span.uxh-cand-pic', face(id, open ? 128 : 56, { scale: open ? 2 : 1, breathe: open })),
      el(
        'span.uxh-cand-body',
        el('span.uxh-name', el('b', H.heroName(id)), rarTag(H.heroRarityOf(id))),
        el('span.uxh-best', el('span.uxh-best-k', t('いちばん向いている', 'Best at')), el('b', b.name), rankChip(b.apt)),
        el('span.uxh-cand-pay', el('span', fee > 0 ? t(`契約金 ${H.money(fee)}`, `Fee ${H.money(fee)}`) : t('契約金 なし', 'No fee')), el('span', t(`月給 ${H.money(wage)}`, `${H.money(wage)}/mo`))),
      ),
      el('span.uxh-cand-flip', hIcon(open ? 'up' : 'down', lite)),
    );
    if (rec) card.append(el('span.uxh-rec.isl-best', t('調達にいちばん向いている', 'Best buyer')));
    card.append(front);
    const flip = () => {
      if (flipped === id) return;
      flipped = id;
      uxSfx('page', { step: 3 });
      // めくる：札が横に縮んで、裏（人事票）が出る（4 段）
      const after = () => H.after(ctx);
      if (isCalm()) return after();
      card.classList.add('is-flip');
      setTimeout(after, 120);
    };
    front.addEventListener('click', flip);
    front.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        flip();
      }
    });
    if (open) {
      const gap = uxpGap(s.money, fee);
      const label = fee > 0 ? t(`雇う（契約金 ${H.money(fee)}・月給 ${H.money(wage)}）`, `Hire (${H.money(fee)} + ${H.money(wage)}/mo)`) : t(`雇う（月給 ${H.money(wage)}）`, `Hire (${H.money(wage)}/mo)`);
      // 今の目印：.isl-hero-card の中の .isl-btn.is-on（チュートリアルが押す）。主役なので前の層へ（ux-front）
      const go = el<HTMLButtonElement>('button.isl-btn.is-on.ux-front.uxh-hire', { type: 'button' }, label);
      go.addEventListener('click', () => {
        const e = H.hire(s, id);
        if (e === 'money') {
          gap.nudge();
          shake(card);
          ctx.toast(t(`契約金 ${H.money(fee)} が足りません`, `Not enough for the ${H.money(fee)} signing fee`));
          return;
        }
        uxSfx(fee > 0 ? 'cash' : 'confirm');
        const pic = card.querySelector<HTMLElement>('.uxh-cand-pic .uxp-face');
        justHired = { hero: id, from: pic?.getBoundingClientRect() ?? null, ghost: pic ? (pic.cloneNode(true) as HTMLElement) : null, fee };
        ctx.toast(t(`${H.heroName(id)}が仲間になりました`, `${H.heroName(id)} joined`));
        H.after(ctx);
      });
      const bars = aptBars(stats);
      card.append(
        uxpPaper(
          { plain: true, cls: 'uxh-cand-back' },
          el('span.uxh-sheet-k', hIcon('doc', ink), el('b', t('人事票', 'Profile'))),
          bars.el,
          el('div.uxh-cand-rows', el('span', t('いちばん向いている', 'Best at')), el('b', `${b.name}`), rankChip(b.apt)),
          gap.el,
          go,
        ),
      );
    }
    return card;
  }
}

/** 名前だけの小さな札（テスト用に出しておく） */
export const _slotEl = slotEl;
