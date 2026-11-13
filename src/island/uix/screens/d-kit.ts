/**
 * 段 UIX3d：決める場面の画面で共通に使う小さな道具（絵文字 → ドットの絵・[[ ]] の色つきの字・顔の窓・部門の札・数字のタイル）。
 * 絵は k-icons.ts（経営企画の段の絵 → 工房・世界の場面の絵 → 土台の絵の順に探す）を使う。表に無い絵文字は字から外す。
 */
import { t } from '../../../i18n';
import { el, fmtN, type Kid } from '../dom';
import { Odo, uxLamp, uxTape } from '../parts';
import { uxpFace } from '../sparts';
import { Q } from './d-deps';
import { K_EMOJI, K_EMOJI_RE, dotEmoji, kIcon, noEmoji, type IcoOpts } from './k-icons';

export const LITE: IcoOpts = { color: '#f4ecd4', hi: '#fffdf3', lo: '#0b0d17', scale: 1 };
export const INK: IcoOpts = { color: '#1a1c2e', hi: '#1a1c2e', lo: '#8a7f5c', scale: 1 };
/** 絵文字の印（または絵の名前）→ ドットの絵。表に無い印は fallback の絵 */
export function dIco(mark: string, o: IcoOpts = LITE, fallback = 'note'): HTMLCanvasElement {
  const m = K_EMOJI_RE.exec(mark ?? '');
  const name = m ? K_EMOJI[m[1]] : /^[a-z0-9]+$/.test(mark ?? '') ? mark : fallback;
  return kIcon(name, o);
}
/** 字の頭の絵文字を外す（絵は別に添える） */
export const dText = (text: string) => noEmoji(text ?? '').trim();
/** [[ ]] の色つきの字（本体の rich）を作り、中の絵文字をドットの絵に替える */
export function dRich(text: string): HTMLElement {
  const e = el('span.uxd-rich');
  e.append(Q.rich(text));
  dotEmoji(e, '#1a1c2e');
  return e;
}
/** 部門の札（短い名前・部門の色の帯） */
export function dDept(d: string | null | undefined): HTMLElement | null {
  if (!d) return null;
  const x = Q.DEPT[d as keyof typeof Q.DEPT];
  if (!x) return null;
  const e = el('span.uxd-dept', x.short);
  e.style.setProperty('--d', x.color);
  return e;
}
/** 話し手の顔の窓（ヒーロー：64px の等倍を win の窓で／案内役：立ち絵の胸から上／使者：ランドの色と紋） */
export function dFace(o: { hero: number | null; crest?: { icon: string; color: string } | null; mine?: string | null }, win = 64, scale: 1 | 2 = 1): HTMLElement {
  if (o.hero != null) return uxpFace(Q.heroIcon(o.hero, 64 * scale), { scale, win, breathe: true });
  if (o.crest) {
    const e = el('span.uxd-crest', { style: { width: `${win}px`, height: `${win}px` } }, el('b', o.crest.icon));
    e.style.setProperty('--lc', o.crest.color);
    dotEmoji(e, '#fffdf3');
    return e;
  }
  const img = el<HTMLImageElement>('img.uxd-mine', { src: o.mine ?? Q.assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png'), alt: '' });
  return el('span.uxd-face-mine', { style: { width: `${win}px`, height: `${win}px` } }, img);
}
/** 符号つきの数（＋・−・±0）と、増減の矢印（色だけに頼らない） */
export const sgnTxt = (v: number, unit = '') => {
  const r = Math.round(v);
  const u = unit ? ` ${unit}` : '';
  return r > 0 ? `+${fmtN(r)}${u}` : r < 0 ? `−${fmtN(-r)}${u}` : `±0${u}`;
};
export const tone = (v: number) => (Math.round(v) > 0 ? 'good' : Math.round(v) < 0 ? 'bad' : '');
/**
 * 数字のタイル（KPI）：貼り札の名前・符号と矢印・桁の回るカウンター・単位・下の添え書き。
 * 開いたとき 0 から回る（動きを減らすときは、すぐ今の値）。text があれば数字ではなく字を出す
 */
export function dTile(o: { key?: string; label: Kid; ico?: string; v: number; unit?: string; delta?: boolean; text?: string; sub?: Kid; note?: Kid; tone?: string }) {
  const neg = o.v < 0;
  const odo = o.text ? null : new Odo({ digits: Math.max(1, String(Math.abs(Math.round(o.v))).length), value: 0 });
  const tn = o.tone ?? (o.delta ? tone(o.v) : '');
  const sign = o.delta ? el('span.uxd-tile-sg.ux-num', Math.round(o.v) > 0 ? '+' : Math.round(o.v) < 0 ? '−' : '±') : neg ? el('span.uxd-tile-sg.ux-num', '−') : null;
  const arrow = o.delta && Math.round(o.v) !== 0 ? kIcon(o.v > 0 ? 'up' : 'down', { ...LITE, color: o.v > 0 ? '#36e08b' : '#ff5964', scale: 2 }) : null;
  const e = el(
    `div.uxd-tile${tn ? '.is-' + tn : ''}`,
    { 'data-kpi': o.key ?? '' },
    el('span.uxd-tile-k', o.ico ? dIco(o.ico, INK) : null, uxTape(typeof o.label === 'string' ? el('b', o.label) : o.label)),
    el('span.uxd-tile-v', arrow, o.text ? el('b.uxd-tile-txt', o.text) : [sign, odo!.el], o.unit ? el('span.uxd-tile-u', o.unit) : null),
    o.sub ? el('span.uxd-tile-s', o.sub) : null,
    o.note ? el('span.uxd-tile-n', o.note) : null,
  );
  return {
    el: e,
    /** 0 から今の値まで回す（開いたとき・ページを見せたとき） */
    roll(dur = 900) {
      odo?.set(Math.abs(Math.round(o.v)), { dur });
    },
  };
}
/** 3 つのランプで「読みの確かさ」（★ の数）と ±N% */
export function dStars(n: number, err: number | null): HTMLElement {
  return el('span.uxd-stars', { role: 'img', 'aria-label': t(`予測精度 ${'★'.repeat(n)}${'☆'.repeat(3 - n)}${err != null ? `（±${err}%）` : ''}`, `Forecast accuracy ${n}/3${err != null ? ` (±${err}%)` : ''}`) }, [0, 1, 2].map((i) => uxLamp('', i < n)), err != null ? el('span.ux-num', `±${err}%`) : null);
}
