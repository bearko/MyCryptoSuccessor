/**
 * 段 UIX3w：町の制覇・研究成果の発表・調査依頼状（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：町の制覇」）。
 * 見本（public/uixlab/c/js/conquer.js）の場面を、本体の本物の中身へ移した：
 * 判定のランプが追いかけっこをして小太鼓が鳴る → 曲の小節の頭でカットイン（2.6 秒・押せば飛ばせる）→ 札（依頼状・研究ポイント・ひと言・次の行き先）。
 * 大見出しは人物の後ろを通り、テロップの帯は人物の手前を通る。BGM は祝いの曲に替わって戻る（鳴らすのは p1/main.ts の uxSfx('conquest')）。
 * 制覇でない発表（調査依頼状・研究ポイントだけ）は、カットインなしで札が打たれる。
 * 窓は今の目印（.isl-modal.is-letter）を付けて #isl-ui に入れる：開いているあいだ時間が止まる・ほかの案内が重ならない、は今のまま。
 * お祝いの窓（フェーズ 1 クリア・ランド制覇）も、同じ札で出す。
 */
import { isEn, t } from '../../../i18n';
import { el, type Kid } from '../dom';
import { confetti, sparks } from '../fx';
import { uxIcon } from '../icons';
import { later, loop } from '../loop';
import { Odo, shake, typeText, uxKey, uxLamp, uxTape, vibrate } from '../parts';
import { isCalm } from '../prefs';
import { uxMusic, uxSfx } from '../sound';
import { safe } from './s-press';
import { W } from './w-deps';
import './conquer.css';
import type { CheerView, LetterView, UxwAct } from './w-slots';

/** カットインの長さ（見本：2.6 秒。動きを減らすときは 1.8 秒） */
export const CUT_MS = 2600;
export const CUT_CALM_MS = 1800;
/** カットインが引く長さ（見本：220ms） */
export const CUT_OUT_MS = 220;
/** 曲が鳴っていないときの、連打の長さ（音の側と同じ 0.9 秒） */
export const ROLL_MS = 900;
/** 曲の速さ（どの曲も 116）と、音の予約の先読み（0.5 秒：これより近い小節の頭には、もう間に合わない） */
const BPM = 116;
const AHEAD = 0.5;

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）

/**
 * カットインを出すまでの待ち（ms）：祝いの曲は「次の小節の頭」から鳴るので、そこに合わせる。
 * m：いまの拍の位置（小節の中の拍 0〜3・拍の中の位置 0〜1）。曲が鳴っていなければ、連打の長さ
 */
export function barWait(m: { beat: number; frac: number } | null): number {
  if (!m) return ROLL_MS;
  const beat = 60 / BPM;
  let rem = (4 - m.beat - m.frac) * beat;
  if (rem < AHEAD) rem += 4 * beat;
  return Math.round(rem * 1000);
}
/** [[ ]] の強調を外した文（1 字ずつ出すとき） */
export const plainSay = (text: string) => text.replace(/\[\[(.+?)\]\]/g, '$1');
/** [[ ]] で分けた文：[字, 強調か] の並び */
export function sayParts(text: string): [string, boolean][] {
  const out: [string, boolean][] = [];
  text.split(/\[\[(.+?)\]\]/).forEach((part, k) => {
    if (part) out.push([part, k % 2 === 1]);
  });
  return out;
}
/** 絵文字を外す（今の題・選択肢には絵文字の印が付いている）。✔ は「済」に */
export function bare(text: string): string {
  return text
    .replace(/\s*✔/g, t(' 済', ' done'))
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/^\s+/, '')
    .replace(/[ \t]{2,}/g, ' ');
}
/** 依頼状の名前を、ランクの名前とそのあとに分ける（せまい画面で、言葉の途中で折り返さない） */
export function nameParts(name: string): string[] {
  const k = name.indexOf(' ');
  return k > 0 ? [name.slice(0, k), name.slice(k + 1)] : [name];
}
/** 場面の種類：制覇（カットインあり）／調査依頼状／発表（研究ポイントだけ） */
export type LetterKind = 'conquest' | 'letter' | 'present';
export const letterKind = (v: { conquered: boolean; letter: unknown }): LetterKind => (v.conquered ? 'conquest' : v.letter ? 'letter' : 'present');
/** 研究ポイントの桁（頭の 0 を出さない） */
export const rpDigits = (rp: number) => Math.max(2, String(Math.max(0, Math.round(rp))).length);
/**
 * 場面の進み（DOM なし）：'pre'（判定のランプ・連打）→ 'cut'（カットイン）→ 'card'（札）。押すと次の段へ飛ぶ。
 * 制覇でなければ、はじめから札。どの段でも、札へ進むのは 1 回だけ
 */
