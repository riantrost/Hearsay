// POST /api/campaigns/:id/bounties/:bid — the owner resolves the board:
// {action: "approve"} nails a proposal up for the table; {action: "decline"}
// refuses it (paper that never reached the board is deleted, like a declined
// membership's words); {action: "strike"} crosses a posted bounty out at the
// current session — settled, kept, never erased.

import { approveBounty, declineBounty, strikeBounty } from '../../../../../src/mutations';
import {
  bountyKey,
  ensureRecord,
  mutationError,
  param,
  putRecord,
  readJson,
  requireOwner,
  requireSeat,
  type Env,
} from '../../../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const cid = param(params.id);
  const bid = param(params.bid);
  const seat = await requireSeat(env, request, cid);
  if (seat instanceof Response) return seat;
  const notOwner = requireOwner(seat);
  if (notOwner) return notOwner;

  // a just-posted bounty may lag KV's list — read it directly before refusing
  await ensureRecord(env, seat.data.bounties, bid, bountyKey(cid, bid));

  const body = await readJson<{ action?: unknown }>(request);
  try {
    if (body?.action === 'approve') {
      const bounty = approveBounty(seat.data, bid);
      await putRecord(env, bountyKey(cid, bounty.id), bounty);
      return Response.json(bounty);
    }
    if (body?.action === 'decline') {
      const bounty = declineBounty(seat.data, bid);
      await env.HEARSAY.delete(bountyKey(cid, bounty.id));
      return Response.json({ declined: bounty.id });
    }
    if (body?.action === 'strike') {
      const bounty = strikeBounty(seat.data, bid);
      await putRecord(env, bountyKey(cid, bounty.id), bounty);
      return Response.json(bounty);
    }
    return mutationError(new Error('unknown bounty action'));
  } catch (e) {
    return mutationError(e);
  }
};
