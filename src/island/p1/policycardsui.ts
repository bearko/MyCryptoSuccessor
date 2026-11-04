/**
 * 段 K3：経営方針発表会を「カードを差し出す」一大イベントに（画面。中身の計算は policycards.ts・決まりは policy.ts）。
 * 段 I2 の経営会議の年初の回（boardui.ts の BOARD_SCENES）に差し込む。会議の画面の上の会議室（役員の席）はそのまま使い、下の話の箱を「机・詳細・手札」にする。
 *
 * ① 全社方針：手札（開いた全社方針のカード。大きなアイコン・下に名前・開放のしかたで枠の色と札）を、机の中央の点線の枠（全社方針の枠の数）へ差し出す。
 *    - ドラッグ（スマホは指で上へ・PC はマウス）で枠へ。タップで詳細（As-Is → To-Be の主要な効き目と副次効果）、詳細の「机に出す」・キーボード（↑）でも出せる。
 *    - 枠のカードはタップ →「手札に戻す」・下へドラッグ・↓ で戻せる（発表の前まで）。「推奨を並べる」で推奨のカードが枠へ。
 *    - 「発表する」：カードが表を向いて光り、ハンコ、役員が反応（その部門の士気が上がる部長は喜び、引き換えで下がる部門の部長は渋い顔）、マインちゃんの一言。
 * ② 事業別の方針：部門ごとに、部長が自分のカードを机に置く（席から飛んでくる）。社長は承認するか、その部門の手札から差し替える。部長のいない部門は社長が手札から置く。
 *    「残りは部長の案で承認」で飛ばせる（部長のいない部門は推奨）。
 * 決めたものは policy.ts の presPickCorp・presPickDept（会議を閉じるときに presFinish が決める。飛ばす・一括承認でも推奨で決まる）。
 * カードの絵は絵文字の仮の絵（docs/ISLAND_ART_TODO.md「方針カードの絵」）。机・点線の枠・カードの紙の枠はコード（policycards.css）。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { DEPT, POLICY_OF, type DeptId, type PolicyDef } from './data';
import { openPolicies, presCorp, presDepts, presDue, presOf, presPickCorp, presPickDept, presRec, recCorp, slotsOf, whenOf } from './policy';
import { cardLines, deptBase, reactOf, type CardLine } from './policycards';
import { BOARD_SCENES, type BoardHooks } from './boardui';
import { yearOfBoard, roleOf, type BoardAgenda } from './board';
import { heroLine } from './headtalk';
import { headOf, heroNm } from './deleg';
import { powerLines } from './policyui';
import { FX_PAL, fxAtEl, fxLevel } from '../fx/layer';
import type { Ctx } from './screens';
import { btn, h, heroIcon, recTag } from './ui';
import type { P1State } from './model';
import './policycards.css';

/** カードの名前（かっこの中は詳細だけに：「DX（デジタル・…）」→「DX」） */
export const cardName = (p: PolicyDef) => p.name.replace(/[（(].*?[）)]/g, '').trim() || p.name;
/** 開放のしかたの札（色だけに頼らず字で） */
const srcName = (p: PolicyDef) => (p.open.k === 'start' ? t('はじめ', 'Base') : p.open.k === 'tablet' ? t('石板', 'Tablet') : t('パネル', 'Panel'));
const still = () => fxLevel() === 'off';
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, still() ? 0 : ms));

/** 方針のカード（ボタン。大きなアイコン・下に名前・開放のしかたの札・推奨の札） */
export function policyCardEl(p: PolicyDef, rec = false): HTMLButtonElement {
  const b = h('button', `pc-card is-${p.open.k} is-${p.kind}`);
  b.type = 'button';
  b.dataset.policy = p.id;
  b.style.setProperty('--dc', DEPT[p.dept].color);
  b.setAttribute('aria-label', t(`${p.name}（${srcName(p)}${rec ? '・推奨' : ''}）`, `${p.name} (${srcName(p)}${rec ? ', recommended' : ''})`));
  const top = h('span', 'pc-top');
  top.append(h('span', 'pc-src', srcName(p)));
  b.append(top, h('span', 'pc-ic', p.icon), h('b', 'pc-nm', cardName(p)));
  // 推奨の札はカードの角（右上にはみ出して）
  if (rec) b.append(recTag());
  return b;
}

