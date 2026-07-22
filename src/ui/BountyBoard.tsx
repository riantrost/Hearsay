// The bounty board: sworn revenge, posted to the table. Any member proposes;
// the Campaign Manager posts it to the board, declines it, or marks it
// settled (crossed out, kept forever). Proposals are visible only to their
// poster and the CM — the server strips the rest.

import { useState } from 'preact/hooks';
import { MAX_BOUNTY_REASON_CHARS, MAX_BOUNTY_TARGET_CHARS, type Bounty } from '../model';
import type { ApiStore } from '../store';
import { confirmDialog, oops } from './dialogs';
import { fmtDay } from './format';

function BountyCard({ store, b }: { store: ApiStore; b: Bounty }) {
  const poster = store.data.members.find((m) => m.id === b.postedBy);
  const isOwner = store.me?.role === 'owner';
  const decline = async (): Promise<void> => {
    const sure = await confirmDialog('Decline this bounty? A bounty that never reached the board is gone for good.', {
      confirmLabel: 'Decline',
      danger: true,
    });
    if (sure) store.declineBounty(b.id).catch(oops);
  };
  return (
    <article class={'bounty ' + b.status}>
      <h3>{b.target}</h3>
      <p>{b.reason}</p>
      <div class="bounty-byline">
        {b.status === 'struck' && b.struckAt !== undefined
          ? `sworn by ${poster?.name ?? '?'} · ${fmtDay(b.postedAt)} — settled ${fmtDay(b.struckAt)}`
          : `sworn by ${poster?.name ?? '?'} · ${fmtDay(b.postedAt)}`}
      </div>
      {b.status === 'proposed' &&
        (isOwner ? (
          <div class="bounty-acts">
            <button class="primary" onClick={() => store.approveBounty(b.id).catch(oops)}>
              Post to board
            </button>
            <button class="quiet" onClick={() => void decline()}>
              Decline
            </button>
          </div>
        ) : (
          <div class="bounty-hint">awaiting review — only you and the Campaign Manager see this</div>
        ))}
      {b.status === 'posted' && isOwner && (
        <div class="bounty-acts">
          <button class="quiet" onClick={() => store.strikeBounty(b.id).catch(oops)}>
            Mark settled
          </button>
        </div>
      )}
    </article>
  );
}

export function BountyBoard({ store }: { store: ApiStore }) {
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const bounties = store.data.bounties;
  const left = MAX_BOUNTY_REASON_CHARS - reason.length;

  const groups: [string, Bounty[]][] = [
    ['Awaiting review', bounties.filter((b) => b.status === 'proposed')],
    ['Posted', [...bounties.filter((b) => b.status === 'posted')].sort((a, z) => z.postedAt - a.postedAt)],
    ['Settled', [...bounties.filter((b) => b.status === 'struck')].sort((a, z) => (z.struckAt ?? 0) - (a.struckAt ?? 0))],
  ];

  const swear = (ev: SubmitEvent): void => {
    ev.preventDefault();
    store
      .addBounty(target.trim(), reason.trim())
      .then(() => {
        setTarget('');
        setReason('');
      })
      .catch(oops);
  };

  return (
    <div class="bounty-board">
      <h2>Bounties</h2>
      {bounties.length === 0 && <p class="board-empty">no scores to settle — yet. The board takes all comers.</p>}
      {groups.map(
        ([title, list]) =>
          list.length > 0 && (
            <section class="panel-section" key={title}>
              <h3>{title}</h3>
              {list.map((b) => (
                <BountyCard key={b.id} store={store} b={b} />
              ))}
            </section>
          ),
      )}
      <form class="bounty-form" onSubmit={swear}>
        <h3>Post a bounty</h3>
        <input
          placeholder="the quarry — who or what"
          required
          maxLength={MAX_BOUNTY_TARGET_CHARS}
          value={target}
          onInput={(ev) => setTarget((ev.currentTarget as HTMLInputElement).value)}
        />
        <textarea
          placeholder="the grievance and the promise, in your own words"
          required
          maxLength={MAX_BOUNTY_REASON_CHARS}
          value={reason}
          onInput={(ev) => setReason((ev.currentTarget as HTMLTextAreaElement).value)}
        />
        <div class="account-acts">
          <button class="primary" disabled={!target.trim() || !reason.trim()}>
            Post bounty
          </button>
          <span class={'char-count' + (left <= 20 ? ' char-count-low' : '')}>{left} left</span>
        </div>
        <p class="card-hint">the Campaign Manager reviews it before it reaches the board</p>
      </form>
    </div>
  );
}
