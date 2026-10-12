// Migrations are embedded so they ship inside every serverless bundle.
// Append new entries; never edit one that has been applied to a shared database.
export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "0001_init",
    sql: `
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  restricted_at timestamptz,
  restricted_reason text
);

create table login_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index login_codes_email_idx on login_codes (email, created_at desc);

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);

create table roles (
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('admin', 'moderator')),
  granted_by uuid references users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Community profile. Only what the member chose to show is visible to other members.
create table profiles (
  user_id uuid primary key references users(id) on delete cascade,
  alias text not null,
  birth_date date not null,
  region text not null,
  intent text not null,
  interests text[] not null default '{}',
  bio text not null default '',
  show_age boolean not null default true,
  show_region boolean not null default true,
  listed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Paid access comes only from verified Stripe webhooks.
create table memberships (
  user_id uuid primary key references users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

create table stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

create table blocks (
  blocker_id uuid not null references users(id) on delete cascade,
  blocked_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table channels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  kind text not null check (kind in ('lounge', 'table')),
  sort int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table messages (
  id bigserial primary key,
  channel_id uuid not null references channels(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references users(id) on delete set null
);
create index messages_channel_idx on messages (channel_id, id desc);

create table contact_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references users(id) on delete cascade,
  to_id uuid not null references users(id) on delete cascade,
  message text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_id <> to_id)
);
create unique index contact_requests_open_idx on contact_requests (from_id, to_id) where status = 'pending';

create table threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references users(id) on delete cascade,
  user_b uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create table thread_messages (
  id bigserial primary key,
  thread_id uuid not null references threads(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index thread_messages_thread_idx on thread_messages (thread_id, id desc);

-- An invitation for someone outside Cafe. The bearer token itself is never stored.
create table invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  organizer_id uuid not null references users(id) on delete cascade,
  organizer_name text not null,
  match_name text not null default '',
  origin text not null default '',
  message text not null default '',
  status text not null default 'open' check (status in ('open', 'accepted', 'scheduled', 'declined', 'rejected', 'cancelled')),
  expires_at timestamptz not null,
  guest_id uuid references users(id) on delete set null,
  guest_name text,
  guest_note text,
  chosen_at timestamptz,
  accepted_at timestamptz,
  date_id uuid,
  created_at timestamptz not null default now()
);
create index invites_organizer_idx on invites (organizer_id, created_at desc);

create table invite_moments (
  invite_id uuid not null references invites(id) on delete cascade,
  starts_at timestamptz not null,
  primary key (invite_id, starts_at)
);

create table dates (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('invite', 'community', 'followup')),
  invite_id uuid references invites(id) on delete set null,
  parent_date_id uuid references dates(id) on delete set null,
  organizer_id uuid references users(id) on delete set null,
  proposed_by uuid references users(id) on delete set null,
  scheduled_at timestamptz not null,
  duration_minutes int not null,
  status text not null check (status in ('proposed', 'scheduled', 'live', 'ended', 'cancelled', 'declined', 'no_show', 'failed')),
  started_at timestamptz,
  ends_at timestamptz,
  ended_at timestamptz,
  cancelled_by uuid references users(id) on delete set null,
  credit_status text not null default 'none' check (credit_status in ('none', 'reserved', 'consumed', 'released')),
  credit_period_start timestamptz,
  video_room text,
  video_url text,
  room_closed_at timestamptz,
  presence_checked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((started_at is null) = (ends_at is null))
);
create index dates_organizer_idx on dates (organizer_id, credit_period_start);
create index dates_status_idx on dates (status, scheduled_at);

create table date_participants (
  id uuid primary key default gen_random_uuid(),
  date_id uuid not null references dates(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  role text not null check (role in ('organizer', 'guest', 'member')),
  display_name text not null,
  present_until timestamptz,
  first_joined_at timestamptz,
  unique (date_id, user_id)
);
create index date_participants_user_idx on date_participants (user_id);

-- Confidential: readable by the author and, for aggregate figures, by authorised staff only.
create table feedback (
  date_id uuid not null references dates(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  comfort text not null check (comfort in ('yes', 'somewhat', 'no')),
  helped text not null check (helped in ('yes', 'somewhat', 'no')),
  next text not null check (next in ('meet', 'call', 'no')),
  created_at timestamptz not null default now(),
  primary key (date_id, user_id)
);

-- Each shared contact detail is a separate, recorded consent.
create table contact_shares (
  id uuid primary key default gen_random_uuid(),
  date_id uuid not null references dates(id) on delete cascade,
  from_id uuid not null references users(id) on delete cascade,
  to_id uuid not null references users(id) on delete cascade,
  field text not null,
  value text not null,
  consent_text text not null,
  shared_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create index contact_shares_date_idx on contact_shares (date_id);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references users(id) on delete set null,
  target_id uuid references users(id) on delete set null,
  context text not null check (context in ('message', 'thread_message', 'date', 'profile', 'invite')),
  context_id text not null,
  excerpt text not null default '',
  reason text not null,
  details text not null default '',
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  handled_by uuid references users(id) on delete set null,
  handled_at timestamptz,
  resolution text
);

create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id) on delete set null,
  target_id uuid references users(id) on delete set null,
  action text not null,
  reason text not null,
  report_id uuid references reports(id) on delete set null,
  created_at timestamptz not null default now()
);

create table appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  body text not null,
  status text not null default 'open' check (status in ('open', 'granted', 'rejected')),
  response text,
  handled_by uuid references users(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create table rate_events (
  key text not null,
  created_at timestamptz not null default now()
);
create index rate_events_key_idx on rate_events (key, created_at);

-- Only used when MAIL_TRANSPORT=outbox (tests and closed previews).
create table mail_outbox (
  id bigserial primary key,
  recipient text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now()
);

insert into channels (slug, name, description, kind, sort) values
  ('lounge', 'De lounge', 'Het gezamenlijke gesprek. Schuif aan, zeg hoi.', 'lounge', 0),
  ('randstad', 'Tafel Randstad', 'Voor wie in of rond de Randstad woont.', 'table', 10),
  ('noord-oost', 'Tafel Noord & Oost', 'Groningen tot Twente en alles ertussen.', 'table', 20),
  ('zuid', 'Tafel Zuid', 'Brabant, Limburg, Zeeland en België.', 'table', 30),
  ('buiten', 'Tafel Buiten & sport', 'Wandelen, fietsen, zwemmen, klimmen.', 'table', 40),
  ('cultuur', 'Tafel Cultuur', 'Boeken, films, musea en muziek.', 'table', 50);
`,
  },
  {
    // Only the server talks to the database, as the table owner. On Supabase the public schema is
    // also reachable through its REST API with the public anon key: row level security without
    // policies, plus revoked grants, makes sure nothing is readable that way.
    // Every later migration that adds a table must enable row level security on it too.
    name: "0002_lock_down_public_api",
    sql: `
alter table users enable row level security;
alter table login_codes enable row level security;
alter table sessions enable row level security;
alter table roles enable row level security;
alter table profiles enable row level security;
alter table memberships enable row level security;
alter table stripe_events enable row level security;
alter table blocks enable row level security;
alter table channels enable row level security;
alter table messages enable row level security;
alter table contact_requests enable row level security;
alter table threads enable row level security;
alter table thread_messages enable row level security;
alter table invites enable row level security;
alter table invite_moments enable row level security;
alter table dates enable row level security;
alter table date_participants enable row level security;
alter table feedback enable row level security;
alter table contact_shares enable row level security;
alter table reports enable row level security;
alter table moderation_actions enable row level security;
alter table appeals enable row level security;
alter table rate_events enable row level security;
alter table mail_outbox enable row level security;
alter table schema_migrations enable row level security;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on all tables in schema public from anon, authenticated; revoke all on all sequences in schema public from anon, authenticated; revoke all on all functions in schema public from anon, authenticated; alter default privileges in schema public revoke all on tables from anon, authenticated; alter default privileges in schema public revoke all on sequences from anon, authenticated; alter default privileges in schema public revoke all on functions from anon, authenticated; end if; end $$;
`,
  },
];
