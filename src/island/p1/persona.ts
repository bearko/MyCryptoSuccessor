/**
 * ヒーローの個性（段 UI1。DOM なし）：MCH の属性（catalog の attributes）と陣営（faction）から、口調の型・口ぐせ・性格の一言を決める。
 * 386 体すべてに型がある（属性の無いヒーローは陣営で決まる）。名前の由来や実在の人物の評価は書かない（属性の言葉から作る一般的な性格だけ）。
 * カードのセリフは「型の言い出し ＋ 課題（数字つき）＋ 型の語尾」で、[[ ]] を除いて CARD.sayMax 字まで（超えたら言い出しを落とす）。
 * これとは別に、型と属性から選ぶウィットの一言（quipOf。30 字まで）を添える（課題の種類・月で回す）。
 * 仕様は docs/ISLAND_PHASE1.md「ヒーローの個性」。
 */
import { isEn, t } from '../../i18n';
import { heroById } from '../../game/catalog';
import { CARD } from './data';

/** 口調の型（8 種）。言い出し（pre）・語尾（suf）は課題のセリフに、決まり文句（tag）はウィットの一言の候補に入る */
export type Tone = 'scholar' | 'warrior' | 'leader' | 'polite' | 'cheer' | 'merchant' | 'easy' | 'quiet';
export const TONES: Tone[] = ['scholar', 'warrior', 'leader', 'polite', 'cheer', 'merchant', 'easy', 'quiet'];

/**
 * 型ごとの言い回し：言い出し・課題の文のあとに付ける語尾（課題は「来ない」「たまっている」のような言い切りの形で作る）・結びの決まり文句。
 * name は型の名前（画面・文書）
 */
export const TONE_TEXT: Record<Tone, { name: () => string; pre: () => string; suf: () => string; tag: () => string }> = {
  scholar: { name: () => t('学者', 'Scholar'), pre: () => t('データによれば、', 'The data says '), suf: () => '', tag: () => t('手がかりは揃いました。', 'The clues are all here.') },
  warrior: { name: () => t('武人', 'Warrior'), pre: () => t('拙者が見るに、', 'As I see it, '), suf: () => t('と見た', ''), tag: () => t('いざ、ご決断を！', 'Your call, chief!') },
  leader: { name: () => t('指導者', 'Leader'), pre: () => t('進言する。', 'My counsel: '), suf: () => '', tag: () => t('決めるのは社長だ。', 'The decision is yours.') },
  polite: { name: () => t('ていねい', 'Polite'), pre: () => t('社長、', 'Chief, '), suf: () => t('ようです', ''), tag: () => t('いかがでしょう？', 'What do you think?') },
  cheer: { name: () => t('元気', 'Cheerful'), pre: () => t('ねえ社長！', 'Hey chief, '), suf: () => t('みたい', ''), tag: () => t('やってみようよ！', 'Let’s do it!') },
  merchant: { name: () => t('商人', 'Merchant'), pre: () => t('ここだけの話、', 'Between us, '), suf: () => t('んですよ', ''), tag: () => t('損はさせません。', 'You won’t lose on it.') },
  easy: { name: () => t('のんびり', 'Easygoing'), pre: () => t('ふあ…', 'Hmm… '), suf: () => t('みたいだねえ', ''), tag: () => t('まあ、ぼちぼちね。', 'No rush, though.') },
  quiet: { name: () => t('寡黙', 'Quiet'), pre: () => t('…報告。', '…Report: '), suf: () => '', tag: () => t('以上。', 'That is all.') },
};

