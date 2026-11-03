/**
 * マインちゃんのメッセージ（段 UI2。docs/ISLAND_PHASE1.md「マインちゃんのメッセージ（UI2）」）。ここは DOM を持たない決まりごと。
 * - 言葉はセリフ（会話 `talk`）にまとめる。1 枚 TALK_MAX 字まで（空白と [[ ]] を除く日本語の字数）。会話のあいだは時間が止まり、セリフ送りだけ。
 * - 地図の吹き出しは、チュートリアル（タオックスの 1 か月目）と、発掘との出会いの「押す場所」の案内だけ（bubbleKind）。
 *   2 か月目からは、上の帯の「詰まり」の札（chipOf）と、ヒーローの提案のカード（段 UI1）に任せる。
 * - 画面の中のマインちゃんの一言は、残すものも 1 行・LINE_MAX 字まで。
 * - 会話は、月次報告・シート・カード・ほかの会話が開いているあいだは待つ（talkWaits）。部門の紹介は到着の案内のあと、1 日に 1 つずつ（deptTalkNext）。
 * 画面は main.ts（talk・吹き出し・上の帯の札）。
 */
import { isEn, t } from '../../i18n';
import { heroById } from '../../game/catalog';
import { introFirstStep, P1B, type Tier } from './data';
import { sectorDef, tierLabel } from './company';
import { digMet, meetTip, topicsPage } from './digmeet';
import { has, jamOf, stallOf, myShops, myWorkshop, rivalMonthGuess, type P1State, type Stage } from './model';
import { ruinsOf } from './reset';
import { menuDepts } from './dept';
import { budgetOpen } from './budget';

/** 会話の 1 枚の字数の上限（空白と [[ ]] を除く） */
export const TALK_MAX = 60;
/** 画面の中のマインちゃんの一言（残すもの）の字数の上限 */
export const LINE_MAX = 30;

/** 字数：空白と [[ ]] を除いた字の数（絵文字・記号も 1 字） */
export const talkLen = (x: string) => [...x.replace(/\s|\[\[|\]\]/g, '')].length;

const money = (n: number) => `${Math.round(n).toLocaleString('en-US')} G`;
const nameOf = (id: number) => {
  const x = heroById.get(id);
  return x ? (isEn ? x.nameEn : x.name) : `#${id}`;
};

// ---------------------------------------------------------------- 初売上までの流れの案内（チュートリアル。main.ts の tour*。文はそのまま）

