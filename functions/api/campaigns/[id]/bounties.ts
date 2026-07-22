// POST /api/campaigns/:id/bounties — any member posts a bounty proposal
// (revenge is a member act, pending seats included; the owner's approval is
// the only gate). It arrives status:'proposed', visible only to poster and
// owner until the owner nails it to the board.

import { postBounty } from '../../../../src/mutations';
import { bountyKey, mutationError, param, putRecord, readJson, requireSeat, type Env } from '../../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const cid = param(params.id);
  const seat = await requireSeat(env, request, cid);
  if (seat instanceof Response) return seat;

  const body = await readJson<{ target?: unknown; reason?: unknown }>(request);
  try {
    const bounty = postBounty(
      seat.data,
      seat.member.id,
      typeof body?.target === 'string' ? body.target : '',
      typeof body?.reason === 'string' ? body.reason : '',
    );
    await putRecord(env, bountyKey(cid, bounty.id), bounty);
    return Response.json(bounty, { status: 201 });
  } catch (e) {
    return mutationError(e);
  }
};
