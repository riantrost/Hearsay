// POST /api/campaigns/:id/members/:mid — the owner resolves a membership
// proposal: {action: "approve"} makes the member's posts table-visible;
// {action: "decline"} refuses the proposal, and the words that were never
// table-visible leave with it (their KV records are deleted). The declined
// member's token record is left orphaned deliberately — with no member
// behind it, requireSeat already refuses it.

import { approveMember, declineMember } from '../../../../../src/mutations';
import {
  memberKey,
  mutationError,
  param,
  putRecord,
  readJson,
  requireOwner,
  requireSeat,
  testimonyKey,
  type Env,
} from '../../../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const cid = param(params.id);
  const mid = param(params.mid);
  const seat = await requireSeat(env, request, cid);
  if (seat instanceof Response) return seat;
  const notOwner = requireOwner(seat);
  if (notOwner) return notOwner;

  const body = await readJson<{ action?: unknown }>(request);
  try {
    if (body?.action === 'approve') {
      const member = approveMember(seat.data, mid);
      await putRecord(env, memberKey(cid, member.id), member);
      return Response.json(member);
    }
    if (body?.action === 'decline') {
      const { member, removedTestimonyIds } = declineMember(seat.data, mid);
      await env.HEARSAY.delete(memberKey(cid, member.id));
      for (const tid of removedTestimonyIds) await env.HEARSAY.delete(testimonyKey(cid, tid));
      return Response.json({ declined: member.id });
    }
    return mutationError(new Error('unknown member action'));
  } catch (e) {
    return mutationError(e);
  }
};
