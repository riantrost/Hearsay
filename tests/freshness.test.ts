// The freshness discipline's contracts: refresh is quiet when the server has
// nothing new (no notify, no re-render, no disturbing a half-typed draft),
// loud when it does, and a refresh that raced a local write loses — the
// fetched snapshot predates the write. The KV era's write-ledger tests died
// with the ledger itself (D1 reads its own writes); what remains here is
// plain HTTP-race truth that outlives any storage backend.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seed } from '../src/data/seed';
import type { CampaignData } from '../src/model';
import type { Seat } from '../src/seat';
import { ApiStore } from '../src/store';

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
    const before = store.$data.peek();
    await store.refresh();
    expect(notifies).toBe(0);
    // signal identity untouched: subscribed components saw nothing
    expect(store.$data.peek()).toBe(before);
  });

  it('notifies when the table moved', async () => {
    const store = await ApiStore.boot(seat);
    let notifies = 0;
    store.subscribe(() => notifies++);
    const moved: CampaignData = structuredClone(seed);
    moved.campaign.name = 'The Northmarch, Renamed';
    route = () => moved;
    await store.refresh();
    expect(notifies).toBe(1);
    expect(store.data.campaign.name).toBe('The Northmarch, Renamed');
  });

  it('discards a refresh that raced a local write — the snapshot predates it', async () => {
    const store = await ApiStore.boot(seat);
    let releaseGet!: () => void;
    const gate = new Promise<void>((resolve) => (releaseGet = resolve));
    route = async (url, init) => {
      if (init?.method === 'POST' && url.endsWith('/testimony')) {
        return { id: 'tX', eventId: 'e4', memberId: 'm1', createdAt: Date.now(), text: 'live words' };
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

  it('a mutation lands loud: signal identity changes and listeners fire', async () => {
    const store = await ApiStore.boot(seat);
    route = (url, init) => {
      if (init?.method === 'POST' && url.endsWith('/pins')) {
        return { id: 'pX', campaignId: 'c1', x: 0.5, y: 0.5, name: 'New Place' };
      }
      return structuredClone(seed);
    };
    let notifies = 0;
    store.subscribe(() => notifies++);
    const before = store.$data.peek();
    await store.addPin(0.5, 0.5, 'New Place');
    expect(notifies).toBe(1);
    expect(store.$data.peek()).not.toBe(before);
    expect(store.data.pins.some((p) => p.id === 'pX')).toBe(true);
  });

  it('a later honest refresh is the truth — no ledger holds stale local state', async () => {
    const store = await ApiStore.boot(seat);
    route = (url, init) => {
      if (init?.method === 'POST' && url.endsWith('/pins')) {
        return { id: 'pX', campaignId: 'c1', x: 0.5, y: 0.5, name: 'New Place' };
      }
      return structuredClone(seed); // the server's (consistent) answer
    };
    await store.addPin(0.5, 0.5, 'New Place');
    expect(store.data.pins.some((p) => p.id === 'pX')).toBe(true);
    // a refresh that started *after* the write reads D1's own-write truth; here
    // the mock answers with the seed, and the store honestly takes it
    await store.refresh();
    expect(store.data.pins.some((p) => p.id === 'pX')).toBe(false);
  });
});