export type TourKey = 'intro' | 'buy' | 'craft' | 'haul' | 'look' | 'inside' | 'end';
export type TourEv = 'made' | 'dropped' | 'sold';
export interface TourStage {
  key: TourKey;
  label: string;
  /** はじめの一言・できごとのあとの一言 */
  say: string;
  then?: string;
  /** 待つできごと（無ければ一言を読む時間だけ） */
  wait?: TourEv;
  /** ゲームの速さ（できごとを待つあいだ） */
  speed: number;
}
export const TOUR: TourStage[] = [
  { key: 'intro', label: '', say: t('準備ばっちり！ ここから、エクステが売れるまでの流れを一緒に見てみよう。', 'All set! Let’s watch how an Extension gets from start to sale.'), speed: 0 },
  { key: 'buy', label: t('① 調達', '① Buy'), say: t('まずは[[① 調達]]。卸問屋から、工房へ素材が届くよ。', 'First, [[① Buy]]: materials travel from the wholesaler to the workshop.'), then: t('素材がないと、工房は何も作れないんだ。', 'Without materials, the workshop can’t make anything.'), speed: 0.3 },
  { key: 'craft', label: t('② 製造', '② Craft'), say: t('[[② 製造]]。職人が作業台でセンスを作っているよ。建物のまわりの輪が一周したら、できあがり！', '[[② Craft]]: the crafter is making Sensu. When the ring around the building completes, a batch is done!'), then: t('できた！ 作るには、何日か時間がかかるんだね。', 'Done! Crafting takes a few days.'), wait: 'made', speed: 1 },
  { key: 'haul', label: t('③ 物流', '③ Haul'), say: t('[[③ 物流]]。運搬係が工房を出て、道路を通ってお店まで荷車を押していくよ。', '[[③ Haul]]: the hauler leaves the workshop and pushes the cart along the road to the shop.'), then: t('お店に着いた！ 遠いお店ほど、運ぶのに日数がかかるよ。', 'Delivered! The farther the shop, the longer it takes.'), wait: 'dropped', speed: 0.5 },
  { key: 'look', label: t('④ 販売', '④ Sell'), say: t('[[④ 販売]]。お店に注目！ 届いた商品を目当てに、お客さんが入っていくよ。', '[[④ Sell]]: watch the shop! Customers are heading in.'), then: t('[[お店]]をタップして、中をのぞいてみよう！', 'Tap the [[shop]] to look inside!'), speed: 0 },
  { key: 'inside', label: t('④ 販売', '④ Sell'), say: t('店員が商品を棚に並べて、お客さんを待っているよ。お客さんが手に取って、レジに来るかな？', 'The clerk shelves the goods and waits. Will a customer pick one up and pay?'), then: t('売れた！ お客さんがレジでお金を払ってくれて、はじめて売上になるんだ。', 'Sold! Sales only happen when a customer pays at the register.'), wait: 'sold', speed: 2 },
  { key: 'end', label: '', say: t('① 調達 → ② 製造 → ③ 物流 → ④ 販売。どれか 1 つでも止まると、売上も止まるよ。', '① Buy → ② Craft → ③ Haul → ④ Sell. If any one stops, sales stop too.'), speed: 0 },
];
/**
 * 流れの案内の段の進み：say（はじめの一言。時間は止まる）→ watch（できごとを待つ）→ then（できごとのあとの一言）
 */
export type TourPhase = 'say' | 'watch' | 'then';

/** チュートリアル：人材登用のアンロック（文はそのまま） */
export const HIRE_LINES = () => [
  t('[[人材登用]]がアンロックされたよ！ これでヒーローを雇えるね。', '[[Recruiting]] is unlocked! Now we can hire heroes.'),
  t('さっそく、素材を買い付けてくれる[[調達]]が得意なヒーローを雇おう！', 'Let’s hire a hero who’s good at [[buying]] materials right away!'),
];
/** チュートリアル：研究ポイントの説明の 1 枚（人材の募集の段。文はそのまま） */
export const RP_LINE = (rp: number) => t(`人材の募集は[[研究ポイント]]で開くパネルだよ。私の前の世界の研究ノートから、[[${rp} RP]] を持ってきたんだ！`, `Recruiting is unlocked with [[research points]]. I brought [[${rp} RP]] from my research notes from my old world!`);

// ---------------------------------------------------------------- 画面の中のマインちゃんの一言（残すもの。1 行・LINE_MAX 字まで）

/** 月次報告：売上 0 の月の発表 */
export const ZERO_LINE = () => t('今月は売れなかった…。お店に品と店員はいる？', 'Nothing sold… Are goods and a clerk in the shop?');
/** ランクアップの進出の確認：寄付を勧める（ボタン「寄付パネルを開く」） */
export const DONATE_LINE = () => t('お金は徴収されるよ。先に[[研究への寄付]]で RP に！', 'Funds get levied. [[Donate]] them to research first!');

// ---------------------------------------------------------------- 会話の文（チュートリアルのほか）

