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

async function boot(): Promise<void> {
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
  app.innerHTML = `
    <div class="map-host"></div>
    <aside class="pin-surface" hidden></aside>
    <header class="identity"></header>
    <footer class="scrubber">
      <span class="scrubber-label"></span>
      <input type="range" min="1" step="1" />
      <button class="advance" hidden>begin session</button>
    </footer>
  `;

  const mapHost = app.querySelector<HTMLDivElement>('.map-host')!;
  const surface = app.querySelector<HTMLElement>('.pin-surface')!;
  const identity = app.querySelector<HTMLElement>('.identity')!;
  const slider = app.querySelector<HTMLInputElement>('.scrubber input')!;
  const sliderLabel = app.querySelector<HTMLElement>('.scrubber-label')!;
  const advanceBtn = app.querySelector<HTMLButtonElement>('.advance')!;

  let session = store.data.campaign.currentSession;
  let selectedPinId: string | null = null;
  const viewerId = store.seat.memberId;
  const isOwner = () => store.me?.role === 'owner';
  const oops = (e: unknown) => alert(e instanceof Error ? e.message : String(e));

  const viewport = new Viewport(mapHost, {
    onTap(target, cx, cy) {
      const pinEl = target.closest<SVGGElement>('.pin');
      if (pinEl) {
        selectedPinId = pinEl.dataset.pinId ?? null;
        render();
        return;
      }
      // owner taps open ground at the current session: a place gets a name
      const { mapW, mapH, currentSession } = store.data.campaign;
      if (isOwner() && session === currentSession && cx >= 0 && cy >= 0 && cx <= mapW && cy <= mapH) {
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
        return;
      }
      selectedPinId = null;
      render();
    },
  });
  viewport.setContentSize(store.data.campaign.mapW, store.data.campaign.mapH);

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
    renderMap(mapHost, store.data, { session, selectedPinId });
    viewport.apply();
    renderIdentity();
    slider.max = String(store.data.campaign.currentSession);
    sliderLabel.textContent = `Session ${session}`;
    advanceBtn.hidden = !isOwner();
    advanceBtn.textContent = `begin session ${store.data.campaign.currentSession + 1}`;
    if (selectedPinId) renderPinSurface(surface, { store, pinId: selectedPinId, session, viewerId });
    else surface.hidden = true;
  }

  store.subscribe(() => {
    // a write at the table snaps the view back to the present
    session = Math.max(session, store.data.campaign.currentSession);
    slider.value = String(session);
    render();
  });

  slider.addEventListener('input', () => {
    session = Number(slider.value);
    render();
  });

  advanceBtn.addEventListener('click', () => {
    store
      .advanceSession()
      .then((s) => {
        session = s;
        slider.value = String(s);
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
  });
}

void boot();
