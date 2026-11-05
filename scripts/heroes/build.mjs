#!/usr/bin/env node
/**
 * 段 P2：ヒーローの史実の調査（docs/heroes/research/<id>.json）から、ゲームで使う分だけを小さな形にする。
 *
 *   node scripts/heroes/build.mjs          … src/island/p1/heroes/fit.json・voice.json を書き直す
 *   node scripts/heroes/build.mjs --check  … 書き直さずに、いまのファイルと同じかだけ見る（違えば失敗）
 *
 * - fit.json（いつも読み込む・小さい）：部門・役職ごとの適性（S〜D を 16 字の文字列に）と、向いている順の役（best_roles）・
 *   施策の好み（st。段 I2b：性格・強み・弱み・口調の調査の言葉から、攻め／守り・速さ／堅実・奇策／正攻法・人を育てる を 4 字に。styleOf）。
 * - voice.json（日本語の表示のときだけ、あとから読み込む）：一人称・社長の呼び方・口ぐせ・場面のセリフ・適性の根拠の 1 行。
 * - lesson.json（日本語の表示のときだけ、あとから読み込む。段 S1）：教えの名前・中身（その人の言葉）・もと（適性の根拠か逸話の 1 文）。
 *   型の番号は fit.json の ls（いつも読み込む。効き目の計算に使う）。作り方は lessons.mjs。
 * 出典・要約・史実の箇条書き・関係・注意書きは入れない（ゲームでは使わない）。
 * 決まり：セリフ・口ぐせ・根拠は 1 行 40 字まで（超えたら止める）。口ぐせ・呼び方の末尾の（注記）は外す。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lessonOf } from './lessons.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');
export const RESEARCH = join(ROOT, 'docs', 'heroes', 'research');
export const OUT = join(ROOT, 'src', 'island', 'p1', 'heroes');

/** 適性の欄の並び（fit.json の文字列の位置。src/island/p1/voice.ts の FIT_KEYS と同じ） */
export const FIT_KEYS = ['strategy', 'logistics', 'sales', 'marketing', 'support', 'systems', 'rnd', 'legal', 'hr', 'general', 'accounting', 'sector_head', 'shop', 'craft', 'buyer', 'digger'];
export const SCENES = ['greet', 'propose', 'approved', 'rejected', 'tired', 'success'];
export const LINE_MAX = 40;

/** 末尾の（注記）を外す（「我が主（社長）」→「我が主」・「…（エジソンの言葉として伝わる）」→「…」）。全体が（）のものはそのまま */
export const stripNote = (x) => {
  const y = x.replace(/\s*（[^（）]*）\s*$/, '').trim();
  return y || x.trim();
};

/**
 * 適性の根拠のうち、暴力・最期にふれるもの（「…が、最後は家臣の謀反で倒れた」）は、ゲームの画面には出さない（研究ファイルの cautions：悲劇的な最期を演出に使わない）。
 * 「〜が、」の前だけで意味が通るならそこまで（「家臣を働きで取り立てた。」）、通らなければ根拠なし（札だけ）
 */
export const WHY_NG = /殺|処刑|自害|自決|暗殺|切腹|謀反|斬り|戦死|最期|死刑|粛清|死に追い|反逆|陰謀|恐怖政治|討ち死/;
export function safeWhy(x) {
  if (!WHY_NG.test(x)) return x;
  const head = x.split('が、')[0];
  return head !== x && !WHY_NG.test(head) && [...head].length >= 6 ? `${head}。` : '';
}

/**
 * 段 I2b：施策の好み（経営会議の部長の「来期の計画」の選び方と言い回し）。調査の性格（personality_ja）・強み・弱み・口調（tone_ja）に
 * 出てくる言葉を数えて、4 つの軸を決める（多いほうの側。同じなら「どちらでもない」）。新しい人物の事実は作らない（調査の言葉の読み替えだけ）。
 * 1 字目 A＝攻め・D＝守り／2 字目 F＝速さ・S＝堅実／3 字目 K＝奇策（新しい手）・O＝正攻法／4 字目 N＝人を育てる。「-」はどちらでもない
 */
