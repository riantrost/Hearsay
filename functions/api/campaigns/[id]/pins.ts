// POST /api/campaigns/:id/pins — the owner drops a pin (owner-only: the
// world has one owner; player-proposed pins are designed but post-V1).

import { addPin } from '../../../../src/mutations';
import { mutationError, param, readJson, requireOwner, requireSeat, savePin, type Env } from '../../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const cid = param(params.id);
  const seat = await requireSeat(env, request, cid);
  if (seat instanceof Response) return seat;
  const notOwner = requireOwner(seat);
  if (notOwner) return notOwner;

  const body = await readJson<{ x?: unknown; y?: unknown; name?: unknown }>(request);
  if (typeof body?.x !== 'number' || typeof body.y !== 'number' || typeof body.name !== 'string') {
    return mutationError(new Error('malformed pin'));
  }
  try {
    const pin = addPin(seat.data, body.x, body.y, body.name);
    await savePin(env, pin);
    return Response.json(pin, { status: 201 });
  } catch (e) {
    return mutationError(e);
  }
};
