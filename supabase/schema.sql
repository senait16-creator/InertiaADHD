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

-- Unused by the app — an early version of project status lived here as
-- a standalone pill; that idea was replaced by a 'status' kind nav_item
-- (see below), so a project's status is now just one of its own panels
-- instead of a separate column. Left in place rather than dropped (this
-- file only ever adds columns).
alter table public.projects add column if not exists state text;

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

-- When a step turns in progress (yellow) or complete (green), the tap
-- that caused it stamps the matching column here — see advanceState in
-- js/routineBoard.js. Lets a completed step show how long it took (the
-- gap between the two), and both get cleared when a step resets back to
-- not-done (a fourth tap, or the next day's automatic reset). Only
-- stamped at all when the step opts into it — see track_duration below.
alter table public.routine_steps add column if not exists in_progress_at timestamptz;
alter table public.routine_steps add column if not exists completed_at timestamptz;

-- Per-step opt-in for the timestamps above, toggled from the "Edit
-- Routine Item" modal (long-press a step). Off by default — most steps
-- don't need a timer, so a step has to ask for one rather than every
-- step tracking duration automatically.
alter table public.routine_steps add column if not exists track_duration boolean not null default false;

-- Optional free-text line shown under a step's title (e.g. which book
-- an Audiobook step is on right now). Also set from the long-press
-- "Edit Routine Item" modal.
alter table public.routine_steps add column if not exists subtitle text;

-- Lets a step open something other than the normal tap cycle — currently
-- just 'video_panel' (a secondary screen of video cards, e.g. Stretch;
-- see routine_step_videos below and openVideoPanel in js/routineBoard.js).
-- Null/anything else keeps the standard Available -> Ready -> In
-- Progress -> Complete behavior. No in-app UI sets this yet — flip it
-- with a one-off SQL update, the same way a step's icon gets changed.
alter table public.routine_steps add column if not exists kind text;

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

-- A permanent log of every time a routine step was tapped complete (see
-- js/routineBoard.js's recordCompletion) — separate from routine_steps
-- itself, which only reflects *today's* live state and resets daily.
-- This is what the Insights page (js/insights.js) reads history from.
-- step_id deliberately has no foreign key (and step_name/color/icon are
-- a snapshot, not a live join), so a later rename or delete of the step
-- never rewrites or removes its history. duration_seconds is only set
-- when the step had track_duration on at the moment it was completed.
create table if not exists public.routine_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  step_id uuid not null,
  step_name text not null,
  icon text,
  color text,
  in_progress_at timestamptz,
  completed_at timestamptz not null,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists routine_completions_user_completed_idx
  on public.routine_completions (user_id, completed_at);

create index if not exists routine_completions_project_completed_idx
  on public.routine_completions (project_id, completed_at);

alter table public.routine_completions enable row level security;

drop policy if exists "Users can view their own routine completions" on public.routine_completions;
create policy "Users can view their own routine completions"
  on public.routine_completions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own routine completions" on public.routine_completions;
create policy "Users can insert their own routine completions"
  on public.routine_completions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own routine completions" on public.routine_completions;
create policy "Users can delete their own routine completions"
  on public.routine_completions for delete
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
-- workspace_type = 'nav' shows a flat (or nested, if needed) set of
-- panels instead of the plain placeholder. Three kinds: 'link' opens an
-- external URL in a new tab; 'folder' opens another screen of panels
-- (client-side, no page reload) for when a project's structure genuinely
-- needs nesting; 'status' doesn't navigate — tapping it cycles its own
-- `status` instead (null -> 'in_progress' -> 'waiting' -> 'complete' ->
-- back to null), the same tap-to-advance idea as the routine board. This
-- is how a project's own status shows up, as one panel among its others.
-- Nesting is via parent_id (null = the project's root level).
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
  status text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Added after the table itself, for databases where nav_items already
-- existed before this column did.
alter table public.nav_items add column if not exists status text;

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

-- Relationships panel (see relationships.html/js/relationships.js and
-- person.html/js/person.js), under Maintenance. One row per person.
-- circle is single-select; season and feelings are multi-select tag
-- arrays. Deliberately no "health score" or streak column — season is
-- an honest description of the present, not a rating, and
-- last_connection_at only ever powers a quiet Reconnect suggestion
-- (see isReconnectCandidate in js/relationshipOptions.js), never an
-- overdue warning. The fixed option lists themselves live in that same
-- file, not the database, so they stay app-side and easy to change.
create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  circle text,
  season text[] not null default '{}',
  investment_intention text,
  feelings text[] not null default '{}',
  last_connection_at date,
  intention text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists relationships_user_sort_idx
  on public.relationships (user_id, sort_order, created_at);

create or replace function public.set_relationships_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_relationships_updated_at on public.relationships;
create trigger set_relationships_updated_at
  before update on public.relationships
  for each row
  execute function public.set_relationships_updated_at();

alter table public.relationships enable row level security;

drop policy if exists "Users can view their own relationships" on public.relationships;
create policy "Users can view their own relationships"
  on public.relationships for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own relationships" on public.relationships;
create policy "Users can insert their own relationships"
  on public.relationships for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own relationships" on public.relationships;
create policy "Users can update their own relationships"
  on public.relationships for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own relationships" on public.relationships;
create policy "Users can delete their own relationships"
  on public.relationships for delete
  using (auth.uid() = user_id);

-- Video cards for a 'video_panel' kind routine step (see js/routineBoard.js
-- — first used for Stretch). Not a finalized routine: the point is being
-- able to swap a card's url/title/thumbnail after trying it for a week,
-- without deleting and rebuilding the card. step_id deliberately has no
-- foreign key (same reasoning as routine_completions' step_id) so a
-- step rename never orphans its videos. thumbnail_url is either a
-- manual override or the auto-derived YouTube thumbnail computed at
-- save time (see youtubeThumbnailUrl in js/routineBoard.js) — stored
-- rather than recomputed on every render so a custom override sticks.
create table if not exists public.routine_step_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  step_id uuid not null,
  url text not null,
  title text,
  thumbnail_url text,
  duration text,
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists routine_step_videos_step_sort_idx
  on public.routine_step_videos (step_id, sort_order);

create or replace function public.set_routine_step_videos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_routine_step_videos_updated_at on public.routine_step_videos;
create trigger set_routine_step_videos_updated_at
  before update on public.routine_step_videos
  for each row
  execute function public.set_routine_step_videos_updated_at();

alter table public.routine_step_videos enable row level security;

drop policy if exists "Users can view their own step videos" on public.routine_step_videos;
create policy "Users can view their own step videos"
  on public.routine_step_videos for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own step videos" on public.routine_step_videos;
create policy "Users can insert their own step videos"
  on public.routine_step_videos for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own step videos" on public.routine_step_videos;
create policy "Users can update their own step videos"
  on public.routine_step_videos for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own step videos" on public.routine_step_videos;
create policy "Users can delete their own step videos"
  on public.routine_step_videos for delete
  using (auth.uid() = user_id);
