// 段 UI10：地図の指の操作（1 本でドラッグ・タップ、2 本でピンチ）。DOM に触らない（main.ts が窓で受けて渡す）。
// 地図の上の印・札・吹き出しの上から始めた指も数える（2 本目が来たらピンチ）。1 本だけのときは、その印や札の動きのまま

export type GCam = { x: number; y: number; zoom: number };
type Pt = { x: number; y: number };

export interface GestureHost {
  cam: GCam;
  /** 地図（canvas）の大きさ。座標は canvas の左上から */
  size(): { W: number; H: number };
  clampZoom(z: number): number;
  /** カメラが動いた（再描画・置くときの建物を真ん中へ） */
  moved(): void;
  /** 1 本の指（マウス）で canvas を押して離した（動かしていない） */
  tap(x: number, y: number): void;
  /** ピンチが終わった（始めたときの縮尺） */
  pinchEnd(zoom0: number): void;
  /** 指を置いた（カメラの動きを止める） */
  touched?(): void;
}

/** ピンチの始まり：2 本の指のまんなかの下にある地図の点を、指のまんなかに付いてこさせる */
export function pinchCam(st: { mid: Pt; d: number; cam: GCam }, a: Pt, b: Pt, W: number, H: number, clamp: (z: number) => number): GCam {
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  const zoom = clamp((st.cam.zoom * d) / Math.max(1, st.d));
  const wx = st.cam.x + (st.mid.x - W / 2) / st.cam.zoom;
  const wy = st.cam.y + (st.mid.y - H / 2) / st.cam.zoom;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return { x: wx - (mx - W / 2) / zoom, y: wy - (my - H / 2) / zoom, zoom };
}

/** 指を離したあと、ピンチに使った指の click（印・札のボタン）を捨てる時間 */
export const PINCH_QUIET_MS = 350;

export function mapGesture(host: GestureHost) {
  const pts = new Map<number, Pt>();
  let drag: { x: number; y: number; cx: number; cy: number; moved: boolean; id: number } | null = null;
  let pinch: { ids: [number, number]; mid: Pt; d: number; cam: GCam } | null = null;
  /** 指を全部離すまで：この組の指はピンチに使った（タップにしない） */
  let pinched = false;
  let quietUntil = 0;
  const startPinch = () => {
    const [ia, ib] = [...pts.keys()];
    const a = pts.get(ia)!;
    const b = pts.get(ib)!;
    pinch = { ids: [ia, ib], mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.hypot(a.x - b.x, a.y - b.y), cam: { ...host.cam } };
    pinched = true;
    drag = null;
  };
  return {
    /** onCanvas：canvas の上から始めた（印・札の上なら false。1 本のときはドラッグもタップもしない） */
    down(id: number, x: number, y: number, onCanvas: boolean) {
      host.touched?.();
      if (pts.size >= 2) return;
      pts.set(id, { x, y });
      if (pts.size === 2) startPinch();
      else if (onCanvas) drag = { x, y, cx: host.cam.x, cy: host.cam.y, moved: false, id };
    },
    /** 戻り値：この指を地図の操作に使った（ピンチ中・ドラッグ中） */
    move(id: number, x: number, y: number): boolean {
      if (!pts.has(id)) return false;
      pts.set(id, { x, y });
      if (pinch) {
        const a = pts.get(pinch.ids[0]);
        const b = pts.get(pinch.ids[1]);
        if (!a || !b) return true;
        const { W, H } = host.size();
        const c = pinchCam(pinch, a, b, W, H, host.clampZoom);
        host.cam.x = c.x;
        host.cam.y = c.y;
        host.cam.zoom = c.zoom;
        host.moved();
        return true;
      }
      if (drag && drag.id === id) {
        const dx = x - drag.x;
        const dy = y - drag.y;
        if (Math.hypot(dx, dy) > 6) drag.moved = true;
        if (drag.moved) {
          host.cam.x = drag.cx - dx / host.cam.zoom;
          host.cam.y = drag.cy - dy / host.cam.zoom;
          host.moved();
        }
        return true;
      }
      return false;
    },
    up(id: number, x: number, y: number, now = performance.now()) {
      if (!pts.delete(id)) return;
      if (pinch) {
        const z0 = pinch.cam.zoom;
        pinch = null;
        quietUntil = now + PINCH_QUIET_MS;
        host.pinchEnd(z0);
      }
      if (pinched) {
        quietUntil = now + PINCH_QUIET_MS;
        if (!pts.size) pinched = false;
        drag = null;
        return;
      }
      const d = drag;
      drag = null;
      if (!d || d.id !== id || d.moved) return;
      host.tap(x, y);
    },
    cancel(id: number) {
      pts.delete(id);
      drag = null;
      if (pinch) {
        const z0 = pinch.cam.zoom;
        pinch = null;
        host.pinchEnd(z0);
      }
      if (!pts.size) pinched = false;
    },
    /** ピンチのあいだと直後は、印・札の click を捨てる */
    quiet(now = performance.now()) {
      return pinched || now < quietUntil;
    },
    get pinching() {
      return !!pinch;
    },
    /** 地図の座標がずれた（隣のセクタへ移ったとき）：つかんでいる位置も同じだけずらす */
    shift(dx: number, dy: number) {
      if (drag) {
        drag.cx -= dx;
        drag.cy -= dy;
      }
      if (pinch) {
        pinch.cam.x -= dx;
        pinch.cam.y -= dy;
      }
    },
  };
}
