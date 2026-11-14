
import { isVacant, myShops, type P1State } from './model';
import { type Ctx } from './screens';
import { areaPaint, companyColor, type Candidate } from './trade';
import { h } from './ui';
import { uxb } from '../uix/screens/b-slots';

/** 商圏の地図（小さな等角の地図）：マスを会社の色で塗り、店（●自社・■他社・□空き店舗）と候補地（金の 1・2・3）を重ねる */
export function areaMiniMap(s: P1State, cands: Candidate[], size = 320): HTMLCanvasElement {
  const cv = h('canvas', 'isl-trade-map');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const n = s.n;
  const cw = size / n;
  const ch = cw / 2;
  const W = size;
  const H = Math.ceil(ch * n + ch + 6);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  const g = cv.getContext('2d');
  if (!g) return cv;
  g.scale(dpr, dpr);
  const at = (i: number, j: number) => ({ x: W / 2 + ((i - j) * cw) / 2, y: 3 + ((i + j) * ch) / 2 + ch / 2 });
  const cell = (i: number, j: number, fill: string) => {
    const c = at(i, j);
    g.beginPath();
    g.moveTo(c.x, c.y - ch / 2);
    g.lineTo(c.x + cw / 2, c.y);
    g.lineTo(c.x, c.y + ch / 2);
    g.lineTo(c.x - cw / 2, c.y);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  const paint = areaPaint(s);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const p = paint[j * n + i];
      cell(i, j, 'rgba(40,60,50,0.9)');
      if (p) {
        g.globalAlpha = 0.25 + 0.65 * Math.min(1, p.v * 1.4);
        cell(i, j, companyColor(s, p.g));
        g.globalAlpha = 1;
      }
    }
  // 店
  for (const b of s.buildings) {
    const c = at(b.i, b.j);
    if (b.owner === 'me' && myShops(s).includes(b)) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(c.x, c.y, Math.max(3, cw * 0.32), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = companyColor(s, 'me');
      g.beginPath();
      g.arc(c.x, c.y, Math.max(2, cw * 0.22), 0, Math.PI * 2);
      g.fill();
    } else if (isVacant(b)) {
      g.strokeStyle = '#ddd';
      g.lineWidth = 1.5;
      g.strokeRect(c.x - cw * 0.25, c.y - cw * 0.25, cw * 0.5, cw * 0.5);
    } else if (s.rivals.some((r) => r.id === b.owner && !r.gone)) {
      g.fillStyle = '#111';
      g.fillRect(c.x - cw * 0.28, c.y - cw * 0.28, cw * 0.56, cw * 0.56);
      g.fillStyle = companyColor(s, b.owner);
      g.fillRect(c.x - cw * 0.2, c.y - cw * 0.2, cw * 0.4, cw * 0.4);
    }
  }
  // 候補地（金の数字）
  cands.forEach((c, k) => {
    const p = at(c.i, c.j);
    g.fillStyle = '#ffd257';
    g.beginPath();
    g.arc(p.x, p.y, Math.max(6, cw * 0.45), 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a1405';
    g.font = `bold ${Math.max(9, Math.round(cw * 0.6))}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`${k + 1}`, p.x, p.y + 0.5);
  });
  return cv;
}

/** 営業の画面 */
export function openTrade(ctx: Ctx, hooks: { areaView: () => void; panels: () => void }) {
  // 段 UIX3b：新しい画面（uix/screens/trade.ts）
  return uxb.trade!(ctx, hooks);
}
