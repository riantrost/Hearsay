// @vitest-environment jsdom
// Component tests for the UI — deliberately thin: the rules truth lives
// in the pure suites; these pin the UI contracts that the rebuild exists
// for. Chief among them: a half-typed draft survives a data refresh by
// construction (component state, not DOM harvesting).

import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CampaignData } from '../src/model';
import { canEditTestimony } from '../src/mutations';
import type { ApiStore } from '../src/store';
import { BountyBoard } from '../src/ui/BountyBoard';
import { confirmDialog, Dialogs } from '../src/ui/dialogs';
import { Landing } from '../src/ui/Landing';
import { PinPanel } from '../src/ui/PinPanel';

afterEach(cleanup);

const DAY = 86400000;
const T0 = 1750000000000;

function makeData(): CampaignData {
  return {
    campaign: { id: 'c1', name: 'Test March', mapImageUrl: '/api/maps/c1', mapW: 1600, mapH: 1200, joinCode: 'ABC123' },
    members: [
      { id: 'm1', campaignId: 'c1', name: 'Maren', role: 'owner', status: 'active' },
      { id: 'm2', campaignId: 'c1', name: 'Corvyn', role: 'player', status: 'active' },
    ],
    pins: [{ id: 'p1', campaignId: 'c1', x: 0.5, y: 0.5, name: 'The Tollgate' }],
    events: [
      { id: 'e1', pinId: 'p1', createdAt: T0 + DAY, canonLine: 'The gate fell.', participantIds: [] },
      { id: 'e2', pinId: 'p1', createdAt: T0 + 2 * DAY, canonLine: 'Morning after.', participantIds: [] },
    ],
    testimony: [],
    bounties: [],
  };
}

/** An ApiStore-shaped test double: data + the methods PinPanel touches. */
function makeStore(data: CampaignData, viewerId = 'm2'): ApiStore {
  const store = {
    data,
    seat: { campaignId: 'c1', memberId: viewerId, token: 't' },
    get me() {
      return data.members.find((m) => m.id === viewerId);
    },
    canEdit: (t: Parameters<typeof canEditTestimony>[1]) => canEditTestimony(data, t),
    writeTestimony: vi.fn(async (eventId: string, text: string) => {
      const entry = { id: 'tX', eventId, memberId: viewerId, createdAt: Date.now(), text };
      data.testimony.push(entry);
      return entry;
    }),
    promoteMark: vi.fn(),
    addEvent: vi.fn(async () => ({ id: 'eX', pinId: 'p1', createdAt: Date.now(), canonLine: 'x', participantIds: [] })),
    addBounty: vi.fn(),
    setPinHidden: vi.fn(),
    revealPin: vi.fn(),
    movePin: vi.fn(),
    describePin: vi.fn(),
    renamePin: vi.fn(),
    setPinSealed: vi.fn(),
  };
  return store as unknown as ApiStore;
}

const noMove = (): void => {};

describe('Landing', () => {
  it('speaks plainly: Create campaign / Join / example invite', () => {
    const { getByText } = render(<Landing onSeated={() => {}} onResume={() => {}} />);
    getByText('Create campaign');
    getByText('Join');
    getByText('View the example campaign');
  });
});

