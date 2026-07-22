// The campaign & seat panel: who you are here, the roster, the join code,
// device handoff, and the Google backup thread. Administrative controls live
// here — not floating over the map.

import { encodeSeatLink, loadSeats, startGoogleFlow } from '../seat';
import type { ApiStore } from '../store';
import { confirmDialog, oops, textDialog } from './dialogs';

export interface IdentityPanelProps {
  store: ApiStore;
  googleOn: boolean;
  onSwitchCampaign: () => void;
  onLeave: () => void;
}

export function IdentityPanel({ store, googleOn, onSwitchCampaign, onLeave }: IdentityPanelProps) {
  const data = store.data;
  const me = store.me;
  const isOwner = me?.role === 'owner';
  const pending = data.members.filter((m) => m.status === 'pending');
  const active = data.members.filter((m) => m.status === 'active');
  const linked = loadSeats().find((s) => s.campaignId === store.seat.campaignId)?.google;

  // hand a member a fresh chair for a new device: mint a reclaim seat, build
  // the self-contained URL, copy it, and show it even if the clipboard is denied
  const seatLinkFor = async (memberId: string, name: string): Promise<void> => {
    try {
      const seat = await store.mintReclaim(memberId);
      const url = encodeSeatLink(seat, location.origin);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* clipboard may be blocked; the dialog still shows the link */
      }
      await textDialog(`Seat link for ${name} — copied. Hand it over privately; anyone with it can write as ${name}.`, {
        title: 'Seat link',
        initial: url,
        confirmLabel: 'Done',
      });
    } catch (e) {
      oops(e);
    }
  };

  const declineMember = async (memberId: string, name: string): Promise<void> => {
    const sure = await confirmDialog(`Decline ${name}? Their seat and their words are removed.`, {
      confirmLabel: 'Decline',
      danger: true,
    });
    if (sure) store.declineMember(memberId).catch(oops);
  };

  const rotateCode = async (): Promise<void> => {
    const sure = await confirmDialog('Make a new join code? The current code stops working — anyone you already gave it to will need the new one.', {
      confirmLabel: 'New code',
    });
    if (sure) store.rotateCode().catch(oops);
  };

  const leave = async (): Promise<void> => {
    const sure = await confirmDialog('Forget this campaign on this device? Rejoining needs the join code or a seat link.', {
      confirmLabel: 'Leave',
      danger: true,
    });
    if (sure) onLeave();
  };

  return (
    <div class="identity-panel">
      <h2>{data.campaign.name}</h2>
      <p class="seat-line">
        {me?.name ?? '?'}
        {isOwner ? ' — Campaign Manager' : me?.status === 'pending' ? ' — pending' : ''}
      </p>
      {me?.status === 'pending' && (
        <p class="pending-hint">your words are visible only to you and the Campaign Manager until you're approved</p>
      )}

      {isOwner && (
        <section class="panel-section">
          <h3>Join code</h3>
          <p class="code-row">
            <code>{data.campaign.joinCode}</code>
            <button class="quiet" onClick={() => void rotateCode()}>
              New join code
            </button>
          </p>
          <p class="card-hint">share it freely — joiners write immediately, their words reach the table when you approve them</p>
        </section>
      )}

      {isOwner && pending.length > 0 && (
        <section class="panel-section">
          <h3>Waiting to join</h3>
          {pending.map((m) => (
            <div class="member-row" key={m.id}>
              <span>{m.name}</span>
              <span class="row-acts">
                <button class="primary" onClick={() => store.approveMember(m.id).catch(oops)}>
                  Approve
                </button>
                <button class="quiet" onClick={() => void declineMember(m.id, m.name)}>
                  Decline
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      <section class="panel-section">
        <h3>Seats</h3>
        {isOwner ? (
          active.map((m) => (
            <div class="member-row" key={m.id}>
              <span>
                {m.name}
                {m.role === 'owner' ? ' — CM' : ''}
                {m.id === store.seat.memberId ? ' (you)' : ''}
              </span>
              <button
                class="quiet"
                title={m.id === store.seat.memberId ? 'open your seat on another device' : `re-seat ${m.name} on a new device`}
                onClick={() => void seatLinkFor(m.id, m.name)}
              >
                Copy seat link
              </button>
            </div>
          ))
        ) : (
          me && (
            <div class="member-row">
              <span>use this seat on another device</span>
              <button class="quiet" onClick={() => void seatLinkFor(me.id, me.name)}>
                Copy seat link
              </button>
            </div>
          )
        )}
        {googleOn && (
          <div class="member-row">
            {linked ? (
              <span class="card-hint">backed up to {linked}</span>
            ) : (
              <>
                <span>a lost phone can find this seat again</span>
                <button class="quiet" onClick={() => startGoogleFlow('link')}>
                  Back up with Google
                </button>
              </>
            )}
          </div>
        )}
      </section>

      <section class="panel-section panel-foot">
        <button class="quiet" onClick={onSwitchCampaign}>
          Switch campaign
        </button>
        <button class="quiet" onClick={() => void leave()}>
          Leave campaign
        </button>
      </section>
    </div>
  );
}
