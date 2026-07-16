// home.js — the shelf. Lists campaigns on this device as map-thumbnail cards
// (identity-is-the-shape), plus create-new and import-a-file. No accounts, no
// discovery — a campaign is as private as the table.

import * as S from './state.js';
import * as Sync from './sync.js';
import { el, mount, openSheet, closeSheet, toast } from './ui.js';

export async function renderHome({ onOpen }) {
  const campaigns = await S.listCampaigns();

  const cards = await Promise.all(campaigns.map(c => campaignCard(c, onOpen)));

  const screen = el('div', { class: 'home' }, [
    el('header', { class: 'home__head' }, [
      el('div', { class: 'brand' }, [
        el('span', { class: 'brand__mark', text: 'H' }),
        el('div', {}, [
          el('h1', { text: 'Hearsay' }),
          el('p', { class: 'muted', text: 'Plural memory, pinned to the place it happened.' }),
        ]),
      ]),
    ]),
    el('div', { class: 'shelf' }, [
      el('button', { class: 'card card--new', onclick: () => openCreate(onOpen) }, [
        el('span', { class: 'card--new__plus', text: '+' }),
        el('span', { text: 'New campaign' }),
      ]),
      ...cards,
    ]),
    el('div', { class: 'home__foot' }, [
      Sync.cloudConfigured()
        ? el('button', { class: 'btn', text: 'Join a campaign…', onclick: () => joinFlow(onOpen) }) : null,
      el('button', { class: 'btn btn--ghost', text: 'Import a campaign file…', onclick: () => importFlow(onOpen) }),
    ]),
  ]);
  mount(screen);
}

function joinFlow(onOpen) {
  const codeI = el('input', { class: 'input', placeholder: 'Join code (e.g. QK7M4P)', style: { textTransform: 'uppercase' } });
  const status = el('p', { class: 'muted mini' });
  const body = el('div', {}, [
    el('p', { class: 'muted', style: { marginTop: 0 }, text: 'Ask the owner for the code shown under “Share join code”. The campaign appears live on this device.' }),
    codeI, status,
    el('div', { class: 'row row--end' }, [
      el('button', { class: 'btn btn--primary', text: 'Join', onclick: async () => {
        const code = codeI.value.trim();
        if (!code) { codeI.focus(); return; }
        status.textContent = 'Joining…';
        try {
          await Sync.init();
          const remoteId = await Sync.joinByCode(code);
          const fresh = await Sync.fetchCampaign(remoteId);
          await S.adoptRemote(fresh);
          closeSheet(); onOpen(remoteId);
        } catch (e) { status.textContent = 'Could not join: ' + (e.message || e); }
      } }),
    ]),
  ]);
  openSheet('Join a campaign', body);
  setTimeout(() => codeI.focus(), 50);
}

async function campaignCard(c, onOpen) {
  const card = el('button', { class: 'card', onclick: () => onOpen(c.id) });
  const thumb = el('div', { class: 'card__thumb' });
  if (c.map) {
    const blob = await S.getImageForCard(c);
    if (blob) {
      const url = URL.createObjectURL(blob);
      thumb.style.backgroundImage = `url(${url})`;
      thumb.classList.add('card__thumb--img');
    }
  }
  // dot the pins onto the thumbnail — the map's shape is the campaign's identity
  for (const e of (c.events || [])) {
    if (e.hidden) continue;
    thumb.appendChild(el('span', { class: 'card__pin pin--' + e.type,
      style: { left: (e.x * 100) + '%', top: (e.y * 100) + '%' } }));
  }
  card.append(
    thumb,
    el('div', { class: 'card__meta' }, [
      el('strong', { text: c.name }),
      el('span', { class: 'muted', text:
        `${c.events?.length || 0} pin${(c.events?.length || 0) === 1 ? '' : 's'} · Session ${c.currentSession}`
        + (c.cloud ? ' · shared' : '') + (c.concluded ? ' · archived' : '') }),
    ]),
  );
  return card;
}

function openCreate(onOpen) {
  const nameI = el('input', { class: 'input', placeholder: 'Campaign name (e.g. Frostgrave: The Frozen City)' });
  const players = [];
  const list = el('div', { class: 'chips' });
  const addI = el('input', { class: 'input', placeholder: 'Add a player and press Enter' });
  function addPlayer() {
    const n = addI.value.trim();
    if (!n) return;
    players.push(n); addI.value = '';
    list.appendChild(el('span', { class: 'chip chip--on', text: n }));
  }
  addI.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPlayer(); } });

  const body = el('div', {}, [
    el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Campaign' }), nameI]),
    el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Players (the table)' }),
      el('div', {}, [list, el('div', { class: 'row' }, [addI, el('button', { class: 'btn', text: 'Add', onclick: addPlayer })])])]),
    el('p', { class: 'muted mini', text: 'You hold the owner (canon) seat by default. Add a world map next.' }),
    el('div', { class: 'row row--end' }, [
      el('button', { class: 'btn btn--primary', text: 'Create', onclick: async () => {
        if (!nameI.value.trim()) { nameI.focus(); return; }
        const c = await S.createCampaign({ name: nameI.value, playerNames: players });
        closeSheet(); onOpen(c.id);
      } }),
    ]),
  ]);
  openSheet('Start a campaign', body);
  setTimeout(() => nameI.focus(), 50);
}

function importFlow(onOpen) {
  const input = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const bundle = JSON.parse(await file.text());
      const c = await S.importCampaign(bundle);
      toast('Campaign imported.');
      onOpen(c.id);
    } catch (err) {
      toast('Could not import: ' + err.message);
    }
  });
  document.body.appendChild(input);
  input.click();
  setTimeout(() => input.remove(), 60000);
}
