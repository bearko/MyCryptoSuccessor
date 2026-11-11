/**
 * 段 UIX2m：建物の吹き出し（docs/ISLAND_UIX.md「画面：建物の吹き出し」）。手触りラボ C（public/uixlab/c/js/pop.js・world.js）から移した。
 * 建物を押す → カメラが寄り（今のカメラの仕組み：p1/main.ts の tween）、建物の入口から紙の吹き出しが立ち上がる。
 * 担当のヒーローが枠の上に立ち（枠破り・整数倍）、1 字ずつ喋る（声は人ごと）。セリフの長さで枠が伸び縮みする。ボタンはキー。
 *
 * 中身は今の吹き出し（p1/tile.ts の tileContent）をそのまま使う：
 * - 担当のひと言・いまの様子・建物の説明 → セリフ（押すと次へ）
 * - 下のボタン（開く・移転・撤去・建てる・発掘 ほか）→ キー（スマホは下に固定・PC は吹き出しのすぐ下）
 * - 担当への指示・数字・設備投資 ほか → 「くわしく」の板（暗い計器の板。今の並びのまま、今の要素のまま）
 * 今の要素を作り直さずに入れ替えるだけなので、押す先・チュートリアルの目印（is-guide・is-hot）はそのまま効く。
 */
import { t } from '../../../i18n';
import { P1B } from '../../p1/data';
import { moveCost } from '../../p1/model';
import { ordersOf, inTut } from '../../p1/orders';
import { heroIcon, heroName } from '../../p1/ui';
import { el, fmtN } from '../dom';
import { uxBubble, uxKey, uxLamp, uxMeter, uxTape } from '../parts';
import { isCalm } from '../prefs';
import type { UxmCam, UxmHost } from './mhooks';
import { LABEL_ICO, mIcon } from './micons';

/** 吹き出しの幅（見本と同じ） */
export const POP_W = 366;
/** 広い画面（吹き出しのすぐ下にキー・横に「くわしく」の板） */
export const isWide = (W: number) => W >= 700;

/** セリフの並び：担当のひと言 → いまの様子 → 建物の説明。何も無ければ建物の名前 */
export function popLines(o: { greet?: string; status?: string; desc: string[]; title: string }): string[] {
  const out = [o.greet, o.status, ...o.desc].map((x) => (x ?? '').trim()).filter(Boolean);
  return out.length ? out : [o.title];
}

/** 寄ったときの倍率：1 マスの建物は等倍（ドットがにじまない）。大きい建物はスマホで画面に入る倍率。いまより引かない */
export function popZoom(W: number, size: number, now: number): number {
  const z = !isWide(W) && size >= 2 ? 0.75 : 1;
  return Math.min(2, Math.max(now, z));
}
/**
 * カメラの寄り先：建物の絵が上の帯のすぐ下に来る（スマホ）・上の帯の右に来る（PC）。
 * 返すのはカメラのまんなかのワールド座標と倍率（p1/main.ts の tween と同じ決まり：画面 = (world − cam) × zoom ＋ 画面の半分）
 */
export function popCamTarget(o: { i: number; j: number; size: number; W: number; H: number; zoom: number; hudBottom: number; hudRight: number }): { x: number; y: number; zoom: number; sx: number; sy: number } {
  const z = popZoom(o.W, o.size, o.zoom);
  const wide = isWide(o.W);
  // 建物の絵は、基準のマスより上に 180 画素ほど伸びる
  const sy = wide ? Math.max(o.H * 0.3, 60 + 180 * z) : Math.min(o.H * 0.5, o.hudBottom + 16 + 170 * z);
  const sx = wide ? Math.max(o.W * 0.42, Math.min(o.W * 0.6, o.hudRight + 120 * z)) : o.W * 0.6;
  const wx = (o.i - o.j) * 100;
  const wy = (o.i + o.j) * 55;
  return { x: wx - (sx - o.W / 2) / z, y: wy - (sy - o.H / 2) / z, zoom: z, sx, sy };
}

/** 吹き出しの置き場所（左上）と尻尾の先。建物の入口（基準のマスの少し下）から立ち上がる。画面と下のキーに重ねない */
export function popPlaceUx(o: { sx: number; sy: number; zoom: number; W: number; right: number; bw: number; top0: number; maxTop: number }): { left: number; top: number; tail: number } {
  const left = Math.round(Math.max(8, Math.min(o.right - o.bw - 8, o.sx - o.bw * 0.62)));
  const top = Math.round(Math.max(o.top0, Math.min(o.maxTop, o.sy + 46 * o.zoom + 8)));
  return { left, top, tail: o.sx - left };
}

