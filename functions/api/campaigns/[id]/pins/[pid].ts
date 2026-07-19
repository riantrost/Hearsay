// POST /api/campaigns/:id/pins/:pid — the owner works the staging layer:
// {action: "hide"} / {action: "unhide"} toggle an event-less pin in and out
// of the secret layer; {action: "reveal", canonLine} brings a staged pin to
// the table's map, and the reveal is itself a timeline event (the fog fork).
// The rules live in src/mutations.ts — enforced here and mirrored client-side.

import { revealPin, setPinHidden } from '../../../../../src/mutations';
import {
  ensureRecord,
  eventKey,
  mutationError,
  param,
  pinKey,
  putRecord,
  readJson,
  requireOwner,
  requireSeat,
  type Env,
} from '../../../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const cid = param(params.id);
  const pid = param(params.pid);
  const seat = await requireSeat(env, request, cid);
  if (seat instanceof Response) return seat;
  const notOwner = requireOwner(seat);
  if (notOwner) return notOwner;

  const body = await readJson<{ action?: unknown; canonLine?: unknown; atmosphere?: unknown }>(request);
  try {
    // a just-placed pin may not have reached KV's list yet — fetch it directly
    await ensureRecord(env, seat.data.pins, pid, pinKey(cid, pid));
    if (body?.action === 'hide' || body?.action === 'unhide') {
      const pin = setPinHidden(seat.data, pid, body.action === 'hide');
      await putRecord(env, pinKey(cid, pin.id), pin);
      return Response.json(pin);
    }
    if (body?.action === 'reveal') {
      if (typeof body.canonLine !== 'string') return mutationError(new Error('a reveal needs its line of canon'));
      if (body.atmosphere !== undefined && typeof body.atmosphere !== 'string') return mutationError(new Error('malformed reveal'));
      const { pin, event } = revealPin(seat.data, pid, body.canonLine, body.atmosphere);
      await putRecord(env, pinKey(cid, pin.id), pin);
      await putRecord(env, eventKey(cid, event.id), event);
      return Response.json({ pin, event });
    }
    return mutationError(new Error('unknown pin action'));
  } catch (e) {
    return mutationError(e);
  }
};
