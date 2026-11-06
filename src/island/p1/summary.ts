/**
 * 段 UI9b（追加 2）：提案書のサマリー文（最初の 100〜150 字）とカードのセリフ（DOM なし：card.ts・slides.ts・proposalui.ts・テストが使う）。
 * 3 つの層：
 * 1. 意味の層（SummaryCore。全ヒーロー共通・ここで品質を担保）：現状（何が起きているか・根拠の数字）→ 原因 → 承認してほしいこと（手・費用・効果）。
 *    数字は [[ ]] で囲む（画面で色が変わる）。card.ts の coreOfCard・slides.ts の coreOfBrief が課題（issues.ts）・手（plan.ts）・見込み（brief.ts）から組む
 * 2. 文の層（型）：攻め（bold）・堅実（steady）・数字で語る（numeric）・短く断言（short）の 4 つ。ヒーローの施策の好み（voice.ts の styleCode）で選ぶ。
 *    どの型も「社長、{現状}。{根拠}。{原因}。{手}で{効果}。{費用}かかりますが{見込み}。」の骨組みは同じ（最後の文が承認してほしいこと）
 * 3. 声の層（語り口）：語尾の型（register：voice.json の reg。scripts/heroes/build.mjs の registerOf）で語尾を置き換え、一人称・呼びかけを差し替え、
 *    口ぐせを 1 つだけ文末に添える（月でローテーション）。ビジネス語（ボトルネック・処理量・投資回収）は残し、語彙の置き換えは最小限。
 *    英語（isEn）は変換しない。声の無いヒーロー（ノービスなど）は persona.ts の型の既定の語尾（polite／cheer → genki／warrior → terse など）
 * 検証（tests/island-p1-ui9b.test.ts）：変換後も数字が全部残る・手の名前が残る・150 字に収まる・最後の文が承認してほしいこと。
 * i18n-check: skip（語尾の置き換え表は日本語だけ。英語は isEn で変換しない）
 */
import { isEn } from '../../i18n';
import { toneOf, type Tone } from './persona';
import { parseStyle, styleCode, voiceOf, type Register } from './voice';

// ---------------------------------------------------------------- 意味の層

export interface SummaryCore {
  /** 現状：何が起きているか（1 文。語尾は「になっています。」「ています。」「です。」のどれか）・根拠の数字（1 文。無ければ空）・本文に入る数字 */
  now: { what: string; evidence: string; num: string[] };
  /** 原因（1 文。語尾は「が原因です。」「と考えます。」のどちらか） */
  cause: { what: string };
  /** 承認してほしいこと：手（名詞）・費用（名詞句。「初期投資[[ 5,000 G]]」。無ければ空）・効果（名詞句。「来月から月の利益[[ +2,735 G]]」） */
  ask: {
    move: string;
    cost: string;
    effect: string;
    /** 手のあとの動詞句（「で店頭の魅力を上げ」。無ければ「を承認し」） */
    verb?: string;
    /** 効果が大きい（月の利益の増加が As-Is の 10% 超）：攻めの決まり文句（一気に伸ばす）を使ってよい */
    big?: boolean;
  };
}
/** 3 文の型 */
export type SumStyle = 'bold' | 'steady' | 'numeric' | 'short';
/** 画面に出す 3 段（card.ts の Speech と同じ形） */
export interface Spoken {
  now: string;
  cause: string;
  ask: string;
}
/** サマリー文の字数の上限（[[ ]] を除く）と目安の下限 */
export const SUMMARY_MAX = 150;
export const SUMMARY_MIN = 100;
export const plen = (x: string) => [...x.replace(/\[\[|\]\]/g, '')].length;
/** 本文の数字（「5,000 G」「10%」「57 個」「+2,735 G」「18 日後」） */
export const numsOf = (x: string): string[] => x.replace(/\[\[|\]\]/g, '').match(/[+−-]?\d[\d,.]*/g) ?? [];

// ---------------------------------------------------------------- 文の層（型）

