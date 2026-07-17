// POST /api/campaigns/:id/events — the owner drops a line of canon at a pin
// (owner-only: canon is authority by layer, never by moderation).

import { addEvent } from '../../../../src/mutations';
import { eventKey, mutationError, param, putRecord, readJson, requireOwner, requireSeat, type Env } from '../../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const cid = param(params.id);
  const seat = await requireSeat(env, request, cid);
  if (seat instanceof Response) return seat;
  const notOwner = requireOwner(seat);
  if (notOwner) return notOwner;

  const body = await readJson<{ pinId?: unknown; canonLine?: unknown; participantIds?: unknown }>(request);
  const participantIds =
    body?.participantIds === undefined
      ? undefined
      : Array.isArray(body.participantIds) && body.participantIds.every((x) => typeof x === 'string')
        ? (body.participantIds as string[])
        : null;
  if (typeof body?.pinId !== 'string' || typeof body.canonLine !== 'string' || participantIds === null) {
    return mutationError(new Error('malformed event'));
  }
  try {
    const event = addEvent(seat.data, body.pinId, body.canonLine, participantIds);
    await putRecord(env, eventKey(cid, event.id), event);
    return Response.json(event, { status: 201 });
  } catch (e) {
    return mutationError(e);
  }
};