/** 資金が少ない（1 回だけ。ボタン「バイトを探す」） */
export const SIDE_LINES = () => [
  t('資金が少なくなってきたね……。このままだと、素材もお給料も払えなくなっちゃう。', 'Funds are getting low… Soon we can’t pay for materials or wages.'),
  t('ヒーローに[[他店でバイト]]してもらおう！ 日給がもらえて、腕が上がることもあるよ。', 'Send heroes to [[work part-time]] at other stores! They earn a daily wage and might even improve.'),
];
/** 関所を開けた（ボタン「ランドマップへ」） */
export const GATE_LINES = (toll: number) => [
  t(`通行料 ${money(toll)} を納めて、[[関所]]が開いたよ！ この先には新しい[[ランドセクタ]]が広がっているよ。`, `You paid the ${money(toll)} toll and the [[gate]] is open! New [[land sectors]] lie beyond.`),
  t('ほかのセクタに出店すると、ここは[[セクター長]]に任せるよ。まずは[[ランドマップ]]を見よう！', 'Open in another sector and a [[sector head]] runs this one. First, look at the [[land map]]!'),
];
/** 荒れ地が初めて復興した */
export const REVIVE_LINE = () => t('荒れ地が[[復興]]したよ！ 建物を建てられるし、住む人も増えるよ。', 'The wasteland is [[revived]]! You can build here, and more people will live here.');
/** 初めてダンジョンの入り口が見つかった */
export const DUNGEON_LINE = () => t('荒れ地の底に[[ダンジョン]]があった！ 奥ほど珍しい遺物が眠っているよ。入り口をタップしよう！', 'A [[dungeon]] lay beneath the wasteland! Rarer relics sleep deeper. Tap the entrance!');
/** 遺物の展示館を建てられるようになった（ボタン「建築を開く」） */
export const MUSEUM_LINE = () => t('復興した土地に[[遺物の展示館]]を建てよう！ 遺物を飾ると、お客さんが見に来るよ。', 'Build a [[relic museum]] on revived land! Visitors come to see your relics.');
/** 初めて復刻品のレシピが開いた（ボタン「工房で作る」） */
export const RELIC_LINE = () => t('昔の作り方が分かった！ [[復刻品]]はしばらく他社が作れない。いまのうちに売り込もう！', 'We learned the old recipe! No rival can make this [[revival]] for a while. Sell it now!');
/** 最初の月次報告のあと（ボタン「ランキングを見る」）。もとは顔つきのモーダル（151 字） */
export const RANK_LINES = () => [
  t('はじめての売上報告、おつかれさま！ 月の売上は[[企業ランキング]]で他社と比べられるよ。', 'Well done on your first sales report! The [[company ranking]] compares monthly sales.'),
  t('目標は、同じエリアの他社を抜いて[[2 か月続けてエリア 1 位]]（制覇）！', 'Your goal: beat the rivals in your area and hold [[#1 two months running]]!'),
];
/** 初めての制覇（フェーズ 1 クリア！）の文 */
export const CLEAR_LINE = (toll: number) => t(`2 か月続けて 1 位、研究も発表して[[制覇]]！ ふちの[[関所]]は通行料 ${money(toll)} で開くよ。`, `#1 two months running and findings presented — [[conquered]]! The [[gate]] opens for ${money(toll)}.`);
/** ランド制覇の文（ランクごと） */
export const LAND_CLEAR_LINE = (tier: Tier, n: number) =>
  tier === 'C'
    ? t(`Common の ${n} つのセクタすべてで 1 位！ 次は Uncommon で、アンコモンを並べて 1 位を目指そう。`, `#1 in all ${n} Common sectors! Next, Uncommon sectors with Uncommon goods.`)
    : tier === 'U'
      ? t(`Uncommon の ${n} つのセクタすべてで 1 位！ 次は Rare で、アンコモンと復刻品で勝負しよう。`, `#1 in all ${n} Uncommon sectors! Next, Rare sectors with Uncommons and revivals.`)
      : tier === 'R'
        ? t(`Rare の ${n} つのセクタすべてで 1 位！ 次は Epic で、復刻品と骨董で勝負しよう。`, `#1 in all ${n} Rare sectors! Next, Epic sectors with revivals and antiques.`)
        : t(`Epic の ${n} つのセクタすべてで 1 位！ Legendary の都は、まだ雲の向こう。`, `#1 in all ${n} Epic sectors! The Legendary capital is still beyond the clouds.`);

// ---------------------------------------------------------------- 到着の案内（2 か所目のセクタから）