/** 1 行の As-Is → To-Be（＋は緑・−は赤。▲▼ と符号も。色だけに頼らない） */
function lineEl(x: CardLine): HTMLElement {
  const e = h('div', `pc-ln ${x.good === true ? 'is-good' : x.good === false ? 'is-bad' : 'is-same'}`);
  const arrow = x.dir > 0 ? '▲' : x.dir < 0 ? '▼' : '＝';
  const lab = h('span', 'pc-ln-lab', x.label);
  if (x.note) lab.append(h('small', 'pc-ln-note', x.note));
  const val = h('span', 'pc-ln-val');
  val.append(h('span', 'pc-now', x.now), h('span', 'pc-to', '→'), h('b', 'pc-next', x.next), h('span', 'pc-mark', x.good === null ? '' : `${arrow}${x.good ? t('良い', 'good') : t('悪い', 'bad')}`));
  e.append(lab, val);
  return e;
}

/** 詳細のパネル（タップしたカード）。act：机に出す／手札に戻す のボタン（無ければ出さない） */
function detailEl(s: P1State, p: PolicyDef, base: string[], act: { text: string; on: () => void } | null): HTMLElement {
  const box = h('div', 'pc-det');
  const hd = h('div', 'pc-det-hd');
  const ic = h('span', 'pc-det-ic', p.icon);
  const tx = h('div', 'pc-det-tx');
  const kind = p.kind === 'corp' ? t(`全社方針 · 強さ：${DEPT[p.dept].name}`, `Company policy · strength: ${DEPT[p.dept].name}`) : t(`${DEPT[p.dept].name}の事業別の方針`, `${DEPT[p.dept].name} division policy`);
  tx.append(h('b', 'pc-det-nm', p.name), h('small', 'pc-det-kind', `${kind} · ${srcName(p)}`));
  hd.append(ic, tx);
  if (act) hd.append(btn(act.text, act.on, 'pc-det-act'));
  box.append(hd, h('p', 'pc-det-note', p.note));
  const xs = cardLines(s, p, base);
  const main = xs.filter((x) => x.kind === 'main');
  const side = xs.filter((x) => x.kind !== 'main');
  const sec = (title: string, ys: CardLine[]) => {
    if (!ys.length) return;
    const e = h('div', 'pc-det-sec');
    const head = h('div', 'pc-det-sh');
    head.append(h('b', '', title), h('small', '', t('いま → 選ぶと', 'now → chosen')));
    e.append(head, ...ys.map(lineEl));
    box.append(e);
  };
  sec(t('主要な効果', 'Main effect'), main);
  sec(t('副次効果', 'Side effects'), side);
  const w = whenOf(p);
  if (w) box.append(h('p', 'pc-det-when', t(`🗓 向いている時期：${w}`, `🗓 Best when: ${w}`)));
  const f = h('div', 'pc-det-f');
  for (const x of powerLines(s, p)) f.append(h('small', '', x));
  f.append(h('small', '', t('副次効果は強さによらず一定。士気は目指す値（毎日そこへ寄る）。できごとは同じ良い／困りごとの中での選ばれやすさ。', 'Side effects don’t scale with strength. Morale is the target it drifts to. Event odds are within good or trouble events.')));
  box.append(f);
  return box;
}

interface Desk {
  slots: (string | null)[];
  sel: string | null;
}

/**
 * 机・詳細・手札の場面（全社方針と、部門ごとの事業別の方針で同じ形）。
 * hand：手札の方針・rec：推奨の id・base：机のほかの組（As-Is → To-Be のもと）・changed：机が変わった
 */
