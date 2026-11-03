/**
 * 段 P2：ヒーローの組み合わせ（DOM なし：model.ts の speed・drainOf、hr.ts の moraleParts、card.ts の月の締め・main.ts・growthui.ts・自動プレイ・テストが使う）。
 * 史実の調査（docs/heroes/research の relations）から選んだ 30 の組み合わせ。同じ会社・同じ町・同じ部門・上司と部下の条件が初めてそろった締めに、
 * 掛け合いの会話（UI2 の会話の箱・60 字 × 3〜4 枚）と UI1 のカード（3 択・選び方で得も損も）を出し、見つけた組み合わせは図鑑に残る。
 * 見つけたあとは、条件がそろっているあいだ小さな効き目（盟友・兄弟・師弟は士気 +・宿敵は速さ + と疲れ +・緊張は士気 −）。選んだ手で期限つきの効き目・解消。
 * 数字は data.ts の DUO（1 か所）。仕様は docs/ISLAND_PHASE1.md「ヒーローの組み合わせ」。
 *
 * 決まり：史実の関係に合わせるが、ゲームの中の会社の仕事の場面として穏当に（争い・裏切り・悲劇的な最期は出さない。研究ファイルの cautions）。
 * 小説・ドラマの場面（桃園の誓いなど）は史実として扱わない（図鑑の一言で分ける）。
 */
import { isEn, t } from '../../i18n';
import { heroById } from '../../game/catalog';
import { CARD, DELEG, DUO, DUTY, EVENT, type DeptId, type DutyId, type Task } from './data';
import type { Draft } from './card';
import { baseId, P2_OFF, voiceSay } from './voice';
import { heroSay } from './persona';
import { moraleAdd } from './hr';
import { spend, type P1State, type Staff } from './model';

// ---------------------------------------------------------------- 型

/** 関係の種類：盟友・家族（兄弟・親子）・師弟・宿敵（好敵手）・緊張 */
export type DuoKind = 'ally' | 'kin' | 'mentor' | 'rival' | 'tension';
/** 条件：同じ会社にいる・同じ町で働いている・同じ部門・上司（部長）と部下（その部門） */
export type DuoCond = 'company' | 'town' | 'team' | 'boss';
export interface DuoPage {
  /** 話す人（調査の id。画面ではいまの会社のそのヒーロー＝レプリカならレプリカ） */
  who: number;
  text: () => string;
}
export interface DuoDef {
  id: string;
  /** 調査の id（オリジナル）。2〜3 人 */
  heroes: number[];
  kind: DuoKind;
  cond: DuoCond;
  name: () => string;
  /** 図鑑の一言（史実の関係。伝承・創作はそう書く） */
  note: () => string;
}
/** 選択肢（データだけ。文は見せるときに作る） */
export type DuoOptId = 'team' | 'party' | 'compete' | 'apart' | 'talk' | 'push' | 'keep';
export interface DuoOpt {
  id: DuoOptId;
  cost: number;
  /** 見込み（G。費用込み） */
  ev: number;
  light?: boolean;
}
/** カードに入れる中身 */
export interface DuoData {
  id: string;
  /** いまの会社のヒーローの id（調査の順） */
  heroes: number[];
  opts: DuoOpt[];
  /** 掛け合いの会話を見た（画面。自動プレイ・テストでは見なくてよい） */
  told?: boolean;
}
/** 見つけた組み合わせの記録 */
export interface DuoRec {
  /** 見つけた日・会社の締めの回数 */
  day: number;
  mk: number;
  /** 選んだ手 */
  opt?: DuoOptId;
  /** 期限つきの効き目（この日まで）：速さ・疲れの倍率 */
  until?: number;
  speed?: number;
  drain?: number;
  /** いつもの効き目を止めた（宿敵を離した・緊張を解消した） */
  off?: boolean;
}
export interface DuoState {
  found: Record<string, DuoRec>;
  /** 数え（自動プレイの表）：出したカードの数・選んだ手 */
  stat: { made: number; opt: Partial<Record<DuoOptId, number>> };
}
export const newDuo = (): DuoState => ({ found: {}, stat: { made: 0, opt: {} } });
export const duoOf = (s: P1State): DuoState => (s.duo ??= newDuo());

// ---------------------------------------------------------------- 30 の組み合わせ

