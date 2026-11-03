/**
 * 段 UI6：トロフィー（実績。DOM なし：trophyui.ts とテストが使う）。
 * - bearko.games 共通のトロフィー（タイトル横断）へつなげられる形：ID（ゲームの中）・全体の ID（`successor/<id>`）・名前・条件・取った日。
 *   ログインしていないあいだに取ったものは sent: false のまま貯めておき、あとでまとめて登録できるようにする。
 * - 保存はセーブ本体とは別のキー（localStorage の successor.trophies）。セーブの版は上げない。読み書きはすべて try/catch
 *   （プライベートの窓・保存の拒否・壊れた中身でも遊べる。書けなければ、そのセッションのあいだだけ覚えておく）。
 * - 遊ぶ時間を延ばす条件は作らない（ふつうに遊んで届くこと・遊び方の違いに報いること）。
 * - 名前は MCH のヒーローのパッシブスキルの名前を当てはめられるものはそれを使う（「マイクロマネジメント」はユーザーが決めた名前）。
 * 仕様は docs/SUCCESSOR_ROADMAP.md「段 UI6 の実装」。
 */
import { t } from '../../i18n';
import { inTutorial } from './card';
import { duoDex } from './duo';
import { everHead } from './headtalk';
import { landCleared } from './land';
import type { P1State } from './model';

/** タイトルの ID（bearko.games 共通のトロフィーの前につける） */
export const TROPHY_GAME = 'successor';
/** 保存のキー（セーブ本体とは別） */
export const TROPHY_KEY = 'successor.trophies';

export interface TrophyDef {
  /** ゲームの中の ID（変えない） */
  id: string;
  /** 仮の絵（絵文字。docs/ISLAND_ART_TODO.md） */
  icon: string;
  name: () => string;
  /** 取る条件（一覧に出す文） */
  cond: () => string;
  /** 名前の由来（MCH のヒーローのパッシブスキル） */
  from?: () => string;
  /** 取ったか（いまの状態から） */
  test: (s: P1State) => boolean;
}

/** 全体の ID（bearko.games 共通） */
export const globalId = (id: string) => `${TROPHY_GAME}/${id}`;

export const TROPHIES: TrophyDef[] = [
  {
    id: 'micromanage',
    icon: '🔍',
    name: () => t('マイクロマネジメント', 'Micromanagement'),
    cond: () => t('事業部長を一人も置かずに、すべて自分で指示して Epic ランドを制覇する', 'Conquer the Epic lands without ever placing a division head, giving every order yourself'),
    test: (s) => landCleared(s, 'E') && !everHead(s),
  },
  {
    id: 'first_head',
    icon: '🤝',
    name: () => t('大政奉還', 'Return of Power'),
    cond: () => t('はじめて事業部長を置き、部門を任せる', 'Place your first division head'),
    from: () => t('徳川慶喜のパッシブ', 'Tokugawa Yoshinobu’s passive'),
    test: (s) => everHead(s),
  },
  {
    id: 'first_duo',
    icon: '🫱',
    name: () => t('ワンフォーオール・オールフォーワン', 'One for All, All for One'),
    cond: () => t('ヒーローの組み合わせを 1 つ見つける（組み合わせ図鑑）', 'Find one hero pairing (pairing book)'),
    from: () => t('ダルタニャンのパッシブ', 'd’Artagnan’s passive'),
    test: (s) => duoDex(s).some((x) => x.found),
  },
  {
    id: 'first_clear',
    icon: '🏁',
    name: () => t('来た、見た、勝った', 'Veni, Vidi, Vici'),
    cond: () => t('はじめて町を制覇する（2 か月続けてエリア 1 位）', 'Conquer your first town (#1 two months running)'),
    from: () => t('カエサルのパッシブ', 'Caesar’s passive'),
    test: (s) => !!s.cleared || !!s.flags.clearSeen,
  },
  {
    id: 'epic_clear',
    icon: '👑',
    name: () => t('若き後継者', 'The Young Successor'),
    cond: () => t('Epic ランドを制覇する（いまのゲームのクリア）', 'Conquer the Epic lands (clears the game for now)'),
    from: () => t('孫権のパッシブ', 'Sun Quan’s passive'),
    test: (s) => !!s.flags.landEpic || landCleared(s, 'E'),
  },
];
export const TROPHY_BY_ID: Record<string, TrophyDef> = Object.fromEntries(TROPHIES.map((x) => [x.id, x]));

// ---------------------------------------------------------------- 保存（セーブとは別のキー）

export interface TrophyRec {
  /** 取った日時（ISO 8601） */
  at: string;
  /** 取ったときのゲームの中の日 */
  day: number;
  /** bearko.games 共通のトロフィーへ登録した（ログインのあとにまとめて） */
  sent?: boolean;
}
export interface TrophyBook {
  v: 1;
  game: typeof TROPHY_GAME;
  got: Record<string, TrophyRec>;
}
export const emptyBook = (): TrophyBook => ({ v: 1, game: TROPHY_GAME, got: {} });

/** 保存先（localStorage。使えなければ null） */
type Store = Pick<Storage, 'getItem' | 'setItem'>;
function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 読み込む（無い・読めない・壊れている → 空。知らない ID・形の違う記録は捨てる） */
export function loadTrophies(store: Store | null = defaultStore()): TrophyBook {
  const out = emptyBook();
  let raw: string | null = null;
  try {
    raw = store?.getItem(TROPHY_KEY) ?? null;
  } catch {
    return out;
  }
  if (!raw) return out;
  try {
    const x = JSON.parse(raw) as Partial<TrophyBook> | null;
    if (!x || typeof x !== 'object' || typeof x.got !== 'object' || !x.got) return out;
    for (const [id, r] of Object.entries(x.got)) {
      if (!TROPHY_BY_ID[id] || !r || typeof r !== 'object') continue;
      const rec = r as Partial<TrophyRec>;
      if (typeof rec.at !== 'string') continue;
      out.got[id] = { at: rec.at, day: typeof rec.day === 'number' ? rec.day : 0, ...(rec.sent ? { sent: true } : {}) };
    }
  } catch {
    return out;
  }
  return out;
}
/** 書く（書けなければ false。呼んだ側は、そのセッションのあいだ手元の記録を使う） */
export function saveTrophies(b: TrophyBook, store: Store | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(TROPHY_KEY, JSON.stringify(b));
    return true;
  } catch {
    return false;
  }
}

/** いまの状態で新しく取ったトロフィー（book に書き足す）。チュートリアルのあいだは判定しない */
export function checkTrophies(s: P1State, b: TrophyBook, now: Date = new Date()): TrophyDef[] {
  if (inTutorial(s)) return [];
  const got: TrophyDef[] = [];
  for (const d of TROPHIES) {
    if (b.got[d.id]) continue;
    let ok = false;
    try {
      ok = d.test(s);
    } catch {
      ok = false;
    }
    if (!ok) continue;
    b.got[d.id] = { at: now.toISOString(), day: s.day };
    got.push(d);
  }
  return got;
}

/** bearko.games 共通のトロフィーへ送る形（まだ送っていないもの） */
export function pendingSync(b: TrophyBook): { id: string; game: string; at: string }[] {
  return Object.entries(b.got)
    .filter(([, r]) => !r.sent)
    .map(([id, r]) => ({ id: globalId(id), game: TROPHY_GAME, at: r.at }));
}
