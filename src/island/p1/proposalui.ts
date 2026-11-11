/**
 * 担当者からの提案書の画面（段 UI5a。段 UI7b で並びを作り直し、段 UI7d でスライド型にした）：UI1 のカードと同じく画面いっぱい・時間が止まる（.isl-modal）。
 * 上に話し手（顔・出どころ・肩書き・読みの確かさ）、真ん中にスライド（横にスワイプ・下の点と矢印・キーボードの ← →。部品は slideui.ts、
 * 枚数と数字は slides.ts）：① 結論 ② 何が変わる ③ 効果 ④ 影響とリスク ⑤ 付録（As-Is／To-Be・計算の注記）。
 * 「承認する」「見送る」「あとで」はどのスライドでも下に固定（推奨の札つき）。中身は brief.ts。
 * 承認すると会社のハンコ（店の名前の赤い丸印）を押す演出（pixelfx の collect-burst を印の位置で。docs/ISLAND_FX.md）のあと、
 * plan.ts の applyPlan で一気に変更し、まとめをトーストで出す。計算は plan.ts（DOM なし）。
 */
import { t } from '../../i18n';
import { errChip } from './lessonui';
import { assetUrl, drawRef } from '../../render/images';
import raw from '../../generated/catalog.json';
import { FX_PAL, fxAtEl } from '../fx/layer';
import { DEPT, POLICY, PRODUCT, skuParts, type Sku } from './data';
import { bottleneck, date, poolCap, poolUsed, stageCaps, staffOf, DAYS, type P1State, type Stage } from './model';
import { afterOf, applyPlan, baseOf, dropLine, planRows, planTitle, shopNm, type Cell, type Plan, type PlanRes, type Row } from './plan';
import { METRIC_TEXT, askTo, briefOf, chip, type Brief, type Metric } from './brief';
import { RISK_LV, SLIDE_NAME, SRC_NAME, altOnly, altsOf, askIcon, briefSpeech, counterOf, fallOf, gapRows, headlineOf, issueRows, kpisOf, longLine, metersOf, onceOf, paybackOf, projLines, propStacks, roomKpi, shortWhat, slideKinds, slideTitle, srcOfPlan, stageMap, timelineOf, topRisks, type PropSrc, type SlideId } from './slides';
import { altTable, budgetLabels, chartHead, deck, deptChip, fundsStack, gapTable, infoTip, issueTable, kpiTile, lineChart, lineLegend, meterEl, riskPair, slideBox, speechEl, stack100El, stack100Of, stageMapEl, storeChartEl, storeLegend, storeNote, timelineEl, vfallEl, vfallLegend } from './slideui';
import { ISSUE_ICON, issueLv, issueName, lvWord, type CoIssue } from './issues';
import { storeChart } from './storefc';
import { useUpOf } from './proj';
import { askDue, policyName } from './policy';
import { openPolicyPick } from './policyui';
import { after, chooseMake, type Ctx } from './screens';
import { pickMake } from './stockui';
import { craftable } from './orders';
import { btn, extImage, h, heroIcon, heroName, money, rich, signCls, signed, skuIcon } from './ui';
import { ux } from '../uix/hooks';
import { cardInbox, goneLine, inTutorial, speechText, starOf, withdrawCard, type Speech } from './card';
import { goodsName } from './moves';
import { actName } from './deleg';

export interface ProposalOpts {
  /** 現状の課題（担当者のセリフ。[[ ]] で色） */
  say?: string;
  /** 段 UI9b：3 段のセリフ（現状 → 原因 → 対応。カードから開いた提案書。無ければ課題と承認事項から作る：slides.ts の briefSpeech） */
  speech?: Speech;
  /** 肩書き（「よろず屋の店長」） */
  role?: string;
  /** 承認：既定は applyPlan（カード・受け箱は approveCard を渡す） */
  approve?: (p: Plan) => PlanRes;
  /** 閉じたあと（承認・見送る・あとで。gone：段 UI9：推奨が承認でなくなっていたので、見せずに取り下げた） */
  done?: (what: 'ok' | 'skip' | 'later' | 'gone') => void;
  /** 段 UI9：カードを作ったときの課題の一覧（提案書は同じ課題で判断する）。無ければ開いた時点の一覧 */
  iss?: CoIssue[];
  /** 段 UI9：推奨が承認でなくても見せる（撮影・確かめ用。チュートリアルのあいだは見送りでも見せる） */
  force?: boolean;
  /** 「あとで」を出す（受け箱に残る提案だけ） */
  later?: boolean;
  /** 段 UI5d：カードで推奨の手から開いた提案書（true：推奨は承認・false：カードの推奨はほかの手・無し：数字で決める。段 UI7b） */
  rec?: boolean;
  /** 段 UI7b：開いたカードの id（会社全体の「受け箱のほかの提案」から除く） */
  card?: number;
  /** 段 UI7d：出どころ（担当者・部長・倉庫・在庫・部長からの頼み・部長との会話）。無ければ手から（srcOfPlan） */
  src?: PropSrc;
}

/** お店の中の絵（窓・壁・棚の段と並ぶ商品）。いまのお店の内装の絵（窓の景色）を使い、段の数を描き分ける（仮の絵：docs/ISLAND_ART_TODO.md） */
export function shopStill(shelves: (Sku | null)[], w = 150): HTMLCanvasElement {
  const c = h('canvas', 'isl-prop-shop');
  const H = 96;
  c.width = 160;
  c.height = H;
  c.style.width = `${w}px`;
  c.style.height = `${Math.round((w * H) / 160)}px`;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const draw = (view?: HTMLImageElement) => {
    g.fillStyle = '#5a3a24';
    g.fillRect(0, 0, 160, H);
    if (view?.complete && view.naturalWidth) g.drawImage(view, 0, 0, 160, 34);
    g.fillStyle = '#7a5434';
    g.fillRect(0, 34, 160, H - 34);
    // 棚：段の数だけ（5 段まで描く。それより多ければ「+N」）
    const n = Math.min(5, shelves.length);
    const top = 40;
    const rowH = Math.min(14, Math.floor((H - top - 6) / Math.max(1, n)));
    g.fillStyle = '#3a2416';
    g.fillRect(8, top - 4, 112, rowH * n + 8);
    for (let k = 0; k < n; k++) {
      const y = top + k * rowH;
      g.fillStyle = '#c9925a';
      g.fillRect(10, y + rowH - 3, 108, 3);
      const x = shelves[k];
      if (!x) continue;
      const [key, r] = skuParts(x);
      const ref = extImage(PRODUCT[key]?.ext[r] ?? 0);
      for (let i = 0; i < 6; i++) drawRef(g, ref, 12 + i * 17, y, rowH, rowH);
    }
    if (shelves.length > n) {
      g.fillStyle = '#f7f0bc';
      g.font = 'bold 12px sans-serif';
      g.fillText(`+${shelves.length - n}`, 124, top + 12);
    }
    // レジ
    g.fillStyle = '#3a2416';
    g.fillRect(126, H - 26, 30, 20);
    g.fillStyle = '#d8b07a';
    g.fillRect(126, H - 26, 30, 3);
  };
  const view = new Image();
  view.onload = () => draw(view);
  view.src = assetUrl((raw as { windowView: string }).windowView);
  draw();
  // 商品の絵が読み込まれたら描き直す
  window.setTimeout(() => draw(view), 400);
  return c;
}

