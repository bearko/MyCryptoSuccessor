/**
 * 段 S1：教え（ヒーロー → 社長への Successor）。史実の調査（docs/heroes/research/<id>.json）の言葉だけから、ヒーローごとに教えを 1 つ作る。
 * 新しい人物の事実は作らない：名前＝調査の「強み」の 1 つ・中身＝その人の口ぐせか提案のセリフ（調査の下書き）・もと＝調査の逸話か史実の 1 文。
 *
 * - 型（8 つ）は、強み（重み 3）・性格・口調・口ぐせ・提案のセリフ（重み 1）に出てくる言葉と、段 I2b の施策の好み（styleOf）・適性の S から決める。
 * - コラボのヒーロー（kind collaboration：他社の作品の設定を使わない）と、いまも信仰される神（kind mythological）には教えを付けない。
 * - 今の国・組織の名前と、暴力・最期にふれる文（build.mjs の WHY_NG）は、名前・中身・もとに使わない（無ければ、もとは空）。
 * - 伝承・物語の人物（legendary・fictional）のもとは「伝承では、」で始める（史実として断定しない）。
 */

/** 型の並び（fit.json の ls の数字。src/island/p1/lesson.ts の LESSON_TYPES と同じ順） */
export const LESSON_TYPES = ['decide', 'speed', 'steady', 'novel', 'people', 'customer', 'numbers', 'deal'];

/** 型ごとの言葉（調査の言葉に出てくる数を数える） */
export const LESSON_WORDS = {
  decide: ['決断', '果断', '即断', '大胆', '覚悟', '統率', '率い', '先頭', '度胸', '勇', '腹をくく', '迷わ', '決め', '構想', '天下', '指揮', '采配', '度量', '大局'],
  speed: ['速', '素早', 'すぐ', '機敏', '迅速', '機動', '行動力', '実行力', '先手', '機転', '電撃', 'すばや', '早', '急'],
  steady: ['粘り', '根気', '忍耐', '堅実', '着実', '地道', '慎重', '継続', 'やり抜', '倹約', '節約', '辛抱', '用心', '我慢', '一歩ずつ', 'こつこつ', '不屈', '規律', '誠実', '正確'],
  novel: ['発想', '発明', '独創', '工夫', '新し', '型破り', '奇策', '創造', '好奇心', '探究', '革新', '柔軟', '機知', '奇抜', '常識', '試', '自由', '見かけ'],
  people: ['育て', '弟子', '教え', '人材', '登用', '人望', '面倒見', '後進', '門人', '任せ', '人を見る', '仲間', '部下', '慕', '人心', 'まとめ', '才を見抜'],
  customer: ['客', '人の心', '民', '庶民', 'もてなし', '親しみ', '共感', '寄り添', '喜ば', '楽しま', '笑わせ', '人気', '評判', '思いやり', '暮らし', 'ひきつけ', '引きつけ', '心をつか', '優し'],
  numbers: ['数字', '数え', '数を', '数学', '計算', 'データ', '測', '記録', '観察', '分析', '帳簿', '会計', '統計', '実証', '証拠', '調べ', '情報', '読む力', '見抜', '計画', '帳面', '実測', '推理'],
  deal: ['交渉', '外交', '説得', '弁舌', '話術', '言葉で', '同盟', '調停', '取引', '交易', '商い', '売り込', '仲立ち', '人脈', '駆け引き', '談判', '和睦', '社交', '語り'],
};
/** 型ごとの適性の S（その欄が S なら +1） */
const APT_S = { decide: ['strategy', 'sector_head'], speed: ['logistics'], steady: ['general'], novel: ['rnd', 'craft'], people: ['hr'], customer: ['support', 'shop', 'marketing'], numbers: ['accounting', 'systems'], deal: ['legal', 'sales'] };

/** 今の国・組織の名前（名前・中身・もとに入れない。歴史上の国名は残してよいが、今の国と同じ字のものは避ける） */
export const NOW_NG = /アメリカ|米国|合衆国|中国|日本|イギリス|英国|フランス|ドイツ|イタリア|ロシア|スペイン|インド|韓国|エジプト|ギリシャ|トルコ|オランダ|ポルトガル|メキシコ|カナダ|ブラジル|オーストリア|スイス|ポーランド|スウェーデン|ノルウェー|デンマーク|ハンガリー|モンゴル|イラン|イラク|ベトナム|ペルー|アルゼンチン|キューバ|ベルギー|スコットランド|アイルランド|イングランド|イスラエル|パキスタン|チェコ|ネパール|フィリピン|インドネシア|オーストラリア|大学|教会|博物館|美術館|財団|研究所|銀行|新聞|株式会社|神社|神宮|寺院|大聖堂|ノーベル|オリンピック|ユネスコ|世界遺産|[A-Za-z]{2,}/;

const count = (txt, ws) => ws.reduce((a, w) => a + txt.split(w).length - 1, 0);
/** 末尾の（注記）を外す */
const strip = (x) => {
  const y = String(x ?? '').replace(/\s*（[^（）]*）\s*$/, '').replace(/^「|」$/g, '').trim();
  return y || String(x ?? '').trim();
};
const len = (x) => [...x].length;
/** もとの文に使わない言葉（死・病・罪・争いの場面。教えの「もと」は仕事ぶりの話だけにする） */
export const ROOT_NG = /死|没|病|捕虜|罪|盗|奪|斬|殺|戦争|大戦|攻め|奇襲|処|脱走|反乱|賊|暴|傷|殉|赤十字|英軍|決闘|一騎打ち|追放|流罪|謀|裏切|復讐|呪|拷|毒|首|淫|誘惑|妾|愛人|遊女|吉原|創作|想定|通じ|向き|向く|向い|合う|生きる|役とする|役に/;

