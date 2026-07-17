// GET /api/maps/:id — the campaign's map image from R2. The campaign id is
// an unguessable capability; the map is only as findable as the table's own
// links (table-private by obscurity of id, not by auth — V1 trade).

import { err, param, type Env } from '../../lib';

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const cid = param(params.id);
  const obj = await env.MAPS.get(`map/${cid}`);
  if (!obj) return err(404, 'no such map');
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