const fmtG = (v: number) => money(Math.round(v));
const PLUS = () => t('＋', '+');
const pct = (v: number) => `${Math.round(v * 100)}%`;

function cellEl(c: Cell, side: 'as' | 'to', changed: boolean): HTMLElement {
  const el = h('div', `isl-prop-cell is-${side} ${side === 'to' && changed ? 'is-new' : ''}`);
  if (c.shelves) el.append(shopStill(c.shelves, innerWidth < 600 ? 120 : 150));
  if (c.goods) {
    const list = h('div', 'isl-prop-goods');
    if (!c.goods.length) list.append(h('span', 'isl-dim', t('なし', 'None')));
    for (const x of c.goods) {
      const row = h('div', `isl-prop-good ${x.plus ? 'is-plus' : ''}`);
      const info = h('span', 'isl-prop-goodtxt');
      const nm = PRODUCT[skuParts(x.x)[0]]?.name ?? x.x;
      info.append(h('b', '', (x.plus ? PLUS() : '') + nm), h('small', '', t(`月 ${Math.round(x.units)} 個・1 日 ${fmtG(x.perDay)}`, `${Math.round(x.units)}/mo · ${fmtG(x.perDay)}/day`)));
      row.append(skuIcon(x.x, 28), info);
      list.append(row);
    }
    el.append(list);
  } else el.append(h('span', `isl-prop-txt ${c.plus ? 'is-plus' : ''}`, c.text));
  return el;
}

