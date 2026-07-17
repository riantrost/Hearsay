-- RLS scenario suite for supabase/schema.sql, run against bare Postgres with
-- rls-harness.sql applied first. Each numbered assert is a product rule from
-- docs/decisions.md. Any failure raises and aborts the script (psql exits 3
-- with ON_ERROR_STOP), so a clean exit means every assertion held.

\set ON_ERROR_STOP on

-- Supabase-equivalent grants (dashboard projects ship with these).
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Three devices at the table + one outsider.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),  -- GM's phone
  ('00000000-0000-0000-0000-00000000000b'),  -- Ana's phone
  ('00000000-0000-0000-0000-00000000000c'),  -- Bob's phone
  ('00000000-0000-0000-0000-00000000000d');  -- a stranger who got the URL

create or replace function be(who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case who
      when 'gm'       then '{"sub":"00000000-0000-0000-0000-00000000000a"}'
      when 'ana'      then '{"sub":"00000000-0000-0000-0000-00000000000b"}'
      when 'bob'      then '{"sub":"00000000-0000-0000-0000-00000000000c"}'
      when 'stranger' then '{"sub":"00000000-0000-0000-0000-00000000000d"}'
      else ''
    end, true);
end $$;

-- Expect a statement to be denied (RLS or RPC guard). Returns true when it was.
create or replace function denied(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;

do $suite$
declare
  code text;
  n int;
  t text;
begin
  set local role authenticated;

  -- ---- publish + join -------------------------------------------------------
  perform be('gm');
  perform create_campaign('{"id":"c_test","name":"Frostgrave"}'::jsonb);
  select invite_code into code from campaigns where id = 'c_test';
  assert code is not null, '1. creator can read back the campaign (owner membership landed)';

  insert into players (campaign_id, id, name, color) values
    ('c_test', 'p_ana', 'Ana', '#e0524b'),
    ('c_test', 'p_bob', 'Bob', '#3f8cd6');

  perform be('stranger');
  select count(*) into n from campaigns;
  assert n = 0, '2. a non-member sees no campaigns at all';
  assert denied('select join_campaign(''wrong-code'')'),
    '3. joining needs a real invite code';

  perform be('ana');  perform join_campaign(code);
  perform be('bob');  perform join_campaign(code);
  update members set seat = 'p_bob' where campaign_id = 'c_test'
    and user_id = auth.uid();
  perform be('ana');
  update members set seat = 'p_ana' where campaign_id = 'c_test'
    and user_id = auth.uid();
  select count(*) into n from campaigns where id = 'c_test';
  assert n = 1, '4. a joined member reads the campaign';
  assert denied('update members set seat = ''owner'' where campaign_id = ''c_test'' and user_id = auth.uid()'),
    '5. the owner seat cannot be claimed, only granted at creation';

  -- ---- canon is owner-only; hidden pins never leave the server ---------------
  assert denied('insert into events (campaign_id, id, name, x, y, session) values (''c_test'', ''e_bad'', ''forged'', 0.1, 0.1, 1)'),
    '6. a player cannot mint canon (event insert denied)';

  perform be('gm');
  insert into events (campaign_id, id, name, x, y, session, slots) values
    ('c_test', 'e_open',   'The Gate',     0.4, 0.4, 1, '["p_ana","p_bob"]'),
    ('c_test', 'e_secret', 'Buried vault', 0.6, 0.6, 1, '["p_ana"]');
  update events set hidden = true where id = 'e_secret' and campaign_id = 'c_test';

  select count(*) into n from events where campaign_id = 'c_test';
  assert n = 2, '7. the owner sees staged pins';
  perform be('ana');
  select count(*) into n from events where campaign_id = 'c_test';
  assert n = 1, '8. a hidden pin does not exist for players — the row never arrives';

  -- ---- testimony: author-only, slot-gated -------------------------------------
  insert into testimony (campaign_id, event_id, player_id, text) values
    ('c_test', 'e_open', 'p_ana', 'We held the gate alone.');
  assert denied('insert into testimony (campaign_id, event_id, player_id, text) values (''c_test'', ''e_open'', ''p_bob'', ''forged words'')'),
    '9. you cannot write testimony as another seat';
  perform be('bob');
  -- RLS denies updates by invisibility (0 rows), so tamper attempts are checked
  -- by reading the words back unchanged, not by expecting an error.
  update testimony set text = 'rewritten by bob' where campaign_id = 'c_test' and player_id = 'p_ana';
  assert denied('insert into testimony (campaign_id, event_id, player_id, text) values (''c_test'', ''e_secret'', ''p_bob'', ''sneaky'')'),
    '10. no testimony into an event without your open slot';
  perform be('gm');
  update testimony set text = 'GM improved this' where campaign_id = 'c_test' and player_id = 'p_ana';
  select text into t from testimony where campaign_id = 'c_test' and player_id = 'p_ana';
  assert t = 'We held the gate alone.',
    '9b/11. neither another player nor the owner can edit Ana''s words — authority by layer';
  select count(*) into n from testimony where campaign_id = 'c_test';
  assert n = 1, '12. the owner reads all testimony';

  -- ---- sealing ----------------------------------------------------------------
  update campaigns set sealing = 'until-conclusion' where id = 'c_test';
  perform be('bob');
  select count(*) into n from testimony where campaign_id = 'c_test';
  assert n = 0, '13. sealed: another player cannot read Ana''s words';
  select count(*) into n from testimony_meta('c_test');
  assert n = 1, '14. sealed: fill-state (that Ana wrote) stays visible via meta';
  perform be('ana');
  select count(*) into n from testimony where campaign_id = 'c_test';
  assert n = 1, '15. sealed: your own words remain yours to read';
  perform be('gm');
  update campaigns set concluded = true where id = 'c_test';
  perform be('bob');
  select count(*) into n from testimony where campaign_id = 'c_test';
  assert n = 1, '16. conclusion unseals: plural memory at full strength';

  -- ---- conclusion is a read-only archive ---------------------------------------
  assert denied('insert into testimony (campaign_id, event_id, player_id, text) values (''c_test'', ''e_open'', ''p_bob'', ''late words'')'),
    '17. concluded campaign refuses new testimony (mirrors the app today)';
  perform be('gm');
  assert denied('insert into events (campaign_id, id, name, x, y, session) values (''c_test'', ''e_late'', ''late pin'', 0.2, 0.2, 9)'),
    '18. concluded campaign refuses new canon, even from the owner';
  update campaigns set concluded = false where id = 'c_test';  -- reopen (owner act)

  -- ---- proposals: separate axis, proposer+owner only, owner decides ------------
  perform be('ana');
  insert into pin_proposals (campaign_id, id, by_player, x, y, session, name, note)
    values ('c_test', 'pr_1', 'p_ana', 0.7, 0.2, 2, 'Something moved here', 'saw it from the tower');
  assert denied('insert into pin_proposals (campaign_id, id, by_player, x, y, session, status) values (''c_test'', ''pr_2'', ''p_ana'', 0.1, 0.1, 2, ''accepted'')'),
    '19. a proposal is born pending — a player cannot pre-accept';
  assert denied('update pin_proposals set status = ''accepted'' where id = ''pr_1'' and campaign_id = ''c_test'''),
    '20. only the owner decides a proposal';
  perform be('bob');
  select count(*) into n from pin_proposals where campaign_id = 'c_test';
  assert n = 0, '21. pending proposals are proposer+owner only — no pre-canon speculation on the shared map';
  perform be('gm');
  select count(*) into n from pin_proposals where campaign_id = 'c_test';
  assert n = 1, '22. the owner sees pending proposals';
  update pin_proposals set status = 'accepted', decided_at = now()
    where campaign_id = 'c_test' and id = 'pr_1';
  insert into events (campaign_id, id, name, x, y, session, proposed_by, slots)
    values ('c_test', 'e_adopt', 'Something moved here', 0.7, 0.2, 2, 'p_ana', '["p_ana","p_bob"]');
  select proposed_by into t from events where id = 'e_adopt' and campaign_id = 'c_test';
  assert t = 'p_ana', '23. adopted pin carries proposer provenance';

  -- ---- warbands: living doc, author-only ---------------------------------------
  perform be('ana');
  insert into warbands (campaign_id, player_id, current) values ('c_test', 'p_ana', 'Rangifer, plus two thugs.');
  insert into warband_snapshots (campaign_id, player_id, session, text) values ('c_test', 'p_ana', 1, '');
  perform be('bob');
  update warbands set current = 'vandalized by bob' where campaign_id = 'c_test' and player_id = 'p_ana';
  select count(*) into n from warbands where campaign_id = 'c_test';
  assert n = 1, '25. warbands are readable across the table';
  select "current" into t from warbands where campaign_id = 'c_test' and player_id = 'p_ana';
  assert t = 'Rangifer, plus two thugs.',
    '24. you cannot write another player''s warband';

  -- ---- the outside world -------------------------------------------------------
  perform be('stranger');
  select count(*) into n from events;   assert n = 0, '26. outsider: no events';
  select count(*) into n from testimony; assert n = 0, '26b. outsider: no testimony';
  perform be('');  -- no JWT at all (anon key only)
  set local role anon;
  select count(*) into n from campaigns; assert n = 0, '27. unauthenticated sees nothing';

  raise notice 'ALL RLS ASSERTIONS PASSED';
end $suite$;
