// reads.js — what this device has witnessed. Per-device, per-campaign memory of
// which testimony this screen has actually shown its human, kept in localStorage
// beside identity and — like identity — never synced, never exported: what you've
// read is your business, not the table's.
//
// The rule that falls out: a pin glints when it carries READABLE words this
// device hasn't witnessed. Your own words never glint (you were there when they
// were written, whichever seat this device wore at the time). Sealed words never
// glint — sealing is disclosure control, and a tease would be disclosure. When a
// campaign concludes and unseals, everything you couldn't read starts to glow at
// once: the archive introducing itself.
//
// Deliberately NOT here: unread counts, home-screen numbers, notification hooks,
// read receipts (nobody learns what you've read), streaks. The ember is the map
// remembering for you, not the app asking something of you.

import * as S from './state.js';

const key = (cid) => 'hearsay.witnessed.' + cid;

function load(cid) {
  try { return JSON.parse(localStorage.getItem(key(cid))); } catch { return null; }
}
function save(cid, seen) { localStorage.setItem(key(cid), JSON.stringify(seen)); }

// First open under this feature: snapshot every entry currently here as
// witnessed. You can only fall behind on words that arrive after the map starts
// remembering — so a long-lived local campaign doesn't suddenly shimmer, while a
// freshly joined one (baselined empty, words arriving by sync) glints with
// everything this device has truly never shown you.
export function baseline(state) {
  if (load(state.id)) return;
  const seen = {};
  for (const [eid, byPlayer] of Object.entries(state.testimony || {})) {
    for (const [pid, t] of Object.entries(byPlayer)) {
      if (t?.updatedAt) (seen[eid] ||= {})[pid] = t.updatedAt;
    }
  }
  save(state.id, seen);
}

function entryUnread(campaign, seen, identity, eventId, pid) {
  if (pid === identity) return false;                      // your own words
  const t = campaign.testimony?.[eventId]?.[pid];
  if (!t || t.text == null) return false;                  // absent, or sealed placeholder
  if (!S.testimonyReadable(pid, identity, campaign)) return false;
  return (seen?.[eventId]?.[pid] || 0) < (t.updatedAt || 0);
}

// The seats whose words on this event this device hasn't witnessed yet.
export function unreadAuthorsOn(state, event) {
  const seen = load(state.id);
  if (!seen) return new Set();                             // not baselined yet: never glint
  const identity = S.getIdentity(state.id);
  return new Set((event.slots || []).filter(pid => entryUnread(state, seen, identity, event.id, pid)));
}

export function unreadOn(state, event) {
  return unreadAuthorsOn(state, event).size > 0;
}

// Opening a pin witnesses every readable entry on it, at the exact version shown
// (an author's later edit makes their words new again).
export function witnessEvent(state, event) {
  const seen = load(state.id);
  if (!seen) return;
  const identity = S.getIdentity(state.id);
  let changed = false;
  for (const pid of event.slots || []) {
    const t = state.testimony?.[event.id]?.[pid];
    if (!t || t.text == null) continue;
    if (!S.testimonyReadable(pid, identity, state)) continue;
    if (seen[event.id]?.[pid] !== t.updatedAt) {
      (seen[event.id] ||= {})[pid] = t.updatedAt;
      changed = true;
    }
  }
  if (changed) save(state.id, seen);
}

// For the shelf: does this campaign hold any readable words this device hasn't
// witnessed? (Boolean only, on purpose — the card gets an ember, never a number.)
export function campaignHasUnread(campaign) {
  const seen = load(campaign.id);
  if (!seen) return false;
  const identity = S.getIdentity(campaign.id);
  return (campaign.events || []).some(e =>
    !e.hidden && (e.slots || []).some(pid => entryUnread(campaign, seen, identity, e.id, pid)));
}