interface TableOpts {
  root: HTMLElement;
  modal: HTMLElement;
  s: P1State;
  hand: PolicyDef[];
  rec: string[];
  desk: Desk;
  base: () => string[];
  hooks: BoardHooks;
  changed: () => void;
  /** 机の上の札（全社方針 1〜5 の番号・部門の名前） */
  slotLabel: (k: number) => string;
}
function table(o: TableOpts) {
  const { s, desk, hooks } = o;
  const deskEl = h('div', 'pc-desk');
  const slotsEl = h('div', 'pc-slots');
  slotsEl.style.setProperty('--n', String(desk.slots.length));
  deskEl.append(slotsEl);
  const detail = h('div', 'pc-detail');
  const handEl = h('div', 'pc-hand');
  handEl.setAttribute('role', 'list');
  handEl.setAttribute('aria-label', t('手札', 'Hand'));
  o.root.append(deskEl, detail, handEl);

  const onTable = (id: string) => desk.slots.includes(id);
  /** 置く（k：枠の番号。無ければ空いた最初の枠。埋まっていれば入れ替え） */
  const place = (id: string, k?: number): boolean => {
    let at = k ?? desk.slots.findIndex((x) => x == null);
    if (at < 0) {
      deskEl.classList.remove('is-full');
      void deskEl.offsetWidth;
      deskEl.classList.add('is-full');
      hooks.sfx('error');
      return false;
    }
    const was = desk.slots.indexOf(id);
    if (was >= 0) desk.slots[was] = null;
    if (was >= 0 && desk.slots[at] != null) desk.slots[was] = desk.slots[at];
    desk.slots[at] = id;
    desk.sel = id;
    hooks.sfx('place', 1.1, 0.9 + at * 0.05);
    draw(id);
    o.changed();
    return true;
  };
  const back = (id: string) => {
    const k = desk.slots.indexOf(id);
    if (k < 0) return;
    desk.slots[k] = null;
    desk.sel = id;
    hooks.sfx('tap');
    draw();
    o.changed();
  };

  // ---- ドラッグ（指は上へ滑らせると持ち上がる・横は手札のスクロール。マウスはどの向きでも）
  let suppress = 0;
  const dragOf = (el: HTMLElement, id: string, from: 'hand' | 'slot') => {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || deskEl.classList.contains('is-lock')) return;
      const sx = e.clientX;
      const sy = e.clientY;
      const mouse = e.pointerType === 'mouse';
      let ghost: HTMLElement | null = null;
      let over: number | null = null;
      let home = false;
      const r0 = el.getBoundingClientRect();
      const start = () => {
        el.setPointerCapture?.(e.pointerId);
        ghost = el.cloneNode(true) as HTMLElement;
        ghost.classList.add('pc-ghost');
        ghost.removeAttribute('id');
        ghost.style.left = `${r0.left}px`;
        ghost.style.top = `${r0.top}px`;
        ghost.style.width = `${r0.width}px`;
        ghost.style.height = `${r0.height}px`;
        o.modal.append(ghost);
        el.classList.add('is-lifted');
        deskEl.classList.add('is-drag');
        hooks.sfx('tap', 0.7, 1.2);
      };
      const hit = (x: number, y: number) => {
        over = null;
        home = false;
        const els = [...slotsEl.querySelectorAll<HTMLElement>('.pc-slot')];
        els.forEach((sl, k) => {
          const r = sl.getBoundingClientRect();
          const inside = x > r.left - 14 && x < r.right + 14 && y > r.top - 18 && y < r.bottom + 18;
          if (inside) over = k;
        });
        const hr = handEl.getBoundingClientRect();
        const dr = deskEl.getBoundingClientRect();
        if (over == null && from === 'hand' && y < hr.top - 30) over = -1;
        if (from === 'slot' && over == null && (y > dr.bottom + 24 || (y > hr.top && y < hr.bottom))) home = true;
        els.forEach((sl, k) => sl.classList.toggle('is-over', k === over || (over === -1 && k === desk.slots.findIndex((z) => z == null))));
        handEl.classList.toggle('is-over', home);
      };
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!ghost) {
          const go = mouse || from === 'slot' ? Math.hypot(dx, dy) > 6 : dy < -10 && Math.abs(dy) > Math.abs(dx) * 1.1;
          if (!go) {
            if (!mouse && from === 'hand' && Math.abs(dx) > 12) end();
            return;
          }
          start();
        }
        ev.preventDefault();
        ghost!.style.transform = `translate(${dx}px, ${dy}px) rotate(${Math.max(-8, Math.min(8, dx / 14))}deg) scale(1.08)`;
        hit(ev.clientX, ev.clientY);
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        const g = ghost;
        end();
        if (!g) return;
        suppress = Date.now();
        el.classList.remove('is-lifted');
        slotsEl.querySelectorAll('.pc-slot').forEach((x) => x.classList.remove('is-over'));
        handEl.classList.remove('is-over');
        deskEl.classList.remove('is-drag');
        let ok = false;
        if (over != null && ev.type === 'pointerup') ok = place(id, over >= 0 ? over : undefined);
        else if (home && ev.type === 'pointerup') {
          back(id);
          ok = true;
        }
        if (ok) {
          g.remove();
          return;
        }
        // 戻る（元の場所へ）
        g.classList.add('is-back');
        g.style.transform = '';
        window.setTimeout(() => g.remove(), still() ? 0 : 220);
      };
      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
  };

  const select = (id: string) => {
    desk.sel = id;
    hooks.sfx('tap');
    drawDetail();
    handEl.querySelectorAll('.pc-card').forEach((x) => x.classList.toggle('is-sel', (x as HTMLElement).dataset.policy === id));
    slotsEl.querySelectorAll('.pc-card').forEach((x) => x.classList.toggle('is-sel', (x as HTMLElement).dataset.policy === id));
  };
  const cardFor = (p: PolicyDef, from: 'hand' | 'slot') => {
    const c = policyCardEl(p, o.rec.includes(p.id));
    c.classList.toggle('is-sel', desk.sel === p.id);
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      if (Date.now() - suppress < 350) return;
      select(p.id);
    });
    c.addEventListener('keydown', (e) => {
      if (from === 'hand' && e.key === 'ArrowUp') {
        e.preventDefault();
        place(p.id);
        focusSlot(p.id);
      } else if (from === 'slot' && e.key === 'ArrowDown') {
        e.preventDefault();
        back(p.id);
        (handEl.querySelector(`[data-policy="${p.id}"]`) as HTMLElement | null)?.focus();
      } else if (from === 'hand' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const xs = [...handEl.querySelectorAll<HTMLElement>('.pc-card')];
        const k = xs.indexOf(c) + (e.key === 'ArrowRight' ? 1 : -1);
        xs[Math.max(0, Math.min(xs.length - 1, k))]?.focus();
      }
    });
    dragOf(c, p.id, from);
    return c;
  };
  const focusSlot = (id: string) => (slotsEl.querySelector(`[data-policy="${id}"]`) as HTMLElement | null)?.focus();
  function drawDetail() {
    detail.replaceChildren();
    const p = desk.sel ? POLICY_OF[desk.sel] : null;
    if (!p) {
      detail.append(h('p', 'pc-hint', t('手札のカードをタップすると、ここに効果が出ます。上の点線の枠へ差し出すと、その方針を選びます。', 'Tap a card in your hand to see its effects here. Slide it up into a dotted frame to choose it.')));
      return;
    }
    const on = onTable(p.id);
    const act = on ? { text: t('⬇ 戻す', '⬇ Take back'), on: () => back(p.id) } : o.hand.some((x) => x.id === p.id) ? { text: t('⬆ 机に出す', '⬆ To the table'), on: () => place(p.id) } : null;
    detail.append(detailEl(s, p, o.base(), act));
    detail.scrollTop = 0;
  }
  function draw(landed?: string) {
    slotsEl.replaceChildren();
    desk.slots.forEach((id, k) => {
      const sl = h('div', `pc-slot ${id ? 'is-filled' : ''}`);
      sl.setAttribute('aria-label', id ? t(`${k + 1} 枠目：${POLICY_OF[id].name}`, `Slot ${k + 1}: ${POLICY_OF[id].name}`) : t(`${k + 1} 枠目（空き）`, `Slot ${k + 1} (empty)`));
      sl.append(h('span', 'pc-slot-no', o.slotLabel(k)));
      if (id) {
        const c = cardFor(POLICY_OF[id], 'slot');
        if (id === landed) c.classList.add('is-land');
        sl.append(c);
      }
      slotsEl.append(sl);
    });
    handEl.replaceChildren();
    const xs = o.hand.filter((p) => !onTable(p.id));
    for (const p of xs) {
      const c = cardFor(p, 'hand');
      c.setAttribute('role', 'listitem');
      handEl.append(c);
    }
    if (!xs.length) handEl.append(h('p', 'pc-hint', t('手札はすべて机の上です', 'All your cards are on the table')));
    drawDetail();
  }
  draw();
  return { deskEl, slotsEl, handEl, detail, place, draw, lock: (v: boolean) => deskEl.classList.toggle('is-lock', v) };
}

