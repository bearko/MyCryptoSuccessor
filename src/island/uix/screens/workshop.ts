/**
 * 段 UIX2s：工房の札（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：工房」）。
 * 見本（public/uixlab/c/js/workshop.js）の場面を、本体の本物のデータへ移した：
 * 見出しと閉じるキー・タブ（520ms の横送り）・作業台（職人が台に立って槌を振る・作る物・進みの計器）・出荷のベルトと物置・
 * 「作る数」のつまみ・「自動製造」のスイッチ・見くらべ・建て替え（町工場 1×2・大工場 2×2）・設備投資（買うと「導入済」が打たれる）。
 * 器は今の札（p1/screens.ts の open()）をそのまま使う：閉じ方・チュートリアルの一言・時間の止め方は今のまま。
 * 中身は 1 回だけ組み、あとは sync() で値だけ合わせる（動きが作り直しで切れないように）。数字とゲームの決まりは p1/model.ts のまま。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { coinsFly } from '../fx';
import { loop } from '../loop';
import { Odo, meterStep, shake, uxFader, uxKey, uxLamp, uxMeter, uxTape, uxToggle, vibrate } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { sIcon } from './s-icons';
import { safe } from './s-press';
import type { WsOpt } from './s-slots';
import './workshop.css';
import type { Mat, Sku } from '../../p1/data';
import type { P1State, PBuilding, Slot } from '../../p1/model';
import type { Ctx } from '../../p1/screens';
import { D } from './s-deps';

/** タブの横送り（見本：520ms・8 段） */
export const TAB_MS = 520;
/** 買ってから「導入済」が打たれるまで（見本：420ms） */
export const STAMP_MS = 420;

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）

/** 作業台 1 台の様子（画面に出す言葉を決める元） */
export type BenchState = 'empty' | 'run' | 'rest' | 'stop' | 'idle';
/**
 * 作業台の様子：職人がいない／作っている／休憩中／止まっている（理由つき）／待っている。
 * err は今の画面と同じ決まり（職人がいなければ worker・作る物があれば craftCheck）
 */
export function benchState(s: P1State, sl: Slot): { state: BenchState; err: string | null } {
  const err = sl.worker == null ? 'worker' : sl.sku ? D.craftCheck(s, sl.sku, sl.worker, sl.back !== undefined) : null;
  if (sl.running && sl.sku) return { state: sl.worker != null && D.staffOf(s, sl.worker)?.resting ? 'rest' : 'run', err };
  if (sl.worker == null) return { state: 'empty', err };
  return { state: err ? 'stop' : 'idle', err };
}
/** 進み（0〜1）と、あと何日か（作っていなければ null） */
export function benchProgress(s: P1State, sl: Slot): { p: number; left: number } | null {
  if (!sl.running || !sl.sku) return null;
  const need = D.craftDays(s, sl.sku);
  const st = sl.worker != null ? D.staffOf(s, sl.worker) : null;
  return { p: Math.max(0, Math.min(1, sl.progress / need)), left: Math.max(0, Math.ceil((need - sl.progress) / (st ? D.speed(st, 'craft', s) : 1))) };
}
/** 作る数の添え書き（今の画面の「作るもの」の枠の小さな字と同じ言葉） */
export function planText(s: P1State, sl: Slot, k: number): string {
  if (!sl.sku) return '';
  if (sl.back !== undefined) {
    const n = (sl.left ?? 0) + (sl.running && !s.deleg?.pend?.[k] ? D.batchOf(sl.sku, s) : 0);
    return sl.back ? t(`いまの素材で あと ${n} 個 → ${D.skuName(sl.back)}に戻る`, `From stock: ${n} more → back to ${D.skuName(sl.back)}`) : t(`いまの素材で あと ${n} 個`, `From stock: ${n} more`);
  }
  if (sl.repeat) return t('自動製造', 'Auto');
  return (sl.left ?? 0) > 0 ? t(`あと ${sl.left} 個`, `${sl.left} more`) : t('この 1 ロットで止める', 'Stops after this lot');
}
/** 作る数のつまみの範囲（今の画面の craftPlan と同じ）：0〜手持ちの素材で作れる最大。1 ロットずつ */
export function planRange(s: P1State, sl: Slot): { batch: number; max: number; cur: number } {
  const batch = sl.sku ? D.batchOf(sl.sku, s) : 1;
  const max = sl.sku ? D.lotsFromStock(s, sl.sku) * batch : 0;
  return { batch, max, cur: sl.repeat ? max : Math.min(sl.left ?? 0, max) };
}
/** 作る数を 1 ロットの倍数にそろえる（0〜max） */
export const planSnap = (v: number, batch: number, max: number) => Math.max(0, Math.min(max, Math.ceil(v / batch) * batch));
/** 足りないときの目盛り（0.05〜1。見本と同じ：1/20 刻み・少しは点ける） */
export const gapRatio = (have: number, cost: number) => Math.max(0.05, meterStep(have / Math.max(1, cost)));
/** タブの並び（チュートリアルのあいだは、設備投資と建て替えを出さない：今の画面と同じ） */
export type WsTab = 'bench' | 'cmp' | 'invest';
export const wsTabs = (tut: boolean): WsTab[] => (tut ? ['bench', 'cmp'] : ['bench', 'cmp', 'invest']);
/** 見出しの名前と添え札：「工房（本店）」→ 工房・本店／町工場 → 町工場・1×2 */
export function wsTitle(b: { id: string; lv?: number } | null): [string, string] {
  if (!b) return [t('工房', 'Workshop'), ''];
  const name = D.bName(b);
  const m = /^(.*?)\s*[（(](.+)[）)]\s*$/.exec(name);
  if (m) return [m[1], m[2]];
  return [name, b.lv ? D.FACTORY.shape[b.lv] : ''];
}

// ---------------------------------------------------------------- 小さな道具

