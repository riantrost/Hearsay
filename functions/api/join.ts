// POST /api/join — the join code mints a seat. The joiner arrives pending
// (proposal pattern): they can write immediately, visible only to themselves
// and the owner, until approval makes their posts visible to the table.

import type { Member } from '../../src/model';
import { newId } from '../../src/mutations';
import { codeKey, err, memberKey, putRecord, readJson, tokenKey, type Env, type TokenRecord } from '../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{ code?: unknown; name?: unknown }>(request);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!code) return err(400, 'a join code opens the door');
  if (!name || name.length > 60) return err(400, 'a member needs a name');

  const rec = await env.HEARSAY.get<{ campaignId: string }>(codeKey(code), 'json');
  if (!rec) return err(404, 'no table answers to this code');

  const member: Member = {
    id: newId('m'),
    campaignId: rec.campaignId,
    name,
    role: 'player',
    status: 'pending',
  };
  const token = crypto.randomUUID();
  await putRecord(env, memberKey(rec.campaignId, member.id), member);
  await putRecord(env, tokenKey(token), { campaignId: rec.campaignId, memberId: member.id } satisfies TokenRecord);
  return Response.json({ campaignId: rec.campaignId, member, token }, { status: 201 });
};
