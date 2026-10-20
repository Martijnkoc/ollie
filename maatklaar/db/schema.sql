-- MaatKlaar database: one login role that only reaches its own schema.
--
-- Run once as an admin (Supabase: the SQL editor as `postgres`). It is safe to run again.
-- The app creates its tables itself on first use (src/lib/payments/store.ts, src/lib/transfer/store.ts);
-- the role owns them, so row level security without policies keeps every other role out, including the
-- Supabase API roles (anon, authenticated), which also get no access to the schema.
--
-- Then give the role a password, once, yourself (it never goes into Git or a chat):
--   alter role maatklaar_app password '<a long random password>';
-- and set DATABASE_URL in the hosting environment (Supabase transaction pooler, port 6543; copy the host from
-- "Connect" in the Supabase dashboard):
--   postgres://maatklaar_app.<project-ref>:<password>@<pooler-host>:6543/postgres

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'maatklaar_app') then
    create role maatklaar_app login noinherit nocreatedb nocreaterole nobypassrls connection limit 20;
  end if;
end
$$;

alter role maatklaar_app set search_path = maatklaar;
alter role maatklaar_app set statement_timeout = '10s';

create schema if not exists maatklaar;
revoke all on schema maatklaar from public;
grant usage, create on schema maatklaar to maatklaar_app;
