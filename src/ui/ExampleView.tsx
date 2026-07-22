// The example table's viewer: the real map and pin surfaces over baked-in
// data, wrapped in a guided tour. Read-only by construction — the viewer
// holds no seat and appears in no roster, so PinPanel renders no write
// surface and no owner tools; the side panel walks the visitor from stop
// to stop instead of offering a campaign's controls.

import { useMemo, useState } from 'preact/hooks';
import { exampleData, tourStops } from '../data/example';
import type { Bounty } from '../model';
import type { ApiStore } from '../store';
import { fmtDay } from './format';
import { MapCanvas } from './MapCanvas';
import { PinPanel } from './PinPanel';

type PanelMode = 'tour' | 'pin' | 'bounties';

/**
 * An ApiStore-shaped reader over the example data. No mutation can ever run:
 * the viewer is not a member, so no write surface or owner tool renders —
 * the read paths are the whole contract this object serves.
 */
function makeExampleStore(): ApiStore {
  return {
    data: exampleData,
    seat: { campaignId: 'example', memberId: 'visitor', token: '' },
    me: undefined,
    canEdit: () => false,
  } as unknown as ApiStore;
}

function ExampleBounties({ bounties, byName }: { bounties: Bounty[]; byName: (id: string) => string }) {
  const groups: [string, Bounty[]][] = [
    ['Posted', bounties.filter((b) => b.status === 'posted')],
    ['Settled', bounties.filter((b) => b.status === 'struck')],
  ];
  return (
    <div class="bounty-board">
      <h2>Bounties</h2>
      <p class="card-hint">
        any player can swear a bounty; the Campaign Manager posts it to the board, or marks it settled — crossed out, kept forever
      </p>
      {groups.map(
        ([title, list]) =>
          list.length > 0 && (
            <section class="panel-section" key={title}>
              <h3>{title}</h3>
              {list.map((b) => (
                <article class={'bounty ' + b.status} key={b.id}>
                  <h3>{b.target}</h3>
                  <p>{b.reason}</p>
                  <div class="bounty-byline">
                    {b.status === 'struck' && b.struckAt !== undefined
                      ? `sworn by ${byName(b.postedBy)} · ${fmtDay(b.postedAt)} — settled ${fmtDay(b.struckAt)}`
                      : `sworn by ${byName(b.postedBy)} · ${fmtDay(b.postedAt)}`}
                  </div>
                </article>
              ))}
            </section>
          ),
      )}
    </div>
  );
}

export function ExampleView({ onBack }: { onBack: () => void }) {
  const store = useMemo(makeExampleStore, []);
  const data = store.data;
  const [panel, setPanel] = useState<PanelMode>('tour');
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [sheetFull, setSheetFull] = useState(false);

  const openPin = (id: string | null): void => {
    setSelectedPinId(id);
    if (id) {
      setPanel('pin');
      setSheetFull(false);
    } else if (panel === 'pin') {
      setPanel('tour');
    }
  };

  const stopIndex = tourStops.findIndex((s) => s.pinId === selectedPinId);
  const stop = stopIndex >= 0 ? tourStops[stopIndex] : undefined;
  const nextStop = (): void => {
    const next = stopIndex >= 0 ? tourStops[stopIndex + 1] : tourStops[0];
    if (next) openPin(next.pinId);
    else {
      setSelectedPinId(null);
      setPanel('bounties');
      setSheetFull(true);
    }
  };
  const byName = (id: string): string => data.members.find((m) => m.id === id)?.name ?? '?';

  // the tour is the point, so unlike a real table the sheet never fully
  // closes on mobile — it rests at peek height instead
  return (
    <div class={'table-view sheet-open' + (sheetFull ? ' sheet-full' : '')}>
      <header class="topbar">
        <span class="topbar-title">{data.campaign.name}</span>
        <span class="topbar-acts">
          <button class="quiet" onClick={() => setPanel(panel === 'bounties' ? 'tour' : 'bounties')}>
            Bounties ({data.bounties.filter((b) => b.status === 'posted').length})
          </button>
          <button class="quiet" onClick={onBack}>Back</button>
        </span>
      </header>

      <MapCanvas
        data={data}
        selectedPinId={selectedPinId}
        withGhosts={false}
        placing={false}
        onTapPin={openPin}
        onPlace={() => {}}
      />

      <aside class="side-panel">
        <div class="sheet-grip">
          <button class="sheet-toggle" onClick={() => setSheetFull((f) => !f)} title={sheetFull ? 'shrink' : 'expand'}>
            <span class="grip-bar" />
          </button>
          {panel !== 'tour' && (
            <button
              class="quiet sheet-close"
              onClick={() => {
                setSelectedPinId(null);
                setPanel('tour');
              }}
            >
              Close
            </button>
          )}
        </div>
        <div class="panel-body">
          {panel === 'pin' && selectedPinId ? (
            <>
              {stop && (
                <div class="tour-note">
                  <p>{stop.note}</p>
                  <button class="linklike" onClick={nextStop}>
                    {stopIndex < tourStops.length - 1 ? 'next stop →' : 'last stop: the bounty board →'}
                  </button>
                </div>
              )}
              <PinPanel key={selectedPinId} store={store} pinId={selectedPinId} onStartMove={() => {}} />
            </>
          ) : panel === 'bounties' ? (
            <>
              <div class="tour-note">
                <p>
                  Revenge gets its own surface: bounties are sworn by name, live off the map, and are never erased — a settled
                  score stays on the board, crossed out.
                </p>
                <button class="linklike" onClick={() => setPanel('tour')}>back to the tour →</button>
              </div>
              <ExampleBounties bounties={data.bounties} byName={byName} />
            </>
          ) : (
            <div class="tour">
              <h2>{data.campaign.name}</h2>
              <p class="card-hint">a finished stretch of campaign, kept as a guided example — everything here is readable, nothing is yours to touch</p>
              <p class="tour-intro">
                Hearsay keeps a campaign as a shared map that accumulates places. Every place carries two layers: the Campaign
                Manager's <b>canon</b> — what happened — and each player's <b>testimony</b> — how they remember it. Walk the
                stops in order, or tap any pin.
              </p>
              <ol class="tour-stops">
                {tourStops.map((s) => (
                  <li key={s.pinId}>
                    <button class="tour-stop" onClick={() => openPin(s.pinId)}>
                      <span class="tour-stop-name">{data.pins.find((p) => p.id === s.pinId)?.name}</span>
                      <span class="tour-stop-what">{s.teaser}</span>
                    </button>
                  </li>
                ))}
                <li>
                  <button class="tour-stop" onClick={() => { setSheetFull(true); setPanel('bounties'); }}>
                    <span class="tour-stop-name">The bounty board</span>
                    <span class="tour-stop-what">sworn revenge — posted by the Campaign Manager, settled but never erased</span>
                  </button>
                </li>
              </ol>
              <section class="tour-cta">
                <p class="card-hint">ready to keep a record of your own?</p>
                <button class="primary" onClick={onBack}>Back to the door</button>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
