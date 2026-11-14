/**
 * 段 UIX5t：部長との対話（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：部長との対話」）。
 * 今の画面（p1/headtalkui.ts の render）の着せ替えをやめ、会話の器と画面の部品で組み直した。
 * - 上〜中：話題に合わせたその部門のデータ（数字の札・縦の棒・一覧の行・紙）。送れる。
 * - 下：会話の器（土台の吹き出し uxBubble：話す人が枠の上に立つ・1 字ずつ・声は人ごと・押すと最後まで）と、選択肢のキー。
 *   部長の提案の承認はレバー。却下・あとでは押すキー。決めると、決めた札に判が打たれて、次の札へ送られる。
 * 中身・並び・押した先の関数は、今の画面と同じ（HtCall で受け取る：話題・確認事項・選択肢・提案書・詳しい画面・任せる人を選ぶ）。
 * 描くたびに呼ばれる（器は今の札 open() のまま。押すと本体が描き直す）。同じ場面の描き直しでは、喋り直さない・入る動きをしない。
 */
import { t } from '../../../i18n';
import { el, type Kid } from '../dom';
import { uxIcon } from '../icons';
import { uxBubble, uxKey, uxLamp, uxLever, uxTape } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpBars, uxpCard, uxpEmpty, uxpGap, uxpHead, uxpPaper, uxpRow, uxpStamp, uxpStat } from '../sparts';
import type { TapeKind } from '../parts';
import { dFace, dIco, dRich, dStars, dText, INK, LITE } from './d-kit';
import { face, rankChip, rarTag } from './h-kit';
import { moraleTag } from './hr';
import { MINE_VOICE, richParts, voiceOf } from './talk';
import { T } from './t-deps';
import './t-talk.css';
import type { HtCall, HtOpt } from '../../p1/headtalkui';
import type { HtGrade } from '../../p1/uxt';

/** 判が打たれてから、決めた札が送り出されるまで（ms） */
export const STAMP_HOLD_MS = 420;
/** レバーの「承認済」が点いてから、本体の承認を呼ぶまで（ms。土台の口 ux.lever と同じ間） */
export const LEVER_WAIT_MS = 260;
/** 案内役の立ち絵：胸から上だけ（96×128 の上 72px を等倍で） */
export const MINE_CROP = { w: 96, h: 72 };

/** 前に描いた場面（同じ場面の描き直しでは、喋り直さない・入る動きをしない） */
let lastScene = '';
/** 決めた札の写し（判を打って送り出す）。本体が描き直したあとに、その札がもう無ければ打つ */
let ghost: { el: HTMLElement; x: number; y: number; w: number; label: string; kind: TapeKind; key: string; force: boolean } | null = null;
/** 押した直後の二度押しを止める（判・レバーの間） */
let busy = false;

const ico = (name: string, dark = false) => uxIcon(name, { ...(dark ? INK : LITE), scale: 1 });
const b = (text: Kid) => el('b', text);
/** 字の頭の記号（✔・✖・⏳・📄・←）を外す（絵は別に添える） */
export const bare = (label: string) => dText(label.replace(/^[✔✖⏳←]️?\s*/u, ''));
/** 確認事項の鍵（決めたあと、その札がまだあるかを見る） */
export const itemKey = (c: HtCall) => (c.item ? (c.item.k === 'card' ? `c${c.item.c.id}` : `p${c.item.p.id}`) : c.topic === 'hire' && c.hire.card ? `h${c.hire.card.id}:${c.hire.card.choices[c.hire.k]?.act.k}:${c.hire.card.hero ?? ''}:${c.text}` : '');
const keysOf = (c: HtCall) => [...c.items.map((x) => (x.k === 'card' ? `c${x.c.id}` : `p${x.p.id}`)), itemKey(c)];

