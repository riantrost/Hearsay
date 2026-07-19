// Boot: a stored seat opens the table; no seat (or a dead one — declined,
// wiped) lands on the front door. The table view is the map, the scrubber,
// the pin surface, and the identity header where the owner resolves
// membership proposals and rotates the join code.

import './style.css';
import { fetchAuthConfig, postGoogleLink, postGoogleRecover } from './api';
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
    // the seat no longer answers (declined, or the table is gone): drop this
    // chair and let the front door offer whatever tables remain
    removeSeat(seat.campaignId);
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

  let session = store.data.campaign.currentSession;
  let selectedPinId: string | null = null;
  // the scrubber sleeps as a pill until someone deliberately opens the past
  let scrubberOpen = false;
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
        <li>Once history spans sessions, the <b>session pill</b> (bottom) scrubs the map back through time.</li>
      </ul>`
    : `<ul>
        <li><b>Tap a pin</b> to read a place's history — the owner's canon first, then every seat's testimony.</li>
        <li><b>Testify</b> in your own words: what happened here, as you remember it. Your account is yours alone; contradiction is welcome.</li>
        <li>You can <b>amend</b> your entry until the next session begins — then it closes for good.</li>
        <li><b>Scrawl a mark</b>: one short line from your testimony left as graffiti on the place, unattributed at a glance.</li>
        <li>Hollow pips on a pin are <b>voices still missing</b> from its latest events.</li>
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

  function renderIdentity(): void {
    const me = store.me;
    const frag = document.createDocumentFragment();

    const seatLine = document.createElement('div');
    seatLine.className = 'seat-line';
    const roleTag = me?.role === 'owner' ? ' (owner)' : me?.status === 'pending' ? ' (pending)' : '';
    seatLine.textContent = `at the table as ${me?.name ?? '?'}${roleTag}`;
    // one browser can hold many chairs: the front door is reachable without
    // giving this one up
    const tables = document.createElement('button');
    tables.className = 'tables';
    tables.textContent = 'tables';
    tables.title = 'switch tables or found/join another';
    tables.addEventListener('click', () => showFrontDoor());
    const leave = document.createElement('button');
    leave.className = 'leave';
    leave.textContent = 'leave';
    leave.addEventListener('click', () => {
      if (confirm('Forget this table on this device? Rejoin needs the code or a reclaim link from the owner.')) {
        removeSeat(store.seat.campaignId);
        void boot();
      }
    });
    // self-serve device handoff: any member can mint their own seat link (the
    // owner also has one in the roster below, so keep the line uncluttered)
    if (!isOwner() && me) {
      const selfLink = document.createElement('button');
      selfLink.className = 'reclaim';
      selfLink.textContent = 'seat link';
      selfLink.title = 'open your seat on another device';
      selfLink.addEventListener('click', () => void reclaimFor(me.id, me.name));
      seatLine.appendChild(selfLink);
    }
    seatLine.append(tables, leave);
    frag.appendChild(seatLine);

    // the recovery thread: one tap ties this seat to a Google account, so a
    // lost phone or a new device can find it with nothing else in hand
    if (googleOn) {
      const backup = document.createElement('div');
      backup.className = 'backup-row';
      const linked = loadSeats().find((s) => s.campaignId === store.seat.campaignId)?.google;
      if (linked) {
        backup.textContent = `seat backed up to ${linked}`;
      } else {
        backup.textContent = 'lose your phone, lose your seat — ';
        const link = document.createElement('button');
        link.className = 'backup';
        link.textContent = 'back up with Google';
        link.addEventListener('click', () => startGoogleFlow('link'));
        backup.appendChild(link);
      }
      frag.appendChild(backup);
    }

    if (me?.status === 'pending') {
      const hint = document.createElement('div');
      hint.className = 'pending-hint';
      hint.textContent = 'your words are visible only to you and the owner until you are approved';
      frag.appendChild(hint);
    }

    if (isOwner()) {
      const codeRow = document.createElement('div');
      codeRow.className = 'code-row';
      codeRow.textContent = `join code: ${store.data.campaign.joinCode} `;
      const rotate = document.createElement('button');
      rotate.textContent = 'rotate';
      rotate.title = 'mint a fresh code; the old one stops working';
      rotate.addEventListener('click', () => store.rotateCode().catch(oops));
      codeRow.appendChild(rotate);
      frag.appendChild(codeRow);

      for (const m of store.data.members.filter((x) => x.status === 'pending')) {
        const row = document.createElement('div');
        row.className = 'pending-row';
        row.textContent = `${m.name} asks to join `;
        const approve = document.createElement('button');
        approve.textContent = 'approve';
        approve.addEventListener('click', () => store.approveMember(m.id).catch(oops));
        const decline = document.createElement('button');
        decline.className = 'decline';
        decline.textContent = 'decline';
        decline.addEventListener('click', () => {
          if (confirm(`Decline ${m.name}? Their seat and their words are removed.`)) {
            store.declineMember(m.id).catch(oops);
          }
        });
        row.append(approve, decline);
        frag.appendChild(row);
      }

      // the roster: seated members, each re-seatable on a new device. A lost
      // phone (or Safari evicting the seat) needn't orphan anyone's testimony —
      // the owner hands back the same chair, no new membership, no re-approval.
      for (const m of store.data.members.filter((x) => x.status === 'active')) {
        const row = document.createElement('div');
        row.className = 'member-row';
        row.textContent = `${m.name}${m.role === 'owner' ? ' (owner)' : ''}${m.id === viewerId ? ' — you' : ''} `;
        const reclaim = document.createElement('button');
        reclaim.className = 'reclaim';
        reclaim.textContent = 'seat link';
        reclaim.title = m.id === viewerId ? 'open your seat on another device' : `re-seat ${m.name} on a new device`;
        reclaim.addEventListener('click', () => void reclaimFor(m.id, m.name));
        row.appendChild(reclaim);
        frag.appendChild(row);
      }
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
