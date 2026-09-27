-- Wink: profiles, shelves and reading sessions, one row per client-generated uuid.
--
-- Dashboard steps (once per Supabase project):
--   1. SQL editor: run this file (or `supabase db push` with the CLI).
--   2. Authentication > Sign In / Providers: enable Email (magic link and password) and Google
--      (paste the OAuth client id and secret from Google Cloud; add the Supabase callback URL shown there to the Google client).
--   3. Authentication > URL Configuration: set Site URL to the deployed app, e.g. https://<user>.github.io/<repo>/,
--      and add wildcard entries to Redirect URLs: https://<you>.github.io/<repo>/** and http://localhost:5173/**
--      (sign-in links carry ?code= and Wink's own ?setup= / &age= flags, so exact-match entries fail).
--   4. Project Settings > API: copy the Project URL and the anon public key into .env.local
--      as VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).

create table public.profiles (
  id uuid primary key,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  age_band text not null check (age_band in ('child', 'teen', 'adult')),
  parent_profile_id uuid references public.profiles (id) on delete cascade,
  goal jsonb not null check (goal ->> 'unit' in ('minutes', 'pages') and jsonb_typeof(goal -> 'amount') = 'number'),
  parent_pin_hash text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now()
);

create table public.shelf_items (
  id uuid primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  ol_work_key text,
  title text not null check (char_length(title) between 1 and 500),
  authors text[] not null default '{}',
  cover_id integer,
  genre text not null check (genre in ('fiction', 'mystery', 'thriller', 'romance', 'fantasy', 'biography', 'nonfiction', 'young', 'unclassified')),
  format text not null check (format in ('physical', 'ebook', 'audiobook')),
  length integer not null check (length > 0),
  position integer not null check (position >= 0),
  status text not null check (status in ('reading', 'finished', 'want', 'dnf')),
  rating numeric(2, 1) check (rating between 0.5 and 5 and rating * 2 = floor(rating * 2)),
  started_at timestamptz not null,
  finished_at timestamptz,
  last_read_at timestamptz,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  check (position <= length)
);

create table public.sessions (
  id uuid primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  shelf_item_id uuid not null references public.shelf_items (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  start_position integer not null check (start_position >= 0),
  end_position integer check (end_position >= 0),
  check_ins_enabled boolean not null default true,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  check (ended_at >= started_at)
);

-- Clients pull by synced_at (server clock) so offline edits that arrive late are still seen by other devices.
create index profiles_owner_synced on public.profiles (owner_user_id, synced_at);
create index shelf_items_profile_synced on public.shelf_items (profile_id, synced_at);
create index sessions_profile_synced on public.sessions (profile_id, synced_at);

-- Last write wins: an older offline edit that reaches the server late never overwrites a newer row.
create function public.wink_stamp() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.synced_at := now();
  return new;
end;
$$;

create trigger profiles_stamp before insert or update on public.profiles
  for each row execute function public.wink_stamp();
create trigger shelf_items_stamp before insert or update on public.shelf_items
  for each row execute function public.wink_stamp();
create trigger sessions_stamp before insert or update on public.sessions
  for each row execute function public.wink_stamp();

alter table public.profiles enable row level security;
alter table public.shelf_items enable row level security;
alter table public.sessions enable row level security;

-- Explicit, for projects that don't expose new tables to the API automatically. RLS below still limits every row.
grant select, insert, update, delete on public.profiles, public.shelf_items, public.sessions to authenticated;

create policy "Readers manage their own profiles" on public.profiles
  for all to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create policy "Readers manage their own shelves" on public.shelf_items
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = shelf_items.profile_id and p.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.profiles p where p.id = shelf_items.profile_id and p.owner_user_id = (select auth.uid())));

create policy "Readers manage their own sessions" on public.sessions
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = sessions.profile_id and p.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.profiles p where p.id = sessions.profile_id and p.owner_user_id = (select auth.uid())));
