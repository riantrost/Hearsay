// POST /api/auth/link — a seated member ties their seat to the Google
// account they just signed in as: {gsession}. Authority comes from the seat's
// own bearer token (you can only back up a chair you're sitting in); the
// gsession says which Google account remembers it. Idempotent.

import {
  err,
  googleAccountKey,
  putRecord,
  readJson,
  requireGoogleSession,
  tokenKey,
  type Env,
  type GoogleAccount,
  type TokenRecord,
} from '../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (!token) return err(401, 'no token: only a seated member can back up their seat');
  const seat = await env.HEARSAY.get<TokenRecord>(tokenKey(token), 'json');
  if (!seat) return err(403, 'this token has no seat at any table');

  const body = await readJson<{ gsession?: unknown }>(request);
  const session = await requireGoogleSession(env, body?.gsession);
  if (session instanceof Response) return session;

  const key = googleAccountKey(session.sub);
  const account = (await env.HEARSAY.get<GoogleAccount>(key, 'json')) ?? { email: session.email, seats: [] };
  account.email = session.email || account.email;
  if (!account.seats.some((s) => s.campaignId === seat.campaignId && s.memberId === seat.memberId)) {
    account.seats.push({ campaignId: seat.campaignId, memberId: seat.memberId });
  }
  await putRecord(env, key, account);
  return Response.json({ email: account.email });
};
