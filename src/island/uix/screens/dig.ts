/**
 * 段 UIX3w：発掘の画面（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：発掘」）。
 * 壁・なぞって掘る仕組み・出土の決まり・時間は今のまま（p1/digui.ts）。その画面（.isl-dig）に、管制卓の帯と計器・手応えを足す：
 * - 上の帯：荒れ地の名前・残り時間の計器（残り 5 秒で赤くまたたく）・計器 4 つ（研究ポイント＝桁が回る・出土・掘った割合・お題のランプ）。
 * - 掘る手応え：はがれるたびに層の色の火花、出土で壁が揺れて「+N RP」が飛ぶ・計器が光る。大きな出土は白い光と振動。
 * - 発掘終了：出土の報告（数字が順に数え上がる → 出土品の札が 1 枚ずつ打たれる → 持ち帰りを決めるキー）。
 * 今の要素（日付・売上・爆弾・道具・層の並び・ひとこと・石板の窓）は、絵文字をドットの絵に替えて CSS で着せ替える。
 */
import { t } from '../../../i18n';
import { el, type Kid } from '../dom';
import { sparks } from '../fx';
import { later } from '../loop';
import { Odo, shake, uxKey, uxLamp, uxMeter, uxPlus, uxTape, vibrate } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { bare } from './conquer';
import { swapEmoji } from './land';
import { safe } from './s-press';
import { wIcon } from './w-icons';
import './dig.css';
import type { DigStatus } from '../../p1/digview';
import type { DigHit } from '../../p1/model';
import type { DigEndView, DigUx } from './w-slots';

/** 選択肢を出すまで（今の札と同じ 1.2 秒）・何も出なかったとき町へ戻るまで（今と同じ 6 秒） */
export const END_KEYS_MS = 1200;
export const END_AUTO_MS = 6000;
/** 出土品の札を 1 枚ずつ打つ間隔（今の札と同じ 70ms・12 枚めからは同時） */
export const FIND_STEP_MS = 70;
/** 1 回の打ちで出す火花の束の上限（発破で何十マスもはがれても、粒を出しすぎない） */
export const SPARK_BURSTS = 4;

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）

/** 今回の出土の数字：「+9」→ { n: 9, plus: true }。数字でなければ null（字のまま出す） */
export function statNum(v: string): { n: number; plus: boolean } | null {
  const m = /^(\+?)(\d+)$/.exec(v.trim());
  return m ? { n: Number(m[2]), plus: m[1] === '+' } : null;
}
/** 火花を出すマス：はがれたマスから、出土のあるものを先に、多くて max 個 */
export function sparkPicks<T extends { broke: boolean; item: unknown }>(hits: T[], max = SPARK_BURSTS): T[] {
  const broke = hits.filter((h) => h.broke);
  return [...broke.filter((h) => h.item), ...broke.filter((h) => !h.item)].slice(0, max);
}
/** 出土品の札を打つ時刻（ms）：k 枚め */
export const findAt = (k: number, base = 0) => base + Math.min(12, k) * FIND_STEP_MS;
/** お題のランプ：n 個のうち got 個が点く */
export const topicLamps = (got: number, all: number) => Array.from({ length: Math.max(0, all) }, (_, k) => k < got);

// ---------------------------------------------------------------- 画面に足す帯と計器

interface View {
  name: HTMLElement;
  bar: HTMLElement;
  sec: HTMLElement;
  timer: HTMLElement;
  rp: Odo;
  rpNow: HTMLElement;
  found: HTMLElement;
  lvUp: HTMLElement;
  dugK: HTMLElement;
  dugV: HTMLElement;
  dugM: ReturnType<typeof uxMeter>;
  topK: HTMLElement;
  topV: HTMLElement;
  cells: Record<string, HTMLElement>;
  last: { rp: number; found: number; lvUp: number; top: number } | null;
  obs: MutationObserver | null;
  offs: (() => void)[];
  tick: number;
}
const views = new WeakMap<HTMLElement, View>();
const ico = (name: string, color = '#f4ecd4', scale = 1) => wIcon(name, { color, hi: color, scale });
const cell = (cls: string, label: Kid, ...kids: Kid[]) => el(`div.uxw-dg-cell.${cls}`, el('span.uxw-dg-k', label), kids);
/** 光らせる（計器が変わったとき。320ms） */
function flash(e: HTMLElement) {
  if (isCalm()) return;
  e.classList.remove('is-flash');
  void e.offsetWidth;
  e.classList.add('is-flash');
}
/** 今の要素の絵文字を、ドットの絵に（何度呼んでもよい） */
function deco(root: Element | null, color = '#f4ecd4') {
  if (root instanceof HTMLElement) swapEmoji(root, color);
}

