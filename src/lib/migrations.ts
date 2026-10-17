// Migrations are embedded so they ship inside every serverless bundle.
// Append new entries; never edit one that has been applied to a shared database.
// Names carry a "vr_" prefix so they can never be confused with another app's history.

const TABLES = [
  "competitions",
  "seasons",
  "teams",
  "season_teams",
  "matches",
  "match_events",
  "match_lineups",
  "match_lineup_players",
  "match_statistics",
  "standings",
  "ai_analyses",
  "sync_state",
  "sync_runs",
  "provider_usage",
  "rate_events",
  "schema_migrations",
];

export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "vr_0001_core",
    sql: `
do $$ begin if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'memberships') then raise exception 'Deze database bevat tabellen van een andere applicatie (Cafe). Gebruik een aparte database voor Voetbalradar.'; end if; end $$;

-- Every football row belongs to one provider ("sportmonks", or "demo" for the labelled demo
-- environment). Queries always filter on the active provider, so demo rows can never appear
-- next to real data, and a later provider switch starts from a clean slate.

create table competitions (
  id serial primary key,
  provider text not null,
  external_id text not null,
  slug text not null,
  name text not null,
  country text not null,
  country_code text,
  kind text not null check (kind in ('league', 'cup')),
  logo_url text,
  sort_order int not null default 100,
  availability text not null default 'unknown' check (availability in ('unknown', 'available', 'unavailable', 'mismatch', 'error')),
  availability_note text,
  availability_checked_at timestamptz,
  current_season_id int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id),
  unique (provider, slug)
);

create table seasons (
  id serial primary key,
  provider text not null,
  external_id text not null,
  competition_id int not null references competitions(id) on delete cascade,
  name text not null,
  slug text not null,
  start_year int not null,
  starts_on date,
  ends_on date,
  is_current boolean not null default false,
  standings_available boolean,
  standings_synced_at timestamptz,
  standings_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id),
  unique (competition_id, slug)
);
create index seasons_competition_idx on seasons (competition_id, start_year desc);

alter table competitions add constraint competitions_current_season_fk foreign key (current_season_id) references seasons(id) on delete set null;

create table teams (
  id serial primary key,
  provider text not null,
  external_id text not null,
  name text not null,
  short_name text,
  code text,
  slug text not null,
  country text,
  founded int,
  logo_url text,
  venue_name text,
  venue_city text,
  -- "Winner match 3" style entries for knock-out draws that are not decided yet.
  is_placeholder boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index teams_provider_name_idx on teams (provider, lower(name));

create table season_teams (
  season_id int not null references seasons(id) on delete cascade,
  team_id int not null references teams(id) on delete cascade,
  primary key (season_id, team_id)
);
create index season_teams_team_idx on season_teams (team_id);

create table matches (
  id serial primary key,
  provider text not null,
  external_id text not null,
  competition_id int not null references competitions(id) on delete cascade,
  season_id int not null references seasons(id) on delete cascade,
  stage_name text,
  round_name text,
  kickoff_at timestamptz not null,
  status text not null,
  provider_status text,
  minute int,
  minute_extra int,
  home_team_id int not null references teams(id),
  away_team_id int not null references teams(id),
  home_score int,
  away_score int,
  ht_home int,
  ht_away int,
  et_home int,
  et_away int,
  pen_home int,
  pen_away int,
  venue_name text,
  venue_city text,
  referee text,
  core_hash text not null,
  events_hash text,
  lineups_hash text,
  stats_hash text,
  details_synced_at timestamptz,
  synced_at timestamptz not null,
  changed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index matches_provider_kickoff_idx on matches (provider, kickoff_at);
create index matches_season_kickoff_idx on matches (season_id, kickoff_at);
create index matches_home_idx on matches (home_team_id, kickoff_at desc);
create index matches_away_idx on matches (away_team_id, kickoff_at desc);
create index matches_status_idx on matches (provider, status);

-- Detail tables are replaced as a whole per match inside one transaction when the provider's
-- version changes (hash), so a re-run never duplicates events and corrections (VAR) are honoured.
create table match_events (
  match_id int not null references matches(id) on delete cascade,
  seq int not null,
  minute int,
  minute_extra int,
  side text check (side in ('home', 'away')),
  type text not null,
  player_name text,
  player_external_id text,
  related_name text,
  related_external_id text,
  detail text,
  score_after text,
  primary key (match_id, seq)
);

create table match_lineups (
  match_id int not null references matches(id) on delete cascade,
  side text not null check (side in ('home', 'away')),
  formation text,
  coach_name text,
  primary key (match_id, side)
);

create table match_lineup_players (
  match_id int not null references matches(id) on delete cascade,
  side text not null check (side in ('home', 'away')),
  sort int not null,
  is_starter boolean not null,
  player_external_id text,
  name text not null,
  number int,
  position text,
  grid text,
  primary key (match_id, side, sort)
);

-- value null = the source sent the statistic without a value; a missing row = not supplied.
create table match_statistics (
  match_id int not null references matches(id) on delete cascade,
  side text not null check (side in ('home', 'away')),
  key text not null,
  value numeric,
  primary key (match_id, side, key)
);

create table standings (
  season_id int not null references seasons(id) on delete cascade,
  group_name text not null default '',
  team_id int not null references teams(id) on delete cascade,
  rank int not null,
  points int,
  played int,
  won int,
  drawn int,
  lost int,
  goals_for int,
  goals_against int,
  goal_diff int,
  form text,
  description text,
  primary key (season_id, group_name, team_id)
);
create index standings_team_idx on standings (team_id);

create table ai_analyses (
  id serial primary key,
  match_id int not null references matches(id) on delete cascade,
  kind text not null check (kind in ('preview', 'review')),
  input_hash text not null,
  status text not null check (status in ('ok', 'rejected', 'failed')),
  ai_provider text not null,
  model text not null,
  content jsonb,
  note text,
  data_as_of timestamptz not null,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (match_id, kind, input_hash)
);
create index ai_analyses_match_idx on ai_analyses (match_id, kind, created_at desc);
create index ai_analyses_created_idx on ai_analyses (created_at);

-- Scheduling and leases: one row per job scope ("live", "fixtures:eredivisie", ...).
create table sync_state (
  key text primary key,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures int not null default 0,
  next_due_at timestamptz,
  lock_owner text,
  lock_until timestamptz
);

create table sync_runs (
  id bigserial primary key,
  provider text not null,
  job text not null,
  trigger text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('running', 'success', 'failed', 'skipped')),
  requests int not null default 0,
  items int not null default 0,
  message text
);
create index sync_runs_started_idx on sync_runs (started_at desc);
create index sync_runs_job_idx on sync_runs (job, started_at desc);

create table provider_usage (
  provider text not null,
  day date not null,
  requests int not null default 0,
  failures int not null default 0,
  last_status int,
  rate_remaining int,
  updated_at timestamptz not null default now(),
  primary key (provider, day)
);

create table rate_events (
  key text not null,
  created_at timestamptz not null default now()
);
create index rate_events_key_idx on rate_events (key, created_at);
`,
  },
  {
    // Only the server talks to the database. On Supabase, row level security without policies and
    // revoked grants make sure nothing is readable through the public REST API.
    name: "vr_0002_lock_down_public_api",
    sql: `
${TABLES.map((t) => `alter table ${t} enable row level security;`).join("\n")}
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on all tables in schema public from anon, authenticated; revoke all on all sequences in schema public from anon, authenticated; revoke all on all functions in schema public from anon, authenticated; alter default privileges in schema public revoke all on tables from anon, authenticated; alter default privileges in schema public revoke all on sequences from anon, authenticated; alter default privileges in schema public revoke all on functions from anon, authenticated; end if; end $$;
`,
  },
];
