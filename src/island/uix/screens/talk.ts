/**
 * 段 UIX3a：マインちゃんの会話（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：会話」）。
 * 話す人が枠の上に立つ（枠破り）・1 字ずつ喋る（声は人ごと・押すと最後まで）・セリフの長さで枠が伸び縮みする・「つぎへ」が主役（前の層）。
 * 中身と決まりは今の会話（p1/main.ts の showTalk）と同じ：1 枚 1 メッセージ・押すと次の枚・最後の枚は ok のキー・その枚だけのキー・
 * 画面の中の部分を枠で囲む・上の絵（仲間・流れの図・お祝いの品）。開いているあいだは時間が止まる（今の目印 .isl-modal.isl-talk を付ける）。
 * 器・伸び縮み・1 字ずつ喋るのは土台の uxBubble。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { uxBubble, uxKey, uxLamp } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { C } from './c-deps';
import type { TalkCall } from './c-slots';
import './talk.css';
import type { TutPage } from '../../p1/tut';

/** 案内役の立ち絵（もとの大きさ 96×128 のドット絵。等倍で出す：にじませない） */
export const MINE_SIZE = { w: 96, h: 128 };
/** 案内役の声（blip の voice。ヒーローは名前から決める） */
export const MINE_VOICE = 3;
/** 話す人の声：名前から決める（同じ人はいつも同じ声） */
export const voiceOf = (name: string) => [...name].reduce((a, c) => (a + (c.codePointAt(0) ?? 0)) % 997, 0);

/** 文の中の強調（[[ ]]）を、要素にする（今の rich() と同じ書き方） */
export function richParts(text: string): { text: string; em: boolean }[] {
  return text
    .split(/\[\[(.+?)\]\]/)
    .map((part, k) => ({ text: part, em: k % 2 === 1 }))
    .filter((x) => x.text);
}
function richEl(text: string): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const p of richParts(text)) f.append(p.em ? el('b.isl-em.uxc-em', p.text) : document.createTextNode(p.text));
  return f;
}

/** その枚で話す人（案内役・ヒーロー・使者） */
export type Speaker = { kind: 'mine' } | { kind: 'hero'; id: number } | { kind: 'crest'; land: string };
export const speakerOf = (pg: Pick<TutPage, 'who' | 'crest'>): Speaker => (pg.crest != null ? { kind: 'crest', land: pg.crest } : pg.who != null ? { kind: 'hero', id: pg.who } : { kind: 'mine' });
/** 暗幕を薄くする会話：枠で囲む所も絵も無い 1 枚だけの会話（今の会話と同じ決まり） */
export const lightTalk = (pages: Pick<TutPage, 'focus' | 'show' | 'el'>[]) => pages.length === 1 && !pages[0].focus && !pages[0].show && !pages[0].el;
/**
 * 押したときにすること：喋っている途中なら最後まで出す（skip）・次の枚があれば次へ（next）・
 * 最後の枚は閉じる（done）。その枚だけのキーがあるときは、選ぶまで閉じない（stay）
 */
export function tapAct(o: { typing: boolean; k: number; n: number; button: boolean }): 'skip' | 'next' | 'done' | 'stay' {
  if (o.typing) return 'skip';
  if (o.k < o.n - 1) return 'next';
  return o.button ? 'stay' : 'done';
}

