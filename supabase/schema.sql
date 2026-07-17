-- Hearsay — Supabase schema.
-- The RLS layer IS the product's authority model, translated: canon writes are
-- owner-only, testimony is author-only, hidden pins never leave the server to
-- players, sealing is enforced here rather than by client politeness.
--
-- Identity: Supabase *anonymous* sign-ins (enable in Auth settings). A device is
-- an anonymous user; joining a campaign (by invite code) creates a membership;
-- the member then claims a seat. No emails, no accounts — identity stays a
-- per-device, table-private choice, same as the local prototype.
--
-- IDs are client-generated text (e.g. 'e_ab12cd9x'), matching the local-first
-- app: a published campaign keeps the same ids it had in IndexedDB, so
-- export/import and publish/pull are the same shapes with different transports.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists campaigns (
  id              text primary key,
  name            text not null default 'Untitled Campaign',
  current_session int  not null default 1,
  concluded       boolean not null default false,
  sealing         text not null default 'open' check (sealing in ('open', 'until-conclusion')),
  grid            jsonb not null default '{"mode":"freeform","size":6,"offsetX":0,"offsetY":0}',
  map             jsonb,                      -- { imageId, w, h }; blob lives in storage
  invite_code     text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- A device (anonymous auth user) at a table. seat: 'owner' or a players.id;
-- null until claimed. Several devices may share a seat (a player's phone + tablet).
create table if not exists members (
  campaign_id text not null references campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  seat        text,
  joined_at   timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists players (
  campaign_id text not null references campaigns(id) on delete cascade,
  id          text not null,
  name        text not null,
  color       text not null,
  sort        int  not null default 0,
  primary key (campaign_id, id)
);

-- Event pins. hidden means "staged: does not exist on players' maps at all";
-- reveal_session is the scrubber's record of when disclosure happened.
create table if not exists events (
  campaign_id    text not null references campaigns(id) on delete cascade,
  id             text not null,
  name           text not null,
  x              float8 not null,
  y              float8 not null,
  session        int not null,
  type           text not null default 'other',
  canon          text not null default '',
  slots          jsonb not null default '[]',   -- player ids with an open journal slot
  hidden         boolean not null default false,
  reveal_session int,
  proposed_by    text,                          -- players.id provenance, if adopted from a proposal
  updated_at     timestamptz not null default now(),
  primary key (campaign_id, id)
);

create table if not exists testimony (
  campaign_id text not null references campaigns(id) on delete cascade,
  event_id    text not null,
  player_id   text not null,
  text        text not null,
  updated_at  timestamptz not null default now(),
  primary key (campaign_id, event_id, player_id),
  foreign key (campaign_id, event_id) references events(campaign_id, id) on delete cascade
);

create table if not exists warbands (
  campaign_id text not null references campaigns(id) on delete cascade,
  player_id   text not null,
  current     text not null default '',
  updated_at  timestamptz not null default now(),
  primary key (campaign_id, player_id)
);

-- One snapshot per (player, session): the text as it stood when that session's
-- first edit landed — the scrubber's memory. Earliest write wins (upsert ignores).
create table if not exists warband_snapshots (
  campaign_id text not null references campaigns(id) on delete cascade,
  player_id   text not null,
  session     int not null,
  text        text not null,
  at          timestamptz not null default now(),
  primary key (campaign_id, player_id, session)
);

-- Player-proposed pins (decisions.md): a separate axis, never entangled with
-- hidden/fog. Pending rows are proposer+owner only; the owner authors canon
-- from them (adopt-and-edit) and only the owner decides status.
create table if not exists pin_proposals (
  campaign_id text not null references campaigns(id) on delete cascade,
  id          text not null,
  by_player   text not null,
  x           float8 not null,
  y           float8 not null,
  name        text not null default '',
  type        text not null default 'other',
  note        text not null default '',
  session     int not null,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  primary key (campaign_id, id)
);

-- ---------------------------------------------------------------------------
-- Authority helpers (security definer so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------

create or replace function is_member(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where campaign_id = cid and user_id = auth.uid());
$$;

create or replace function is_owner(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where campaign_id = cid and user_id = auth.uid() and seat = 'owner');
$$;

-- The seat this device holds at this table ('owner', a players.id, or null).
create or replace function my_seat(cid text) returns text
language sql stable security definer set search_path = public as $$
  select seat from members where campaign_id = cid and user_id = auth.uid();
$$;

-- A concluded campaign is a read-only archive; every write policy consults this.
create or replace function campaign_open(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from campaigns where id = cid and not concluded);
$$;

-- ---------------------------------------------------------------------------
-- RPCs — the only two writes that cross an authority boundary
-- ---------------------------------------------------------------------------

-- Publish: create the campaign row and seat its creator as owner, atomically.
create or replace function create_campaign(p jsonb) returns campaigns
language plpgsql security definer set search_path = public as $$
declare c campaigns;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into campaigns (id, name, current_session, concluded, sealing, grid, map)
  values (
    p->>'id',
    coalesce(p->>'name', 'Untitled Campaign'),
    coalesce((p->>'currentSession')::int, 1),
    coalesce((p->>'concluded')::boolean, false),
    coalesce(p->>'sealing', 'open'),
    coalesce(p->'grid', '{"mode":"freeform","size":6,"offsetX":0,"offsetY":0}'::jsonb),
    p->'map'
  ) returning * into c;
  insert into members (campaign_id, user_id, seat) values (c.id, auth.uid(), 'owner');
  return c;
end $$;

-- Join by invite code: membership without a seat; the seat is claimed after,
-- at the same seat-picker the local app already has.
create or replace function join_campaign(code text) returns campaigns
language plpgsql security definer set search_path = public as $$
declare c campaigns;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into c from campaigns where invite_code = code;
  if c.id is null then raise exception 'no campaign for that invite code'; end if;
  insert into members (campaign_id, user_id) values (c.id, auth.uid())
  on conflict (campaign_id, user_id) do nothing;
  return c;
end $$;

-- Fill-state without words: lets every member see WHICH slots are filled (the
-- pin's completeness ring) even when sealing hides the words themselves.
create or replace function testimony_meta(cid text)
returns table (event_id text, player_id text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.event_id, t.player_id, t.updated_at from testimony t
  where t.campaign_id = cid and is_member(cid);
$$;

-- ---------------------------------------------------------------------------
-- Row-level security — authority by layer, enforced at the row
-- ---------------------------------------------------------------------------

alter table campaigns         enable row level security;
alter table members           enable row level security;
alter table players           enable row level security;
alter table events            enable row level security;
alter table testimony         enable row level security;
alter table warbands          enable row level security;
alter table warband_snapshots enable row level security;
alter table pin_proposals     enable row level security;

-- campaigns: members read; only the owner edits canon-shaped campaign facts.
-- (Creation goes through create_campaign(); no direct insert.)
create policy campaigns_select on campaigns for select using (is_member(id));
create policy campaigns_update on campaigns for update
  using (is_owner(id)) with check (is_owner(id));

-- members: the table sees the table; you may (re)claim your own seat, but the
-- owner seat is only ever granted by create_campaign.
create policy members_select on members for select using (is_member(campaign_id));
create policy members_update on members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and seat is distinct from 'owner');

-- players: the roster is canon-adjacent — owner writes it.
create policy players_select on players for select using (is_member(campaign_id));
create policy players_write  on players for all
  using (is_owner(campaign_id)) with check (is_owner(campaign_id));

-- events: hidden pins do not exist for players — the row never leaves the
-- server. All pin writes are owner-only, and only while the campaign is open.
create policy events_select on events for select
  using (is_member(campaign_id) and (not hidden or is_owner(campaign_id)));
create policy events_write on events for all
  using (is_owner(campaign_id) and campaign_open(campaign_id))
  with check (is_owner(campaign_id) and campaign_open(campaign_id));

-- testimony: written only by the seat it belongs to, only into an open slot,
-- only while the campaign runs*. Read: your own words and the owner always;
-- everyone once open or concluded — 'until-conclusion' sealing holds otherwise.
--   *decisions.md leans toward slots staying fillable after conclusion; today
--    this mirrors the app (concluded = read-only). One-line change if settled.
create policy testimony_select on testimony for select
  using (
    is_member(campaign_id) and (
      my_seat(campaign_id) in (player_id, 'owner')
      or exists (select 1 from campaigns c where c.id = campaign_id
                 and (c.sealing = 'open' or c.concluded))
    )
  );
create policy testimony_write on testimony for all
  using (my_seat(campaign_id) = player_id and campaign_open(campaign_id))
  with check (
    my_seat(campaign_id) = player_id
    and campaign_open(campaign_id)
    and exists (select 1 from events e where e.campaign_id = campaign_id
                and e.id = event_id and e.slots ? player_id)
  );

-- warbands: a living document, but only its author's hands touch it.
create policy warbands_select on warbands for select using (is_member(campaign_id));
create policy warbands_write on warbands for all
  using (my_seat(campaign_id) = player_id and campaign_open(campaign_id))
  with check (my_seat(campaign_id) = player_id and campaign_open(campaign_id));
create policy wsnaps_select on warband_snapshots for select using (is_member(campaign_id));
create policy wsnaps_write on warband_snapshots for all
  using (my_seat(campaign_id) = player_id)
  with check (my_seat(campaign_id) = player_id);

-- proposals: a member speaks for their own seat; pending rows are visible to
-- proposer + owner only (the shared map stays free of pre-canon speculation);
-- only the owner decides. Proposers may edit or withdraw while pending.
create policy proposals_select on pin_proposals for select
  using (is_owner(campaign_id) or my_seat(campaign_id) = by_player);
create policy proposals_insert on pin_proposals for insert
  with check (
    my_seat(campaign_id) = by_player
    and status = 'pending'
    and campaign_open(campaign_id)
  );
create policy proposals_update_owner on pin_proposals for update
  using (is_owner(campaign_id)) with check (is_owner(campaign_id));
create policy proposals_update_own on pin_proposals for update
  using (my_seat(campaign_id) = by_player and status = 'pending')
  with check (my_seat(campaign_id) = by_player and status = 'pending');
create policy proposals_delete_own on pin_proposals for delete
  using (is_owner(campaign_id) or (my_seat(campaign_id) = by_player and status = 'pending'));

-- ---------------------------------------------------------------------------
-- Storage: one bucket, maps/<campaign_id>/<image_id> — members read, owner writes.
-- (Wrapped so the schema also applies cleanly to a bare Postgres for testing.)
-- ---------------------------------------------------------------------------

do $storage$ begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name) values ('maps', 'maps')
    on conflict (id) do nothing;
    create policy maps_read on storage.objects for select
      using (bucket_id = 'maps' and is_member(split_part(name, '/', 1)));
    create policy maps_write on storage.objects for all
      using (bucket_id = 'maps' and is_owner(split_part(name, '/', 1)))
      with check (bucket_id = 'maps' and is_owner(split_part(name, '/', 1)));
  end if;
end $storage$;
