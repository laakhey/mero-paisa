-- Mero Paisa — Supabase schema.
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- Safe to re-run: every statement is idempotent.
--
-- Design notes
--   * Rows are keyed by the client-generated `uid`, so devices can create
--     records offline without colliding.
--   * Deletes are soft (`deleted_at`) so other devices learn about them.
--   * `server_updated_at` is set by the server on every write and is the
--     cursor devices pull by; `modified_at` is the device's edit time and
--     decides which edit wins.
--   * References between tables are plain uids without foreign keys: devices
--     upload table by table, and a strict order would make sync fragile.
--   * Row-level security restricts every row to the user who owns it.

create table if not exists public.accounts (
  uid uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  type text not null,
  icon text not null,
  color text not null,
  opening_balance bigint not null default 0,
  archived boolean not null default false,
  modified_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  uid uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  kind text not null,
  icon text not null,
  color text not null,
  archived boolean not null default false,
  sort_order integer not null default 0,
  priority text check (priority in ('need', 'want', 'savings')),
  modified_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
-- Added after release: brings existing projects up to date when this file is re-run.
alter table public.categories add column if not exists priority text;
alter table public.categories drop constraint if exists categories_priority_check;
alter table public.categories add constraint categories_priority_check
  check (priority in ('need', 'want', 'savings'));

create table if not exists public.labels (
  uid uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  color text not null,
  modified_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  uid uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null,
  amount bigint not null check (amount > 0),
  account_uid uuid not null,
  to_account_uid uuid,
  category_uid uuid,
  label_uids uuid[] not null default '{}',
  note text not null default '',
  occurred_on date not null,
  modified_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.budgets (
  uid uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_uid uuid not null,
  amount bigint not null check (amount > 0),
  modified_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

-- Split bills. Members are plain names (they need no account); each bill
-- carries its shares as JSON: [{"member_uid": "...", "amount": 1000, "weight": null}].
create table if not exists public.split_groups (
  uid uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  color text not null,
  archived boolean not null default false,
  modified_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.split_members (
  uid uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_uid uuid not null,
  name text not null,
  is_me boolean not null default false,
  modified_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.split_expenses (
  uid uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_uid uuid not null,
  kind text not null,
  description text not null default '',
  amount bigint not null check (amount > 0),
  paid_by_uid uuid not null,
  occurred_on date not null,
  split_method text not null default 'equal',
  transaction_uid uuid,
  shares jsonb not null default '[]',
  modified_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

-- One row per user for settings that must agree across devices.
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  currency text not null,
  modified_at timestamptz not null
);

create or replace function public.touch_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'labels', 'transactions', 'budgets',
                           'split_groups', 'split_members', 'split_expenses'] loop
    execute format('drop trigger if exists touch_server_updated_at on public.%I', t);
    execute format(
      'create trigger touch_server_updated_at before insert or update on public.%I
       for each row execute function public.touch_server_updated_at()', t);
    execute format(
      'create index if not exists %I on public.%I (user_id, server_updated_at)', t || '_pull_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
       using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Lets a signed-in user delete their own account, as app stores require.
-- Removing the auth user also removes all of their rows (on delete cascade).
-- `security definer` runs it with the owner's rights, because users cannot
-- touch auth.users directly; it only ever deletes the caller's own account.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
