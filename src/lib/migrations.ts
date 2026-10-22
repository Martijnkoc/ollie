// Migrations are embedded so they ship inside every serverless bundle.
// Append new entries; never edit one that has been applied to a shared database.
// Names carry the `sy_` prefix so this app never mistakes another app's schema for its own.
export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "sy_0001_marketplace",
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

-- Uploaded files. A row is 'pending' until the server has checked the stored bytes.
create table media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  purpose text not null check (purpose in ('avatar', 'cover', 'service', 'portfolio')),
  kind text not null check (kind in ('image', 'video')),
  storage_key text not null unique,
  content_type text not null,
  size_bytes bigint not null,
  status text not null default 'pending' check (status in ('pending', 'ready')),
  created_at timestamptz not null default now()
);
create index media_owner_idx on media (owner_id, created_at desc);

-- One profile per account. Buyers have one too (their name in messages and orders); only a published profile is public.
create table profiles (
  user_id uuid primary key references users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$'),
  display_name text not null,
  headline text not null default '',
  bio text not null default '',
  categories text[] not null default '{}',
  skills text[] not null default '{}',
  avatar_id uuid references media(id) on delete set null,
  cover_id uuid references media(id) on delete set null,
  city text not null default '',
  region text,
  works_remote boolean not null default false,
  travel_km int check (travel_km is null or travel_km between 0 and 500),
  availability text not null default 'available' check (availability in ('available', 'limited', 'unavailable')),
  availability_note text not null default '',
  seller_type text not null default 'private' check (seller_type in ('private', 'business')),
  kvk_number text,
  website text,
  published boolean not null default false,
  -- Editorial choice by staff, never paid. Shown as "Uitgelicht door de redactie".
  featured_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_public_idx on profiles (created_at desc) where published and hidden_at is null;

create table services (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('fixed', 'custom')),
  title text not null,
  summary text not null default '',
  description text not null default '',
  category text not null,
  includes text[] not null default '{}',
  price_cents int check (price_cents is null or price_cents > 0),
  delivery_days int check (delivery_days is null or delivery_days between 1 and 365),
  location_mode text not null default 'remote' check (location_mode in ('remote', 'on_site', 'both')),
  cover_id uuid references media(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'published', 'paused')),
  hidden_at timestamptz,
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'custom' or (price_cents is not null and delivery_days is not null))
);
create index services_public_idx on services (created_at desc) where status = 'published' and hidden_at is null;
create index services_owner_idx on services (owner_id, created_at desc);

create table service_extras (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  title text not null,
  price_cents int not null check (price_cents >= 0),
  extra_days int not null default 0 check (extra_days between 0 and 90),
  sort int not null default 0
);
create index service_extras_service_idx on service_extras (service_id, sort);

create table portfolio_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null,
  media_id uuid not null references media(id) on delete cascade,
  published boolean not null default true,
  hidden_at timestamptz,
  hidden_reason text,
  created_at timestamptz not null default now()
);
create index portfolio_public_idx on portfolio_items (created_at desc) where published and hidden_at is null;
create index portfolio_owner_idx on portfolio_items (owner_id, created_at desc);

create table follows (
  follower_id uuid not null references users(id) on delete cascade,
  followee_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on follows (followee_id);

create table favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  service_id uuid references services(id) on delete cascade,
  portfolio_id uuid references portfolio_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((service_id is null) <> (portfolio_id is null))
);
create unique index favorites_service_idx on favorites (user_id, service_id) where service_id is not null;
create unique index favorites_portfolio_idx on favorites (user_id, portfolio_id) where portfolio_id is not null;

