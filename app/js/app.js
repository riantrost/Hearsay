// app.js — bootstrap and the (deliberately tiny) router. Two screens: the shelf
// and one open campaign. Deep-linked via the hash so a refresh keeps your place.
// When cloud sync is configured, opening a cloud campaign pulls the latest and
// subscribes to live changes; local campaigns behave exactly as before.

import * as S from './state.js';
import * as Sync from './sync.js';
import { toast } from './ui.js';
import { renderHome } from './home.js';
import { renderCampaign, teardownCampaign, refreshCampaignView } from './campaign.js';

let cloudUnsub = null;
function stopCloud() { if (cloudUnsub) { cloudUnsub(); cloudUnsub = null; } }

// Push failures surface here instead of coupling state.js to the UI.
S.onSyncError((e) => toast('Sync hiccup: ' + (e && e.message ? e.message : e)));

async function route() {
  const hash = location.hash.replace(/^#/, '');
  if (hash.startsWith('c/')) {
    const id = hash.slice(2);
    stopCloud();
    let state = await S.loadCampaign(id);
    if (!state) { location.hash = ''; return; }

    // Cloud campaign: pull the latest before first paint, then go live.
    if (state.cloud && Sync.cloudConfigured()) {
      try {
        await Sync.init();
        const fresh = await Sync.fetchCampaign(state.cloud.remoteId);
        S.applyRemote(fresh);
        state = S.getState();
      } catch { /* offline → render from the cached copy */ }
    }

    await renderCampaign(state, { onHome: () => { stopCloud(); teardownCampaign(); location.hash = ''; } });

    if (state.cloud && Sync.cloudConfigured()) {
      cloudUnsub = Sync.subscribe(state.cloud.remoteId, () => refreshCampaignView());
    }
  } else {
    stopCloud();
    teardownCampaign();
    S.closeCampaign();
    await renderHome({ onOpen: (id) => { location.hash = 'c/' + id; } });
  }
}

window.addEventListener('hashchange', route);
route();

// Warm up anonymous auth in the background so publish/join feel instant.
if (Sync.cloudConfigured()) Sync.init().catch(() => {});

// PWA: register the service worker so the app installs and runs offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* fine in dev without a server */ });
  });
}