/** 型を決める（いちばん点の高い型。同点は LESSON_TYPES の順） */
export function lessonType(d, st) {
  const strong = (d.strengths_ja ?? []).join(' ');
  const soft = [d.personality_ja ?? '', d.speech?.tone_ja ?? '', ...(d.speech?.tics_ja ?? []), ...(d.speech?.lines?.propose ?? [])].join(' ');
  const sc = {};
  for (const k of LESSON_TYPES) {
    sc[k] = count(strong, LESSON_WORDS[k]) * 3 + count(soft, LESSON_WORDS[k]);
    for (const a of APT_S[k]) if (d.aptitude?.[a]?.g === 'S') sc[k] += 1;
  }
  const c = (i) => st?.[i] ?? '-';
  if (c(0) === 'A') sc.decide += 1.5;
  if (c(1) === 'F') sc.speed += 1.5;
  if (c(1) === 'S' || c(0) === 'D') sc.steady += 1;
  if (c(2) === 'K') sc.novel += 1.5;
  if (c(3) === 'N') sc.people += 2;
  let best = LESSON_TYPES[0];
  for (const k of LESSON_TYPES) if (sc[k] > sc[best]) best = k;
  return { type: best, score: sc };
}

/** 2 字のかたまりの重なり（もとの文を、強みに近いものから選ぶ） */
const grams = (x) => {
  const s = [...x.replace(/[、。・\s「」（）]/g, '')];
  const out = new Set();
  for (let i = 0; i + 1 < s.length; i++) out.add(s[i] + s[i + 1]);
  return out;
};
const overlap = (a, b) => {
  const B = grams(b);
  let n = 0;
  for (const g of grams(a)) if (B.has(g)) n++;
  return n;
};

/**
 * 1 体ぶんの教え（無ければ null）。ng は暴力・最期の言葉（build.mjs の WHY_NG）。
 * 返り値：{ y: 型の番号, n: 名前, b: 中身（その人の言葉）, r: もと（逸話・史実の 1 文。無ければ ''）}
 */
export function lessonOf(d, st, ng) {
  if (d.kind === 'collaboration' || d.kind === 'mythological') return null;
  const ok = (x) => !!x && !NOW_NG.test(x) && !ng.test(x);
  const { type } = lessonType(d, st);
  const ws = LESSON_WORDS[type];
  // 名前：強みのうち、型の言葉がいちばん多いもの（同じなら前のもの）。今の国・組織・暴力の言葉を含むものは使わない
  // 強みが「ゲーム上の創作」のヒーローは、調査に流儀が無い（教えを付けない）
  const strengths = (d.strengths_ja ?? []).filter((x) => !/創作|不明/.test(x)).map(strip).filter((x) => ok(x) && len(x) <= 22);
  if (!strengths.length) return null;
  // 武芸・戦の腕そのもの（武勇・剣・弓）は、仕事の流儀として読みにくいので後ろに回す
  const name = strengths.map((x, k) => ({ x, k, v: count(x, ws) - (/武勇|武芸|剣|弓|騎射|怪力|戦場/.test(x) ? 2 : 0) })).sort((a, b) => b.v - a.v || a.k - b.k)[0].x;
  // 中身：その人の口ぐせ・提案のセリフのうち、型の言葉か名前に近いもの（無ければ提案のセリフの 1 つ目）
  const lines = [...(d.speech?.lines?.propose ?? []), ...(d.speech?.tics_ja ?? [])].map(strip).filter((x) => ok(x) && len(x) >= 6 && len(x) <= 40);
  if (!lines.length) return null;
  const body = lines.map((x, k) => ({ x, k, v: count(x, ws) * 2 + overlap(x, name) })).sort((a, b) => b.v - a.v || a.k - b.k)[0].x;
  // もと：適性の根拠（部門・役職ごとの 1 文。S・A を先に）と逸話のうち、名前と型の言葉に近いもの（70 字まで）
  const legend = d.kind !== 'historical';
  const GW = { S: 1.5, A: 1, B: 0.3 };
  const pool = [
    ...Object.values(d.aptitude ?? {}).map((x) => ({ x: x?.why, a: GW[x?.g] ?? -1 })),
    ...(d.anecdotes ?? []).map((x) => ({ x: x.ja, a: 0.3 })),
  ]
    .map((o) => ({ ...o, x: String(o.x ?? '').trim() }))
    .filter((o) => o.a >= 0 && ok(o.x) && !ROOT_NG.test(o.x) && len(o.x) >= 8 && len(o.x) <= (legend ? 64 : 70));
  const pick = pool.map((o, k) => ({ ...o, k, v: overlap(o.x, name) * 2 + count(o.x, ws) + o.a })).sort((a, b) => b.v - a.v || a.k - b.k)[0];
  let root = pick && pick.v >= 1 ? pick.x : '';
  if (root && legend && !/^（?伝承|伝わる|とされる|伝説|物語|伝え/.test(root)) root = `伝承では、${root}`;
  return { y: LESSON_TYPES.indexOf(type), n: name, b: body, r: root };
}