/** 会議室の席（A.items の順）に、反応の顔を出す。消すときは clear */
function seatFaces(wrap: HTMLElement) {
  const seats = [...wrap.querySelectorAll<HTMLElement>('.isl-bm-room .isl-bm-seat')];
  return {
    seats,
    face: (k: number, emo: string, cls: string) => {
      const st = seats[k];
      if (!st) return;
      st.querySelector('.pc-face')?.remove();
      const f = h('span', `pc-face ${cls}`, emo);
      st.append(f);
    },
    clear: () => {
      seats.forEach((x) => {
        x.querySelector('.pc-face')?.remove();
        x.classList.remove('is-on');
      });
    },
  };
}

/** マインちゃんの一言の箱 */
function mineSay(text: string): HTMLElement {
  const e = h('div', 'pc-mine');
  const im = h('img', 'pc-mine-img');
  im.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
  im.alt = '';
  const b = h('div', 'pc-mine-say');
  b.append(h('b', '', t('マインちゃん', 'Mine-chan')), h('p', '', text));
  e.append(im, b);
  return e;
}
/** ハンコ（会社の赤い丸印。段 I2 の CSS をそのまま） */
function stampOn(at: HTMLElement, s: P1State) {
  const st = h('span', 'isl-bm-stamp pc-stamp');
  st.textContent = s.storeName || t('承認', 'OK');
  st.classList.toggle('is-long', [...(s.storeName || '')].length > 4);
  at.append(st);
  void st.offsetWidth;
  st.classList.add('is-down');
  return st;
}

