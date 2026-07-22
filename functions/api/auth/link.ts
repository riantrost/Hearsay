// POST /api/auth/link — a seated member ties their seat to the Google
// account they just signed in as: {gsession}. Authority comes from the seat's
// own bearer token (you can only back up a chair you're sitting in); the
// gsession says which Google account remembers it. Idempotent.

import { bearerToken, err, getTokenRecord, linkGoogleSeat, readJson, requireGoogleSession, type Env } from '../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = bearerToken(request);
  if (!token) return err(401, 'no token: only a seated member can back up their seat');
  const seat = await getTokenRecord(env, token);
  if (!seat) return err(403, 'this token has no seat at any table');

  const body = await readJson<{ gsession?: unknown }>(request);
  const session = await requireGoogleSession(env, body?.gsession);
  if (session instanceof Response) return session;

  const email = await linkGoogleSeat(env, session, seat.campaignId, seat.memberId);
  return Response.json({ email });
};
