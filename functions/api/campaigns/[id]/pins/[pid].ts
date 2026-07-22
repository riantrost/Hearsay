// POST /api/campaigns/:id/pins/:pid — the owner works a pin it placed:
// {action: "hide"} / {action: "unhide"} toggle an event-less pin in and out
// of the secret layer; {action: "reveal", canonLine} brings a staged pin to
// the table's map, and the reveal is itself a timeline event (the fog fork);
// {action: "move", x, y} repositions it; {action: "rename", name} renames;
// {action: "describe", description} sets the standing description ('' clears);
// {action: "seal"} / {action: "unseal"} close and reopen the place to player
// input. The rules live in src/mutations.ts — enforced here, mirrored
// client-side.

import { describePin, movePin, renamePin, revealPin, setPinHidden, setPinSealed } from '../../../../../src/mutations';
import { mutationError, param, readJson, requireOwner, requireSeat, saveEvent, savePin, type Env } from '../../../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const cid = param(params.id);
  const pid = param(params.pid);
  const seat = await requireSeat(env, request, cid);
  if (seat instanceof Response) return seat;
  const notOwner = requireOwner(seat);
  if (notOwner) return notOwner;

  const body = await readJson<{
    action?: unknown;
    canonLine?: unknown;
    atmosphere?: unknown;
    x?: unknown;
    y?: unknown;
    name?: unknown;
    description?: unknown;
  }>(request);
  try {
    if (body?.action === 'hide' || body?.action === 'unhide') {
      const pin = setPinHidden(seat.data, pid, body.action === 'hide');
      await savePin(env, pin);
      return Response.json(pin);
    }
    if (body?.action === 'reveal') {
      if (typeof body.canonLine !== 'string') return mutationError(new Error('a reveal needs its line of canon'));
      if (body.atmosphere !== undefined && typeof body.atmosphere !== 'string') return mutationError(new Error('malformed reveal'));
      const { pin, event } = revealPin(seat.data, pid, body.canonLine, body.atmosphere);
      await savePin(env, pin);
      await saveEvent(env, cid, event);
      return Response.json({ pin, event });
    }
    if (body?.action === 'move') {
      if (typeof body.x !== 'number' || typeof body.y !== 'number') return mutationError(new Error('a move needs coordinates'));
      const pin = movePin(seat.data, pid, body.x, body.y);
      await savePin(env, pin);
      return Response.json(pin);
    }
    if (body?.action === 'rename') {
      if (typeof body.name !== 'string') return mutationError(new Error('a place needs a name'));
      const pin = renamePin(seat.data, pid, body.name);
      await savePin(env, pin);
      return Response.json(pin);
    }
    if (body?.action === 'describe') {
      if (typeof body.description !== 'string') return mutationError(new Error('malformed description'));
      const pin = describePin(seat.data, pid, body.description);
      await savePin(env, pin);
      return Response.json(pin);
    }
    if (body?.action === 'seal' || body?.action === 'unseal') {
      const pin = setPinSealed(seat.data, pid, body.action === 'seal');
      await savePin(env, pin);
      return Response.json(pin);
    }
    return mutationError(new Error('unknown pin action'));
  } catch (e) {
    return mutationError(e);
  }
};