/** ヒーローの型（施策の好みから。声の無いヒーローは口調の型から）。マインちゃん（hero null）は steady */
export function styleOf(hero: number | null | undefined): SumStyle {
  if (hero == null) return 'steady';
  const tone = toneOf(hero);
  const reg = registerOf(hero);
  if (reg === 'terse' || tone === 'quiet') return 'short';
  const st = parseStyle(styleCode(hero, tone));
  if (st.atk > 0 || st.spd > 0) return 'bold';
  if (st.odd < 0 || tone === 'scholar') return 'numeric';
  return 'steady';
}
/** 型ごとの 3 文（丁寧語。語尾は声の層が置き換える） */
export function sentencesOf(core: SummaryCore, style: SumStyle, o: { evidence?: boolean | 'short'; cost?: boolean; salt?: number } = {}): Spoken {
  // 根拠：全部（既定）・短く（最初の 1 文だけ）・無し
  const ev = o.evidence === false ? '' : o.evidence === 'short' ? (core.now.evidence.split(/(?<=[。！？])/).filter(Boolean)[0] ?? '') : core.now.evidence;
  const verb = core.ask.verb ?? 'を承認し';
  const cost = o.cost !== false ? core.ask.cost : '';
  const move = `[[${core.ask.move}]]`;
  const salt = o.salt ?? 0;
  if (isEn) {
    const c = cost ? `It costs ${cost}, but ` : '';
    return { now: `${core.now.what} ${ev}`.trim(), cause: core.cause.what, ask: `Please approve ${move}. ${c}${core.ask.effect} is expected.` };
  }
  // 承認の文：型ごとに 3 通りを月で回す。「一気に伸ばす」は効果が大きいとき（big：月の利益の増加が As-Is の 10% 超）だけ。小さい効果は素直な形
  const plain = [`${move}を承認してください。`, `${move}を進めさせてください。`, `${move}${verb}ましょう。`];
  const bold = core.ask.big ? [`${move}${verb}て一気に伸ばしましょう。`, `${move}${verb}て攻めましょう。`, `${move}${verb}て勝負に出ましょう。`] : plain;
  const steady = core.ask.big ? [`${move}${verb}て手堅く進めましょう。`, `${move}を承認してください。`, `${move}を進めさせてください。`] : plain;
  const pick = (xs: string[]) => xs[Math.abs(salt) % xs.length];
  const gain = `${cost ? `${cost}はかかりますが、` : ''}${core.ask.effect}の見込みです。`;
  switch (style) {
    case 'bold':
      return { now: `${core.now.what}${ev}`, cause: core.cause.what, ask: `${pick(bold)}${gain}` };
    case 'numeric':
      return { now: `${core.now.what}${ev}`, cause: core.cause.what, ask: `${cost ? `${cost}で` : ''}${core.ask.effect}の見込みです。${pick(plain)}` };
    case 'short':
      return { now: `${core.now.what}${ev}`, cause: core.cause.what, ask: `${pick(plain)}${cost ? `${cost}で` : ''}${core.ask.effect}の見込みです。` };
    default:
      return { now: `${core.now.what}${ev}`, cause: core.cause.what, ask: `${pick(steady)}${gain}` };
  }
}

// ---------------------------------------------------------------- 声の層（語り口）

