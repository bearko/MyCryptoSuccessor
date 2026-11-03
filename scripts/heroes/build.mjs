#!/usr/bin/env node
/**
 * 段 P2：ヒーローの史実の調査（docs/heroes/research/<id>.json）から、ゲームで使う分だけを小さな形にする。
 *
 *   node scripts/heroes/build.mjs          … src/island/p1/heroes/fit.json・voice.json を書き直す
 *   node scripts/heroes/build.mjs --check  … 書き直さずに、いまのファイルと同じかだけ見る（違えば失敗）
 *
 * - fit.json（いつも読み込む・小さい）：部門・役職ごとの適性（S〜D を 16 字の文字列に）と、向いている順の役（best_roles）。
 * - voice.json（日本語の表示のときだけ、あとから読み込む）：一人称・社長の呼び方・口ぐせ・場面のセリフ・適性の根拠の 1 行。
 * 出典・要約・史実の箇条書き・関係・注意書きは入れない（ゲームでは使わない）。
 * 決まり：セリフ・口ぐせ・根拠は 1 行 40 字まで（超えたら止める）。口ぐせ・呼び方の末尾の（注記）は外す。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** 研究のフォルダから、fit と voice を作る（ファイルには書かない） */
export function buildHeroData(dir = RESEARCH) {
  const files = readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => Number(a.slice(0, -5)) - Number(b.slice(0, -5)));
  const g = {};
  const best = {};
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
    const sp = d.speech ?? {};
    const l = {};
    for (const sc of SCENES) l[sc] = (sp.lines?.[sc] ?? []).map((x) => x.trim()).filter(Boolean);
    const v = {
      fp: stripNote(sp.first_person ?? ''),
      to: stripNote(sp.second_person_to_owner ?? '社長'),
      tic: (sp.tics_ja ?? []).map(stripNote).filter(Boolean),
      l,
      why: FIT_KEYS.map((k) => safeWhy((d.aptitude?.[k]?.why ?? '').trim())),
    };
    for (const x of [...v.tic, ...SCENES.flatMap((sc) => l[sc])]) if ([...x].length > LINE_MAX) errs.push(`${id}: セリフが ${LINE_MAX} 字を超える「${x}」`);
    voice[id] = v;
  }
  return { fit: { k: FIT_KEYS, g, best }, voice, errs, n: files.length };
}

const json = (o) => `${JSON.stringify(o)}\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { fit, voice, errs, n } = buildHeroData();
  if (errs.length) {
    console.error(errs.join('\n'));
    process.exit(1);
  }
  const outs = [
    [join(OUT, 'fit.json'), json(fit)],
    [join(OUT, 'voice.json'), json(voice)],
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