const sg = (v: number) => signed(v, money);
const pctTxt = (v: number | null) => (v == null ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`);
const NUM = ['①', '②', '③', '④', '⑤'];

/** 段 UI7d：Before → After の絵の行（棚の絵・商品のアイコン・倉庫の埋まり）。文だけの行は、絵の行が無いときに 2 つまで */
function pictureRows(rows: Row[]): Row[] {
  const pic = rows.filter((r) => r.changed && (r.asIs.shelves || r.toBe.goods?.length));
  return pic.slice(0, 2);
}

/**
 * 提案書を出す（時間が止まる）。承認すると、ハンコの演出のあと一気に変更する。
 * 段 UI7d：スライド型（slides.ts の slideKinds）：① 結論（顔・要約の一言・KPI のタイル・推奨の理由）② 何が変わる（承認事項を手ごとに・Before → After の絵）
 * ③ 効果（来月の利益の棒・手ごとの寄与・12 か月の累計の折れ線・お金以外のメーター）④ 影響とリスク（4 段の地図・リスクの強さ・予算と資金のメーター）
 * ⑤ 付録（As-Is／To-Be。計算の注記は ⓘ の吹き出し：段 UI7g）。横にスワイプ・下の点と矢印・キーボードの ← → で送る。ボタンはどのスライドでも下に固定（推奨の札つき）。
 * 中身は brief.ts（DOM なし）
 */
export function openProposal(ctx: Ctx, plan: Plan, o: ProposalOpts = {}) {
  const s: P1State = ctx.s();
  // 段 UI7c：最初の提案書の前に 1 回だけ、マインちゃんが経営方針を聞く（選ぶと、その方針で提案書を出す）
  if (askDue(s)) return openPolicyPick(ctx, { mine: true, then: () => openProposal(ctx, plan, o) });
  ctx.root.querySelector('.isl-prop')?.remove();
  const m = h('div', 'isl-modal isl-prop');
  ux.modal?.(m, 'prop');
  const panel = h('div', 'isl-prop-panel');
  const phone = innerWidth < 600;
  // 見込み（写しに当てて計算する）：このまま（承認しない）と承認後
  const base = baseOf(s);
  const aft = afterOf(s, plan);
  const { rows, unchanged, touched } = planRows(base, plan, aft);
  const B = briefOf(s, plan, { rec: o.rec, card: o.card, iss: o.iss }, base, aft);
  // 段 UI9：社長の前に出る提案書は、チュートリアル以外、必ず「推奨＝承認」。開いた時点で承認でなくなっていたら、見せずに取り下げる（理由の一行）
  if (B.rec !== 'ok' && !o.force && !inTutorial(s)) {
    const g = withdrawCard(s, o.card ?? -1, plan.acts[0] ?? { k: 'skill', id: '' }, B.no);
    if (g) ctx.toast(`🗂 ${goneLine(g)}`);
    ctx.sfx?.('tap');
    o.done?.('gone');
    return;
  }
  const cost = B.cost;
  const block = B.block;
  const src = o.src ?? srcOfPlan(plan);

  // 話し手（顔・出どころ・肩書き・読みの確かさ）。どのスライドでも上に
  const head = h('div', 'isl-prop-head');
  if (plan.hero != null) head.append(heroIcon(plan.hero, phone ? 44 : 56));
  else {
    const mi = h('img', 'isl-prop-mine');
    mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
    mi.alt = '';
    head.append(mi);
  }
  const who = h('div', 'isl-prop-who');
  const kick = h('span', 'isl-prop-kicker', `📄 ${SRC_NAME[src]()}`);
  if (B.dept) kick.append(deptChip(B.dept));
  who.append(kick, h('b', 'isl-prop-name', [o.role ?? '', plan.hero != null ? heroName(plan.hero) : t('マインちゃん', 'Mine-chan')].filter(Boolean).join(t('・', ' · '))));
  const st = plan.hero != null ? staffOf(s, plan.hero) : null;
  if (st) {
    const star = starOf(plan.q, st.level ?? 1);
    const starEl = h('small', 'isl-prop-star', t(`予測精度 ${'★'.repeat(star)}${'☆'.repeat(3 - star)}（±${pct(B.err)}）`, `Forecast accuracy ${'★'.repeat(star)}${'☆'.repeat(3 - star)} (±${pct(B.err)})`));
    // 段 UX1（C-1）：「予測精度 ±N%」の意味（タップで 1 行）
    starEl.append(infoTip(t(`作った日の見込みに ±${pct(B.err)} の幅があります（担当の読みの誤差。実績はこの幅でぶれる）。開くたびに在庫や他社の動きで少し変わるのは別で、変わった分は KPI の下に小さく出します`, `The forecast carries a ±${pct(B.err)} band (the proposer's reading error; results land within it). Stock and rival moves shift it a little on each open; that shift is shown under the KPIs`), t('予測精度とは', 'About forecast accuracy')));
    who.append(starEl);
    // 段 S1：数字の教えで小さくなった誤差の札
    const ec = errChip(s);
    if (ec) who.append(ec);
  }
  head.append(who);
  panel.append(head);

  const pics = pictureRows(rows);
  // 段 UI7f：倉庫の提案は課題の定義に倉庫のグラフ
  const store = B.theme === 'store';
  const kinds = slideKinds(B);
  const toMore = () => dk.go(kinds.length - 1);
  const info = () => btn(t('ⓘ 計算のしかた（付録）', 'ⓘ How it’s worked out (appendix)'), toMore, 'isl-sl-info');
  const slides: { id: SlideId; name: string; el: HTMLElement }[] = [];
  const say = B.say ?? o.say;
  // 段 UI9：メッセージ型の見出し・一言（課題 → 打ち手 → 効果と回収）。打ち手の短い名前は承認事項の 1 行目
  const what = B.asks[0] ? shortWhat(B.asks[0].what) : plan.acts[0] ? actName(s, plan.acts[0]) : planTitle(s, plan);
  // 段 UI9b：3 段のセリフ（カードの speechOf。カードが無ければ課題と承認事項から）
  const speech: Speech = o.speech ?? briefSpeech(B, what, plan.hero, s.day);
  const card = o.card != null ? (cardInbox(s).find((c) => c.id === o.card) ?? null) : null;
  const err = t(`予測精度 ±${pct(B.err)}`, `Forecast accuracy ±${pct(B.err)}`);
  // 段 UX1（C-1）：カードの提案書は、初めて開いた日の短期・長期の差を覚えて主に出す（開き直すたびに数字が変わらない）。
  // いま計算し直した数字は、タイルの下に小さく。snap が無い（マインちゃん・報告の提案書）ときは、いまの計算のまま
  if (card && !card.snap) {
    const S = B.vals.list.find((m) => m.key === 'short');
    const L = B.vals.list.find((m) => m.key === 'long');
    if (S && L) card.snap = { day: s.day, short: S.d, long: L.d };
  }
  const snap = card?.snap ?? null;
  const snapDate = snap ? date({ day: snap.day, open: s.open }) : null;

  for (const id of kinds) {
    const box = slideBox(slideTitle(id, B, what), id);
    const body = box.body;
    switch (id) {
      // ① エグゼクティブサマリー：課題の札（重要度・緊急度）・メッセージ型の一言・KPI（短期・長期・導入・回収・効くまで）・推奨と根拠・承認事項
      case 'sum': {
        // 段 UI9b：課題は表（題名・優先度 高中低・影響）。ⓘ で会社の課題の一覧
        const it = issueTable(issueRows(B));
        if (B.iss.length) it.querySelector('.isl-isst-h')?.append(infoTip(B.iss.slice(0, 6).map((x) => t(`${lvWord(issueLv(x))}：${issueName(x.key)}：${x.note}。${x.loss}`, `${lvWord(issueLv(x))}: ${issueName(x.key)}: ${x.note}. ${x.loss}`)), t('会社の課題の一覧', 'Company issues')));
        body.append(it);
        // 段 UI9b（追加 2）：サマリー文（最初の 100〜150 字）はカードのセリフと同じ仕組み（意味の層 → 型 → 語り口）。メッセージ型の一言は ⓘ に
        const pitch = h('p', 'isl-prop-pitch');
        pitch.append(rich(speechText(speech)), infoTip(headlineOf(B, what), t('一言で', 'In one line')));
        body.append(pitch);
        const grid = h('div', 'isl-sl-kpis');
        for (const k of kpisOf(B, roomKpi(poolUsed(base), poolCap(base), poolCap(aft)), { pick: true, snap })) {
          const tile = kpiTile(k);
          const m = B.vals.list.find((x) => x.key === k.key);
          if (m) tile.querySelector('.isl-sl-lab')?.append(infoTip(m.why, t(`${k.label}の計算のしかた`, `How ${k.label} is worked out`)));
          grid.append(tile);
        }
        body.append(grid);
        // 段 UX1（C-1）：いつの見込みか（初めて開いた日）と、開き直すと少し変わる理由
        if (snap && snapDate && snap.day !== s.day) body.append(h('small', 'isl-prop-snapnote', t(`短期・長期の数字は ${snapDate.month} 月 ${snapDate.day} 日に開いたときの見込み。開き直すと在庫や他社の動きで少し変わるので、変わった分は各タイルの下に`, `Short/long figures are the forecast from when first opened (M${snapDate.month} D${snapDate.day}); stock and rivals shift them a little, so the recalculated value sits under each tile`)));
        // 段 UI9b：「承認する」の欄は箇条書き（手ごとに 1 行：部門・手・費用）。「推奨」の札は出さない（承認が基本）
        const rec = h('div', `isl-sl-rec ${B.rec === 'ok' ? 'is-ok' : 'is-skip'}`);
        const top = h('div', 'isl-sl-rectop');
        top.append(h('b', '', B.rec === 'ok' ? t('承認する', 'Approve') : t('見送る', 'Pass')));
        rec.append(top);
        if (B.asks.length) {
          const will = h('ul', 'isl-sl-will');
          for (const a of B.asks.slice(0, 4)) {
            const li = h('li', '');
            const bits = [a.money ? money(a.money) : '', a.rp ? `${a.rp} RP` : '', a.monthly ? t(`毎月 ${money(a.monthly)}`, `${money(a.monthly)}/mo`) : ''].filter(Boolean);
            li.append(deptChip(a.dept), h('span', '', `${askIcon(a.kind)} ${shortWhat(a.what)}`), h('small', 'isl-sl-acost', bits.join(t('・', ' · ')) || t('費用なし', 'free')));
            will.append(li);
          }
          // 段 UX1（C-7）：入れ替えで作らなくなる商品を赤で明記（承認すると旧商品の生産が止まる）
          const dl = dropLine(s, plan);
          if (dl) {
            const li = h('li', 'isl-sl-drop');
            li.append(h('span', '', `⚠ ${dl}`));
            will.append(li);
          }
          rec.append(will);
        }
        rec.append(h('p', 'isl-prop-why', B.why));
        if (B.stance) {
          const st2 = h('ul', 'isl-sl-stance');
          const li = (cls: string, tag: string, text: string) => {
            const x = h('li', cls);
            x.append(h('span', 'isl-sl-stag2', tag), h('span', '', text.replace(/^[^：:]+[：:]\s*/, '')));
            st2.append(x);
          };
          li('is-bold', t('上振れ', 'Upside'), B.stance.bold);
          li('is-safe', t('下振れ', 'Downside'), B.stance.safe);
          rec.append(st2);
        }
        body.append(rec);
        const flags = h('div', 'isl-sl-flags');
        if (B.budget) flags.append(h('span', `isl-sl-flag ${B.budget.inside ? 'is-good' : 'is-bad'}`, B.budget.inside ? t(`✔ ${DEPT[B.budget.dept].name}部の予算内`, `✔ Within ${DEPT[B.budget.dept].name} budget`) : t(`⚠ ${DEPT[B.budget.dept].name}部の予算外（${money(B.budget.need - B.budget.rest)} 超え）`, `⚠ Over ${DEPT[B.budget.dept].name} budget by ${money(B.budget.need - B.budget.rest)}`)));
        flags.append(h('span', `isl-sl-flag ${B.co.left < B.co.reserve ? 'is-bad' : 'is-even'}`, t(`資金 ${money(B.co.cash)} → ${money(B.co.left)}`, `Funds ${money(B.co.cash)} → ${money(B.co.left)}`)));
        body.append(flags);
        for (const b of block) body.append(h('p', 'isl-bad isl-prop-block', `⚠ ${b}`));
        const moved = Math.abs(B.dProfit) >= 0.5 || B.vals.list.some((x) => x.key !== 'short' && x.key !== 'long');
        const r0 = rows.find((x) => x.kind !== 'goods' && x.kind !== 'panel' && x.changed);
        if (!moved && r0) body.append(h('p', 'isl-sl-same', t(`${r0.label}：${r0.asIs.text} → ${r0.toBe.text}`, `${r0.label}: ${r0.asIs.text} → ${r0.toBe.text}`)));
        if (kinds.length > 2) body.append(h('p', 'isl-sl-hint', phone ? t('← 横にめくると、課題の定義・打ち手・効果と費用・リスクと対策・実行計画', '← Swipe for the issue, the move, effect and cost, risks, execution') : t('→ で、課題の定義・打ち手・効果と費用・リスクと対策・実行計画', '→ for the issue, the move, effect and cost, risks, execution')));
        break;
      }
      // ② 課題の定義：現状（担当者のセリフ）・As-Is／To-Be／ギャップの事業の数字・（倉庫）倉庫のグラフ・課題の根拠
      case 'issue': {
        const [c1, c2] = twoCols(body, true);
        if (B.issue) {
          const chipRow = h('div', 'isl-sl-issue is-hit');
          chipRow.append(h('span', 'isl-sl-ilab', t('課題', 'Issue')), issueChip(B.issue));
          c1.append(chipRow);
        }
        // 段 UI9b：見出しの下に「現状・原因・対応」の文章（数字に色）。As-Is／To-Be の表はその下（根拠）
        c1.append(speechEl(speech));
        const bgs = h('ul', 'isl-prop-bg');
        for (const x of B.bg) bgs.append(h('li', '', x));
        if (B.bg.length) c1.append(chartHead(t('根拠（いまの数字）', 'Evidence (current figures)')), bgs);
        c2.append(chartHead(t('As-Is → To-Be のギャップ', 'The As-Is → To-Be gap'), err), gapTable(gapRows(B, poolCap(base), poolCap(aft))));
        if (store) c2.append(storeBlock(s, { cap: poolCap(aft), free: useUpOf(s, plan)?.mats ?? 0, days: useUpOf(s, plan)?.days }));
        break;
      }
      // ③ 打ち手：承認事項（手ごとに 1 行・部門の札・費用・依頼）・代替案との比較・Before → After の絵
      case 'move': {
        const [c1, c2] = twoCols(body, true);
        c1.append(chartHead(t('承認事項', 'For approval')), asksList(B, s, plan));
        // 段 UI9b：検討した手を状態つきで列挙（効果が薄い・予算不足・実施中・提出済み・未解放）。未解放のパネルは研究の画面へ
        const alts = altsOf(s, plan, B, card, B.iss, base);
        c2.append(chartHead(t('代替案との比較', 'Compared with alternatives'), alts.some((a) => a.status !== 'pick' && a.status !== 'keep') ? t(`検討した手 ${alts.length - 1} 本と、見送った理由`, `${alts.length - 1} other move${alts.length > 2 ? 's' : ''} considered, with why`) : altOnly()), altTable(alts, (id) => {
          close(o.later ? 'later' : 'skip');
          ctx.skills?.(id);
        }));
        if (pics.length) {
          c2.append(chartHead('Before → After'));
          for (const r of pics) c2.append(beforeAfter(r, phone));
        }
        break;
      }
      // ④ 効果と費用：縦のウォーターフォール（As-Is の利益 → 増収・費用 → To-Be）・12 か月の累計の折れ線・回収・非財務・予算と資金（100% の縦棒）
      case 'effect': {
        const [c1, c2] = twoCols(body, true);
        const fall = fallOf(B);
        // 段 UI9b：グラフの題は「来月の利益予測」だけ。凡例に色の説明は書かない
        c1.append(chartHead(t('来月の利益予測', 'Next month’s profit forecast'), err), vfallLegend(), vfallEl(fall, t(`来月の利益予測：As-Is ${money(Math.round(B.now.profit))} → To-Be ${money(Math.round(fall[fall.length - 1].v))}`, `Next month’s profit forecast: As-Is ${money(Math.round(B.now.profit))} → To-Be ${money(Math.round(fall[fall.length - 1].v))}`)));
        // 段 UI9b：回収の 1 行はサマリーの「投資回収期間」のタイルと重複するので出さない（月の利益が増えない手だけ注記）
        if (cost.money > 0 && paybackOf(B) == null) c1.append(h('p', 'isl-sl-pay', t(`💳 導入費用 ${money(cost.money)}（月の利益は増えないので、回収は ${POLICY.months} か月の合計で見る）`, `💳 Setup ${money(cost.money)} (no monthly gain; judge by the ${POLICY.months}-month total)`)));
        longParts(c2, c2, B, s);
        // 予算（事業部・会社）と資金：同じ 100% の積み上げ縦棒
        const sts = propStacks(s, B);
        const fs = fundsStack(B.co);
        if (sts.length) c2.append(chartHead(t('今期の予算：この施策の位置', 'This quarter’s budget and this plan')), stack100El(sts.map(stack100Of), budgetLabels(sts[0].delta >= 0), t('今期の予算：事業部と会社', 'This quarter’s budget: division and company')));
        c2.append(chartHead(t('資金：承認後も固定費は残る', 'Funds: fixed costs stay covered after approval')), stack100El([fs.bar], fs.labels, fs.bar.note));
        if (B.co.n > 0) c2.append(h('small', 'isl-sl-lab', t(`受け箱のほかの提案 ${B.co.n} 件（合計 ${money(B.co.money)}）`, `${B.co.n} other proposals in the inbox (${money(B.co.money)})`)));
        body.append(info());
        break;
      }
      // ⑤ リスクと対策：影響を受ける箇所（4 段の地図）・リスクごとに対策
      case 'risk': {
        const [c1, c2] = twoCols(body, true);
        const k0 = stageCaps(base, true);
        const k1 = stageCaps(aft, true);
        const bn0 = bottleneck(k0);
        const bn1 = bottleneck(k1);
        const v = (c: typeof k0, x: Stage) => (c[x].stopped ? 0 : c[x].perMonth);
        const per = Object.fromEntries((['buy', 'craft', 'haul', 'sell'] as Stage[]).map((x) => [x, (v(k1, x) - v(k0, x)) / DAYS])) as Record<Stage, number>;
        c1.append(chartHead(t('影響を受ける箇所', 'Affected areas'), t('処理量の差・1 日あたり', 'Throughput change per day')), stageMapEl(stageMap(B, touched, bn0, bn1, per)));
        const top = topRisks(B.rk);
        c2.append(chartHead(t('下振れシナリオと対策', 'Downside scenarios and responses')));
        const ul = h('ul', 'isl-sl-risks');
        for (const r of top) ul.append(riskPair(r, counterOf(r.kind)));
        if (!top.length) ul.append(h('li', 'isl-dim', t('大きな下振れシナリオは無い', 'No major downside scenario')));
        c2.append(ul);
        break;
      }
      // ⑥ 実行計画：承認日 → 完成・着任・宣伝 → 効果が出る日
      case 'plan': {
        const [c1, c2] = twoCols(body, true);
        c1.append(chartHead(t('いつ効くか', 'When it takes effect')), timelineEl(timelineOf(B)));
        const ul = h('ul', 'isl-sl-will');
        for (const a of B.asks) {
          const li = h('li', a.own ? '' : 'is-ask');
          li.append(deptChip(a.dept), h('span', '', `${askIcon(a.kind)} ${shortWhat(a.what)}${a.own ? '' : t(`（${askTo(a.dept)}）`, ` (${askTo(a.dept)})`)}`));
          ul.append(li);
        }
        c2.append(chartHead(t('承認後に動く部門', 'Divisions that act after approval')), ul, h('p', 'isl-sl-shot', t('承認すると自動で実行します。翌月の月次報告で見込みと実績を比べ、下振れなら対策（リスクと対策）を取ります', 'Carried out automatically on approval. Next month’s report compares forecast and actuals; on a shortfall, apply the responses')));
        break;
      }
      // ⑦ 付録：背景・期待効果（計算の注記は ⓘ）・月あたりの内訳・導入・リスクの全部・As-Is／To-Be の設定
      case 'more':
        appendix(body, ctx, s, plan, B, rows, unchanged, () => close('skip'), say);
        break;
    }
    slides.push({ id, name: SLIDE_NAME[id](), el: box.el });
  }
  const dk = deck(slides, () => ctx.sfx?.('page', 1.4, 0.4));
  panel.append(dk.el, dk.nav);

  // ボタン（下に固定）。推奨のボタンに「推奨」の札
  const foot = h('div', 'isl-prop-foot');
  const close = (what: 'ok' | 'skip' | 'later') => {
    dk.off();
    m.remove();
    o.done?.(what);
  };
  const ok = btn(
    t('承認する', 'Approve'),
    () => {
      if (block.length) return;
      // 段 UX1（A-6）：押した瞬間に「承認中…」にして、変更を先に反映（資金の帯が減る）。ハンコの演出のあとに閉じる
      // （前は 800 ms のあいだボタンが灰色のまま・資金も変わらず、反応していないように見えた）
      ok.disabled = true;
      const label = ok.textContent;
      ok.textContent = t('承認中…', 'Approving…');
      const r = (o.approve ?? ((p: Plan) => applyPlanSafe(ctx, p)))(plan);
      if (!r.ok) {
        ctx.sfx?.('error');
        ctx.toast(r.err === 'money' ? t('資金が足りません', 'Not enough funds') : r.err === 'rp' ? t('研究ポイントが足りません', 'Not enough RP') : t('もう打てない提案でした', 'That proposal is no longer possible'));
        ok.disabled = false;
        ok.textContent = label;
        if (r.err === 'gone') close('skip');
        return;
      }
      after(ctx);
      stampThen(ctx, panel, () => {
        ctx.sfx?.('levelup');
        const sum = r.did.length ? r.did.slice(0, 4).join(t('・', ' · ')) : t('承認しました', 'Approved');
        ctx.toast('✔ ' + sum);
        close('ok');
      });
    },
    `is-on isl-prop-ok ${B.rec === 'ok' ? 'is-rec' : ''}`,
  );
  ok.disabled = block.length > 0;
  const skip = btn(t('見送る', 'Pass'), () => close('skip'), `isl-prop-skip ${B.rec === 'skip' ? 'is-rec' : ''}`);
  // 段 UI9b：「推奨」の札は出さない（承認が基本）。「あとで（受け箱へ）」は残すが目立たせない
  foot.append(ok, skip);
  if (o.later) foot.append(btn(phone ? t('あとで', 'Later') : t('あとで（受け箱へ）', 'Later (inbox)'), () => close('later'), 'isl-prop-later is-dim'));
  panel.append(foot);
  m.append(panel);
  m.addEventListener('click', (e) => e.stopPropagation());
  ctx.root.append(m);
  ctx.sfx?.('page');
}

