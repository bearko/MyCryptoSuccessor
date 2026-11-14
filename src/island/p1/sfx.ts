/**
 * アイランドの効果音の名前（24 種）。
 * 段 UIX5a：今の効果音（scripts/island/sfx.py で作った mp3 を Web Audio で鳴らす IslandSfx）は外した。
 * 呼び出しは新しい音へ付け替える（p1/main.ts の sfx.play → uix/sound.ts の uxLegacy → uix/audio/legacy.ts の表）。
 */
export type Sfx = 'tap' | 'page' | 'move' | 'place' | 'spend' | 'error' | 'done' | 'craft' | 'sale' | 'levelup' | 'mission' | 'report' | 'win' | 'check' | 'clear' | 'drum' | 'dig' | 'treasure' | 'mining' | 'katsun' | 'okay' | 'buff' | 'deny' | 'jingle';