/** 属性 → 型の重み（多い型に決まる。同じなら陣営の型、それも同じなら TONES の順） */
const ATTR_TONE: Record<string, Partial<Record<Tone, number>>> = {
  文系学問: { scholar: 2 },
  理系学問: { scholar: 2 },
  機械: { scholar: 2 },
  宇宙: { scholar: 1, easy: 1 },
  謎: { scholar: 1, quiet: 1 },
  長柄武器: { warrior: 2 },
  決闘: { warrior: 2 },
  弓: { warrior: 2 },
  斧: { warrior: 2 },
  格闘: { warrior: 2 },
  銃火器: { warrior: 1 },
  戦国: { warrior: 1 },
  三国志: { warrior: 1 },
  平安鎌倉: { warrior: 1 },
  幕末: { warrior: 1 },
  新撰組: { warrior: 2 },
  円卓の騎士: { warrior: 2 },
  桃園の誓い: { warrior: 1 },
  四面楚歌: { warrior: 1 },
  本能寺の変: { warrior: 1 },
  隻眼: { warrior: 1, quiet: 1 },
  指導者: { leader: 2 },
  政治: { leader: 2 },
  革命: { leader: 2 },
  天下人: { leader: 2 },
  戦術: { leader: 1, warrior: 1 },
  信仰: { polite: 2 },
  音楽: { polite: 2 },
  美術: { polite: 2 },
  芸能: { cheer: 1, polite: 1 },
  世界三大美女: { polite: 2 },
  世界三大ジャンヌ: { polite: 1, warrior: 1 },
  童話: { easy: 1, polite: 1 },
  動物: { cheer: 2 },
  旅: { cheer: 2 },
  海: { cheer: 1, merchant: 1 },
  Etheremon: { cheer: 2 },
  デュオ: { cheer: 1 },
  黒ひげ海賊団: { cheer: 2 },
  ウェスタン: { cheer: 1, warrior: 1 },
  アメリカンドリーム: { merchant: 3 },
  アメリカ大陸: { merchant: 1 },
  地中海: { merchant: 1 },
  イタリア: { merchant: 1 },
  伝承: { easy: 2 },
  オカルト: { easy: 2 },
  呪い: { easy: 1, quiet: 1 },
  ケルト: { easy: 1 },
  隠密: { quiet: 3 },
};
/** 陣営 → 型（属性の重みに足す） */
const FACTION_TONE: Record<string, Tone> = { 玄武: 'scholar', 白虎: 'warrior', 青龍: 'leader', 朱雀: 'cheer', 黄竜: 'merchant' };
const FACTION_W = 1.5;

/** 属性 → 性格の一言（いちばん先に当たったもの） */
const ATTR_TRAIT: Record<string, () => string> = {
  謎: () => t('推理好き', 'loves a mystery'),
  隠密: () => t('口数が少ない', 'says little'),
  機械: () => t('からくり好き', 'loves gadgets'),
  宇宙: () => t('夢見がち', 'a dreamer'),
  音楽: () => t('歌が好き', 'loves to sing'),
  美術: () => t('目が肥えている', 'a keen eye'),
  旅: () => t('旅好き', 'loves to travel'),
  海: () => t('海が好き', 'loves the sea'),
  動物: () => t('人なつこい', 'friendly'),
  信仰: () => t('信心深い', 'devout'),
  決闘: () => t('負けず嫌い', 'hates to lose'),
  戦術: () => t('策士', 'a schemer'),
  革命: () => t('改革好き', 'loves change'),
  政治: () => t('根回し上手', 'good at groundwork'),
  伝承: () => t('物知り', 'knows old tales'),
  オカルト: () => t('ふしぎ好き', 'into the uncanny'),
  呪い: () => t('ふしぎ好き', 'into the uncanny'),
  芸能: () => t('目立ちたがり', 'loves the spotlight'),
  理系学問: () => t('理詰め', 'logical'),
  文系学問: () => t('本の虫', 'a bookworm'),
  指導者: () => t('面倒見がよい', 'looks after others'),
  長柄武器: () => t('一本気', 'single-minded'),
};
/** 型ごとの性格の一言（属性で決まらないとき。id で選ぶ） */
const TONE_TRAIT: Record<Tone, (() => string)[]> = {
  scholar: [() => t('理屈っぽい', 'analytical'), () => t('研究熱心', 'studious'), () => t('慎重派', 'careful')],
  warrior: [() => t('勇ましい', 'bold'), () => t('一本気', 'single-minded'), () => t('せっかち', 'impatient')],
  leader: [() => t('堂々としている', 'self-assured'), () => t('大局を見る', 'sees the big picture'), () => t('決断が早い', 'decisive')],
  polite: [() => t('気配り上手', 'considerate'), () => t('おだやか', 'gentle'), () => t('きちょうめん', 'meticulous')],
  cheer: [() => t('元気いっぱい', 'full of energy'), () => t('好奇心旺盛', 'curious'), () => t('お祭り好き', 'loves a party')],
  merchant: [() => t('そろばん上手', 'good with numbers'), () => t('抜け目ない', 'shrewd'), () => t('話がうまい', 'smooth talker')],
  easy: [() => t('マイペース', 'goes at their own pace'), () => t('のんき', 'carefree'), () => t('ふしぎ系', 'a bit mysterious')],
  quiet: [() => t('寡黙', 'taciturn'), () => t('仕事人', 'all business'), () => t('冷静', 'cool-headed')],
};

