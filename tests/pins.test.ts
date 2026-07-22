// The Campaign Manager's pin controls (docs/decisions.md, 2026-07-22):
// move a misplaced pin, rename it, keep its standing description true, and
// seal a place that has closed off. Sealing blocks player input — new
// accounts and marks — while the owner keeps every canon act; existing
// words stay readable. Same mutation layer both sides of the wire.

import { beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../src/data/seed';
import { MAX_PIN_DESCRIPTION_CHARS, type CampaignData } from '../src/model';
import {
  addEvent,
  canEditTestimony,
  describePin,
  movePin,
  promoteMark,
  renamePin,
  setPinSealed,
  writeTestimony,
} from '../src/mutations';

let data: CampaignData;

beforeEach(() => {
  data = structuredClone(seed);
});

describe('movePin', () => {
  it('repositions within normalized bounds', () => {
    const pin = movePin(data, 'p1', 0.12, 0.88);
    expect(pin.x).toBe(0.12);
    expect(pin.y).toBe(0.88);
    expect(data.pins.find((p) => p.id === 'p1')).toMatchObject({ x: 0.12, y: 0.88 });
  });

  it('refuses coordinates off the map, and unknown pins', () => {
    expect(() => movePin(data, 'p1', 1.5, 0.5)).toThrow(/normalized/);
    expect(() => movePin(data, 'p1', 0.5, -0.1)).toThrow(/normalized/);
    expect(() => movePin(data, 'p999', 0.5, 0.5)).toThrow(/no such pin/);
    expect(data.pins.find((p) => p.id === 'p1')).toMatchObject({ x: 0.38, y: 0.27 });
  });
});

describe('renamePin', () => {
  it('renames with trim; a place always needs a name', () => {
    expect(renamePin(data, 'p1', '  The Older Keep  ').name).toBe('The Older Keep');
    expect(() => renamePin(data, 'p1', '   ')).toThrow(/needs a name/);
    expect(() => renamePin(data, 'p999', 'x')).toThrow(/no such pin/);
  });
});

describe('describePin', () => {
  it('sets trimmed prose and clears on empty — absent, not blank', () => {
    const pin = describePin(data, 'p2', '  A bridge that keeps its dead.  ');
    expect(pin.description).toBe('A bridge that keeps its dead.');
    expect(describePin(data, 'p2', '').description).toBeUndefined();
    expect('description' in data.pins.find((p) => p.id === 'p2')!).toBe(false);
  });

  it('caps at the character limit — character, not chronicle', () => {
    expect(() => describePin(data, 'p2', 'x'.repeat(MAX_PIN_DESCRIPTION_CHARS + 1))).toThrow(/characters at most/);
    describePin(data, 'p2', 'x'.repeat(MAX_PIN_DESCRIPTION_CHARS));
    expect(data.pins.find((p) => p.id === 'p2')!.description!.length).toBe(MAX_PIN_DESCRIPTION_CHARS);
  });
});

describe('setPinSealed', () => {
  it('seals and unseals, absent-when-false on the wire shape', () => {
    expect(setPinSealed(data, 'p2', true).sealed).toBe(true);
    const unsealed = setPinSealed(data, 'p2', false);
    expect(unsealed.sealed).toBeUndefined();
    expect('sealed' in unsealed).toBe(false);
  });

  it('a sealed place refuses new testimony', () => {
    setPinSealed(data, 'p4', true);
    // e4 is at p4; m2 holds an open slot there
    expect(() => writeTestimony(data, 'e4', 'm2', 'words at a sealed place')).toThrow(/sealed/);
  });

  it('a sealed place refuses amends — canEditTestimony goes false even for the latest event', () => {
    const entry = writeTestimony(data, 'e4', 'm2', 'before the seal');
    expect(canEditTestimony(data, entry)).toBe(true);
    setPinSealed(data, 'p4', true);
    expect(canEditTestimony(data, entry)).toBe(false);
    expect(() => writeTestimony(data, 'e4', 'm2', 'after the seal')).toThrow(/sealed/);
  });

  it('a sealed place refuses marks', () => {
    const entry = writeTestimony(data, 'e4', 'm2', 'a line worth scrawling');
    setPinSealed(data, 'p4', true);
    expect(() => promoteMark(data, entry.id, 'm2', 'worth scrawling')).toThrow(/sealed/);
  });

  it('the owner still lands events at a sealed place', () => {
    setPinSealed(data, 'p4', true);
    const event = addEvent(data, 'p4', 'the fen freezes over');
    expect(data.events).toContain(event);
  });

  it('unsealing restores editability for the latest event only', () => {
    const entry = writeTestimony(data, 'e4', 'm2', 'my account');
    setPinSealed(data, 'p4', true);
    setPinSealed(data, 'p4', false);
    // e4 is still p4's latest event: the grace window reopens
    expect(canEditTestimony(data, entry)).toBe(true);
    // but an entry whose event has a newer sibling stays closed (t1 on e1; e2 is newer at p2)
    const t1 = data.testimony.find((t) => t.id === 't1')!;
    expect(canEditTestimony(data, t1)).toBe(false);
  });

  it('existing words stay readable — sealing never removes data', () => {
    const before = data.testimony.length;
    setPinSealed(data, 'p2', true);
    expect(data.testimony.length).toBe(before);
    expect(data.testimony.find((t) => t.id === 't1')?.text).toContain('span');
  });
});