/**
 * 段 UI7g：結論の冒頭の課題の札（この提案が解く課題と優先。複数に効くなら 3 つまで）。解かないなら会社のいちばんの課題と「この提案では解けない」。
 * ⓘ で会社の課題の一覧（優先の順・根拠の数字）
 */
/** 段 UI9：課題の札（名前・優先・重要度 G／月・緊急度 N 日） */
export function issueChip(x: CoIssue): HTMLElement {
  const c = h('span', 'isl-sl-ichip');
  c.dataset.issue = x.key;
  c.append(document.createTextNode(`${ISSUE_ICON[x.key]} ${issueName(x.key)}`), h('small', `isl-isst-lv is-${issueLv(x)}`, t(`優先度 ${lvWord(issueLv(x))}`, `Priority: ${lvWord(issueLv(x))}`)));
  c.append(h('small', 'isl-sl-iimp', x.grow ? t(`余地 月 ${fmtG(x.impact)}`, `upside ${fmtG(x.impact)}/mo`) : t(`影響 月 −${fmtG(x.impact)}`, `impact −${fmtG(x.impact)}/mo`)));
  if (x.days != null) c.append(h('small', 'isl-sl-iday', x.days < 1 ? t('⚠ 発生中', '⚠ now') : t(`⚠ ${Math.round(x.days)} 日後`, `⚠ in ${Math.round(x.days)} d`)));
  return c;
}
export function issueStrip(B: Pick<Brief, 'solved' | 'iss'>): HTMLElement {
  const e = h('div', `isl-sl-issue ${B.solved.length ? 'is-hit' : 'is-miss'}`);
  const chipOf = issueChip;
  if (B.solved.length) {
    e.append(h('span', 'isl-sl-ilab', t('課題', 'Issue')));
    for (const x of B.solved.slice(0, 3)) e.append(chipOf(x));
  } else if (B.iss[0]) {
    e.append(h('span', 'isl-sl-ilab', t('会社の課題', 'Top issue')), chipOf(B.iss[0]), h('small', 'isl-sl-imiss', t('この提案では解けない', 'Not addressed here')));
  }
  if (B.iss.length) e.append(infoTip(B.iss.slice(0, 6).map((x) => t(`${lvWord(issueLv(x))}：${issueName(x.key)}：${x.note}。${x.loss}`, `${lvWord(issueLv(x))}: ${issueName(x.key)}: ${x.note}. ${x.loss}`)), t('会社の課題の一覧', 'Company issues')));
  return e;
}