export const STYLE_WORDS = {
  atk: [
    ['行動派', '行動力', '大胆', '思い切', '果敢', '攻め', '勢い', '突っ走', '野心', '挑戦', '豪快', '征服', '拡大', '開拓', '型破り', '積極', '恐れない', '進取', '冒険', '覇', '天下', '先手', '強気', '熱血', '情熱'],
    ['慎重', '堅実', '用心', '警戒', '守り', '忍耐', '我慢', '現実家', '退く', '倹約', '節約', '控えめ', '穏やか', '温和', '保守', '着実', '手堅', '冷静', '身を引'],
  ],
  spd: [
    ['すぐ', '素早', '速', '即断', '即決', '思い立ったら', '機敏', '電撃', 'せっかち', '短気', '行動派', '即座', '迅速', '果断'],
    ['着実', '地道', '粘り強', '根気', '忍耐', 'こつこつ', 'コツコツ', '時間をかけ', '長期', '辛抱', '我慢強', '緻密', '丁寧', '綿密', '几帳面', '慎重'],
  ],
  odd: [
    ['奇策', '型破り', '奇抜', '新しいもの', '発想', '独創', '意表', '常識にとらわれ', '身分にとらわれ', '革新', '新し', '自由', '破天荒', '風変わり', '型にはまら', '工夫', '発明', '好奇心'],
    ['規律', '正攻法', '伝統', '秩序', '筋を通', '正義', '誠実', '規則', '生真面目', '実直', '礼節', '律儀', '忠実', '忠義', '真面目', '厳格', '義理'],
  ],
  grow: [['育て', '教え', '弟子', '門下', '人材', '登用', '人を集め', '人集め', '人望', '面倒見', '教育', '師', '慕われ', '後進', '門人', '部下思い'], []],
};
export function styleOf(d) {
  const txt = [d.personality_ja ?? '', ...(d.strengths_ja ?? []), ...(d.weaknesses_ja ?? []), d.speech?.tone_ja ?? ''].join(' ');
  const n = (ws) => ws.reduce((a, w) => a + txt.split(w).length - 1, 0);
  const ax = (k, p, m) => {
    const [pos, neg] = STYLE_WORDS[k];
    const v = n(pos) - n(neg);
    return v > 0 ? p : v < 0 ? m : '-';
  };
  return ax('atk', 'A', 'D') + ax('spd', 'F', 'S') + ax('odd', 'K', 'O') + ax('grow', 'N', '-');
}

/**
 * 段 UI9b（追加 2）：語尾の型（register）。提案書のサマリー文・カードのセリフの語り口（src/island/p1/summary.ts）。
 * 研究の口調（tone_ja）・時代（era）・一人称の言葉から規則で決める。目立つヒーローは REGISTER_OVERRIDE で確定。
 * - polite：です・ます（既定）／genki：〜だよ！・〜しよ！（元気）／assert：〜である・〜せよ（指導者の断言）／tosa：〜ぜよ・〜じゃき（土佐）／
 *   archaic：〜でござる・〜じゃ（古代・中世の人物）／gentle：〜ですね・〜でしょう（穏やか）／terse：体言止め・短文（軍人・職人）／rough：〜だ・〜だぜ（豪快）
 */
export const REGISTERS = ['polite', 'genki', 'assert', 'tosa', 'archaic', 'gentle', 'terse', 'rough'];
export const REGISTER_OVERRIDE = { 坂本龍馬: 'tosa', 織田信長: 'assert', 豊臣秀吉: 'rough', 伊能忠敬: 'polite', 金太郎: 'genki', 宮本武蔵: 'terse', 武田信玄: 'archaic' };
const REG_WORDS = {
  tosa: ['土佐'],
  assert: ['断定', '断言', '命じる', '命令口調', '尊大', '重々し', '棟梁', '威厳', '言い切る'],
  terse: ['簡潔', '短く', '寡黙', 'ぶっきらぼう', '短い言葉', '必要なことだけ', '説明はほとんど', '朴訥'],
  genki: ['元気', '明るく', '茶目', 'はきはき', '子ども', 'にぎやか', '早口', '陽気'],
  rough: ['豪快', '威勢', '骨太', '勢いがあ', '率直で', '若者言葉'],
  gentle: ['穏やか', 'やわらか', 'やさしい', '温か', 'ゆったり', '物腰', '控えめ'],
};
const ARCHAIC_FP = ['それがし', '拙者', 'わし', 'わらわ', '余', '我'];
export function registerOf(d) {
  const o = REGISTER_OVERRIDE[d.name_ja];
  if (o) return o;
  const tone = d.speech?.tone_ja ?? '';
  const fp = stripNote(d.speech?.first_person ?? '');
  const hit = (k) => REG_WORDS[k].some((w) => tone.includes(w));
  if (hit('tosa')) return 'tosa';
  if (hit('assert')) return 'assert';
  if (hit('terse')) return 'terse';
  const old = /古代|中世|戦国|平安|鎌倉|室町|春秋|三国|後漢|安土|江戸時代|ローマ|ギリシャ|紀元前|前 \d/.test(d.era ?? '');
  if (old && (ARCHAIC_FP.includes(fp) || /武家|武士|武人|古風/.test(tone))) return 'archaic';
  if (hit('genki')) return 'genki';
  if (hit('rough')) return 'rough';
  if (hit('gentle')) return 'gentle';
  return 'polite';
}

