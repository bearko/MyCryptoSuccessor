/**
 * BGM のキー（scripts/sync-assets.mjs の audio）。効果音は src/island/p1/sfx.ts。
 * 段 UIX5a：今の BGM（mp3 を流す Sound）は外した。キーは、新しい音の場面（町・発掘・経営会議）の名前として使う（p1/main.ts の bgmKey）。
 */
export type Bgm = 'bgmCraft' | 'bgmDig' | 'bgmBoard';
