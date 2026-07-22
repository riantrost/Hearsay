// The front door: resume a campaign you already hold a seat at, create a new
// one (name + map, minting the owner's seat), or join by code (minting a
// pending seat). Every path hands back a Seat and the app takes it from
// there. Because one browser can sit at many tables, the door is reachable
// from inside a campaign too — arriving here never costs a seat.

import { useState } from 'preact/hooks';
import { createCampaign, joinCampaign } from '../api';
import { loadSeats, removeSeat, setActiveCampaign, type Seat } from '../seat';
import { confirmDialog } from './dialogs';
import { readMapSize } from './mapSize';

export interface LandingProps {
  /** A new seat was minted (create or join) — save it and open its campaign. */
  onSeated: (seat: Seat) => void;
  /** An existing campaign was picked from the list — it's already active, open it. */
  onResume: () => void;
  notice?: string;
  /** Whether this deployment offers the Google recovery thread. */
  google?: boolean;
  /** Leave for Google sign-in to pull linked seats onto this device. */
  onGoogle?: () => void;
}

export function Landing({ onSeated, onResume, notice, google, onGoogle }: LandingProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  // removals re-render through this counter; the seat book itself is localStorage
  const [, setBookVersion] = useState(0);
  const seats = loadSeats();

  const run = (work: () => Promise<void>): void => {
    setError(null);
    setBusy(true);
    work()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  const submitCreate = (ev: SubmitEvent): void => {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget as HTMLFormElement);
    run(async () => {
      const map = fd.get('map');
      if (!(map instanceof File) || map.size === 0) throw new Error('a campaign needs its map');
      const { w: mapW, h: mapH } = await readMapSize(map);
      const { campaign, member, token } = await createCampaign({
        name: String(fd.get('name') ?? ''),
        ownerName: String(fd.get('ownerName') ?? ''),
        map,
        mapW,
        mapH,
      });
      onSeated({ campaignId: campaign.id, memberId: member.id, token, label: campaign.name });
    });
  };

  const submitJoin = (ev: SubmitEvent): void => {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget as HTMLFormElement);
    run(async () => {
      const { campaignId, member, token } = await joinCampaign(
        String(fd.get('code') ?? '').trim(),
        String(fd.get('joinName') ?? '').trim(),
      );
      // the join response carries no campaign name; the label fills in on first boot
      onSeated({ campaignId, memberId: member.id, token });
    });
  };

  const forget = async (seat: Seat): Promise<void> => {
    const sure = await confirmDialog(
      `Forget “${seat.label ?? 'this campaign'}” on this device? Rejoining needs the join code or a seat link.`,
      { confirmLabel: 'Forget it', danger: true },
    );
    if (!sure) return;
    removeSeat(seat.campaignId);
    setBookVersion((v) => v + 1);
  };

  return (
    <div class="landing">
      <h1>Hearsay</h1>
      <p class="tagline">the shared map remembers — every seat remembers differently</p>
      {notice && <p class="landing-notice">{notice}</p>}

      {seats.length > 0 && (
        <section class="landing-card">
          <h2>Your campaigns</h2>
          <ul class="table-list">
            {seats.map((seat) => (
              <li class="table-row" key={seat.campaignId}>
                <button
                  class="table-open"
                  onClick={() => {
                    setActiveCampaign(seat.campaignId);
                    onResume();
                  }}
                >
                  {seat.label ?? 'a campaign'}
                </button>
                <button class="table-leave quiet" title="forget this campaign on this device" onClick={() => void forget(seat)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section class="landing-card">
        <h2>Start a campaign</h2>
        <p class="card-hint">you'll be the Campaign Manager — the map and its canon are yours</p>
        <form onSubmit={submitCreate}>
          <input name="name" placeholder="campaign name" required maxLength={80} />
          <input name="ownerName" placeholder="your name" required maxLength={60} />
          <label class="map-pick">
            the world map <input name="map" type="file" accept="image/*" required />
          </label>
          <button class="primary" disabled={busy}>Create campaign</button>
        </form>
      </section>

      <section class="landing-card">
        <h2>Join a campaign</h2>
        <form onSubmit={submitJoin}>
          <input
            name="code"
            placeholder="join code"
            required
            maxLength={12}
            autocapitalize="characters"
            value={joinCode}
            onInput={(ev) => setJoinCode((ev.currentTarget as HTMLInputElement).value)}
          />
          <input name="joinName" placeholder="your name" required maxLength={60} />
          <button class="primary" disabled={busy}>Join</button>
        </form>
        <p class="example-invite">
          just looking?{' '}
          <button
            type="button"
            class="linklike"
            onClick={(ev) => {
              setJoinCode('EXAMPLE');
              const form = (ev.currentTarget as HTMLElement).closest('section')?.querySelector<HTMLInputElement>('[name=joinName]');
              form?.focus();
            }}
          >
            View the example campaign
          </button>
        </p>
      </section>

      {google && onGoogle && (
        <section class="landing-card">
          <h2>Been here before?</h2>
          <p class="card-hint">seats backed up to Google follow you to any device</p>
          <button class="quiet" onClick={onGoogle}>Find my campaigns</button>
        </section>
      )}

      {error && <p class="landing-error">{error}</p>}
    </div>
  );
}