/** 「あと N G」の N（足りない額。書いていなければ null） */
export function shortOf(text: string): number | null {
  const m = /あと\s*([\d,]+)\s*G/.exec(text) ?? /([\d,]+)\s*G short/.exec(text);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}
/** 足りないときの目盛り（持っている額 ÷ 要る額。20 段・少しでも見える） */
export const gapMeter = (money: number, need: number) => Math.max(0.05, Math.min(1, Math.round((Math.max(0, money) / Math.max(1, Math.max(0, money) + need)) * 20) / 20));

/** 字の頭の絵文字（1 つ）と、残りの字 */
export function splitEmoji(text: string): { emoji: string; rest: string } {
  const m = /^(\p{Extended_Pictographic}\uFE0F?)\s*/u.exec(text);
  return m ? { emoji: m[1].replace('\uFE0F', ''), rest: text.slice(m[0].length) } : { emoji: '', rest: text };
}
/** キーの字の頭の絵文字を、ドットの絵に替える（字はそのまま） */
function dressLabel(b: HTMLElement) {
  const n = b.firstChild;
  if (!n || n.nodeType !== 3) return;
  const { emoji, rest } = splitEmoji(n.textContent ?? '');
  if (!emoji) return;
  n.textContent = rest;
  const name = LABEL_ICO[emoji];
  if (!name) return;
  const dark = b.classList.contains('is-on') || b.classList.contains('is-danger');
  const ic = mIcon(name, b.matches(':disabled') ? { color: '#97a1cf', hi: '#97a1cf', lo: '#20253d' } : dark ? { color: '#1a1c2e', hi: '#ffe394', lo: '#7a3f06' } : {});
  ic.classList.add('uxm-btn-ico');
  b.prepend(ic);
}

