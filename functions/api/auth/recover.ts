// POST /api/auth/recover — the shop scenario: nothing in hand but a Google
// sign-in. {gsession} resolves to the account's linked seats; each one whose
// member still exists gets a *fresh* bearer token (additive — old devices
// keep working), labeled with the campaign name for the tables picker.

import type { Campaign, Member } from '../../../src/model';
import {
  campaignKey,
  googleAccountKey,
  memberKey,
  putRecord,
  requireGoogleSession,
  readJson,
  tokenKey,
  type Env,
  type GoogleAccount,
  type TokenRecord,
} from '../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{ gsession?: unknown }>(request);
  const session = await requireGoogleSession(env, body?.gsession);
  if (session instanceof Response) return session;

  const account = await env.HEARSAY.get<GoogleAccount>(googleAccountKey(session.sub), 'json');
  const seats: { campaignId: string; memberId: string; token: string; label?: string }[] = [];
  for (const linked of account?.seats ?? []) {
    // a declined/removed member can't be recovered into; skip it quietly
    const member = await env.HEARSAY.get<Member>(memberKey(linked.campaignId, linked.memberId), 'json');
    if (!member) continue;
    const campaign = await env.HEARSAY.get<Campaign>(campaignKey(linked.campaignId), 'json');
    if (!campaign) continue;
    const token = crypto.randomUUID();
    await putRecord(env, tokenKey(token), { campaignId: linked.campaignId, memberId: linked.memberId } satisfies TokenRecord);
    seats.push({ campaignId: linked.campaignId, memberId: linked.memberId, token, label: campaign.name });
  }
  return Response.json({ email: session.email, seats });
};