export const DUOS: DuoDef[] = [
  {
    id: 'liubei3',
    heroes: [5009, 4037, 4001],
    kind: 'ally',
    cond: 'town',
    name: () => t('兄弟のような三人', 'Like Brothers'),
    note: () => t('史書は三人の仲を「恩は兄弟のごとし」と記す（桃園の誓いは小説の場面）。', 'The histories say they were close as brothers (the peach-garden oath is from the novel).'),
  },
  {
    id: 'tenka3',
    heroes: [5001, 2026, 3044],
    kind: 'ally',
    cond: 'company',
    name: () => t('天下をつないだ三人', 'The Three Unifiers'),
    note: () => t('信長に取り立てられた秀吉と、信長と長く同盟した家康。三人で天下統一への道をつないだ。', 'Hideyoshi rose under Nobunaga; Ieyasu was his long ally. Together they carried Japan toward unity.'),
  },
  {
    id: 'nobumitsu',
    heroes: [5001, 2020],
    kind: 'tension',
    cond: 'boss',
    name: () => t('せっかちと几帳面', 'Haste and Care'),
    note: () => t('光秀は信長の重臣として仕えた。のちの本能寺の変の動機には諸説ある。', 'Mitsuhide served as a senior retainer of Nobunaga. Why he later turned on him is still debated.'),
  },
  {
    id: 'shieikan3',
    heroes: [4035, 4027, 4012],
    kind: 'ally',
    cond: 'town',
    name: () => t('試衛館の仲間', 'The Shieikan Friends'),
    note: () => t('同じ天然理心流の道場の仲間で、ともに浪士組に加わり新選組を組織した。', 'Comrades from the same fencing school who went on to form the Shinsengumi.'),
  },
  {
    id: 'chuhan',
    heroes: [5025, 5026],
    kind: 'rival',
    cond: 'team',
    name: () => t('楚と漢', 'Chu and Han'),
    note: () => t('秦を倒すまでは同志、そののち天下を争った宿敵。', 'Allies against Qin, then rivals for all under heaven.'),
  },
  {
    id: 'currents',
    heroes: [4007, 4041],
    kind: 'rival',
    cond: 'team',
    name: () => t('直流と交流', 'DC and AC'),
    note: () => t('テスラはエジソンの研究所に勤めたのち独立し、送電の方式で対立した。', 'Tesla worked at Edison’s lab, went his own way, and the two clashed over power systems.'),
  },
  {
    id: 'funashima',
    heroes: [5032, 4004],
    kind: 'rival',
    cond: 'team',
    name: () => t('船島の二人', 'The Island Duel'),
    note: () => t('1612 年に船島（巌流島）で勝負をしたと伝わる（細部は後世の伝記による）。', 'Said to have met in a duel on Funashima in 1612 (details come from later biographies).'),
  },
  {
    id: 'genji',
    heroes: [3051, 5019],
    kind: 'tension',
    cond: 'boss',
    name: () => t('すれ違う兄弟', 'Brothers at Odds'),
    note: () => t('異母兄弟。平氏との戦いで弟は大きな手柄を立てたが、のちに兄弟は対立した。', 'Half-brothers. The younger won great renown against the Taira, but the two later fell out.'),
  },
  {
    id: 'jiangdong',
    heroes: [2037, 4048],
    kind: 'ally',
    cond: 'town',
    name: () => t('同い年の親友', 'Friends of the Same Age'),
    note: () => t('同い年の親友で、ともに江東を平らげた（妻どうしも姉妹とされる）。', 'Close friends of the same age who won Jiangdong together (their wives are said to be sisters).'),
  },
  {
    id: 'wuzhang',
    heroes: [5015, 4050],
    kind: 'rival',
    cond: 'team',
    name: () => t('五丈原の好敵手', 'Rivals at Wuzhang'),
    note: () => t('北伐で何度も向かい合った蜀の丞相と魏の将。', 'The Shu chancellor and the Wei general who faced each other again and again.'),
  },
  {
    id: 'eroica',
    heroes: [5002, 4003],
    kind: 'tension',
    cond: 'company',
    name: () => t('消された献辞', 'The Erased Dedication'),
    note: () => t('ベートーヴェンは交響曲第 3 番をナポレオンに献じるつもりだったが、皇帝即位を知って題を消したと伝わる。', 'Beethoven meant to dedicate his Third Symphony to Napoleon but struck out the title when he became emperor.'),
  },
  {
    id: 'teplitz',
    heroes: [2033, 4003],
    kind: 'ally',
    cond: 'town',
    name: () => t('テプリッツの出会い', 'Meeting at Teplitz'),
    note: () => t('1812 年、保養地テプリッツで会った。ベートーヴェンはゲーテの詩に曲をつけていた。', 'They met at the spa town of Teplitz in 1812. Beethoven had set Goethe’s poems to music.'),
  },
  {
    id: 'letters',
    heroes: [3046, 4014],
    kind: 'kin',
    cond: 'company',
    name: () => t('母と娘の手紙', 'Letters from Mother'),
    note: () => t('マリア・テレジアは嫁いだ末娘に、手紙で教え諭し続けた。', 'Maria Theresa kept advising her youngest daughter by letter after her marriage.'),
  },
  {
    id: 'solvay',
    heroes: [4017, 5010],
    kind: 'ally',
    cond: 'town',
    name: () => t('ソルベー会議の二人', 'Two at the Solvay'),
    note: () => t('1911 年のソルベー会議などで顔を合わせ、交流のあった同時代の科学者。', 'Contemporaries who met at the 1911 Solvay Conference and kept in touch.'),
  },
  {
    id: 'twoheroes',
    heroes: [5003, 5009],
    kind: 'rival',
    cond: 'team',
    name: () => t('二人の英雄', 'Two Heroes'),
    note: () => t('劉備は一時曹操のもとに身を寄せたが離れ、生涯の宿敵となった。', 'Liu Bei once sheltered under Cao Cao, then left; they were rivals for life.'),
  },
  {
    id: 'kawanakajima',
    heroes: [4025, 4032],
    kind: 'rival',
    cond: 'team',
    name: () => t('川中島の好敵手', 'Rivals of Kawanakajima'),
    note: () => t('北信濃をめぐり、川中島で何度も戦った宿敵（塩の話は伝承）。', 'Rivals who met again and again at Kawanakajima (the salt story is legend).'),
  },
  {
    id: 'kobe',
    heroes: [4005, 5008],
    kind: 'mentor',
    cond: 'town',
    name: () => t('操練所の師弟', 'Teacher and Student'),
    note: () => t('龍馬は 1862 年に勝の門下に入り、神戸海軍操練所の建設を手伝った。', 'Ryoma became Katsu’s student in 1862 and helped build the Kobe naval school.'),
  },
  {
    id: 'edotalks',
    heroes: [4039, 4005],
    kind: 'ally',
    cond: 'town',
    name: () => t('江戸の話し合い', 'The Edo Talks'),
    note: () => t('1868 年、二人の会見で江戸城の明け渡しが戦わずにまとまった。', 'In 1868 their talks settled the handover of Edo Castle without a battle.'),
  },
  {
    id: 'nile',
    heroes: [5016, 4026],
    kind: 'ally',
    cond: 'company',
    name: () => t('ナイルの同盟', 'The Nile Alliance'),
    note: () => t('前 48 年に会って手を結び、クレオパトラは王位を取り戻した。', 'They allied in 48 BC, and Cleopatra regained her throne.'),
  },
  {
    id: 'benkei',
    heroes: [5019, 3018],
    kind: 'ally',
    cond: 'town',
    name: () => t('主従の伝説', 'A Legendary Bond'),
    note: () => t('弁慶は義経に仕えたと伝わる（五条の橋の出会いなど、多くは後世の伝説）。', 'Benkei is said to have served Yoshitsune (most famous tales are later legend).'),
  },
  {
    id: 'athens3',
    heroes: [2044, 2034, 2047],
    kind: 'mentor',
    cond: 'town',
    name: () => t('アテネの師弟三代', 'Three Generations of Athens'),
    note: () => t('ソクラテスの弟子プラトンが学園を開き、そこでアリストテレスが約 20 年学んだ。', 'Plato, Socrates’ student, founded the Academy, where Aristotle studied for some 20 years.'),
  },
  {
    id: 'mieza',
    heroes: [2047, 5017],
    kind: 'mentor',
    cond: 'town',
    name: () => t('ミエザの学び舎', 'The School at Mieza'),
    note: () => t('アリストテレスは 13 歳のアレクサンドロスを数年のあいだ教えた。', 'Aristotle taught the 13-year-old Alexander for several years.'),
  },
  {
    id: 'vienna',
    heroes: [4003, 2004],
    kind: 'mentor',
    cond: 'town',
    name: () => t('敬愛する先輩', 'An Admired Elder'),
    note: () => t('シューベルトは同じウィーンのベートーヴェンを生涯敬った。', 'Schubert admired Beethoven, his fellow Viennese, all his life.'),
  },
  {
    id: 'rome',
    heroes: [2023, 3041],
    kind: 'rival',
    cond: 'team',
    name: () => t('ローマの張り合い', 'Rivalry in Rome'),
    note: () => t('同じころローマで教皇の仕事をし、張り合う関係にあった。', 'They worked for the popes in Rome at the same time and were rivals.'),
  },
  {
    id: 'sunbros',
    heroes: [2037, 4018],
    kind: 'kin',
    cond: 'company',
    name: () => t('孫家の兄弟', 'The Sun Brothers'),
    note: () => t('兄・孫策が築いた江東を、弟の孫権が継いで長く守った。', 'Sun Quan inherited the Jiangdong his elder brother built and held it for decades.'),
  },
  {
    id: 'iga',
    heroes: [3044, 3010],
    kind: 'ally',
    cond: 'town',
    name: () => t('伊賀越えの主従', 'Through the Iga Hills'),
    note: () => t('服部半蔵は家康に仕え、本能寺の変の後の伊賀越えに同行したとされる。', 'Hattori Hanzo served Ieyasu and is said to have guided him through Iga in 1582.'),
  },
  {
    id: 'sekigahara',
    heroes: [2012, 3044],
    kind: 'rival',
    cond: 'team',
    name: () => t('関ヶ原の両雄', 'The Two of Sekigahara'),
    note: () => t('豊臣政権の実務を担った三成と、天下を握った家康は、1600 年の関ヶ原で戦った。', 'Mitsunari ran the Toyotomi government; Ieyasu took the realm. They met at Sekigahara in 1600.'),
  },
  {
    id: 'bugyo',
    heroes: [2026, 2012],
    kind: 'ally',
    cond: 'boss',
    name: () => t('天下人と奉行', 'The Ruler and His Magistrate'),
    note: () => t('三成は 1577 年から秀吉に仕え、その政権で五奉行の一人となった。', 'Mitsunari served Hideyoshi from 1577 and became one of his five magistrates.'),
  },
  {
    id: 'twocamps',
    heroes: [1003, 4037],
    kind: 'ally',
    cond: 'company',
    name: () => t('陣営を越えた友', 'Friends Across the Lines'),
    note: () => t('曹操のもとにいた関羽と親しく、その本心を聞き出したのは張遼だった。', 'Zhang Liao was close to Guan Yu during his time with Cao Cao and heard his true intentions.'),
  },
  {
    id: 'brothers',
    heroes: [2001, 2005],
    kind: 'kin',
    cond: 'company',
    name: () => t('ふた組の兄弟', 'Two Sets of Brothers'),
    note: () => t('史実のつながりは無い、ゲームの中だけの組み合わせ（どちらも兄弟で仕事をした）。', 'No historical link — a pairing just for this game (both worked as brothers).'),
  },
];
export const DUO_BY_ID: Record<string, DuoDef> = Object.fromEntries(DUOS.map((d) => [d.id, d]));