/** 語尾の置き換え表（丁寧語 → 型）。上から順に、文末（。の前）で当てる */
const ENDINGS: Record<Exclude<Register, 'polite'>, [string, string][]> = {
  genki: [
    ['させてください', 'させて！'],
    ['いませんでした', 'いなかったの'],
    ['ました', 'たよ！'],
    ['になっています', 'になってるよ！'],
    ['にとどまっています', 'しか来てないの'],
    ['が原因と考えます', 'が原因だと思う！'],
    ['と考えます', 'と思う！'],
    ['が原因です', 'が原因！'],
    ['していません', 'してないの'],
    ['ていません', 'てないの'],
    ['ています', 'てるよ！'],
    ['を承認してください', 'を承認してね！'],
    ['してください', 'してね！'],
    ['て一気に伸ばしましょう', 'て一気に伸ばそ！'],
    ['ましょう', 'よう！'],
    ['の見込みです', 'いけるよ！'],
    ['はかかりますが', 'はかかるけど'],
    ['はかかりません', 'はかからないよ！'],
    ['はかからず', 'はかからないし'],
    ['採算は合います', '採算は合うよ！'],
    ['できます', 'できるよ！'],
    ['ません', 'ないよ！'],
    ['です', 'だよ！'],
    ['ます', 'るよ！'],
  ],
  assert: [
    ['させてください', 'させよ'],
    ['いませんでした', 'おらなんだ'],
    ['ました', 'た'],
    ['になっています', 'になっておる'],
    ['にとどまっています', 'にとどまっておる'],
    ['が原因と考えます', 'が原因である'],
    ['と考えます', 'と見る'],
    ['が原因です', 'が原因である'],
    ['していません', 'しておらぬ'],
    ['ていません', 'ておらぬ'],
    ['ています', 'ておる'],
    ['を承認してください', 'を承認せよ'],
    ['してください', 'せよ'],
    ['伸ばしましょう', '伸ばせ'],
    ['進めましょう', '進めよ'],
    ['しましょう', 'せよ'],
    ['ましょう', 'よ'],
    ['の見込みです', 'の見込みである'],
    ['はかかりますが', 'はかかるが'],
    ['はかかりません', 'はかからぬ'],
    ['はかからず', 'はかからず'],
    ['採算は合います', '採算は合う'],
    ['できます', 'できる'],
    ['ません', 'ぬ'],
    ['です', 'である'],
    ['ます', 'る'],
  ],
  tosa: [
    ['させてください', 'させてくれんかの'],
    ['いませんでした', 'おらんかった'],
    ['ました', 'たぜよ'],
    ['になっています', 'になっちゅうぜよ'],
    ['にとどまっています', 'にとどまっちゅう'],
    ['が原因と考えます', 'が原因じゃき'],
    ['と考えます', 'と思うぜよ'],
    ['が原因です', 'が原因じゃき'],
    ['していません', 'しちょらん'],
    ['ていません', 'ちょらん'],
    ['ています', 'ちゅう'],
    ['を承認してください', 'を承認してくれんかの'],
    ['してください', 'してくれや'],
    ['伸ばしましょう', '伸ばそうや'],
    ['進めましょう', '進めようや'],
    ['ましょう', 'ようや'],
    ['の見込みです', 'は堅いぜよ'],
    ['はかかりますが', 'はかかるが'],
    ['はかかりません', 'はかからんぜよ'],
    ['はかからず', 'はかからんし'],
    ['採算は合います', '採算は合うぜよ'],
    ['できます', 'できるぜよ'],
    ['ません', 'ん'],
    ['です', 'ぜよ'],
    ['ます', 'るぜよ'],
  ],
  archaic: [
    ['させてください', 'させていただきたい'],
    ['いませんでした', 'おらなんだ'],
    ['ました', '申した'],
    ['になっています', 'になっておりまする'],
    ['にとどまっています', 'にとどまってござる'],
    ['が原因と考えます', 'が原因と心得まする'],
    ['と考えます', 'と心得まする'],
    ['が原因です', 'が原因でござる'],
    ['していません', 'しておらぬ'],
    ['ていません', 'ておらぬ'],
    ['ています', 'ておりまする'],
    ['を承認してください', 'のご承認をいただきたい'],
    ['してください', 'していただきたい'],
    ['伸ばしましょう', '伸ばしましょうぞ'],
    ['進めましょう', '進めましょうぞ'],
    ['ましょう', 'ましょうぞ'],
    ['の見込みです', 'の見込みにござる'],
    ['はかかりますが', 'はかかりまするが'],
    ['はかかりません', 'はかかり申さぬ'],
    ['はかからず', 'はかからず'],
    ['採算は合います', '採算は合い申す'],
    ['できます', 'でき申す'],
    ['ません', '申さぬ'],
    ['です', 'でござる'],
    ['ます', 'まする'],
  ],
  gentle: [
    ['させてください', 'させていただけますか'],
    ['になっています', 'になっていますね'],
    ['が原因と考えます', 'が原因ではないでしょうか'],
    ['と考えます', 'と考えています'],
    ['が原因です', 'が原因でしょう'],
    ['を承認してください', 'を承認していただけますか'],
    ['してください', 'していただけますか'],
    ['伸ばしましょう', '伸ばしていきましょう'],
    ['進めましょう', '進めていきましょう'],
    ['の見込みです', 'が見込めますよ'],
    ['はかかりません', 'はかかりませんよ'],
  ],
  terse: [
    ['させてください', 'させてくれ'],
    ['いませんでした', 'いなかった'],
    ['ました', 'た'],
    ['がボトルネックになっています', 'がボトルネック'],
    ['になっています', 'になっている'],
    ['にとどまっています', 'にとどまる'],
    ['が原因と考えます', 'が原因'],
    ['と考えます', 'と判断'],
    ['が原因です', 'が原因'],
    ['していません', 'していない'],
    ['ていません', 'ていない'],
    ['ています', 'ている'],
    ['を承認してください', 'の承認を'],
    ['してください', 'を'],
    ['伸ばしましょう', '伸ばす'],
    ['進めましょう', '進める'],
    ['しましょう', 'する'],
    ['ましょう', 'る'],
    ['の見込みです', 'の見込み'],
    ['はかかりますが', 'はかかるが'],
    ['はかかりません', 'はかからない'],
    ['はかからず', 'はかからず'],
    ['採算は合います', '採算は合う'],
    ['できます', 'できる'],
    ['ません', 'ない'],
    ['です', ''],
    ['ます', 'る'],
  ],
  rough: [
    ['させてください', 'させてくれ'],
    ['いませんでした', 'いなかった'],
    ['ました', 'た'],
    ['になっています', 'になってるぜ'],
    ['にとどまっています', 'にとどまってる'],
    ['が原因と考えます', 'が原因だろうな'],
    ['と考えます', 'と思うぜ'],
    ['が原因です', 'が原因だ'],
    ['していません', 'してねえ'],
    ['ていません', 'てねえ'],
    ['ています', 'てる'],
    ['を承認してください', 'を承認してくれ'],
    ['してください', 'してくれ'],
    ['伸ばしましょう', '伸ばそうぜ'],
    ['進めましょう', '進めようぜ'],
    ['ましょう', 'ようぜ'],
    ['の見込みです', 'はいけるぜ'],
    ['はかかりますが', 'はかかるが'],
    ['はかかりません', 'はかからねえ'],
    ['はかからず', 'はかからねえし'],
    ['採算は合います', '採算は合う'],
    ['できます', 'できる'],
    ['ません', 'ねえ'],
    ['です', 'だ'],
    ['ます', 'る'],
  ],
};
/** 文の途中の言い回し（「はかかりますが、」「で、」）：文末でないので別の表 */
const CLAUSES: Record<Exclude<Register, 'polite'>, [string, string][]> = {
  genki: [['はかかりますが、', 'はかかるけど、'], ['はかからず、', 'はかからないし、']],
  assert: [['はかかりますが、', 'はかかるが、'], ['はかからず、', 'はかからず、']],
  tosa: [['はかかりますが、', 'はかかるが、'], ['はかからず、', 'はかからんし、']],
  archaic: [['はかかりますが、', 'はかかりまするが、'], ['はかからず、', 'はかからず、']],
  gentle: [],
  terse: [['はかかりますが、', 'はかかるが、'], ['はかからず、', 'はかからず、']],
  rough: [['はかかりますが、', 'はかかるが、'], ['はかからず、', 'はかからねえし、']],
};
/** 時代の言い回し（語彙の置き換えは最小限：お客様・お店） */
const WORDS: Partial<Record<Register, [string, string][]>> = {
  genki: [['お客様', 'お客さん']],
  assert: [['お客様', '客'], ['お店', '店']],
  tosa: [['お客様', '客'], ['お店', '店']],
  archaic: [['お客様', '客人'], ['お店', '店']],
  terse: [['お客様', '客'], ['お店', '店']],
  rough: [['お客様', '客'], ['お店', '店']],
};
/** 文末の記号（！で終える型は「。」を「！」に） */
const BANG: Partial<Record<Register, boolean>> = { genki: true };
/** 1 文の語尾を置き換える（「。」「！」で区切った文ごと） */
export function voiceSentence(x: string, reg: Register): string {
  if (reg === 'polite' || isEn) return x;
  const parts = x.split(/(?<=[。！？])/).filter(Boolean);
  return parts
    .map((p) => {
      const end = p.match(/[。！？]$/)?.[0] ?? '';
      let body = p.replace(/[。！？]$/, '');
      for (const [a, b] of ENDINGS[reg]) {
        if (body.endsWith(a)) {
          // archaic の「です」→「でござる」は名詞のあとだけ（ひらがなの活用語のあとは「でございます」）
          const b2 = reg === 'archaic' && a === 'です' && /[\u3040-\u309f]$/.test(body.slice(0, -a.length)) ? 'でございます' : b;
          body = body.slice(0, -a.length) + b2;
          break;
        }
      }
      for (const [a, b] of CLAUSES[reg]) body = body.split(a).join(b);
      for (const [a, b] of WORDS[reg] ?? []) body = body.split(a).join(b);
      if (/[！？]$/.test(body)) return body;
      return body + (BANG[reg] && end === '。' ? '！' : end);
    })
    .join('');
}
/** 声の無いヒーローの型（persona.ts の口調の型 → 語尾の型）。マインちゃん（hero null）は genki */
const TONE_REG: Record<Tone, Register> = { scholar: 'polite', warrior: 'terse', leader: 'assert', polite: 'polite', cheer: 'genki', merchant: 'polite', easy: 'gentle', quiet: 'terse' };
export function registerOf(hero: number | null | undefined): Register {
  if (hero == null) return 'genki';
  return voiceOf(hero)?.reg ?? TONE_REG[toneOf(hero)];
}
const mix = (n: number) => {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  return (x ^ (x >>> 13)) >>> 0;
};
/**
 * 口ぐせ（1 つ。salt で回す。「」は外す）。独立した一言として成り立つものだけ：「〜」で始まるもの・括弧つき・長いもの（20 字超）は入れない。
 * です・ます の口ぐせは polite／gentle 以外では入れない（語尾の型と合わない）。声が無ければ null
 */