/** 設備の絵（設備投資の id → アイコン） */
const INVEST_ICON: Record<string, string> = { bench: 'bench', carts: 'cart', truck: 'truck', stockroom: 'shelf', tools: 'wrench', breakroom: 'cup' };
const setText = (e: HTMLElement, text: string) => {
  if (e.textContent !== text) e.textContent = text;
};
/** キーの字を替える */
const keyText = (b: HTMLElement, text: string) => {
  const x = b.querySelector('b');
  if (x) setText(x, text);
};
/** 1 回きりの CSS の動きをやり直す */
function replay(e: HTMLElement, cls: string) {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}
/** 資金の数字の場所（金貨が飛んでくる元。上の帯の作りが替わっても落ちないよう、順に探す） */
function fundsPos(): { x: number; y: number } {
  const e = document.querySelector('[data-ux-funds], #isl-ui .isl-hud .isl-stat');
  const r = e?.getBoundingClientRect();
  return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 70, y: 40 };
}
const num = (text: string) => el('span.ux-num', text);

// ---------------------------------------------------------------- 作業台

interface BenchView {
  el: HTMLElement;
  sync: (k: number) => void;
  hop: (dt: number) => void;
}

function benchView(ctx: Ctx, done: () => void): BenchView {
  let k = 0;
  const s = () => ctx.s();
  // ---- 台の絵：職人が台に立つ・火花・作る物
  const whoBox = el('span.uxs-bench-hero');
  const itemBox = el('span.uxs-bench-item');
  const stage = el('div.uxs-bench-stage', whoBox, el('i.uxs-bench-spark'), itemBox);
  const rank = el('span.uxs-rank');
  const lv = el('span.uxs-bench-lv.ux-num');
  const stamina = uxMeter(0, 'good');
  stamina.el.classList.add('uxs-stamina');
  const stat = el('div.uxs-bench-stat', rank, lv);
  const left = el('div.uxs-bench-left', stage, stat, stamina.el);
  // ---- 右：番号・作る物の名前・職人・進みの計器・様子
  const no = uxTape('1', 'dark');
  const name = el('b');
  const fresh = uxTape('NEW', 'amber');
  fresh.classList.add('uxs-new');
  const who = el('div.uxs-bench-who.ux-t-dim');
  const meter = uxMeter(0);
  const lamp = uxLamp('good');
  const status = el('span.uxs-bench-st');
  const plan = el('span.uxs-bench-plan.ux-t-dim');
  const info = el('div.uxs-bench-info', el('div.uxs-bench-name', no, name, fresh), who, meter.el, el('div.uxs-bench-foot', lamp, status), plan);
  // ---- 入れ替えのキー（チュートリアルの強調 is-hot はここに付く。今の目印 isl-slot・isl-ext-slot も同じ意味で付ける）
  const whoKey = uxKey(t('職人をかえる', 'Change crafter'), safe(() => pickWho()), { ico: null, cls: 'uxs-slot uxs-slot--who isl-slot' });
  const itemKey = uxKey(t('作る物をかえる', 'Change item'), safe(() => pickItem()), { ico: null, cls: 'uxs-slot uxs-slot--item isl-slot isl-ext-slot' });
  const keys = el('div.uxs-bench-keys', whoKey, itemKey);
  // ---- 素材 → 商品・お店に並ぶ・止まっている理由・作る数と自動製造
  const bom = el('div.uxs-bom');
  const note = el('div.uxs-make-note');
  const why = el('p.uxs-why', { role: 'status' });
  const ctl = el('div.uxs-ctl');
  const row = el('div.uxs-bench', el('div.uxs-bench-top', left, info), keys, bom, note, why, ctl);

  function pickWho() {
    const st = s();
    const sl = st.slots[k];
    if (!sl) return;
    D.pickHero(ctx.root, st, {
      title: t(`作業台 ${k + 1} の職人`, `Crafter for bench ${k + 1}`),
      task: 'craft',
      current: sl.worker,
      onPick: (v) => {
        if (v == null && sl.worker != null) D.assign(st, sl.worker, null);
        else if (v != null) D.assign(st, v, 'craft', k);
        done();
      },
    });
  }
  function pickItem() {
    const st = s();
    const sl = st.slots[k];
    if (!sl) return;
    const title = t(`作業台 ${k + 1} で作るもの`, `What bench ${k + 1} makes`);
    // 段 UI5c：チュートリアルのあとは、並び（いまの素材で作れる）・絞り込み・ランクアップの印つき
    if (!ctx.step?.()) D.pickMake(ctx, k, { title, items: D.craftable(st), onPick: (x) => D.chooseMake(ctx, st, k, x) });
    else
      D.pickExt(ctx.root, st, {
        title,
        items: D.craftable(st, true),
        current: sl.sku,
        worker: sl.worker,
        badge: ctx.step?.() === 'craft' ? { x: D.sku(D.recommend(st), 'C'), text: t('マインちゃんのおすすめ', 'Mine-chan’s pick') } : null,
        onPick: (x) => x && D.chooseMake(ctx, st, k, x),
      });
  }
  // 台の絵を押しても同じ（左：職人・右：作る物）
  stage.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = stage.getBoundingClientRect();
    uxSfx('press');
    if (e.clientX < r.left + r.width / 2) pickWho();
    else pickItem();
  });

  let heroId: number | null | undefined;
  let heroSp: HTMLElement | null = null;
  let heroRight = false;
  let itemId: Sku | null | undefined;
  let running = false;
  let hopT = 0;
  let hopY = 0;
  let bomSig = '';
  let noteSig = '';
  let ctlSig = '';
  let ctlRef: { fader: ReturnType<typeof uxFader> | null; qty: Odo | null } = { fader: null, qty: null };

  function syncCtl(st: P1State, sl: Slot) {
    if (!sl.sku) {
      ctlSig = '';
      ctl.hidden = true;
      return;
    }
    ctl.hidden = false;
    const { batch, max, cur } = planRange(st, sl);
    const sig = `${sl.sku}|${batch}|${max}|${sl.repeat}|${sl.running}`;
    if (sig === ctlSig) {
      ctlRef.fader?.set(cur);
      ctlRef.qty?.set(cur, { dur: 160 });
      return;
    }
    ctlSig = sig;
    const apply = (v: number) => {
      D.setCraftPlan(st, k, planSnap(v, batch, max));
      done();
    };
    const auto = uxToggle({
      label: t('自動製造', 'Auto'),
      value: sl.repeat,
      onChange: (v) => {
        D.setAutoCraft(st, k, v);
        done();
      },
    });
    const text = sl.repeat
      ? t('素材があるかぎり作り続けます。', 'Keeps making while materials last.')
      : max === 0
        ? t('素材が足りないので、いまは作れません。', 'Not enough materials right now.')
        : t(`手持ちの素材で最大 ${max} 個（1 ロット ${batch} 個ずつ）。${sl.running ? 'いま作っている 1 ロットのあとに、この数だけ作ります。' : ''}`, `Up to ${max} from stock (${batch} per lot).${sl.running ? ' Counted after the current lot.' : ''}`);
    const rows: HTMLElement[] = [el('div.uxs-ctl-row', uxTape(t('自動製造', 'Auto')), auto.el)];
    ctlRef = { fader: null, qty: null };
    // 自動製造が切のときだけ、作る数を決める（入のときは、今の画面でもつまみは使えない）
    if (!sl.repeat) {
      const qty = new Odo({ digits: Math.max(3, String(max).length), value: cur });
      ctlRef.qty = qty;
      const step = (d: number) =>
        uxKey(el('span.ux-vh', d < 0 ? t('1 ロット減らす', 'One lot less') : t('1 ロット増やす', 'One lot more')), safe(() => apply((ctlRef.fader?.value ?? cur) + d * batch)), {
          ico: d < 0 ? 'minus' : 'plus',
          cls: 'uxs-step',
          disabled: max === 0,
          attrs: { 'aria-label': d < 0 ? t('1 ロット減らす', 'One lot less') : t('1 ロット増やす', 'One lot more'), 'data-ux-quiet': '' },
        });
      const minus = step(-1);
      const plus = step(1);
      // 土台のアイコンの名前に無い絵（＋・−）は、この段のアイコンに差し替える
      for (const [b, ico] of [
        [minus, 'minus'],
        [plus, 'plus'],
      ] as const)
        b.querySelector('.ux-ico')?.replaceWith(sIcon(ico, max === 0 ? { color: '#97a1cf' } : {}));
      if (max > 0) {
        const fader = uxFader({
          min: 0,
          max,
          step: batch,
          value: cur,
          label: t('作る数', 'Make'),
          onInput: (v) => qty.set(v, { dur: 160 }),
          onChange: (v) => apply(v),
        });
        ctlRef.fader = fader;
        rows.push(el('div.uxs-ctl-row', uxTape(t('作る数', 'Make')), fader.el), el('div.uxs-ctl-row.uxs-ctl-row--qty', minus, el('span.uxs-ctl-val', qty.el, t('個', 'pcs')), plus));
      } else rows.push(el('div.uxs-ctl-row', uxTape(t('作る数', 'Make')), el('span.uxs-ctl-val', qty.el, t('個', 'pcs'))));
    }
    ctl.replaceChildren(...rows, el('p.uxs-ctl-note.ux-t-dim', text));
  }

  return {
    el: row,
    sync(n) {
      k = n;
      const st = s();
      const sl = st.slots[k];
      if (!sl) return;
      const hero = sl.worker != null ? D.staffOf(st, sl.worker) : null;
      const { state, err } = benchState(st, sl);
      const tut = ctx.step?.();
      setText(no, String(k + 1));
      no.title = t(`作業台 ${k + 1}`, `Workbench ${k + 1}`);
      row.setAttribute('aria-label', t(`作業台 ${k + 1}`, `Workbench ${k + 1}`));
      row.dataset.bench = String(k);
      // ---- 職人
      if (heroId !== sl.worker) {
        heroId = sl.worker;
        if (sl.worker != null) {
          heroSp = D.heroIcon(sl.worker, 64);
          heroSp.classList.add('ux-hero');
          heroRight = D.heroFacesRight(sl.worker);
          whoBox.replaceChildren(heroSp);
        } else {
          heroSp = null;
          whoBox.replaceChildren(el('span.uxs-bench-none', sIcon('plus', { color: '#4a5486', scale: 3 })));
        }
        hopY = NaN;
      }
      setText(who, hero ? D.heroName(hero.hero) : t('職人がいません', 'No crafter yet'));
      stat.hidden = !hero;
      stamina.el.hidden = !hero;
      if (hero) {
        const apt = Math.round(D.aptitude(hero.stats, 'craft'));
        const r = D.rankOf(apt);
        rank.className = `uxs-rank is-${r.toLowerCase()}`;
        rank.replaceChildren(el('b', r), num(String(D.aptShow(apt))));
        rank.title = t(`製造の適性 ${r} ${D.aptShow(apt)}`, `Crafting aptitude ${r} ${D.aptShow(apt)}`);
        setText(lv, (hero.level ?? 1) > 1 ? `Lv ${hero.level}` : '');
        const v = hero.stamina / hero.stats.hp;
        stamina.set(v);
        stamina.el.classList.toggle('is-low', v <= 0.3);
        stamina.el.setAttribute('aria-label', t('スタミナ', 'Stamina'));
      }
      // ---- 作る物
      if (itemId !== sl.sku) {
        itemId = sl.sku;
        if (sl.sku) {
          const ic = D.skuIcon(sl.sku, 64);
          ic.classList.add('ux-ext');
          itemBox.replaceChildren(ic);
        } else itemBox.replaceChildren(el('span.uxs-bench-none', sIcon('plus', { color: '#4a5486', scale: 3 })));
      }
      setText(name, sl.sku ? D.skuName(sl.sku) : t('作る物を選びましょう', 'Choose what to make'));
      name.classList.toggle('ux-t-dim', !sl.sku);
      fresh.hidden = !row.classList.contains('is-new');
      // ---- 進みと様子（色だけに頼らない：ランプ・言葉）
      const pr = benchProgress(st, sl);
      meter.set(pr ? pr.p : 0);
      running = state === 'run';
      row.classList.toggle('is-idle', !running);
      row.classList.toggle('is-stop', state === 'stop' || state === 'empty');
      lamp.className = `ux-lamp ${state === 'run' ? 'ux-lamp--good is-on' : state === 'stop' || state === 'empty' ? 'ux-lamp--bad is-on is-blink' : 'is-on'}`;
      const words: Record<BenchState, string> = {
        run: t(`製造中・あと約 ${pr?.left ?? 0} 日`, `Crafting · ~${pr?.left ?? 0}d left`),
        rest: t('休憩中', 'Resting'),
        stop: t('止まっています', 'Stopped'),
        empty: t('職人を待っています', 'Waiting for a crafter'),
        idle: t('待機中', 'Idle'),
      };
      setText(status, words[state]);
      setText(plan, planText(st, sl, k));
      // ---- 入れ替えのキー
      keyText(whoKey, sl.worker == null ? t('職人を置く', 'Assign crafter') : t('職人をかえる', 'Change crafter'));
      keyText(itemKey, sl.sku ? t('作る物をかえる', 'Change item') : t('作る物を選ぶ', 'Choose item'));
      whoKey.classList.toggle('is-hot', tut === 'craft' && k === 0 && sl.worker == null);
      itemKey.classList.toggle('is-hot', tut === 'craft' && k === 0 && sl.worker != null && !sl.sku);
      itemKey.classList.toggle('is-warn', !!sl.sku && !sl.running && !!err);
      // ---- 素材 → 商品（足りない素材は、色・下線・「不足」の言葉で）
      const recipe = sl.sku ? (Object.entries(D.recipeOf(sl.sku)) as [Mat, number][]) : [];
      const sig = sl.sku ? `${sl.sku}|${D.batchOf(sl.sku, st)}|${recipe.map(([m, q]) => `${m}${(st.mats[m] ?? 0) < q ? '!' : ''}`).join(',')}` : '';
      if (sig !== bomSig) {
        bomSig = sig;
        bom.hidden = !sl.sku;
        if (sl.sku) {
          const out = D.skuIcon(sl.sku, 32);
          out.classList.add('ux-ext');
          bom.replaceChildren(
            ...recipe.map(([m, q]) => {
              const short = (st.mats[m] ?? 0) < q;
              const c = el(`span.uxs-bom-mat${short ? '.is-short' : ''}`, D.matIcon(m, 24), num(`×${q}`), short ? el('small', t('不足', 'short')) : null);
              c.title = `${D.MATS[m].name} ${st.mats[m] ?? 0}`;
              return c;
            }),
            el('span.uxs-bom-arrow', sIcon('next', { color: '#ffb81f', scale: 1 })),
            el('span.uxs-bom-out', out, num(`×${D.batchOf(sl.sku, st)}`)),
          );
        }
      }
      // ---- 製造と販売の連動（段 UI5a）：作る物はお店に自動で並ぶ。主力にするかは 1 行で。チュートリアルのあいだは出さない
      const shops = sl.sku && D.shelvesAuto(st) ? D.myShops(st) : [];
      const not = shops.filter((b) => st.shops[b.uid]?.shelves[0] !== sl.sku);
      const nsig = shops.length ? `${sl.sku}|${shops.map((b) => b.uid).join(',')}|${not.length}` : '';
      if (nsig !== noteSig) {
        noteSig = nsig;
        note.hidden = !shops.length;
        if (shops.length && sl.sku) {
          const x = sl.sku;
          const names = [...new Set(shops.map((b) => D.DEF[b.id]?.name ?? ''))].join(t('・', ', '));
          note.replaceChildren(
            el('span.uxs-make-shop', sIcon('shop', { scale: 1 }), el('span', t(`${names}に自動で並びます`, `Goes on the shelves at ${names}`))),
            not.length
              ? uxKey(
                  t('主力にする', 'Make it the main item'),
                  safe(() => {
                    const cur = s();
                    const todo = D.myShops(cur).filter((b) => cur.shops[b.uid]?.shelves[0] !== x);
                    D.applyPlan(cur, D.manualPlan(todo.map((b) => ({ k: 'main' as const, uid: b.uid, x }))));
                    uxSfx('confirm');
                    ctx.toast(t(`${D.skuName(x)}を ${todo.length} 軒のお店の主力にしました`, `${D.skuName(x)} is now the main item at ${todo.length} shop(s)`));
                    done();
                  }),
                  { cls: 'uxs-make-main' },
                )
              : uxTape(t('主力', 'Main item'), 'good'),
          );
        }
      }
      // ---- 止まっている理由（責めない言い方で、次にやることを添える）
      const reason = err && !sl.running ? (sl.sku ? D.craftErr(sl.sku, err, st) : (D.CRAFT_ERR[err] ?? err)) : '';
      why.hidden = !reason;
      if (reason && why.dataset.text !== reason) {
        why.dataset.text = reason;
        why.replaceChildren(sIcon('warn', { scale: 1 }), el('span', reason));
      }
      syncCtl(st, sl);
    },
    hop(dt) {
      // 職人が槌を振る：2 コマの小さな上下（止まっているときは息だけ）。動きを減らすときは止める
      if (!heroSp) return;
      hopT += dt;
      const f = running ? Math.floor(hopT / 190) % 4 : Math.floor(hopT / 900) % 2;
      const y = isCalm() ? 0 : running ? (f === 1 ? -4 : f === 2 ? 2 : 0) : f ? -2 : 0;
      if (y !== hopY) {
        hopY = y;
        heroSp.style.transform = `translate3d(0,${y}px,0)${heroRight ? '' : ' scaleX(-1)'}`;
        row.classList.toggle('is-hit', running && f === 2);
      }
    },
  };
}

