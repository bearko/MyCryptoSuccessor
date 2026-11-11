/**
 * 段 UIX1s：音の見本帳（?uix=sound で開く頁）。SE を全部押して鳴らせ、BGM の場面と層を切り替えられる。
 * ゲームの本体は読み込まない（この頁だけで、新しい音を入にして鳴らす）。
 * 書き出し（確かめ用）は window.__uxs.jobs()・window.__uxs.render(name)。
 */
import './book.css';
import { t } from '../../../i18n';
import { UX_SFX, UX_SFX_MORE, type SfxName, type SfxOpts } from './bank';
import { UX_SCENES, type UxScene } from './core';
import { LEGACY_SFX, legacyToUx, type LegacySfx } from './legacy';
import { FORM_NAME, LAYER_NAME, LAYER_WHY, LEGACY_NOTE, SCENE_NAME, SFX_NOTE } from './notes';
import { renderJob, renderJobs, type RenderOpt } from './render';
import { LAYERS } from './songs';
import { uxSound } from '../sound';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const key = (label: string, note: string, on: () => void, cls = ''): HTMLButtonElement => {
  const b = el('button', `uxs-key ${cls}`.trim());
  b.type = 'button';
  b.append(el('b', '', label));
  if (note) b.append(el('small', '', note));
  // SE を聴く鍵は、押した音（press）を重ねない
  if (cls.includes('is-se')) b.dataset.uxQuiet = '1';
  b.addEventListener('click', on);
  return b;
};
const section = (title: string, note = ''): { box: HTMLElement; body: HTMLElement } => {
  const box = el('section', 'uxs-sec');
  box.append(el('h2', '', title));
  if (note) box.append(el('p', 'uxs-note', note));
  const body = el('div', 'uxs-grid');
  box.append(body);
  return { box, body };
};

/** 段を変えて鳴らす音：押すたびに次の段へ */
const STEPPED: Partial<Record<SfxName, number>> = { lever: 8, lamp: 5, slide: 11, streak: 5 };

