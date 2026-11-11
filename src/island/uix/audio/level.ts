/**
 * 段 UIX1s：地図の曲の層（2〜5）を、会社の勢いから決める。ゲームの数字は読むだけ（変えない）。
 *
 *  旋律・低音　　　　：いつも（見本と同じく、2 層が土台）
 *  ＋分散和音　　　　：今月の売上のペースが、先月以上（1 か月めは、1 つでも売れたら）
 *  ＋太鼓　　　　　　：エリアの順位が上半分（5 社・6 社なら 3 位以内）
 *  ＋和音の厚み　　　：エリア 1 位
 *
 * 層の順（旋律 → 低音 → 分散和音 → 太鼓 → 和音の厚み）は見本のまま。当てはまる数だけ、下から重なる。
 * 旋律だけの 1 層は、本体では使わない（低音が入ると全体の大きさが約 11dB 上がるので、土台にすると小さすぎる）。見本帳では聴ける。
 */

export interface Momentum {
  /** 直近の月次報告のエリアの順位（まだ報告が無ければ null） */
  rank: number | null;
  /** エリアの会社の数（順位の分母） */
  companies: number;
  /** 今月これまでの売上 */
  salesNow: number;
  /** 先月の売上（まだ報告が無ければ null） */
  salesPrev: number | null;
  /** 先々月の売上（無ければ null） */
  salesPrev2: number | null;
  /** 今月の何日めか（1〜） */
  day: number;
  /** ひと月の日数 */
  days: number;
}

/** 月のはじめは売上が少なくペースが読めないので、この日までは「先月が先々月以上だったか」で見る */
export const PACE_FROM_DAY = 6;
/** ペースが先月のこの割合を下回ったら「伸びていない」に戻す（上がるのは 1.0 以上。境目で行き来しないように幅を持たせる） */
export const PACE_OFF = 0.9;

/** 今月の売上のペース ÷ 先月の売上（比べられないときは null） */
export function pace(m: Momentum): number | null {
  if (m.salesPrev == null || m.salesPrev <= 0 || m.day < 1) return null;
  return (m.salesNow / m.day) * m.days / m.salesPrev;
}

/** 売上が伸びているか。was：ひとつ前の判定（境目で行き来しないため） */
export function growing(m: Momentum, was = false): boolean {
  // 1 か月め（まだ報告が無い）：1 つでも売れたら
  if (m.salesPrev == null) return m.salesNow > 0;
  if (m.salesPrev <= 0) return m.salesNow > 0;
  if (m.day < PACE_FROM_DAY) return m.salesPrev2 == null ? m.salesPrev > 0 : m.salesPrev >= m.salesPrev2;
  const p = pace(m) ?? 0;
  return p >= 1 || (was && p >= PACE_OFF);
}

/** 順位が上半分か */
export const upperHalf = (m: Momentum): boolean => m.rank != null && m.companies > 0 && m.rank <= Math.max(1, Math.ceil(m.companies / 2));

/** 層の内訳（どれが当てはまっているか。見本帳・確かめ用） */
export function momentumParts(m: Momentum, was = false): { growth: boolean; upper: boolean; top: boolean } {
  return { growth: growing(m, was), upper: upperHalf(m), top: m.rank === 1 };
}

/** 土台の層の数（旋律と低音） */
export const BASE_LEVEL = 2;

/** 地図の曲の層の数（2〜5） */
export function mapLevel(m: Momentum, was = false): number {
  const p = momentumParts(m, was);
  return BASE_LEVEL + (p.growth ? 1 : 0) + (p.upper ? 1 : 0) + (p.top ? 1 : 0);
}
