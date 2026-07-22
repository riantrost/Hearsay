// Live e2e smoke against a running `npm run api` (wrangler pages dev on
// :8788, local D1 simulation). The whole loop: found → join → pending strip
// on the wire → approve → pin → event → testimony → amend → mark → bounty
// swear/nail/strike → stage/reveal → rotate → advance → reclaim → decline
// cascade. This is the proof the API contract survived the KV→D1 migration:
// every check below describes the wire as the KV era served it.
//
// Usage: node scripts/smoke-api.mjs [base-url]   (default http://127.0.0.1:8788)

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
let passed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) {
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
    process.exit(1);
  }
  passed++;
  console.log(`✓ ${name}`);
};

// a real 1×1 PNG so multipart founding exercises the map upload path
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const api = async (path, { token, method = 'GET', body, form } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method: payload ? 'POST' : method, headers, body: payload });
  return res;
};
const json = async (res) => res.json();

// --- found a campaign -------------------------------------------------------
const form = new FormData();
form.set('name', 'Smoke Table (D1)');
form.set('ownerName', 'Maren');
form.set('map', new File([PNG], 'map.png', { type: 'image/png' }), 'map.png');
form.set('mapW', '1600');
form.set('mapH', '1200');
const createdRes = await api('/api/campaigns', { form });
check('create campaign → 201', createdRes.status === 201, `${createdRes.status} ${await createdRes.clone().text()}`);
const created = await json(createdRes);
const cid = created.campaign.id;
const owner = { token: created.token, id: created.member.id };
check('campaign shape', created.campaign.mapImageUrl === `/api/maps/${cid}` && created.campaign.currentSession === 1);
check('owner seat active', created.member.role === 'owner' && created.member.status === 'active');

// --- tokenless GET refused --------------------------------------------------
check('tokenless GET → 401', (await api(`/api/campaigns/${cid}`)).status === 401);

// --- map served from R2 -----------------------------------------------------
const mapRes = await api(`/api/maps/${cid}`);
check('map GET → 200 png', mapRes.status === 200);

// --- join by code → pending seat -------------------------------------------
const joinRes = await api('/api/join', { body: { code: created.campaign.joinCode, name: 'Corvyn' } });
check('join → 201', joinRes.status === 201);
const joined = await json(joinRes);
const player = { token: joined.token, id: joined.member.id };
check('joiner pending', joined.member.status === 'pending');
check('bad code → 404', (await api('/api/join', { body: { code: 'ZZZZZZ', name: 'Nobody' } })).status === 404);

// --- pin / event / testimony ------------------------------------------------
const pin = await json(await api(`/api/campaigns/${cid}/pins`, { token: owner.token, body: { x: 0.5, y: 0.5, name: 'The Tollgate' } }));
check('pin placed', typeof pin.id === 'string');
check('player cannot pin → 403', (await api(`/api/campaigns/${cid}/pins`, { token: player.token, body: { x: 0.1, y: 0.1, name: 'Nope' } })).status === 403);

const evRes = await api(`/api/campaigns/${cid}/events`, { token: owner.token, body: { pinId: pin.id, canonLine: 'The gate fell.', atmosphere: 'Smoke over the river.' } });
check('event → 201', evRes.status === 201);
const ev = await json(evRes);
check('event open-table by default', Array.isArray(ev.participantIds) && ev.participantIds.length === 0);

// immediate use of a just-created record — the exact case KV lag used to break
const t1 = await json(await api(`/api/campaigns/${cid}/testimony`, { token: player.token, body: { eventId: ev.id, text: 'I cut the rope.' } }));
check('pending player testifies on fresh event', typeof t1.id === 'string');
const t1b = await json(await api(`/api/campaigns/${cid}/testimony`, { token: player.token, body: { eventId: ev.id, text: 'I cut the rope. It was already fraying.' } }));
check('amend within grace window keeps id', t1b.id === t1.id && t1b.text.includes('fraying'));

// --- pending strip on the wire ---------------------------------------------
const ownerView = await json(await api(`/api/campaigns/${cid}`, { token: owner.token }));
check('owner sees pending words', ownerView.testimony.some((t) => t.id === t1.id));
const ownerGet = await api(`/api/campaigns/${cid}`, { token: owner.token });
check('GET carries no-store', ownerGet.headers.get('Cache-Control') === 'no-store');

// a second joiner (rival) must not see the pending member's words
const rival = await json(await api('/api/join', { body: { code: created.campaign.joinCode, name: 'Petch' } }));
const rivalView = await json(await api(`/api/campaigns/${cid}`, { token: rival.token }));
check('pending words stripped from rival wire', !rivalView.testimony.some((t) => t.id === t1.id));

// --- approve → words become table-visible -----------------------------------
const approved = await json(await api(`/api/campaigns/${cid}/members/${player.id}`, { token: owner.token, body: { action: 'approve' } }));
check('approve → active', approved.status === 'active');
const rivalView2 = await json(await api(`/api/campaigns/${cid}`, { token: rival.token }));
check('approved words reach the table', rivalView2.testimony.some((t) => t.id === t1.id));