/** 掛け合いの会話（duotalk.ts。文が長いので別のファイルにして、起動のあとに読み込む。読み込む前はカードだけ出す） */
let TALK: Record<string, DuoPage[]> | null = null;
let talkLoading: Promise<void> | null = null;
export function loadDuoTalk(): Promise<void> {
  if (TALK) return Promise.resolve();
  return (talkLoading ??= import('./duotalk').then((m) => {
    TALK = m.DUO_TALK;
  }));
}
void loadDuoTalk().catch(() => undefined);
/** その組み合わせの会話（読み込む前は空） */
export const duoTalk = (id: string): DuoPage[] => TALK?.[id] ?? [];
/** 調査の id → その人の入っている組み合わせ */
const BY_HERO = new Map<number, DuoDef[]>();
for (const d of DUOS) for (const h of d.heroes) BY_HERO.set(h, [...(BY_HERO.get(h) ?? []), d]);

// ---------------------------------------------------------------- 条件

/** 仕事・役目 → 部門（リーダー・部長はその部門。製造・運搬・調達・販売は物流・発掘は R&D・開拓と調査はマーケ。model.ts の TASK_DEPT と同じ） */
const TASK_DEPT: Partial<Record<Task, DeptId>> = { craft: 'logistics', transport: 'logistics', buy: 'logistics', shop: 'logistics', dig: 'rnd', explore: 'marketing', intel: 'marketing' };
export function deptOfStaff(st: Pick<Staff, 'task' | 'target'>): DeptId | null {
  if (st.task === 'lead' && typeof st.target === 'string') {
    const [k, id] = st.target.split(':');
    if (k === 'H') return id as DeptId;
    if (k === 'L') return DUTY[id as DutyId]?.dept ?? null;
  }
  return st.task ? TASK_DEPT[st.task] ?? null : null;
}
const isHead = (st: Pick<Staff, 'task' | 'target'>) => st.task === 'lead' && typeof st.target === 'string' && st.target.startsWith('H:');
/** その組み合わせのヒーロー（いまの会社。調査の順）。そろっていなければ null */
function members(s: Pick<P1State, 'staff'>, d: DuoDef): Staff[] | null {
  const out: Staff[] = [];
  for (const b of d.heroes) {
    const st = s.staff.find((x) => baseId(x.hero) === b);
    if (!st) return null;
    out.push(st);
  }
  return out;
}
/** 条件がそろっているか（そろっていればそのヒーロー） */
export function duoMet(s: Pick<P1State, 'staff'>, d: DuoDef): Staff[] | null {
  const xs = members(s, d);
  if (!xs) return null;
  switch (d.cond) {
    case 'company':
      return xs;
    case 'town':
      // ほかの町のセクター長は別の町にいる
      return xs.every((x) => x.task !== 'manager') ? xs : null;
    case 'team': {
      const ds = xs.map(deptOfStaff);
      return ds[0] && ds.every((x) => x === ds[0]) ? xs : null;
    }
    case 'boss': {
      // どちらかが部長で、もう一人がその部門で働いている（リーダー・持ち場）
      const [a, b] = xs;
      const ok = (h: Staff, w: Staff) => isHead(h) && !isHead(w) && deptOfStaff(w) === deptOfStaff(h);
      return ok(a, b) || ok(b, a) ? xs : null;
    }
  }
}

