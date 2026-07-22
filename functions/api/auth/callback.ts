// GET /api/auth/callback — Google sends the one-time code back here. The
// server exchanges it (client secret never leaves this function), reads who
// signed in from the id_token, and mints a short-lived gsession handle the
// SPA picks up from the URL fragment. The fragment matters: it never reaches
// server logs, and the handle inside it expires in minutes and holds no
// campaign authority by itself — /link and /recover decide what it may do.

import { err, putGoogleSession, type Env } from '../../lib';

/** gsession lifetime: long enough to finish booting, nothing more. */
const SESSION_TTL_MS = 600_000;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return err(503, 'google sign-in is not configured on this deployment');
  }
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = /(?:^|;\s*)gstate=([^;]+)/.exec(request.headers.get('Cookie') ?? '')?.[1];
  if (!code || !state || state !== cookieState) return err(400, 'sign-in did not round-trip cleanly — try again');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/auth/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return err(502, 'google refused the sign-in — try again');
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  if (!id_token) return err(502, 'google sent no identity — try again');
  // the id_token came straight from Google's token endpoint over TLS, so its
  // payload is trustworthy without a signature check (standard for code flow)
  let sub: string, email: string;
  try {
    const payload = JSON.parse(atob(id_token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))) as {
      sub?: string;
      email?: string;
    };
    if (!payload.sub) throw new Error('no sub');
    sub = payload.sub;
    email = payload.email ?? '';
  } catch {
    return err(502, 'google sent an unreadable identity — try again');
  }

  const gsession = crypto.randomUUID();
  await putGoogleSession(env, gsession, { sub, email }, SESSION_TTL_MS);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/#gauth=${gsession}`,
      'Set-Cookie': 'gstate=; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    },
  });
};