/** ランクアップの災害のあとの 1 枚（Rare・Epic は町の違いの 1 枚とまとめる） */
export const RESET_LINE = () => t('ここからまた一から！ でも[[研究ポイント]]とヒーローはそのまま。前の町の[[復興]]は任せられるよ。', 'Starting over! Your [[research points]] and heroes stay. You can leave the old towns’ [[recovery]] to a hero.');
export const RESET_RARE = () => t('また一から！ この町は他社の店がひしめいている。お客さんは[[近くの店]]へ行くから、[[商圏]]を取り合おう！', 'Starting over! Rival stores crowd this town. Customers go to [[nearby stores]], so fight over [[trade areas]]!');
export const RESET_EPIC = () => t('また一から！ この町では[[復刻品]]が[[骨董]]として高く売れるよ。他社の店は[[買収]]もできるの。', 'Starting over! Here [[revivals]] sell high as [[antiques]], and rival stores can be [[acquired]].');
/** 被災した町に初めて戻ったとき（1 回だけ） */
export const RUIN_LINE = () => t('[[廃墟]]をタップすると修繕できるよ。手で直すほうが安上がり！', 'Tap a [[ruin]] to repair it. Fixing it by hand is cheaper!');
/** 前のセクタを任せた */
export const MANAGER_LINE = (name: string) => t(`前の町は[[${name}]]に任せたよ。結果は[[ランドマップ]]と[[決算書]]で見られるよ。`, `[[${name}]] runs the previous town. See results on the [[land map]] and in [[Statements]].`);

/** 到着の案内の 1 枚。kind：research（「市場データを開く」ボタン）・topic（お題のエクステの絵） */
export interface ArrivePage {
  text: string;
  kind?: 'research' | 'topic';
}

/** いまのセクタの到着の案内をまだ見ていない（最初のセクタ・タオックスは最初のチュートリアルがあるので出さない） */
export const needsIntro = (s: Pick<P1State, 'sector' | 'flags'>) => {
  const id = s.sector ?? 'c1';
  return id !== 'c1' && sectorDef(id).profile.intro.length > 0 && !(s.flags.sectorIntro ?? []).includes(id);
};

/** 到着の案内（目標 → 違い → お題 → 最初の一手）。目標の枚には 1 位の他社の月の売上の見込み */
export function introPages(s: P1State): ArrivePage[] {
  const d = sectorDef(s.sector ?? 'c1');
  const top = Math.max(0, ...Object.values(rivalMonthGuess(s)));
  const intro = d.profile.intro;
  // お題の 1 枚（発掘と出会ったあと。最初の一手の前）
  const topic = digMet(s) ? topicsPage(d.id) : null;
  return [
    { text: intro[0].split('{top}').join(money(Math.round(top / 100) * 100)) },
    ...intro.slice(1, -1).map((text): ArrivePage => ({ text, kind: 'research' })),
    ...(topic ? [{ text: topic, kind: 'topic' as const }] : []),
    { text: introFirstStep(d.tier as Tier, has(s, 'pot')) },
  ];
}

/**
 * 移ったあとの案内の枚（到着の案内・戻ってきた・セクター長）。
 * intro：到着の案内（main.ts は showIntro で出す）。ruin：被災した町に初めて戻った（main.ts が flags.ruinTalk を立てる）
 */
