// Boot: a stored seat opens the table; no seat (or a dead one — declined,
// wiped) lands on the front door. The table view is the map, the scrubber,
// the pin surface, and the identity header where the owner resolves
// membership proposals and rotates the join code.

import './style.css';
import { ApiError, fetchAuthConfig, postGoogleLink, postGoogleRecover } from './api';
import { ApiStore } from './apiStore';
import { renderLanding } from './landing';
import { renderMap } from './map/render';
import { renderPinSurface } from './map/pinSurface';
import { Viewport } from './map/viewport';
import {
  encodeSeatLink,
  loadActiveSeat,
  loadSeats,
  parseGauth,
  parseSeatLink,
  rememberSeatGoogle,
  rememberSeatLabel,
  removeSeat,
  saveSeat,
  startGoogleFlow,
  takeGoogleMode,
  type Seat,
} from './seat';

const app = document.querySelector<HTMLDivElement>('#app')!;

/** How often an open pin surface asks the server what it missed. */
const PIN_POLL_MS = 5000;

/** Undoes the previous table's listeners/timers when the app re-boots. */
let teardown: (() => void) | undefined;

/** Whether this deployment has the Google recovery thread, asked once. */
let authProbe: Promise<boolean> | undefined;
function googleAvailable(): Promise<boolean> {
  authProbe ??= fetchAuthConfig()
    .then((c) => c.google)
    .catch(() => false);
  return authProbe;
}

async function boot(): Promise<void> {
  teardown?.();
  teardown = undefined;
  // a reclaim link carries a whole seat in the URL fragment — sit down in it,
  // then scrub the token out of the address bar so it isn't left lying around
  const reclaimed = parseSeatLink(location.hash);
  if (reclaimed) {
    history.replaceState(null, '', location.pathname + location.search);
    saveSeat(reclaimed);
    void boot();
    return;
  }
  // ...or the Google callback landed us here with an auth-session handle
  const gauth = parseGauth(location.hash);
  if (gauth) {
    history.replaceState(null, '', location.pathname + location.search);
    await handleGoogleReturn(gauth);
    return;
  }
  const seat = loadActiveSeat();
  if (!seat) {
    showFrontDoor();
    return;
  }
  let store: ApiStore;
  try {
    store = await ApiStore.boot(seat);
  } catch (e) {
    // drop the chair only when the seat is genuinely gone — declined, wiped,
    // or its token dead (401/403/404). A transient failure (server blip,
    // offline) must not evict a good seat: it keeps its place in the picker,
    // and the front door shows the error so the reader can retry
    const seatIsGone = e instanceof ApiError && [401, 403, 404].includes(e.status);
    if (seatIsGone) removeSeat(seat.campaignId);
    showFrontDoor(e instanceof Error ? e.message : String(e));
    return;
  }
  // now that the campaign is loaded, cache its name for the tables picker
  rememberSeatLabel(seat.campaignId, store.data.campaign.name);
  renderTable(store, await googleAvailable());
}

/**
 * Home from Google: either back the active seat up (link) or pull every
 * linked seat onto this device (recover — the walked-into-the-shop-empty-
 * handed case). The mode rode sessionStorage across the redirect; if it
 * didn't survive, recovery is the safe reading.
 */
async function handleGoogleReturn(gauth: string): Promise<void> {
  const mode = takeGoogleMode();
  try {
    if (mode === 'link') {
      const seat = loadActiveSeat();
      if (!seat) throw new Error('no active seat to back up');
      const { email } = await postGoogleLink(seat, gauth);
      rememberSeatGoogle(seat.campaignId, email);
      void boot();
      return;
    }
    const { email, seats } = await postGoogleRecover(gauth);
    for (const s of seats) saveSeat({ ...s, google: email });
    if (seats.length === 0) {
      showFrontDoor(`no seats are backed up to ${email || 'that google account'} yet — join with a code, then back your seat up`);
      return;
    }
    void boot();
  } catch (e) {
    showFrontDoor(e instanceof Error ? e.message : String(e));
  }
}

/** The front door, reachable with a seat still held — adding a table costs none. */
function showFrontDoor(notice?: string): void {
  teardown?.();
  teardown = undefined;
  void googleAvailable().then((google) =>
    renderLanding(app, {
      onSeated,
      onResume: () => void boot(),
      notice,
      google,
      onGoogle: () => startGoogleFlow('recover'),
    }),
  );
}

