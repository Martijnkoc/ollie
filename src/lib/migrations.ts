// Migrations are embedded so they ship inside every serverless bundle.
// Append new entries; never edit one that has been applied.
export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "0001_init",
    sql: `
create table members (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  email text not null unique,
  birth_date date not null,
  gender text not null,
  looking_for text[] not null,
  age_min int not null,
  age_max int not null,
  region text not null,
  intent text not null,
  about text not null default '',
  slots text[] not null default '{}',
  visible boolean not null default true,
  source text not null default 'direct',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every e-mail we send a member carries its own personal link; all stay valid.
create table member_links (
  token_hash text primary key,
  member_id uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table member_blocks (
  member_id uuid not null references members(id) on delete cascade,
  blocked_member_id uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, blocked_member_id)
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_token text not null unique,
  host_name text not null,
  host_email text not null,
  match_name text not null default '',
  message text not null default '',
  status text not null default 'open' check (status in ('open', 'alternative', 'scheduled', 'cancelled')),
  alt_starts_at timestamptz,
  alt_guest_name text,
  alt_guest_email text,
  alt_guest_token text,
  date_id uuid,
  created_at timestamptz not null default now()
);
create index invites_host_email_idx on invites (host_email, created_at);

create table invite_moments (
  invite_id uuid not null references invites(id) on delete cascade,
  starts_at timestamptz not null,
  primary key (invite_id, starts_at)
);

create table evenings (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  slot text not null,
  starts_at timestamptz not null,
  status text not null default 'planned' check (status in ('planned', 'open', 'closed')),
  created_at timestamptz not null default now()
);

create table proposals (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid not null references evenings(id) on delete cascade,
  member_a uuid not null references members(id) on delete cascade,
  member_b uuid not null references members(id) on delete cascade,
  response_a text not null default 'pending' check (response_a in ('pending', 'accepted', 'declined')),
  response_b text not null default 'pending' check (response_b in ('pending', 'accepted', 'declined')),
  date_id uuid,
  created_at timestamptz not null default now(),
  check (member_a <> member_b)
);
create unique index proposals_pair_evening_idx on proposals (evening_id, least(member_a, member_b), greatest(member_a, member_b));

create table dates (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('invite', 'community')),
  invite_id uuid references invites(id) on delete set null,
  proposal_id uuid references proposals(id) on delete set null,
  starts_at timestamptz not null,
  duration_minutes int not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  video_room text,
  video_url text,
  created_at timestamptz not null default now()
);

create table participants (
  id uuid primary key default gen_random_uuid(),
  date_id uuid not null references dates(id) on delete cascade,
  role text not null check (role in ('host', 'guest', 'member')),
  token text not null unique,
  first_name text not null,
  email text,
  member_id uuid references members(id) on delete set null,
  joined_at timestamptz,
  decision text check (decision in ('yes', 'no')),
  decided_at timestamptz,
  helped text check (helped in ('yes', 'somewhat', 'no')),
  contact text,
  contact_shared_at timestamptz,
  cancelled_at timestamptz,
  blocked_at timestamptz,
  created_at timestamptz not null default now()
);
create index participants_date_idx on participants (date_id);
create index participants_member_idx on participants (member_id);

create table reports (
  id uuid primary key default gen_random_uuid(),
  date_id uuid not null references dates(id) on delete cascade,
  reporter_id uuid not null references participants(id) on delete cascade,
  reported_id uuid not null references participants(id) on delete cascade,
  reason text not null,
  details text not null default '',
  status text not null default 'open' check (status in ('open', 'handled')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create table cafe_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  first_name text not null,
  region text not null,
  created_at timestamptz not null default now()
);
`,
  },
];