export function showTalkUx(o: TalkCall) {
  const { root, pages, ok, then } = o;
  let k = 0;
  let dead = false;
  const mineImg = (last: boolean) => {
    const im = el<HTMLImageElement>('img.uxc-talk-mine', { alt: '', draggable: 'false' });
    im.src = C.assetUrl(last ? 'mch/Image/Characters/navi_ain_cross_01_smile.png' : 'mch/Image/Characters/navi_ain_speak_00_talk.png');
    return im;
  };
  const stage = el('div.isl-talk-stage.uxc-talk-stage', { hidden: true });
  const ring = el('div.isl-talk-focus.uxc-talk-ring', { 'aria-hidden': 'true' });
  const bubble = uxBubble({
    face: mineImg(pages.length === 1),
    faceSize: MINE_SIZE,
    name: t('マインちゃん', 'Mine-chan'),
    voice: MINE_VOICE,
    lines: [''],
    flow: true,
    onTap: (skipped) => {
      if (!skipped) tap(false);
    },
  });
  bubble.el.classList.add('isl-talk-box', 'uxc-talk-bubble');
  const text = bubble.el.querySelector<HTMLElement>('.ux-pop-text');
  text?.classList.add('isl-talk-text');
  const keys = el('div.isl-talk-foot.uxc-talk-keys');
  // 枚の数のランプ（読んだ枚まで点く。8 枚より多い会話では出さない：数は吹き出しの右下にも出る）
  const lamps = pages.length > 1 && pages.length <= 8 ? pages.map(() => uxLamp('')) : [];
  const steps = el('div.uxc-talk-steps', { 'aria-hidden': 'true' }, lamps);
  const pop = el('div.uxc-talk-pop', bubble.el, el('div.uxc-talk-row', steps, keys));
  // 今の目印：.isl-modal.isl-talk（開いているあいだ時間が止まる・お知らせを待たせる・スペースと Enter で送る）
  const m = el('div.isl-modal.isl-talk.ux-modal.ux-modal--talk.uxc-talk.ux-root', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('会話', 'Conversation') }, stage, pop);
  m.classList.toggle('is-light', lightTalk(pages));

  const close = (fn: () => void) => {
    if (dead) return;
    dead = true;
    bubble.destroy();
    m.remove();
    fn();
  };
  const next = () => {
    if (k >= pages.length - 1) return;
    k++;
    show(false);
  };
  /** 箱でも暗幕でも、押すと送る。key：キー（「つぎへ」・最後の枚のキー）からは、喋っている途中でもすぐ進む */
  function tap(viaKey: boolean) {
    if (dead) return;
    const act = tapAct({ typing: !viaKey && bubble.typing, k, n: pages.length, button: !viaKey && !!pages[k].button });
    if (act === 'skip') return bubble.skip();
    if (act === 'next') return next();
    if (act === 'done') close(then);
  }

  let lastWho = '';
  function show(first: boolean) {
    const pg = pages[k];
    const last = k === pages.length - 1;
    // ---- 枠で囲む所
    ring.remove();
    m.classList.toggle('has-focus', !!pg.focus);
    if (pg.focus) o.prep();
    const target = pg.focus ? root.querySelector<HTMLElement>(pg.focus) : null;
    if (target) {
      target.scrollIntoView({ block: 'center' });
      requestAnimationFrame(() => {
        if (dead || pages[k] !== pg) return;
        const r = target.getBoundingClientRect();
        const pad = 8;
        Object.assign(ring.style, { left: `${Math.round(r.left - pad)}px`, top: `${Math.round(r.top - pad)}px`, width: `${Math.round(r.width + pad * 2)}px`, height: `${Math.round(r.height + pad * 2)}px` });
        m.prepend(ring);
      });
    }
    // ---- 話す人（替わったときだけ絵を入れ替える：同じ人が続くあいだは、跳ねるだけ）
    const sp = speakerOf(pg);
    const whoKey = sp.kind === 'mine' ? `mine|${last}` : sp.kind === 'hero' ? `hero|${sp.id}` : `crest|${sp.land}`;
    if (whoKey !== lastWho) {
      lastWho = whoKey;
      if (sp.kind === 'crest') {
        const c = C.crestEl(sp.land);
        c.classList.add('uxc-talk-crest');
        bubble.setWho({ face: c, size: { w: 96, h: 96 }, name: pg.role ?? '', voice: voiceOf(pg.role ?? sp.land) });
      } else if (sp.kind === 'hero') {
        const name = C.heroName(sp.id);
        bubble.setWho({ face: C.heroIcon(sp.id, 128), scale: 2, name, role: pg.role, voice: voiceOf(name) });
      } else bubble.setWho({ face: mineImg(last), size: MINE_SIZE, name: t('マインちゃん', 'Mine-chan'), voice: MINE_VOICE });
    }
    m.dataset.who = sp.kind;
    // ---- 上の絵
    const pic = o.stage(pg);
    stage.replaceChildren();
    if (pic) stage.append(pic);
    stage.hidden = !pic;
    if (pic && !first && !isCalm()) {
      stage.classList.remove('is-in');
      void stage.offsetWidth;
      stage.classList.add('is-in');
    }
    // ---- キー：その枚だけのキー（押すと会話を閉じて、その画面へ）と、「つぎへ」／最後の枚のキー（主役：前の層に出る）
    const extra = pg.button;
    const go = uxKey(last ? ok.replace(/\s*▶\s*$/, '') : t('つぎへ', 'Next'), () => tap(true), { kind: 'main', big: true, ico: last ? 'check' : 'next', cls: 'uxc-talk-go', attrs: { 'data-ux-quiet': '', 'data-talk': last ? 'ok' : 'next' } });
    keys.replaceChildren(
      ...(extra
        ? [
            uxKey(extra[0].replace(/^\P{L}+\s*/u, ''), () => close(extra[1]), { cls: 'isl-talk-extra uxc-talk-extra', ico: 'list' }),
          ]
        : []),
      go,
    );
    // スペース・Enter：最後の枚はキー、ほかは次の枚へ（今と同じ）。喋っている途中なら、まず最後まで出す
    o.keys(m, () => (bubble.typing ? bubble.skip() : last ? (uxSfx('press'), close(then)) : (uxSfx('page'), next())));
    lamps.forEach((l, i) => {
      l.classList.toggle('is-on', i <= k);
      l.classList.toggle('is-blink', i === k && !last);
    });
    bubble.say(richEl(pg.text), { first, count: pages.length > 1 ? `${k + 1}/${pages.length}` : '' });
  }

  m.addEventListener('click', (e) => {
    // キー・リンクの上は、それぞれの操作だけ
    if (e.target instanceof Element && e.target.closest('button, a, input, select, .ux-pop-say')) return;
    uxSfx('page');
    tap(false);
  });
  root.append(m);
  show(true);
  // 書体が読めて行の数が変わったら、枠を合わせ直す
  void document.fonts?.ready.then(() => !dead && bubble.fit(false));
}
