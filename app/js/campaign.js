// campaign.js — the campaign screen: the map is the browse surface. Builds the
// viewport, paints pins with a visual grammar (type = colour, ring = testimony
// completeness), draws the optional reference grid, and drives the session scrubber
// that replays the map's growth. Panels (pin detail, warband, settings) live in panels.js.

import * as S from './state.js';
import * as Sync from './sync.js';
import { el, clear, mount, toast, openSheet } from './ui.js';
import { Viewport } from './viewport.js';
import { pickImage } from './util.js';
import * as P from './panels.js';

let vp = null;
let viewSession = null;      // the scrubber position; null == "now"
let objectURL = null;        // revoked on teardown
let refs = {};
let pendingTransform = null; // preserve pan/zoom across a remote-driven re-render
let lastCtx = null;

export async function renderCampaign(state, ctx) {
  lastCtx = ctx;
  viewSession = state.currentSession;
  const onHome = ctx.onHome;

  const frame = el('div', { class: 'mapframe', id: 'mapframe' });
  const world = el('div', { class: 'world', id: 'world' });
  const img = el('img', { class: 'world__img', alt: state.name + ' map', draggable: 'false' });
  const gridCanvas = el('canvas', { class: 'world__grid' });
  const pinLayer = el('div', { class: 'world__pins' });
  world.append(img, gridCanvas, pinLayer);
  frame.appendChild(world);

  const banner = el('div', { class: 'scrub-banner', id: 'scrubBanner' });

  const screen = el('div', { class: 'campaign' }, [
    topBar(state, ctx),
    frame,
    banner,
    scrubber(state),
    emptyHint(state),
  ]);
  mount(screen);

  refs = { frame, world, img, gridCanvas, pinLayer, banner };

  // Seat gate: identity-first. No seat chosen on this device → pick one.
  if (!S.getIdentity(state.id)) {
    P.openSeatPicker(state, () => renderCampaign(S.getState(), ctx));
  }

  vp = new Viewport(frame, world, {
    onTap: (x, y) => {
      if (state.map && S.getIdentity(state.id) === 'owner' && !state.concluded) {
        P.openEventEditor(state, { x, y }, () => paint(state));
      }
    },
  });

  await loadMap(state);
  paint(state);
  updateBanner(state);
}

async function loadMap(state) {
  const { world, img, gridCanvas, frame } = refs;
  if (objectURL) { URL.revokeObjectURL(objectURL); objectURL = null; }
  if (!state.map) {
    world.classList.add('world--nomap');
    img.removeAttribute('src');
    vp.setWorldSize(frame.clientWidth || 800, frame.clientHeight || 600);
    applyView();
    renderMapDrop(state);
    return;
  }
  const existingDrop = frame.querySelector('.mapdrop');
  if (existingDrop) existingDrop.remove();
  world.classList.remove('world--nomap');
  const blob = await S.getMapBlob();
  objectURL = URL.createObjectURL(blob);
  img.src = objectURL;
  vp.setWorldSize(state.map.w, state.map.h);
  gridCanvas.width = state.map.w;
  gridCanvas.height = state.map.h;
  drawGrid(state);
  await new Promise(r => { if (img.complete) r(); else img.onload = r; });
  applyView();
}

// Fit to the frame, unless a remote-driven re-render asked us to keep the current view.
function applyView() {
  if (pendingTransform) {
    vp.scale = pendingTransform.scale; vp.tx = pendingTransform.tx; vp.ty = pendingTransform.ty;
    vp._apply();
    pendingTransform = null;
  } else {
    vp.fit();
  }
}

// Called when a realtime change arrives: re-read the cloud, keep the viewport, repaint.
export async function refreshCampaignView() {
  const st = S.getState();
  if (!st || !st.cloud || !lastCtx) return;
  try {
    const fresh = await Sync.fetchCampaign(st.cloud.remoteId);
    pendingTransform = vp ? { scale: vp.scale, tx: vp.tx, ty: vp.ty } : null;
    S.applyRemote(fresh);
    await renderCampaign(S.getState(), lastCtx);
  } catch (e) { /* transient; the next event will retry */ }
}

