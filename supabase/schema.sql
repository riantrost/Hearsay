-- Hearsay — cloud schema for the sync rung.
-- Run this once in your Supabase project's SQL editor (Dashboard → SQL → New query).
-- It is idempotent enough to re-run during setup, but treat it as the source of truth.
--
-- The design principle: the canon/testimony split is enforced HERE, by row-level
-- security, not by the app. The owner owns canon (map, events, reveals); each player
-- owns only their own testimony and warband; the database refuses anything else — even
-- if someone bypasses the UI and calls the API directly. Identity is anonymous auth:
-- every device gets a stable auth.uid() with no email, and a shared join code is how a
-- table member joins a campaign. Fog and sealing are read rules, so hidden pins and
-- sealed testimony never even leave the server.

-- ────────────────────────────────────────────────────────────────────────────
-- Tables
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  owner_id        uuid not null default auth.uid(),
  join_code       text not null unique,
  current_session int  not null default 1,
  concluded       boolean not null default false,
  sealing         text not null default 'open',        -- 'open' | 'until-conclusion'
  grid            jsonb not null default '{"mode":"freeform","size":6,"offsetX":0,"offsetY":0}'::jsonb,
  map             jsonb,                                -- {"w":int,"h":int,"path":"<cid>/map"} | null
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.memberships (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id     uuid not null default auth.uid(),
  role        text not null default 'player',           -- 'owner' | 'player'
  created_at  timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name        text not null,
  color       text not null,
  claimed_by  uuid,                                     -- auth.uid() of the seat holder, or null
  created_at  timestamptz not null default now()
);

