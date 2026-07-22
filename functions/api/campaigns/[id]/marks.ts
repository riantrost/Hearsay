// POST /api/campaigns/:id/marks — promote one line of your own testimony to
// graffiti on the pin. Author-only, once, brevity-capped — all enforced by
// the shared mutation layer; the mark rides its testimony record.

import { promoteMark } from '../../../../src/mutations';
import { mutationError, param, readJson, requireSeat, saveTestimony, type Env } from '../../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const cid = param(params.id);
  const seat = await requireSeat(env, request, cid);
  if (seat instanceof Response) return seat;

  const body = await readJson<{ testimonyId?: unknown; text?: unknown }>(request);
  if (typeof body?.testimonyId !== 'string' || typeof body.text !== 'string') {
    return mutationError(new Error('malformed mark'));
  }
  try {
    const entry = promoteMark(seat.data, body.testimonyId, seat.member.id, body.text);
    await saveTestimony(env, cid, entry);
    return Response.json(entry);
  } catch (e) {
    return mutationError(e);
  }
};
