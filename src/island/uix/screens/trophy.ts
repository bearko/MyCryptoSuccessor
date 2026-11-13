/**
 * 段 UIX3h：トロフィー（記章の棚）・遺物の展示館。方向 C「管制卓」。入のときだけ（docs/ISLAND_UIX.md「画面：トロフィーと図鑑」）。
 * 出す中身・押す先は今の画面（p1/trophyui.ts の openTrophies・trophyEl、p1/museumui.ts の openMuseum）と同じ。本体の関数は束（H）から使う。
 *
 * - トロフィー：記章の棚。取ったものは光ってランプ（取った日・何か月目・名前の由来）、まだのものは影と条件の一言。開くと、取った記章が順に打たれる。
 *   取った瞬間（お知らせ）は、記章が打たれる（今の目印 .isl-toast.isl-tr-pop。帯の着せ替えの火花と音はそのまま）
 * - 展示館：数字の札（展示の価値・来館の見込み・入館料・次の節目まで あと N と計器）・入館料の推移（縦の棒）・節目のボーナス・
 *   展示の枠（飾った物・空き・増築で開く錠）。枠を押すと、選ぶ引き出し（飾れる遺物の札・価値の高い順・「外す」）。飾ると「展示」が打たれる
 */
import { t } from '../../../i18n';
import { el, type Kid } from '../dom';
import { sparks } from '../fx';
import { uxKey, uxLamp, uxMeter, uxTape } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpBars, uxpCard, uxpDrawer, uxpEmpty, uxpPaper, uxpSelect, uxpStamp, uxpStat } from '../sparts';
import { H } from './h-deps';
import { enter, hIcon, ink, keepOpen, liveDraw, lite, mid, sect } from './h-kit';
import type { Ctx } from '../../p1/screens';
import type { TrophyDef } from '../../p1/trophy';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）
/** トロフィーの絵（今の絵文字の代わり。表に無いものは記章） */
export const TROPHY_ICO: Record<string, string> = { micromanage: 'search', first_head: 'share', first_duo: 'pair', first_clear: 'flag', epic_clear: 'crown' };
export const trophyIco = (id: string) => TROPHY_ICO[id] ?? 'medal';
/** 取った日（今の dateText と同じ） */
export function dateText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
/** 記章が打たれる間（開いたとき、取った物を順に。1 つ 140ms・10 個目からは同じ） */
export const stampDelay = (i: number) => 180 + Math.min(i, 10) * 140;

// ================================================================= トロフィー
/** 記章（棚の 1 つ）：取った物は光る面とランプ、まだの物は影 */
function badge(id: string, got: boolean, big = false): HTMLElement {
  return el(`span.uxh-badge${got ? '.is-got' : ''}${big ? '.is-big' : ''}`, { 'aria-hidden': 'true' }, hIcon('medal', got ? { color: '#ffb81f', hi: '#ffe394', lo: '#b8650d', scale: big ? 3 : 2 } : { color: '#2f3657', hi: '#4a5486', lo: '#151829', scale: big ? 3 : 2 }), el('span.uxh-badge-ico', hIcon(trophyIco(id), got ? { color: '#1a1c2e', hi: '#1a1c2e', lo: '#7a3f06', scale: 1 } : { color: '#4a5486', hi: '#4a5486', lo: '#151829', scale: 1 })));
}

