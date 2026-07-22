// The table view: a full-bleed map with one side panel. On desktop the panel
// is a persistent right column (Campaign Managers live here); on mobile it is
// a bottom sheet. The same components render in both — CSS decides the
// furniture. The panel has one mode at a time: overview (default), a pin,
// bounties, the campaign/seat panel, or help.

import { effect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ApiStore } from '../store';
import { BountyBoard } from './BountyBoard';
import { confirmDialog, oops, textDialog } from './dialogs';
import { IdentityPanel } from './IdentityPanel';
import { MapCanvas } from './MapCanvas';
import { PinPanel } from './PinPanel';

/** How often an open pin panel asks the server what it missed. */
const PIN_POLL_MS = 5000;

type PanelMode = 'overview' | 'pin' | 'bounties' | 'identity' | 'help';

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
          <li><b>Start session</b> advances the campaign clock. Accounts of past sessions lock once the new session's first event lands.</li>
          <li>Share the <b>join code</b> freely — joiners write immediately, but their words reach the table only after you approve them.</li>
          <li>The <b>bounty board</b> collects players' sworn revenge — you post proposals to the board, and mark them settled.</li>
          <li>Once history spans sessions, the <b>session pill</b> scrubs the map back through time.</li>
        </ul>
      ) : (
        <ul>
          <li><b>Tap a pin</b> to read a place's history — the Campaign Manager's canon first, then every seat's account.</li>
          <li><b>Write your account</b> in your own words: what happened, as you saw it. It's yours alone; contradiction is welcome.</li>
          <li>You can <b>edit</b> your account until the next session begins — then it locks for good.</li>
          <li><b>Highlight a line as graffiti</b>: one short line from your account, left on the place, unattributed at a glance.</li>
          <li>Hollow pips on a pin are <b>voices still missing</b> from its latest events.</li>
          <li>Killed? Wronged? <b>Post a bounty</b> — the Campaign Manager puts it on the board for the table to read.</li>
          <li>Once history spans sessions, the <b>session pill</b> scrubs the map back through time.</li>
        </ul>
      )}
    </div>
  );
}

function Overview({ store, isOwner, onOpenPin }: { store: ApiStore; isOwner: boolean; onOpenPin: (id: string) => void }) {
  const data = store.data;
  const pending = data.members.filter((m) => m.status === 'pending');
  const recent = [...data.events]
    .sort((a, z) => z.session - a.session)
    .slice(0, 6)
    .map((e) => ({ event: e, pin: data.pins.find((p) => p.id === e.pinId) }))
    .filter((r) => r.pin && !r.pin.hidden);
  return (
    <div class="overview">
      <h2>{data.campaign.name}</h2>
      <p class="card-hint">Session {data.campaign.currentSession} · select a place on the map to read or write</p>
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
              <span class="recent-session">s{event.session}</span>
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
  const present = data.campaign.currentSession;
  const isOwner = store.me?.role === 'owner';

  const [viewed, setViewed] = useState(present);
  const [panel, setPanel] = useState<PanelMode>('overview');
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [sheetFull, setSheetFull] = useState(false);
  const [scrubberOpen, setScrubberOpen] = useState(false);

  // the view follows the table's clock only when standing at it: a remote
  // advance carries a present-viewer forward, never yanks a reader out of
  // the past mid-scrub
  const knownPresent = useRef(present);
  useEffect(
    () =>
      effect(() => {
        const now = store.$data.value.campaign.currentSession;
        setViewed((v) => (v >= knownPresent.current ? now : v));
        knownPresent.current = now;
      }),
    [store],
  );

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

  const past = viewed < present;
  const canPlace = isOwner && !past;
  const hasHistory = present > 1;
  const postedBounties = data.bounties.filter((b) => b.status === 'posted').length;
  const proposedBounties = data.bounties.filter((b) => b.status === 'proposed').length;
  const waiting = isOwner ? data.members.filter((m) => m.status === 'pending').length : 0;

  const openPin = (id: string | null): void => {
    setSelectedPinId(id);
    if (id) {
      setPanel('pin');
      setSheetFull(false);
    } else if (panel === 'pin') {
      setPanel('overview');
    }
  };

  const place = async (x: number, y: number): Promise<void> => {
    setPlacing(false);
    const name = await textDialog('Name this place', { title: 'New pin', placeholder: 'e.g. The Broken Tower', confirmLabel: 'Add pin' });
    if (!name?.trim()) return;
    try {
      const pin = await store.addPin(x, y, name.trim());
      openPin(pin.id);
    } catch (e) {
      oops(e);
    }
  };

  const startSession = async (): Promise<void> => {
    const sure = await confirmDialog(
      `Start session ${present + 1}? Session ${present}'s open accounts lock once the first event lands in the new one — and the clock doesn't turn back.`,
      { confirmLabel: `Start session ${present + 1}` },
    );
    if (!sure) return;
    try {
      const s = await store.advanceSession();
      setViewed(s);
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
        session={viewed}
        selectedPinId={selectedPinId}
        withGhosts={!!isOwner}
        placing={placing && canPlace}
        past={past}
        onTapPin={openPin}
        onPlace={(x, y) => void place(x, y)}
      />

      {canPlace && (
        <button class={'place-btn' + (placing ? ' active' : '')} onClick={() => setPlacing((p) => !p)}>
          {placing ? '✕ Cancel' : '＋ Add pin'}
        </button>
      )}
      {placing && canPlace && (
        <div class="placebar">
          <span class="placebar-dot" />
          <span>Tap the map where it happened</span>
          <button class="quiet" onClick={() => setPlacing(false)}>Cancel</button>
        </div>
      )}
      {isOwner && data.pins.length === 0 && !placing && <div class="map-hint">name your first place — press ＋ Add pin, then tap the map</div>}

      {past && (
        <div class="pastbar">
          <span>the map as it stood after session {viewed}</span>
          <button class="quiet" onClick={() => setViewed(present)}>
            Back to now
          </button>
        </div>
      )}

      {(hasHistory || isOwner) && (
        <footer class={'scrubber' + (scrubberOpen ? '' : ' collapsed') + (past ? ' past' : '')}>
          {hasHistory && (
            <button class="scrubber-pill quiet" onClick={() => setScrubberOpen((o) => !o)}>
              {scrubberOpen ? 'Close' : past ? `⟲ Session ${viewed} of ${present}` : `⟲ Session ${present}`}
            </button>
          )}
          {scrubberOpen && hasHistory && (
            <>
              <span class="scrubber-label">{past ? `Session ${viewed} of ${present}` : `Session ${viewed}`}</span>
              <input
                type="range"
                min={1}
                max={present}
                step={1}
                value={viewed}
                onInput={(ev) => setViewed(Number((ev.currentTarget as HTMLInputElement).value))}
              />
            </>
          )}
          {isOwner && (
            <button class="quiet" onClick={() => void startSession()}>
              Start session {present + 1}
            </button>
          )}
        </footer>
      )}

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
            <PinPanel key={selectedPinId} store={store} pinId={selectedPinId} session={viewed} />
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
