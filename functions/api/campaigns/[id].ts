// GET /api/campaigns/:id — the campaign as your seat is allowed to see it.
// The pending-visibility rule is enforced here, server-side: invisible
// testimony never leaves the server, so no client can read past its seat.

import { visibleData } from '../../../src/mutations';
import { param, requireSeat, type Env } from '../../lib';

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const cid = param(params.id);
  const seat = await requireSeat(env, request, cid);
  if (seat instanceof Response) return seat;
  return Response.json(visibleData(seat.data, seat.member.id), {
    // freshness discipline: campaign state is never cache-servable
    headers: { 'Cache-Control': 'no-store' },
  });
};