export function openTrophiesUx(ctx: Ctx) {
  keepOpen(ctx, t('トロフィー', 'Trophies'), (c, body) => {
    const page = el('div.uxh-page.uxh-tro');
    body.append(page);
    return liveDraw(page, (anim: boolean) => {
      const b = H.trophyBook();
      const all = H.TROPHIES;
      const n = all.filter((x) => b.got[x.id]).length;
      const meter = uxMeter(all.length ? n / all.length : 0, 'good');
      const shelf = el('div.uxh-shelf');
      const hits: { card: HTMLElement; stamp: ReturnType<typeof uxpStamp> }[] = [];
      for (const d of all) {
        const r = b.got[d.id];
        const stamp = uxpStamp(t('取得', 'Earned'), { kind: 'amber' });
        const foot = r ? t(`取った日 ${dateText(r.at)}（ゲームの ${Math.floor(r.day / 30) + 1} か月目）`, `Earned ${dateText(r.at)} (game month ${Math.floor(r.day / 30) + 1})`) : t('まだ', 'Not yet');
        const card = el(
          `div.uxh-tr.isl-tr${r ? '.is-got' : ''}`,
          { 'data-trophy': H.globalId(d.id) },
          el('span.uxh-tr-pic', badge(d.id, !!r), uxLamp('', !!r)),
          el('span.uxh-tr-b', el('b', d.name()), el('span.uxh-tr-cond', d.cond()), el(`span.uxh-tr-foot${r ? '.is-got' : ''}`, foot + (d.from ? t(`・名前は${d.from()}から`, ` · named after ${d.from()}`) : ''))),
          stamp.el,
        );
        if (r) hits.push({ card, stamp });
        shelf.append(card);
      }
      page.replaceChildren(
        el(
          'div.uxh-tr-head',
          badge('', n > 0, true),
          el('span.uxh-tr-count', el('b.ux-num.uxh-big', `${n}`), el('span.ux-num.uxh-dim', `/ ${all.length}`)),
          el('span.uxh-tr-hb', meter.el, el('span.uxh-note', t('遊び方ごとの記録です。セーブとは別に、この端末に残ります。', 'Records of how you play, kept on this device apart from your save.'))),
        ),
        el('section.uxh-sec', sect(t('記章の棚', 'Badge shelf'), 'medal', { kind: 'dark', note: t('光っている＝取った・影＝まだ', 'Lit = earned · shadow = not yet') }), shelf),
        el('p.uxh-note', t('bearko.games 共通のトロフィーに、あとでまとめて登録できるようにしています（準備中）。', 'These can later be registered to the shared bearko.games trophies (coming soon).')),
      );
      // 開いたとき：取った記章が順に打たれる（動きを減らすときは、打たれたまま出す）
      if (!anim || isCalm()) for (const h of hits) h.stamp.show();
      else {
        enter([...shelf.children] as HTMLElement[]);
        hits.forEach((h, i) => setTimeout(() => h.card.isConnected && h.stamp.hit(null), stampDelay(i)));
      }
      void c;
    });
  });
}

/** 取ったときの帯（今の目印 .isl-toast.isl-tr-pop。トーストの列に入れる）：記章が打たれる */
export function trophyPopUx(d: TrophyDef): HTMLElement {
  const b = badge(d.id, true);
  const e = el('div.isl-toast.isl-tr-pop.uxh-trpop', el('span.uxh-trpop-pic', b), el('span.uxh-trpop-t', uxTape(el('b', t('トロフィーを手に入れた！', 'Trophy unlocked!')), 'amber'), el('b', d.name())));
  if (!isCalm()) {
    b.classList.add('is-hit');
    requestAnimationFrame(() => requestAnimationFrame(() => e.isConnected && sparks(mid(b), 12)));
  }
  return e;
}

// ================================================================= 遺物の展示館
/** 遺物 1 つのレアリティの札（色と文字。色だけに頼らない） */
function relicRar(id: number): HTMLElement {
  const r = H.extRarity(id) as keyof typeof H.RARITY_JA;
  const e = el(`span.uxh-rrar.is-${H.extRank(id)}`, H.RARITY_JA[r] ?? r);
  e.style.setProperty('--hc', H.RARITY_COLOR[r] ?? '#ccc');
  return e;
}

/** 飾ったばかりの枠（描き直したあと「展示」を打つ） */
let justShown: number | null = null;
export function openMuseumUx(ctx: Ctx) {
  justShown = null;
  keepOpen(ctx, t('遺物の展示館', 'Relic museum'), museumScreen);
}

