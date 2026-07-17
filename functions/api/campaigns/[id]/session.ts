// POST /api/campaigns/:id/session — the owner begins the next session.
// Sessions are the clock; advancing arms the grace window's close (which
// latches only when the new session's first event lands).

import { advanceSession } from '../../../../src/mutations';
import { campaignKey, param, putRecord, requireOwner, requireSeat, type Env } from '../../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const cid = param(params.id);
  const seat = await requireSeat(env, request, cid);
  if (seat instanceof Response) return seat;
  const notOwner = requireOwner(seat);
  if (notOwner) return notOwner;

  const currentSession = advanceSession(seat.data);
  await putRecord(env, campaignKey(cid), seat.data.campaign);
  return Response.json({ currentSession });
};