/** 承認事項（手ごとに 1 行：部門の札・アイコン・何をするか・費用・「○○部に依頼」） */
/** 段 UI7f：倉庫のグラフの塊（見出し・凡例・グラフ・あふれる先の 1 行）。カードと提案書の結論で使う */
export function storeBlock(s: P1State, after: { cap: number; free: number; days?: number } | null, compact = false): HTMLElement {
  const c = storeChart(s, after);
  const e = h('div', 'isl-sl-sblock');
  e.append(chartHead(t('倉庫の中身（月末）と、同じペースの予想', 'Storage at month end, and the same-pace forecast')), storeLegend(c), storeChartEl(c, compact), h('p', 'isl-sl-snote', storeNote(c)));
  return e;
}

function asksList(B: Brief, s: P1State, plan: Plan): HTMLElement {
  const ol = h('ol', 'isl-sl-asks');
  for (const a of B.asks) {
    const li = h('li', a.own ? '' : 'is-ask');
    li.dataset.kind = a.kind;
    const top = h('div', 'isl-sl-askt');
    top.append(h('span', 'isl-sl-anum', NUM[a.n] ?? `${a.n + 1}.`), deptChip(a.dept), h('span', 'isl-sl-aicon', askIcon(a.kind)), h('b', 'isl-sl-awhat', shortWhat(a.what)));
    const bits = [a.money ? money(a.money) : '', a.rp ? `${a.rp} RP` : '', a.monthly ? t(`毎月 ${money(a.monthly)}`, `${money(a.monthly)}/mo`) : ''].filter(Boolean);
    const sub = h('div', 'isl-sl-asub');
    sub.append(h('span', 'isl-sl-acost', bits.join(t('・', ' · ')) || t('費用なし', 'free')));
    if (!a.own) sub.append(h('span', 'isl-sl-req', askTo(a.dept)));
    li.append(top, sub);
    ol.append(li);
  }
  if (!B.asks.length) {
    const li = h('li', '');
    li.append(h('b', 'isl-sl-awhat', planTitle(s, plan)));
    ol.append(li);
  }
  return ol;
}

