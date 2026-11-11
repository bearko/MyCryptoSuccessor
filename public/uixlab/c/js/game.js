// 見本の状態と、場面どうしで使う道具
import { START } from './data.js';

export const DAY_MS = 2400;

export const G = {
  /** 台本の状態 */
  s: null,
  world: null,
  eng: null,
  music: null,
  sfx: null,
  wipe: null,
  hud: null,
  layer: null,
  /** 開いている札を閉じる関数（上から順に） */
  open: [],
  /** 時間を止めている理由の数（札を開いているあいだは進めない） */
  holds: 0,
  started: false,
};

export function fresh() {
  return {
    ...START,
    dayFrac: 0,
    speed: 1,
    step: 'ws', // ws → prop → wait → streak → done
    propReady: false,
    approved: false,
    bought: false,
    reported: false,
    conquered: false,
    importShown: false,
    streak: 0,
    auto: true,
    qty: 80,
    made: [80, 34, 12],
    mapSec: 0,
    wsSeen: false,
  };
}

export const STREAK_DAYS = 7;

/** 札を開いているあいだ、ゲームの時間を止める（地図の見た目は動き続ける） */
export function hold() {
  G.holds++;
  // 札を開いているあいだ、「つぎの一手」の札は脇へよける
  G.hud?.under.classList.add('is-off');
  let done = false;
  return () => {
    if (done) return;
    done = true;
    G.holds = Math.max(0, G.holds - 1);
    if (G.holds === 0 && G.started) G.hud?.under.classList.remove('is-off');
  };
}

export function closeAll() {
  while (G.open.length) G.open.pop()(true);
}

/** BGM の層：はじめは旋律と低音。設備を買う・承認する・1 位になる、で 1 層ずつ増える */
export function syncLayers() {
  const s = G.s;
  const n = 2 + (s.bought ? 1 : 0) + (s.approved ? 1 : 0) + (s.rank === 1 ? 1 : 0);
  G.music?.setLevel(s.conquered ? 5 : n);
}
