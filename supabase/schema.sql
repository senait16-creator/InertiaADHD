-- InertiaADHD — Version 1 schema
-- Run this in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/moiorcyltstlrhwxxuzk/sql/new

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  description text,
  status text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Optional soft color tag for the icon container. Small fixed palette
-- ('sage' | 'green' | 'blue' | 'amber' | 'lavender'), enforced in the app,
-- not with a DB constraint, so this stays a single safe-to-rerun statement.
alter table public.projects add column if not exists color text;

-- Distinguishes how `icon` should be rendered: 'lucide' means `icon` holds
-- a Lucide icon name (see js/lucideIcons.js); anything else (including the
-- existing null rows from before this column existed) is treated as a raw
-- emoji/text glyph. Deliberately no default, so projects created before
-- the icon picker existed keep rendering their original emoji untouched.
alter table public.projects add column if not exists icon_type text;

-- Which internal workspace opens when a project is tapped. Null/anything
-- unrecognized falls back to the plain placeholder page; 'routine' opens
-- the visual routine board (see js/routineBoard.js and routine_steps
-- below). Deliberately no default, and no UI to set it yet — see
-- supabase/seed_morning_routine.sql for how a project gets flagged.
alter table public.projects add column if not exists workspace_type text;

create index if not exists projects_user_sort_idx
  on public.projects (user_id, sort_order, created_at);

-- Keep updated_at current on every edit.
create or replace function public.set_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
  before update on public.projects
  for each row
  execute function public.set_projects_updated_at();

-- Row Level Security: each user can only see and change their own projects.
alter table public.projects enable row level security;

drop policy if exists "Users can view their own projects" on public.projects;
create policy "Users can view their own projects"
  on public.projects for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own projects" on public.projects;
create policy "Users can insert their own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own projects" on public.projects;
create policy "Users can update their own projects"
  on public.projects for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own projects" on public.projects;
create policy "Users can delete their own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Steps for a 'routine' workspace_type project (see js/routineBoard.js).
-- One flat list per project: icon-forward, drag-reorderable, with an
-- "active" (current step) flag and a not-done/done status (see the
-- `status` column added below, which resets to not-done automatically
-- each day) — deliberately no due dates, priorities, streaks, or other
-- tracking metadata.
create table if not exists public.routine_steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null,
  color text,
  sort_order integer not null default 0,
  active boolean not null default false,
  complete boolean not null default false,
  link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Optional URL. When set, tapping the step opens it (in a new tab) instead
-- of only focusing it. Added separately for databases where routine_steps
-- already existed before this column did.
alter table public.routine_steps add column if not exists link text;

-- Replaces the old `complete` boolean with a status column: null (not
-- done) or 'complete' (done), toggled by double-tapping a step, and reset
-- back to null automatically the next day (see js/routineBoard.js).
-- `complete` is left in place unused rather than dropped (this file only
-- ever adds columns), and existing true values are carried over below so
-- nothing already marked done reverts to not-done.
alter table public.routine_steps add column if not exists status text;

update public.routine_steps
set status = 'complete'
where complete = true and status is null;

create index if not exists routine_steps_project_sort_idx
  on public.routine_steps (project_id, sort_order);

create or replace function public.set_routine_steps_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_routine_steps_updated_at on public.routine_steps;
create trigger set_routine_steps_updated_at
  before update on public.routine_steps
  for each row
  execute function public.set_routine_steps_updated_at();

alter table public.routine_steps enable row level security;

drop policy if exists "Users can view their own routine steps" on public.routine_steps;
create policy "Users can view their own routine steps"
  on public.routine_steps for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own routine steps" on public.routine_steps;
create policy "Users can insert their own routine steps"
  on public.routine_steps for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own routine steps" on public.routine_steps;
create policy "Users can update their own routine steps"
  on public.routine_steps for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own routine steps" on public.routine_steps;
create policy "Users can delete their own routine steps"
  on public.routine_steps for delete
  using (auth.uid() = user_id);

-- Maintenance category boards (see js/category.js). Each row is one piece
-- of content in one of a category's four sections (care/learn/products/
-- what_i_know). Categories themselves (Hair, Skin, ...) are a fixed list
-- defined in js/maintenanceAreas.js, not user-created rows, so there's no
-- separate categories table — just a `category` key here. Deliberately no
-- scheduling, streak, or history fields: Maintenance is a reference list
-- the user edits directly, not a tracker.
create table if not exists public.maintenance_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  section text not null,
  title text not null,
  body text,
  url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_items_user_cat_section_idx
  on public.maintenance_items (user_id, category, section, sort_order);

create or replace function public.set_maintenance_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_maintenance_items_updated_at on public.maintenance_items;
create trigger set_maintenance_items_updated_at
  before update on public.maintenance_items
  for each row
  execute function public.set_maintenance_items_updated_at();

alter table public.maintenance_items enable row level security;

drop policy if exists "Users can view their own maintenance items" on public.maintenance_items;
create policy "Users can view their own maintenance items"
  on public.maintenance_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own maintenance items" on public.maintenance_items;
create policy "Users can insert their own maintenance items"
  on public.maintenance_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own maintenance items" on public.maintenance_items;
create policy "Users can update their own maintenance items"
  on public.maintenance_items for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own maintenance items" on public.maintenance_items;
create policy "Users can delete their own maintenance items"
  on public.maintenance_items for delete
  using (auth.uid() = user_id);

-- Navigation-hub workspace (see js/navBoard.js): a project with
-- workspace_type = 'nav' shows a tree of folder/link panels instead of
-- the plain placeholder. A 'folder' item opens another screen of panels
-- (client-side, no page reload); a 'link' item opens an external URL in
-- a new tab. Nesting is via parent_id (null = the project's root level).
-- Deliberately no task lists, notes, or progress tracking — pure
-- navigation, same spirit as the routine board and Maintenance boards.
create table if not exists public.nav_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.nav_items(id) on delete cascade,
  kind text not null,
  title text not null,
  icon text,
  color text,
  url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nav_items_project_parent_sort_idx
  on public.nav_items (project_id, parent_id, sort_order);

create or replace function public.set_nav_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_nav_items_updated_at on public.nav_items;
create trigger set_nav_items_updated_at
  before update on public.nav_items
  for each row
  execute function public.set_nav_items_updated_at();

alter table public.nav_items enable row level security;

drop policy if exists "Users can view their own nav items" on public.nav_items;
create policy "Users can view their own nav items"
  on public.nav_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own nav items" on public.nav_items;
create policy "Users can insert their own nav items"
  on public.nav_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own nav items" on public.nav_items;
create policy "Users can update their own nav items"
  on public.nav_items for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own nav items" on public.nav_items;
create policy "Users can delete their own nav items"
  on public.nav_items for delete
  using (auth.uid() = user_id);
