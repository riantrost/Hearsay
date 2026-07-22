// POST /api/campaigns/:id/code — the owner rotates the join code. The old
// code's door closes (its KV key is deleted); codes shared before the
// rotation stop working, which is the point.

import { rotateJoinCode } from '../../../../src/mutations';
import { deleteJoinCode, param, putJoinCode, requireOwner, requireSeat, saveCampaign, type Env } from '../../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const cid = param(params.id);
  const seat = await requireSeat(env, request, cid);
  if (seat instanceof Response) return seat;
  const notOwner = requireOwner(seat);
  if (notOwner) return notOwner;

  const oldCode = seat.data.campaign.joinCode;
  const joinCode = rotateJoinCode(seat.data);
  await deleteJoinCode(env, oldCode);
  await putJoinCode(env, joinCode, cid);
  await saveCampaign(env, seat.data.campaign);
  return Response.json({ joinCode });
};