BOARD_SCENES.push({
  id: 'policy',
  when: (s, a) => presDue(s, a),
  run: (ctx, a, panel, next, hooks) => {
    const s = ctx.s();
    const wrap = panel.parentElement as HTMLElement;
    const modal = (panel.closest('.isl-board') as HTMLElement) ?? ctx.root;
    wrap.classList.add('pc-on');
    wrap.classList.toggle('pc-still', still());
    const faces = seatFaces(wrap);
    const seatOf = (d: DeptId) => a.items.findIndex((x) => x.dept === d);
    const done = () => {
      faces.clear();
      wrap.classList.remove('pc-on', 'pc-still');
      next();
    };
    corpStep(ctx, s, a, panel, modal, hooks, faces, () => deptSteps(ctx, s, a, panel, modal, hooks, faces, seatOf, done));
  },
});

type Faces = ReturnType<typeof seatFaces>;

/** ① 全社方針を机に差し出して発表する */
function corpStep(ctx: Ctx, s: P1State, a: BoardAgenda, panel: HTMLElement, modal: HTMLElement, hooks: BoardHooks, faces: Faces, then: () => void) {
  panel.replaceChildren();
  panel.scrollTop = 0;
  const n = slotsOf(s);
  const rec = recCorp(s);
  const pr = presOf(s, a).corp;
  const desk: Desk = { slots: Array.from({ length: n }, (_, k) => pr?.[k] ?? null), sel: rec[0] ?? null };
  const box = h('div', 'pc-scene');
  const head = h('div', 'pc-head');
  head.append(h('h2', 'pc-title', t(`📜 ${yearOfBoard(a)} 年目の経営方針発表会`, `📜 Year ${yearOfBoard(a)} policy address`)));
  const lead = h('p', 'pc-lead');
  head.append(lead);
  box.append(head);
  const body = h('div', 'pc-body');
  box.append(body);
  const foot = h('div', 'pc-foot');
  const deptIds = presDepts(s);
  const tb = table({
    root: body,
    modal,
    s,
    hand: openPolicies(s, 'corp'),
    rec,
    desk,
    base: () => [...desk.slots.filter((x): x is string => !!x), ...deptIds.map((d) => presOf(s, a).dept[d] ?? presRec(s, a, d)).filter((x): x is string => !!x)],
    hooks,
    changed: () => upd(),
    slotLabel: (k) => String(k + 1),
  });
  const auto = btn(t('✨ 推奨を並べる', '✨ Lay out the picks'), async () => {
    for (const id of rec) {
      if (desk.slots.includes(id)) continue;
      if (!tb.place(id)) break;
      await wait(160);
    }
  }, 'pc-auto');
  const go = btn(t('📣 発表する', '📣 Announce'), () => announce(), 'is-on pc-go');
  foot.append(auto, go);
  box.append(foot);
  panel.append(box);
  function upd() {
    const k = desk.slots.filter(Boolean).length;
    lead.textContent = t(`カードを机の点線の枠へ差し出して、今年の全社方針を役員に示します（机の上 ${k} / ${n}）。タップで効果を見る。`, `Slide cards into the dotted frames to show this year’s company policies (${k} / ${n} on the table). Tap to see effects.`);
    go.disabled = k === 0;
    auto.disabled = rec.every((id) => desk.slots.includes(id)) || desk.slots.every(Boolean);
  }
  upd();
  hooks.sfx('page');

  async function announce() {
    const ids = desk.slots.filter((x): x is string => !!x);
    if (!ids.length) return;
    tb.lock(true);
    go.disabled = true;
    auto.disabled = true;
    presPickCorp(s, a, ids);
    ctx.save();
    hooks.sfx('drum', 0.7);
    // カードが表を向いて光る
    const cards = [...tb.slotsEl.querySelectorAll<HTMLElement>('.pc-card')];
    cards.forEach((c, k) => {
      c.style.setProperty('--k', String(k));
      c.classList.add('is-flip');
    });
    await wait(260 + cards.length * 120);
    hooks.sfx('place', 1.2, 0.8);
    stampOn(tb.deskEl, s);
    await wait(260);
    hooks.sfx('jingle');
    fxAtEl('firework-burst', tb.deskEl, { palette: FX_PAL.ours, opts: { core: FX_PAL.core }, dy: -10 });
    // 役員の反応（部長：その部門の士気 ± と、方針の部門か）
    const rows: { k: number; emo: string; cls: string; text: string; score: number }[] = [];
    a.items.forEach((it, k) => {
      if (!it.dept) {
        faces.face(k, '🙂', 'is-nod');
        return;
      }
      const r = reactOf(s, it.dept, ids);
      const emo = r.score > 0 ? '😊' : r.score < 0 ? '😣' : '🙂';
      const cls = r.score > 0 ? 'is-glad' : r.score < 0 ? 'is-sour' : 'is-nod';
      window.setTimeout(() => faces.face(k, emo, cls), still() ? 0 : 90 * k);
      const why: string[] = [];
      if (r.mo) why.push(t(`${DEPT[it.dept].name}の士気 ${r.mo > 0 ? '+' : '−'}${Math.round(Math.abs(r.mo) * 10) / 10}`, `${DEPT[it.dept].name} morale ${r.mo > 0 ? '+' : '−'}${Math.round(Math.abs(r.mo) * 10) / 10}`));
      if (r.fit) why.push(t('自分の部門の方針', 'their own division’s policy'));
      const word = r.score > 0 ? t('喜んでいる', 'pleased') : r.score < 0 ? t('渋い顔', 'frowning') : t('うなずいた', 'nodding');
      rows.push({ k, emo, cls, score: r.score, text: why.length ? `${word}：${why.join(t('・', ', '))}` : word });
    });
    await wait(500);
    // 詳細と手札を、反応の一覧とマインちゃんの一言に替える
    const res = h('div', 'pc-react');
    res.append(h('h3', 'pc-react-h', t('役員の反応', 'How the board took it')));
    const list = h('div', 'pc-react-list');
    const shown = rows.filter((x) => x.score !== 0).sort((x, y) => y.score - x.score);
    for (const x of shown.slice(0, 6)) {
      const it = a.items[x.k];
      const r = h('div', `pc-react-row ${x.cls}`);
      const nm = h('div', 'pc-react-nm');
      nm.append(h('b', '', heroNm(it.hero)), h('small', '', roleOf(it)));
      r.append(heroIcon(it.hero, 30), nm, h('span', 'pc-react-emo', x.emo), h('small', 'pc-react-why', x.text));
      list.append(r);
    }
    const rest = a.items.length - Math.min(6, shown.length);
    if (rest > 0) list.append(h('p', 'pc-hint', t(`ほか ${rest} 人はうなずいた`, `${rest} others nodded`)));
    const sour = shown.filter((x) => x.score < 0);
    const say = sour.length
      ? t(`引き換えで${DEPT[a.items[sour[0].k].dept!].name}の士気が下がるよ。${heroNm(a.items[sour[0].k].hero)}さんの様子も見てね。`, `This costs ${DEPT[a.items[sour[0].k].dept!].name} some morale. Keep an eye on ${heroNm(a.items[sour[0].k].hero)}.`)
      : t('社長の方針、みんなに届いたよ！ 今年はこれでいこう。', 'Your policy landed with everyone! This is our year.');
    res.append(mineSay(say), list);
    tb.detail.replaceChildren(res);
    lead.textContent = t(`今年の全社方針を発表しました（${ids.length} 枚）。役員の反応を見て、次へ。`, `This year’s company policies are announced (${ids.length}). See how the board took it.`);
    tb.detail.scrollTop = 0;
    tb.handEl.classList.add('is-gone');
    foot.replaceChildren(btn(presDepts(s).length ? t('▶ 事業別の方針へ', '▶ On to division policies') : t('▶ 部長の発表へ', '▶ On to the heads'), () => then(), 'is-on pc-go'));
  }
}