/** 史実の適性の札（今の gradeChip と同じ中身：名前と段。根拠は title） */
function gradeTag(g: HtGrade | null, long = false): HTMLElement | null {
  if (!g) return null;
  const e = el(`span.uxh-grade.uxt-grade.is-${g.g.toLowerCase()}`, { title: g.why || undefined }, el('span', g.name), el('b.ux-num', g.g));
  e.style.setProperty('--hc', g.color);
  return long && g.why ? el('span.uxt-fit', e, el('span.uxt-fit-why', g.why)) : e;
}
/** 数字の札（値が無いときは「—」） */
function stat(label: string, v: number | null, o: { key: string; unit?: string; tone?: '' | 'bad' | 'amber'; ico?: string }) {
  if (v == null) return el('div.uxp-stat', el('span.uxp-stat-k', label), el('span.uxp-stat-v', el('b.ux-num.uxt-dash', '—')));
  return uxpStat(label, v, { key: `uxt.${o.key}`, unit: o.unit, tone: o.tone || undefined, digits: Math.max(1, String(Math.round(v)).length), size: 's' }).el;
}
/** 一行（絵・字） */
const line = (icon: string | HTMLElement, text: Kid, cls = '') => el(`p.uxt-line${cls ? '.' + cls : ''}`, typeof icon === 'string' ? ico(icon) : icon, el('span', text));

// ================================================================= 上〜中：データ（話題ごと）
function summary(c: HtCall): HTMLElement[] {
  const s = c.ctx.s();
  const v = T.htSummary(s, c.dept, c.mode);
  const out: HTMLElement[] = [];
  // 部長のウィットの一言（あいさつのときだけ。今は会話の箱の上の一行）
  if (c.quip) out.push(el('p.uxt-quip.uxt-quip-top', `— ${dText(c.quip)}`));
  out.push(
    el(
      'div.uxp-stats.uxt-stats',
      stat(t('ヒーロー', 'Heroes'), v.heroes, { key: 'heroes', unit: t('人', '') }),
      stat(t('待機中', 'Idle'), v.idle, { key: 'idle', unit: t('人', ''), tone: v.idle ? 'amber' : '' }),
      stat(t('士気の平均', 'Avg morale'), v.avg, { key: 'avg' }),
      stat(t('辞めたい', 'Want to quit'), v.quit, { key: 'quit', unit: t('人', ''), tone: v.quit ? 'bad' : '' }),
      stat(t('月の給料', 'Payroll / mo'), v.pay, { key: 'pay', unit: 'G' }),
      stat(t('採用の候補', 'Candidates'), v.cands, { key: 'cands', unit: t('人', '') }),
    ),
  );
  out.push(line('crown', dText(v.charisma)));
  if (v.last) out.push(line('doc', t(`先月（${v.last.month} か月目）：${dText(v.last.text)}`, `Last month (${v.last.month}): ${dText(v.last.text)}`), 'is-dim'));
  if (v.duties) out.push(...duties(v.duties, t('細かい配置・休ませ方は部長に任せています。確認したいことがあれば、部長から聞いてきます。', 'Your head handles staffing and rest; they’ll ask you when they need your OK.')));
  if (v.heads) {
    const D = T.DEPT[c.dept];
    out.push(uxpHead(b(t(`${D.name}部長の候補`, `Candidates for ${D.name} head`)), { kind: 'dark', ico: 'people' }));
    const list = el('div.uxp-list.uxt-list');
    for (const x of v.heads) {
      list.append(
        uxpCard({
          pic: face(x.hero, 48),
          name: el('span.uxt-name', b(x.name), dStars(x.star, null)),
          desc: el('span.uxt-tags', el(`span.uxt-q.is-${x.q >= 0.85 ? 'good' : 'amber'}`, x.qText), gradeTag(x.grade, true)),
          cls: 'uxt-cand',
          attrs: { 'data-hero': String(x.hero) },
        }),
      );
    }
    if (!v.heads.length) list.append(uxpEmpty(t('いま部長を任せられる人がいません。', 'No one can head this right now.'), { ico: 'people' }));
    out.push(list, el('p.uxt-note', t('部長を置くと、配置換え・休ませ方は部長が回し、あなたには確認したいことだけを聞いてきます。', 'With a head, staffing and rest run on their own; you only answer what they ask.')));
  }
  return out;
}
/** 部長が回している業務（行） */
function duties(list: { icon: string; name: string; note: string }[], note: string): HTMLElement[] {
  return [
    uxpHead(b(t('部長が回している業務', 'Run by your head')), { kind: 'dark', ico: 'gear' }),
    el(
      'div.uxt-duties',
      list.map((u) => el('div.uxt-duty', el('span.uxt-duty-k', dIco(u.icon), b(dText(u.name))), el('span.uxt-duty-n', dText(u.note)))),
    ),
    el('p.uxt-note', note),
  ];
}

