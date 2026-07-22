// POST /api/auth/recover — the shop scenario: nothing in hand but a Google
// sign-in. {gsession} resolves to the account's linked seats; each one whose
// member still exists gets a *fresh* bearer token (additive — old devices
// keep working), labeled with the campaign name for the tables picker. The
// "declined members can't be recovered into" rule rides the SQL join in
// recoverableSeats.

import { insertToken, readJson, recoverableSeats, requireGoogleSession, type Env } from '../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{ gsession?: unknown }>(request);
  const session = await requireGoogleSession(env, body?.gsession);
  if (session instanceof Response) return session;

  const linked = await recoverableSeats(env, session.sub);
  const seats: { campaignId: string; memberId: string; token: string; label?: string }[] = [];
  for (const s of linked) {
    const token = crypto.randomUUID();
    await insertToken(env, token, s.campaignId, s.memberId);
    seats.push({ campaignId: s.campaignId, memberId: s.memberId, token, label: s.label });
  }
  return Response.json({ email: session.email, seats });
};