// ---------------------------------------------------------------- 設備投資の札

interface InvestView {
  el: HTMLElement;
  sync: () => void;
}
function investView(ctx: Ctx, x: (typeof D.INVESTS)[number], ws: () => PBuilding | null, done: () => void): InvestView {
  const s = () => ctx.s();
  const lamp = uxLamp('good');
  const pic = el('div.uxs-inv-pic', sIcon(INVEST_ICON[x.id] ?? 'gear', { scale: 4, color: '#97a1cf', hi: '#f4ecd4', lo: '#3a4266' }), lamp);
  const pips = el('span.uxs-inv-pips');
  const stamp = el('span.uxs-inv-stamp.ux-tape.ux-tape--good', sIcon('check', { color: '#1a1c2e', scale: 1 }), t('導入済', 'Installed'));
  const price = num('');
  const priceRow = el('div.uxs-inv-price', sIcon('coin', { scale: 1 }), price);
  const gapMeter = uxMeter(0);
  const gapTxt = el('span');
  const gap = el('div.uxs-inv-gap', gapMeter.el, gapTxt);
  const buyKey = uxKey(t('買う', 'Buy'), safe(() => buy()), { kind: 'main', cls: 'uxs-inv-buy', strong: true, attrs: { 'data-ux-quiet': '' } });
  const card = el('div.uxs-inv', pic, el('div.uxs-inv-body', el('div.uxs-inv-name', el('b', x.name), pips, stamp), el('p.uxs-inv-desc', x.note), priceRow, gap), buyKey);
  card.dataset.invest = x.id;
  /** 「導入済」を打っている途中（その間は描き直さない） */
  let stamping = false;

  function buy() {
    const st = s();
    const b = ws();
    if (!b || stamping) return;
    const cost = D.investCost(b, x.id);
    if (cost == null || b.left > 0) {
      uxSfx('flap');
      return;
    }
    if (st.money < cost) {
      // 足りない：責めない。あといくらかを、目盛りと言葉でそっと見せる
      uxSfx('deny');
      gapMeter.set(0);
      replay(gap, 'is-in');
      requestAnimationFrame(() => gapMeter.set(gapRatio(st.money, cost)));
      return;
    }
    const e = D.invest(st, b.uid, x.id);
    if (e) {
      uxSfx('deny');
      if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
      return;
    }
    // 買えた：資金が転がって減る → 金貨が飛ぶ → ランプが点き、「導入済」の札が打たれる
    uxSfx('cash');
    vibrate(12);
    const r = card.getBoundingClientRect();
    coinsFly(fundsPos(), { x: r.left + 44, y: r.top + 40 }, 9);
    replay(card, 'is-bought');
    shake(card);
    stamping = true;
    ctx.save();
    ctx.refresh();
    const lvNow = D.invLv(b, x.id);
    setTimeout(
      () => {
        stamping = false;
        uxSfx('stamp');
        ctx.toast(t(`「${x.name}」を導入しました`, `Installed: ${x.name}`));
        done();
        // いま点いた段のランプを光らせる
        const lit = pips.children[lvNow - 1] as HTMLElement | undefined;
        if (lit) replay(lit, 'is-new');
        if (D.investCost(b, x.id) == null) replay(stamp, 'is-new');
      },
      isCalm() ? 0 : STAMP_MS,
    );
  }

  return {
    el: card,
    sync() {
      if (stamping) return;
      const st = s();
      const b = ws();
      if (!b) return;
      const lv = D.invLv(b, x.id);
      const cost = D.investCost(b, x.id);
      const max = cost == null;
      const busy = b.left > 0;
      card.classList.toggle('is-owned', lv > 0);
      card.classList.toggle('is-max', max);
      lamp.classList.toggle('is-on', lv > 0);
      // 段のランプ（何段まであるか・いま何段か）。1 段だけの設備は出さない
      if (x.cost.length > 1) {
        if (pips.childElementCount !== x.cost.length) pips.replaceChildren(...x.cost.map(() => uxLamp('good')));
        [...pips.children].forEach((p, i) => p.classList.toggle('is-on', i < lv));
        pips.setAttribute('aria-label', `${lv}/${x.cost.length}`);
        pips.title = `${lv}/${x.cost.length}`;
      }
      stamp.hidden = !max;
      priceRow.hidden = max;
      if (!max) setText(price, `${D.fmt(cost)} G`);
      // 資金が足りないときは、その場で「あと ○○ G」（今の画面と同じ）と目盛り
      const short = !max && !busy && st.money < cost;
      gap.hidden = !short;
      if (short) {
        setText(gapTxt, t(`あと ${D.fmt(cost - st.money)} G。売上がたまれば届きます`, `${D.fmt(cost - st.money)} G to go. Sales will get you there`));
        gapMeter.set(gapRatio(st.money, cost));
      }
      keyText(buyKey, max ? t('導入済', 'Installed') : busy ? t('工事中', 'Under construction') : t('買う', 'Buy'));
      const flat = max || busy;
      buyKey.className = `ux-key uxs-inv-buy ${flat ? 'ux-key--flat' : short ? '' : 'ux-key--main'}`.trim();
      buyKey.setAttribute('aria-disabled', String(flat));
    },
  };
}