/** Before → After の 1 行（棚の絵・商品のアイコン） */
function beforeAfter(r: Row, phone: boolean): HTMLElement {
  const e = h('div', 'isl-sl-ba');
  e.append(h('span', 'isl-sl-lab isl-sl-balab', r.label));
  const pair = h('div', 'isl-sl-bapair');
  const side = (c: Cell, k: 'as' | 'to') => {
    const x = h('div', `isl-sl-bacell is-${k}`);
    x.append(h('span', 'isl-sl-batag', k === 'as' ? 'Before' : 'After'));
    if (c.shelves) x.append(shopStill(c.shelves, phone ? 100 : 170), h('b', 'isl-sl-batxt', c.text));
    else if (c.goods) {
      const g = h('div', 'isl-sl-bagoods');
      if (!c.goods.length) g.append(h('span', 'isl-sl-lab', t('なし', 'None')));
      for (const x2 of c.goods.slice(0, 6)) {
        const it = h('span', `isl-sl-bagood ${x2.plus ? 'is-plus' : ''}`);
        it.append(skuIcon(x2.x, phone ? 26 : 32));
        if (x2.plus) it.append(h('b', '', PLUS()));
        g.append(it);
      }
      x.append(g, h('span', 'isl-sl-lab', c.goods.length ? t(`月 ${Math.round(c.goods.reduce((a, y) => a + y.units, 0))} 個`, `${Math.round(c.goods.reduce((a, y) => a + y.units, 0))}/mo`) : ''));
    } else x.append(h('b', 'isl-sl-batxt', c.text));
    return x;
  };
  pair.append(side(r.asIs, 'as'), h('span', 'isl-sl-baarw', '➜'), side(r.toBe, 'to'));
  e.append(pair);
  return e;
}

/** PC（幅のあるスライド）では 2 列に並べる（split が false なら 1 列：2 列目も 1 列目と同じ箱） */
function twoCols(body: HTMLElement, split: boolean): [HTMLElement, HTMLElement] {
  const w = h('div', `isl-sl-cols ${split ? 'is-two' : ''}`.trim());
  const a = h('div', 'isl-sl-col');
  if (!split) {
    w.append(a);
    body.append(w);
    return [a, a];
  }
  const b = h('div', 'isl-sl-col');
  w.append(a, b);
  body.append(w);
  return [a, b];
}