function open(root: HTMLElement) {
  root.classList.add('uxw-dig', 'ux-root');
  const head = root.querySelector('.isl-dig-head');
  const top = root.querySelector('.isl-dig-top');
  if (!head || !top) return;
  // 見出し：つるはしの絵と荒れ地の名前（今の見出しは読み上げ用に残す）
  const name = el('b');
  head.prepend(el('div.uxw-dg-title', { 'aria-hidden': 'true' }, wIcon('pick', { color: '#ffb81f', scale: 2 }), name));
  // 残り時間の計器
  const bar = el('i');
  const sec = el('b.ux-num', '0.0');
  const timer = el('div.uxw-dg-timer', { 'aria-hidden': 'true' }, uxLamp('good', true), el('span', ico('clock', '#97a1cf'), t('残り', 'Left')), el('div.uxw-dg-bar', bar), el('span.uxw-dg-sec', sec, el('small', t('秒', 's'))));
  // 計器 4 つ
  const rp = new Odo({ digits: 5, size: 's', cls: 'ux-odo--amber' });
  const rpNow = el('small.uxw-dg-now', '+0');
  const found = el('b.ux-num', '0');
  const lvUp = el('b.ux-num', '0');
  const dugK = el('span', t('掘った', 'Dug'));
  const dugV = el('b.ux-num', '0%');
  const dugM = uxMeter(0, 'cyan');
  const topK = el('span', t('お題', 'Targets'));
  const topV = el('div.uxw-dg-lamps');
  const cells = {
    rp: cell('is-rp', [ico('flask', '#5fe4ff'), t('研究', 'RP')], el('div.uxw-dg-v', rp.el, rpNow)),
    got: cell('is-got', [ico('star', '#ffb81f'), t('出土', 'Finds')], el('div.uxw-dg-v2', el('span', t('新', 'New')), found, el('span', 'Lv', ico('up', '#36e08b')), lvUp)),
    dug: cell('is-dug', [ico('layers', '#97a1cf'), dugK], el('div.uxw-dg-v', dugV), dugM.el),
    top: cell('is-top', [ico('flag', '#ffb81f'), topK], topV),
  };
  head.after(timer, el('div.uxw-dg-gauges', { 'aria-hidden': 'true' }, cells.rp, cells.got, cells.dug, cells.top));
  // つるはし（打っているマスの上）は、ドットの絵に
  root.querySelector('.isl-dig-pick')?.replaceChildren(wIcon('pick', { color: '#f4ecd4', scale: 3 }));
  // あとから足される要素（出土のお知らせ・爆発・マインちゃんのひと言・石板の窓）も、絵文字をドットの絵に
  let obs: MutationObserver | null = null;
  if (typeof MutationObserver === 'function') {
    obs = new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) if (n instanceof HTMLElement && /isl-dig-(ping|bombtag|float|mine|read)/.test(n.className)) deco(n, n.classList.contains('isl-dig-read') || n.classList.contains('isl-dig-mine') ? '#1a1c2e' : '#ffb81f');
    });
    obs.observe(root, { childList: true });
  }
  views.set(root, { name, bar, sec, timer, rp, rpNow, found, lvUp, dugK, dugV, dugM, topK, topV, cells, last: null, obs, offs: [], tick: 99 });
}