export function cutCore(kind: LetterKind, ev: { pre: () => void; cut: () => void; card: () => void }) {
  let at: 'none' | 'pre' | 'cut' | 'card' = 'none';
  const go = (to: 'pre' | 'cut' | 'card') => {
    if (at === 'card' || at === to) return;
    at = to;
    ev[to]();
  };
  return {
    get at() {
      return at;
    },
    start: () => go(kind === 'conquest' ? 'pre' : 'card'),
    /** 小節の頭が来た */
    bar: () => at === 'pre' && go('cut'),
    /** カットインが終わった */
    end: () => at === 'cut' && go('card'),
    /** 押した：いまの段を飛ばす（判定の途中でも、カットインの途中でも、札へ） */
    skip: () => (at === 'pre' || at === 'cut') && go('card'),
  };
}

// ---------------------------------------------------------------- 部品

/** マインちゃんのひと言：1 字ずつ出し、出しきったら強調（[[ ]]）を色で付ける */
function sayBox(text: string): { el: HTMLElement; start: () => void } {
  const p = el('p.uxw-end-say');
  const rich = () => p.replaceChildren(...sayParts(text).map(([s, em]) => (em ? el('b.uxw-em', s) : s)));
  return {
    el: p,
    start: () => {
      const ty = typeText(p, plainSay(text), { voice: 0, onDone: rich });
      p.addEventListener('pointerdown', () => ty.skip());
    },
  };
}
/** 選択肢のキー：主役（is-on）は琥珀の大きいキー（前の層に出る）。押すと、窓を閉じてから動く */
function actKeys(actions: UxwAct[], close: () => void): HTMLElement {
  const main = actions.findIndex((a) => a[2]?.includes('is-on'));
  return el(
    'div.uxw-end-keys',
    actions.map(([label, fn], k) =>
      uxKey(
        bare(label),
        safe(() => {
          close();
          fn();
        }),
        k === main ? { kind: 'main', big: true, strong: true } : {},
      ),
    ),
  );
}
/** ランプの列（n 個。祝いは緑・琥珀・水色がまたたく） */
const lampRow = (n: number, party: boolean) => el(`div.uxw-end-lamps${party ? '.is-party' : ''}`, Array.from({ length: n }, (_, i) => uxLamp(i % 3 === 0 ? 'good' : i % 3 === 1 ? '' : 'cyan')));
/** ランプの追いかけっこ（判定のあいだ。90ms に 1 つ進む・3 つおきに点く）。返した関数で止める */
function chase(row: HTMLElement): () => void {
  const lamps = [...row.children];
  if (isCalm()) {
    lamps.forEach((l) => l.classList.add('is-on'));
    return () => undefined;
  }
  let k = 0;
  let acc = 90;
  return loop.add((dt) => {
    acc += dt;
    if (acc < 90) return;
    acc %= 90;
    lamps.forEach((l, i) => l.classList.toggle('is-on', (i + lamps.length - (k % 3)) % 3 === 0));
    k++;
  });
}
/** ランプを順に点ける（90ms ずつ。音は段ごとに上がる） */
function lightUp(row: HTMLElement, then?: () => void) {
  const lamps = [...row.children];
  if (isCalm()) {
    lamps.forEach((l) => l.classList.add('is-on'));
    then?.();
    return;
  }
  lamps.forEach((l, i) =>
    later(110 + i * 90, () => {
      l.classList.add('is-on');
      uxSfx('lamp', { step: i });
    }),
  );
  later(110 + lamps.length * 90, () => then?.());
}
/** マインちゃんの顔（今の窓と同じ絵） */
function mineFace(): HTMLElement {
  const im = el<HTMLImageElement>('img.uxw-end-face', { alt: '', draggable: 'false' });
  im.src = W.assetUrl('mch/Image/Characters/navi_ain_cross_01_smile.png');
  return im;
}
/** 札の器：機械の板・四隅のねじ・見出し（絵と題）・マインちゃんの顔が枠の上に出る */
function endCard(o: { kind: string; label: string; ico: string; title: string; body: Kid[] }): HTMLElement {
  return el(
    `section.uxw-end.uxw-end--${o.kind}`,
    { role: 'dialog', 'aria-label': o.label },
    el('div.uxw-end-wrap.ux-float', mineFace(), el('div.uxw-end-card.ux-plate', el('div.ux-screws'), el('div.uxw-end-head', uxIcon(o.ico, { color: '#ffb81f', scale: 3 }), el('h2', o.title)), o.body)),
  );
}
/** 窓の外枠：今の目印（.isl-modal）を付ける（開いているあいだ時間が止まる）。押した先を地図へ渡さない */
function shell(cls: string): HTMLElement {
  const m = el(`div.isl-modal.ux-root.uxw-cq${cls}`);
  m.addEventListener('pointerdown', (e) => e.stopPropagation());
  m.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  return m;
}