// --- mark promotion ---------------------------------------------------------
const marked = await json(await api(`/api/campaigns/${cid}/marks`, { token: player.token, body: { testimonyId: t1.id, text: 'The rope was cut.' } }));
check('mark promoted', marked.markText === 'The rope was cut.');

// --- bounty loop -------------------------------------------------------------
const bounty = await json(await api(`/api/campaigns/${cid}/bounties`, { token: player.token, body: { target: 'The gatekeeper', reason: 'He dropped the gate on us.' } }));
check('bounty proposed', bounty.status === 'proposed');
const rivalView3 = await json(await api(`/api/campaigns/${cid}`, { token: rival.token }));
check('proposed bounty off rival wire', !rivalView3.bounties.some((b) => b.id === bounty.id));
const nailed = await json(await api(`/api/campaigns/${cid}/bounties/${bounty.id}`, { token: owner.token, body: { action: 'approve' } }));
check('bounty nailed up', nailed.status === 'posted');
const struck = await json(await api(`/api/campaigns/${cid}/bounties/${bounty.id}`, { token: owner.token, body: { action: 'strike' } }));
check('bounty struck settled', struck.status === 'struck' && struck.struckSession === 1);
const b2 = await json(await api(`/api/campaigns/${cid}/bounties`, { token: rival.token, body: { target: 'Corvyn', reason: 'The rope.' } }));
const declinedB = await api(`/api/campaigns/${cid}/bounties/${b2.id}`, { token: owner.token, body: { action: 'decline' } });
check('bounty declined (deleted)', declinedB.status === 200);
const ownerView2 = await json(await api(`/api/campaigns/${cid}`, { token: owner.token }));
check('declined bounty gone from wire', !ownerView2.bounties.some((b) => b.id === b2.id));

// --- staged pin → reveal -----------------------------------------------------
const secret = await json(await api(`/api/campaigns/${cid}/pins`, { token: owner.token, body: { x: 0.8, y: 0.2, name: 'The Cellar' } }));
const hidden = await json(await api(`/api/campaigns/${cid}/pins/${secret.id}`, { token: owner.token, body: { action: 'hide' } }));
check('pin staged', hidden.hidden === true);
const playerView = await json(await api(`/api/campaigns/${cid}`, { token: player.token }));
check('staged pin off player wire', !playerView.pins.some((p) => p.id === secret.id));
const revealed = await json(await api(`/api/campaigns/${cid}/pins/${secret.id}`, { token: owner.token, body: { action: 'reveal', canonLine: 'A cellar door stood open.' } }));
check('reveal stamps session + event', revealed.pin.hiddenUntilSession === 1 && revealed.event.canonLine.includes('cellar'));
const playerView2 = await json(await api(`/api/campaigns/${cid}`, { token: player.token }));
check('revealed pin reaches player', playerView2.pins.some((p) => p.id === secret.id));

// --- rotate + advance --------------------------------------------------------
const oldCode = created.campaign.joinCode;
const rotated = await json(await api(`/api/campaigns/${cid}/code`, { token: owner.token, body: {} }));
check('code rotated', rotated.joinCode && rotated.joinCode !== oldCode);
check('old code dead → 404', (await api('/api/join', { body: { code: oldCode, name: 'Latecomer' } })).status === 404);
check('new code lives', (await api('/api/join', { body: { code: rotated.joinCode, name: 'Latecomer' } })).status === 201);

const adv = await json(await api(`/api/campaigns/${cid}/session`, { token: owner.token, body: {} }));
check('session advanced', adv.currentSession === 2);
// grace window still open (no event in s2 yet) — then latch it shut
await api(`/api/campaigns/${cid}/events`, { token: owner.token, body: { pinId: pin.id, canonLine: 'Morning after.' } });
const sealed = await api(`/api/campaigns/${cid}/testimony`, { token: player.token, body: { eventId: ev.id, text: 'Changing my story.' } });
check('sealed testimony → 409', sealed.status === 409);

// --- reclaim (self-serve) ----------------------------------------------------
const reclaim = await json(await api(`/api/campaigns/${cid}/members/${player.id}`, { token: player.token, body: { action: 'reclaim' } }));
check('self-reclaim mints token', typeof reclaim.token === 'string' && reclaim.memberId === player.id);
const reView = await api(`/api/campaigns/${cid}`, { token: reclaim.token });
check('reclaimed token seats', reView.status === 200);

// --- decline cascade ---------------------------------------------------------
const stray = await json(await api('/api/join', { body: { code: rotated.joinCode, name: 'Brastius' } }));
await api(`/api/campaigns/${cid}/testimony`, { token: stray.token, body: { eventId: ev.id, text: 'I was never here.' } });
const decl = await api(`/api/campaigns/${cid}/members/${stray.member.id}`, { token: owner.token, body: { action: 'decline' } });
check('member declined', decl.status === 200);
check('declined token dead → 403', (await api(`/api/campaigns/${cid}`, { token: stray.token })).status === 403);
const finalView = await json(await api(`/api/campaigns/${cid}`, { token: owner.token }));
check('declined words gone from wire', !finalView.testimony.some((t) => t.memberId === stray.member.id));

console.log(`\n${passed} checks green against ${BASE}`);