function hire(c: HtCall): HTMLElement[] {
  const s = c.ctx.s();
  const v = T.htHire(s, c.hire.card, c.hire.k);
  const out: HTMLElement[] = [];
  if (v.offer) {
    const o = v.offer;
    const box = el(
      'section.uxt-offer.uxt-deal',
      { 'data-uxt-key': itemKey(c) },
      el('div.uxt-deal-head', uxTape(b(t('部長の提案', 'Your head suggests')), 'amber'), el('span.uxt-lv-side')),
      el('p.uxt-offer-t', dIco(o.icon), b(dText(o.label))),
      el('p.uxt-offer-s', dText(o.sub)),
      o.plan ? uxKey(t('提案書を見る', 'See the proposal'), () => c.plan(o.card, o.plan!, true, o.k), { ico: 'doc', cls: 'uxt-plan' }) : null,
    );
    out.push(box);
  }
  out.push(uxpHead(b(t(`雇える候補（${v.pool.length}）`, `Candidates (${v.pool.length})`)), { kind: 'dark', ico: 'hire' }));
  const list = el('div.uxp-list.uxt-list');
  for (const x of v.pool) {
    list.append(
      uxpCard({
        pic: face(x.hero, 48),
        name: el('span.uxt-name', b(x.name), rarTag(x.rarity)),
        desc: el('span.uxt-tags', el('span.uxt-best', el('span', x.best.name), rankChip(x.best.apt)), gradeTag(x.grade)),
        foot: el('span.uxt-wage', ico('coin'), el('span', t(`月給 ${T.money(x.wage)}`, `${T.money(x.wage)}/mo`))),
        cls: 'uxt-cand',
        attrs: { 'data-hero': String(x.hero) },
      }),
    );
  }
  if (!v.pool.length) list.append(uxpEmpty(t('いまは候補がいません。毎月入れ替わります。', 'No candidates now. They change every month.'), { ico: 'people' }));
  out.push(list, line('crown', dText(v.charisma)));
  return out;
}

function org(c: HtCall): HTMLElement[] {
  const v = T.htOrg(c.ctx.s());
  const box = el('div.uxt-org');
  for (const d of v.depts) {
    const r = el(
      `div.uxt-orgrow${d.has ? '.is-has' : ''}`,
      { 'data-dept': d.dept },
      el('span.uxt-org-d', dIco(d.icon), b(d.name)),
      el('span.uxt-org-h', d.lock ? ico('lock') : d.has ? uxLamp('good', true) : uxLamp(''), el('span', dText(d.head))),
      el('span.uxt-org-n', d.leaders ? el('span', t(`リーダー ${d.leaders.n}/${d.leaders.of}`, `Leaders ${d.leaders.n}/${d.leaders.of}`)) : null, el('span', t(`持ち場 ${d.posts}`, `Posts ${d.posts}`))),
    );
    r.style.setProperty('--d', d.color);
    box.append(r);
  }
  const out: HTMLElement[] = [uxpHead(b(t('組織（本社）', 'Organization (head office)')), { kind: 'dark', ico: 'people' }), box];
  out.push(uxpHead(b(t('気にかけたい人', 'People to watch')), { kind: 'dark', ico: 'heart' }));
  if (v.people.length) {
    // 士気（0〜100）の縦の棒：辞めたいは赤・待機中は琥珀
    out.push(uxpBars(v.people.map((p) => ({ label: p.name, value: Math.round(p.st.morale ?? 70), text: String(Math.round(p.st.morale ?? 70)), kind: p.quit ? 'bad' : p.idle ? 'main' : '' })), { max: 100, height: 120, cls: 'uxt-bars' }).el);
    const list = el('div.uxt-people');
    for (const p of v.people)
      list.append(el('div.uxt-person', { 'data-hero': String(p.hero) }, face(p.hero, 40), el('span.uxt-person-b', b(p.name), moraleTag(p.st), p.quit ? uxTape(b(t('辞めたい', 'Wants to quit')), 'amber') : p.idle ? uxTape(b(t('待機中', 'Idle')), 'dark') : null)));
    out.push(list);
  } else out.push(uxpEmpty(t('ヒーローがいません。', 'No heroes yet.'), { ico: 'people' }));
  return out;
}

