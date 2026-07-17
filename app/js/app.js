// app.js — bootstrap and the (deliberately tiny) router. Two screens: the shelf
// and one open campaign. Deep-linked via the hash so a refresh keeps your place.

import * as S from './state.js';
import * as Y from './sync.js';
import { renderHome } from './home.js';
import { renderCampaign, teardownCampaign } from './campaign.js';

// Local mutations on a connected campaign additionally reach the table server.
S.setMutationHook(Y.onMutation);

// Coming back to the tab is one of the moments the table "meets": pull quietly,
// and only rebuild the screen if something actually changed.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const st = S.getState();
  if (st && Y.isConnected(st)) {
    Y.syncNow(st, { quiet: true, minInterval: 20000 }).then(changed => { if (changed) route(); });
  }
});

async function route() {
  const hash = location.hash.replace(/^#/, '');
  if (hash.startsWith('c/')) {
    const id = hash.slice(2);
    const state = await S.loadCampaign(id);
    if (!state) { location.hash = ''; return; }
    await renderCampaign(state, { onHome: () => { teardownCampaign(); location.hash = ''; } });
  } else {
    teardownCampaign();
    S.closeCampaign();
    await renderHome({ onOpen: (id) => { location.hash = 'c/' + id; } });
  }
}

window.addEventListener('hashchange', route);
route();

// PWA: register the service worker so the app installs and runs offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* fine in dev without a server */ });
  });
}
