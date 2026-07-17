// remote.js — the only thing that speaks to a table server (Supabase). A thin
// fetch client for the three surfaces the app uses — anonymous device auth,
// PostgREST rows/RPCs, and storage objects — instead of the vendored SDK, so the
// app stays buildless and the whole wire protocol stays readable in one sitting.
// No websockets by design: sessions are the clock; a table syncs on open, on
// focus, and on demand, which survives a low-energy month better than a socket.

const authKey = (url) => 'hearsay.auth.' + new URL(url).origin;

export class Remote {
  constructor({ url, anonKey }) {
    this.url = url.replace(/\/+$/, '');
    this.anonKey = anonKey;
  }

  // ---- anonymous device auth ------------------------------------------------
  // A device is an anonymous Supabase user: no email, no account, just a keypair
  // of tokens in localStorage — identity-first and table-private, same as seats.

  _store() { try { return JSON.parse(localStorage.getItem(authKey(this.url))); } catch { return null; } }
  _save(s) { localStorage.setItem(authKey(this.url), JSON.stringify(s)); }

  get userId() { return this._store()?.user_id || null; }

  async ensureAuth() {
    const s = this._store();
    if (s && Date.now() < s.expires_at - 60_000) return s.access_token;
    if (s?.refresh_token) {
      const t = await this._tokenFetch('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
      if (t) return t;
      // refresh rejected (revoked / server reset) — fall through to a fresh anonymous user
    }
    const t = await this._tokenFetch('/auth/v1/signup', {});
    if (!t) throw new Error('The server refused an anonymous sign-in. Is "Anonymous sign-ins" enabled in the Supabase Auth settings?');
    return t;
  }

  async _tokenFetch(path, body) {
    const res = await fetch(this.url + path, {
      method: 'POST',
      headers: { apikey: this.anonKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res || !res.ok) return null;
    const j = await res.json();
    if (!j.access_token) return null;
    this._save({
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      user_id: j.user?.id,
      expires_at: Date.now() + (j.expires_in || 3600) * 1000,
    });
    return j.access_token;
  }

  async _headers(extra = {}) {
    const token = await this.ensureAuth();
    return { apikey: this.anonKey, authorization: 'Bearer ' + token, ...extra };
  }

  // ---- rows (PostgREST) -------------------------------------------------------

  async select(table, query) {
    const res = await fetch(`${this.url}/rest/v1/${table}?${query}`, { headers: await this._headers() });
    if (!res.ok) throw new Error(`select ${table}: ${res.status}`);
    return res.json();
  }

  async upsert(table, rows) {
    if (!rows.length) return;
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: await this._headers({
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`upsert ${table}: ${res.status} ${await res.text()}`);
  }

  async patch(table, query, values) {
    const res = await fetch(`${this.url}/rest/v1/${table}?${query}`, {
      method: 'PATCH',
      headers: await this._headers({ 'content-type': 'application/json', prefer: 'return=minimal' }),
      body: JSON.stringify(values),
    });
    if (!res.ok) throw new Error(`patch ${table}: ${res.status}`);
  }

  async remove(table, query) {
    const res = await fetch(`${this.url}/rest/v1/${table}?${query}`, {
      method: 'DELETE',
      headers: await this._headers({ prefer: 'return=minimal' }),
    });
    if (!res.ok) throw new Error(`delete ${table}: ${res.status}`);
  }

  async rpc(name, args) {
    const res = await fetch(`${this.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: await this._headers({ 'content-type': 'application/json' }),
      body: JSON.stringify(args || {}),
    });
    if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // ---- storage ----------------------------------------------------------------

  async uploadObject(bucket, path, blob) {
    const res = await fetch(`${this.url}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: await this._headers({ 'content-type': blob.type || 'application/octet-stream', 'x-upsert': 'true' }),
      body: blob,
    });
    if (!res.ok) throw new Error(`upload ${path}: ${res.status}`);
  }

  async downloadObject(bucket, path) {
    const res = await fetch(`${this.url}/storage/v1/object/${bucket}/${path}`, { headers: await this._headers() });
    if (!res.ok) return null;
    return res.blob();
  }
}

// The whole invitation in one pastable line: where the table lives, the public
// key to knock with, and the code that seats you. (The anon key is public by
// design — row security is what protects the table, not key secrecy.)
export function makeInvite(remote) {
  return `${remote.url}#${remote.anonKey}#${remote.code}`;
}
export function parseInvite(text) {
  const [url, anonKey, code] = (text || '').trim().split('#');
  if (!url || !anonKey || !code) return null;
  try { new URL(url); } catch { return null; }
  return { url, anonKey, code };
}