const cache = new Map<number, Tone>();
/** 口調の型：属性の重み ＋ 陣営。カタログに無いヒーロー（以前のセーブなど）は id で決まる型 */
export function toneOf(id: number): Tone {
  const hit = cache.get(id);
  if (hit) return hit;
  const h = heroById.get(id);
  const w: Record<Tone, number> = { scholar: 0, warrior: 0, leader: 0, polite: 0, cheer: 0, merchant: 0, easy: 0, quiet: 0 };
  for (const a of h?.attributes ?? []) for (const [k, v] of Object.entries(ATTR_TONE[a] ?? {})) w[k as Tone] += v ?? 0;
  const fac = h ? FACTION_TONE[h.faction] : undefined;
  if (fac) w[fac] += FACTION_W;
  let best: Tone = fac ?? TONES[id % TONES.length];
  for (const k of TONES) if (w[k] > w[best]) best = k;
  cache.set(id, best);
  return best;
}
/** 性格の一言（属性の言葉から。無ければ型と id から） */
export function traitOf(id: number): string {
  const h = heroById.get(id);
  const attrs = h?.attributes ?? [];
  const hit = Object.keys(ATTR_TRAIT).find((a) => attrs.includes(a));
  if (hit) return ATTR_TRAIT[hit]();
  const xs = TONE_TRAIT[toneOf(id)];
  return xs[id % xs.length]();
}
/** 型の名前（「学者」） */
export const toneName = (id: number) => TONE_TEXT[toneOf(id)].name();

/** [[ ]] を除いた字数 */
export const sayLen = (x: string) => x.replace(/\[\[|\]\]/g, '').length;

/**
 * セリフ：型の言い出し ＋ 課題 ＋ 型の語尾。CARD.sayMax 字を超えたら、言い出しを落とす（60 字の決まりは課題の説明だけ）。
 * core は日本語なら言い切りの形（「来ない」「たまっている」）で、句点なし。英語は文の途中から始まる形（小文字で始める）
 */
export function say(tone: Tone, core: string, opt: { suf?: boolean } = {}): string {
  const T = TONE_TEXT[tone];
  const body = `${core}${opt.suf === false ? '' : T.suf()}`;
  const end = isEn ? '.' : '。';
  const tries = [`${T.pre()}${body}${end}`, `${cap(body)}${end}`];
  for (const x of tries) if (isEn || sayLen(x) <= CARD.sayMax) return x;
  return tries[tries.length - 1];
}
const cap = (x: string) => (isEn && x ? x[0].toUpperCase() + x.slice(1) : x);
/** ヒーローのセリフ（「」なし） */
export const heroSay = (id: number, core: string) => say(toneOf(id), core);

// ---------------------------------------------------------------- ウィットの一言（フレーバー。課題の説明とは別の 1 行・30 字まで）

/** 一言を選ぶ課題の種類（card.ts の Issue の k と同じ） */
export type QuipCat = 'sell' | 'craft' | 'buy' | 'idle' | 'head' | 'cs' | 'flame' | 'rally' | 'quit' | 'tax';
export const QUIP_CATS: QuipCat[] = ['sell', 'craft', 'buy', 'idle', 'head', 'cs', 'flame', 'rally', 'quit', 'tax'];
/** 一言の字数の目安（[[ ]] を除く） */
export const QUIP_MAX = 30;
type Q = () => string;

