// The table view: a full-bleed map with one side panel. On desktop the panel
// is a persistent right column (Campaign Managers live here); on mobile it is
// a bottom sheet. The same components render in both — CSS decides the
// furniture. The panel has one mode at a time: overview (default), a pin,
// bounties, the campaign/seat panel, or help.

import { useEffect, useState } from 'preact/hooks';
import type { ApiStore } from '../store';
import { BountyBoard } from './BountyBoard';
import { oops, textDialog } from './dialogs';
import { fmtDay } from './format';
import { IdentityPanel } from './IdentityPanel';
import { MapCanvas } from './MapCanvas';
import { PinPanel } from './PinPanel';

/** How often an open pin panel asks the server what it missed. */
const PIN_POLL_MS = 5000;

type PanelMode = 'overview' | 'pin' | 'bounties' | 'identity' | 'help';

/** An armed map tap: the next tap on open ground places or moves a pin. */
type Arming = { kind: 'place' } | { kind: 'move'; pinId: string } | null;

export interface TableViewProps {
  store: ApiStore;
  googleOn: boolean;
  onSwitchCampaign: () => void;
  onLeave: () => void;
}

function HelpPanel({ isOwner }: { isOwner: boolean }) {
  return (
    <div class="help-panel">
      <h2>How Hearsay works</h2>
      {isOwner ? (
        <ul>
          <li><b>You own the world.</b> Press <b>＋ Add pin</b>, then tap the map to name a place.</li>
          <li>Open a place and <b>Add event</b>: one line of canon (the headline), plus optional atmosphere prose. Events are what players write their accounts of.</li>
          <li><b>Hide pin</b> preps a place only you can see; <b>Reveal to table</b> brings it to everyone as a timeline event.</li>
          <li>A place is yours to keep true: <b>move</b> a misplaced pin, <b>rename</b> it, and give it a <b>description</b> that changes as events change it.</li>
          <li><b>Seal</b> a place when it closes off — players can read everything, but no new accounts or graffiti land there until you unseal it.</li>
          <li>A player's account locks when the next event lands at that same place — each place keeps its own clock.</li>
          <li>Share the <b>join code</b> freely — joiners write immediately, but their words reach the table only after you approve them.</li>
          <li>The <b>bounty board</b> collects players' sworn revenge — you post proposals to the board, and mark them settled.</li>
        </ul>
      ) : (
        <ul>
          <li><b>Tap a pin</b> to read a place's history — the Campaign Manager's canon first, then every seat's account.</li>
          <li><b>Write your account</b> in your own words: what happened, as you saw it. It's yours alone; contradiction is welcome.</li>
          <li>You can <b>edit</b> your account until the next event lands at that place — then it locks for good.</li>
          <li><b>Highlight a line as graffiti</b>: one short line from your account, left on the place, unattributed at a glance.</li>
          <li>Hollow pips on a pin are <b>voices still missing</b> from its latest events.</li>
          <li>A <b>sealed</b> place is closed off — you can read everything, but nothing new lands there.</li>
          <li>Killed? Wronged? <b>Post a bounty</b> — the Campaign Manager puts it on the board for the table to read.</li>
        </ul>
      )}
    </div>
  );
}

function Overview({ store, isOwner, onOpenPin }: { store: ApiStore; isOwner: boolean; onOpenPin: (id: string) => void }) {
  const data = store.data;
  const pending = data.members.filter((m) => m.status === 'pending');
  const recent = [...data.events]
    .sort((a, z) => z.createdAt - a.createdAt)
    .slice(0, 6)
    .map((e) => ({ event: e, pin: data.pins.find((p) => p.id === e.pinId) }))
    .filter((r) => r.pin && !r.pin.hidden);
  return (
    <div class="overview">
      <h2>{data.campaign.name}</h2>
      <p class="card-hint">select a place on the map to read or write</p>
      {isOwner && pending.length > 0 && (
        <section class="panel-section attention-section">
          <h3>Waiting to join</h3>
          {pending.map((m) => (
            <div class="member-row" key={m.id}>
              <span>{m.name}</span>
              <span class="row-acts">
                <button class="primary" onClick={() => store.approveMember(m.id).catch(oops)}>Approve</button>
              </span>
            </div>
          ))}
        </section>
      )}
      {recent.length > 0 && (
        <section class="panel-section">
          <h3>Recent events</h3>
          {recent.map(({ event, pin }) => (
            <button class="recent-row" key={event.id} onClick={() => onOpenPin(pin!.id)}>
              <span class="recent-session">{fmtDay(event.createdAt)}</span>
              <span class="recent-place">{pin!.name}</span>
              <span class="recent-canon">{event.canonLine}</span>
            </button>
          ))}
        </section>
      )}
      {isOwner && data.pins.length === 0 && <p class="card-hint">name your first place — press ＋ Add pin, then tap the map</p>}
    </div>
  );
}