// ---------------------------------------------------------------- 効き目（model.ts・hr.ts が毎回読む。1 日 1 回まとめて数える）

interface Fx {
  speed: number;
  drain: number;
  morale: number;
}
const NONE: Fx = { speed: 1, drain: 1, morale: 0 };
const cache = new WeakMap<object, { day: number; n: number; k: number; fx: Map<number, Fx> }>();
/** いま効いている組み合わせの効き目（ヒーローごと）。見つけた組み合わせが無ければ空 */
function fxMap(s: P1State): Map<number, Fx> | null {
  const D = s.duo;
  if (P2_OFF.duo || !D) return null;
  const keys = Object.keys(D.found);
  if (!keys.length) return null;
  const hit = cache.get(D);
  if (hit && hit.day === s.day && hit.n === s.staff.length && hit.k === keys.length) return hit.fx;
  const fx = new Map<number, Fx>();
  const add = (hero: number, f: Partial<Fx>) => {
    const x = fx.get(hero) ?? { ...NONE };
    x.speed *= f.speed ?? 1;
    x.drain *= f.drain ?? 1;
    x.morale += f.morale ?? 0;
    fx.set(hero, x);
  };
  for (const id of keys) {
    const d = DUO_BY_ID[id];
    const r = D.found[id];
    if (!d || !r) continue;
    // 期限つきの効き目（組ませた・競わせた・あえて任せた）：期限まで、その組み合わせのヒーローに
    if (r.until != null && r.until > s.day) {
      const xs = members(s, d);
      for (const x of xs ?? []) add(x.hero, { speed: r.speed, drain: r.drain });
    }
    if (r.off) continue;
    const xs = duoMet(s, d);
    if (!xs) continue;
    const F = DUO.fx[d.kind];
    for (const x of xs) add(x.hero, F);
  }
  cache.set(D, { day: s.day, n: s.staff.length, k: keys.length, fx });
  return fx;
}
/** 持ち場の速さの倍率（model.ts の speed） */
export const duoSpeed = (s: P1State, hero: number) => fxMap(s)?.get(hero)?.speed ?? 1;
/** 1 日に減るスタミナの倍率（model.ts の drainOf） */
export const duoDrain = (s: P1State, hero: number) => fxMap(s)?.get(hero)?.drain ?? 1;
/** 士気の寄り先に足す点（hr.ts の moraleParts） */
export const duoMorale = (s: P1State, hero: number) => fxMap(s)?.get(hero)?.morale ?? 0;
/** テスト：効き目の数え直し（同じ日のうちに配置を変えたとき） */
export const duoFlush = (s: P1State) => s.duo && cache.delete(s.duo);

