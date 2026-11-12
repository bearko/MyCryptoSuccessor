/**
 * 段 UIX3w：ランクが上がる進出のあとの「災害と徴収」の演出と、「道が開いた」のお知らせ（方向 C「管制卓」。入のときだけ。
 * docs/ISLAND_UIX.md「画面：災害と徴収」）。流れ・出す中身・押せる所は今の演出（p1/disaster.ts）と同じ：
 * ① 警報（災害：揺れ・雨・稲光）→ ② 被害（町の札が順に「被災 N 軒」）→ ③ ランド復興局の通知（全額徴収）→
 * ④ 復興協定書（店の名前を決めて、サインが 1 字ずつ書かれる）→ ハンコ → ⑤ 支度金と、失ったもの／残ったもののまとめ。
 * 押すと次へ（自動でも進む）。「とばす」で、まとめへ（店の名前がまだなら、協定書のサインへ）。
 * まとめは、押すまで出したままにする（何を失って何が残ったかを、ひと目で読めるように）。
 * 窓は今の目印（.isl-modal.isl-disaster）を付ける：出ているあいだ、時間も到着の案内も止まる。
 */
import { t } from '../../../i18n';
import { el, type Kid } from '../dom';
import { coinsPop, sparks } from '../fx';
import { later } from '../loop';
import { Odo, shake, uxKey, uxLamp, uxTape, vibrate } from '../parts';
import { isCalm } from '../prefs';
import { uxScene, uxSfx } from '../sound';
import { bare } from './conquer';
import { nameLines } from './land';
import { safe } from './s-press';
import { W } from './w-deps';
import { wIcon } from './w-icons';
import './disaster.css';
import type { DisasterView, RoadView } from './w-slots';

/** 段の長さ（今の演出と同じ値。ms） */
export const DS = { storm: 2600, hit: 350, hitTail: 300, damage: 2600, notice: 4200, char: 220, charTail: 400, sign: 1200, stampHit: 260, stamp: 2200, out: 350 };
/** 段の名前（進みのランプの順） */
export const DS_STEPS = ['storm', 'damage', 'notice', 'sign', 'grant'] as const;
export type DsStep = (typeof DS_STEPS)[number] | 'stamp';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）

/**
 * 演出の進み（DOM なし）：押す・時間で次の段へ。busy のあいだ（被害の札を打っている・サインを書いている・名前の入力）は、押しても進まない。
 * まとめ（grant）は、自動では終わらない（押して終える）。とばす：店の名前があればまとめへ、無ければ協定書（サイン）へ
 */
export function disasterCore(ev: Record<'storm' | 'damage' | 'notice' | 'sign' | 'grant' | 'finish', () => void>, hasName: () => boolean) {
  let step: DsStep | 'none' | 'done' = 'none';
  let busy = false;
  const go = (to: 'storm' | 'damage' | 'notice' | 'sign' | 'grant') => {
    step = to;
    ev[to]();
  };
  return {
    get step() {
      return step;
    },
    get busy() {
      return busy;
    },
    setBusy: (v: boolean) => (busy = v),
    /** ハンコを押した（サインのあと） */
    stamped: () => (step = 'stamp'),
    start: () => go('storm'),
    /** 時間が来た：その段からだけ進む */
    auto(from: DsStep) {
      if (step !== from) return;
      if (from === 'storm') go('damage');
      else if (from === 'damage') go('notice');
      else if (from === 'notice') go('sign');
      else if (from === 'stamp') go('grant');
    },
    /** 押した（今の演出と同じ：サインの段は押しても進まない） */
    tap() {
      if (busy) return;
      if (step === 'storm') go('damage');
      else if (step === 'damage') go('notice');
      else if (step === 'notice') go('sign');
      else if (step === 'stamp') go('grant');
    },
    /** とばす */
    skip() {
      if (step === 'grant' || step === 'done' || step === 'none') return;
      busy = false;
      if (hasName()) go('grant');
      else if (step !== 'sign') go('sign');
    },
    /** まとめのキーを押した */
    finish() {
      if (step !== 'grant') return;
      step = 'done';
      ev.finish();
    },
  };
}
/** 廃墟の合計 */
export const ruinTotal = (towns: { ruins: number }[]) => towns.reduce((a, x) => a + x.ruins, 0);

// ---------------------------------------------------------------- 「道が開いた」

/** 災害の演出のあいだに届いた「道が開いた」は、まとめの札に出す（重ねて窓を出さない） */
let active: { roads: string[]; show: (() => void) | null } | null = null;