-- A seller's Stripe connected account. Its state comes only from verified webhooks or Stripe's own API.
create table payout_accounts (
  user_id uuid primary key references users(id) on delete cascade,
  stripe_account_id text not null unique,
  details_submitted boolean not null default false,
  payouts_enabled boolean not null default false,
  transfers_active boolean not null default false,
  requirements_due text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- An order is the whole life of an assignment: a custom request and its quotes, or a fixed-price order,
-- through payment, delivery and completion. Money amounts are snapshots taken when the buyer agreed.
create table orders (
  id uuid primary key default gen_random_uuid(),
  ref bigint generated always as identity unique,
  kind text not null check (kind in ('fixed', 'custom')),
  buyer_id uuid references users(id) on delete set null,
  seller_id uuid references users(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  title text not null,
  brief text not null default '',
  budget_cents int,
  desired_by date,
  location text not null default '',
  extras jsonb not null default '[]',
  price_cents int,
  delivery_days int,
  fee_bps int,
  fee_cents int,
  seller_amount_cents int,
  status text not null check (status in ('requested', 'quoted', 'awaiting_payment', 'in_progress', 'delivered', 'completed',
    'declined', 'withdrawn', 'cancelled', 'disputed')),
  payment_status text not null default 'none' check (payment_status in ('none', 'paid', 'refund_pending', 'refunded')),
  transfer_status text not null default 'none' check (transfer_status in ('none', 'pending', 'sent', 'failed')),
  terms_accepted_at timestamptz,
  terms_version text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_transfer_id text,
  stripe_refund_id text,
  paid_at timestamptz,
  due_at timestamptz,
  delivered_at timestamptz,
  delivery_note text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references users(id) on delete set null,
  cancel_reason text,
  cancel_requested_by uuid references users(id) on delete set null,
  cancel_requested_at timestamptz,
  disputed_at timestamptz,
  dispute_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id is null or seller_id is null or buyer_id <> seller_id),
  check (price_cents is null or (fee_cents + seller_amount_cents = price_cents))
);
create index orders_buyer_idx on orders (buyer_id, updated_at desc);
create index orders_seller_idx on orders (seller_id, updated_at desc);
create index orders_status_idx on orders (status, updated_at);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  price_cents int not null check (price_cents > 0),
  delivery_days int not null check (delivery_days between 1 and 365),
  message text not null default '',
  valid_until timestamptz not null,
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'withdrawn', 'superseded', 'expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index quotes_open_idx on quotes (order_id) where status = 'open';

-- The timeline of an order, written by the server only. Also the audit trail for complaints.
create table order_events (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  kind text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index order_events_order_idx on order_events (order_id, id);

-- Only possible after a completed order, one per order, by the buyer.
create table reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  author_id uuid references users(id) on delete set null,
  seller_id uuid not null references users(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  body text not null,
  reply text,
  replied_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text,
  created_at timestamptz not null default now()
);
create index reviews_seller_idx on reviews (seller_id, created_at desc);

create table blocks (
  blocker_id uuid not null references users(id) on delete cascade,
  blocked_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references users(id) on delete cascade,
  user_b uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  check (user_a < user_b),
  unique (user_a, user_b)
);

create table thread_messages (
  id bigserial primary key,
  thread_id uuid not null references threads(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  body text not null,
  order_id uuid references orders(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index thread_messages_thread_idx on thread_messages (thread_id, id desc);

create table thread_reads (
  thread_id uuid not null references threads(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  last_read_id bigint not null default 0,
  primary key (thread_id, user_id)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references users(id) on delete set null,
  target_id uuid references users(id) on delete set null,
  context text not null check (context in ('profile', 'service', 'portfolio', 'review', 'message', 'order')),
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
create index reports_status_idx on reports (status, created_at desc);

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

create table stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
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
`,
  },
  {
    // Only the server talks to the database, as the table owner. On Supabase the public schema is also
    // reachable through its REST API with the public anon key: row level security without policies plus
    // revoked grants makes sure nothing is readable or writable that way. Authorisation lives in src/lib.
    // Every later migration that adds a table must enable row level security on it too (a test checks this).
    name: "sy_0002_lock_down_public_api",
    sql: `
do $$ declare t record; begin for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table public.%I enable row level security', t.tablename); end loop; end $$;
do $$ begin if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on all tables in schema public from anon, authenticated; revoke all on all sequences in schema public from anon, authenticated; revoke all on all functions in schema public from anon, authenticated; alter default privileges in schema public revoke all on tables from anon, authenticated; alter default privileges in schema public revoke all on sequences from anon, authenticated; alter default privileges in schema public revoke all on functions from anon, authenticated; end if; end $$;
`,
  },
];
