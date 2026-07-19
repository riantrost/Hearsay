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

  // KV's list is eventually consistent: a snapshot fetched *after* a write
  // can still be missing the written record for up to ~a minute. The store
  // keeps a ledger of its own recent writes and patches them back in.
  it('a laggy snapshot cannot un-place a fresh pin', async () => {
    const store = await ApiStore.boot(seat);
    route = (url, init) => {
      if (init?.method === 'POST' && url.endsWith('/pins')) {
        return { id: 'pX', campaignId: 'c1', x: 0.5, y: 0.5, name: 'New Place' };
      }
      return structuredClone(seed); // storage lag: pX missing from the snapshot
    };
    await store.addPin(0.5, 0.5, 'New Place');
    let notifies = 0;
    store.subscribe(() => notifies++);
    await store.refresh();
    expect(store.data.pins.some((p) => p.id === 'pX')).toBe(true);
    expect(notifies).toBe(0); // the patched snapshot matches what we show: quiet
  });

  it('the clock never winds back on a laggy snapshot', async () => {
    const store = await ApiStore.boot(seat);
    const advanced = seed.campaign.currentSession + 1;
    route = (url, init) => {
      if (init?.method === 'POST' && url.endsWith('/session')) return { currentSession: advanced };
      return structuredClone(seed); // still says the old session
    };
    await store.advanceSession();
    await store.refresh();
    expect(store.data.campaign.currentSession).toBe(advanced);
  });

  it('the ledger expires once the storage lag window passes', async () => {
    vi.useFakeTimers();
    try {
      const store = await ApiStore.boot(seat);
      route = (url, init) => {
        if (init?.method === 'POST' && url.endsWith('/pins')) {
          return { id: 'pX', campaignId: 'c1', x: 0.5, y: 0.5, name: 'New Place' };
        }
        return structuredClone(seed);
      };
      await store.addPin(0.5, 0.5, 'New Place');
      vi.setSystemTime(Date.now() + 120_000); // well past the lag window
      await store.refresh();
      // past the window the server is the truth again, missing record and all
      expect(store.data.pins.some((p) => p.id === 'pX')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
