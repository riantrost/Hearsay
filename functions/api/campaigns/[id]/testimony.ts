// POST /api/campaigns/:id/testimony — write or amend your slot on an event.
// Who is writing comes from the token, never the body: you can only ever
// testify as yourself. The grace window and participant rule are enforced by
// the shared mutation layer.

import { writeTestimony } from '../../../../src/mutations';
import { ensureRecord, eventKey, mutationError, param, putRecord, readJson, requireSeat, testimonyKey, type Env } from '../../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const cid = param(params.id);
  const seat = await requireSeat(env, request, cid);
  if (seat instanceof Response) return seat;

  const body = await readJson<{ eventId?: unknown; text?: unknown }>(request);
  if (typeof body?.eventId !== 'string' || typeof body.text !== 'string') {
    return mutationError(new Error('malformed testimony'));
  }
  try {
    // a just-dropped event may not have reached KV's list yet — fetch it directly
    await ensureRecord(env, seat.data.events, body.eventId, eventKey(cid, body.eventId));
    const entry = writeTestimony(seat.data, body.eventId, seat.member.id, body.text);
    await putRecord(env, testimonyKey(cid, entry.id), entry);
    return Response.json(entry, { status: 201 });
  } catch (e) {
    return mutationError(e);
  }
};