// ---------------------------------------------------------------- 見つける（月の締め）・選ぶ

const lastRev = (s: P1State) => Math.max(0, s.reports[s.reports.length - 1]?.revenue ?? 0);
const amt = (s: P1State, p: number) => Math.max(DUO.minCost, Math.round((lastRev(s) * p) / 10) * 10);
/** 選択肢（種類ごと）と見込み（G。速さは作る速さと同じ換算・士気はできごとと同じ換算） */
function optsOf(s: P1State, d: DuoDef): DuoOpt[] {
  const M = lastRev(s);
  const n = d.heroes.length;
  const share = n / Math.max(n, s.staff.length);
  const sp = (mul: number, days: number) => M * (mul - 1) * (days / 30) * EVENT.conv.craft * share;
  const mo = (pt: number) => pt * EVENT.val.morale * 0.3 * M * n;
  const O = DUO.opt;
  const F = DUO.fx[d.kind];
  switch (d.kind) {
    case 'rival':
      return [
        { id: 'compete', cost: 0, ev: Math.round(sp(O.compete.speed, O.compete.days) - sp(O.compete.drain, O.compete.days) * 0.25) },
        { id: 'apart', cost: 0, ev: Math.round(mo(O.apart.morale) - sp(F.speed, 90) + sp(F.drain, 90) * 0.25) },
        { id: 'keep', cost: 0, ev: 0, light: true },
      ];
    case 'tension': {
      const c = amt(s, O.talk.cost);
      return [
        { id: 'talk', cost: c, ev: Math.round(-c + mo(O.talk.morale) + mo(-F.morale) * 3) },
        { id: 'push', cost: 0, ev: Math.round(sp(O.push.speed, O.push.days) + mo(O.push.morale)) },
        { id: 'keep', cost: 0, ev: 0, light: true },
      ];
    }
    default: {
      const c = amt(s, O.party.cost);
      return [
        { id: 'team', cost: 0, ev: Math.round(sp(O.team.speed, O.team.days)) },
        { id: 'party', cost: c, ev: Math.round(-c + mo(O.party.morale)) },
        { id: 'keep', cost: 0, ev: 0, light: true },
      ];
    }
  }
}
/**
 * この締めに組み合わせを見つけるか（見つけたら記録して、カードの中身を返す）。1 か月目（チュートリアル）・止めているとき・
 * この締めのカードの上限を使いきったときは出さない。1 回の締めで 1 つまで（DUOS の順）
 */
