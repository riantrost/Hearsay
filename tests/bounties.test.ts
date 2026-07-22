// The bounty board's contracts (docs/decisions.md, "The bounty board"):
// revenge is a member act, nailing it up is a canon act. A proposal is the
// poster's and the owner's secret; approval puts it on the board for the
// table; a strike settles it — stamped, never erased; a refusal deletes
// paper that never reached the board.

import { beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../src/data/seed';
import { MAX_BOUNTY_REASON_CHARS, MAX_BOUNTY_TARGET_CHARS, type CampaignData } from '../src/model';
import { approveBounty, declineBounty, postBounty, strikeBounty, visibleData } from '../src/mutations';

let data: CampaignData;

beforeEach(() => {
  data = structuredClone(seed);
});

describe('posting a bounty (a member act)', () => {
  it('lands as a proposal stamped with the moment it was posted', () => {
    const before = Date.now();
    const b = postBounty(data, 'm2', 'The Grey Wizard', 'He burned my library. I want his hat.');
    expect(b.status).toBe('proposed');
    expect(b.postedAt).toBeGreaterThanOrEqual(before);
    expect(b.postedAt).toBeLessThanOrEqual(Date.now());
    expect(data.bounties.some((x) => x.id === b.id)).toBe(true);
  });

  it('a pending member can post — the owner\'s nail is the only gate', () => {
    const b = postBounty(data, 'm4', 'The bell-ringer', 'It saw me in the reeds. I do not sleep.');
    expect(b.status).toBe('proposed');
  });

  it('refuses an unknown member, an empty quarry, and empty words', () => {
    expect(() => postBounty(data, 'mX', 'target', 'reason')).toThrow('no such member');
    expect(() => postBounty(data, 'm2', '  ', 'reason')).toThrow('quarry');
    expect(() => postBounty(data, 'm2', 'target', '  ')).toThrow('grievance');
  });

  it('holds the brevity caps — a poster, not a saga', () => {
    expect(() => postBounty(data, 'm2', 'x'.repeat(MAX_BOUNTY_TARGET_CHARS + 1), 'reason')).toThrow('characters at most');
    expect(() => postBounty(data, 'm2', 'target', 'x'.repeat(MAX_BOUNTY_REASON_CHARS + 1))).toThrow('characters at most');
  });
});

describe('the proposal is table-private until the nail', () => {
  it('a proposed bounty reaches only its poster and the owner', () => {
    // seed's b2 is Ossian's (m3) proposal
    const forPoster = visibleData(data, 'm3');
    const forOwner = visibleData(data, 'm1');
    const forRival = visibleData(data, 'm2');
    expect(forPoster.bounties.some((b) => b.id === 'b2')).toBe(true);
    expect(forOwner.bounties.some((b) => b.id === 'b2')).toBe(true);
    expect(forRival.bounties.some((b) => b.id === 'b2')).toBe(false);
  });

  it('posted and struck bounties reach every seat', () => {
    const forRival = visibleData(data, 'm2');
    expect(forRival.bounties.some((b) => b.id === 'b1')).toBe(true);
    expect(forRival.bounties.some((b) => b.id === 'b3')).toBe(true);
  });
});

describe('the owner resolves the board (canon acts)', () => {
  it('approval nails the proposal up for the table', () => {
    approveBounty(data, 'b2');
    expect(visibleData(data, 'm2').bounties.some((b) => b.id === 'b2')).toBe(true);
  });

  it('approval is for proposals only', () => {
    expect(() => approveBounty(data, 'b1')).toThrow('already on the board');
    expect(() => approveBounty(data, 'bX')).toThrow('no such bounty');
  });

  it('a refusal deletes paper that never reached the board', () => {
    declineBounty(data, 'b2');
    expect(data.bounties.some((b) => b.id === 'b2')).toBe(false);
  });

  it('only a proposal can be refused — the board is not silently editable', () => {
    expect(() => declineBounty(data, 'b1')).toThrow('only a proposed bounty');
  });

  it('a strike settles with a stamp and keeps the paper', () => {
    const before = Date.now();
    const b = strikeBounty(data, 'b1');
    expect(b.status).toBe('struck');
    expect(b.struckAt).toBeGreaterThanOrEqual(before);
    expect(b.struckAt).toBeLessThanOrEqual(Date.now());
    expect(data.bounties.some((x) => x.id === 'b1')).toBe(true);
  });

  it('only a posted bounty can be struck', () => {
    expect(() => strikeBounty(data, 'b2')).toThrow('only a posted bounty');
    expect(() => strikeBounty(data, 'b3')).toThrow('only a posted bounty');
  });
});
