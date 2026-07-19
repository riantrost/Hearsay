// GET /api/auth/config — whether the recovery thread is available on this
// deployment. The client hides its Google affordances when it isn't, so a
// table without configured OAuth never sees a dead button.

import type { Env } from '../../lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return Response.json({ google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) });
};
