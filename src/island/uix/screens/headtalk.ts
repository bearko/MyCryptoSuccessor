/**
 * 段 UIX3d：部長との対話（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：部長との対話」）。
 * 今の会話の画面（headtalkui.ts の render。話題・確認事項・選択肢・押した先）はそのまま描き、描いたあとに着せ替える（今の要素の着せ替え）：
 * - 会話の箱は 1 回目の会話の形（紙の吹き出し・話す人が枠の上に立つ・1 字ずつ喋る。同じ字の描き直しでは喋り直さない。押すと最後まで）
 * - 決める所（確認事項の 1 件・選択肢）はこの段の札（板・貼り札）とキー。承認はレバー（土台の口 ux.lever：今のまま）
 * - いちばん上の選択肢（推奨・確認事項）を主役（前の層）に。絵文字はドットの絵
 */
import { typeInto, uxLamp, type Typing } from '../parts';
import { uxSfx } from '../sound';
import { dotEmoji } from './k-icons';
import './d-deleg.css';

let lastText = '';
let typing: Typing | null = null;
/** 会話の画面を描いたあとに呼ぶ（毎日の描き直しでも呼ばれる） */
export function headTalkDress(body: HTMLElement) {
  body.classList.add('uxd-ht', 'ux-root');
  body.querySelector('.isl-ht-talk')?.classList.add('uxd-ht-talk');
  body.querySelector('.isl-ht-item')?.classList.add('uxd-ht-item');
  // 主役：推奨・確認事項の選択肢（レバーになった承認は、レバーが主役）
  const rec = body.querySelector<HTMLElement>('.isl-ht-opts > .isl-btn.is-rec');
  if (rec && !body.querySelector('.isl-ht-opts .ux-lever')) rec.classList.add('ux-front');
  dotEmoji(body);
  dressMorale(body);
  const tx = body.querySelector<HTMLElement>('.isl-ht-text');
  if (!tx) return;
  const txt = tx.textContent ?? '';
  if (txt === lastText) return;
  lastText = txt;
  // 1 字ずつ（強調の <b> を保ったまま）。押すと最後まで
  const frag = document.createDocumentFragment();
  for (const n of [...tx.childNodes]) frag.append(n);
  const wrap = document.createElement('span');
  wrap.append(frag);
  typing?.skip();
  typing = typeInto(tx, wrap, { onDone: () => (typing = null) });
  uxSfx('open');
  tx.addEventListener('click', () => typing?.skip(), { capture: true, once: true });
}

/** 士気の札（今の .isl-morale）を、人と管理の画面の士気の札（hr.ts の moraleTag：ランプと字）と同じ形に揃える */
const MORALE_LAMP: Record<string, '' | 'good' | 'bad' | 'cyan'> = { high: 'cyan', ok: 'good', low: '', bad: 'bad' };
function dressMorale(body: HTMLElement) {
  for (const chip of body.querySelectorAll<HTMLElement>('.isl-morale:not(.uxh-mor)')) {
    const band = ['high', 'ok', 'low', 'bad'].find((b) => chip.classList.contains('is-' + b)) ?? 'ok';
    const text = document.createElement('span');
    text.textContent = chip.textContent ?? '';
    chip.textContent = '';
    chip.classList.add('uxh-mor');
    chip.style.removeProperty('--c');
    chip.append(uxLamp(MORALE_LAMP[band], true), text);
  }
}