describe('PinPanel — the one-box account flow', () => {
  it('an open slot is one textarea and one Save button (per event — late slots stay fillable)', () => {
    const store = makeStore(makeData());
    const { getAllByPlaceholderText, getAllByText } = render(<PinPanel store={store} pinId="p1" onStartMove={noMove} />);
    expect(getAllByPlaceholderText('what happened here, as you saw it').length).toBe(2);
    expect(getAllByText('Save').length).toBe(2);
  });

  it('a half-typed draft survives a data refresh — by construction', () => {
    const data = makeData();
    const store = makeStore(data);
    const { container, rerender } = render(<PinPanel store={store} pinId="p1" onStartMove={noMove} />);
    const box = container.querySelector<HTMLTextAreaElement>('.your-account textarea')!;
    fireEvent.input(box, { target: { value: 'half-typed words' } });
    // a poll landing is, to the component, fresh props with new data identity
    store.data.pins[0] = { ...store.data.pins[0] };
    rerender(<PinPanel store={store} pinId="p1" onStartMove={noMove} />);
    expect(container.querySelector<HTMLTextAreaElement>('.your-account textarea')!.value).toBe('half-typed words');
  });

  it('saving writes through the store and editing is just editing (no amend mode)', async () => {
    const data = makeData();
    const store = makeStore(data);
    const { container, queryByText } = render(<PinPanel store={store} pinId="p1" onStartMove={noMove} />);
    // the latest event's (grace-open) slot is the second .your-account
    const boxes = container.querySelectorAll<HTMLTextAreaElement>('.your-account textarea');
    const box = boxes[boxes.length - 1];
    fireEvent.input(box, { target: { value: 'what I saw' } });
    const saves = [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Save');
    fireEvent.click(saves[saves.length - 1]);
    await Promise.resolve();
    expect(store.writeTestimony).toHaveBeenCalledWith('e2', 'what I saw');
    expect(queryByText('amend')).toBeNull();
    expect(queryByText('testify')).toBeNull();
  });

  it('a closed account reads locked, plainly', () => {
    const data = makeData();
    // an entry on e1 — e2 landed later at the same pin, closing it
    data.testimony.push({ id: 't1', eventId: 'e1', memberId: 'm2', createdAt: T0 + DAY, text: 'old words' });
    const store = makeStore(data);
    const { getByText } = render(<PinPanel store={store} pinId="p1" onStartMove={noMove} />);
    getByText(/Saved — locked when a newer event landed here/);
  });

  it('owner sees Add event with the who-was-there picker; player does not', () => {
    const data = makeData();
    const owner = render(<PinPanel store={makeStore(data, 'm1')} pinId="p1" onStartMove={noMove} />);
    owner.getByText('Add event');
    owner.getByText('Who was there');
    cleanup();
    const player = render(<PinPanel store={makeStore(data, 'm2')} pinId="p1" onStartMove={noMove} />);
    expect(player.queryByText('Add event')).toBeNull();
  });

  it('unchecking a member sends an explicit participant subset', async () => {
    const data = makeData();
    const store = makeStore(data, 'm1');
    const { container, getByText } = render(<PinPanel store={store} pinId="p1" onStartMove={noMove} />);
    const boxes = container.querySelectorAll<HTMLInputElement>('.participant input');
    fireEvent.change(boxes[1], { target: { checked: false } });
    const canon = container.querySelector<HTMLInputElement>('.canon-form input')!;
    fireEvent.input(canon, { target: { value: 'A quiet night.' } });
    fireEvent.click(getByText('Add event'));
    await Promise.resolve();
    expect(store.addEvent).toHaveBeenCalledWith('p1', 'A quiet night.', undefined, ['m1']);
  });
});

describe('PinPanel — the Campaign Manager\'s pin controls', () => {
  it('shows the standing description to everyone', () => {
    const data = makeData();
    data.pins[0].description = 'A tollgate that has seen better centuries.';
    const { getByText } = render(<PinPanel store={makeStore(data)} pinId="p1" onStartMove={noMove} />);
    getByText('A tollgate that has seen better centuries.');
  });

  it('owner gets the tools row; player gets none of it', () => {
    const data = makeData();
    const owner = render(<PinPanel store={makeStore(data, 'm1')} pinId="p1" onStartMove={noMove} />);
    owner.getByText('Move');
    owner.getByText('Rename');
    owner.getByText('Describe');
    owner.getByText('Seal');
    cleanup();
    const player = render(<PinPanel store={makeStore(data, 'm2')} pinId="p1" onStartMove={noMove} />);
    expect(player.queryByText('Move')).toBeNull();
    expect(player.queryByText('Seal')).toBeNull();
  });

  it('Move arms the map through onStartMove', () => {
    const data = makeData();
    const onStartMove = vi.fn();
    const { getByText } = render(<PinPanel store={makeStore(data, 'm1')} pinId="p1" onStartMove={onStartMove} />);
    fireEvent.click(getByText('Move'));
    expect(onStartMove).toHaveBeenCalledWith('p1');
  });

  it('a sealed place shows the notice and no write surface to a player', () => {
    const data = makeData();
    data.pins[0].sealed = true;
    const { container, getByText } = render(<PinPanel store={makeStore(data, 'm2')} pinId="p1" onStartMove={noMove} />);
    getByText(/sealed this place/);
    expect(container.querySelector('.your-account textarea')).toBeNull();
  });

  it('a sealed place still offers the owner Unseal and Add event', () => {
    const data = makeData();
    data.pins[0].sealed = true;
    const { getByText } = render(<PinPanel store={makeStore(data, 'm1')} pinId="p1" onStartMove={noMove} />);
    getByText('Unseal');
    getByText('Add event');
  });
});

describe('Dialogs', () => {
  it('confirmDialog resolves true on confirm, false on cancel', async () => {
    const { getByText } = render(<Dialogs />);
    const p1 = confirmDialog('Do the thing?', { confirmLabel: 'Do it' });
    await Promise.resolve();
    fireEvent.click(getByText('Do it'));
    await expect(p1).resolves.toBe(true);
    const p2 = confirmDialog('Again?');
    await Promise.resolve();
    fireEvent.click(getByText('Cancel'));
    await expect(p2).resolves.toBe(false);
  });
});

describe('BountyBoard', () => {
  it('shows the live character budget and plain group names', () => {
    const data = makeData();
    data.bounties.push({ id: 'b1', campaignId: 'c1', postedBy: 'm2', target: 'The rope-cutter', reason: 'He cut it.', postedAt: T0 + DAY, status: 'posted' });
    const store = makeStore(data);
    const { getByText, container } = render(<BountyBoard store={store} />);
    getByText('Posted');
    getByText('Post a bounty');
    const reason = container.querySelector<HTMLTextAreaElement>('.bounty-form textarea')!;
    fireEvent.input(reason, { target: { value: 'a grievance' } });
    getByText(`${280 - 'a grievance'.length} left`);
  });
});
