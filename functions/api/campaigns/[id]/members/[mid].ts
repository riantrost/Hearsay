// POST /api/campaigns/:id/members/:mid — the owner resolves a membership
// proposal: {action: "approve"} makes the member's posts table-visible;
// {action: "decline"} refuses the proposal, and the words that were never
// table-visible leave with it — seat, testimony, and tokens in one
// transactional cascade. {action: "reclaim"} mints a fresh bearer token for
// an existing member so the seat can move to a new device — additive, so the
// old token keeps working. Owners may reclaim any member (the lockout case);
// members may reclaim themselves (self-serve).

import { approveMember, declineMember } from '../../../../../src/mutations';
import {
  deleteMemberCascade,
  insertToken,
  mutationError,
  param,
  readJson,
  requireOwner,
  requireSeat,
  saveMember,
  type Env,
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
      await saveMember(env, member);
      return Response.json(member);
    }
    if (body?.action === 'decline') {
      // the mutation validates the decline (owner can't be declined, etc.);
      // the cascade then removes seat, never-table-visible words, and tokens
      const { member } = declineMember(seat.data, mid);
      await deleteMemberCascade(env, cid, member.id);
      return Response.json({ declined: member.id });
    }
    if (body?.action === 'reclaim') {
      // a fresh chair for a member who already exists — never conjure a token
      // for a memberId that isn't seated at this table
      const member = seat.data.members.find((m) => m.id === mid);
      if (!member) return mutationError(new Error('no such member'));
      const token = crypto.randomUUID();
      await insertToken(env, token, cid, mid);
      return Response.json({ campaignId: cid, memberId: mid, token });
    }
    return mutationError(new Error('unknown member action'));
  } catch (e) {
    return mutationError(e);
  }
};