/** ② 事業別の方針：部門ごとに、部長がカードを置く → 承認か差し替え（部長がいなければ社長が置く） */
function deptSteps(ctx: Ctx, s: P1State, a: BoardAgenda, panel: HTMLElement, modal: HTMLElement, hooks: BoardHooks, faces: Faces, seatOf: (d: DeptId) => number, then: () => void) {
  const ds = presDepts(s);
  if (!ds.length) return then();
  const corp = presCorp(s, a);
  const step = (i: number) => {
    faces.clear();
    if (i >= ds.length) return then();
    const d = ds[i];
    const H = headOf(s, d);
    const rec = presRec(s, a, d);
    const cur = presOf(s, a).dept[d] ?? null;
    panel.replaceChildren();
    panel.scrollTop = 0;
    const box = h('div', 'pc-scene is-dept');
    const head = h('div', 'pc-head');
    head.append(h('h2', 'pc-title', t(`📜 事業別の方針 ${i + 1}/${ds.length}・${DEPT[d].icon} ${DEPT[d].name}`, `📜 Division ${i + 1}/${ds.length} · ${DEPT[d].icon} ${DEPT[d].name}`)));
    box.append(head);
    const sayBox = h('div', 'pc-say');
    if (H) {
      const k = seatOf(d);
      if (k >= 0) faces.seats[k]?.classList.add('is-on');
      sayBox.append(heroIcon(H.hero, 40));
      const tx = h('div', 'pc-say-tx');
      tx.append(h('b', '', t(`${heroNm(H.hero)}（${DEPT[d].name}部長）`, `${heroNm(H.hero)} (head of ${DEPT[d].name})`)), h('p', '', heroLine(H.hero, t(`今年の${DEPT[d].name}は「${rec ? POLICY_OF[rec].name : ''}」でいきます`, `this year ${DEPT[d].name} runs on “${rec ? POLICY_OF[rec].name : ''}”`))));
      sayBox.append(tx);
    } else {
      sayBox.append(mineSay(t(`${DEPT[d].name}は部長がいないから、社長がカードを置いてね。`, `${DEPT[d].name} has no head — you place the card.`)));
    }
    head.append(sayBox);
    const body = h('div', 'pc-body');
    box.append(body);
    const desk: Desk = { slots: [H ? null : cur], sel: cur ?? rec };
    const tb = table({
      root: body,
      modal,
      s,
      hand: openPolicies(s, 'dept', d),
      rec: rec ? [rec] : [],
      desk,
      base: () => deptBase(s, corp, presOf(s, a).dept, d, ds),
      hooks,
      changed: () => upd(),
      slotLabel: () => `${DEPT[d].icon} ${DEPT[d].name}`,
    });
    const foot = h('div', 'pc-foot');
    const restBtn = btn(t('⚡ 残りは部長の案', '⚡ Rest as proposed'), () => {
      faces.clear();
      ctx.save();
      then();
    }, 'pc-auto');
    const place = btn(t('✨ 推奨を置く', '✨ Place pick'), () => rec && tb.place(rec), 'pc-auto');
    const ok = btn('', () => decide(), 'is-on pc-go');
    if (i < ds.length - 1) foot.append(restBtn);
    if (!H) foot.append(place);
    foot.append(ok);
    box.append(foot);
    panel.append(box);
    function upd() {
      const id = desk.slots[0];
      ok.disabled = !id;
      ok.textContent = !id ? t('カードを置く', 'Place a card') : H ? (id === rec ? t('✔ 承認する', '✔ Approve') : t('🖋 差し替える', '🖋 Swap')) : t('🖋 決める', '🖋 Decide');
      place.disabled = !rec || id === rec;
    }
    upd();
    hooks.sfx('page');
    // 部長が自分のカードを机に置く（席から飛んでくる）
    if (H && (cur ?? rec)) {
      const id = (cur ?? rec)!;
      const seat = faces.seats[seatOf(d)];
      tb.lock(true);
      window.setTimeout(
        () => {
          const slot = tb.slotsEl.querySelector('.pc-slot') as HTMLElement | null;
          if (seat && slot && !still()) {
            const fly = policyCardEl(POLICY_OF[id], id === rec);
            fly.classList.add('pc-ghost', 'is-fly');
            const r0 = seat.getBoundingClientRect();
            const r1 = slot.getBoundingClientRect();
            fly.style.left = `${r1.left}px`;
            fly.style.top = `${r1.top}px`;
            fly.style.width = `${r1.width}px`;
            fly.style.height = `${r1.height}px`;
            fly.style.transform = `translate(${r0.left + r0.width / 2 - (r1.left + r1.width / 2)}px, ${r0.top - r1.top}px) scale(0.3)`;
            modal.append(fly);
            void fly.offsetWidth;
            fly.style.transform = 'translate(0, 0) scale(1)';
            window.setTimeout(() => {
              fly.remove();
              tb.lock(false);
              tb.place(id, 0);
            }, 460);
          } else {
            tb.lock(false);
            tb.place(id, 0);
          }
        },
        still() ? 0 : 280,
      );
    }
    async function decide() {
      const id = desk.slots[0];
      if (!id) return;
      tb.lock(true);
      ok.disabled = true;
      presPickDept(s, a, d, id);
      ctx.save();
      hooks.sfx('place', 1.2, 0.8);
      stampOn(tb.deskEl, s);
      const k = seatOf(d);
      if (H && k >= 0) faces.face(k, id === rec ? '😊' : '😮', id === rec ? 'is-glad' : 'is-nod');
      await wait(240);
      hooks.sfx(H && id !== rec ? 'buff' : 'okay');
      fxAtEl('collect-burst', tb.deskEl, { palette: FX_PAL.gold, dy: 10 });
      await wait(650);
      step(i + 1);
    }
  };
  step(0);
}