function onSeated(seat: Seat): void {
  saveSeat(seat);
  void boot();
}

function renderTable(store: ApiStore, googleOn: boolean): void {
  const ac = new AbortController();
  const signal = ac.signal;
  app.innerHTML = `
    <div class="map-host"></div>
    <aside class="pin-surface" hidden></aside>
    <header class="identity"></header>
    <button class="help-btn" title="how this works">?</button>
    <div class="help-overlay" hidden>
      <div class="help-card">
        <h2>How Hearsay works</h2>
        <div class="help-body"></div>
        <button class="help-close">got it</button>
      </div>
    </div>
    <button class="board-btn" hidden></button>
    <div class="board-overlay" hidden>
      <div class="board-card">
        <h2>The bounty board</h2>
        <div class="board-list"></div>
        <form class="bounty-form">
          <input name="target" placeholder="the quarry — who or what" required maxlength="60" />
          <textarea name="reason" placeholder="the grievance and the promise, in your own words" required maxlength="280"></textarea>
          <span class="char-count"></span>
          <button>swear it</button>
        </form>
        <button class="board-close quiet">back to the map</button>
      </div>
    </div>
    <div class="map-hint" hidden>name your first place — press ＋ Pin, then tap the map</div>
    <div class="placebar" hidden>
      <span class="placebar-dot"></span>
      <span>Tap the map where it happened</span>
      <button class="placebar-cancel">cancel</button>
    </div>
    <button class="place-btn" hidden>＋ Pin</button>
    <div class="pastbar" hidden>
      <span class="pastbar-text"></span>
      <button class="pastbar-now">return to now</button>
    </div>
    <footer class="scrubber collapsed">
      <button class="scrubber-pill" hidden></button>
      <span class="scrubber-label"></span>
      <input type="range" min="1" step="1" list="session-ticks" />
      <datalist id="session-ticks"></datalist>
      <button class="advance" hidden>begin session</button>
    </footer>
  `;

  const mapHost = app.querySelector<HTMLDivElement>('.map-host')!;
  const surface = app.querySelector<HTMLElement>('.pin-surface')!;
  const identity = app.querySelector<HTMLElement>('.identity')!;
  const placebar = app.querySelector<HTMLElement>('.placebar')!;
  const placeBtn = app.querySelector<HTMLButtonElement>('.place-btn')!;
  const pastbar = app.querySelector<HTMLElement>('.pastbar')!;
  const pastbarText = pastbar.querySelector<HTMLElement>('.pastbar-text')!;
  const ticks = app.querySelector<HTMLDataListElement>('#session-ticks')!;
  const scrubber = app.querySelector<HTMLElement>('.scrubber')!;
  const scrubberPill = app.querySelector<HTMLButtonElement>('.scrubber-pill')!;
  const slider = app.querySelector<HTMLInputElement>('.scrubber input')!;
  const sliderLabel = app.querySelector<HTMLElement>('.scrubber-label')!;
  const advanceBtn = app.querySelector<HTMLButtonElement>('.advance')!;
  const helpBtn = app.querySelector<HTMLButtonElement>('.help-btn')!;
  const helpOverlay = app.querySelector<HTMLElement>('.help-overlay')!;
  const mapHint = app.querySelector<HTMLElement>('.map-hint')!;
  const boardBtn = app.querySelector<HTMLButtonElement>('.board-btn')!;
  const boardOverlay = app.querySelector<HTMLElement>('.board-overlay')!;
  const boardList = app.querySelector<HTMLElement>('.board-list')!;
  const bountyForm = app.querySelector<HTMLFormElement>('.bounty-form')!;

  let session = store.data.campaign.currentSession;
  let selectedPinId: string | null = null;
  // the scrubber sleeps as a pill until someone deliberately opens the past
  let scrubberOpen = false;
  // the identity panel likewise: a name until reached for, admin on demand
  let identityOpen = false;
  // ...and the bounty board, a pill until someone reads the wall
  let boardOpen = false;
  // dropping a pin is a deliberate act, never a byproduct of touching the map:
  // the owner arms placement, and the *next* map tap places, then disarms
  let placing = false;
  const viewerId = store.seat.memberId;
  const isOwner = () => store.me?.role === 'owner';
  const canPlace = () => isOwner() && session === store.data.campaign.currentSession;
  const oops = (e: unknown) => alert(e instanceof Error ? e.message : String(e));

  // hand a member a fresh chair for a new device: mint a reclaim seat, build
  // the self-contained URL, copy it, and reveal it (prompt survives the poll's
  // re-renders, and shows the full link even if clipboard is denied)
  async function reclaimFor(memberId: string, name: string): Promise<void> {
    try {
      const seat = await store.mintReclaim(memberId);
      const url = encodeSeatLink(seat, location.origin);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* clipboard may be blocked; the prompt still shows the link */
      }
      window.prompt(`Reclaim link for ${name} — hand it over privately; anyone with it can write as ${name}.`, url);
    } catch (e) {
      oops(e);
    }
  }

  function setPlacing(on: boolean): void {
    placing = on && canPlace();
    render();
  }

  const viewport = new Viewport(mapHost, {
    onTap(target, cx, cy) {
      // armed: this tap places a single pin at open ground, then disarms
      if (placing) {
        placing = false;
        render();
        const { mapW, mapH } = store.data.campaign;
        if (canPlace() && cx >= 0 && cy >= 0 && cx <= mapW && cy <= mapH) {
          const name = window.prompt('Name this place');
          if (name?.trim()) {
            store
              .addPin(cx / mapW, cy / mapH, name)
              .then((pin) => {
                // addPin's notify re-renders with the old selection; select the
                // new pin and render again so the surface opens on the right place
                selectedPinId = pin.id;
                render();
              })
              .catch(oops);
          }
        }
        return;
      }
      // otherwise the map only browses: a tap selects a pin or clears selection
      const pinEl = target.closest<SVGGElement>('.pin');
      selectedPinId = pinEl?.dataset.pinId ?? null;
      render();
    },
    onTransform(scale) {
      // pins counter-scale against the world transform so they stay legible at
      // any zoom (clamped, so they neither balloon nor vanish at the extremes)
      const k = Math.max(0.5, Math.min(2.4, 1 / scale));
      mapHost.style.setProperty('--pin-k', k.toFixed(3));
    },
  });
  viewport.setContentSize(store.data.campaign.mapW, store.data.campaign.mapH);

  placeBtn.addEventListener('click', () => setPlacing(!placing));
  placebar.querySelector('.placebar-cancel')!.addEventListener('click', () => setPlacing(false));

  // the flow, explained in place — placeholder text alone leaves first-timers
  // guessing, so the ? opens a role-shaped account of the loop
  helpOverlay.querySelector<HTMLElement>('.help-body')!.innerHTML = isOwner()
    ? `<ul>
        <li><b>You own the world.</b> Press <b>＋ Pin</b>, then tap the map to name a place.</li>
        <li>Open a place to <b>drop an event</b>: one line of canon (the headline), plus optional atmosphere prose. Events are what players testify to.</li>
        <li><b>Stage in secret</b> preps a place only you can see; a <b>reveal</b> brings it to the table as a timeline event.</li>
        <li><b>Begin session</b> advances the campaign clock. Testimony on past sessions closes once the new session's first event lands.</li>
        <li>Share the <b>join code</b> freely — joiners write immediately, but their words reach the table only after you approve them.</li>
        <li>The <b>bounty board</b> collects players' sworn revenge — you nail proposals up, and strike them settled.</li>
        <li>Once history spans sessions, the <b>session pill</b> (bottom) scrubs the map back through time.</li>
      </ul>`
    : `<ul>
        <li><b>Tap a pin</b> to read a place's history — the owner's canon first, then every seat's testimony.</li>
        <li><b>Testify</b> in your own words: what happened here, as you remember it. Your account is yours alone; contradiction is welcome.</li>
        <li>You can <b>amend</b> your entry until the next session begins — then it closes for good.</li>
        <li><b>Scrawl a mark</b>: one short line from your testimony left as graffiti on the place, unattributed at a glance.</li>
        <li>Hollow pips on a pin are <b>voices still missing</b> from its latest events.</li>
        <li>Killed? Wronged? <b>Swear a bounty</b> on the board — the owner nails it up for the table to read.</li>
        <li>Once history spans sessions, the <b>session pill</b> (bottom) scrubs the map back through time.</li>
      </ul>`;
  helpBtn.addEventListener('click', () => {
    helpOverlay.hidden = false;
  });
  helpOverlay.addEventListener('click', (ev) => {
    const t = ev.target as Element;
    if (t === helpOverlay || t.closest('.help-close')) helpOverlay.hidden = true;
  });

  scrubberPill.addEventListener('click', () => {
    scrubberOpen = !scrubberOpen;
    render();
  });

  // --- the bounty board ---

  boardBtn.addEventListener('click', () => {
    boardOpen = true;
    render();
  });
  boardOverlay.addEventListener('click', (ev) => {
    const t = ev.target as Element;
    if (t === boardOverlay || t.closest('.board-close')) {
      boardOpen = false;
      render();
    }
  });
  // the grievance is hard-capped (a poster, not a saga); a live counter makes
  // the wall visible while writing, since the placeholder is long gone by then
  const reasonField = bountyForm.querySelector<HTMLTextAreaElement>('[name=reason]')!;
  const reasonCount = bountyForm.querySelector<HTMLElement>('.char-count')!;
  const updateCount = (): void => {
    const left = reasonField.maxLength - reasonField.value.length;
    reasonCount.textContent = `${left} left`;
    reasonCount.classList.toggle('char-count-low', left <= 20);
  };
  reasonField.addEventListener('input', updateCount);
  updateCount();
  bountyForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(bountyForm);
    store
      .addBounty(String(fd.get('target') ?? ''), String(fd.get('reason') ?? ''))
      .then(() => {
        bountyForm.reset();
        updateCount();
      })
      .catch(oops);
  });

  function bountyEntry(b: (typeof store.data.bounties)[number]): HTMLElement {
    const poster = store.data.members.find((m) => m.id === b.postedBy);
    const el = document.createElement('article');
    el.className = `bounty ${b.status}`;
    const target = document.createElement('h3');
    target.textContent = b.target;
    const reason = document.createElement('p');
    reason.textContent = b.reason;
    const byline = document.createElement('div');
    byline.className = 'bounty-byline';
    byline.textContent =
      b.status === 'struck'
        ? `sworn by ${poster?.name ?? '?'} · session ${b.session} — settled, session ${b.struckSession}`
        : `sworn by ${poster?.name ?? '?'} · session ${b.session}`;
    el.append(target, reason, byline);
    if (b.status === 'proposed') {
      if (isOwner()) {
        const acts = document.createElement('div');
        acts.className = 'bounty-acts';
        const approve = document.createElement('button');
        approve.className = 'approve';
        approve.textContent = 'nail it up';
        approve.addEventListener('click', () => store.approveBounty(b.id).catch(oops));
        const decline = document.createElement('button');
        decline.className = 'quiet';
        decline.textContent = 'refuse';
        decline.addEventListener('click', () => {
          if (confirm('Refuse this bounty? Paper that never reached the board is gone.')) {
            store.declineBounty(b.id).catch(oops);
          }
        });
        acts.append(approve, decline);
        el.appendChild(acts);
      } else {
        const hint = document.createElement('div');
        hint.className = 'bounty-hint';
        hint.textContent = 'awaiting the owner’s nail — only you and the owner see this';
        el.appendChild(hint);
      }
    } else if (b.status === 'posted' && isOwner()) {
      const acts = document.createElement('div');
      acts.className = 'bounty-acts';
      const strike = document.createElement('button');
      strike.className = 'quiet';
      strike.textContent = 'strike it settled';
      strike.addEventListener('click', () => store.strikeBounty(b.id).catch(oops));
      acts.appendChild(strike);
      el.appendChild(acts);
    }
    return el;
  }

  function renderBoard(): void {
    // an in-flight draft must survive the poll's wholesale rebuild
    const draftTarget = bountyForm.querySelector<HTMLInputElement>('[name=target]')!.value;
    const draftReason = bountyForm.querySelector<HTMLTextAreaElement>('[name=reason]')!.value;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.getAttribute('name') : null;

    const bounties = store.data.bounties;
    const groups: [string, (typeof bounties)] [] = [
      ['awaiting the nail', bounties.filter((b) => b.status === 'proposed')],
      ['on the board', [...bounties.filter((b) => b.status === 'posted')].sort((a, z) => z.session - a.session)],
      ['settled scores', [...bounties.filter((b) => b.status === 'struck')].sort((a, z) => (z.struckSession ?? 0) - (a.struckSession ?? 0))],
    ];
    const frag = document.createDocumentFragment();
    for (const [title, list] of groups) {
      if (list.length === 0) continue;
      const h = document.createElement('div');
      h.className = 'board-group';
      h.textContent = title;
      frag.appendChild(h);
      for (const b of list) frag.appendChild(bountyEntry(b));
    }
    if (bounties.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'board-empty';
      empty.textContent = 'no scores to settle — yet. The board takes all comers.';
      frag.appendChild(empty);
    }
    boardList.replaceChildren(frag);

    bountyForm.querySelector<HTMLInputElement>('[name=target]')!.value = draftTarget;
    bountyForm.querySelector<HTMLTextAreaElement>('[name=reason]')!.value = draftReason;
    if (focused) bountyForm.querySelector<HTMLElement>(`[name=${focused}]`)?.focus();
  }

  function renderIdentity(): void {
    const me = store.me;
    const frag = document.createDocumentFragment();

    // the panel sleeps as a name; everything administrative waits behind the
    // caret, so the map keeps the corner. Pending join requests surface as a
    // count on the caret so the owner never misses a knock.
    const waiting = isOwner() ? store.data.members.filter((x) => x.status === 'pending').length : 0;
    const head = document.createElement('div');
    head.className = 'identity-head';
    const name = document.createElement('span');
    name.className = 'seat-name';
    const roleTag = me?.role === 'owner' ? ' — owner' : me?.status === 'pending' ? ' — pending' : '';
    name.textContent = `${me?.name ?? '?'}${roleTag}`;
    const caret = document.createElement('button');
    caret.className = 'quiet identity-caret';
    caret.title = identityOpen ? 'tuck the table details away' : 'table details';
    caret.textContent = identityOpen ? 'close ▴' : waiting > 0 ? `table ▾ · ${waiting} waiting` : 'table ▾';
    caret.classList.toggle('attention', !identityOpen && waiting > 0);
    caret.addEventListener('click', () => {
      identityOpen = !identityOpen;
      render();
    });
    head.append(name, caret);
    frag.appendChild(head);

    // a pending seat's status is not admin detail — it stays in view
    if (me?.status === 'pending') {
      const hint = document.createElement('div');
      hint.className = 'pending-hint';
      hint.textContent = 'your words are visible only to you and the owner until you are approved';
      frag.appendChild(hint);
    }

    if (identityOpen) {
      const body = document.createElement('div');
      body.className = 'identity-body';

      // the recovery thread: one tap ties this seat to a Google account, so a
      // lost phone or a new device can find it with nothing else in hand
      if (googleOn) {
        const backup = document.createElement('div');
        backup.className = 'identity-row';
        const linked = loadSeats().find((s) => s.campaignId === store.seat.campaignId)?.google;
        if (linked) {
          backup.textContent = `backed up to ${linked}`;
        } else {
          const link = document.createElement('button');
          link.className = 'quiet';
          link.textContent = 'back up with Google';
          link.title = 'a lost phone can find this seat again';
          link.addEventListener('click', () => startGoogleFlow('link'));
          backup.appendChild(link);
        }
        body.appendChild(backup);
      }

      if (isOwner()) {
        const codeRow = document.createElement('div');
        codeRow.className = 'identity-row code-row';
        codeRow.textContent = `join code ${store.data.campaign.joinCode} `;
        const rotate = document.createElement('button');
        rotate.className = 'quiet';
        rotate.textContent = 'rotate';
        rotate.title = 'mint a fresh code; the old one stops working';
        rotate.addEventListener('click', () => store.rotateCode().catch(oops));
        codeRow.appendChild(rotate);
        body.appendChild(codeRow);

        for (const m of store.data.members.filter((x) => x.status === 'pending')) {
          const row = document.createElement('div');
          row.className = 'identity-row pending-row';
          row.textContent = `${m.name} asks to join `;
          const approve = document.createElement('button');
          approve.className = 'approve';
          approve.textContent = 'approve';
          approve.addEventListener('click', () => store.approveMember(m.id).catch(oops));
          const decline = document.createElement('button');
          decline.className = 'quiet';
          decline.textContent = 'decline';
          decline.addEventListener('click', () => {
            if (confirm(`Decline ${m.name}? Their seat and their words are removed.`)) {
              store.declineMember(m.id).catch(oops);
            }
          });
          row.append(approve, decline);
          body.appendChild(row);
        }

        // the roster: seated members, each re-seatable on a new device. A lost
        // phone (or Safari evicting the seat) needn't orphan anyone's testimony —
        // the owner hands back the same chair, no new membership, no re-approval.
        for (const m of store.data.members.filter((x) => x.status === 'active')) {
          const row = document.createElement('div');
          row.className = 'identity-row member-row';
          row.textContent = `${m.name}${m.role === 'owner' ? ' — owner' : ''}${m.id === viewerId ? ' (you)' : ''} `;
          const reclaim = document.createElement('button');
          reclaim.className = 'quiet';
          reclaim.textContent = 'seat link';
          reclaim.title = m.id === viewerId ? 'open your seat on another device' : `re-seat ${m.name} on a new device`;
          reclaim.addEventListener('click', () => void reclaimFor(m.id, m.name));
          row.appendChild(reclaim);
          body.appendChild(row);
        }
      } else if (me) {
        // self-serve device handoff: a player mints their own seat link
        const row = document.createElement('div');
        row.className = 'identity-row';
        const selfLink = document.createElement('button');
        selfLink.className = 'quiet';
        selfLink.textContent = 'open this seat on another device';
        selfLink.addEventListener('click', () => void reclaimFor(me.id, me.name));
        row.appendChild(selfLink);
        body.appendChild(row);
      }

      // one browser holds many chairs: the front door never costs this one
      const foot = document.createElement('div');
      foot.className = 'identity-row identity-foot';
      const tables = document.createElement('button');
      tables.className = 'quiet';
      tables.textContent = 'tables';
      tables.title = 'switch tables or found/join another';
      tables.addEventListener('click', () => showFrontDoor());
      const leave = document.createElement('button');
      leave.className = 'quiet';
      leave.textContent = 'leave';
      leave.addEventListener('click', () => {
        if (confirm('Forget this table on this device? Rejoin needs the code or a reclaim link from the owner.')) {
          removeSeat(store.seat.campaignId);
          void boot();
        }
      });
      foot.append(tables, leave);
      body.appendChild(foot);
      frag.appendChild(body);
    }
    identity.replaceChildren(frag);
  }

  function render(): void {
    renderMap(mapHost, store.data, {
      session,
      selectedPinId,
      // the owner's scaffolding (ghosts, staged pins) is prep, outside the
      // timeline — it stays on their map at any viewed session, so a scrub
      // can never make the secret layer vanish
      withGhosts: isOwner(),
    });
    viewport.apply();
    renderIdentity();
    // the bounty board: a pill until read; posted count on the label, and an
    // ember nudge for the owner while proposals wait for the nail
    const posted = store.data.bounties.filter((b) => b.status === 'posted').length;
    const proposals = store.data.bounties.filter((b) => b.status === 'proposed').length;
    boardBtn.hidden = false;
    boardBtn.textContent = posted > 0 ? `☠ bounties · ${posted}` : '☠ bounties';
    boardBtn.classList.toggle('attention', isOwner() && proposals > 0);
    boardOverlay.hidden = !boardOpen;
    if (boardOpen) renderBoard();
    // leaving the present (scrubbing back) or a non-owner seat disarms placement
    if (placing && !canPlace()) placing = false;
    placeBtn.hidden = !canPlace();
    placeBtn.classList.toggle('active', placing);
    placeBtn.textContent = placing ? '✕ cancel' : '＋ Pin';
    placebar.hidden = !placing;
    mapHost.classList.toggle('placing', placing);
    // a fresh table gets one nudge toward its first act
    mapHint.hidden = !(isOwner() && store.data.pins.length === 0 && !placing);
    // the scrubber: dragging back reads the map as it stood, plainly signposted
    const present = store.data.campaign.currentSession;
    const past = session < present;
    // ...but it sleeps as a pill (and doesn't exist at all before history
    // spans sessions) — the timeline is there when reached for, not a bar
    // permanently served to every seat
    const hasHistory = present > 1;
    if (!hasHistory) scrubberOpen = false;
    scrubber.hidden = !hasHistory && !isOwner();
    scrubberPill.hidden = !hasHistory;
    scrubber.classList.toggle('collapsed', !scrubberOpen);
    scrubberPill.textContent = scrubberOpen ? 'close' : past ? `⟲ session ${session} of ${present}` : `⟲ session ${present}`;
    pastbar.hidden = !past;
    if (past) pastbarText.textContent = `the map as it stood after session ${session}`;
    mapHost.classList.toggle('past', past);
    app.querySelector('.scrubber')!.classList.toggle('past', past);
    if (ticks.children.length !== present) {
      ticks.replaceChildren(
        ...Array.from({ length: present }, (_, i) => {
          const o = document.createElement('option');
          o.value = String(i + 1);
          return o;
        }),
      );
    }
    // max before value: a range input clamps, so raising the ceiling first
    // lets the thumb follow a remote advance instead of sticking below it
    slider.max = String(present);
    slider.value = String(session);
    sliderLabel.textContent = past ? `Session ${session} of ${present}` : `Session ${session}`;
    advanceBtn.hidden = !isOwner();
    advanceBtn.textContent = `begin session ${store.data.campaign.currentSession + 1}`;
    if (selectedPinId) renderPinSurface(surface, { store, pinId: selectedPinId, session, viewerId });
    else surface.hidden = true;
    syncPoll();
  }

  // Store-driven re-renders (poll, focus refetch) rebuild the DOM wholesale.
  // If one lands mid-click — between mousedown and mouseup — the pressed
  // button is replaced and the click never dispatches, so every button
  // sporadically "needs two clicks". Defer those renders while a pointer is
  // down, and flush a beat after it lifts so the click lands first. The
  // user's own acts still render directly: their handlers run post-gesture.
  let gestureActive = false;
  let renderQueued = false;
  function scheduleRender(): void {
    if (gestureActive) {
      renderQueued = true;
      return;
    }
    render();
  }
  window.addEventListener('pointerdown', () => {
    gestureActive = true;
  }, { capture: true, signal });
  const endGesture = (): void => {
    gestureActive = false;
    if (renderQueued) {
      renderQueued = false;
      // a macrotask later: pointerup → mouseup → click have all dispatched
      setTimeout(scheduleRender, 0);
    }
  };
  window.addEventListener('pointerup', endGesture, { capture: true, signal });
  window.addEventListener('pointercancel', endGesture, { capture: true, signal });

  // the view follows the table's clock only when standing at it: a remote
  // advance carries a present-viewer forward, but never yanks a reader out
  // of the past mid-scrub (their own acts — advancing, writing — are all
  // present-only and set the session explicitly)
  let knownPresent = store.data.campaign.currentSession;
  store.subscribe(() => {
    const present = store.data.campaign.currentSession;
    if (session >= knownPresent) session = present;
    knownPresent = present;
    scheduleRender();
  });

  pastbar.querySelector('.pastbar-now')!.addEventListener('click', () => {
    session = store.data.campaign.currentSession;
    render();
  });

  // --- freshness discipline: the app can never pin itself stale ---
  // refresh is quiet when nothing changed, so refetching is always safe
  const refetch = () => {
    // a flaky connection keeps showing what we have; the next signal retries
    store.refresh().catch(() => {});
  };
  window.addEventListener('focus', refetch, { signal });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refetch();
    syncPoll();
  }, { signal });

  // short poll while a pin surface is open — that's where the table reads
  // each other, and where staleness would show
  let poll: number | undefined;
  function syncPoll(): void {
    const want = selectedPinId !== null && !document.hidden;
    if (want && poll === undefined) poll = window.setInterval(refetch, PIN_POLL_MS);
    if (!want && poll !== undefined) {
      clearInterval(poll);
      poll = undefined;
    }
  }
  teardown = () => {
    ac.abort();
    if (poll !== undefined) clearInterval(poll);
  };

  slider.addEventListener('input', () => {
    session = Number(slider.value);
    render();
  });

  advanceBtn.addEventListener('click', () => {
    // moving the table's clock is one always-visible tap with no rewind: on a
    // phone it's a fat-finger away at all times, so confirm the consequence
    // (advancing alone closes nothing — the previous session's grace window
    // shuts when the first event lands in the new one)
    const current = store.data.campaign.currentSession;
    if (!confirm(`Begin session ${current + 1}? Session ${current}'s open testimony closes once the first event lands in the new one — and the clock doesn't turn back.`)) return;
    store
      .advanceSession()
      .then((s) => {
        session = s;
        render();
      })
      .catch(oops);
  });

  render();

  // the pane can be zero-sized at startup; fit once real dimensions exist,
  // and refit on resize until the user takes over the camera
  let userMoved = false;
  mapHost.addEventListener('pointerdown', () => { userMoved = true; }, { once: true });
  mapHost.addEventListener('wheel', () => { userMoved = true; }, { once: true });
  function tryFit(): void {
    if (mapHost.clientWidth > 0) viewport.fit();
    else requestAnimationFrame(tryFit);
  }
  tryFit();
  window.addEventListener('resize', () => {
    if (!userMoved) viewport.fit();
  }, { signal });
}

void boot();