// ---------------------------------------------------------------- 建て替え（町工場 1×2・大工場 2×2）

/** 段の形のマス（1×1・1×2・2×2） */
function shape(lv: number, cls: string) {
  const g = el(`span.uxs-fac-shape.is-s${lv}${cls ? '.' + cls : ''}`);
  for (let k = 0; k < D.FACTORY.size[lv]; k++) g.append(el('i'));
  return g;
}
function facView(ctx: Ctx): { el: HTMLElement; sync: () => void } {
  const box = el('div.uxs-fac');
  let sig = '';
  return {
    el: box,
    sync() {
      const s = ctx.s();
      const ws = D.wsAny(s);
      const show = !!ws && ws.left <= 0 && !ctx.step?.();
      box.hidden = !show;
      if (!show || !ws) return;
      const cur = D.facLv(s);
      const c = D.upCheck(s);
      const tip = cur === 0 && c.lv === 1 && (!c.err || c.err === 'money') && D.benchCount(s) >= 3 && D.myShops(s).length > 0 && D.jamOf(s) === 'craft';
      const here = c.lv && !c.err ? !!D.upSpots(s, c.lv)[0]?.here : false;
      const next = `${cur}|${c.lv}|${c.err}|${c.cost}|${c.days}|${ws.up ? `${ws.up.lv}:${ws.up.left}` : ''}|${c.err === 'money' ? s.money : ''}|${tip}|${here}|${c.lv ? D.benchAfter(s, c.lv) : ''}`;
      if (next === sig) return;
      sig = next;
      const steps = el('div.uxs-fac-steps', { role: 'list' });
      D.FACTORY.name.forEach((nm, lv) => {
        if (lv) steps.append(el('span.uxs-fac-arrow', sIcon('next', { color: '#97a1cf', scale: 1 })));
        const cls = lv === cur ? 'is-cur' : lv === (ws.up ? ws.up.lv : c.lv) ? 'is-next' : lv < cur ? 'is-done' : '';
        steps.append(el(`span.uxs-fac-step${cls ? '.' + cls : ''}`, { role: 'listitem' }, shape(lv, cls), el('span', nm), lv === cur ? uxTape(t('いま', 'Now'), 'amber') : null));
      });
      const kids: (HTMLElement | null)[] = [el('div.uxs-fac-head', el('b', t('建て替え', 'Rebuild')), el('span.ux-t-dim', t('工房 → 町工場 → 大工場', 'workshop → town factory → big factory'))), steps];
      if (ws.up) {
        // 建て替えの途中：進みと残りの日数（そのあいだも作り続ける）
        const m = uxMeter(1 - ws.up.left / ws.up.days);
        kids.push(el('div.uxs-fac-prog', el('span.uxs-fac-run', sIcon('crane', { color: '#ffb81f', scale: 1 }), t(`${D.FACTORY.name[ws.up.lv]}へ建て替え中`, `Rebuilding into a ${D.FACTORY.name[ws.up.lv]}`)), m.el, el('span.ux-t-dim', t(`あと ${ws.up.left} 日・作り続けています`, `${ws.up.left}d left · still working`))));
      } else if (c.lv) {
        const lv = c.lv;
        const gain = t(`作業台 ${D.benchAfter(s, lv)} 台・物置 +${D.FACTORY.pool[lv]}・工期 ${c.days} 日（そのあいだも作り続けます）`, `${D.benchAfter(s, lv)} benches · storage +${D.FACTORY.pool[lv]} · ${c.days} days (keeps working)`);
        kids.push(el('p.uxs-fac-gain', gain));
        if (c.err) {
          kids.push(el('p.uxs-why', sIcon('warn', { scale: 1 }), el('span', D.upWhy(s, c.err, lv, c.cost, c.days))));
          if (c.err === 'money') {
            const m = uxMeter(gapRatio(s.money, c.cost));
            kids.push(el('div.uxs-inv-gap', m.el));
          }
        } else kids.push(el('p.ux-t-dim', here ? t('となりが空いているので、その場で広げられます', 'The lot next door is free: it can grow in place') : t('となりが空いていないので、光った場所へ移って建て替えます', 'No room next door: it moves to a glowing spot')));
        const label = el('span.uxs-fac-go-l', el('b', t(`${D.FACTORY.name[lv]}にする（${D.FACTORY.shape[lv]}）`, `Make it a ${D.FACTORY.name[lv]} (${D.FACTORY.shape[lv]})`)), el('span.ux-num', `${D.fmt(c.cost)} G`));
        const go = uxKey(
          label,
          safe(() => {
            if (D.upCheck(ctx.s()).err) return uxSfx('deny');
            ctx.rebuild?.();
          }),
          { kind: c.err ? '' : 'main', big: true, cls: 'uxs-fac-go', strong: true, disabled: !!c.err && c.err !== 'money' },
        );
        if (c.err === 'money') go.setAttribute('data-ux-quiet', '');
        kids.push(go);
      } else kids.push(el('p.ux-t-dim', D.upWhy(s, 'max', null, 0, 0)));
      // マインちゃんの助言（作業台が 3 台で製造が詰まっているとき）
      if (tip) kids.push(el('p.uxs-fac-tip', uxTape(t('マインちゃん', 'Mine-chan'), 'amber'), el('span', t('工房を町工場に建て替えると、作業台が 4 台になるよ', 'Rebuild into a town factory and you get 4 benches'))));
      box.replaceChildren(...kids.filter((x): x is HTMLElement => !!x));
    },
  };
}

