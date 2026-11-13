/**
 * 段 UIX4r：設定の札（p1/main.ts の openSettings。器は今の札・押した先は今と同じ）。
 * 見本（public/uixlab/c/js/settings.js）の手触り：入り切りはスイッチ、音量はつまみ（2px の格子・数字は表示板）、いくつかから選ぶものは選びのキー。
 * 入のときの欄（文字の大きさ・動きを減らす ほか：ux.settings）は、このあとに今のまま足す。
 */
import type { SetRow, SettingsView } from './r-slots';
import { el } from '../dom';
import { uxFader, uxKey, uxTape, uxToggle } from '../parts';
import { uxpSeg } from '../sparts';
import { hIcon } from './h-kit';
import { rLine } from './sector';

const cyan = { color: '#5fe4ff', hi: '#c9f6ff', lo: '#0b0d17', scale: 1 };

function ctl(r: SetRow): HTMLElement {
  if (r.k === 'seg') return uxpSeg(r.opts, r.value, (v) => r.set(v), { label: r.label, cls: 'uxr-set-seg' }).el;
  if (r.k === 'switch') return uxToggle({ label: r.label, value: r.value, on: r.on, off: r.off, onChange: (v) => r.set(v) }).el;
  if (r.k === 'fader') {
    const val = el('span.uxr-set-val.ux-num', String(r.value));
    const f = uxFader({ min: 0, max: r.max, step: 1, value: r.value, label: r.label, onInput: (v) => {
        val.textContent = String(v);
        r.set(v);
      } });
    return el('span.uxr-set-fader', f.el, val);
  }
  return uxKey(el('b', r.label), () => r.fn(), { kind: r.danger ? 'danger' : 'weak', cls: 'uxr-set-key' });
}

export function settingsUx(body: HTMLElement, v: SettingsView) {
  body.classList.add('uxr-set-body');
  const root = el('section.uxr-set.ux-root', rLine('gear', v.note, 'dim'));
  for (const g of v.groups) {
    root.append(el('h3.ux-set-h.uxr-set-h', hIcon(g.ico, cyan), g.title));
    for (const r of g.rows) root.append(el('div.ux-set-row.uxr-set-row', { 'data-set': r.id }, r.k === 'key' ? null : uxTape(r.label), el('div.ux-set-ctl', ctl(r)), r.note ? el('p.ux-set-note.ux-t-dim', r.note) : null));
  }
  body.append(root);
}
