import './style.css';
import { seed } from './data/seed';
import { Viewport } from './map/viewport';
import { renderMap } from './map/render';
import { renderPinSurface } from './map/pinSurface';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="map-host"></div>
  <aside class="pin-surface" hidden></aside>
  <footer class="scrubber">
    <span class="scrubber-label"></span>
    <input type="range" min="1" step="1" />
  </footer>
`;

const mapHost = app.querySelector<HTMLDivElement>('.map-host')!;
const surface = app.querySelector<HTMLElement>('.pin-surface')!;
const slider = app.querySelector<HTMLInputElement>('.scrubber input')!;
const sliderLabel = app.querySelector<HTMLElement>('.scrubber-label')!;

const data = seed;
let session = data.campaign.currentSession;
let selectedPinId: string | null = null;

slider.max = String(data.campaign.currentSession);
slider.value = String(session);

const viewport = new Viewport(mapHost, {
  onTap(target) {
    const pinEl = target.closest<SVGGElement>('.pin');
    selectedPinId = pinEl?.dataset.pinId ?? null;
    render();
  },
});
viewport.setContentSize(data.campaign.mapW, data.campaign.mapH);

function render(): void {
  renderMap(mapHost, data, { session, selectedPinId });
  viewport.apply();
  sliderLabel.textContent = `Session ${session}`;
  if (selectedPinId) renderPinSurface(surface, data, selectedPinId, session);
  else surface.hidden = true;
}

slider.addEventListener('input', () => {
  session = Number(slider.value);
  // scrubbing back past a selected pin's first event closes its surface
  render();
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