/** 効果の 12 か月：累計の折れ線（このまま vs 承認後）と、お金以外の指標のメーター */
function longParts(body: HTMLElement, body2: HTMLElement, B: Brief, s: P1State) {
  const L = longLine(B);
  // 段 UI9b：単発の施策（宣伝・使い切り）は、効き目が切れる月に印を置き、そのあとの線を薄く（As-Is と同じ傾き）
  const once = onceOf(B);
  const cutM = once != null ? Math.max(1, Math.ceil(once / DAYS)) : null;
  body.append(chartHead(t(`${POLICY.months} か月の利益の累計`, `Profit over ${POLICY.months} months (cumulative)`), once != null ? t('単発', 'One-off') : ''), lineLegend(), lineChart(L.now, L.after, cutM != null ? { once: { month: cutM, label: t(`効き目の終わり（${once} 日）`, `Effect ends (${once} d)`) } } : {}));
  if (once != null) body.append(h('p', 'isl-sl-shot', t(`📣 単発の施策（効き目 ${once} 日）：効き目が切れたあとの線は As-Is と同じ傾きになる`, `📣 One-off (${once}-day effect): after it ends, the line runs parallel to As-Is`)));
  // 段 UI7e：月ごとの見込み（使い切りの手で作る品がどこで・いつ・いくつ売れるか・倉庫があふれて入荷が止まるか）
  for (const x of projLines(B, (y) => goodsName(y as Sku), (u) => shopNm(s, u))) body.append(h('p', 'isl-sl-shot', x));
  const ms = metersOf(B);
  if (ms.length) {
    body = body2;
    body.append(chartHead(t('非財務の効果', 'Non-financial effects')));
    const g = h('div', 'isl-sl-meters');
    for (const x of ms) g.append(meterEl(x));
    body.append(g);
  }
}

