/**
 * 段 UIX1s：音の見本帳に出す言葉（音の名前の説明・場面と層の名前・今の音との対応）。
 * 対応の表は docs/ISLAND_UIX_SOUND.md にも書いてある（legacy.ts を変えたら、ここと docs も直す）。
 */
import { t } from '../../../i18n';
import type { SfxName } from './bank';
import type { UxScene } from './core';
import type { LegacySfx } from './legacy';
import type { Layer } from './songs';

export const SCENE_NAME: Record<UxScene, string> = {
  map: t('地図', 'Map'),
  report: t('月次報告', 'Monthly report'),
  sector: t('セクタ選択', 'Sector select'),
  dig: t('発掘', 'Dig'),
  board: t('経営会議', 'Board meeting'),
  title: t('タイトル', 'Title'),
};

export const LAYER_NAME: Record<Layer, string> = {
  lead: t('旋律', 'Melody'),
  bass: t('低音', 'Bass'),
  arp: t('分散和音', 'Arpeggio'),
  drums: t('太鼓', 'Drums'),
  pad: t('和音の厚み', 'Chord pad'),
};

/** 層が重なる理由（本体での決め方。level.ts） */
export const LAYER_WHY: string[] = [
  t('いつも（本体では使わない 1 層）', 'Always (1 layer is not used in the game)'),
  t('いつも', 'Always'),
  t('今月の売上のペースが先月以上', 'Sales pace beats last month'),
  t('エリアの順位が上半分', 'Area rank in the top half'),
  t('エリア 1 位', 'Area rank #1'),
];

/** 地図の曲の構成（8 小節ずつ・64 小節でひと回り） */
export const FORM_NAME: string[] = [
  t('1 巡め A', 'Pass 1 · A'),
  t('1 巡め B', 'Pass 1 · B'),
  t('2 巡め A（旋律が休む・太鼓は軽く）', 'Pass 2 · A (melody rests, light drums)'),
  t('2 巡め B（分散和音を別の順で）', 'Pass 2 · B (alternate arpeggio)'),
  t('3 巡め C（つなぎ）', 'Pass 3 · C (bridge)'),
  t('3 巡め B', 'Pass 3 · B'),
  t('4 巡め A（分散和音が 5 小節めから）', 'Pass 4 · A (arpeggio enters at bar 5)'),
  t('4 巡め B（分散和音を別の順で）', 'Pass 4 · B (alternate arpeggio)'),
];

export const SFX_NOTE: Record<SfxName, string> = {
  press: t('押した', 'Press'),
  release: t('離した', 'Release'),
  open: t('開く', 'Open'),
  close: t('閉じる', 'Close'),
  page: t('紙を送る（めくる）', 'Paper feed (page)'),
  tab: t('タブを替える', 'Switch tab'),
  lever: t('レバーの目盛り「カチ」', 'Lever notch'),
  clunk: t('レバーが落ちる「ガチャン」', 'Lever clunk (approve)'),
  lamp: t('ランプが点く', 'Lamp lights'),
  coin: t('金貨（続くと上がる）', 'Coin (climbs in a run)'),
  cash: t('買った（レジ）', 'Bought (register)'),
  deny: t('足りない・押せない', 'Not enough / can’t'),
  confirm: t('決定', 'Confirm'),
  rankup: t('順位が上がった', 'Rank up'),
  conquest: t('制覇', 'Conquest'),
  build: t('建てる', 'Build'),
  done: t('できあがった', 'Done'),
  tick: t('桁が回る', 'Digit tick'),
  blip: t('吹き出しの字（人で変わる）', 'Speech blip (per speaker)'),
  toggle: t('切り替え（入 → 切）', 'Toggle (on → off)'),
  slide: t('つまみ', 'Slider'),
  error: t('誤り', 'Error'),
  sale: t('地図で 1 つ売れた', 'A sale on the map'),
  deposit: t('入金', 'Deposit'),
  stamp: t('承認済が点く', 'Approved stamp'),
  bell: t('月の締めの鐘', 'Month-close bell'),
  flap: t('札がめくれる', 'Flap'),
  print: t('1 行を打ち出す', 'Print a line'),
  zoom: t('寄る・戻る', 'Zoom in / out'),
  roll: t('小太鼓の連打', 'Drum roll'),
  firework: t('花火', 'Firework'),
  boot: t('電源を入れる', 'Power on'),
  dock: t('帯がはまる', 'Dock'),
  streak: t('制覇までのランプ', 'Streak lamp'),
  leverback: t('レバーが戻る', 'Lever back'),
  built: t('建物の完成', 'Building complete'),
  dig: t('発掘のマスを打つ', 'Dig hit'),
  clink: t('石に当たる', 'Pick on stone'),
};

/** 今の 24 種 → 新しい音（意味・付け替え先） */
export const LEGACY_NOTE: Record<LegacySfx, { mean: string; to: string }> = {
  tap: { mean: t('ボタン・タブを押した', 'Button / tab tap'), to: 'press' },
  page: { mean: t('会話の次へ・カードのめくり', 'Next line / card flip'), to: t('page（3 つ送る短い形）', 'page (short, 3 feeds)') },
  move: { mean: t('置く建物がマスを移る', 'Ghost building moves'), to: 'lever' },
  place: { mean: t('建て始め／ハンコ／1 つずつ', 'Build / stamp / one by one'), to: 'build / clunk / lamp' },
  spend: { mean: t('お金が減る', 'Money spent'), to: 'cash' },
  error: { mean: t('押せない・足りない', 'Can’t / not enough'), to: t('deny（低い呼び出しは error）', 'deny (low calls: error)') },
  done: { mean: t('建物の完成', 'Building complete'), to: 'built' },
  craft: { mean: t('商品ができた', 'Goods crafted'), to: t('done（小さめ）', 'done (softer)') },
  sale: { mean: t('売れた', 'Sold'), to: 'sale' },
  levelup: { mean: t('上がった・承認・解放', 'Level up / approved / unlocked'), to: 'stamp' },
  mission: { mean: t('依頼の達成', 'Request done'), to: 'rankup' },
  report: { mean: t('四半期の決算', 'Quarterly statements'), to: 'bell' },
  win: { mean: t('エリア 1 位・発表・関所', '#1 / presentation / gate'), to: 'rankup' },
  check: { mean: t('小さなチェック', 'Small check'), to: 'lamp' },
  clear: { mean: t('ミッションのクリア', 'Mission clear'), to: 'done' },
  drum: { mean: t('発表のドラムロール', 'Reveal drum roll'), to: 'roll' },
  dig: { mean: t('発掘のマスを打つ', 'Dig hit'), to: t('dig（奥ほど低い）', 'dig (deeper = lower)') },
  treasure: { mean: t('エクステの出土', 'Treasure found'), to: 'stamp' },
  mining: { mean: t('お題の出土・発表', 'Big find / presentation'), to: 'rankup' },
  katsun: { mean: t('つるはしが石に当たる', 'Pick on stone'), to: 'clink' },
  okay: { mean: t('会議の承認', 'Board approve'), to: 'confirm' },
  buff: { mean: t('目標・予算を上げた', 'Target / budget raised'), to: 'zoom' },
  deny: { mean: t('却下・減額', 'Reject / cut'), to: t('toggle（切の側）', 'toggle (off side)') },
  jingle: { mean: t('一括承認・目標の達成', 'Approve all / goal met'), to: 'rankup' },
};
