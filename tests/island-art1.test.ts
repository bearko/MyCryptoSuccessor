// 段 ART1：PixelLab で作った絵（docs/ISLAND_ART_TODO.md の「済」）がそろっていて、ゲームがそれを使うこと
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { heroById } from '../src/game/catalog';
import { DEF, PENDING_ART } from '../src/island/defs';
import { DIG_CREW_HEROES, FACTORY } from '../src/island/p1/data';
import { isGate, newP1 } from '../src/island/p1/model';
import { artLook } from '../src/island/p1/render';
import { heroName } from '../src/island/p1/ui';
import { CREW_IDS, PORTER_ID, WALKER_ART } from '../src/island/p1/walkers';

const B = 'public/island/b';
/** PNG の幅と高さ（IHDR） */
function size(path: string): [number, number] {
  const b = readFileSync(path);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('建物の絵', () => {
  it('buildings.json の建物は、どれも正面と背面の絵がある・絵の無い建物（PENDING_ART）は無い', () => {
    const list = JSON.parse(readFileSync('scripts/island/buildings.json', 'utf8')) as { id: string }[];
    const missing = list.filter((x) => !existsSync(`${B}/${x.id}/rd.png`) || !existsSync(`${B}/${x.id}/lu.png`)).map((x) => x.id);
    expect(missing).toEqual([]);
    expect(PENDING_ART).toEqual([]);
    for (const id of ['elephant_works', 'g9_hall', 'robot_lab']) expect(DEF[id], id).toBeTruthy();
  });

  it('工房の段の絵：町工場は 1×2（300×255）・大工場は 2×2（400×340）', () => {
    expect(FACTORY.art).toEqual([null, 'workshop_lv1', 'workshop_lv2']);
    for (const k of ['rd', 'lu']) {
      expect(size(`${B}/workshop_lv1/${k}.png`)).toEqual([300, 255]);
      expect(size(`${B}/workshop_lv2/${k}.png`)).toEqual([400, 340]);
    }
    expect(size('scripts/island/bases/empty_2x2.png')).toEqual([400, 340]);
  });

  it('場面で替える絵（関所の開閉・町の長の家・境の拠点）と展示館の絵がある', () => {
    for (const id of ['gate', 'gate_open', 'chief_home', 'border_hub', 'museum']) for (const k of ['rd', 'lu']) expect(existsSync(`${B}/${id}/${k}.png`), `${id}/${k}`).toBe(true);
  });

  it('町の関所は、開通の前は関所の絵・開通したら開いた絵', () => {
    const s = newP1(7);
    const gate = s.buildings.find(isGate)!;
    expect(gate).toBeTruthy();
    s.gateOpen = false;
    expect(artLook(s)(gate, DEF[gate.id]).art).toBe('gate');
    s.gateOpen = true;
    expect(artLook(s)(gate, DEF[gate.id]).art).toBe('gate_open');
    // ほかの建物はそのまま
    const other = s.buildings.find((b) => !isGate(b))!;
    expect(artLook(s)(other, DEF[other.id])).toBe(DEF[other.id]);
  });
});

describe('地図の小物と歩く人', () => {
  it('小物の絵がある（番所・トラック 2 種・関税の金貨・立て札・ダンジョンの入り口）', () => {
    for (const n of ['border_booth', 'truck_full', 'truck_empty', 'toll_coin', 'revive_sign', 'dungeon_gate']) expect(existsSync(`public/island/props/${n}.png`), n).toBe(true);
    expect(size('public/island/props/dungeon_gate.png')).toEqual([320, 212]);
  });

  it('名前のない歩く人：64×64 の絵があり、ヒーローの一覧（図鑑・採用）には入らない', () => {
    for (const [id, w] of WALKER_ART) {
      expect(heroById.has(id), String(id)).toBe(false);
      expect(size(`public/${w.image}`)).toEqual([64, 64]);
    }
    expect(DIG_CREW_HEROES).toEqual([...CREW_IDS]);
    expect(heroName(PORTER_ID)).not.toMatch(/^#/);
  });
});