/** 口調の型 × 課題の種類（どの型にも、どの種類にも 2 つ以上） */
const TONE_QUIP: Record<Tone, Record<QuipCat, Q[]>> = {
  scholar: {
    sell: [() => t('手がかりは揃いました。犯人は…棚の少なさです', 'The clues are in. The culprit: too few shelves.'), () => t('仮説：棚が増えれば、客も増える', 'Hypothesis: more shelves, more customers.')],
    craft: [() => t('数式は嘘をつきません。台が足りない', 'Numbers don’t lie: we need benches.'), () => t('作業台の数が、検証済みの限界です', 'The benches have hit their proven limit.')],
    buy: [() => t('需要と供給、教科書どおりの不一致です', 'Supply and demand: a textbook mismatch.'), () => t('素材不足は、論文一本ぶんの大問題', 'A shortage worth a whole paper.')],
    idle: [() => t('暇は研究の母です', 'Idleness is the mother of research.'), () => t('待機中も、頭は休んでいません', 'Idle hands, busy mind.')],
    head: [() => t('結論から申し上げます', 'Conclusion first.'), () => t('根拠は、この数字のとおりです', 'The numbers are my evidence.')],
    cs: [() => t('お客さまの声は、最良のデータです', 'Customer voices are the best data.'), () => t('苦情もまた、一次資料です', 'A complaint is a primary source.')],
    flame: [() => t('うわさは、指数関数で広がります', 'Rumors spread exponentially.'), () => t('火種は小さいうちに観察を', 'Observe sparks while they are small.')],
    rally: [() => t('相手の一手、想定の範囲内です', 'Their move is within my model.'), () => t('対抗仮説を立てましょう', 'Time for a counter-hypothesis.')],
    quit: [() => t('研究テーマを見失いかけていて…', 'I am losing my research theme…'), () => t('この職場の検証、もう終わりかと', 'My study here may be done…')],
    tax: [() => t('節税は、応用数学です', 'Saving tax is applied math.'), () => t('計算上、いまが投資の好機です', 'By my math, now is the time to invest.')],
  },
  warrior: {
    sell: [() => t('棚 1 段では、兵が足りませぬ', 'One shelf is too few soldiers.'), () => t('売り場は戦場。陣を広げるべし', 'The shop floor is a battlefield. Widen the line!')],
    craft: [() => t('刀は研いでも、鍛冶場が狭い', 'Sharp blades, cramped forge.'), () => t('鍛冶場に援軍を求む！', 'Send reinforcements to the forge!')],
    buy: [() => t('兵糧が尽きれば、戦はできぬ', 'No rations, no war.'), () => t('補給線こそ、勝敗の分かれ目', 'Supply lines decide the battle.')],
    idle: [() => t('槍が錆びる前に、出陣を', 'Send me out before my spear rusts.'), () => t('待つのは性に合わぬ', 'Waiting does not suit me.')],
    head: [() => t('策は練った。あとは号令を', 'The plan is set. Give the order.'), () => t('ここが勝負どころでござる', 'This is the moment to strike.')],
    cs: [() => t('客の声、しかと受け止めた', 'I hear the customer loud and clear.'), () => t('礼を尽くすのも武士の道', 'Courtesy is the warrior’s way too.')],
    flame: [() => t('火の手が上がる前に、堀を掘れ', 'Dig a moat before the fire spreads.'), () => t('火計の気配がいたす', 'I smell a fire attack.')],
    rally: [() => t('敵の反撃、受けて立つ！', 'Their counterattack? Bring it!'), () => t('退くも勇気、攻めるも勇気', 'It takes courage to hold or to charge.')],
    quit: [() => t('この刀、置く時が来たやもしれぬ', 'Perhaps it is time to lay down my sword.'), () => t('戦う理由を見失い申した', 'I have lost my reason to fight.')],
    tax: [() => t('年貢の納め時でござる', 'The tax collector draws near.'), () => t('軍資金は、使い道が肝心', 'War funds must be spent wisely.')],
  },
  leader: {
    sell: [() => t('町の人々は、もっと良い棚を待っている', 'The people await better shelves.'), () => t('売り場を広げよ。それが民のためだ', 'Widen the shop. It serves the people.')],
    craft: [() => t('生産なくして繁栄なし', 'No production, no prosperity.'), () => t('工房こそ国の礎だ', 'The workshop is the nation’s foundation.')],
    buy: [() => t('物資の不足は、統治の失敗だ', 'Shortages are a failure of rule.'), () => t('まず補給を整えよ', 'Secure supplies first.')],
    idle: [() => t('人材を遊ばせるのは国の損失だ', 'Idle talent is a national loss.'), () => t('私にも務めを与えよ', 'Give me a duty.')],
    head: [() => t('決断は早いほどよい', 'Decide sooner rather than later.'), () => t('改革の時は今だ', 'The time for reform is now.')],
    cs: [() => t('民の声を聞くのが、上に立つ者の務め', 'A leader listens to the people.'), () => t('一人の不満は、百人の不満だ', 'One complaint speaks for a hundred.')],
    flame: [() => t('世論が揺れている。手を打て', 'Public opinion wavers. Act now.'), () => t('火消しも政の一つだ', 'Putting out fires is part of governing.')],
    rally: [() => t('挑戦には、堂々と応じよう', 'Meet the challenge head-on.'), () => t('相手の動きは読めている', 'I can read their moves.')],
    quit: [() => t('私の居場所は、もうここではないのか', 'Is there no place for me here now?'), () => t('志を見失いかけている', 'I am losing sight of my cause.')],
    tax: [() => t('税は国の血だが、流しすぎは毒だ', 'Taxes are lifeblood—but don’t bleed out.'), () => t('財政の手綱を締めよう', 'Let’s tighten the fiscal reins.')],
  },
  polite: {
    sell: [() => t('棚がもう少しあれば、きっと喜ばれます', 'A few more shelves would delight them.'), () => t('お客さまをお待たせしたくなくて', 'I hate to keep customers waiting.')],
    craft: [() => t('職人さんたち、少しお疲れのようで', 'The crafters look a little tired.'), () => t('作業台に、もうひと席あれば…', 'If only the benches had one more seat…')],
    buy: [() => t('素材が足りないと、皆さん困ってしまいます', 'Without materials, everyone struggles.'), () => t('仕入れ先にもご相談してみますね', 'I could talk to our suppliers.')],
    idle: [() => t('何かお手伝いできることは？', 'Is there anything I can help with?'), () => t('お茶を淹れるだけでは申し訳なくて', 'Making tea alone feels like too little.')],
    head: [() => t('差し出がましいようですが', 'If I may be so bold.'), () => t('ご判断をお願いいたします', 'Your decision, please.')],
    cs: [() => t('丁寧にお返事したいですね', 'Let’s answer them kindly.'), () => t('お客さまのお気持ち、分かります', 'I understand how they feel.')],
    flame: [() => t('お詫びは早いほうがよいかと', 'An early apology may be best.'), () => t('このままでは、心配です', 'I am worried if we leave it.')],
    rally: [() => t('お隣さんも、必死なのですね', 'Our neighbors are trying hard too.'), () => t('こちらも誠実に応えましょう', 'Let’s answer them sincerely.')],
    quit: [() => t('申し訳ありません、少し疲れてしまって', 'I’m sorry, I am just so tired.'), () => t('お世話になりましたが…', 'You have been so kind, but…')],
    tax: [() => t('帳簿を見ていて、気づいたのですが', 'I noticed something in the books.'), () => t('無駄なく使えたらと思いまして', 'I’d like nothing to go to waste.')],
  },
  cheer: {
    sell: [() => t('棚をドーンと増やしちゃおう！', 'Let’s add shelves—boom!'), () => t('お客さん、もっと呼べるって！', 'We can bring in way more customers!')],
    craft: [() => t('作業台、取り合いになってるよ！', 'Everyone’s fighting over the benches!'), () => t('もっと作りたくてウズウズ！', 'I’m itching to make more!')],
    buy: [() => t('素材がなくて、手がスカスカ！', 'No materials—my hands are empty!'), () => t('買い出しなら任せて！', 'Leave the shopping to me!')],
    idle: [() => t('ヒマすぎて、走り出しそう！', 'So bored I could run laps!'), () => t('なんでもやるよ、なんでも！', 'I’ll do anything—anything!')],
    head: [() => t('いいこと思いついた！', 'I had a great idea!'), () => t('これ、絶対うまくいくって！', 'This will totally work!')],
    cs: [() => t('お客さん、ちょっとご機嫌ななめ！', 'A customer is a bit grumpy!'), () => t('笑顔で返事しよ！', 'Let’s reply with a smile!')],
    flame: [() => t('なんか、焦げくさくない？', 'Do you smell something burning?'), () => t('炎上はお祭りじゃないよ！', 'A backlash is no party!')],
    rally: [() => t('向こうも燃えてるね！負けないよ！', 'They’re fired up—so are we!'), () => t('勝負だ、勝負！', 'Game on!')],
    quit: [() => t('最近、元気が出なくて…', 'I just can’t feel cheerful lately…'), () => t('いつもの笑顔、どこかに落とした', 'I seem to have lost my smile.')],
    tax: [() => t('お金の話、ちょっとだけ聞いて！', 'Quick money talk, promise!'), () => t('税金、減らせるかもよ！', 'We might cut our taxes!')],
  },
  merchant: {
    sell: [() => t('棚は金の卵。増やさぬ手はない', 'Shelves lay golden eggs. Add more.'), () => t('売り場の広さは、財布の広さ', 'A wider shop means a wider wallet.')],
    craft: [() => t('作れば売れる。なら作らにゃ損', 'If it sells, not making it is a loss.'), () => t('作業台への投資は、すぐ回収できます', 'Benches pay for themselves fast.')],
    buy: [() => t('仕入れを渋ると、儲けも渋る', 'Skimp on stock, skimp on profit.'), () => t('安く買って高く売る。基本です', 'Buy low, sell high. The basics.')],
    idle: [() => t('遊ばせておくのは、在庫と同じ損', 'An idle hand costs like dead stock.'), () => t('私を使えば、元は取れます', 'Use me—I’ll pay my way.')],
    head: [() => t('いい話がありまして', 'I have a deal for you.'), () => t('ここは勝負の張りどころ', 'Time to place a smart bet.')],
    cs: [() => t('お客さまは、未来の常連さん', 'Every customer is a future regular.'), () => t('信用は、いちばんの資産です', 'Trust is our biggest asset.')],
    flame: [() => t('悪い評判は、高くつきます', 'A bad reputation is expensive.'), () => t('火消し代は、安い保険です', 'Damage control is cheap insurance.')],
    rally: [() => t('値引き合戦は、体力勝負ですよ', 'Price wars test your stamina.'), () => t('相手の手の内、読めてます', 'I know what they are playing.')],
    quit: [() => t('割に合わない気がしてきまして', 'It no longer feels worth it.'), () => t('ほかの店から声がかかって…', 'Another shop has made me an offer…')],
    tax: [() => t('税も費用。削れるなら削りましょう', 'Tax is a cost. Trim it if we can.'), () => t('同じ金なら、投資に回すが吉', 'Same money is better spent investing.')],
  },
  easy: {
    sell: [() => t('棚、もうちょい欲しいかもねえ', 'Could use a few more shelves, maybe.'), () => t('お客さん、通り過ぎちゃうんだよねえ', 'Customers just wander past, y’know.')],
    craft: [() => t('作業台、ぎゅうぎゅうだねえ', 'The benches are pretty packed.'), () => t('急がば回れ…いや、台を増やそう', 'More haste, less speed… or more benches.')],
    buy: [() => t('素材、そのうち届くかなあ', 'Materials will show up… eventually?'), () => t('棚の向こうに、ないものはないねえ', 'Can’t sell what we don’t have, huh.')],
    idle: [() => t('のんびりも、そろそろ飽きたかな', 'I might be bored of lazing now.'), () => t('昼寝のあいだに、思いついたんだけど', 'I had an idea during my nap.')],
    head: [() => t('まあ、聞いてみてよ', 'Well, hear me out.'), () => t('悪くない話だと思うよ', 'Not a bad idea, I think.')],
    cs: [() => t('お客さん、怒ってるねえ', 'That customer seems upset.'), () => t('まあまあ、落ち着いて返事しよう', 'Easy now, let’s answer calmly.')],
    flame: [() => t('なんだか空がけむたいねえ', 'The sky looks a little smoky.'), () => t('火遊びは、ほどほどにね', 'Don’t play with fire too long.')],
    rally: [() => t('向こうも頑張るねえ', 'They’re really trying, huh.'), () => t('あわてず、いこうよ', 'No need to panic.')],
    quit: [() => t('ちょっと、のんびりしすぎたかな…', 'Maybe I’ve drifted too far…'), () => t('ここを離れる夢を見たんだ', 'I dreamt of leaving this place.')],
    tax: [() => t('税金って、ふしぎだねえ', 'Taxes are a strange thing.'), () => t('ためこむより、使っちゃおう', 'Better to use it than hoard it.')],
  },
  quiet: {
    sell: [() => t('…棚、不足', '…Shelves: short.'), () => t('客は見ている。棚を見ている', 'Customers look. At the shelves.')],
    craft: [() => t('…作業台、満杯', '…Benches: full.'), () => t('手は足りている。台がない', 'Enough hands. No benches.')],
    buy: [() => t('…素材、欠乏', '…Materials: lacking.'), () => t('補給が細い', 'Supply is thin.')],
    idle: [() => t('…手が空いた', '…My hands are free.'), () => t('命令を待つ', 'Awaiting orders.')],
    head: [() => t('…提案、一件', '…One proposal.'), () => t('判断を', 'Your call.')],
    cs: [() => t('…苦情、一件', '…One complaint.'), () => t('声は届いている', 'The voice has reached us.')],
    flame: [() => t('…煙を確認', '…Smoke spotted.'), () => t('火は早いうちに', 'Fire: act early.')],
    rally: [() => t('…敵、動く', '…The enemy moves.'), () => t('迎え撃つか', 'Do we answer?')],
    quit: [() => t('…去るべきか', '…Should I leave?'), () => t('迷っている', 'I am torn.')],
    tax: [() => t('…税、削減可', '…Tax: reducible.'), () => t('数字は語る', 'The numbers speak.')],
  },
};
/** 属性からの一言（どの課題でも使える any と、課題の種類ごと）。実在の人物の評価・史実の断定は書かない（属性から連想する軽い冗談だけ） */
const ATTR_QUIP: Record<string, Partial<Record<QuipCat | 'any', Q[]>>> = {
  文系学問: { any: [() => t('知は力。棚もまた力', 'Knowledge is power. So are shelves.'), () => t('行間を読めば、答えはそこに', 'Read between the lines.')] },
  理系学問: { any: [() => t('実験の結果、増やすべきと出ました', 'The experiment says: more.'), () => t('再現性のある儲けを', 'Profits you can reproduce.')], sell: [() => t('需要曲線が、こちらを手招きしています', 'The demand curve is beckoning.')] },
  三国志: { any: [() => t('天下三分の計、まずは棚から', 'Divide the realm—start with shelves.'), () => t('三顧の礼より、三段の棚', 'Three shelves beat three visits.')] },
  桃園の誓い: { any: [() => t('桃の花より、売上の花を', 'Forget peach blossoms—let sales bloom.')] },
  戦国: { any: [() => t('この一手、天下分け目と心得よ', 'Treat this as the decisive battle.'), () => t('城も店も、まずは石垣から', 'Castles and shops start with walls.')], sell: [() => t('兵（棚）は多いほど心強い', 'The more shelves, the braver we are.')] },
  動物: { any: [() => t('鼻がききます。売れる匂いがする', 'I smell a sale.'), () => t('ここはひとつ、群れで攻めよう', 'Let’s hunt as a pack.')] },
  アメリカ大陸: { any: [() => t('新大陸は、いつも棚の向こうに', 'The new world lies past the shelf.'), () => t('フロンティア精神でいこう', 'Frontier spirit, chief!')] },
  アメリカンドリーム: { any: [() => t('小さな店から、大きな夢を', 'Big dreams from a small shop.')] },
  政治: { any: [() => t('根回しは済んでおります', 'The groundwork is laid.'), () => t('公約は、売上倍増です', 'My platform: double the sales.')] },
  女性: { any: [() => t('主役は、私たちのお店よ', 'Our shop is the star.'), () => t('迷ったら、華やかなほうを', 'When in doubt, go bold.')] },
  指導者: { any: [() => t('号令ひとつで、町が動く', 'One command, and the town moves.'), () => t('先頭に立つ者が、道を示す', 'The one in front shows the way.')] },
  海: { any: [() => t('潮目が変わった。いまが漕ぎ時', 'The tide turned. Row now.'), () => t('順風満帆とはいかないね', 'Not exactly smooth sailing.')] },
  音楽: { any: [() => t('売上のリズムを刻もう', 'Let’s keep the sales rhythm.'), () => t('この店、まだワンフレーズ足りない', 'This shop is one bar short.')] },
  美術: { any: [() => t('美しい棚は、それだけで売れる', 'A beautiful shelf sells itself.')] },
  謎: { any: [() => t('謎はすべて解けました', 'Every mystery is solved.'), () => t('答えは、いつも足もとに', 'The answer is always underfoot.')] },
  長柄武器: { any: [() => t('間合いは詰まった。いざ', 'The distance is closed. Now!')] },
  決闘: { any: [() => t('一騎打ちなら負けません', 'One-on-one, I never lose.')] },
  旅: { any: [() => t('次の町への切符は、売上です', 'Sales are our ticket to the next town.')] },
  信仰: { any: [() => t('祈るより、並べましょう', 'Less praying, more stocking.')] },
  機械: { any: [() => t('歯車がひとつ、足りません', 'We are one gear short.')] },
  宇宙: { any: [() => t('星の数ほど、お客さんはいる', 'Customers as many as the stars.')] },
  伝承: { any: [() => t('昔話でも、店は繁盛するものだ', 'In old tales, shops always thrive.')] },
  隠密: { any: [() => t('…影から見ていた', '…I watched from the shadows.')] },
};