export function duoDue(s: P1State, popN: number, inTut: boolean): DuoData | null {
  if (P2_OFF.duo || inTut || s.reports.length < DUO.first) return null;
  if (popN >= CARD.cap[s.tier ?? 'C']) return null;
  const D = duoOf(s);
  for (const d of DUOS) {
    if (D.found[d.id]) continue;
    const xs = duoMet(s, d);
    if (!xs) continue;
    D.found[d.id] = { day: s.day, mk: s.cards?.mk ?? 0 };
    D.stat.made++;
    return { id: d.id, heroes: xs.map((x) => x.hero), opts: optsOf(s, d) };
  }
  return null;
}
/** 撮影・テスト用：条件に関係なく、その組み合わせのカードの中身を作る（記録はしない）。そろっていなければ null */
export function duoDemo(s: P1State, id: string): DuoData | null {
  const d = DUO_BY_ID[id];
  const xs = d ? members(s, d) : null;
  return d && xs ? { id, heroes: xs.map((x) => x.hero), opts: optsOf(s, d) } : null;
}
/** おすすめ：払えるもののうち見込みのいちばん大きい手 */
export function duoRec(s: P1State, x: DuoData): number {
  let best = -1;
  x.opts.forEach((o, k) => {
    if (o.cost > s.money) return;
    if (best < 0 || o.ev > x.opts[best].ev) best = k;
  });
  return best < 0 ? x.opts.findIndex((o) => o.light) : best;
}
/** カードの下書き（話し手は 1 人目。上限の残りは duoDue で確かめてあるので、いつも時間を止めて出す） */
export function duoDraft(s: P1State, x: DuoData): Draft {
  const rec = duoRec(s, x);
  return {
    src: 'duo',
    kind: `duo:${x.id}`,
    hero: x.heroes[0] ?? null,
    q: DELEG.q.lo,
    dept: null,
    issue: { k: 'duo' },
    duo: x,
    choices: x.opts.map((o, i) => ({ act: { k: 'duo', i }, est: o.ev, cost: o.cost, rec: i === rec })),
    pri: 94,
    force: true,
  };
}
/** 選んだ手を打つ。打てなければ理由 */
export function applyDuo(s: P1State, x: DuoData, k: number): string | null {
  const o = x.opts[k];
  const d = DUO_BY_ID[x.id];
  if (!o || !d) return 'none';
  if (o.cost > s.money) return 'money';
  const D = duoOf(s);
  const r = (D.found[x.id] ??= { day: s.day, mk: s.cards?.mk ?? 0 });
  if (o.cost > 0) {
    s.money -= o.cost;
    spend(s, 'ads', o.cost, 'other');
  }
  const O = DUO.opt;
  const crew = x.heroes.map((h) => s.staff.find((y) => y.hero === h)).filter((y): y is Staff => !!y);
  const boost = (speed: number, days: number, drain = 1) => Object.assign(r, { until: s.day + days, speed, drain });
  switch (o.id) {
    case 'team':
      boost(O.team.speed, O.team.days);
      break;
    case 'party':
      for (const st of crew) moraleAdd(s, st, O.party.morale);
      break;
    case 'compete':
      boost(O.compete.speed, O.compete.days, O.compete.drain);
      break;
    case 'apart':
      r.off = true;
      for (const st of crew) moraleAdd(s, st, O.apart.morale);
      break;
    case 'talk':
      r.off = true;
      for (const st of crew) moraleAdd(s, st, O.talk.morale);
      break;
    case 'push':
      boost(O.push.speed, O.push.days);
      for (const st of crew) moraleAdd(s, st, O.push.morale);
      break;
    case 'keep':
      break;
  }
  r.opt = o.id;
  D.stat.opt[o.id] = (D.stat.opt[o.id] ?? 0) + 1;
  duoFlush(s);
  return null;
}