export function TableView({ store, googleOn, onSwitchCampaign, onLeave }: TableViewProps) {
  // reading store.data in render subscribes this component to the signal
  const data = store.data;
  const isOwner = store.me?.role === 'owner';

  const [panel, setPanel] = useState<PanelMode>('overview');
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [arming, setArming] = useState<Arming>(null);
  const [sheetFull, setSheetFull] = useState(false);

  // freshness discipline: refetch on focus/visibility, short-poll while a pin
  // panel is open and the tab visible; refresh is quiet when nothing changed
  useEffect(() => {
    const refetch = (): void => {
      store.refresh().catch(() => {});
    };
    window.addEventListener('focus', refetch);
    const onVis = (): void => {
      if (!document.hidden) refetch();
    };
    document.addEventListener('visibilitychange', onVis);
    let poll: number | undefined;
    const want = panel === 'pin' && selectedPinId !== null;
    if (want) poll = window.setInterval(() => {
      if (!document.hidden) refetch();
    }, PIN_POLL_MS);
    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', onVis);
      if (poll !== undefined) clearInterval(poll);
    };
  }, [store, panel, selectedPinId]);

  const postedBounties = data.bounties.filter((b) => b.status === 'posted').length;
  const proposedBounties = data.bounties.filter((b) => b.status === 'proposed').length;
  const waiting = isOwner ? data.members.filter((m) => m.status === 'pending').length : 0;
  const movingPin = arming?.kind === 'move' ? data.pins.find((p) => p.id === arming.pinId) : undefined;

  const openPin = (id: string | null): void => {
    setSelectedPinId(id);
    if (id) {
      setPanel('pin');
      setSheetFull(false);
    } else if (panel === 'pin') {
      setPanel('overview');
    }
  };

  /** An armed tap landed on open ground: place a new pin, or move one. */
  const place = async (x: number, y: number): Promise<void> => {
    const act = arming;
    setArming(null);
    if (act?.kind === 'move') {
      try {
        await store.movePin(act.pinId, x, y);
        openPin(act.pinId);
      } catch (e) {
        oops(e);
      }
      return;
    }
    const name = await textDialog('Name this place', { title: 'New pin', placeholder: 'e.g. The Broken Tower', confirmLabel: 'Add pin' });
    if (!name?.trim()) return;
    try {
      const pin = await store.addPin(x, y, name.trim());
      openPin(pin.id);
    } catch (e) {
      oops(e);
    }
  };

  const togglePanel = (mode: PanelMode): void => {
    if (panel === mode) {
      setPanel(selectedPinId ? 'pin' : 'overview');
    } else {
      setPanel(mode);
      setSheetFull(true);
    }
  };

  // on mobile the panel is a sheet, closed entirely in overview mode
  const sheetOpen = panel !== 'overview';

  return (
    <div class={'table-view' + (sheetOpen ? ' sheet-open' : '') + (sheetFull ? ' sheet-full' : '')}>
      <header class="topbar">
        <span class="topbar-title">{data.campaign.name}</span>
        <span class="topbar-acts">
          <button class={'quiet' + (isOwner && proposedBounties > 0 ? ' attention' : '')} onClick={() => togglePanel('bounties')}>
            {postedBounties > 0 ? `Bounties (${postedBounties})` : 'Bounties'}
          </button>
          <button class={'quiet' + (waiting > 0 ? ' attention' : '')} onClick={() => togglePanel('identity')}>
            {waiting > 0 ? `${store.me?.name ?? 'Seat'} · ${waiting} waiting` : (store.me?.name ?? 'Seat')}
          </button>
          <button class="quiet help-btn" title="how Hearsay works" onClick={() => togglePanel('help')}>
            ?
          </button>
        </span>
      </header>

      <MapCanvas
        data={data}
        selectedPinId={selectedPinId}
        withGhosts={!!isOwner}
        placing={arming !== null && !!isOwner}
        onTapPin={openPin}
        onPlace={(x, y) => void place(x, y)}
      />

      {isOwner && (
        <button class={'place-btn' + (arming ? ' active' : '')} onClick={() => setArming((a) => (a ? null : { kind: 'place' }))}>
          {arming ? '✕ Cancel' : '＋ Add pin'}
        </button>
      )}
      {arming && isOwner && (
        <div class="placebar">
          <span class="placebar-dot" />
          <span>{movingPin ? `Tap the map to move “${movingPin.name}”` : 'Tap the map where it happened'}</span>
          <button class="quiet" onClick={() => setArming(null)}>Cancel</button>
        </div>
      )}
      {isOwner && data.pins.length === 0 && !arming && <div class="map-hint">name your first place — press ＋ Add pin, then tap the map</div>}

      <aside class="side-panel">
        {sheetOpen && (
          <div class="sheet-grip">
            <button class="sheet-toggle" onClick={() => setSheetFull((f) => !f)} title={sheetFull ? 'shrink' : 'expand'}>
              <span class="grip-bar" />
            </button>
            <button class="quiet sheet-close" onClick={() => { setPanel('overview'); openPin(null); }}>
              Close
            </button>
          </div>
        )}
        <div class="panel-body">
          {panel === 'pin' && selectedPinId ? (
            <PinPanel
              key={selectedPinId}
              store={store}
              pinId={selectedPinId}
              onStartMove={(pinId) => {
                setArming({ kind: 'move', pinId });
                setPanel('overview');
                setSelectedPinId(null);
              }}
            />
          ) : panel === 'bounties' ? (
            <BountyBoard store={store} />
          ) : panel === 'identity' ? (
            <IdentityPanel store={store} googleOn={googleOn} onSwitchCampaign={onSwitchCampaign} onLeave={onLeave} />
          ) : panel === 'help' ? (
            <HelpPanel isOwner={!!isOwner} />
          ) : (
            <Overview store={store} isOwner={!!isOwner} onOpenPin={openPin} />
          )}
        </div>
      </aside>
    </div>
  );
}
