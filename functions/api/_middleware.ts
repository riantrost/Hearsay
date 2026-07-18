// Pages `_headers` rules cover static assets only — Functions responses ship
// without them. This middleware closes the gap so the noindex contract holds
// on every /api response too (table-private by principle; the map route is
// the one tokenless surface a crawler could ever reach).

export const onRequest: PagesFunction = async ({ next }) => {
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('X-Robots-Tag', 'noindex');
  return out;
};