create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  name           text not null,
  x              double precision not null,
  y              double precision not null,
  session        int  not null,
  type           text not null default 'other',
  canon          text not null default '',
  slots          jsonb not null default '[]'::jsonb,    -- array of player ids
  hidden         boolean not null default false,        -- staged, withheld from players
  reveal_session int,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.testimony (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  event_id    uuid not null references public.events(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  author_id   uuid not null default auth.uid(),
  text        text not null,
  updated_at  timestamptz not null default now(),
  unique (event_id, player_id)
);

create table if not exists public.warbands (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade unique,
  text        text not null default '',
  snapshots   jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- Security-definer helpers (bypass RLS so policies can ask membership questions
-- without recursive policy evaluation). Locked to a safe search_path.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.is_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.campaign_id = cid and m.user_id = auth.uid());
$$;

create or replace function public.is_owner(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from campaigns c where c.id = cid and c.owner_id = auth.uid());
$$;

create or replace function public.owns_seat(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from players p where p.id = pid and p.claimed_by = auth.uid());
$$;

create or replace function public.campaign_open_or_concluded(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from campaigns c
    where c.id = cid and (c.sealing = 'open' or c.concluded = true)
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- RPCs the client calls (join by code, claim a seat) — atomic + RLS-safe.
-- ────────────────────────────────────────────────────────────────────────────

-- Join a campaign using its shared code: adds the caller as a member. Returns the id.
create or replace function public.join_campaign(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select id into cid from campaigns where join_code = code;
  if cid is null then
    raise exception 'No campaign found for that code';
  end if;
  insert into memberships (campaign_id, user_id, role)
  values (cid, auth.uid(), 'player')
  on conflict (campaign_id, user_id) do nothing;
  return cid;
end;
$$;

-- Claim an unclaimed seat (player) in a campaign the caller has already joined.
-- Taking a seat also ADOPTS any testimony already sitting in it — words written for
-- this seat before its real player arrived (e.g. migrated from a local campaign) become
-- that player's own, editable by them from here on.
create or replace function public.claim_seat(pid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid; holder uuid;
begin
  select campaign_id, claimed_by into cid, holder from players where id = pid;
  if cid is null then raise exception 'No such seat'; end if;
  if not is_member(cid) then raise exception 'Join the campaign first'; end if;
  if holder is not null and holder <> auth.uid() then raise exception 'Seat already taken'; end if;
  update players set claimed_by = auth.uid() where id = pid;
  update testimony set author_id = auth.uid() where player_id = pid;
end;
$$;

-- Publish a whole local campaign to the cloud in one atomic step. The owner can seed
-- other seats' testimony here (which per-row RLS would forbid) because this runs as a
-- security-definer; those entries are adopted by each player when they claim their seat.
-- The client supplies the ids (uuids), so it knows them without a round-trip.
create or replace function public.publish_campaign(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  cid := (payload->>'id')::uuid;

  insert into campaigns (id, name, owner_id, join_code, current_session, concluded, sealing, grid, map)
  values (
    cid,
    payload->>'name',
    auth.uid(),
    payload->>'join_code',
    coalesce((payload->>'current_session')::int, 1),
    coalesce((payload->>'concluded')::boolean, false),
    coalesce(payload->>'sealing', 'open'),
    coalesce(payload->'grid', '{"mode":"freeform","size":6,"offsetX":0,"offsetY":0}'::jsonb),
    payload->'map'
  );

  insert into memberships (campaign_id, user_id, role) values (cid, auth.uid(), 'owner');

  insert into players (id, campaign_id, name, color)
  select (p->>'id')::uuid, cid, p->>'name', p->>'color'
  from jsonb_array_elements(coalesce(payload->'players', '[]'::jsonb)) p;

  insert into events (id, campaign_id, name, x, y, session, type, canon, slots, hidden, reveal_session)
  select (e->>'id')::uuid, cid, e->>'name', (e->>'x')::float8, (e->>'y')::float8,
         (e->>'session')::int, coalesce(e->>'type', 'other'), coalesce(e->>'canon', ''),
         coalesce(e->'slots', '[]'::jsonb), coalesce((e->>'hidden')::boolean, false),
         nullif(e->>'reveal_session', '')::int
  from jsonb_array_elements(coalesce(payload->'events', '[]'::jsonb)) e;

  insert into testimony (id, campaign_id, event_id, player_id, author_id, text)
  select coalesce(t->>'id', gen_random_uuid()::text)::uuid, cid,
         (t->>'event_id')::uuid, (t->>'player_id')::uuid, auth.uid(), t->>'text'
  from jsonb_array_elements(coalesce(payload->'testimony', '[]'::jsonb)) t;

  insert into warbands (id, campaign_id, player_id, text, snapshots)
  select coalesce(w->>'id', gen_random_uuid()::text)::uuid, cid,
         (w->>'player_id')::uuid, coalesce(w->>'text', ''), coalesce(w->'snapshots', '[]'::jsonb)
  from jsonb_array_elements(coalesce(payload->'warbands', '[]'::jsonb)) w;

  return cid;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Row-level security. Enable + policy every table.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.campaigns  enable row level security;
alter table public.memberships enable row level security;
alter table public.players    enable row level security;
alter table public.events     enable row level security;
alter table public.testimony  enable row level security;
alter table public.warbands   enable row level security;

-- campaigns: members read; the owner is the only writer.
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns for select using (is_member(id));
drop policy if exists campaigns_insert on public.campaigns;
create policy campaigns_insert on public.campaigns for insert with check (owner_id = auth.uid());
drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns for update using (is_owner(id)) with check (is_owner(id));
drop policy if exists campaigns_delete on public.campaigns;
create policy campaigns_delete on public.campaigns for delete using (is_owner(id));

-- memberships: you see your own row; the owner sees the roster of members. Direct
-- inserts are owner-only (self-add at creation); players join via join_campaign().
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select
  using (user_id = auth.uid() or is_owner(campaign_id));
drop policy if exists memberships_insert on public.memberships;
create policy memberships_insert on public.memberships for insert with check (is_owner(campaign_id));

-- players (the roster): members read; owner writes names/colors; seats are claimed via
-- claim_seat(). (The claim RPC is security-definer, so no player UPDATE policy needed.)
drop policy if exists players_select on public.players;
create policy players_select on public.players for select using (is_member(campaign_id));
drop policy if exists players_insert on public.players;
create policy players_insert on public.players for insert with check (is_owner(campaign_id));
drop policy if exists players_update on public.players;
create policy players_update on public.players for update using (is_owner(campaign_id)) with check (is_owner(campaign_id));
drop policy if exists players_delete on public.players;
create policy players_delete on public.players for delete using (is_owner(campaign_id));

-- events: the owner owns canon geography. Fog is a READ rule — staged (hidden) events
-- are visible only to the owner until revealed (reveal flips hidden=false).
drop policy if exists events_select on public.events;
create policy events_select on public.events for select
  using (is_member(campaign_id) and (is_owner(campaign_id) or hidden = false));
drop policy if exists events_write on public.events;
create policy events_write on public.events for all
  using (is_owner(campaign_id)) with check (is_owner(campaign_id));

-- testimony: you always read your own; the owner reads all; everyone else reads only
-- when the campaign is open or concluded (sealing). You may write ONLY your own words,
-- and only for a seat you hold.
drop policy if exists testimony_select on public.testimony;
create policy testimony_select on public.testimony for select using (
  is_member(campaign_id) and (
    author_id = auth.uid()
    or is_owner(campaign_id)
    or campaign_open_or_concluded(campaign_id)
  )
);
drop policy if exists testimony_insert on public.testimony;
create policy testimony_insert on public.testimony for insert
  with check (author_id = auth.uid() and owns_seat(player_id) and is_member(campaign_id));
drop policy if exists testimony_update on public.testimony;
create policy testimony_update on public.testimony for update
  using (author_id = auth.uid() and owns_seat(player_id))
  with check (author_id = auth.uid() and owns_seat(player_id));
drop policy if exists testimony_delete on public.testimony;
create policy testimony_delete on public.testimony for delete using (author_id = auth.uid());

-- warbands: members read (they answer "who are you playing?"); only the seat holder writes.
drop policy if exists warbands_select on public.warbands;
create policy warbands_select on public.warbands for select using (is_member(campaign_id));
drop policy if exists warbands_write on public.warbands;
create policy warbands_write on public.warbands for all
  using (owns_seat(player_id)) with check (owns_seat(player_id));

-- ────────────────────────────────────────────────────────────────────────────
-- Realtime: broadcast row changes (RLS still filters what each client receives).
-- ────────────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['campaigns','players','events','testimony','warbands'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- Storage: the map image lives in a private bucket at "<campaign_id>/map".
-- Members read; the owner writes. (Path's first folder segment is the campaign id.)
-- ────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('maps', 'maps', false)
on conflict (id) do nothing;

drop policy if exists maps_read on storage.objects;
create policy maps_read on storage.objects for select
  using (bucket_id = 'maps' and is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists maps_write on storage.objects;
create policy maps_write on storage.objects for insert
  with check (bucket_id = 'maps' and is_owner(((storage.foldername(name))[1])::uuid));

drop policy if exists maps_update on storage.objects;
create policy maps_update on storage.objects for update
  using (bucket_id = 'maps' and is_owner(((storage.foldername(name))[1])::uuid));