function deleg(c: HtCall): HTMLElement[] {
  const who = T.htWho(c.ctx.s(), c.dept);
  if (!who) return [];
  const v = T.htDeleg(c.ctx.s(), c.dept, who.hero);
  const fx = v.fx * 100;
  return [
    el(
      'div.uxt-headcard',
      face(v.hero, 64, { breathe: true }),
      el('span.uxt-headcard-b', el('span.uxt-name', b(v.name), dStars(v.star, null)), el('span.uxt-tags', el(`span.uxt-q.is-${v.q >= 0.85 ? 'good' : 'amber'}`, v.qText), el('span.uxt-lvt.ux-num', `Lv ${v.level}`))),
    ),
    v.fitLine ? el('p.uxt-note.uxt-fitline', dText(v.fitLine)) : null,
    uxpRow(t('部門の効き目の補正', 'Department effect'), `${fx >= 0 ? '+' : ''}${fx.toFixed(1)}%`, { note: t('出来しだい', 'by quality'), tone: fx > 0 ? 'good' : '' }),
    ...duties(v.duties, t('部長を外すと、この部門の細かいことは全部あなたが決めます（詳しい画面で）。', 'Remove the head and you make every call here yourself (in the detailed screens).')),
  ].filter(Boolean) as HTMLElement[];
}

/** 確認事項 1 件（決める札）。上の帯：確認事項 n / N のランプ・承認のランプと「未承認／承認済」の置き場 */
function item(c: HtCall): HTMLElement[] {
  const it = c.item!;
  const s = c.ctx.s();
  const v = T.htItem(s, it);
  const n = c.items.length;
  const lamps = el('span.uxt-steps', { 'aria-hidden': 'true' }, n <= 8 ? c.items.map((_, i) => uxLamp(i < c.k ? 'good' : '', i <= c.k, i === c.k)) : null);
  const count = el('span.uxt-count.ux-num', `${c.k + 1} / ${n}`);
  const head = uxpHead(b(t('今月の確認事項', 'To confirm this month')), { kind: 'amber', ico: 'list', right: el('span.uxt-countbox', lamps, count) });
  head.setAttribute('aria-label', t(`確認事項 ${c.k + 1} / ${n}`, `Item ${c.k + 1} of ${n}`));
  const card = el('section.uxt-item.uxt-deal', { 'data-uxt-key': itemKey(c) });
  if (v.k === 'prop') {
    const short = v.rp ? v.haveRp < v.rp : v.cost > v.money;
    card.append(
      el('div.uxt-deal-head', el('span.uxt-who', face(v.hero, 48), el('span.uxt-who-b', uxTape(b(t(`${T.DEPT[c.dept].name}部長の提案`, `${T.DEPT[c.dept].name} head’s proposal`)), 'dark'), b(dText(v.title)))), el('span.uxt-lv-side')),
      uxpPaper({ plain: true, cls: 'uxt-why' }, el('p', dRich(v.why))),
      line('up', dText(v.est), 'is-good'),
      line('coin', v.rp ? t(`費用：研究ポイント ${v.rp}`, `Cost: ${v.rp} RP`) : t(`費用：${T.money(v.cost)}`, `Cost: ${T.money(v.cost)}`), short ? 'is-short' : 'is-dim'),
    );
    // 足りないとき：責めない言い方と目盛り（承認すると、今と同じく保留になる）
    if (short) card.append(uxpGap(v.rp ? v.haveRp : v.money, v.rp || v.cost, { unit: v.rp ? 'RP' : 'G', hint: t('承認すると、足りるまで保留になります', 'Approving holds it until you can afford it') }).el);
    card.dataset.prop = String(v.p.id);
  } else {
    const role = el('span.uxt-role', dIco(v.role.icon), b(dText(v.role.text)));
    role.style.setProperty('--d', v.role.color);
    card.append(
      el('div.uxt-deal-head', el('span.uxt-who', v.hero != null ? face(v.hero, 48) : dFace({ hero: null }, 48), el('span.uxt-who-b', role, b(v.name))), el('span.uxt-lv-side')),
      ...(v.quip ? [el('p.uxt-quip', `— ${dText(v.quip)}`)] : []),
      uxpPaper({ plain: true, cls: 'uxt-say' }, el('p', t('「', '“'), dRich(v.say), t('」', '”'))),
    );
    const list = el('div.uxt-choices');
    for (const x of v.choices) {
      list.append(
        el(
          `div.uxt-choice${x.rec ? '.is-rec' : ''}`,
          el('span.uxt-choice-t', dIco(x.icon), b(dText(x.label)), x.recTag ? uxTape(b(t('推奨', 'Pick')), 'amber') : null),
          el('span.uxt-choice-s', dText(x.sub)),
          x.plan ? uxKey(t('提案書を見る', 'See the proposal'), () => c.plan(v.c, x.plan!, x.rec, x.k), { ico: 'doc', cls: 'uxt-plan' }) : null,
        ),
      );
    }
    card.append(list);
    card.dataset.card = String(v.c.id);
  }
  return [head, card];
}

