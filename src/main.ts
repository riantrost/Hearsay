// Boot: a stored seat opens the table; no seat (or a dead one — declined,
// wiped) lands on the front door. The table view is the map, the scrubber,
// the pin surface, and the identity header where the owner resolves
// membership proposals and rotates the join code.

import './style.css';
import { ApiStore } from './apiStore';
import { renderLanding } from './landing';
import { renderMap } from './map/render';
import { renderPinSurface } from './map/pinSurface';
import { Viewport } from './map/viewport';
import { clearSeat, loadSeat, saveSeat, type Seat } from './seat';

const app = document.querySelector<HTMLDivElement>('#app')!;

/** How often an open pin surface asks the server what it missed. */
const PIN_POLL_MS = 5000;

/** Undoes the previous table's listeners/timers when the app re-boots. */
let teardown: (() => void) | undefined;

async function boot(): Promise<void> {
  teardown?.();
  teardown = undefined;
  const seat = loadSeat();
  if (!seat) {
    renderLanding(app, onSeated);
    return;
  }
  let store: ApiStore;
  try {
    store = await ApiStore.boot(seat);
  } catch (e) {
    // the seat no longer answers (declined, or the table is gone)
    clearSeat();
    renderLanding(app, onSeated, e instanceof Error ? e.message : String(e));
    return;
  }
  renderTable(store);
}

function onSeated(seat: Seat): void {
  saveSeat(seat);
  void boot();
}

function renderTable(store: ApiStore): void {
  const ac = new AbortController();
  const signal = ac.signal;
  app.innerHTML = `
    <div class="map-host"></div>
    <aside class="pin-surface" hidden></aside>
    <header class="identity"></header>
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
    <footer class="scrubber">
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
  const slider = app.querySelector<HTMLInputElement>('.scrubber input')!;
  const sliderLabel = app.querySelector<HTMLElement>('.scrubber-label')!;
  const advanceBtn = app.querySelector<HTMLButtonElement>('.advance')!;

  let session = store.data.campaign.currentSession;
  let selectedPinId: string | null = null;
  // dropping a pin is a deliberate act, never a byproduct of touching the map:
  // the owner arms placement, and the *next* map tap places, then disarms
  let placing = false;
  const viewerId = store.seat.memberId;
  const isOwner = () => store.me?.role === 'owner';
  const canPlace = () => isOwner() && session === store.data.campaign.currentSession;
  const oops = (e: unknown) => alert(e instanceof Error ? e.message : String(e));

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

  function renderIdentity(): void {
    const me = store.me;
    const frag = document.createDocumentFragment();

    const seatLine = document.createElement('div');
    seatLine.className = 'seat-line';
    const roleTag = me?.role === 'owner' ? ' (owner)' : me?.status === 'pending' ? ' (pending)' : '';
    seatLine.textContent = `at the table as ${me?.name ?? '?'}${roleTag}`;
    const leave = document.createElement('button');
    leave.className = 'leave';
    leave.textContent = 'leave';
    leave.addEventListener('click', () => {
      if (confirm('Leave this table? Your seat token is only recoverable by re-invite.')) {
        clearSeat();
        void boot();
      }
    });
    seatLine.appendChild(leave);
    frag.appendChild(seatLine);

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
    }
    identity.replaceChildren(frag);
  }

  function render(): void {
    renderMap(mapHost, store.data, {
      session,
      selectedPinId,
      // the owner sees unwritten sites at the present, so a named place
      // can always receive its first event
      withGhosts: isOwner() && session === store.data.campaign.currentSession,
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
    // the scrubber: dragging back reads the map as it stood, plainly signposted
    const present = store.data.campaign.currentSession;
    const past = session < present;
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

  // the view follows the table's clock only when standing at it: a remote
  // advance carries a present-viewer forward, but never yanks a reader out
  // of the past mid-scrub (their own acts — advancing, writing — are all
  // present-only and set the session explicitly)
  let knownPresent = store.data.campaign.currentSession;
  store.subscribe(() => {
    const present = store.data.campaign.currentSession;
    if (session >= knownPresent) session = present;
    knownPresent = present;
    render();
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
