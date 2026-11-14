/**
 * ランクアップの災害と徴収の演出（発掘 v2 の 7 段目。docs/ISLAND_PHASE1.md「ランクアップの災害と復興」）。
 * 全画面の重ね（地図の上）で、順に：① 災害（揺れ・雲・雨・稲光・ひび）→ ② 被害の一覧（Common の町の札が「🏚 被災」に）→
 * ③ ランドの役人の通知（全額徴収）→ ④ 復興協定書にサイン（店の名前が手書きで書かれていく）→ ハンコ（赤い丸印・「ポン」と揺れ）→
 * ⑤ ランドからの復興の支度金。タップで次へ（自動でも進む）。仮の絵は CSS とコード（docs/ISLAND_ART_TODO.md）
 */
import { t } from '../../i18n';
import { sectorDef, TIER_NAME } from './company';
import { sectorIcon } from './landui';
import type { P1State, ResetRec } from './model';
import type { Sfx } from './sfx';
import { uxw } from '../uix/screens/w-slots';
import { TIERS } from './data';
import { FX_PAL, fxLevel, playFx } from '../fx/layer';

/** 店の名前の幅（全角 2・半角 1。16 まで＝全角 8 文字・英語 16 文字） */
export const nameWidth = (x: string) => [...x].reduce((a, c) => a + (/[\u0000-ÿ｡-ﾟ]/.test(c) ? 1 : 2), 0);
export const NAME_MAX = 16;
/** 店の名前をそろえる（前後の空白を取り、幅 16 まで） */
export function fitName(x: string): string {
  let out = '';
  for (const c of [...x.trim()]) {
    if (nameWidth(out + c) > NAME_MAX) break;
    out += c;
  }
  return out;
}
/** 初期値の案 */
export const defaultName = () => t('マイクリ商会', 'MyCrypto & Co.');

export interface DisasterHooks {
  sfx: (k: Sfx, gain?: number, rate?: number) => void;
  toast: (text: string) => void;
  save: () => void;
}

/**
 * 災害と徴収の演出を出す。終わったら done（行き先の町のマインちゃんの会話へ）。店の名前が無ければサインの段で入力してセーブに残す
 */
export function playDisaster(root: HTMLElement, s: P1State, rec: ResetRec, hooks: DisasterHooks, done: () => void) {
  // 段 UIX3w：管制卓の演出へ（流れ・出す中身・店の名前の入力は同じ）
  return uxw.disaster!({
      host: root,
      towns: Object.keys(rec.ruins).map((id) => {
        const d = sectorDef(id);
        return { id, name: d.name, tier: d.tier, color: TIERS[d.tier].color, icon: sectorIcon(d.tier), ruins: rec.ruins[id] ?? 0 };
      }),
      levy: rec.levy,
      grant: rec.grant,
      to: { name: sectorDef(rec.to).name, tierName: TIER_NAME[rec.tier] },
      nth: Math.max(1, (s.resets ?? []).indexOf(rec) + 1),
      kept: { rp: Math.round(s.rp ?? 0), heroes: s.staff.length, panels: rec.kept?.length ?? 0, antiques: Object.values(rec.keep ?? {}).reduce((a, b) => a + b, 0) },
      storeName: s.storeName || null,
      defaultName: defaultName(),
      fitName,
      nameWidth,
      nameMax: NAME_MAX,
      setName: (name) => {
        s.storeName = name;
        hooks.save();
      },
      rain: (map, host) => {
        const fs = Math.max(2, Math.min(4, Math.floor((innerWidth * 0.92) / 180)));
        const calm = fxLevel() === 'calm';
        return playFx('rain-band', map.offsetLeft + map.offsetWidth / 2, map.offsetTop + map.offsetHeight + 4, { host, keep: true, palette: FX_PAL.rain, ink: false, scale: fs, life: 60000, opts: { count: calm ? 80 : 170, bolt: !calm } });
      },
      done: () => {
        rec.seen = true;
        hooks.save();
        done();
      },
    });
}