// ---------------------------------------------------------------- 画面

/** 工房の画面を開く（p1/screens.ts の openWorkshop から。入のときだけ） */
export function openWorkshopUx(ctx: Ctx, o: WsOpt) {
  const s0 = ctx.s();
  /** 作るものを入れた作業台（スクロール先） */
  let made = -1;
  if (o.make) {
    const free = s0.slots.findIndex((sl) => !sl.sku);
    if (free >= 0) {
      made = free;
      D.chooseMake(ctx, s0, free, o.make);
    }
  }
  let view: ReturnType<typeof build> | null = null;
  // 段 FACTORY1a：見出しは段の名前（工房・町工場・大工場）
  const wsT = D.wsAny(s0);
  D.open(
    ctx,
    wsT ? D.bName(wsT) : t('工房', 'Workshop'),
    (body) => {
      view ??= build(ctx, body);
      view.sync();
    },
    () => view?.destroy(),
    true,
  );
  const v = view as ReturnType<typeof build> | null;
  if (!v) return;
  if (o.invest) v.show('invest', '.uxs-inv');
  if (o.make) {
    if (made >= 0) v.show('bench', `.uxs-bench[data-bench="${made}"] .uxs-ctl`);
    else if (s0.slots[0]) {
      // 空いている作業台が無い：1 台目の作るものの選択を、その商品を先頭にして開く
      const x = o.make;
      const onPick = (p: Sku | null) => {
        if (!p) return;
        D.chooseMake(ctx, s0, 0, p);
        v.show('bench', '.uxs-bench[data-bench="0"] .uxs-ctl');
      };
      const badge = { x, text: o.from ?? t('市場データで選んだ', 'Picked from market data') };
      const note = t('作業台は全部ふさがっています。作業台 1 の作るものを替えるなら、ここで選びましょう。', 'Every bench is busy. Choose here to switch what bench 1 makes.');
      if (!ctx.step?.()) D.pickMake(ctx, 0, { title: t('作業台 1 で作るもの', 'What bench 1 makes'), items: D.craftable(s0), badge, note, onPick });
      else D.pickExt(ctx.root, s0, { title: t('作業台 1 で作るもの', 'What bench 1 makes'), items: D.craftable(s0, true), current: s0.slots[0].sku, worker: s0.slots[0].worker, badge, note, onPick });
    }
  }
}