function museumScreen(ctx: Ctx, body: HTMLElement) {
  const page = el('div.uxh-page.uxh-mus');
  body.classList.add('is-museum');
  body.append(page);
  const MB = H.DIG_BALANCE.museum;
  return liveDraw(page, (anim: boolean) => {
    const s = ctx.s();
    const value = H.museumValue(s);
    const mk = H.museumMarks(s);
    const visitors = Math.round(value * MB.visitors);
    const out: HTMLElement[] = [];
    // ---- 数字の札
    const prev = mk.next != null ? (MB.marks.filter((x) => x <= value).pop() ?? 0) : 0;
    const nm = uxMeter(mk.next != null ? (value - prev) / Math.max(1, mk.next - prev) : 1, 'good');
    out.push(
      el(
        'div.uxp-stats.uxh-stats',
        uxpStat(t('展示の価値', 'Exhibit value'), value, { key: 'uxh.mus.v', digits: 3, size: 's', tone: 'amber' }).el,
        uxpStat(t('来館の見込み／月', 'Visitors / mo'), visitors, { key: 'uxh.mus.vis', unit: t('人', ''), size: 's' }).el,
        uxpStat(t('入館料／月', 'Admissions / mo'), visitors * MB.fee, { key: 'uxh.mus.fee', unit: 'G', size: 's' }).el,
        el(
          `div.uxp-stat.uxh-next${mk.next != null ? '' : '.is-done'}`,
          el('span.uxp-stat-k', t('次の節目', 'Next milestone')),
          el('b', mk.next != null ? t(`${mk.next}（あと ${mk.left}）`, `${mk.next} (${mk.left} to go)`) : t('すべて達成', 'All reached')),
          nm.el,
        ),
      ),
    );
    // ---- 入館料の推移（縦の棒）
    const mh = H.museumHist(s.reports);
    if (mh.length)
      out.push(
        el(
          'section.uxh-sec',
          sect(t('入館料の推移（月の締め）', 'Admissions at each close'), 'bars', { kind: 'dark', note: t(`先月の来館 ${mh[mh.length - 1].visitors} 人`, `Last month: ${mh[mh.length - 1].visitors} visitors`) }),
          uxpBars(mh.map((x, k) => ({ label: H.monLab(x.month, k === 0), value: x.income, kind: k === mh.length - 1 ? ('main' as const) : ('' as const) })), { height: 130, cls: 'uxh-hist' }).el,
        ),
      );
    // ---- 節目のボーナス（恒久）
    const marks = s.museum?.marks ?? 0;
    out.push(
      uxpPaper(
        { plain: true, cls: 'uxh-mus-bonus' },
        el('p', el('b', t(`節目 ${marks} / ${MB.marks.length}`, `Milestones ${marks} / ${MB.marks.length}`)), t(`：会社全体の新商品の認知の上がり方 +${Math.round(H.museumKnown(s) * 100)}%・ブランド力 +${marks * MB.brand}（節目 ${MB.marks.join('・')} を超えるごとに +5%・★ +1）`, `: new items become known +${Math.round(H.museumKnown(s) * 100)}% faster company-wide · brand +${marks * MB.brand} (each milestone ${MB.marks.join(', ')} adds +5% and ★ +1)`)),
        el('span.uxh-mus-steps', MB.marks.map((x, i) => el(`span.uxh-mus-step${i < marks ? '.is-on' : ''}`, uxLamp('good', i < marks), el('span.ux-num', String(x))))),
      ),
    );
    if (!H.museumOpen(s)) out.push(el('p.uxh-warn', t('展示館はまだ工事中。飾っておくと、開いた月から来館者が来るよ。', 'The museum is still being built. Exhibits start drawing visitors once it opens.')));
    // ---- 展示の枠（いまの枠 ＋ 次の増築の枠は錠）
    const slots = H.museumSlots(s);
    const items = s.museum?.items ?? [];
    const grid = el('div.uxh-mus-grid.isl-mus-grid');
    let hit: { box: HTMLElement; stamp: ReturnType<typeof uxpStamp> } | null = null;
    for (let k = 0; k < Math.min(MB.slots[MB.slots.length - 1], slots + 4); k++) {
      if (k >= slots) {
        grid.append(el('div.uxh-mus-slot.isl-mus-slot.is-locked', hIcon('lock', { ...lite, color: '#4a5486', scale: 3 }), el('span.uxh-dim', t('展示室の増築で', 'Gallery extension'))));
        continue;
      }
      const id = items[k] ?? null;
      const kids: Kid[] =
        id != null
          ? [el('span.uxh-mus-pic', H.extIcon(id, 64)), el('b.uxh-mus-name', H.extName(id)), relicRar(id), el('span.uxh-mus-stars', H.stars(H.researchOf(s, id))), el('span.uxh-amber', t(`価値 ${H.relicValue(s, id)}`, `Value ${H.relicValue(s, id)}`))]
          : [el('span.uxh-mus-plus', hIcon('plus', { ...lite, scale: 3 })), el('span', t('飾る', 'Display'))];
      const b = uxKey(el('span.uxh-mus-in', kids), () => pickRelic(ctx, k), { ico: null, cls: `uxh-mus-slot isl-mus-slot ${id != null ? 'is-on' : 'is-empty'}`, attrs: { 'aria-label': id != null ? t(`枠 ${k + 1}：${H.extName(id)}`, `Slot ${k + 1}: ${H.extName(id)}`) : t(`枠 ${k + 1}：飾る`, `Slot ${k + 1}: display`) } });
      const box = el('div.uxh-mus-box', b);
      if (justShown === k && id != null) {
        const stamp = uxpStamp(t('展示', 'On display'), { kind: 'amber' });
        box.append(stamp.el);
        hit = { box, stamp };
      }
      grid.append(box);
    }
    out.push(el('section.uxh-sec', sect(t(`展示の枠（${items.filter((x) => x != null).length} / ${slots}）`, `Display slots (${items.filter((x) => x != null).length} / ${slots})`), 'pillar', { kind: 'dark', note: t('押すと、飾る遺物を選ぶ', 'Tap to choose a relic') }), grid));
    out.push(
      el(
        'p.uxh-note',
        t(
          `価値 ＝ レアリティ（C ${MB.val.C}・U ${MB.val.U}・R ${MB.val.R}・E ${MB.val.E}・L ${MB.val.L}）×（1 ＋ ${MB.lvStep} ×（研究 Lv − 1））。来館者は価値 1 につき月 ${MB.visitors} 人・入館料 ${MB.fee} G。展示室の増築は、地図の展示館の「設備投資」から。`,
          `Value = rarity (C ${MB.val.C}, U ${MB.val.U}, R ${MB.val.R}, E ${MB.val.E}, L ${MB.val.L}) × (1 + ${MB.lvStep} × (research Lv − 1)). ${MB.visitors} visitors a month per value point, ${MB.fee} G each. Extend the gallery from the museum’s capital investment on the map.`,
        ),
      ),
    );
    page.replaceChildren(...out);
    if (anim && !isCalm()) enter([...grid.children] as HTMLElement[]);
    if (hit) {
      const h0 = hit;
      justShown = null;
      requestAnimationFrame(() => {
        h0.stamp.hit(h0.box);
        sparks(mid(h0.box), 14, ['#ffb81f', '#fffdf3', '#5fe4ff']);
      });
    }
  });
}