export function openSoundBook(): void {
  const core = uxSound();
  core.init({});
  // この頁は、新しい音をいつも入にする（見た目の切り替えとは別）
  core.setOn(true, false);
  core.forceScene = 'map';
  core.forceLevel = 2;

  document.body.classList.add('uxs-on');
  document.title = t('音の見本帳 — My Crypto Successor', 'Sound book — My Crypto Successor');
  const root = el('main', 'uxs-book');
  document.body.append(root);

  // ---- 上の帯：いまの様子
  const head = el('header', 'uxs-head');
  const state = el('span', 'uxs-state');
  const now = el('span', 'uxs-now');
  const lamps = el('span', 'uxs-lamps');
  const lampEls = LAYERS.map((k) => {
    const i = el('i', 'uxs-lamp');
    i.title = LAYER_NAME[k];
    lamps.append(i);
    return i;
  });
  const beat = el('i', 'uxs-beat');
  head.append(el('h1', '', t('音の見本帳', 'Sound book')), el('p', 'uxs-note', t('どこかを押すと音が始まります。音はすべて、その場で合成しています。', 'Tap anywhere to start the sound. Everything is synthesised on the spot.')));
  const status = el('div', 'uxs-status');
  status.append(state, now, lamps, beat);
  head.append(status);
  root.append(head);

  const steps = new Map<SfxName, number>();
  const play = (name: SfxName, o?: SfxOpts) => {
    const n = STEPPED[name];
    if (n && o?.step == null) {
      const k = steps.get(name) ?? 0;
      steps.set(name, (k + 1) % n);
      core.sfx(name, { ...o, step: k });
      return;
    }
    if (name === 'blip') {
      // 吹き出しの 1 文ぶん（押すたびに喋る人が替わる）
      const v = steps.get('blip') ?? 0;
      steps.set('blip', (v + 1) % 10);
      // 字の番号は、かなの並びから作る（読点の所は鳴らない）
      const codes = Array.from({ length: 20 }, (_, i) => (i === 6 || i === 13 ? 0x3001 : 0x3042 + ((i * 7 + v * 3) % 70)));
      codes.forEach((code, i) => setTimeout(() => core.sfx('blip', { voice: v, step: code }), i * 46));
      return;
    }
    if (name === 'toggle' || name === 'zoom') {
      const k = steps.get(name) ?? 1;
      steps.set(name, k ? 0 : 1);
      core.sfx(name, { step: k });
      return;
    }
    core.sfx(name, o);
  };

  // ---- 音量
  {
    const { box, body } = section(t('音量', 'Volume'), t('BGM と SE を別々に変えられます（10 段）。消音もできます。', 'Music and effects have separate volumes (10 steps), plus mute.'));
    body.classList.add('uxs-vol');
    const row = (label: string, get: () => number, set: (v: number) => void, after: () => void) => {
      const val = el('b', 'uxs-val', String(get()));
      const wrap = el('div', 'uxs-volrow');
      wrap.append(
        el('span', 'uxs-tape', label),
        key('−', '', () => {
          set(Math.max(0, get() - 1));
          val.textContent = String(get());
          after();
        }, 'is-sq'),
        val,
        key('+', '', () => {
          set(Math.min(10, get() + 1));
          val.textContent = String(get());
          after();
        }, 'is-sq'),
      );
      return wrap;
    };
    const mute = key('', '', () => {
      core.setVol({ mute: !core.vol.mute });
      core.sfx('toggle', { step: core.vol.mute ? 0 : 1 });
      paintMute();
    }, 'uxs-mute');
    const paintMute = () => {
      mute.replaceChildren(el('b', '', core.vol.mute ? t('消音：入', 'Muted') : t('消音：切', 'Sound on')), el('small', '', core.vol.mute ? t('押すと鳴らす', 'tap to unmute') : t('押すと消す', 'tap to mute')));
      mute.setAttribute('aria-pressed', String(core.vol.mute));
    };
    paintMute();
    body.append(
      row('BGM', () => core.vol.bgm, (v) => core.setVol({ bgm: v }), () => core.sfx('slide', { step: core.vol.bgm })),
      row('SE', () => core.vol.se, (v) => core.setVol({ se: v }), () => {
        core.sfx('slide', { step: core.vol.se });
        core.sfx('deposit');
      }),
      mute,
    );
    root.append(box);
  }

  // ---- 立ち上がりの聴き比べ
  {
    const { box, body } = section(
      t('立ち上がりの聴き比べ', 'Attack A/B'),
      t(
        '見本の作りでは、ノイズの音の始まりに、1 標本だけの尖り（プチ）が、端末や拍の位置しだいで混ざります。「消す」にして、太鼓と SE を聴き比べてください。',
        'In the lab build, noise sounds may start with a one-sample spike depending on device and timing. Switch it off and compare the drums and effects.',
      ),
    );
    const b = key('', '', () => {
      core.setClean(!core.clean);
      core.sfx('toggle', { step: core.clean ? 1 : 0 });
      paintClean();
    });
    const paintClean = () => {
      b.replaceChildren(el('b', '', core.clean ? t('プチを消す', 'Spikes removed') : t('見本のまま', 'As in the lab')), el('small', '', core.clean ? t('押すと見本のままへ', 'tap for lab build') : t('押すとプチを消す', 'tap to remove spikes')));
      b.setAttribute('aria-pressed', String(core.clean));
    };
    paintClean();
    body.append(b);
    root.append(box);
  }

  // ---- BGM の場面
  const sceneKeys = new Map<UxScene, HTMLButtonElement>();
  {
    const { box, body } = section(t('BGM の場面', 'Music scenes'), t('場面は小節の頭で替わります。制覇は、連打 → 一撃 → 祝いの曲のあと、元の場面へ戻ります。', 'Scenes switch on the bar line. Conquest plays a roll, a hit and a short fanfare, then returns.'));
    for (const sc of UX_SCENES) {
      const b = key(SCENE_NAME[sc], sc, () => {
        core.forceScene = sc;
        core.tick();
      });
      sceneKeys.set(sc, b);
      body.append(b);
    }
    body.append(key(t('制覇', 'Conquest'), 'conquest', () => core.sfx('conquest'), 'is-amber'));
    root.append(box);
  }

  // ---- 地図の曲の層と構成
  const levelKeys: HTMLButtonElement[] = [];
  {
    const { box, body } = section(t('地図の曲の層（会社の勢い）', 'Map music layers (momentum)'), t('本体では、当てはまる数だけ下から重なります。層は小節の頭で出入りします。', 'In the game, one layer is added per condition met. Layers enter on the bar line.'));
    LAYERS.forEach((k, i) => {
      const b = key(`${i + 1}`, `${i ? '+' : ''}${LAYER_NAME[k]} — ${LAYER_WHY[i]}`, () => {
        core.forceLevel = i + 1;
        core.forceScene = 'map';
        core.tick();
      });
      levelKeys.push(b);
      body.append(b);
    });
    root.append(box);
    const f = section(t('地図の曲の構成（64 小節でひと回り）', 'Map music form (64 bars per cycle)'), t('押すと、その節の頭から鳴らします。1 巡めは見本と同じです。', 'Tap to play from that section. Pass 1 is the same as the lab sample.'));
    FORM_NAME.forEach((name, i) =>
      f.body.append(
        key(name, t(`${i * 8 + 1} 小節めから`, `from bar ${i * 8 + 1}`), () => {
          const m = core.music;
          if (!m || !core.eng) return;
          core.forceScene = 'map';
          m.stop();
          m.on = new Set(LAYERS.slice(0, m.level));
          m.start('map', core.eng.now + 0.15, i * 8);
        }),
      ),
    );
    root.append(f.box);
  }

  // ---- SE
  {
    const { box, body } = section(t('SE：音の口の 22 種', 'Effects: the 22 names'), t('音程は、いま鳴っている曲の和音から選びます。段のある音は、押すたびに次の段へ進みます。', 'Pitches follow the chord that is playing. Stepped sounds advance one step per tap.'));
    for (const name of UX_SFX) body.append(key(name, SFX_NOTE[name], () => play(name), 'is-se'));
    root.append(box);
    const more = section(t('SE：足した名前', 'Effects: extra names'), t('見本の細かい音と、今の音の付け替えに要る音です。', 'Finer sample sounds and the ones needed to remap the current effects.'));
    for (const name of UX_SFX_MORE) more.body.append(key(name, SFX_NOTE[name], () => play(name), 'is-se'));
    root.append(more.box);
  }

  // ---- 今の 24 種 → 新しい音
  {
    const { box, body } = section(t('今の 24 種の効果音 → 新しい音', 'The 24 current effects → new sounds'), t('押すと、付け替え先の音が鳴ります。', 'Tap to hear what each one maps to.'));
    for (const k of LEGACY_SFX as readonly LegacySfx[]) {
      const c = legacyToUx(k);
      body.append(key(`${k} → ${LEGACY_NOTE[k].to}`, LEGACY_NOTE[k].mean, () => core.sfx(c.name, c.opts), 'is-se'));
    }
    root.append(box);
  }

  // ---- いまの様子を写す
  const paint = () => {
    const d = core.debug();
    state.textContent = d.state === 'running' ? t('鳴らせます', 'Running') : d.state === 'none' ? t('どこかを押してください', 'Tap to start') : t('止まっています', 'Suspended');
    state.classList.toggle('is-on', d.state === 'running');
    const m = d.music;
    now.textContent = m ? t(`${m.song}・${m.bar + 1} 小節め・${m.layers.length} 層`, `${m.song} · bar ${m.bar + 1} · ${m.layers.length} layers`) : '—';
    lampEls.forEach((i, k) => i.classList.toggle('is-on', !!m && m.layers.includes(LAYERS[k])));
    beat.classList.toggle('is-on', !!m && m.frac < 0.25);
    for (const [sc, b] of sceneKeys) b.setAttribute('aria-pressed', String(core.forceScene === sc));
    levelKeys.forEach((b, i) => b.setAttribute('aria-pressed', String(core.forceLevel === i + 1)));
  };
  paint();
  setInterval(paint, 80);
}

// ---------------------------------------------------------------- 書き出し（確かめ用）

const b64 = (f: Float32Array): string => {
  const u = new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
  let s = '';
  for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768));
  return btoa(s);
};
(window as unknown as { __uxs: unknown }).__uxs = {
  core: () => uxSound(),
  jobs: () => renderJobs().map((j) => ({ name: j.name, set: j.set, sec: j.sec })),
  render: async (name: string, set = 'main', opt: RenderOpt = {}) => {
    const job = renderJobs().find((j) => j.name === name && j.set === set);
    if (!job) throw new Error(`no such job: ${set}/${name}`);
    const r = await renderJob(job, opt);
    return { sr: r.sr, L: b64(r.L), R: b64(r.R) };
  },
};

openSoundBook();
