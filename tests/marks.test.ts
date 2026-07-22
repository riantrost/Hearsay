// The mark rule, pinned from docs/decisions.md ("Marks"): a mark rides its
// *event*. Testimony may arrive late — late is fine, forever — but graffiti
// belongs to the thing that happened, so it surfaces with its event at its
// site, never with its writing date.

import { describe, expect, it } from 'vitest';
import { siteMarks } from '../src/derive';
import { night, seed } from '../src/data/seed';

describe('siteMarks', () => {
  it('surfaces every mark scrawled at a site with its event', () => {
    // t2's mark sits on e1, t3's on e2 — both at the span
    expect(siteMarks(seed, 'p2').map((t) => t.id)).toEqual(['t2', 't3']);
  });

  it('lets a late-written mark appear at its event, not its writing date', () => {
    const data = structuredClone(seed);
    // a slot on e1 (first night) filled three nights later, mark and all
    data.testimony.push({
      id: 'tl',
      eventId: 'e1',
      memberId: 'm3',
      createdAt: night(4),
      text: 'I finally wrote it down.',
      markText: 'It was never about the bridge.',
    });
    expect(siteMarks(data, 'p2').map((t) => t.id)).toContain('tl');
  });

  it('keeps marks at their own site', () => {
    expect(siteMarks(seed, 'p1')).toEqual([]);
  });
});