function renderMapDrop(state) {
  const isOwner = S.getIdentity(state.id) === 'owner';
  if (refs.frame.querySelector('.mapdrop')) return;
  const drop = el('div', { class: 'mapdrop' }, [
    el('div', { class: 'mapdrop__inner' }, [
      el('div', { class: 'mapdrop__glyph', text: '🗺' }),
      el('p', { text: isOwner ? 'This campaign has no world map yet.' : 'The owner hasn’t set a world map yet.' }),
      isOwner ? el('button', { class: 'btn btn--primary', text: 'Upload world map', onclick: async () => {
        const picked = await pickImage();
        if (!picked) return;
        await S.setMapImage(picked.blob, picked.w, picked.h);
        drop.remove();
        await loadMap(state); paint(state);
      } }) : null,
      isOwner ? el('p', { class: 'muted mini', text: 'Uploaded art, scanned source, or a photo of a napkin — all first-class.' }) : null,
    ]),
  ]);
  refs.frame.appendChild(drop);
}

// ---- pins ------------------------------------------------------------------

function paint(state) {
  const { pinLayer } = refs;
  clear(pinLayer);
  const isOwner = S.getIdentity(state.id) === 'owner';
  const vs = viewSession ?? state.currentSession;

  for (const e of state.events) {
    if (!S.eventVisibleAt(e, vs, isOwner)) continue;
    const total = e.slots.length || 1;
    const filled = e.slots.filter(pid => S.getTestimony(e.id, pid)).length;
    const frac = filled / total;

    const pin = el('button', {
      class: 'pin pin--' + e.type
        + (e.hidden ? ' pin--staged' : '')
        + (e.session === vs ? ' pin--fresh' : ''),
      style: { left: (e.x * 100) + '%', top: (e.y * 100) + '%', '--frac': frac },
      title: e.name,
      onclick: (ev) => { ev.stopPropagation(); P.openPinDetail(state, e, () => paint(state)); },
    }, [
      el('span', { class: 'pin__ring' }),
      el('span', { class: 'pin__core' }),
      el('span', { class: 'pin__badge', text: filled + '/' + total }),
    ]);
    pinLayer.appendChild(pin);
  }
}

// ---- grid overlay (reference only) ----------------------------------------

function drawGrid(state) {
  const c = refs.gridCanvas;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  const g = state.grid;
  if (!g || g.mode === 'freeform') return;
  const cellsAcross = Math.max(2, g.size);
  const step = c.width / cellsAcross;
  ctx.strokeStyle = 'rgba(230,224,208,0.28)';
  ctx.lineWidth = Math.max(1, c.width / 1400);

  if (g.mode === 'square') {
    for (let x = 0; x <= c.width; x += step) line(ctx, x, 0, x, c.height);
    for (let y = 0; y <= c.height; y += step) line(ctx, 0, y, c.width, y);
  } else if (g.mode === 'hex') {
    const r = step / 2;             // hex "radius" ~ half a cell
    const h = Math.sqrt(3) * r;
    for (let col = -1, x = 0; x < c.width + r; col++, x = col * 1.5 * r) {
      const yOff = (col % 2) ? h / 2 : 0;
      for (let y = -h; y < c.height + h; y += h) hexagon(ctx, x, y + yOff, r);
    }
  }
}
function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function hexagon(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i);
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.stroke();
}

// ---- top bar ---------------------------------------------------------------

function topBar(state, ctx) {
  const isOwner = S.getIdentity(state.id) === 'owner';
  const seatId = S.getIdentity(state.id);
  const seat = seatId === 'owner' ? 'Owner' : (S.playerById(seatId)?.name || 'Pick seat');

  return el('header', { class: 'topbar' }, [
    el('button', { class: 'iconbtn', title: 'Campaigns', html: '&#8592;', onclick: ctx.onHome }),
    el('div', { class: 'topbar__title' }, [
      el('strong', { text: state.name }),
      state.concluded ? el('span', { class: 'tag tag--archived', text: 'Archived' }) : null,
    ]),
    el('div', { class: 'topbar__spacer' }),
    isOwner && !state.concluded ? el('button', { class: 'btn btn--sm', title: 'Advance the clock',
      text: 'Session ' + state.currentSession + '  +', onclick: () => { S.advanceSession(); viewSession = state.currentSession; rerender(state, ctx); } })
      : el('span', { class: 'pill', text: 'Session ' + state.currentSession }),
    el('button', { class: 'pill pill--seat', title: 'Change seat', text: seat, onclick: () => P.openSeatPicker(state, () => rerender(state, ctx)) }),
    menuButton(state, ctx),
  ]);
}