/** 研究のフォルダから、fit と voice を作る（ファイルには書かない） */
export function buildHeroData(dir = RESEARCH) {
  const files = readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => Number(a.slice(0, -5)) - Number(b.slice(0, -5)));
  const g = {};
  const best = {};
  const st = {};
  const ls = {};
  const lesson = {};
  const voice = {};
  const errs = [];
  for (const f of files) {
    const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const id = String(d.id);
    g[id] = FIT_KEYS.map((k) => {
      const x = d.aptitude?.[k]?.g;
      if (!/^[SABCD]$/.test(x ?? '')) errs.push(`${id} ${k}: 適性が無い`);
      return x ?? 'C';
    }).join('');
    best[id] = (d.best_roles ?? []).map((k) => FIT_KEYS.indexOf(k)).filter((n) => n >= 0);
    st[id] = styleOf(d);
    const L = lessonOf(d, st[id], WHY_NG);
    if (L) {
      ls[id] = L.y;
      lesson[id] = { n: L.n, b: L.b, r: L.r };
      if ([...L.b].length > LINE_MAX) errs.push(`${id}: 教えの中身が ${LINE_MAX} 字を超える「${L.b}」`);
    }
    const sp = d.speech ?? {};
    const l = {};
    for (const sc of SCENES) l[sc] = (sp.lines?.[sc] ?? []).map((x) => x.trim()).filter(Boolean);
    const v = {
      fp: stripNote(sp.first_person ?? ''),
      to: stripNote(sp.second_person_to_owner ?? '社長'),
      tic: (sp.tics_ja ?? []).map(stripNote).filter(Boolean),
      l,
      why: FIT_KEYS.map((k) => safeWhy((d.aptitude?.[k]?.why ?? '').trim())),
      reg: registerOf(d),
    };
    for (const x of [...v.tic, ...SCENES.flatMap((sc) => l[sc])]) if ([...x].length > LINE_MAX) errs.push(`${id}: セリフが ${LINE_MAX} 字を超える「${x}」`);
    voice[id] = v;
  }
  return { fit: { k: FIT_KEYS, g, best, st, ls }, voice, lesson, errs, n: files.length };
}

const json = (o) => `${JSON.stringify(o)}\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { fit, voice, lesson, errs, n } = buildHeroData();
  if (errs.length) {
    console.error(errs.join('\n'));
    process.exit(1);
  }
  const outs = [
    [join(OUT, 'fit.json'), json(fit)],
    [join(OUT, 'voice.json'), json(voice)],
    [join(OUT, 'lesson.json'), json(lesson)],
  ];
  if (process.argv.includes('--check')) {
    const bad = outs.filter(([p, s]) => {
      try {
        return readFileSync(p, 'utf8') !== s;
      } catch {
        return true;
      }
    });
    if (bad.length) {
      console.error(`古い：${bad.map(([p]) => p).join('・')}（node scripts/heroes/build.mjs で作り直す）`);
      process.exit(1);
    }
    console.log(`ok（${n} 体）`);
  } else {
    for (const [p, s] of outs) writeFileSync(p, s);
    console.log(`${n} 体：${outs.map(([p, s]) => `${p.split('/').pop()} ${(Buffer.byteLength(s) / 1024).toFixed(1)} kB`).join('・')}`);
  }
}