export function arrivalPages(s: P1State, o: { target: string; fresh: boolean; manager: number | null; reset: boolean }): { pages: ArrivePage[]; intro: boolean; ruin: boolean } {
  const d = sectorDef(o.target);
  const head: ArrivePage[] = [];
  // ランクアップの災害のあと：Rare・Epic の町は、町の違い（商圏・骨董）とまとめて 1 枚
  if (o.reset) head.push({ text: o.fresh && d.tier === 'R' ? RESET_RARE() : o.fresh && d.tier === 'E' ? RESET_EPIC() : RESET_LINE() });
  const ruin = !o.fresh && ruinsOf(s).length > 0 && !s.flags.ruinTalk;
  const mgr: ArrivePage[] = o.manager != null ? [{ text: MANAGER_LINE(nameOf(o.manager)) }] : [];
  if (needsIntro(s)) {
    const pages = [...head, ...introPages(s)];
    pages.splice(pages.length - 1, 0, ...mgr);
    return { pages, intro: true, ruin: false };
  }
  const pages: ArrivePage[] = [...head];
  if (o.fresh) {
    pages.push({ text: t(`[[${d.name}]]の出店許可がおりたよ！ ここは${tierLabel(d.tier)}。`, `We got the permit for [[${d.name}]]! It is a ${tierLabel(d.tier)}.`) });
    if (d.tier !== 'C') pages.push({ text: t('ここは Common の商品があまり売れないんだ。[[アンコモン]]を並べられるように急ごう！', 'Common goods barely sell here. Hurry to stock [[Uncommons]]!') });
    pages.push({ text: t('建物はセクタごと。まずは[[工房]]を建てよう。資金・ヒーロー・スキルは会社でいっしょだよ。', 'Buildings belong to each sector. Build a [[workshop]] first. Funds, heroes and skills are shared.') });
  } else if (ruinsOf(s).length) pages.push({ text: t(`[[${d.name}]]に戻ってきたよ。壊れた建物が[[廃墟]]のまま残っている…（${ruinsOf(s).length} 軒）`, `Back in [[${d.name}]]. The wrecked buildings are still [[ruins]]… (${ruinsOf(s).length})`) });
  else pages.push({ text: t(`[[${d.name}]]に戻ってきたよ。建物も担当も、離れたときのままだよ。`, `Back in [[${d.name}]]. Buildings and jobs are as you left them.`) });
  if (ruin) pages.push({ text: RUIN_LINE() });
  pages.push(...mgr);
  return { pages, intro: false, ruin };
}

// ---------------------------------------------------------------- 会話を出してよいか

/** いまの画面の様子（main.ts が DOM から作る） */
export interface TalkUi {
  /** マインちゃんの会話が出ている */
  talk: boolean;
  /** 提案・報告のカード（段 UI1）が出ている */
  card: boolean;
  /** 月次報告（発表の演出・シート）・まとめ報告が出ている */
  report: boolean;
  /** 画面（シート）が開いている */
  sheet: boolean;
  /** 顔つきのモーダルなど、ほかの窓が出ている */
  modal: boolean;
  /** 建てる・置くモード */
  placing: boolean;
  /** 流れの案内（チュートリアル） */
  tour: boolean;
  /** 災害と協定書の演出 */
  disaster: boolean;
  /** セクタを移っている途中 */
  moving: boolean;
}
export const freeUi = (): TalkUi => ({ talk: false, card: false, report: false, sheet: false, modal: false, placing: false, tour: false, disaster: false, moving: false });

/**
 * 会話を待たせる：ほかの会話・カード・月次報告・災害の演出・移動中は、いつも待つ。
 * over（チュートリアルの「画面を開いたままの説明」）でなければ、画面・窓・置くモード・流れの案内のあいだも待つ
 */
export const talkWaits = (ui: TalkUi, over = false) => ui.talk || ui.card || ui.report || ui.disaster || ui.moving || (!over && (ui.sheet || ui.modal || ui.placing || ui.tour));

/** 部門の紹介の会話 */
export type DeptTalk = 'acct' | 'cs' | 'sales' | 'legal' | 'foot' | 'budget';

/**
 * 次に出してよい部門の紹介（無ければ null）。
 * 到着の案内・災害の演出・移動が終わってから、会話・画面・カード・月次報告が無いとき。
 * 1 日に 1 つずつ：到着の案内か、ほかの紹介を出した日（flags.talkDay）には出さない（Uncommon に着いた日に 12 枚続いていた）
 */
export function deptTalkNext(s: P1State, ui: TalkUi, o: { intro: boolean; reset: boolean }): DeptTalk | null {
  if ((typeof s.tut === 'number' && s.tut < 99) || talkWaits(ui) || o.intro || o.reset) return null;
  if ((s.flags.talkDay ?? -1) >= s.day) return null;
  const depts = s.flags.depts ?? [];
  const tier = s.tier ?? 'C';
  // 段 UI5b：下の帯がグループ（事業・戦略・管理・基盤）になった（部門が 7 つ以上。Uncommon に着いたとき）：いちばん先に、帯の変わり方の説明
  if (!s.flags.footTalk && menuDepts(s).length > 6) return 'foot';
  if (!s.flags.legalTalk && depts.includes('legal') && tier === 'E') return 'legal';
  if (!s.flags.salesTalk && !!s.area && depts.includes('sales')) return 'sales';
  // 段 I1：Rare に届いたら「予算で任せる」の紹介（営業の紹介のあと）
  if (!s.flags.budgetTalk && s.flags.salesTalk && budgetOpen(s)) return 'budget';
  if (!s.flags.acctTalk && depts.includes('accounting') && tier !== 'C') return 'acct';
  if (!s.flags.csTalk && s.flags.acctTalk && depts.includes('support') && tier !== 'C') return 'cs';
  return null;
}