function menuButton(state, ctx) {
  const items = [
    ['Warbands', () => openWarbandList(state)],
    ['Settings', () => P.openSettings(state, () => rerender(state, ctx))],
  ];
  if (state.cloud) items.push(['Share join code', () => shareCode(state)]);
  else if (Sync.cloudConfigured()) items.push(['Publish to cloud', () => publishFlow()]);
  items.push(['Export campaign', () => exportNow(state)]);
  const menu = el('div', { class: 'menu' }, items.map(([label, fn]) =>
    el('button', { class: 'menu__item', text: label, onclick: () => { menu.classList.remove('menu--open'); fn(); } })));
  const wrap = el('div', { class: 'menuwrap' }, [
    el('button', { class: 'iconbtn', title: 'Menu', html: '&#8942;', onclick: (e) => { e.stopPropagation(); menu.classList.toggle('menu--open'); } }),
    menu,
  ]);
  document.addEventListener('click', () => menu.classList.remove('menu--open'));
  return wrap;
}

async function publishFlow() {
  try {
    toast('Publishing to the cloud…');
    const res = await S.publishCurrent();
    if (!res) return;
    location.hash = 'c/' + res.localId;   // localId is now the remote id; route re-opens + subscribes
    shareCode(S.getState());
  } catch (e) { toast('Publish failed: ' + (e.message || e)); }
}

function shareCode(state) {
  const code = (state.cloud && state.cloud.joinCode) || S.joinCode() || '—';
  const body = el('div', {}, [
    el('p', { class: 'muted', style: { marginTop: 0 },
      text: 'Anyone at the table taps “Join a campaign” on the home screen and enters this code to get the campaign live on their device.' }),
    el('div', { class: 'joincode', text: code }),
    el('div', { class: 'row row--end' }, [
      el('button', { class: 'btn btn--primary', text: 'Copy code', onclick: () => {
        (navigator.clipboard?.writeText(code) || Promise.resolve()).then(() => toast('Code copied'));
      } }),
    ]),
  ]);
  openSheet('Join code', body);
}

function openWarbandList(state) {
  const vs = viewSession ?? state.currentSession;
  const body = el('div', {}, state.players.length ? state.players.map(p =>
    el('button', { class: 'seat', onclick: () => P.openWarband(state, p.id, vs, () => paint(state)) }, [
      el('span', { class: 'seat__dot', style: { background: p.color } }),
      el('span', {}, [el('strong', { text: p.name }), el('span', { class: 'muted', text: ' · warband' })]),
    ])) : [el('p', { class: 'muted', text: 'No players yet — add them in Settings.' })]);
  import('./ui.js').then(({ openSheet }) => openSheet('Warbands', body));
}

// ---- scrubber (sessions are the clock) ------------------------------------

function scrubber(state) {
  const max = S.maxSession();
  const input = el('input', { class: 'scrub', type: 'range', min: '1', max: String(max), step: '1',
    value: String(viewSession ?? state.currentSession) });
  input.addEventListener('input', () => {
    viewSession = parseInt(input.value, 10);
    paint(state);
    updateBanner(state);
  });
  refs.scrubInput = input;
  return el('div', { class: 'scrubwrap' }, [
    el('span', { class: 'scrub__end', text: 'S1' }),
    input,
    el('button', { class: 'scrub__now', text: 'Now', onclick: () => {
      viewSession = state.currentSession; input.value = String(state.currentSession);
      paint(state); updateBanner(state);
    } }),
  ]);
}

function updateBanner(state) {
  const vs = viewSession ?? state.currentSession;
  const past = vs < state.currentSession;
  refs.banner.classList.toggle('scrub-banner--show', past);
  refs.banner.textContent = past ? `Viewing the map as of Session ${vs}` : '';
}

function emptyHint(state) {
  const isOwner = S.getIdentity(state.id) === 'owner';
  if (state.events.length) return null;
  return el('div', { class: 'hint' , text: isOwner
    ? (state.map ? 'Tap the map to drop your first event pin.' : 'Add a world map in Settings, then tap to drop pins.')
    : 'No events yet — the owner drops pins where things happened.' });
}

// ---- helpers ---------------------------------------------------------------

async function exportNow(state) {
  const bundle = await S.exportCampaign();
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: (state.name.replace(/\s+/g, '-').toLowerCase() || 'campaign') + '.hearsay.json' });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Campaign exported — hand the file to another device.');
}

// Rebuild the whole screen (used after mutations that change chrome/pins).
async function rerender(state, ctx) { await renderCampaign(state, ctx); }
function rerenderChrome(state, ctx) { renderCampaign(state, ctx); }

export function teardownCampaign() {
  if (objectURL) { URL.revokeObjectURL(objectURL); objectURL = null; }
  vp = null; refs = {};
}