/** 枠を押した：飾れる遺物（研究ノートの出土品。価値の高い順）を選ぶ引き出し。いま飾っている枠なら「外す」 */
function pickRelic(ctx: Ctx, k: number) {
  const s = ctx.s();
  const items = s.museum?.items ?? [];
  const cur = items[k] ?? null;
  let pick: number | null = null;
  const side = cur != null ? uxKey([hIcon('close', lite), el('b', t('外す', 'Remove'))], () => {
    H.exhibit(s, k, null);
    d.drop();
    ctx.save();
    ctx.refresh();
    H.refreshSheet();
  }, { kind: 'weak', ico: null, cls: 'uxh-mus-off' }) : null;
  const d = uxpDrawer({
    root: ctx.root,
    title: t(`枠 ${k + 1} に飾る遺物を選ぶ`, `Choose a relic for slot ${k + 1}`),
    ico: 'star',
    cls: 'uxh-mus-pick',
    side,
    decide: {
      label: t('飾る', 'Display'),
      onDecide: () => {
        if (pick == null) return;
        const before = s.museum?.marks ?? 0;
        const e = H.exhibit(s, k, pick);
        if (e) {
          ctx.sfx?.('error');
          ctx.toast(e === 'dup' ? t('同じ遺物は 1 枠まで', 'One slot per relic') : t('いまは飾れません', 'Can’t display that now'));
          return;
        }
        ctx.sfx?.('check');
        const gained = (s.museum?.marks ?? 0) - before;
        if (gained > 0) {
          ctx.sfx?.('levelup');
          ctx.toast(t(`展示の価値が節目を超えた！ 新商品の認知の上がり方 +${Math.round(gained * H.DIG_BALANCE.museum.known * 100)}%（ブランド力も）`, `Exhibit milestone! New items become known +${Math.round(gained * H.DIG_BALANCE.museum.known * 100)}% faster (brand up too)`));
        }
        justShown = k;
        d.drop();
        ctx.save();
        ctx.refresh();
        H.refreshSheet();
        // 次の空いた枠へ（続けて飾れるように。今と同じ）
        const next = (s.museum?.items ?? []).findIndex((x, i) => x == null && i < H.museumSlots(s));
        if (next >= 0) setTimeout(() => pickRelic(ctx, next), isCalm() ? 0 : 480);
      },
    },
  });
  const cands = H.exhibitable(s);
  if (!cands.length) {
    d.body.append(uxpEmpty(t('まだ遺物が無い。荒れ地やダンジョンで掘ってみよう。', 'No relics yet. Dig at a wasteland or a dungeon.'), { ico: 'pick' }));
    return;
  }
  const list = el('div.uxp-list');
  const cards: HTMLElement[] = [];
  for (const id of cands) {
    const at = items.indexOf(id);
    const card = uxpCard({
      pic: H.extIcon(id, 48),
      name: el('span.uxh-name', el('b', H.extName(id)), relicRar(id)),
      desc: el('span.uxh-amber', t(`価値 ${H.relicValue(s, id)}`, `Value ${H.relicValue(s, id)}`)),
      foot: at >= 0 ? el('span.uxh-dim', t(`展示中（枠 ${at + 1}）`, `On display (slot ${at + 1})`)) : undefined,
      off: at >= 0,
      onTap: at >= 0 ? undefined : (c) => {
        pick = id;
        for (const x of cards) uxpSelect(x, x === c, x === c);
        d.setDecide({ on: true, name: el('span', H.extName(id)) });
      },
      attrs: { 'data-relic': String(id) },
      cls: 'uxh-mus-cand',
    });
    cards.push(card);
    list.append(card);
  }
  d.body.append(list);
  uxSfx('tick');
}

/** 小さな見出しの絵（墨） */
export const inkIco = (name: string) => hIcon(name, ink);
