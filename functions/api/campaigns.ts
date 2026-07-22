// POST /api/campaigns — a Campaign Manager founds a world: name + map image
// (multipart, since the map rides along). Mints the campaign, the owner's
// seat, the owner's bearer token, and the join code in one act.

import type { Campaign, Member } from '../../src/model';
import { newId, newJoinCode } from '../../src/mutations';
import { err, insertToken, MAX_MAP_BYTES, putJoinCode, saveCampaign, saveMember, type Env } from '../lib';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return err(400, 'expected multipart form data');
  }
  const name = form.get('name');
  const ownerName = form.get('ownerName');
  const map = form.get('map');
  const mapW = Number(form.get('mapW'));
  const mapH = Number(form.get('mapH'));
  if (typeof name !== 'string' || !name.trim() || name.length > 80) return err(400, 'a campaign needs a name');
  if (typeof ownerName !== 'string' || !ownerName.trim() || ownerName.length > 60) return err(400, 'the owner needs a name');
  if (!(map instanceof File) || map.size === 0) return err(400, 'a campaign needs its map');
  if (map.size > MAX_MAP_BYTES) return err(400, 'map image too large');
  // the server can't decode images; the client reads the natural size and
  // sends it, same trust boundary as Fragments' audio duration
  if (!Number.isInteger(mapW) || !Number.isInteger(mapH) || mapW < 1 || mapH < 1 || mapW > 30000 || mapH > 30000) {
    return err(400, 'bad map dimensions');
  }

  const cid = newId('c');
  const campaign: Campaign = {
    id: cid,
    name: name.trim(),
    mapImageUrl: `/api/maps/${cid}`,
    mapW,
    mapH,
    joinCode: newJoinCode(),
  };
  const owner: Member = {
    id: newId('m'),
    campaignId: cid,
    name: ownerName.trim(),
    role: 'owner',
    status: 'active',
  };
  const token = crypto.randomUUID();

  await env.MAPS.put(`map/${cid}`, map, {
    httpMetadata: { contentType: map.type || 'application/octet-stream' },
  });
  await saveCampaign(env, campaign);
  await saveMember(env, owner);
  await insertToken(env, token, cid, owner.id);
  await putJoinCode(env, campaign.joinCode, cid);
  return Response.json({ campaign, member: owner, token }, { status: 201 });
};