function sync(root: HTMLElement, st: DigStatus, o: { run: boolean; over: boolean }) {
  const v = views.get(root);
  if (!v) return;
  root.classList.toggle('is-over', o.over);
  if (v.name.textContent !== st.name) v.name.textContent = st.name;
  // 研究ポイント：桁が回る。増えたら「+N」が飛び、計器が光る
  const first = !v.last;
  if (first) v.rp.set(st.rp, { dur: 0 });
  else if (st.rp !== v.last!.rp) {
    v.rp.set(st.rp, { dur: 500, onTick: () => uxSfx('tick') });
    flash(v.cells.rp);
  }
  v.rpNow.textContent = o.run ? t(`今回 +${st.rpNow}`, `+${st.rpNow} now`) : '';
  v.found.textContent = String(st.found);
  v.lvUp.textContent = String(st.lvUp);
  if (!first && (st.found !== v.last!.found || st.lvUp !== v.last!.lvUp)) flash(v.cells.got);
  // 掘った割合（ダンジョンは、いちばん深い層と記録）
  const dg = st.dungeon;
  if (dg) {
    v.dugK.textContent = t('最深', 'Deepest');
    v.dugV.textContent = t(`${dg.deep}層`, `L${dg.deep}`);
    v.dugM.set(dg.all > 0 ? dg.deep / dg.all : 0);
    v.cells.dug.title = t(`この作業でいちばん深くはがした層 ${dg.deep}（記録 ${dg.best}）`, `Deepest this run: ${dg.deep} (best ${dg.best})`);
    v.topK.textContent = t('掘れる', 'Can dig');
    v.topV.replaceChildren(el('b.ux-num', `${dg.limit}/${dg.all}`), el('small', t(`記録 ${dg.best}`, `best ${dg.best}`)));
  } else {
    v.dugK.textContent = t('掘った', 'Dug');
    v.dugV.textContent = `${st.pct}%`;
    v.dugM.set(st.pct / 100);
    v.cells.dug.title = o.run ? t(`今回 ${st.cellsNow} マス`, `${st.cellsNow} cells now`) : '';
    v.topK.textContent = t('お題', 'Targets');
    v.topV.replaceChildren(...topicLamps(st.topics[0], st.topics[1]).map((on) => uxLamp('', on)), el('b.ux-num', `${st.topics[0]}/${st.topics[1]}`));
    v.cells.top.classList.toggle('is-done', st.topics[0] >= st.topics[1]);
    if (!first && st.topics[0] > v.last!.top) {
      flash(v.cells.top);
      uxSfx('lamp', { step: st.topics[0] });
    }
  }
  v.last = { rp: st.rp, found: st.found, lvUp: st.lvUp, top: st.topics[0] };
  // 今の要素の絵文字（日付・爆弾・道具・層の錠・発掘隊のつるはし・マスの錠）
  for (const k of ['.isl-dig-info', '.isl-dig-spec', '.isl-dig-tools', '.isl-dig-legend', '.isl-dig-crew']) deco(root.querySelector(k));
  for (const k of root.querySelectorAll('.isl-dig-lock')) deco(k);
}

function timer(root: HTMLElement, rb: { sec: string; frac: number; warn: boolean; tick: boolean } | null) {
  const v = views.get(root);
  if (!v) return;
  const frac = rb ? Math.max(0, Math.min(1, rb.frac)) : 0;
  v.bar.style.transform = `scaleX(${frac.toFixed(3)})`;
  const txt = rb ? rb.sec : '0.0';
  if (v.sec.textContent !== txt) v.sec.textContent = txt;
  v.timer.classList.toggle('is-warn', !!rb?.warn);
  v.timer.classList.toggle('is-off', !rb);
}