/** 付録：課題の背景・期待効果の表（計算の注記は ⓘ の吹き出し）・月あたりの内訳・手ごとの分・導入・リスクの全部・As-Is／To-Be */
function appendix(body: HTMLElement, ctx: Ctx, s: P1State, plan: Plan, B: Brief, rows: Row[], unchanged: string[], closeSkip: () => void, say: string | undefined) {
  const cost = B.cost;
  const sec = (title: string, cls = '') => {
    const e = h('section', `isl-prop-sec ${cls}`.trim());
    e.append(h('h4', '', title));
    body.append(e);
    return e;
  };
  // 課題の背景
  const s2 = sec(t('課題の背景', 'Background'));
  if (say) {
    const p = h('p', 'isl-prop-say');
    p.append(t('「', '“'), rich(say), t('」', '”'));
    s2.append(p);
  }
  const bg = h('ul', 'isl-prop-bg');
  for (const x of B.bg) bg.append(h('li', '', x));
  s2.append(bg);
  // 期待効果の指標（このまま → 承認後 → 差）
  const s3 = sec(t(`期待効果（誤差 ±${pct(B.err)}）`, `Expected (±${pct(B.err)})`), 'isl-prop-effect');
  const vt = h('div', 'isl-prop-eff isl-prop-vals');
  vt.append(h('span', 'isl-prop-effh', ''), h('span', 'isl-prop-effh', t('このまま', 'As is')), h('span', 'isl-prop-effh', ''), h('span', 'isl-prop-effh', t('承認後', 'After')), h('span', 'isl-prop-effh', t('差', 'Change')));
  const fmtM = (x: Metric, v: number) => (x.key === 'short' || x.key === 'long' ? fmtG(v) : x.key === 'rp' ? `${Math.round(v).toLocaleString('en-US')} RP` : `${Math.round(v)}`);
  // 段 UI7g：計算のしかた（※）は、指標の名前の横の ⓘ の吹き出しに（開いた瞬間の文字を減らす）
  for (const x of B.vals.list) {
    const cls = signCls(x.d);
    const lab = h('span', 'isl-prop-efflabel', `${METRIC_TEXT[x.key].icon} ${METRIC_TEXT[x.key].name()}`);
    lab.append(infoTip(x.why, t(`${METRIC_TEXT[x.key].name()}の計算のしかた`, `How ${METRIC_TEXT[x.key].name()} is worked out`)));
    vt.append(lab, h('span', 'isl-prop-effnow', fmtM(x, x.now)), h('span', 'isl-prop-arrow', '→'), h('b', `isl-prop-effafter ${cls}`, fmtM(x, x.after)), h('span', `isl-prop-effd ${cls}`, chip(x).replace(/^\S+ /, '')));
  }
  s3.append(vt);
  s3.querySelector('h4')?.append(infoTip(t(`推奨は、課題を解くか・方針（${(B.vals.names ?? [B.vals.policy]).map(policyName).join('・')}）と真っ向から反しないか・予算と資金が足りるかで決めます。方針の重みは、同じ課題に効く手どうしの選び分けに使います（経営企画の「受け箱」の上の「経営方針」）`, `The recommendation checks the issue, your policies (${(B.vals.names ?? [B.vals.policy]).map(policyName).join(', ')}) and budget/funds; policy weights pick between moves for the same issue`), t('推奨の決め方', 'How the recommendation is made')));
  const h4m = h('h4', '', t('月あたりの内訳', 'Per month'));
  s3.append(h4m);
  const tbl = h('div', 'isl-prop-eff');
  tbl.append(h('span', 'isl-prop-effh', ''), h('span', 'isl-prop-effh', t('このまま', 'As is')), h('span', 'isl-prop-effh', ''), h('span', 'isl-prop-effh', t('承認後', 'After')), h('span', 'isl-prop-effh', t('差', 'Change')));
  const line = (label: string, a: number, b: number, good: 'up' | 'down', pctOn = false, sub = false) => {
    const d = b - a;
    const better = good === 'up' ? d > 0.5 : d < -0.5;
    const worse = good === 'up' ? d < -0.5 : d > 0.5;
    const cls = better ? 'is-good' : worse ? 'is-bad' : '';
    const dd = h('span', `isl-prop-effd ${cls}`, sg(d));
    if (pctOn && Math.abs(a) > 0.5 && Math.abs(d) >= 0.5) dd.append(h('small', '', t(`（${pctTxt(d / Math.abs(a))}）`, ` (${pctTxt(d / Math.abs(a))})`)));
    tbl.append(h('span', `isl-prop-efflabel ${sub ? 'is-sub' : ''}`, label), h('span', 'isl-prop-effnow', fmtG(a)), h('span', 'isl-prop-arrow', '→'), h('b', `isl-prop-effafter ${cls}`, fmtG(b)), dd);
  };
  line(t('売上', 'Sales'), B.now.sales, B.after.sales, 'up', true);
  line(t('月の費用', 'Monthly costs'), B.now.cost, B.after.cost, 'down');
  for (const r of B.costs) line(t(`・${r.label}`, `· ${r.label}`), r.now, r.after, 'down', false, true);
  line(t('利益', 'Profit'), B.now.profit, B.after.profit, 'up', true);
  s3.append(tbl);
  const notes: string[] = [t('月の費用は、この提案で変わるものだけ（給料・維持費など変わらないものは入れない）。材料費＝売れる数 × 1 個の材料費', 'Only costs this changes (wages, upkeep etc. not included). Materials = units sold × cost each')];
  if (B.after.adDays && B.after.adDays < 30) notes.push(t(`宣伝は ${B.after.adDays} 日ぶんを日割り（月 30 日のうち）`, `Ads pro-rated: ${B.after.adDays} of 30 days`));
  notes.push(t(`${POLICY.months} か月の折れ線：1 か月目は来月の利益（承認後は導入を引く）、2 か月目からは落ち着いたときの月の利益を足したもの`, `${POLICY.months}-month line: month 1 is next month’s profit (minus setup after approval), then the settled monthly profit added each month`));
  if (B.parts.length > 1) notes.push(t('どの手で、いくら：承認事項の行を上から順に足したときの、月の利益の増加', 'Which move adds how much: the monthly profit gain as each line is added in order'));
  h4m.append(infoTip(notes, t('内訳の見方', 'How to read this')));
  if (B.parts.length > 1) {
    s3.append(h('h4', '', t('手ごとの分（順に足したときの増加の内訳）', 'By move (added in order)')));
    const ul = h('ul', 'isl-prop-parts');
    for (const x of B.parts) {
      const li = h('li', '');
      const l = h('span', '');
      l.append(deptChip(x.dept), document.createTextNode(`${NUM[x.n] ?? ''} ${x.what}`));
      li.append(l, h('b', signCls(x.dProfit), t(`売上 ${sg(x.dSales)}・利益 ${sg(x.dProfit)}`, `sales ${sg(x.dSales)} · profit ${sg(x.dProfit)}`)));
      ul.append(li);
    }
    s3.append(ul);
  }
  s3.append(h('h4', '', t('導入（1 回）', 'Setup (once)')));
  const ul = h('ul', 'isl-prop-costs');
  const once = cost.items.filter((it) => !it.monthly);
  if (!once.length) ul.append(h('li', 'isl-dim', t('費用なし', 'Free')));
  for (const it of once) {
    const bits = [it.money ? fmtG(it.money) : '', it.rp ? `${it.rp} RP` : '', it.days ? t(`${it.days} 日`, `${it.days} d`) : ''].filter(Boolean);
    const li = h('li', '');
    li.append(h('span', '', it.label), h('b', '', bits.join(t('・', ' · ')) || t('—', '—')));
    ul.append(li);
  }
  s3.append(ul);
  const setup = [cost.money ? money(cost.money) : '', cost.rp ? `${cost.rp} RP` : ''].filter(Boolean).join(t('・', ' · ')) || t('0 G', '0 G');
  s3.append(h('p', 'isl-prop-total', t(`導入の合計：${setup}`, `Setup total: ${setup}`)));
  // 予想されるリスク（全部）
  const s4 = sec(t('予想されるリスク（全部）', 'All risks'));
  const rl = h('ul', 'isl-prop-risks');
  const bar = t('｜', ' | ');
  for (const x of B.rk) rl.append(h('li', '', RISK_LV[x.lv]() + bar + x.text));
  s4.append(rl);
  // As-Is ／ To-Be
  const s5 = sec(t('As-Is ／ To-Be', 'As-Is / To-Be'), 'isl-prop-more');
  const title = h('p', 'isl-prop-title');
  title.append(document.createTextNode(planTitle(s, plan)));
  s5.append(title);
  // 段 UI5c：「いまある素材で○○が作れます」の提案は、ほかの品も選べる（工房の作る物の選び方の「いまの素材で作れる」の並びへ）
  const use = plan.steps.find((x) => x.k === 'useup') as { k: 'useup'; slot: number; x: Sku } | undefined;
  if (use)
    s5.append(
      btn(
        t('ほかの品を選ぶ（いまの素材で作れる）', 'Pick another (from what we have)'),
        () => {
          closeSkip();
          pickMake(ctx, use.slot, {
            title: t(`作業台 ${use.slot + 1} で作るもの`, `What bench ${use.slot + 1} makes`),
            items: craftable(ctx.s()),
            tab: 'stock',
            onPick: (x) => chooseMake(ctx, ctx.s(), use.slot, x),
          });
        },
        'isl-prop-alt',
      ),
    );
  const grid = h('div', 'isl-prop-grid');
  grid.append(h('div', 'isl-prop-colhead is-as', t('As-Is（このまま）', 'As-Is (as is)')), h('div', 'isl-prop-colhead is-to', t('To-Be（承認後）', 'To-Be (after)')));
  for (const r of rows) {
    grid.append(h('div', 'isl-prop-rowlabel', r.label));
    grid.append(cellEl(r.asIs, 'as', r.changed), cellEl(r.toBe, 'to', r.changed));
  }
  if (rows.length) s5.append(grid);
  // 段 UI7g：変わらない段（※ ○○は変更なし）は、見出しの横の ⓘ に
  if (unchanged.length) s5.querySelector('h4')?.append(infoTip(unchanged.map((u) => u.replace(/^※|^\* /, '')), t('変わらない箇所', 'Unchanged areas')));
}

/** 既定の承認（applyPlan） */
function applyPlanSafe(_ctx: Ctx, p: Plan): PlanRes {
  return applyPlan(_ctx.s(), p);
}

/**
 * ハンコの演出：提案書の右下に会社のハンコ（店の名前の赤い丸印。災害の協定書のハンコを小さく流用）を押し、
 * 押した瞬間に pixelfx の collect-burst（金）を印の位置で。そのあと then（一気に変更）。押す場所の上に長く残さない（0.8 秒）
 */
function stampThen(ctx: Ctx, panel: HTMLElement, then: () => void) {
  const s = ctx.s();
  const name = s.storeName || t('承認', 'OK');
  const wrap = h('div', 'isl-prop-stampat');
  const st = h('span', 'isl-disaster-stamp isl-prop-stamp');
  st.classList.toggle('is-long', [...name].length > 4);
  st.textContent = name;
  wrap.append(st);
  panel.append(wrap);
  void st.offsetWidth;
  st.classList.add('is-down');
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(() => {
    ctx.sfx?.('place', 1.2, 0.8);
    panel.classList.add('is-bump');
    fxAtEl('collect-burst', st, { palette: FX_PAL.gold, dy: 30 });
  }, reduce ? 0 : 260);
  window.setTimeout(then, reduce ? 50 : 800);
}