export function ticOf(hero: number | null | undefined, salt: number, reg: Register = registerOf(hero)): string | null {
  const v = voiceOf(hero);
  const soft = reg === 'polite' || reg === 'gentle';
  const xs = (v?.tic ?? [])
    .map((x) => x.replace(/^「|」$/g, '').trim())
    .filter((x) => x && !x.startsWith('〜') && !/[（）()]/.test(x) && [...x].length <= 20)
    .filter((x) => soft || !/(です|ます|ましょう|ません|でしょう|ください)[。！？]?$/.test(x));
  if (!xs.length) return null;
  return xs[mix((hero ?? 0) * 131 + salt) % xs.length];
}
/** 社長への呼びかけとして使える言葉（「あなた」「お前」「貴殿」などは社長に話すセリフでは「社長」に固定） */
const TO_OK = /社長|殿|主君|閣下|大将|旦那|ボス|オーナー|館|姫|様$/;
/** 呼びかけ（「社長」「殿」）と一人称。声が無ければ既定 */
export function addressOf(hero: number | null | undefined): { to: string; fp: string } {
  const v = voiceOf(hero);
  const to = v?.to && TO_OK.test(v.to) ? v.to : '社長';
  return { to, fp: v?.fp || 'わたし' };
}

/**
 * サマリー文：意味の層 → 文の層（型）→ 声の層（語尾・一人称・呼びかけ・口ぐせ）。
 * 150 字を超えたら、根拠の数字 → 口ぐせ → 費用の順に落とす。英語は型の文のまま。最後の文は承認してほしいこと（口ぐせは承認の文の前に入れる）
 */
