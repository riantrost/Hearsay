// The scrubber's mark rule, pinned from docs/decisions.md ("Marks"): a mark
// inherits its *event's* session stamp. Testimony may arrive late — late is
// fine, forever — but graffiti belongs to when the thing happened, so the
// replay surfaces it with its event, never with its writing date.

import { describe, expect, it } from 'vitest';
import { siteMarks } from '../src/derive';
import { seed } from '../src/data/seed';

describe('siteMarks', () => {
  it('surfaces a mark from its event session onward', () => {
    // t2's mark sits on e1 (session 1, at p2)
    expect(siteMarks(seed, 'p2', 1).map((t) => t.id)).toEqual(['t2']);
  });

  it('holds a mark back while its event is beyond the viewed session', () => {
    // t3's mark rides e2 (session 3): absent at 2, present at 3
    expect(siteMarks(seed, 'p2', 2).map((t) => t.id)).toEqual(['t2']);
    expect(siteMarks(seed, 'p2', 3).map((t) => t.id)).toEqual(['t2', 't3']);
  });

  it('lets a late-written mark appear at its event, not its writing date', () => {
    const data = structuredClone(seed);
    // a slot on e1 (session 1) filled three sessions later, mark and all
    data.testimony.push({
      id: 'tl',
      eventId: 'e1',
      memberId: 'm3',
      session: 4,
      text: 'I finally wrote it down.',
      markText: 'It was never about the bridge.',
    });
    expect(siteMarks(data, 'p2', 1).map((t) => t.id)).toContain('tl');
  });

  it('keeps marks at their own site', () => {
    expect(siteMarks(seed, 'p1', 4)).toEqual([]);
  });
});