const ico = (name: string, color = '#f4ecd4', scale = 1) => wIcon(name, { color, hi: color, scale });

export function roadUx(v: RoadView) {
  if (active) {
    active.roads.push(v.text);
    active.show?.();
    return;
  }
  v.host.querySelector('.uxw-road')?.remove();
  const b = el<HTMLButtonElement>(
    'button.uxw-road.ux-root',
    { type: 'button', 'aria-live': 'polite', 'data-ux-quiet': '' },
    el('span.uxw-road-in', uxLamp('cyan', true, true), wIcon('compass', { color: '#1a1c2e', hi: '#1a1c2e', scale: 2 }), el('span.uxw-road-txt', uxTape(t('道が開いた', 'Road open'), 'dark'), el('b', bare(v.text)))),
  );
  let off: (() => void) | null = null;
  const close = () => {
    off?.();
    b.classList.add('is-out');
    later(isCalm() ? 0 : 200, () => b.remove());
  };
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  v.host.append(b);
  // 置き場所は、今のお知らせ（トースト）と同じ高さ：上の帯の数字に重ねない
  const tb = v.host.querySelector('.isl-toasts')?.getBoundingClientRect();
  if (tb && tb.top > 8) b.style.top = `${Math.round(tb.top)}px`;
  uxSfx('rankup');
  if (!isCalm()) {
    const r = b.getBoundingClientRect();
    sparks({ x: r.left + 28, y: r.top + r.height / 2 }, 12, ['#5fe4ff', '#fffdf3', '#ffb81f']);
  }
  off = later(4200, close);
}

// ---------------------------------------------------------------- 災害と徴収