function mineImg(): HTMLImageElement {
  const im = el<HTMLImageElement>('img.uxt-mine', { alt: '', draggable: 'false' });
  im.src = T.assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
  return im;
}

/** 見出し（いまの話題） */
function topicHead(c: HtCall): HTMLElement {
  const D = T.DEPT[c.dept];
  // 部長がいないときは、今の会話の箱の肩書き（「人事・部長はいません」）をここに
  const name = c.topic === 'hire' ? t('採用の状況', 'Hiring') : c.topic === 'org' ? t('組織のこと', 'The organization') : c.topic === 'deleg' ? t('任せ方', 'Who runs it') : c.mode === 'head' ? t(`${D.name}のいま`, `${D.name} now`) : t(`${D.name}・部長はいません`, `${D.name} · no head`);
  return uxpHead(b(name), { kind: 'amber', ico: c.topic === 'hire' ? 'hire' : c.topic === 'deleg' ? 'cycle' : 'people' });
}

// ================================================================= 下：会話の器と選択肢
/** 選択肢の絵（話題・画面を開く） */
function optIco(o: HtOpt): string {
  if (o.k === 'back') return 'left';
  if (o.k === 'plan') return 'doc';
  if (o.k === 'reject') return 'close';
  if (o.k === 'later') return 'hourglass';
  if (o.k === 'choice') return 'check';
  if (o.id === 'hire' || o.id === 'pick') return 'hire';
  if (o.id === 'org') return 'people';
  if (o.id === 'check') return 'list';
  if (o.id === 'deleg') return 'cycle';
  if (o.id === 'self') return 'wrench';
  if (/給与|pay/i.test(o.label)) return 'coin';
  if (/替える|Change/.test(o.label)) return 'cycle';
  if (/外す|Remove/.test(o.label)) return 'close';
  if (/人材|recruit/i.test(o.label)) return 'hire';
  return 'people';
}
const STAMP: Partial<Record<HtOpt['k'], [string, string, TapeKind]>> = {
  approve: ['承認済', 'Approved', 'good'],
  choice: ['決定', 'Decided', 'good'],
  reject: ['却下', 'Rejected', 'dark'],
  later: ['あとで', 'Later', 'amber'],
};

