/**
 * 段 UIX1a：設定の画面に足す欄（入のときだけ出る。docs/ISLAND_UIX.md「設定」）：
 * 文字の大きさ（100・115・130%）・動きを減らす（自動／入／切）・色の組み合わせ・吹き出しの速さ・走査線。
 * 音量の欄は音の土台の段（UIX1s）が足す。
 */
import { t } from '../../i18n';
import { el, type Kid } from './dom';
import { uxIcon } from './icons';
import { uxKey, uxTape, uxToggle } from './parts';
import { isCalm, prefs, setPrefs, type CalmMode, type UxPrefs } from './prefs';
import { uxSfx } from './sound';

/** 並んだキーから 1 つ選ぶ（点いているキーは琥珀） */
function seg<T extends string | number>(label: string, opts: [T, string][], cur: T, on: (v: T) => void): HTMLElement {
  const keys = opts.map(([v, name]) => {
    const b = uxKey(
      name,
      () => {
        keys.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        uxSfx('confirm');
        on(v);
      },
      { attrs: { 'aria-pressed': String(v === cur) } },
    );
    b.style.setProperty('--ux-lit', 'var(--ux-amber)');
    return b;
  });
  return el('div.ux-seg', { role: 'group', 'aria-label': label }, keys);
}
const row = (label: string, ctl: Kid, note?: string) => el('div.ux-set-row', uxTape(label), el('div.ux-set-ctl', ctl), note ? el('p.ux-set-note.ux-t-dim', note) : null);

/** 設定の欄を body の末尾に足す */
export function renderUxSettings(body: HTMLElement) {
  const calmNote = () => (isCalm() && prefs.calm === 'auto' ? t('端末の設定で、動きを減らしています', 'Your device asks for reduced motion') : t('揺れ・光・幕・粒を止めます（淡い切り替えだけ）', 'Stops shakes, glints, wipes and particles'));
  const note = el('p.ux-set-note.ux-t-dim', calmNote());
  const cvd = uxToggle({ label: t('色覚に配慮した色', 'Colour-vision friendly'), value: prefs.cvd, onChange: (v) => setPrefs({ cvd: v }) });
  const crt = uxToggle({ label: t('走査線', 'Scanlines'), value: prefs.crt, onChange: (v) => setPrefs({ crt: v }) });
  const sample = el(
    'div.ux-set-sample',
    el('span.ux-set-chip.is-good', uxIcon('up', { color: '#1a1c2e', scale: 1 }), t('増えた', 'Up')),
    el('span.ux-set-chip.is-bad', uxIcon('down', { color: '#1a1c2e', scale: 1 }), t('急ぎ', 'Urgent')),
    el('span.ux-t-dim', t('色は、形と言葉でも伝えます', 'Colour is always backed by shape and words')),
  );
  const calmRow = row(
    t('動きを減らす', 'Reduce motion'),
    seg<CalmMode>(t('動きを減らす', 'Reduce motion'), [['auto', t('自動', 'Auto')], ['on', t('入', 'On')], ['off', t('切', 'Off')]], prefs.calm, (v) => {
      setPrefs({ calm: v });
      note.textContent = calmNote();
    }),
  );
  calmRow.append(note);
  body.append(
    el(
      'section.ux-set.ux-root',
      // 音の欄（BGM の音量・SE の音量・消音）は、音の土台の段（UIX1s）がここに足す
      el('div.ux-set-sound', { 'data-ux-slot': 'sound' }),
      el('h3.ux-set-h', uxIcon('gear', { color: '#5fe4ff', scale: 1 }), t('見え方（新しい画面）', 'Display (new screens)')),
      row(t('文字の大きさ', 'Text size'), seg<UxPrefs['text']>(t('文字の大きさ', 'Text size'), [[100, '100%'], [115, '115%'], [130, '130%']], prefs.text, (v) => setPrefs({ text: v }))),
      calmRow,
      row(t('色覚に配慮', 'Colour vision'), cvd.el),
      sample,
      row(t('吹き出しの速さ', 'Speech speed'), seg<UxPrefs['talk']>(t('吹き出しの速さ', 'Speech speed'), [[1, t('ゆっくり', 'Slow')], [2, t('ふつう', 'Normal')], [3, t('はやい', 'Fast')], [4, t('すぐ', 'Instant')]], prefs.talk, (v) => setPrefs({ talk: v }))),
      row(t('走査線', 'Scanlines'), crt.el, t('画面の横線とにじみ（重いときは自動で切れます）', 'Screen lines and colour bleed (turned off automatically on slow devices)')),
    ),
  );
}