/** 段 I1：予算で任せるの紹介（2 枚・60 字まで） */
export const BUDGET_TALK = () => [
  t('Rare まで来たね！ここからは[[全部の部門]]に部長を置いて、[[月の予算]]を渡して任せられるよ。', 'You made it to Rare! Now you can put a head in [[every department]] and hand them a [[monthly budget]].'),
  t('部長は予算と[[従業員]]の手で施策を打つの。足りないときは「予算を増やして」って頼みに来るよ。', 'Heads spend it on moves with their [[staff]]. When it runs short, they’ll come asking for more.'),
];
/**
 * 段 UI5b：下の帯がグループの帯になったときのマインちゃんの説明（2 枚・60 字まで）。会話のあと、人事の入っているグループ（管理）を光らせる（main.ts の footGuide）
 */
export const FOOT_TALK = () => [
  t('部門が増えたから、下の帯は[[事業・戦略・管理・基盤]]の 4 つのグループにまとめたよ。真ん中は[[経営企画]]のまま。', 'With more departments, the bottom bar now groups them into [[Business, Strategy, Admin and Base]]. [[Strategy]] stays in the middle.'),
  t('グループを押すと部門が並ぶの。人を雇う[[人事]]は[[管理]]の中。光っている[[管理]]を押してみて！', 'Tap a group to see its departments. [[HR]], for hiring, is under [[Admin]]. Try the glowing [[Admin]]!'),
];

// ---------------------------------------------------------------- 地図の吹き出し・上の帯の「詰まり」の札

/**
 * 地図の吹き出しを出すか：チュートリアル（タオックスの 1 か月目）の案内と、発掘との出会いの「押す場所」の案内だけ。
 * 2 か月目からのほかの助言（月末ポーズの「懐中時計を押して」・販売の詰まり・作業台・依頼・税など）は出さない
 */
export function bubbleKind(s: P1State): 'tut' | 'meet' | null {
  if (typeof s.tut === 'number' && s.tut < 99) return 'tut';
  if (meetTip(s)) return 'meet';
  return null;
}

/** 上の帯の札：課題ありの段（SCM の詰まりと同じ jamOf。流れが止まっていれば stallOf）か、まだ無い建物（工房・お店）。段 UI5a で「詰まり」→「課題あり」 */
export type Chip = { k: 'jam'; stage: Stage } | { k: 'ws' } | { k: 'shop' };
export function chipOf(s: P1State): Chip | null {
  if (typeof s.tut === 'number' && s.tut < 99) return null;
  const mine = s.buildings.filter((b) => b.owner === 'me');
  if (!myWorkshop(s)) return mine.some((b) => b.id === 'workshop') ? null : { k: 'ws' };
  if (!myShops(s).length) return mine.some((b) => P1B[b.id]?.kind === 'shop' && b.left > 0) ? null : { k: 'shop' };
  // 段 UI5a：流れが止まっていれば、いちばん上流の止まっている段（宣伝を勧めないように。月次報告の「課題あり」と同じ）
  // （締めの報告で止まっていて、いまも止まっているときだけ。月の途中の一瞬の止まりでは替えない）
  const st = s.reports[s.reports.length - 1]?.stall ? stallOf(s) : null;
  return { k: 'jam', stage: st?.stage ?? jamOf(s) };
}
/** 詰まりの段から、その段の提案のカードを出すヒーロー（段 UI1 の出どころ） */
export const CHIP_SRC: Record<Stage, 'buyer' | 'crafter' | 'clerk' | null> = { buy: 'buyer', craft: 'crafter', haul: null, sell: 'clerk' };