export function installPop(host: UxmHost) {
  const pop = host.pop;
  const legacyX = pop.querySelector<HTMLButtonElement>('.isl-pop-head .isl-btn');
  const body = pop.querySelector<HTMLElement>('.isl-pop-scroll')!;
  const acts = pop.querySelector<HTMLElement>('.isl-pop-acts-fix')!;
  pop.classList.add('uxm-pop');

  // ---- 器
  const bubbleBox = el('div.uxm-pop-bubble');
  const lamp = uxLamp('', true, true);
  const moreTxt = el('b');
  const more = uxKey(el('span.uxm-more-in', lamp, moreTxt), () => setData(!dataOn), { ico: 'list', cls: 'uxm-pop-more', attrs: { 'aria-expanded': 'false', 'data-ux-quiet': '' } });
  const under = el('div.uxm-pop-under', more);
  const anchor = el('div.uxm-pop-anchor', bubbleBox, under);
  const gaps = el('div.uxm-pop-gaps', { hidden: true });
  const actions = el('div.uxm-pop-actions.ux-pop-actions', gaps, acts);
  const dataHead = el('div.uxm-pop-datahead', uxTape(t('くわしく', 'Details')), uxKey(el('span.ux-vh', t('もどる', 'Back')), () => setData(false), { ico: 'close', cls: 'uxm-pop-datax', attrs: { 'aria-label': t('くわしくを閉じる', 'Close details'), 'data-ux-quiet': '' } }));
  const data = el('div.uxm-pop-data.ux-plate', { hidden: true }, el('div.ux-screws'), dataHead, body);
  const stage = el('div.uxm-pop-stage.ux-pop.ux-root', anchor, data, actions);
  pop.append(stage);
  // 地図を暗い網目でそっと落とす（吹き出しを出しているあいだ）
  const dim = el('div.ux-dim.is-soft.uxm-pop-dim', { 'aria-hidden': 'true' });
  host.root.before(dim);

  let bubble: ReturnType<typeof uxBubble> | null = null;
  let titleEl: HTMLElement | null = null;
  let key = '';
  let open = false;
  /** 「くわしく」の板を開いているか。広い画面は、はじめから開く（置く場所がある）。押して変えたら、その向きを覚える */
  let dataOn = false;
  let dataPick: boolean | null = null;
  let wide: boolean | null = null;
  let saved: { x: number; y: number; zoom: number } | null = null;
  let target: { x: number; y: number; zoom: number } | null = null;
  let leaveT = 0;
  let riseT = 0;
  /** この吹き出しのために、カメラを寄せはじめた（cam() を呼んだ直後の描き直し） */
  let camMoving = false;

  function setData(on: boolean, user = true) {
    if (user) dataPick = on;
    dataOn = on;
    data.hidden = !on;
    stage.classList.toggle('is-data', on);
    more.setAttribute('aria-expanded', String(on));
    if (on && user) {
      data.classList.remove('is-in');
      void data.offsetWidth;
      data.classList.add('is-in');
      // 開いた指の続きの click が、出てきた板の中のボタンに当たらないように（0.35 秒だけ押せなくする）
      data.classList.add('is-arming');
      window.setTimeout(() => data.classList.remove('is-arming'), 350);
    }
    place();
  }

  /** いまの中身（今の吹き出しが作った body）から、セリフと「くわしく」に分ける */
  function split(title: string) {
    const s = host.s();
    const b = host.sel();
    const box = b && !inTut(s) && !host.popSector() ? ordersOf(s, b) : null;
    const root = body.querySelector<HTMLElement>(':scope > .isl-pop-body') ?? body.firstElementChild;
    // 担当の顔・名前・ひと言・様子は、枠の上の人物とセリフへ（指示のボタンは「くわしく」に残す）
    root?.querySelector('.isl-orders-head')?.remove();
    // 建物の説明（色の付いていない段落）は、セリフへ
    const desc: string[] = [];
    for (const p of root ? [...root.querySelectorAll<HTMLElement>(':scope > p:not([class])')] : []) {
      desc.push(p.textContent ?? '');
      p.remove();
    }
    // 足りないときの理由（今の赤・橙の小さな字）は、下のキーのすぐ上へ（責めない言い方と目盛りで）
    const notes: { text: string; need: number | null }[] = [];
    for (const n of root ? [...root.querySelectorAll<HTMLElement>(':scope > small')] : []) {
      const text = (n.textContent ?? '').trim();
      const need = shortOf(text);
      if (!(n.classList.contains('isl-bad') || n.classList.contains('isl-warn') || need != null)) continue;
      notes.push({ text, need });
      n.remove();
    }
    // 移転のお金が足りない（今はキーが平らになるだけ）：あといくらかを添える
    if (b && b.owner === 'me' && !b.up && b.left <= 0 && s.money < moveCost(b)) {
      const need = Math.ceil(moveCost(b) - s.money);
      notes.push({ text: t(`移転まで あと ${fmtN(need)} G。売上がたまれば届きます`, `Moving: ${fmtN(need)} G short. Sales will get you there`), need });
    }
    const orders = root?.querySelectorAll('.isl-order').length ?? 0;
    const rec = !!root?.querySelector('.isl-order.is-rec');
    // いますぐ押してほしい所（光っている枠・確かめの枠・直すボタン）が「くわしく」の中にあるか
    const hot = !!root?.querySelector('.is-hot, .is-guide, .isl-pop-confirm, .isl-pop-act');
    const rest = !!root && root.childElementCount > 0;
    return { box, notes, hero: box?.hero ?? null, lines: popLines({ greet: box?.greet, status: box?.status, desc, title }), orders, rec, hot, rest };
  }

  /** 中身を作り直した（p1/main.ts の renderPop から）。同じ建物・同じセリフなら、喋りなおさない */
  function render(title: string): boolean {
    if (leaveT) {
      clearTimeout(leaveT);
      leaveT = 0;
      stage.classList.remove('is-out');
      pop.append(stage);
    }
    const at = host.popAt();
    const b = host.sel();
    const m = split(title);
    for (const x of stage.querySelectorAll<HTMLElement>('.isl-pop-acts-fix .isl-btn, .isl-pop-scroll .isl-btn')) dressLabel(x);
    const shown = splitEmoji(title).rest;
    const k = `${at}|${b?.uid ?? ''}|${title}|${m.hero}|${m.lines.join('\n')}`;
    const fresh = k !== key || !open;
    if (fresh) {
      key = k;
      bubble?.destroy();
      const name = m.hero != null ? heroName(m.hero) : undefined;
      bubble = uxBubble({
        face: m.hero != null ? heroIcon(m.hero, 128) : undefined,
        name,
        role: m.box?.role.text,
        voice: m.hero ?? undefined,
        lines: m.lines,
        onClose: () => legacyX?.click(),
        flow: true,
      });
      // 建物の名前：人物がいるときはセリフの下の段の左（名前の札は人物の名前）、いないときは枠の上のふちの貼り札
      titleEl = el(`span.ux-tape.uxm-pop-title${m.hero != null ? '.has-face.ux-tape--dark' : ''}`, el('b', shown));
      if (m.hero != null) bubble.el.querySelector('.ux-pop-foot')?.prepend(titleEl);
      else bubble.el.querySelector('.ux-pop-rise')?.append(titleEl);
      // 閉じるキーは自分の音（押す・離す）を持つ：全体の押した音と重ねない
      bubble.el.querySelector('.ux-pop-x')?.setAttribute('data-ux-quiet', '');
      bubbleBox.replaceChildren(bubble.el);
      stage.setAttribute('role', 'dialog');
      stage.setAttribute('aria-label', name ? t(`${name}の話`, `${name} speaking`) : shown);
    }
    // 「くわしく」の札：指示の数・推奨のランプ
    more.hidden = !m.rest;
    moreTxt.textContent = m.orders ? t(`指示 ${m.orders}・くわしく`, `Orders ${m.orders} · Details`) : t('くわしく', 'Details');
    lamp.style.display = m.rec ? '' : 'none';
    // 開いたとき：広い画面は開く。いますぐ押してほしい所が中にあれば、せまい画面でも開く
    const w = isWide(host.size().W);
    // せまい画面は、建物ごとに閉じた形から（セリフを隠さない）。同じ建物の描き直しでは、いまの向きのまま
    const want = m.rest && (m.hot || (fresh ? (w ? (dataPick ?? true) : false) : dataOn));
    if (want !== dataOn || fresh) setData(want, false);
    dim.classList.add('is-on');
    host.root.classList.add('uxm-popping');
    // 足りない理由の札
    const gk = m.notes.map((n) => n.text).join('|');
    if (gk !== gaps.dataset.k || fresh) {
      gaps.dataset.k = gk;
      gaps.hidden = !m.notes.length;
      gaps.replaceChildren(
        ...m.notes.map((n) => {
          const mt = n.need != null ? uxMeter(0) : null;
          if (mt) requestAnimationFrame(() => mt.set(gapMeter(host.s().money, n.need ?? 0)));
          return el('div.uxm-gap', mt?.el ?? null, el('span', n.text));
        }),
      );
    }
    // 主のキー（工房を開く・お店を開く）に、建物の絵を添える
    const kind = b && b.owner === 'me' ? P1B[b.id]?.kind : null;
    const mainKey = kind === 'workshop' || kind === 'shop' ? acts.querySelector<HTMLElement>('.isl-btn.is-on:not(:has(canvas))') : null;
    if (mainKey) {
      const ic = mIcon(kind === 'workshop' ? 'hammer' : 'shop', { color: '#1a1c2e', hi: '#1a1c2e', lo: '#7a3f06' });
      ic.classList.add('uxm-btn-ico');
      mainKey.prepend(ic);
    }
    if (fresh) {
      open = true;
      place();
      // カメラが寄りきる少し前に、吹き出しが立ち上がる（見本と同じ 300ms。動きを減らすときはすぐ）
      const b0 = bubble;
      const rise = () => {
        riseT = 0;
        stage.style.visibility = '';
        if (bubble !== b0 || !open) return;
        place();
        bubble?.start();
        stage.classList.remove('is-in');
        void stage.offsetWidth;
        stage.classList.add('is-in');
      };
      clearTimeout(riseT);
      if (isCalm() || !camMoving) rise();
      else {
        stage.style.visibility = 'hidden';
        riseT = window.setTimeout(rise, 300);
      }
      camMoving = false;
    } else {
      bubble?.fit(false);
      place();
    }
    return true;
  }

  /** 建物に合わせて置く（地図を描いたコマごと） */
  function place(): boolean {
    if (!open || pop.hidden) return true;
    const at = host.popAt();
    if (!at || !bubble) return true;
    const { W, H } = host.size();
    const b = host.sel();
    const [i, j] = b ? [b.i, b.j] : at;
    const cam = host.cam;
    const sx = ((i - j) * 100 - cam.x) * cam.zoom + W / 2;
    const sy = ((i + j) * 55 - cam.y) * cam.zoom + H / 2;
    const w = isWide(W);
    if (w !== wide) {
      wide = w;
      stage.classList.toggle('is-wide', w);
      // 広い画面：キーは吹き出しのすぐ下に付いていく。せまい画面：押しやすい下に固定
      if (w) under.append(actions);
      else stage.append(actions);
    }
    const fr = host.foot.getBoundingClientRect();
    const rail = fr.height > fr.width;
    const right = rail ? fr.left : W;
    const bottom = rail ? H - 8 : fr.top - 6;
    const bw = bubble.el.offsetWidth || Math.min(POP_W, W - 16);
    const bh = bubble.height || bubble.el.offsetHeight;
    const hasFace = !!bubble.el.querySelector('.ux-pop-who');
    const top0 = host.hudBottom() + (hasFace ? 92 : 58);
    const underH = under.offsetHeight;
    const actsH = w ? 0 : actions.offsetHeight + 8;
    const p = popPlaceUx({ sx, sy, zoom: cam.zoom, W, right: w && dataOn ? right - Math.min(360, right - bw - 40) - 12 : right, bw, top0, maxTop: Math.max(top0, bottom - actsH - bh - (w ? underH : more.hidden ? 0 : 46)) });
    anchor.style.transform = `translate3d(${p.left}px,${p.top}px,0)`;
    bubble.pointAt(p.tail);
    // 枠の上のふちの名前の札は、尻尾に重ねない（尻尾の左か右の、広いほうへ）
    if (titleEl && !hasFace) {
      const tx = Math.max(40, Math.min(bw - 60, p.tail - 12));
      const leftRoom = tx - 18;
      const rightRoom = bw - 60 - (tx + 36);
      if (leftRoom >= rightRoom) titleEl.style.cssText = `left:10px;max-width:${Math.round(Math.max(60, leftRoom))}px;`;
      else titleEl.style.cssText = `left:${Math.round(tx + 36)}px;max-width:${Math.round(Math.max(60, rightRoom))}px;`;
    }
    if (!w) actions.style.bottom = `${Math.round(H - bottom)}px`;
    else actions.style.bottom = '';
    if (dataOn) {
      if (w) {
        // 横に置く（右に置けなければ左）
        const dw = Math.min(360, right - bw - 40);
        const dl = p.left + bw + 12 + dw <= right - 8 ? p.left + bw + 12 : Math.max(8, p.left - dw - 12);
        const dt = Math.max(host.hudBottom() + 8, Math.min(p.top - 50, bottom - 320));
        data.style.cssText = `left:${Math.round(dl)}px;top:${Math.round(dt)}px;width:${Math.round(dw)}px;max-height:${Math.round(bottom - dt)}px;`;
      } else {
        // 吹き出しの名前の札の下から、下の帯の上まで（人物と名前は残す）
        const dt = p.top + (hasFace ? 40 : 30);
        data.style.cssText = `left:6px;right:6px;top:${Math.round(dt)}px;height:${Math.round(Math.max(160, bottom - dt))}px;`;
      }
    }
    return true;
  }

  function cam(i: number, j: number, size: number): UxmCam | null {
    if (host.popSector()) return null;
    const { W, H } = host.size();
    const c = host.cam;
    if (!open || !saved) saved = { x: c.x, y: c.y, zoom: c.zoom };
    const hr = host.hud.getBoundingClientRect();
    const tg = popCamTarget({ i, j, size, W, H, zoom: c.zoom, hudBottom: host.hudBottom(), hudRight: hr.right });
    target = { x: tg.x, y: tg.y, zoom: tg.zoom };
    camMoving = Math.abs(c.zoom - tg.zoom) > 0.01 || Math.abs(c.x - tg.x) * c.zoom > 24 || Math.abs(c.y - tg.y) * c.zoom > 24;
    return { x1: tg.x, y1: tg.y, z1: tg.zoom, dur: isCalm() ? 1 : 480 };
  }

  function close(): UxmCam | null {
    if (!open) return null;
    open = false;
    key = '';
    dim.classList.remove('is-on');
    host.root.classList.remove('uxm-popping');
    clearTimeout(riseT);
    riseT = 0;
    stage.style.visibility = '';
    bubble?.skip();
    // 吹き出しが建物へ戻る（180ms）。そのあいだだけ、器を外に出しておく（今の吹き出しはすぐ hidden になる）
    if (!isCalm()) {
      host.root.append(stage);
      stage.classList.remove('is-in');
      stage.classList.add('is-out');
      leaveT = window.setTimeout(() => {
        leaveT = 0;
        stage.classList.remove('is-out');
        pop.append(stage);
      }, 200);
    }
    // カメラ：寄る前の眺めへ戻る（寄ったあとに自分で動かしていたら、戻さない）
    const c = host.cam;
    const sv = saved;
    const tg = target;
    saved = null;
    target = null;
    if (!sv || !tg) return null;
    const moved = Math.abs(c.x - tg.x) > 40 / c.zoom || Math.abs(c.y - tg.y) > 40 / c.zoom || Math.abs(c.zoom - tg.zoom) > 0.01;
    return moved ? null : { x1: sv.x, y1: sv.y, z1: sv.zoom, dur: isCalm() ? 1 : 420 };
  }

  // 「撤去しますか？」の確かめは「くわしく」の中に出る：出たら板を開いて見せる
  if (typeof MutationObserver === 'function')
    new MutationObserver(() => {
      if (open && !dataOn && body.querySelector('.isl-pop-confirm')) setData(true, false);
    }).observe(body, { childList: true, subtree: true });

  return { render, place, cam, close, stage };
}