/** 決める（承認・却下・あとで・手を選ぶ）：決めた札を写して、本体の関数を呼ぶ。描き直しのあとで、その札がもう無ければ判を打って送り出す */
function decide(body: HTMLElement, c: HtCall, o: HtOpt) {
  const st = STAMP[o.k];
  const card = body.querySelector<HTMLElement>('.uxt-deal');
  const data = body.querySelector<HTMLElement>('.uxt-data');
  if (st && card && data && !isCalm()) {
    const r = card.getBoundingClientRect();
    const d = data.getBoundingClientRect();
    const copy = card.cloneNode(true) as HTMLElement;
    copy.removeAttribute('data-uxt-key');
    ghost = { el: copy, x: r.left - d.left, y: r.top - d.top, w: r.width, label: t(st[0], st[1]), kind: st[2], key: itemKey(c), force: o.k === 'later' };
  } else ghost = null;
  o.on();
}
/** 描き直しのあと：決めた札がもう無い（あとでは必ず）なら、写しに判を打って送り出す */
function playGhost(body: HTMLElement, c: HtCall) {
  const g = ghost;
  ghost = null;
  if (!g || isCalm()) return;
  if (!g.force && keysOf(c).includes(g.key)) return;
  const data = body.querySelector<HTMLElement>('.uxt-data');
  if (!data) return;
  const stamp = uxpStamp(g.label, { kind: g.kind, ico: g.kind === 'good' ? 'check' : g.kind === 'amber' ? 'hourglass' : 'close' });
  stamp.el.classList.add('uxt-stamp');
  g.el.classList.add('uxt-ghost');
  g.el.append(stamp.el);
  Object.assign(g.el.style, { left: `${Math.round(g.x / 2) * 2}px`, top: `${Math.round(g.y / 2) * 2}px`, width: `${Math.round(g.w)}px` });
  data.parentElement?.append(g.el);
  stamp.hit(g.el);
  setTimeout(() => {
    g.el.classList.add('is-out');
    g.el.addEventListener('animationend', () => g.el.remove(), { once: true });
    setTimeout(() => g.el.remove(), 600);
  }, STAMP_HOLD_MS);
}