function build(ctx: Ctx, body: HTMLElement) {
  const s = () => ctx.s();
  const sheet = body.closest<HTMLElement>('.isl-sheet');
  sheet?.classList.add('uxs-ws', 'ux-root');
  body.classList.add('uxs-ws-body');
  let dead = false;
  const done = () => {
    ctx.save();
    ctx.refresh();
    sync();
  };

  // ---- 見出し：名前・添え札・稼働のランプ（✕ は今のキーのまま）
  const head = sheet?.querySelector<HTMLElement>('.isl-sheet-head');
  const h2 = head?.querySelector('h2');
  const tape = uxTape('');
  const runLamp = uxLamp('good', true, true);
  const runTxt = el('span');
  const run = el('span.ux-sheet-run.uxs-run', runLamp, runTxt);
  h2?.classList.add('ux-bleed');
  h2?.after(tape, run);

  // ---- 作業台のタブ
  const tipBox = el('div.uxs-tip');
  const benchBox = el('div.uxs-benches');
  const benches: BenchView[] = [];
  const shipped = new Odo({ digits: 3, value: 0 });
  const track = el('div.uxs-belt-track', el('i.uxs-belt-run'));
  const truck = el('span.uxs-belt-box', sIcon('truck', { color: '#f4ecd4' }));
  const belt = el('div.uxs-belt', uxTape(t('出荷', 'Ship')), track, truck, el('span.uxs-belt-n', shipped.el, t('個', 'pcs')));
  const poolMeter = uxMeter(0, 'cyan');
  const poolTxt = el('span.ux-num');
  const chips = el('div.uxs-chips');
  const store = el(
    'div.uxs-store',
    el('div.uxs-store-head', uxTape(t('物置', 'Stockroom'), 'dark'), poolMeter.el, poolTxt),
    el('div.uxs-store-k.ux-t-dim', t('工房の倉庫（運ぶ前の商品）', 'Workshop storage (goods to haul)')),
    chips,
    el('p.ux-t-dim', t('できた商品は、物流の担当がお店へ運びます。', 'Haulers carry finished goods to your shops.')),
  );
  // ---- 工房の絵（今の画面と同じ絵：工房の中・炉の火のゆらぎ・魔法の釜を持っていれば釜）。細い帯にして、作業台を上に見せる
  const scene = el('div.uxs-scene', { 'aria-hidden': 'true' });
  scene.style.backgroundImage = `url("${D.assetUrl('mch/Image/CraftBackgrounds/Base/100.webp')}")`;
  const amb = el<HTMLImageElement>('img.uxs-scene-amb', { alt: '', src: D.assetUrl('mch/Image/CraftBackgrounds/Base/200.gif') });
  const pot = el<HTMLImageElement>('img.uxs-scene-pot', { alt: '', hidden: true });
  scene.append(amb, pot);
  const paneBench = el('div.ux-pane.uxs-pane', scene, benchBox, belt, store);

  // ---- 見くらべのタブ
  const cmpGrid = el('div.uxs-cmp-grid');
  const paneCmp = el(
    'div.ux-pane.uxs-pane',
    { hidden: true },
    el('p.ux-t-dim', t('素材 → 商品のつながりと、今の素材で何ロット作れるか、1 日あたりの粗利。押すと作業台 1 で作ります。', 'Materials → product, lots your stock makes and gross profit per day. Tap to make it on bench 1.')),
    cmpGrid,
  );

  // ---- 設備投資のタブ（建て替え・設備）
  const fac = facView(ctx);
  const invBox = el('div.uxs-invs');
  const invs: InvestView[] = D.INVESTS.filter((x) => x.kind === 'workshop').map((x) => investView(ctx, x, () => D.wsAny(s()), done));
  invBox.append(...invs.map((v) => v.el));
  const paneInvest = el(
    'div.ux-pane.uxs-pane',
    { hidden: true },
    fac.el,
    invBox,
    el('p.ux-pane-note.ux-t-dim', t('作業台・荷車・トラック・物置など。建物ごと（セクタごと）の設備なので、新しいセクタでは入れ直します。', 'Workbenches, carts, truck, stockroom and more. Equipment belongs to each building, so new sectors start fresh.')),
  );

  // ---- タブ：表示板が横へ「カタカタ」と送られる（520ms・8 段）
  const TAB_LABEL: Record<WsTab, string> = { bench: t('作業台', 'Benches'), cmp: t('見くらべ', 'Compare'), invest: t('設備投資', 'Equipment') };
  const PANE: Record<WsTab, HTMLElement> = { bench: paneBench, cmp: paneCmp, invest: paneInvest };
  const ALL: WsTab[] = ['bench', 'cmp', 'invest'];
  let tabNow: WsTab = 'bench';
  let tabBusy = false;
  const tabKeys = ALL.map((key) => {
    const lamp = uxLamp('', key === tabNow);
    const b = uxKey(el('span.ux-tab-l', lamp, el('b', TAB_LABEL[key])), safe(() => setTab(key)), { cls: 'ux-tab uxs-tab', attrs: { role: 'tab', 'aria-selected': String(key === tabNow), 'aria-pressed': String(key === tabNow), 'data-tab': key, 'data-ux-quiet': '' } });
    return { key, b, lamp };
  });
  function setTab(key: WsTab, instant = false) {
    if (key === tabNow || tabBusy || dead) return;
    const from = PANE[tabNow];
    const to = PANE[key];
    const dir = ALL.indexOf(key) > ALL.indexOf(tabNow) ? 1 : -1;
    for (const x of tabKeys) {
      x.b.setAttribute('aria-selected', String(x.key === key));
      x.b.setAttribute('aria-pressed', String(x.key === key));
      x.lamp.classList.toggle('is-on', x.key === key);
    }
    tabNow = key;
    uxSfx('tab');
    to.hidden = false;
    sync();
    if (instant || isCalm() || typeof to.animate !== 'function') {
      from.hidden = true;
      return;
    }
    tabBusy = true;
    uxSfx('page', { step: 5 });
    const opt: KeyframeAnimationOptions = { duration: TAB_MS, easing: 'steps(8, end)', fill: 'both' };
    from.classList.add('is-leaving');
    from.animate([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${-dir * 104}%,0,0)` }], opt);
    to.animate([{ transform: `translate3d(${dir * 104}%,0,0)` }, { transform: 'translate3d(0,0,0)' }], opt).onfinish = () => {
      from.hidden = true;
      from.classList.remove('is-leaving');
      for (const a of from.getAnimations()) a.cancel();
      for (const a of to.getAnimations()) a.cancel();
      tabBusy = false;
    };
  }
  const tabs = el('div.ux-tabs.uxs-tabs', { role: 'tablist' }, tabKeys.map((x) => x.b));
  body.replaceChildren(tipBox, tabs, el('div.ux-tabbody.uxs-tabbody', paneBench, paneCmp, paneInvest));

  // ---- 止まらない画面：職人の槌（作業台のタブを見ているあいだだけ）・ベルトを流れる商品
  const offHop = loop.add((dt) => {
    if (tabNow !== 'bench' || !body.isConnected) return;
    for (const b of benches) b.hop(dt);
    flow(dt);
  });
  let flowT = 1400;
  let flowK = 0;
  /** 物置に商品があるあいだ、ベルトを 1 つずつ流れていく（見た目だけ。数は変えない） */
  function flow(dt: number) {
    if (isCalm() || typeof track.animate !== 'function') return;
    const stock = Object.entries(s().stock).filter(([, n]) => (n ?? 0) > 0) as [Sku, number][];
    if (!stock.length) return;
    flowT += dt;
    if (flowT < 2400) return;
    flowT = 0;
    const it = D.skuIcon(stock[flowK++ % stock.length][0], 32);
    it.classList.add('ux-ext', 'uxs-belt-item');
    track.append(it);
    const w = track.clientWidth + 40;
    it.animate([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${w}px,0,0)` }], { duration: 1900, easing: `steps(${Math.max(1, Math.round(w / 4))}, end)` }).onfinish = () => {
      it.remove();
      replay(truck, 'is-bump');
    };
  }

  let cmpSig = '';
  let stockSig = '';
  function sync() {
    if (dead) return;
    const st = s();
    const tut = !!ctx.step?.();
    // ---- 見出し
    const ws = D.wsAny(st);
    const [nm, sub] = wsTitle(ws);
    if (h2) setText(h2, nm);
    setText(tape, sub);
    tape.hidden = !sub;
    const anyRun = st.slots.some((sl) => sl.running && sl.sku);
    runLamp.className = `ux-lamp ${ws?.up ? 'is-on is-blink' : anyRun ? 'ux-lamp--good is-on is-blink' : 'is-on'}`;
    setText(runTxt, ws?.up ? t('工事中', 'Rebuilding') : anyRun ? t('稼働中', 'Running') : t('待機中', 'Idle'));
    run.classList.toggle('is-idle', !anyRun || !!ws?.up);
    // ---- チュートリアルの一言（画面の下）と、閉じたあとの「いまやること」
    tipBox.replaceChildren();
    D.mineTip(ctx, 'workshop', tipBox);
    // ---- タブ（チュートリアルのあいだは設備投資を出さない）
    const shown = wsTabs(tut);
    for (const x of tabKeys) x.b.hidden = !shown.includes(x.key);
    if (!shown.includes(tabNow)) setTab('bench', true);
    // ---- 作業台（段 FACTORY1a：建て替えで増えた作業台の「NEW」は一度だけ。この画面を開いたら消す）
    const fresh = new Set(st.flags.facNew ?? []);
    if (fresh.size) delete st.flags.facNew;
    while (benches.length < st.slots.length) {
      const b = benchView(ctx, done);
      benches.push(b);
      benchBox.append(b.el);
    }
    while (benches.length > st.slots.length) benches.pop()?.el.remove();
    benches.forEach((b, k) => {
      if (fresh.has(k)) b.el.classList.add('is-new');
      b.sync(k);
    });
    // ---- 魔法の釜（スキル）を持っていれば、絵に釜が出る（今の画面と同じ）
    if (D.has(st, 'pot') && pot.hidden) {
      pot.src = D.assetUrl('mch/Image/CraftBackgrounds/Stages/201.gif');
      pot.hidden = false;
    }
    // ---- 出荷のベルトと物置
    const entries = Object.entries(st.stock).filter(([, n]) => (n ?? 0) > 0) as [Sku, number][];
    const total = entries.reduce((a, [, n]) => a + n, 0);
    shipped.set(total, { dur: 300 });
    belt.classList.toggle('is-idle', !entries.length);
    const used = D.poolUsed(st);
    const cap = D.poolCap(st);
    poolMeter.set(used / Math.max(1, cap));
    poolMeter.el.classList.toggle('is-full', used >= cap);
    setText(poolTxt, `${D.fmt(used)}/${D.fmt(cap)}`);
    poolTxt.classList.toggle('ux-t-bad', used >= cap);
    const ssig = entries.map(([x, n]) => `${x}:${n}`).join(',');
    if (ssig !== stockSig || !chips.childElementCount) {
      stockSig = ssig;
      chips.replaceChildren(
        ...(entries.length
          ? entries.map(([x, n]) => {
              const ic = D.skuIcon(x, 32);
              ic.classList.add('ux-ext');
              return el('span.uxs-chip', ic, el('span', D.skuName(x)), num(`×${n}`));
            })
          : [el('span.ux-t-dim', t('まだありません', 'Nothing yet'))]),
      );
    }
    // ---- 見くらべ（作れるものを先に。技がまだのものはうしろ）：見ているときだけ組み直す
    if (tabNow === 'cmp') {
      const w0 = st.slots[0]?.worker ?? null;
      const list = [...D.craftable(st, tut)].sort((a, b) => Number(D.craftCheck(st, a, null) === 'tech') - Number(D.craftCheck(st, b, null) === 'tech') || D.profitPerDay(st, b) - D.profitPerDay(st, a));
      const okList = list.filter((x) => D.lotsFromStock(st, x) > 0 && !D.craftCheck(st, x, w0));
      const csig = `${list.join(',')}|${okList[0] ?? ''}|${w0}|${st.slots.map((sl) => sl.sku).join(',')}|${JSON.stringify(st.mats)}|${st.money}`;
      if (csig !== cmpSig) {
        cmpSig = csig;
        const y = paneCmp.scrollTop;
        cmpGrid.replaceChildren(...list.map((x) => D.extCard(st, x, { worker: w0, best: x === okList[0], on: st.slots.some((sl) => sl.sku === x), onTap: () => D.chooseMake(ctx, st, 0, x) })));
        paneCmp.scrollTop = y;
      }
    }
    // ---- 建て替えと設備投資
    fac.sync();
    invBox.hidden = !ws || tut;
    for (const v of invs) v.sync();
  }

  return {
    sync,
    /** そのタブを出して、中の要素までスクロールし、しばらく光らせる（マインちゃんの助言・市場データの「工房で作る」から） */
    show(tab: WsTab, sel: string) {
      setTab(tab, true);
      sync();
      const e = PANE[tab].querySelector<HTMLElement>(sel);
      if (!e) return;
      e.classList.add('is-flash');
      requestAnimationFrame(() => e.scrollIntoView({ block: 'center' }));
      setTimeout(() => e.classList.remove('is-flash'), 2400);
    },
    destroy() {
      dead = true;
      offHop();
    },
  };
}
