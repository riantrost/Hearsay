// POST /api/join — the join code mints a seat. The joiner arrives pending
// (proposal pattern): they can write immediately, visible only to themselves
// and the owner, until approval makes their posts visible to the table.

import type { Member } from '../../src/model';
import { newId } from '../../src/mutations';
import { err, findCampaignByCode, insertToken, readJson, saveMember, type Env } from '../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{ code?: unknown; name?: unknown }>(request);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!code) return err(400, 'a join code opens the door');
  if (!name || name.length > 60) return err(400, 'a member needs a name');

  const campaignId = await findCampaignByCode(env, code);
  if (!campaignId) return err(404, 'no table answers to this code');

  const member: Member = {
    id: newId('m'),
    campaignId,
    name,
    role: 'player',
    status: 'pending',
  };
  const token = crypto.randomUUID();
  await saveMember(env, member);
  await insertToken(env, token, campaignId, member.id);
  return Response.json({ campaignId, member, token }, { status: 201 });
};