export function headTalkUx(body: HTMLElement, c: HtCall) {
  body.classList.add('isl-ht', 'uxt-ht', 'ux-root');
  body.closest('.isl-sheet')?.classList.add('has-ht', 'uxt-sheet');
  body.dataset.uxtMode = c.mode;
  const scene = `${c.key}|${c.page}|${c.text}`;
  const fresh = scene !== lastScene;
  lastScene = scene;
  busy = false;

  // 詳しい画面（今の細かい操作の画面）：札の見出しの ✕ の左（いつでも見える所。今は会話の箱の右）
  const det = uxKey(t('詳しい画面', 'Details'), () => c.detail(), { ico: 'wrench', cls: 'uxt-detail', attrs: { title: t('いままでの細かい操作の画面を開く', 'Open the detailed screens') } });

  // ---- 上〜中：データ
  const data = el('div.uxt-data', { 'data-topic': c.item ? 'check' : (c.topic ?? '') });
  data.addEventListener('scroll', () => c.scroll.set(c.key, data.scrollTop), { passive: true });
  const parts = c.item ? item(c) : [topicHead(c), ...(c.topic === 'hire' ? hire(c) : c.topic === 'org' ? org(c) : c.topic === 'deleg' ? deleg(c) : summary(c))];
  data.append(...parts);
  if (fresh && !isCalm()) parts.slice(1).forEach((p, i) => (p.classList.add('uxt-in'), p.style.setProperty('--i', String(Math.min(i, 8)))));

  // ---- 下：会話の器
  const s = c.ctx.s();
  const who = c.mode === 'head' ? T.htWho(s, c.dept) : null;
  const D = T.DEPT[c.dept];
  const isMine = !who;
  const faceEl = who ? T.heroIcon(who.hero, 64) : mineImg();
  const name = who ? who.name : t('マインちゃん', 'Mine-chan');
  const bubble = uxBubble({
    face: faceEl,
    faceSize: isMine ? MINE_CROP : { w: 64, h: 64 },
    name,
    role: who ? t(`${D.name}部長`, `${D.name} head`) : undefined,
    voice: isMine ? MINE_VOICE : voiceOf(name),
    lines: [''],
    flow: true,
    onTap: (skipped) => {
      // 押すと最後まで（喋っている途中）→ 次の枚（今の ▼ と同じ）
      if (!skipped && !c.last) c.more();
    },
  });
  if (!who) bubble.el.querySelector('.ux-stand')?.classList.add('uxt-stand-mine');
  bubble.el.classList.add('uxt-bubble');
  // 名前の下の一行（★・Lv・史実の適性）は、吹き出しの下の段の左に
  const meta = who ? el('span.uxt-meta', dStars(who.star, null), el('span.ux-num', `Lv ${who.level}`), gradeTag(who.grade)) : null;
  const foot = bubble.el.querySelector('.ux-pop-foot');
  if (meta) foot?.prepend(meta);
  bubble.el.dataset.pages = String(c.pages);

  // ---- 選択肢（最後の枚のとき。途中の枚は「つぎへ」）
  const keys = el('div.uxt-keys');
  let lever: HTMLElement | null = null;
  if (!c.last) keys.append(uxKey(t('つぎへ', 'Next'), () => c.more(), { kind: 'main', ico: 'next', cls: 'uxt-next', attrs: { 'data-ux-quiet': '' } }));
  for (const o of c.opts) {
    const label = bare(o.label);
    const rec = /\bis-rec\b/.test(o.cls);
    // 部長の提案の承認はレバー（今と同じ：「✔ 承認」で始まる選択肢）
    if (/^✔ (承認|Approve)/.test(o.label) && !lever) {
      const lv = uxLever({
        label: t('承認', 'OK'),
        aria: label,
        can: () => !busy,
        onDone: () =>
          setTimeout(() => {
            if (!body.isConnected || busy) return;
            busy = true;
            decide(body, c, o);
          }, isCalm() ? 0 : LEVER_WAIT_MS),
        shakeEl: () => body.querySelector('.uxt-deal'),
      });
      lever = el('div.uxt-lever', { 'data-uxt-opt': o.k }, lv.el);
      // 承認のランプと「未承認 → 承認済」は、決める札（データの側）の上の帯に
      const side = data.querySelector('.uxt-lv-side');
      if (side) side.append(lv.lamps, lv.done);
      else lever.append(el('span.uxt-lv-side', lv.lamps, lv.done));
      continue;
    }
    const kind = o.k === 'reject' || o.k === 'later' || o.k === 'back' ? 'weak' : rec ? 'main' : '';
    const k = uxKey(label, () => {
      if (busy) return;
      if (STAMP[o.k]) {
        busy = true;
        decide(body, c, o);
      } else o.on();
    }, { kind, ico: o.k === 'topic' ? null : optIco(o), cls: `uxt-opt${rec ? ' is-rec' : ''}${o.k === 'back' ? ' is-back' : ''}`, attrs: { 'data-uxt-opt': o.k, ...(o.id ? { 'data-topic': o.id } : {}) } });
    keys.append(k);
  }
  keys.classList.toggle('is-one', keys.childElementCount === 1);
  const talk = el(`div.uxt-talk${lever ? '.has-lever' : ''}${fresh && !isCalm() ? '.is-fresh' : ''}`, el('div.uxt-bub', bubble.el), keys, lever);
  body.append(data, talk);
  const head = body.closest('.isl-sheet')?.querySelector<HTMLElement>(':scope > .isl-sheet-box > .isl-sheet-head');
  head?.querySelectorAll(':scope > .uxt-detail').forEach((x) => x.remove());
  if (head) head.insertBefore(det, head.lastElementChild);
  else body.prepend(det);

  // 喋る：場面が替わったときだけ 1 字ずつ（同じ場面の描き直しは、すぐ全部）
  const words = document.createDocumentFragment();
  for (const p of richParts(c.text)) words.append(p.em ? el('b.isl-em.uxc-em', p.text) : document.createTextNode(p.text));
  const count = c.pages > 1 ? `${c.page + 1}/${c.pages}` : '';
  if (fresh) {
    bubble.say(words, { first: true, count });
    if (!isCalm()) uxSfx('open');
  } else {
    bubble.say(words, { first: true, count });
    bubble.skip();
  }
  void document.fonts?.ready.then(() => body.isConnected && bubble.fit(false));
  const y = c.scroll.get(c.key);
  if (y) requestAnimationFrame(() => (data.scrollTop = y));
  playGhost(body, c);
}

/** 確かめ用：前の場面を忘れる（テスト） */
export function resetHeadTalkUx() {
  lastScene = '';
  ghost = null;
  busy = false;
}
