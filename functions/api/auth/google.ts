// GET /api/auth/google — step one of the recovery thread: bounce to Google's
// consent screen. The state parameter round-trips through Google and is
// checked against a short-lived cookie in the callback (CSRF). What the
// sign-in is *for* (linking a seat vs recovering tables) is the client's
// business — it remembers its own mode in sessionStorage.

import { err, type Env } from '../../lib';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return err(503, 'google sign-in is not configured on this deployment');
  }
  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID();
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  auth.searchParams.set('redirect_uri', `${origin}/api/auth/callback`);
  auth.searchParams.set('response_type', 'code');
  // email is all recovery needs; no profile, no scopes to grow into
  auth.searchParams.set('scope', 'openid email');
  auth.searchParams.set('state', state);
  auth.searchParams.set('prompt', 'select_account');
  return new Response(null, {
    status: 302,
    headers: {
      Location: auth.toString(),
      'Set-Cookie': `gstate=${state}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
};
