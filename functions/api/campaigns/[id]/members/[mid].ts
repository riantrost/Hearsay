// POST /api/campaigns/:id/members/:mid — the owner resolves a membership
// proposal: {action: "approve"} makes the member's posts table-visible;
// {action: "decline"} refuses the proposal, and the words that were never
// table-visible leave with it (their KV records are deleted). The declined
// member's token record is left orphaned deliberately — with no member
// behind it, requireSeat already refuses it. {action: "reclaim"} mints a
// fresh bearer token for an existing member so the seat can move to a new
// device — additive, so the old token keeps working. Owners may reclaim any
// member (the lockout case); members may reclaim themselves (self-serve).

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
  tokenKey,
  type Env,
  type TokenRecord,
} from '../../../../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const cid = param(params.id);
  const mid = param(params.mid);
  const seat = await requireSeat(env, request, cid);
  if (seat instanceof Response) return seat;

  const body = await readJson<{ action?: unknown }>(request);
  // reclaiming your *own* seat is self-serve (a second device shouldn't need
  // the owner's blessing — you already hold this chair); every other member
  // act stays an owner act
  const selfReclaim = body?.action === 'reclaim' && mid === seat.member.id;
  if (!selfReclaim) {
    const notOwner = requireOwner(seat);
    if (notOwner) return notOwner;
  }
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
    if (body?.action === 'reclaim') {
      // a fresh chair for a member who already exists — never conjure a token
      // for a memberId that isn't seated at this table
      const member = seat.data.members.find((m) => m.id === mid);
      if (!member) return mutationError(new Error('no such member'));
      const token = crypto.randomUUID();
      await putRecord(env, tokenKey(token), { campaignId: cid, memberId: mid } satisfies TokenRecord);
      return Response.json({ campaignId: cid, memberId: mid, token });
    }
    return mutationError(new Error('unknown member action'));
  } catch (e) {
    return mutationError(e);
  }
};
