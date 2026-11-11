// 設定：端末に覚えておく。文字の大きさ・動きを減らす・色・走査線は <html> の class で効かせる。
const KEY = 'uixlab.c.v1';
const DEF = { bgm: 7, se: 8, mute: false, calm: false, text: 100, cvd: false, crt: true };

export const store = { ...DEF };
const subs = new Set();

export function loadStore() {
  try {
    Object.assign(store, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch {
    /* 読めなければ、はじめの値で */
  }
  apply();
}
export function setStore(part) {
  Object.assign(store, part);
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* 覚えられなくても動く */
  }
  apply();
}
export function onStore(fn) {
  subs.add(fn);
}
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
mq?.addEventListener?.('change', apply);
/** 動きを減らすか（設定か、端末の設定のどちらかで） */
export const isCalm = () => store.calm || !!mq?.matches;

function apply() {
  const r = document.documentElement.classList;
  r.toggle('is-calm', isCalm());
  r.toggle('is-cvd', store.cvd);
  r.toggle('is-crt', store.crt);
  r.toggle('is-t115', store.text === 115);
  r.toggle('is-t130', store.text === 130);
  for (const fn of subs) fn(store);
}
