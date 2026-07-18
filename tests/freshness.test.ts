// The freshness discipline's contracts (roadmap step 4): refresh is quiet
// when the server has nothing new (no notify, no re-render, no disturbing a
// half-typed draft), loud when it does, and a refresh that raced a local
// write loses — the fetched snapshot predates the write.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiStore } from '../src/apiStore';
import { seed } from '../src/data/seed';
import type { CampaignData } from '../src/model';
import type { Seat } from '../src/seat';

const seat: Seat = { campaignId: 'c1', memberId: 'm1', token: 'tok' };

type Route = (url: string, init?: RequestInit) => Promise<unknown> | unknown;
let route: Route;

beforeEach(() => {
  route = () => structuredClone(seed);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const body = await route(String(url), init);
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiStore.refresh', () => {
  it('stays quiet when the server has nothing new', async () => {
    const store = await ApiStore.boot(seat);
    let notifies = 0;
    store.subscribe(() => notifies++);
    await store.refresh();
    expect(notifies).toBe(0);
  });

  it('notifies when the table moved', async () => {
    const store = await ApiStore.boot(seat);
    let notifies = 0;
    store.subscribe(() => notifies++);
    const moved: CampaignData = structuredClone(seed);
    moved.campaign.currentSession = 5;
    route = () => moved;
    await store.refresh();
    expect(notifies).toBe(1);
    expect(store.data.campaign.currentSession).toBe(5);
  });

  it('discards a refresh that raced a local write — the snapshot predates it', async () => {
    const store = await ApiStore.boot(seat);
    let releaseGet!: () => void;
    const gate = new Promise<void>((resolve) => (releaseGet = resolve));
    route = async (url, init) => {
      if (init?.method === 'POST' && url.endsWith('/testimony')) {
        return { id: 'tX', eventId: 'e4', memberId: 'm1', session: 4, text: 'live words' };
      }
      await gate; // hold the GET until after the write lands
      return structuredClone(seed); // a stale snapshot: tX is not in it
    };
    const refreshing = store.refresh();
    const entry = await store.writeTestimony('e4', 'live words');
    expect(entry.id).toBe('tX');
    releaseGet();
    await refreshing;
    expect(store.data.testimony.some((t) => t.id === 'tX')).toBe(true);
  });
});
