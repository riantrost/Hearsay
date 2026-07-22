// The pin panel: a site's lineage read top to bottom — each event's canon
// headline, its atmosphere, then every seat's account. At the present it is
// also the write surface, and the player's whole note flow is one box: write
// your account, edit it freely (editing is just editing — no separate
// "amend" mode), one Save button, until the table's clock seals it. Marks
// survive as a quiet inline affordance on your own saved account. Drafts are
// component state, so a background refresh can't touch them by construction.

import { useMemo, useState } from 'preact/hooks';
import { siteMarks } from '../derive';
import { MARK_MAX_CHARS, MAX_ATMOSPHERE_CHARS, MAX_TESTIMONY_CHARS, type CampaignData, type SiteEvent, type Testimony } from '../model';
import { eventParticipants } from '../mutations';
import type { ApiStore } from '../store';
import { confirmDialog, oops } from './dialogs';

export interface PinPanelProps {
  store: ApiStore;
  pinId: string;
  session: number;
}

/** The session whose first event sealed this entry (for the locked caption). */
function sealedBy(data: CampaignData, t: Testimony): number | null {
  const later = data.events.filter((e) => e.session > t.session).map((e) => e.session);
  return later.length ? Math.min(...later) : null;
}

/** Your slot on one event: the one box. */
function YourAccount({ store, event, entry, writable }: { store: ApiStore; event: SiteEvent; entry: Testimony | undefined; writable: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const editable = writable && (!entry || store.canEdit(entry));
  const value = draft ?? entry?.text ?? '';
  const dirty = value.trim() !== (entry?.text ?? '') && value.trim() !== '';

  const save = (): void => {
    if (!dirty) return;
    store
      .writeTestimony(event.id, value.trim())
      .then(() => setDraft(null))
      .catch(oops);
  };

  if (!editable) {
    // sealed (or viewing the past): the account reads as text, plainly captioned
    const lock = entry ? sealedBy(store.data, entry) : null;
    return (
      <div class="your-account sealed">
        {entry ? <p>{entry.text}</p> : <p class="empty-slot">no account written</p>}
        {entry && writable && !store.canEdit(entry) && (
          <p class="sealed-caption">Saved — locked when session {lock ?? store.data.campaign.currentSession} began</p>
        )}
        {entry?.markText && <p class="mark-caption">✎ highlighted: “{entry.markText}”</p>}
      </div>
    );
  }

  // markable lines: your own saved sentences, each short enough to be graffiti
  const lines = entry && !entry.markText
    ? (entry.text.match(/[^.!?\n]+[.!?]*/g) ?? []).map((l) => l.trim()).filter((l) => l.length > 0 && l.length <= MARK_MAX_CHARS)
    : [];

  const highlight = async (line: string): Promise<void> => {
    const sure = await confirmDialog(`Leave this line as graffiti on the place, unattributed at a glance?\n\n“${line}”`, {
      title: 'Highlight as graffiti',
      confirmLabel: 'Highlight it',
    });
    setPicking(false);
    if (!sure || !entry) return;
    store.promoteMark(entry.id, line).catch(oops);
  };

  return (
    <div class="your-account">
      {picking && entry ? (
        <div class="mark-picker">
          <p class="picker-hint">pick the line to leave as graffiti:</p>
          {lines.map((line) => (
            <button key={line} class="mark-line" onClick={() => void highlight(line)}>
              {line}
            </button>
          ))}
          <button class="quiet" onClick={() => setPicking(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          <textarea
            placeholder="what happened here, as you saw it"
            maxLength={MAX_TESTIMONY_CHARS}
            value={value}
            onInput={(ev) => setDraft((ev.currentTarget as HTMLTextAreaElement).value)}
          />
          <div class="account-acts">
            <button class="primary" disabled={!dirty} onClick={save}>
              Save
            </button>
            {entry && <span class="grace-hint">editable until the next session begins</span>}
          </div>
          {entry?.markText ? (
            <p class="mark-caption">✎ highlighted: “{entry.markText}”</p>
          ) : (
            entry && lines.length > 0 && !dirty && (
              <button class="linklike mark-open" onClick={() => setPicking(true)}>
                Highlight a line as graffiti
              </button>
            )
          )}
        </>
      )}
    </div>
  );
}

/** Canon authorship (owner): headline + optional atmosphere, local-state drafts. */
function CanonForm({ heading, buttonLabel, submit, confirmMessage }: {
  heading: string;
  buttonLabel: string;
  submit: (canon: string, atmosphere: string | undefined) => Promise<unknown>;
  confirmMessage?: string;
}) {
  const [canon, setCanon] = useState('');
  const [air, setAir] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (): Promise<void> => {
    const line = canon.trim();
    if (!line || busy) return;
    if (confirmMessage && !(await confirmDialog(confirmMessage, { confirmLabel: buttonLabel, danger: true }))) return;
    setBusy(true);
    try {
      await submit(line, air.trim() || undefined);
      setCanon('');
      setAir('');
    } catch (e) {
      oops(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      class="canon-form"
      onSubmit={(ev) => {
        ev.preventDefault();
        void go();
      }}
    >
      <h3>{heading}</h3>
      <input placeholder="one line of canon: what happened here" value={canon} onInput={(ev) => setCanon((ev.currentTarget as HTMLInputElement).value)} />
      <textarea
        placeholder="the air of the place — optional"
        maxLength={MAX_ATMOSPHERE_CHARS}
        value={air}
        onInput={(ev) => setAir((ev.currentTarget as HTMLTextAreaElement).value)}
      />
      <button class="primary" disabled={!canon.trim() || busy}>
        {buttonLabel}
      </button>
    </form>
  );
}

export function PinPanel({ store, pinId, session }: PinPanelProps) {
  const data = store.data;
  const viewerId = store.seat.memberId;
  const pin = data.pins.find((p) => p.id === pinId);
  // "who was there" picker state, keyed naturally by this component instance
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const events = useMemo(
    () => data.events.filter((e) => e.pinId === pinId && e.session <= session).sort((a, b) => a.session - b.session),
    [data, pinId, session],
  );
  if (!pin) return <p class="panel-hint">this place is gone from the map</p>;

  const isOwner = store.me?.role === 'owner';
  const writable = session === data.campaign.currentSession;
  const marks = siteMarks(data, pinId, session);
  const pinIsUntouched = data.events.every((e) => e.pinId !== pinId);
  const first = events[0]?.session;
  const last = events[events.length - 1]?.session;

  const dropEvent = (canon: string, air: string | undefined): Promise<unknown> => {
    const roster = data.members;
    const chosen = roster.filter((m) => !excluded.has(m.id)).map((m) => m.id);
    // everyone (or no one) picked → the whole table, resolved live; a strict
    // subset → an explicit, owner-scoped participant list
    const participantIds = chosen.length === 0 || chosen.length === roster.length ? undefined : chosen;
    return store.addEvent(pinId, canon, air, participantIds).then((ev) => {
      setExcluded(new Set());
      return ev;
    });
  };

  return (
    <div class="pin-panel">
      <h2>{pin.name}</h2>
      {events.length > 0 && (
        <p class="site-line">
          {events.length === 1
            ? `one event · session ${first}`
            : first === last
              ? `${events.length} events · session ${first}`
              : `${events.length} events · sessions ${first}–${last}`}
        </p>
      )}

      {pin.hidden && isOwner && (
        <section class="staged-tools">
          <p class="staged-hint">hidden — the table cannot see this place</p>
          {writable && (
            <>
              <CanonForm
                heading="Reveal to the table"
                buttonLabel="Reveal to table"
                confirmMessage={`Reveal “${pin.name}” to the table? Everything prepped here becomes theirs to read — there is no way back to hidden.`}
                submit={(canon, air) => store.revealPin(pinId, canon, air)}
              />
              {pinIsUntouched && (
                <button class="quiet" onClick={() => store.setPinHidden(pinId, false).catch(oops)}>
                  Unhide pin
                </button>
              )}
            </>
          )}
        </section>
      )}
      {!pin.hidden && events.length === 0 && isOwner && (
        <section class="ghost-tools">
          <p class="ghost-hint">no history here yet — the first event makes this place real to the table</p>
          {writable && pinIsUntouched && (
            <button class="quiet" title="the table will not see this place until you reveal it" onClick={() => store.setPinHidden(pinId, true).catch(oops)}>
              Hide pin
            </button>
          )}
        </section>
      )}

      {events.map((event) => {
        const fresh = event.session === data.campaign.currentSession && writable;
        const participants = eventParticipants(data, event);
        return (
          <section class={'event' + (fresh ? ' fresh' : '')} key={event.id}>
            <h3>
              Session {event.session}
              {fresh && <span class="now-tag">now</span>}
              <span class="slot-jacks">
                {participants.map((memberId) => {
                  const told = data.testimony.some((t) => t.eventId === event.id && t.memberId === memberId);
                  return <i key={memberId} class={'jack' + (told ? ' told' : '')} />;
                })}
              </span>
            </h3>
            <p class="event-canon">{event.canonLine}</p>
            {event.atmosphere && <p class="event-atmosphere">{event.atmosphere}</p>}

            {participants.map((memberId) => {
              const member = data.members.find((m) => m.id === memberId);
              const entry = data.testimony.find((t) => t.eventId === event.id && t.memberId === memberId);
              const mine = memberId === viewerId;
              if (mine) {
                return (
                  <div class="testimony mine" key={memberId}>
                    <span class="testimony-author">{member?.name ?? '?'} (you)</span>
                    <YourAccount key={event.id + ':' + memberId} store={store} event={event} entry={entry} writable={writable} />
                  </div>
                );
              }
              return (
                <div class={'testimony' + (entry ? '' : ' empty')} key={memberId}>
                  <span class="testimony-author">{member?.name ?? '?'}</span>
                  <p>{entry ? entry.text : 'an open slot, quietly waiting'}</p>
                </div>
              );
            })}
          </section>
        );
      })}

      {marks.length > 0 && (
        <section class="marks-found">
          {marks.map((mark) => (
            <p class="mark" key={mark.id}>
              someone scrawled here: “{mark.markText}”
            </p>
          ))}
        </section>
      )}

      {isOwner && writable && (
        <section class="add-event">
          {data.members.length > 1 && (
            <div class="participant-picker">
              <span class="picker-label">Who was there</span>
              {data.members.map((m) => (
                <label class="participant" key={m.id}>
                  <input
                    type="checkbox"
                    checked={!excluded.has(m.id)}
                    onChange={(ev) => {
                      const next = new Set(excluded);
                      if ((ev.currentTarget as HTMLInputElement).checked) next.delete(m.id);
                      else next.add(m.id);
                      setExcluded(next);
                    }}
                  />
                  {m.name}
                  {m.status === 'pending' ? ' (pending)' : ''}
                </label>
              ))}
            </div>
          )}
          <CanonForm
            heading={pin.hidden ? `Prep a hidden event · Session ${data.campaign.currentSession}` : `New event · Session ${data.campaign.currentSession}`}
            buttonLabel={pin.hidden ? 'Add hidden event' : 'Add event'}
            submit={dropEvent}
          />
        </section>
      )}
    </div>
  );
}
