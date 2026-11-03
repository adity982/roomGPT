create role roomgpt_runtime nologin nosuperuser nocreatedb nocreaterole noinherit;
create schema roomgpt_private;
revoke all on schema roomgpt_private from public, anon, authenticated;
grant usage on schema roomgpt_private to roomgpt_runtime;

create table roomgpt_private.accounts (
  id text primary key,
  email text not null unique,
  payload jsonb not null
);
create table roomgpt_private.sessions (
  id text primary key,
  user_id text not null references roomgpt_private.accounts(id) on delete cascade,
  expires_at bigint not null,
  payload jsonb not null
);
create index sessions_user_idx on roomgpt_private.sessions(user_id);
create index sessions_expiry_idx on roomgpt_private.sessions(expires_at);
create table roomgpt_private.projects (
  id text primary key,
  owner_id text not null references roomgpt_private.accounts(id) on delete cascade,
  payload jsonb not null
);
create index projects_owner_idx on roomgpt_private.projects(owner_id);
create table roomgpt_private.rate_state (
  id integer primary key check (id = 1),
  payload jsonb not null default '[]'::jsonb
);
insert into roomgpt_private.rate_state(id) values (1);
create table roomgpt_private.media (
  id text primary key,
  bytes bytea not null,
  created_at timestamptz not null default now(),
  check (octet_length(bytes) <= 3145728)
);

-- Only the trusted application server role can access this unexposed schema.
alter table roomgpt_private.accounts enable row level security;
alter table roomgpt_private.sessions enable row level security;
alter table roomgpt_private.projects enable row level security;
alter table roomgpt_private.rate_state enable row level security;
alter table roomgpt_private.media enable row level security;
create policy runtime_accounts on roomgpt_private.accounts to roomgpt_runtime using (true) with check (true);
create policy runtime_sessions on roomgpt_private.sessions to roomgpt_runtime using (true) with check (true);
create policy runtime_projects on roomgpt_private.projects to roomgpt_runtime using (true) with check (true);
create policy runtime_rate_state on roomgpt_private.rate_state to roomgpt_runtime using (true) with check (true);
create policy runtime_media on roomgpt_private.media to roomgpt_runtime using (true) with check (true);
grant select, insert, update, delete on all tables in schema roomgpt_private to roomgpt_runtime;

-- Operator-only credential rotation; the password never appears in migration history.
create function roomgpt_private.set_runtime_password(value text) returns void
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if length(value) < 48 then raise exception 'Use a long generated password'; end if;
  execute format('alter role roomgpt_runtime login password %L', value);
end;
$$;
revoke all on function roomgpt_private.set_runtime_password(text) from public, anon, authenticated, roomgpt_runtime;