function hits(root: HTMLElement, list: DigHit[], cellAt: (x: number, y: number) => HTMLElement | null, big: string | null) {
  const v = views.get(root);
  if (!v || isCalm()) return;
  // はがれたマスから、層の色の火花
  for (const h of sparkPicks(list)) {
    const c = cellAt(h.x, h.y);
    const r = c?.getBoundingClientRect();
    if (!r?.width) continue;
    const lc = c!.style.getPropertyValue('--lc').trim() || '#b3a47a';
    sparks({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, h.item ? 14 : 7, h.item ? ['#ffb81f', '#fffdf3', lc] : [lc, '#fffdf3', '#0b0d17']);
  }
  // 研究ポイントが入った：「+N RP」が計器へ向かって飛ぶ
  const rp = list.reduce((a, h) => a + (h.rp || 0), 0);
  const src = list.find((h) => h.rp > 0);
  const sc = src ? cellAt(src.x, src.y) : null;
  if (rp > 0 && sc) uxPlus(sc, rp, `+${rp} RP`);
  // 出土：壁が揺れる。大きな出土（お題・大きな遺物）は白い光と長い振動
  if (list.some((h) => h.item && h.item.kind !== 'mat')) {
    shake(root.querySelector('.isl-dig-wall'));
    vibrate(big === 'topic' || big === 'epic' ? 30 : 12);
  }
  if (big === 'topic' || big === 'epic' || big === 'rare') {
    const box = root.querySelector<HTMLElement>('.isl-dig-wallbox');
    if (box) flash(box);
  }
}

// ---------------------------------------------------------------- 発掘終了：出土の報告

function end(root: HTMLElement, e: DigEndView) {
  const v = views.get(root);
  root.querySelector('.uxw-dg-end')?.remove();
  const calm = isCalm();
  const offs = v?.offs ?? [];
  // ---- 今回の出土の数字（順に数え上がる）
  const odos: (() => void)[] = [];
  const stats = el(
    'div.uxw-dg-stats',
    e.lines.map(([k, val], n) => {
      const num = statNum(val);
      let body: Kid = el('b.ux-num', val);
      if (num) {
        const o = new Odo({ digits: String(num.n).length, size: 's', cls: n === 2 ? 'ux-odo--amber' : '' });
        odos.push(() => o.set(num.n, { dur: 500, onTick: () => uxSfx(n === 2 ? 'coin' : 'tick') }));
        body = el('span.uxw-dg-statv', num.plus ? el('b.ux-num', '+') : null, o.el);
      } else odos.push(() => undefined);
      return el('div.uxw-dg-stat', el('span', k), body);
    }),
  );
  // ---- 見つけたもの（見つけた順に、1 枚ずつ打たれる）
  const cards = e.finds.map((f) => {
    f.icon.classList.add('uxw-dg-findic');
    const c = el<HTMLElement>(`${f.read ? 'button' : 'div'}.uxw-dg-find.is-${f.kind}.is-r${f.rank}${f.big ? '.is-big' : ''}${f.first ? '.is-first' : ''}`, f.read ? { type: 'button', title: t('押すと読む', 'Tap to read') } : {}, f.big ? el('i.uxw-dg-rays') : null, f.icon, el('b.uxw-dg-tag', f.tag), el('span.uxw-dg-fname', f.name));
    if (f.rp) c.append(el('small.uxw-dg-frp.ux-num', `+${f.rp} RP`));
    if (f.recipe) c.append(el('small.uxw-dg-frecipe', ico('mail', '#1a1c2e'), t('新レシピ', 'New recipe')));
    if (f.note) c.append(el('small.uxw-dg-fnote', f.note));
    if (f.read)
      c.addEventListener('click', (ev) => {
        ev.stopPropagation();
        f.read!();
      });
    return c;
  });
  const body: Kid[] = [stats];
  if (e.deep) body.push(el(`p.uxw-dg-deep${e.deep.record ? '.is-new' : ''}`, ico('layers', '#5fe4ff'), el('b', t(`最深 ${e.deep.deep} 層`, `Deepest: layer ${e.deep.deep}`)), e.deep.record ? uxTape(t('新記録！', 'New record!'), 'amber') : null));
  if (e.note) body.push(el('p.uxw-dg-note', ico('star', '#ffb81f'), el('span', e.note)));
  if (cards.length) body.push(el('div.uxw-dg-finds', el('div.uxw-dg-fhead', el('b', t(`見つけたもの ${cards.length}`, `Finds ${cards.length}`)), e.bombs ? el('span', ico('bomb', '#97a1cf'), t(`爆弾 ${e.bombs}`, `bombs ${e.bombs}`)) : null), el('div.uxw-dg-flist', cards)));
  else if (e.bombs) body.push(el('p.uxw-dg-note.is-dim', ico('bomb', '#97a1cf'), el('span', t(`爆弾 ${e.bombs} 個を掘り出した`, `Set off ${e.bombs} bomb(s)`))));
  else body.push(el('p.uxw-dg-note.is-dim', ico('pick', '#97a1cf'), el('span', t('今回は、何も出ませんでした。奥の層ほど、いいものが眠っています。', 'Nothing this time. The deeper layers hide better finds.'))));
  // ---- 新しいレシピ（復刻品）
  if (e.recipes.length)
    body.push(
      el(
        'div.uxw-dg-recipes',
        el('b.uxw-dg-rhead', ico('mail', '#ffb81f'), t(`新しいレシピ！（${e.recipes.length}）`, `New recipes! (${e.recipes.length})`)),
        e.recipes.map((r) => {
          r.icon.classList.add('uxw-dg-findic');
          return el('div.uxw-dg-recipe', r.icon, el('div.uxw-dg-rtxt', el('b', r.name), el('span', r.note), r.series ? el(`small.${r.series.good ? 'is-good' : 'is-bad'}`, bare(r.series.text)) : null), uxKey(t('工房で作る', 'Make it'), safe(r.make), { ico: 'hammer' }));
        }),
      ),
    );
  // ---- 次の強化のおすすめ
  if (e.rec) body.push(uxKey(el('span.uxw-dg-rec', el('small', t('次の強化のおすすめ（スキル → 発掘）', 'Next upgrade (Skills → Digging)')), el('b', e.rec.text)), safe(e.rec.go), { kind: 'weak', ico: 'next', cls: 'uxw-dg-reckey' }));
  // ---- 持ち帰りを決めるキー（1.2 秒後に出る。主役は前の層）
  const keys = el('div.uxw-dg-keys');
  const card = el(
    'section.uxw-dg-end',
    { role: 'dialog', 'aria-label': t('発掘終了', 'Dig over') },
    el('div.uxw-dg-endwrap', el('div.uxw-dg-endcard.ux-plate', el('div.ux-screws'), el('div.uxw-dg-endhead', wIcon('pick', { color: '#ffb81f', scale: 3 }), el('h2', t('発掘終了', 'Dig over')), uxTape(t('今回の出土', 'This dig'), 'amber')), el('div.uxw-dg-endbody', body), keys)),
  );
  card.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  root.append(card);
  uxSfx('page', { step: 4 });
  // 数字が順に数え上がる → 出土品の札が打たれる
  const base = calm ? 0 : 200 + e.lines.length * 110;
  odos.forEach((run, n) => offs.push(later(calm ? 0 : 200 + n * 110, run)));
  cards.forEach((c, k) => {
    if (calm) return c.classList.add('is-on');
    offs.push(
      later(findAt(k, base), () => {
        c.classList.add('is-on');
        uxSfx(c.classList.contains('is-big') ? 'stamp' : 'lamp', { step: k });
        if (c.classList.contains('is-big')) {
          const r = c.getBoundingClientRect();
          sparks({ x: r.left + r.width / 2, y: r.top + r.height / 3 }, 18);
        }
      }),
    );
  });
  offs.push(
    later(END_KEYS_MS, () => {
      const main = e.acts.findIndex((a) => a[2]?.includes('is-on'));
      keys.append(...e.acts.map(([label, fn], k) => uxKey(bare(label), safe(fn), k === main ? { kind: 'main', big: true, strong: true, ico: /月次|Monthly/.test(label) ? 'next' : 'play' } : {})));
      keys.classList.add('is-on');
      e.shown();
      if (e.auto) offs.push(later(END_AUTO_MS, e.auto));
    }),
  );
}

function close(root: HTMLElement) {
  const v = views.get(root);
  if (!v) return;
  v.obs?.disconnect();
  v.offs.forEach((f) => f());
  v.offs.length = 0;
}

export const digUx: DigUx = { open, sync, timer, hits, end, close };