export function speakCore(core: SummaryCore, hero: number | null | undefined, salt = 0, style: SumStyle = styleOf(hero)): Spoken {
  const reg = registerOf(hero);
  const { to, fp } = addressOf(hero);
  const build = (o: { evidence: boolean | 'short'; tic: boolean; cost: boolean }): Spoken => {
    const s0 = sentencesOf(core, style, { evidence: o.evidence, cost: o.cost, salt });
    if (isEn) return { now: `Chief, ${s0.now[0]?.toLowerCase() ?? ''}${s0.now.slice(1)}`, cause: s0.cause, ask: s0.ask };
    const head = reg === 'assert' || reg === 'terse' ? '' : `${to}、`;
    // 口ぐせは文頭（「社長、」の前）にだけ（文の途中に貼り付けない。最後の文は承認してほしいこと）
    const tic = o.tic ? ticOf(hero, salt, reg) : null;
    const t2 = tic ? `${tic}${/[。！？]$/.test(tic) ? '' : '。'}` : '';
    return {
      now: `${t2}${voiceSentence(`${head}${s0.now}`, reg).split('わたし').join(fp)}`,
      cause: voiceSentence(s0.cause, reg).split('わたし').join(fp),
      ask: voiceSentence(s0.ask, reg).split('わたし').join(fp),
    };
  };
  const len = (x: Spoken) => plen(`${x.now}${x.cause}${x.ask}`);
  // 150 字を超えたら 口ぐせ → 根拠を短く（最初の 1 文だけ）→ 根拠なし → 費用 の順に落とす（費用と効果の数字は最後まで残す）
  const tries: { evidence: boolean | 'short'; tic: boolean; cost: boolean }[] = [
    { evidence: true, tic: true, cost: true },
    { evidence: true, tic: false, cost: true },
    { evidence: 'short', tic: false, cost: true },
    { evidence: false, tic: false, cost: true },
    { evidence: false, tic: false, cost: false },
  ];
  let out = build(tries[tries.length - 1]);
  for (const o of tries) {
    const x = build(o);
    if (len(x) <= SUMMARY_MAX) {
      out = x;
      break;
    }
  }
  return out;
}
/** 3 段を 1 つの文章に */
export const spokenText = (x: Spoken) => [x.now, x.cause, x.ask].filter(Boolean).join(isEn ? ' ' : '');
export const REGISTERS: Register[] = ['polite', 'genki', 'assert', 'tosa', 'archaic', 'gentle', 'terse', 'rough'];