// ---------------------------------------------------------------- 図鑑（トロフィー（段 UI6）につなげる：id と見つけた日）

export interface DexRow {
  id: string;
  found: boolean;
  day?: number;
  def: DuoDef;
}
export const duoDex = (s: Pick<P1State, 'duo'>): DexRow[] => DUOS.map((def) => ({ id: def.id, found: !!s.duo?.found[def.id], day: s.duo?.found[def.id]?.day, def }));
export const duoFoundN = (s: Pick<P1State, 'duo'>) => DUOS.filter((d) => s.duo?.found[d.id]).length;
/** その人が入っている組み合わせ（調査の id で） */
export const duosOfHero = (hero: number): DuoDef[] => {
  const b = baseId(hero);
  return b == null ? [] : BY_HERO.get(b) ?? [];
};

// ---------------------------------------------------------------- 文

const nm = (id: number) => {
  const h = heroById.get(id) as { name?: string; nameEn?: string } | undefined;
  return (isEn ? h?.nameEn : h?.name) ?? `#${id}`;
};
export const KIND_ICON: Record<DuoKind, string> = { ally: '🤝', kin: '👪', mentor: '📜', rival: '⚔', tension: '🌩' };
export const kindName = (k: DuoKind) => ({ ally: t('盟友', 'Allies'), kin: t('家族', 'Family'), mentor: t('師弟', 'Teacher & student'), rival: t('宿敵', 'Rivals'), tension: t('緊張', 'Tension') })[k];
export const condName = (c: DuoCond) => ({ company: t('同じ会社にいる', 'In the same company'), town: t('同じ町で働く', 'Working in the same town'), team: t('同じ部門で働く', 'In the same department'), boss: t('部長とその部門の部下', 'A head and someone in their department') })[c];
/** 効き目の短い文（図鑑） */
export function fxText(k: DuoKind): string {
  const F = DUO.fx[k];
  const xs: string[] = [];
  if (F.morale) xs.push(t(`士気 ${F.morale > 0 ? '+' : '−'}${Math.abs(F.morale)}`, `morale ${F.morale > 0 ? '+' : '−'}${Math.abs(F.morale)}`));
  if (F.speed !== 1) xs.push(t(`速さ ×${F.speed}`, `speed ×${F.speed}`));
  if (F.drain !== 1) xs.push(t(`疲れ ×${F.drain}`, `fatigue ×${F.drain}`));
  return xs.join(t('・', ' · '));
}
/** 会話の枚（画面。who はいまの会社のヒーローの id） */
export function duoPages(x: DuoData): { who: number; text: string }[] {
  const d = DUO_BY_ID[x.id];
  if (!d) return [];
  return duoTalk(x.id).map((p) => ({ who: x.heroes[d.heroes.indexOf(p.who)] ?? p.who, text: p.text() }));
}
/** 見出し（カードの名前の行・小さい一行） */
export function duoHead(x: DuoData): { title: string; tag: string } {
  const d = DUO_BY_ID[x.id];
  return { title: `${KIND_ICON[d.kind]} ${d.name()}`, tag: t(`ヒーローの組み合わせ（${kindName(d.kind)}）・${condName(d.cond)}`, `Hero pairing (${kindName(d.kind)}) · ${condName(d.cond)}`) };
}
/** 課題のセリフ（話し手＝1 人目の口調。声があれば社長の呼び方） */
export function duoSay(x: DuoData): string {
  const d = DUO_BY_ID[x.id];
  const others = x.heroes.slice(1).map(nm).join(t('・', ' and '));
  const place = { company: t('会社', 'company'), town: t('町', 'town'), team: t('部門', 'department'), boss: t('部門', 'department') }[d.cond];
  const core = {
    ally: t(`[[${others}]]と同じ${place}になった。力を合わせてみたい`, `[[${others}]] and I are in the same ${place}. We want to join forces`),
    kin: t(`[[${others}]]と同じ${place}になった。家族で手を組みたい`, `[[${others}]] and I are in the same ${place}. Family should work together`),
    mentor: t(`[[${others}]]とまた一緒に働ける。教えを仕事に活かしたい`, `I get to work with [[${others}]] again. I want to put the lessons to use`),
    rival: t(`[[${others}]]と同じ${place}になった。負けるわけにはいかない`, `[[${others}]] is in my ${place}. I cannot lose`),
    tension: t(`[[${others}]]とは仕事の進め方が合わない。配置を考えてほしい`, `[[${others}]] and I work very differently. Please think about our placement`),
  }[d.kind];
  const who = x.heroes[0];
  return voiceSay(who, core) ?? heroSay(who, core);
}
/** 選択肢の文（1 行目・アイコン） */
export function duoOptText(x: DuoData, o: DuoOpt): { icon: string; label: string } {
  const n = x.heroes.length;
  switch (o.id) {
    case 'team':
      return { icon: '🤝', label: n > 2 ? t('三人で組ませる', 'Team the three up') : t('二人で組ませる', 'Team them up') };
    case 'party':
      return { icon: '🍵', label: t('ささやかな祝いの席を設ける', 'Hold a small welcome gathering') };
    case 'compete':
      return { icon: '⚔', label: t('競わせてみる', 'Let them compete') };
    case 'apart':
      return { icon: '🧭', label: t('持ち場の線を引いて、ぶつからないようにする', 'Draw clear lines so they don’t clash') };
    case 'talk':
      return { icon: '☕', label: t('間に入って話し合う', 'Sit down and talk it through') };
    case 'push':
      return { icon: '💪', label: t('あえていまの形で任せる', 'Keep them as they are, on purpose') };
    case 'keep':
      return { icon: '👀', label: t('いまのままで', 'Leave it for now') };
  }
}
const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
const sgn = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
/** 選択肢の 2 行目（費用・効き目・見込み。「・」で区切る） */
export function duoOptSub(x: DuoData, o: DuoOpt): string {
  const d = DUO_BY_ID[x.id];
  const O = DUO.opt;
  const F = DUO.fx[d.kind];
  const xs: string[] = [];
  if (o.cost > 0) xs.push(g(o.cost));
  switch (o.id) {
    case 'team':
      xs.push(t(`速さ ×${O.team.speed}（${O.team.days} 日）`, `Speed ×${O.team.speed} (${O.team.days}d)`));
      break;
    case 'party':
      xs.push(t(`本人たちの士気 +${O.party.morale}`, `Their morale +${O.party.morale}`));
      break;
    case 'compete':
      xs.push(t(`速さ ×${O.compete.speed}・疲れ ×${O.compete.drain}（${O.compete.days} 日）`, `Speed ×${O.compete.speed} · fatigue ×${O.compete.drain} (${O.compete.days}d)`));
      break;
    case 'apart':
      xs.push(t(`いつもの効き目（${fxText(d.kind)}）を止める・士気 +${O.apart.morale}`, `Stops the usual effect (${fxText(d.kind)}) · morale +${O.apart.morale}`));
      break;
    case 'talk':
      xs.push(t(`わだかまりが解ける（士気 −${Math.abs(F.morale)} が止まる）・士気 +${O.talk.morale}`, `Clears the air (no more morale −${Math.abs(F.morale)}) · morale +${O.talk.morale}`));
      break;
    case 'push':
      xs.push(t(`速さ ×${O.push.speed}（${O.push.days} 日）・士気 ${sgn(O.push.morale)}`, `Speed ×${O.push.speed} (${O.push.days}d) · morale ${sgn(O.push.morale)}`));
      break;
    case 'keep':
      xs.push(fxText(d.kind) ? t(`いつもの効き目のまま（${fxText(d.kind)}）`, `Usual effect stays (${fxText(d.kind)})`) : t('何も起きない', 'Nothing happens'));
      break;
  }
  xs.push(t(`見込み ${sgn(o.ev)} G`, `Est. ${sgn(o.ev)} G`));
  return xs.join(t('・', ' · '));
}