export function openDisasterUx(v: DisasterView) {
  const m = el('div.isl-modal.isl-disaster.ux-root.uxw-ds');
  const calm = isCalm();
  const offs: (() => void)[] = [];
  let timer: (() => void) | null = null;
  const wait = (ms: number, f: () => void) => {
    timer?.();
    timer = later(ms, f);
  };
  let name = v.storeName;
  const sceneOff = uxScene('sector');
  const mine = { roads: [] as string[], show: null as (() => void) | null };
  active = mine;

  // ---- 器：警報の帯・進みのランプ・とばす／舞台／下の一行
  const lamps = DS_STEPS.map(() => uxLamp('bad'));
  const stepName = el('b');
  const skip = uxKey(t('とばす', 'Skip'), () => core.skip(), { kind: 'weak', cls: 'uxw-ds-skip' });
  const alarm = el('b', t('警報', 'ALERT'));
  const head = el('header.uxw-ds-head', el('span.uxw-ds-alarm', uxLamp('bad', true, true), ico('warn', '#1a1c2e'), alarm), el('div.uxw-ds-steps', { 'aria-hidden': 'true' }, lamps, stepName), skip);
  const stage = el('div.uxw-ds-stage');
  const next = el('span.uxw-ds-next', t('押すと進みます', 'Tap to continue'));
  const foot = el('footer.uxw-ds-foot', next);
  m.append(el('div.uxw-ds-sky', { 'aria-hidden': 'true' }, el('i.uxw-ds-haz'), el('i.uxw-ds-haz.is-b'), el('i.uxw-ds-flash')), head, stage, foot);

  const STEP_NAME: Record<(typeof DS_STEPS)[number], string> = { storm: t('災害', 'Disaster'), damage: t('被害', 'Damage'), notice: t('通知', 'Notice'), sign: t('協定', 'Agreement'), grant: t('支度金', 'Grant') };
  const mark = (step: (typeof DS_STEPS)[number]) => {
    const k = DS_STEPS.indexOf(step);
    m.dataset.step = step;
    lamps.forEach((l, i) => {
      l.classList.toggle('is-on', i <= k);
      l.classList.toggle('is-blink', i === k);
    });
    stepName.textContent = `${k + 1}/${DS_STEPS.length} ${STEP_NAME[step]}`;
    // 札の言葉：災害と被害は「警報」（赤）・通知と協定は「手続き」（琥珀）・支度金は「再出発」（緑）。色だけにしない
    alarm.textContent = k < 2 ? t('警報', 'ALERT') : k < 4 ? t('手続き', 'PAPERS') : t('再出発', 'RESTART');
  };
  const show = (...kids: Kid[]) => {
    stage.replaceChildren(el('div.uxw-ds-page', kids));
  };

  // ---- ① 警報：揺れ・雨・稲光。ランドの町の札が並ぶ
  let map: HTMLElement | null = null;
  const ruinOdo = new Odo({ digits: Math.max(2, String(ruinTotal(v.towns)).length), size: 'l', cls: 'ux-odo--amber' });
  const townCards = () =>
    v.towns.map((tw) => {
      const img = el<HTMLImageElement>('img', { alt: '', draggable: 'false' });
      img.src = tw.icon;
      const tier = el('span.uxw-tier', el('b.ux-num', tw.tier));
      tier.style.setProperty('--tc', tw.color);
      const c = el('div.uxw-ds-town', img, el('div.uxw-ds-tname', tier, el('b', nameLines(tw.name).parts.map((x, n) => (n ? [el('wbr'), x] : x)))), el('span.uxw-ds-tstate', uxLamp('good', true), el('span', t('営業中', 'Open'))));
      c.dataset.id = tw.id;
      return c;
    });
  const hit = (c: HTMLElement, k: number, quiet = false) => {
    const tw = v.towns[k];
    c.classList.add('is-hit');
    c.querySelector('.uxw-ds-tstate')?.replaceChildren(uxLamp('bad', true), ico('warn', '#1a1c2e'), el('b', t(`被災 ${tw.ruins} 軒`, `Hit: ${tw.ruins}`)));
    if (quiet) return;
    uxSfx('clunk', { pitch: -2 + k });
    shake(c);
    const r = c.getBoundingClientRect();
    sparks({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 10, ['#ff5964', '#fffdf3', '#ffb81f']);
  };
  const stormPage = () => {
    map = el('div.uxw-ds-map', townCards());
    show(el('h2.uxw-ds-title', t('ランドを大きな災害が襲った…', 'A great disaster struck the land…')), map);
  };

  const core = disasterCore(
    {
      storm: () => {
        mark('storm');
        m.classList.add('is-storm');
        stormPage();
        // 今のドットの雨と稲光（町の札の帯）。出せなければ、帯の網目と揺れだけ
        requestAnimationFrame(() => map && m.isConnected && m.classList.toggle('is-fxrain', v.rain(map, stage)));
        uxSfx('error');
        offs.push(later(500, () => uxSfx('clink', { pitch: -6 })));
        vibrate(40);
        wait(DS.storm, () => core.auto('storm'));
      },
      damage: () => {
        mark('damage');
        timer?.();
        if (!map?.isConnected) stormPage();
        const cards = [...map!.children] as HTMLElement[];
        const total = ruinTotal(v.towns);
        const sum = el('div.uxw-ds-sum', el('span', ico('warn', '#ff5964'), t('廃墟になった建物', 'Buildings ruined')), el('span.uxw-ds-sumv', ruinOdo.el, el('b', t('軒', ''))));
        map!.after(sum);
        const done = () => {
          core.setBusy(false);
          ruinOdo.set(total, { dur: 0 });
          sum.after(el('p.uxw-ds-sub', t(`開拓した土地は荒れ地に戻り、建物はすべて廃墟に…（${v.towns.length} つの町・${total} 軒）`, `Cleared land went back to wasteland and every building was wrecked… (${v.towns.length} towns · ${total} buildings)`)));
          wait(DS.damage, () => core.auto('damage'));
        };
        if (calm) {
          cards.forEach((c, k) => hit(c, k, true));
          return done();
        }
        core.setBusy(true);
        let acc = 0;
        cards.forEach((c, k) =>
          offs.push(
            later(DS.hit * k, () => {
              hit(c, k);
              acc += v.towns[k].ruins;
              ruinOdo.set(acc, { dur: 260, onTick: () => uxSfx('tick') });
            }),
          ),
        );
        offs.push(later(DS.hit * cards.length + DS.hitTail, done));
      },
      notice: () => {
        mark('notice');
        m.classList.remove('is-storm', 'is-fxrain');
        m.classList.add('is-after');
        const levy = new Odo({ digits: Math.max(1, String(Math.round(v.levy)).length), size: 'l', value: Math.round(v.levy) });
        show(
          el(
            'section.uxw-ds-paper',
            el('div.uxw-ds-office', wIcon('office', { color: '#1a1c2e', hi: '#8a7f5c', lo: '#1a1c2e', scale: 3 }), el('b', t('ランド復興局からの通知', 'Notice from the Land Recovery Office'))),
            el('p', t('ランドの復興のため、進出企業の資金を全額徴収します。', 'For the land’s recovery, all funds of companies operating here will be levied.')),
            el('div.uxw-ds-levy', el('span', t('徴収額', 'Levy')), el('span.uxw-ds-levyv', levy.el, el('b.ux-num', 'G'))),
            el('p.uxw-ds-keep', ico('check', '#14804c'), el('span', t('研究ポイント・ヒーロー・研究で開けたパネルは、そのまま残ります。', 'Research points, heroes and research panels stay with you.'))),
          ),
        );
        uxSfx('page');
        wait(DS.notice, () => core.auto('notice'));
      },
      sign: () => {
        mark('sign');
        timer?.();
        const sig = el('span.uxw-ds-sig');
        const stampAt = el('span.uxw-ds-stampat', t('印', 'Seal'));
        const paper = el(
          'section.uxw-ds-paper.is-deed',
          el('h3', v.nth > 1 ? t(`第 ${v.nth} 回 復興協定書`, `Recovery Agreement No. ${v.nth}`) : t('復興協定書', 'Recovery Agreement')),
          el('p', t('ランド復興局（以下「甲」）と下記の店（以下「乙」）は、ランドの復興について次のとおり協定する。', 'The Land Recovery Office ("the Office") and the store below ("the Store") agree as follows on the recovery of the land.')),
          el('p', t(`第 1 条　乙は、復興のための徴収（${W.money(v.levy)}）に応じる。`, `Art. 1  The Store accepts the recovery levy (${W.money(v.levy)}).`)),
          el('p', t(`第 2 条　甲は、乙に復興の支度金（${W.money(v.grant)}）を支給し、${v.to.tierName} のセクタ「${v.to.name}」への進出を認める。`, `Art. 2  The Office pays the Store a recovery grant (${W.money(v.grant)}) and permits it to expand into ${v.to.name} (${v.to.tierName}).`)),
          el('p', t('第 3 条　乙は、被災した町の復興に努める。', 'Art. 3  The Store shall work toward rebuilding the ruined towns.')),
          el('div.uxw-ds-line', el('span', t('乙（店の名前）', 'The Store (name)')), sig, stampAt),
        );
        show(paper);
        // サイン：1 字ずつ書かれる → ハンコ（赤い印が打たれて、紙が揺れる）
        const write = (x: string) => {
          name = x;
          v.setName(x);
          const chars = [...x];
          const spans = chars.map((c) => el('i', c));
          sig.replaceChildren(...spans);
          const stamp = () => {
            if (core.step !== 'sign') return;
            core.stamped();
            const st = el(`span.uxw-ds-stamp${chars.length > 4 ? '.is-long' : ''}`, x);
            stampAt.replaceChildren(st);
            void st.offsetWidth;
            st.classList.add('is-down');
            offs.push(
              later(calm ? 0 : DS.stampHit, () => {
                uxSfx('clunk');
                uxSfx('stamp');
                vibrate(22);
                shake(paper);
                const r = st.getBoundingClientRect();
                sparks({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 12, ['#ff5964', '#fffdf3']);
              }),
            );
            wait(DS.stamp, () => core.auto('stamp'));
          };
          if (calm) {
            spans.forEach((s) => s.classList.add('is-on'));
            core.setBusy(false);
            return wait(DS.sign, stamp);
          }
          core.setBusy(true);
          spans.forEach((s, k) =>
            offs.push(
              later(DS.char * k, () => {
                s.classList.add('is-on');
                uxSfx('print');
              }),
            ),
          );
          offs.push(
            later(DS.char * chars.length + DS.charTail, () => {
              core.setBusy(false);
              wait(DS.sign, stamp);
            }),
          );
        };
        if (name) return write(name);
        // 店の名前の入力（初めてのサインだけ。以後は同じ名前）
        core.setBusy(true);
        skip.hidden = true;
        const input = el<HTMLInputElement>('input.uxw-ds-input', { type: 'text', maxlength: '16', 'aria-label': t('店の名前', 'Store name') });
        input.value = v.defaultName;
        const hint = el('span.uxw-ds-hint', t('全角 8 文字・英語 16 文字まで', 'Up to 16 letters (8 full-width)'));
        const form = el('div.uxw-ds-name.ux-plate', el('div.ux-screws'), el('b', t('店の名前を決めよう（あとのサインでも使います）', 'Name your store (used for later signatures too)')), input, hint);
        const ok = uxKey(
          t('サインする', 'Sign'),
          () => {
            const x = v.fitName(input.value) || v.defaultName;
            form.remove();
            skip.hidden = false;
            write(x);
          },
          { kind: 'main', big: true, strong: true },
        );
        input.addEventListener('input', () => {
          const x = v.fitName(input.value);
          if (x !== input.value.trim()) input.value = x;
          hint.classList.toggle('is-full', v.nameWidth(x) >= v.nameMax);
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') ok.click();
        });
        form.append(ok);
        form.addEventListener('click', (e) => e.stopPropagation());
        stage.firstElementChild?.append(form);
        offs.push(later(50, () => input.focus()));
      },
      grant: () => {
        mark('grant');
        timer?.();
        // とばしたとき：前の段の残りの動き（札を打つ・サインを書く）は止める
        offs.forEach((f) => f());
        offs.length = 0;
        m.classList.remove('is-storm', 'is-fxrain');
        m.classList.add('is-after', 'is-end');
        skip.hidden = true;
        next.hidden = true;
        const grant = new Odo({ digits: Math.max(1, String(Math.round(v.grant)).length), size: 'l', cls: 'ux-odo--amber' });
        const total = ruinTotal(v.towns);
        const row = (icoName: string, color: string, label: string, val: Kid) => el('li', ico(icoName, color), el('span', label), el('b.ux-num', val));
        const mi = el<HTMLImageElement>('img.uxw-ds-mine', { alt: '', draggable: 'false' });
        mi.src = W.assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
        const roads = el('div.uxw-ds-roads');
        mine.show = () => roads.replaceChildren(...mine.roads.map((x) => el('p', ico('compass', '#5fe4ff'), el('span', bare(x)))));
        mine.show();
        const go = uxKey(t(`${v.to.name}へ`, `On to ${v.to.name}`), safe(() => core.finish()), { kind: 'main', big: true, strong: true, ico: 'next' });
        show(
          el('div.uxw-ds-grant', mi, el('div.uxw-ds-granttxt', uxTape(t('ランドから復興の支度金', 'Recovery grant from the land'), 'amber'), el('span.uxw-ds-grantv', el('b.ux-num', '+'), grant.el, el('b.ux-num', 'G')))),
          el(
            'div.uxw-ds-cols',
            el(
              'section.uxw-ds-col.is-lose',
              el('h3', ico('minus', '#ff5964'), t('手放したもの', 'Given up')),
              el('ul', row('coin', '#ff5964', t('資金（徴収）', 'Funds (levy)'), `-${W.money(v.levy)}`), row('warn', '#ff5964', t(`建物（${v.towns.length} つの町）`, `Buildings (${v.towns.length} towns)`), t(`${total} 軒`, `${total}`))),
            ),
            el(
              'section.uxw-ds-col.is-keep',
              el('h3', ico('check', '#36e08b'), t('残ったもの', 'Still yours')),
              el(
                'ul',
                row('flask', '#36e08b', t('研究ポイント', 'Research points'), `${v.kept.rp.toLocaleString('en-US')} RP`),
                row('person', '#36e08b', t('ヒーロー', 'Heroes'), t(`${v.kept.heroes} 人`, `${v.kept.heroes}`)),
                v.kept.panels ? row('star', '#36e08b', t('研究で開けたパネル', 'Research panels'), t(`${v.kept.panels} 枚`, `${v.kept.panels}`)) : null,
                v.kept.antiques ? row('box', '#36e08b', t('運んだ骨董', 'Antiques moved'), t(`${v.kept.antiques} 個`, `${v.kept.antiques}`)) : null,
              ),
            ),
          ),
          el('p.uxw-ds-say', t(`町は、手で直すか、ヒーローに任せて復興できます。${v.to.tierName} の町「${v.to.name}」は、支度金 ${W.money(v.grant)} から始めます。`, `Towns can be rebuilt by hand or left to a hero. ${v.to.name} (${v.to.tierName}) starts with the ${W.money(v.grant)} grant.`)),
          roads,
          go,
        );
        uxSfx('stamp');
        offs.push(
          later(calm ? 0 : 260, () => {
            grant.set(v.grant, { dur: 900, onTick: () => uxSfx('coin') });
            const r = grant.el.getBoundingClientRect();
            coinsPop({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 8);
          }),
        );
      },
      finish: () => {
        timer?.();
        offs.forEach((f) => f());
        sceneOff();
        if (active === mine) active = null;
        m.classList.add('is-out');
        uxSfx('close');
        later(calm ? 0 : DS.out, () => {
          m.remove();
          v.done();
        });
      },
    },
    () => !!name,
  );
  // 押すと次へ（名前の入力・キーの上では進まない）
  m.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.uxw-ds-name, .ux-key')) return;
    core.tap();
  });
  m.addEventListener('pointerdown', (e) => e.stopPropagation());
  v.host.append(m);
  core.start();
}
