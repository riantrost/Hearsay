import './style.css';
import { seed } from './data/seed';
import { Store } from './store';
import { Viewport } from './map/viewport';
import { renderMap } from './map/render';
import { renderPinSurface } from './map/pinSurface';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="map-host"></div>
  <aside class="pin-surface" hidden></aside>
  <header class="identity">
    <label>at the table as</label>
    <select></select>
  </header>
  <footer class="scrubber">
    <span class="scrubber-label"></span>
    <input type="range" min="1" step="1" />
    <button class="advance" hidden>begin session</button>
  </footer>
`;

const mapHost = app.querySelector<HTMLDivElement>('.map-host')!;
const surface = app.querySelector<HTMLElement>('.pin-surface')!;
const slider = app.querySelector<HTMLInputElement>('.scrubber input')!;
const sliderLabel = app.querySelector<HTMLElement>('.scrubber-label')!;
const advanceBtn = app.querySelector<HTMLButtonElement>('.advance')!;
const identitySelect = app.querySelector<HTMLSelectElement>('.identity select')!;

const store = new Store(seed);
// dev convenience: wipe local state back to the seed from the console
(window as unknown as { hearsayReset: () => void }).hearsayReset = () => store.reset(seed);

let session = store.data.campaign.currentSession;
let selectedPinId: string | null = null;

// stand-in for invite-link identity: pick who you are at the table
let viewerId = localStorage.getItem('hearsay-as') ?? store.data.members[0]!.id;
for (const m of store.data.members) {
  const opt = document.createElement('option');
  opt.value = m.id;
  opt.textContent = m.role === 'owner' ? `${m.name} (owner)` : m.name;
  identitySelect.appendChild(opt);
}
identitySelect.value = viewerId;
identitySelect.addEventListener('change', () => {
  viewerId = identitySelect.value;
  localStorage.setItem('hearsay-as', viewerId);
  render();
});

const isOwner = () => store.data.members.find((m) => m.id === viewerId)?.role === 'owner';

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
        // addPin's commit re-renders with the old selection; select the new
        // pin and render again so the surface opens on the right place
        const pin = store.addPin(cx / mapW, cy / mapH, name);
        selectedPinId = pin.id;
        render();
      }
      return;
    }
    selectedPinId = null;
    render();
  },
});
viewport.setContentSize(store.data.campaign.mapW, store.data.campaign.mapH);

function render(): void {
  renderMap(mapHost, store.data, { session, selectedPinId });
  viewport.apply();
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
  session = store.advanceSession();
  slider.value = String(session);
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