// ---------------------------------------------------------------- 研究成果の発表・調査依頼状・制覇

export function openLetterUx(v: LetterView) {
  const kind = letterKind(v);
  const m = shell('.is-letter');
  m.dataset.kind = kind;
  let closed = false;
  const offs: (() => void)[] = [];
  const close = () => {
    if (closed) return;
    closed = true;
    offs.forEach((f) => f());
    m.remove();
    uxSfx('close');
  };

  // ---- 判定（小節の頭を待つあいだ）：ランプが追いかけっこをする
  const preLamps = el('div.uxw-pre-lamps', Array.from({ length: 9 }, () => uxLamp()));
  const pre = el(
    'section.uxw-pre',
    { role: 'status' },
    el('div.uxw-pre-plate.ux-plate', el('div.ux-screws'), uxTape(t('研究成果の発表', 'Findings presented'), 'amber'), el('b.uxw-pre-town', v.town), preLamps, el('span.uxw-pre-k.ux-t-dim', t('町の長が、判定しています', 'The town head is deciding'))),
  );

  // ---- カットイン
  const big = el('div.uxw-cut-big', { 'aria-hidden': 'true' }, el('span', t('制', 'TOWN')), el('span', t('覇', 'WON!')));
  if (isEn) big.classList.add('is-en');
  const hero = v.hero?.(320) ?? null;
  hero?.classList.add('ux-hero');
  const cut = el(
    'section.uxw-cut',
    { role: 'dialog', 'aria-label': t('制覇', 'Conquered') },
    el('div.uxw-cut-strip', el('div.uxw-cut-rays'), big),
    el('div.uxw-cut-band'),
    hero ? el('div.uxw-cut-hero', hero) : null,
    el('div.uxw-cut-telop', el('div.uxw-cut-telop-in', uxIcon('crown', { scale: 3 }), el('b', t(`${v.town}を制覇！`, `${v.town} conquered!`)))),
    el('div.uxw-cut-sub', uxTape(t('1 位を守りきった', 'You held #1'), 'amber')),
    el('div.uxw-cut-skip', t('押すと、とばせます', 'Tap to skip')),
  );

  // ---- 札
  const rp = new Odo({ digits: rpDigits(v.rp), size: 'l', cls: 'ux-odo--amber' });
  const say = sayBox(v.say);
  const lamps = lampRow(9, kind === 'conquest');
  const stamp = el('span.uxw-end-stamp', uxIcon('check', { color: '#1a1c2e' }), el('b', kind === 'conquest' ? t('制覇', 'Conquered') : kind === 'letter' ? t('受領', 'Received') : t('発表済', 'Presented')));
  const body: Kid[] = [lamps];
  if (kind === 'conquest') body.push(el('div.uxw-end-town', uxTape(v.town, 'amber'), stamp), el('ul.uxw-end-conds', v.conds.map((c) => el('li', uxIcon('check', { color: '#36e08b' }), el('span', bare(c).replace(/\s*(済|done)$/, '')), el('b.ux-t-good', t('済', 'Done'))))));
  if (v.letter && v.letterIcon) {
    v.letterIcon.classList.add('uxw-end-ext');
    body.push(el('div.uxw-end-letter', el('i.uxw-end-rays'), v.letterIcon, el('div.uxw-end-lname', el('b', nameParts(v.letterName).map((x) => el('span', x))), v.from ? el('span', v.from) : null), kind === 'letter' ? stamp : null));
  }
  if (kind === 'present') body.push(el('div.uxw-end-town', uxTape(v.town, ''), stamp));
  body.push(el('div.uxw-end-rp', uxTape(t('研究ポイント', 'Research points'), 'dark'), el('span.uxw-end-rpn', el('b.ux-num', '+'), rp.el, el('b.ux-num.uxw-end-unit', 'RP'))));
  body.push(el('div.uxw-end-bubble', uxTape(t('マインちゃん', 'Mine'), ''), say.el));
  body.push(actKeys(v.actions, close));
  const title = kind === 'conquest' ? t('制覇！', 'Conquered!') : kind === 'letter' ? t('調査依頼状', 'Survey request') : t('発表完了', 'Presented');
  const card = endCard({ kind, label: bare(v.title), ico: kind === 'conquest' ? 'crown' : kind === 'letter' ? 'mail' : 'flask', title, body });

  const core = cutCore(kind, {
    pre: () => {
      m.append(pre);
      offs.push(chase(preLamps));
      offs.push(later(barWait(uxMusic()), () => core.bar()));
    },
    cut: () => {
      pre.remove();
      m.append(cut);
      vibrate(30);
      if (!isCalm()) {
        const r = big.getBoundingClientRect();
        offs.push(later(380, () => sparks({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 22)));
      }
      offs.push(later(isCalm() ? CUT_CALM_MS : CUT_MS, () => core.end()));
    },
    card: () => {
      pre.remove();
      const show = () => {
        cut.remove();
        if (closed) return;
        m.classList.add('is-card');
        m.append(card);
        card.classList.add('is-in');
        uxSfx(kind === 'conquest' ? 'open' : 'clunk');
        if (kind === 'conquest') confetti(4);
        else shake(card.querySelector('.uxw-end-card'));
        v.fx();
        // 札が打たれる → ランプが順に点く → 研究ポイントが回る → ひと言
        const count = () => rp.set(v.rp, { dur: 900, onTick: () => uxSfx('coin') });
        if (kind === 'conquest') {
          lamps.querySelectorAll('.ux-lamp').forEach((l) => l.classList.add('is-on'));
          offs.push(later(260, count));
        } else lightUp(lamps, count);
        offs.push(later(isCalm() ? 0 : 320, () => stamp.classList.add('is-on')));
        offs.push(later(isCalm() ? 0 : 420, () => say.start()));
      };
      if (cut.isConnected && !isCalm()) {
        cut.classList.add('is-out');
        offs.push(later(CUT_OUT_MS, show));
      } else show();
    },
  });
  // 押すと飛ばせる（判定の途中・カットインの途中）
  m.addEventListener('pointerdown', () => {
    if (core.at === 'pre' || core.at === 'cut') {
      uxSfx('flap');
      core.skip();
    }
  });
  v.host.append(m);
  core.start();
}

// ---------------------------------------------------------------- お祝いの窓（フェーズ 1 クリア・ランド制覇）

export function openCheerUx(v: CheerView) {
  const m = shell('.is-card');
  m.dataset.kind = v.kind;
  let closed = false;
  const offs: (() => void)[] = [];
  const close = () => {
    if (closed) return;
    closed = true;
    offs.forEach((f) => f());
    m.remove();
    uxSfx('close');
  };
  const say = sayBox(v.say);
  const lamps = lampRow(9, false);
  const stamp = el('span.uxw-end-stamp', uxIcon('check', { color: '#1a1c2e' }), el('b', v.kind === 'clear' ? t('達成', 'Cleared') : t('制覇', 'Conquered')));
  const body: Kid[] = [lamps, el('div.uxw-end-town', uxTape(v.kind === 'clear' ? t('フェーズ 1', 'Phase 1') : t('ランド', 'Land'), 'amber'), stamp)];
  let bonus: Odo | null = null;
  if (v.bonus) {
    bonus = new Odo({ digits: rpDigits(v.bonus.n), size: 'l', cls: 'ux-odo--amber' });
    body.push(el('div.uxw-end-rp', uxTape(v.bonus.label, 'dark'), el('span.uxw-end-rpn', uxIcon('star', { color: '#ffb81f', scale: 2 }), el('b.ux-num', '+'), bonus.el)));
  }
  body.push(el('div.uxw-end-bubble', uxTape(t('マインちゃん', 'Mine'), ''), say.el), actKeys(v.actions, close));
  const card = endCard({ kind: v.kind, label: bare(v.title), ico: v.kind === 'clear' ? 'flag' : 'crown', title: bare(v.title), body });
  m.append(card);
  v.host.append(m);
  card.classList.add('is-in');
  uxSfx('rankup');
  confetti(3);
  lightUp(lamps, () => bonus?.set(v.bonus!.n, { dur: 700, onTick: () => uxSfx('coin') }));
  offs.push(later(isCalm() ? 0 : 320, () => stamp.classList.add('is-on')));
  offs.push(later(isCalm() ? 0 : 420, () => say.start()));
}