const hash = (n: number) => {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
};
/** その話し手が、その課題で言える一言の候補（口調の型の一言 ＋ 属性の一言） */
export function quipPool(id: number, cat: QuipCat): Q[] {
  const attrs = heroById.get(id)?.attributes ?? [];
  const extra = attrs.flatMap((a) => [...(ATTR_QUIP[a]?.any ?? []), ...(ATTR_QUIP[a]?.[cat] ?? [])]);
  const tn = toneOf(id);
  // 型の決まり文句（口ぐせ）も候補に
  return [...TONE_QUIP[tn][cat], TONE_TEXT[tn].tag, ...extra];
}
/**
 * ウィットの一言：ヒーロー・課題の種類・月（turn）で回す（同じ人の同じ課題でも、月が変われば別の一言）
 */
export function quipOf(id: number, cat: QuipCat, turn: number): string {
  const pool = quipPool(id, cat);
  const k = (hash(id * 131 + QUIP_CATS.indexOf(cat)) + turn) % pool.length;
  return pool[k]();
}
/** テスト：口調の型 × 課題の種類の一言・属性の一言のすべて */
export const allQuips = (): { tone: Tone | null; cat: QuipCat | 'any'; text: string }[] => [
  ...TONES.flatMap((tn) => QUIP_CATS.flatMap((c) => TONE_QUIP[tn][c].map((f) => ({ tone: tn, cat: c, text: f() })))),
  ...Object.values(ATTR_QUIP).flatMap((o) => Object.entries(o).flatMap(([c, fs]) => (fs ?? []).map((f) => ({ tone: null, cat: c as QuipCat | 'any', text: f() })))),
];
export const toneQuipCount = (tn: Tone, c: QuipCat) => TONE_QUIP[tn][c].length;
