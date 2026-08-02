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

-- Opt-in for habits that are naturally completed in phases rather than
-- once (e.g. Steps: a morning walk gets you partway to 10k, the rest
-- happens later). Toggled from the long-press "Edit Routine Item"
-- modal. When a phased step is completed, the app offers to create a
-- continuation card in another routine — see continuation_of below and
-- setNotToday/promptContinuation in js/routineBoard.js. Off (false) for
-- every step by default, since most habits are just done or not done —
-- this is deliberately opt-in per step, not a generic feature every
-- step gets.
alter table public.routine_steps add column if not exists phased boolean not null default false;

-- Set only on a continuation card itself (e.g. "Finish Remaining
-- Steps"), pointing back at the phased step it continues. No foreign
-- key, same reasoning as routine_completions.step_id: renaming or
-- deleting the original step should never orphan or cascade-delete the
-- continuation. A phased step shows its "still going" hourglass badge
-- for as long as a continuation row referencing it exists and isn't
-- complete (see fetchOpenContinuations in js/routineBoard.js); once
-- that continuation is completed, the next daily reset deletes it
-- outright rather than resetting it like a normal step, since it was
-- only ever temporary.
alter table public.routine_steps add column if not exists continuation_of uuid;

create index if not exists routine_steps_continuation_of_idx
  on public.routine_steps (continuation_of);

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

-- A permanent log of every time a step is marked "Not Today" (see
-- setNotToday in js/routineBoard.js) — the same snapshot-not-a-join
-- shape as routine_completions above, for the same reason: a step's own
-- 'not_today' status only reflects *today* and resets by tomorrow, so
-- this is what would let Insights notice a skip pattern later (e.g.
-- "you skip Exercise most Mondays").
create table if not exists public.routine_skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  step_id uuid not null,
  step_name text not null,
  icon text,
  color text,
  skipped_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists routine_skips_user_skipped_idx
  on public.routine_skips (user_id, skipped_at);

create index if not exists routine_skips_project_skipped_idx
  on public.routine_skips (project_id, skipped_at);

alter table public.routine_skips enable row level security;

drop policy if exists "Users can view their own routine skips" on public.routine_skips;
create policy "Users can view their own routine skips"
  on public.routine_skips for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own routine skips" on public.routine_skips;
create policy "Users can insert their own routine skips"
  on public.routine_skips for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own routine skips" on public.routine_skips;
create policy "Users can delete their own routine skips"
  on public.routine_skips for delete
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

-- ==================== Hair (see js/hair.js and friends) ====================
-- Replaces the old plain-text Hair board (category.html?id=hair). Not a
-- tracker — an experimentation framework: a routine (what you usually
-- do), products (a growing personal database), a wash log and
-- experiments that reference each other, permanent lessons distilled
-- from experiments, a results photo gallery, and free-form notes. See
-- the README's "Hair Lab" section for the full design rationale.

-- hair_routine_steps and hair_products used to live here. Both are gone
-- (dropped below, no data to migrate): Hair's routine is now just
-- maintenance_routine_steps rows with area = 'hair' (see the Inventory/
-- Maintenance section further down), and Hair's products are now
-- Inventory items with area = 'hair' — one shared source of truth for
-- "what products do I own" across Hair Lab, Maintenance -> Hair Care,
-- and every other care area, instead of a Hair-only copy. See the
-- README's "Inventory" section for the full rationale.
drop table if exists public.hair_routine_steps cascade;
drop table if exists public.hair_products cascade;

-- A plain wash history. experiment_id deliberately has no foreign key
-- (same reasoning as routine_completions.step_id elsewhere in this
-- file) so deleting an experiment never orphans the wash that led to
-- it — see hair_experiments.wash_log_id below for the other direction
-- of this same link.
create table if not exists public.hair_wash_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wash_date date not null,
  product_ids uuid[] not null default '{}',
  style_before text,
  notes text,
  experiment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hair_wash_log_user_date_idx
  on public.hair_wash_log (user_id, wash_date);

create or replace function public.set_hair_wash_log_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_hair_wash_log_updated_at on public.hair_wash_log;
create trigger set_hair_wash_log_updated_at
  before update on public.hair_wash_log
  for each row
  execute function public.set_hair_wash_log_updated_at();

alter table public.hair_wash_log enable row level security;

drop policy if exists "Users can view their own hair wash log" on public.hair_wash_log;
create policy "Users can view their own hair wash log"
  on public.hair_wash_log for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own hair wash log" on public.hair_wash_log;
create policy "Users can insert their own hair wash log"
  on public.hair_wash_log for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own hair wash log" on public.hair_wash_log;
create policy "Users can update their own hair wash log"
  on public.hair_wash_log for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own hair wash log" on public.hair_wash_log;
create policy "Users can delete their own hair wash log"
  on public.hair_wash_log for delete
  using (auth.uid() = user_id);

-- The core table. changing holds the single variable being tested
-- (see the "What am I changing?" step in js/hair.js) — everything else
-- is expected to stay the same. wash_log_id is the mirror of
-- hair_wash_log.experiment_id above, same no-FK reasoning. The six
-- result_* columns are flat rather than a single JSON blob, matching
-- how the rest of this schema prefers explicit columns over embedded
-- structure.
create table if not exists public.hair_experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  changing text,
  goal text,
  success text,
  section text,
  hair_condition text,
  hair_moisture text,
  product_ids uuid[] not null default '{}',
  product_order text,
  drying_method text,
  revair_heat text,
  revair_tension integer,
  revair_time text,
  protective_after text,
  result_definition integer,
  result_volume integer,
  result_softness integer,
  result_frizz integer,
  result_shrinkage integer,
  result_longevity integer,
  observations text,
  liked text[] not null default '{}',
  disliked text[] not null default '{}',
  next_try text,
  repeat text,
  wash_log_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hair_experiments_user_created_idx
  on public.hair_experiments (user_id, created_at);

create or replace function public.set_hair_experiments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_hair_experiments_updated_at on public.hair_experiments;
create trigger set_hair_experiments_updated_at
  before update on public.hair_experiments
  for each row
  execute function public.set_hair_experiments_updated_at();

alter table public.hair_experiments enable row level security;

drop policy if exists "Users can view their own hair experiments" on public.hair_experiments;
create policy "Users can view their own hair experiments"
  on public.hair_experiments for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own hair experiments" on public.hair_experiments;
create policy "Users can insert their own hair experiments"
  on public.hair_experiments for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own hair experiments" on public.hair_experiments;
create policy "Users can update their own hair experiments"
  on public.hair_experiments for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own hair experiments" on public.hair_experiments;
create policy "Users can delete their own hair experiments"
  on public.hair_experiments for delete
  using (auth.uid() = user_id);

-- Permanent lessons distilled from experiments (see the "Save as a
-- lesson" button in js/hairExperiment.js) — deliberately just text, no
-- link back to the experiment it came from, since a lesson is meant to
-- outlive any single experiment.
create table if not exists public.hair_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists hair_lessons_user_created_idx
  on public.hair_lessons (user_id, created_at);

alter table public.hair_lessons enable row level security;

drop policy if exists "Users can view their own hair lessons" on public.hair_lessons;
create policy "Users can view their own hair lessons"
  on public.hair_lessons for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own hair lessons" on public.hair_lessons;
create policy "Users can insert their own hair lessons"
  on public.hair_lessons for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own hair lessons" on public.hair_lessons;
create policy "Users can update their own hair lessons"
  on public.hair_lessons for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own hair lessons" on public.hair_lessons;
create policy "Users can delete their own hair lessons"
  on public.hair_lessons for delete
  using (auth.uid() = user_id);

-- Links, videos, product recommendations, ideas — a plain inbox, same
-- shape as hair_lessons.
create table if not exists public.hair_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists hair_notes_user_created_idx
  on public.hair_notes (user_id, created_at);

alter table public.hair_notes enable row level security;

drop policy if exists "Users can view their own hair notes" on public.hair_notes;
create policy "Users can view their own hair notes"
  on public.hair_notes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own hair notes" on public.hair_notes;
create policy "Users can insert their own hair notes"
  on public.hair_notes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own hair notes" on public.hair_notes;
create policy "Users can update their own hair notes"
  on public.hair_notes for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own hair notes" on public.hair_notes;
create policy "Users can delete their own hair notes"
  on public.hair_notes for delete
  using (auth.uid() = user_id);

-- Experiment -> result -> photo -> date. experiment_id has no foreign
-- key, same reasoning as elsewhere in this file. photo_url points at
-- Supabase Storage (see the "hair-photos" bucket set up in section 4 of
-- the README) rather than storing image bytes in the table.
create table if not exists public.hair_gallery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experiment_id uuid,
  title text not null,
  photo_date date not null,
  photo_url text,
  created_at timestamptz not null default now()
);

create index if not exists hair_gallery_user_date_idx
  on public.hair_gallery (user_id, photo_date);

alter table public.hair_gallery enable row level security;

drop policy if exists "Users can view their own hair gallery" on public.hair_gallery;
create policy "Users can view their own hair gallery"
  on public.hair_gallery for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own hair gallery" on public.hair_gallery;
create policy "Users can insert their own hair gallery"
  on public.hair_gallery for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own hair gallery" on public.hair_gallery;
create policy "Users can update their own hair gallery"
  on public.hair_gallery for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own hair gallery" on public.hair_gallery;
create policy "Users can delete their own hair gallery"
  on public.hair_gallery for delete
  using (auth.uid() = user_id);

-- One row per user — just the draggable order of the seven panels on
-- the Hair home screen (see js/hair.js). A dedicated tiny table rather
-- than a column bolted onto some other table, since nothing else in
-- this app has a natural "one row per user" home yet.
create table if not exists public.hair_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  panel_order text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create or replace function public.set_hair_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_hair_settings_updated_at on public.hair_settings;
create trigger set_hair_settings_updated_at
  before update on public.hair_settings
  for each row
  execute function public.set_hair_settings_updated_at();

alter table public.hair_settings enable row level security;

drop policy if exists "Users can view their own hair settings" on public.hair_settings;
create policy "Users can view their own hair settings"
  on public.hair_settings for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own hair settings" on public.hair_settings;
create policy "Users can insert their own hair settings"
  on public.hair_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own hair settings" on public.hair_settings;
create policy "Users can update their own hair settings"
  on public.hair_settings for update
  using (auth.uid() = user_id);

-- Storage bucket for hair_gallery photos (see photo_url above). Public
-- read, so a saved photo_url just works as a plain image URL with no
-- signing — but uploads/deletes are restricted to files under the
-- uploader's own `${user_id}/...` path prefix, the standard Supabase
-- Storage per-user-folder pattern (see uploadGalleryPhoto in
-- js/hairGallery.js).
insert into storage.buckets (id, name, public)
values ('hair-photos', 'hair-photos', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view hair photos" on storage.objects;
create policy "Anyone can view hair photos"
  on storage.objects for select
  using (bucket_id = 'hair-photos');

drop policy if exists "Users can upload their own hair photos" on storage.objects;
create policy "Users can upload their own hair photos"
  on storage.objects for insert
  with check (bucket_id = 'hair-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own hair photos" on storage.objects;
create policy "Users can delete their own hair photos"
  on storage.objects for delete
  using (bucket_id = 'hair-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ==================== Inventory + Maintenance usage (see js/inventory*.js and js/maintenance*.js) ====================
-- Three separate concepts, on purpose (see the README's "Inventory"
-- section): Inventory answers "what do I own" (inventory_items,
-- inventory_purchases), Maintenance answers "how do I care for and use
-- what I own" (maintenance_usage, maintenance_routine_steps), and Hair
-- Lab's own tables (hair_wash_log, hair_experiments, ...) answer "how do
-- I test and improve a routine" — referencing Inventory items rather
-- than duplicating them. `area` values are a fixed list ('hair', 'skin',
-- 'body', 'nail', 'jewelry', ...) defined in js/maintenanceShared.js,
-- not a separate categories table, same reasoning as
-- maintenance_items.category further up this file.

-- maintenance_products used to live here, one row per product per area.
-- Gone (dropped below, no data to migrate): a product is now an
-- Inventory item, and this table's old purchase/rating/notes/repurchase
-- columns are now maintenance_usage, referencing that item instead of
-- duplicating its identity.
drop table if exists public.maintenance_products cascade;

-- The reusable product identity: what it is, not what you paid or how
-- you're using it. One row per distinct product you own, shared by
-- every screen that touches it (Hair Lab's Products panel, Maintenance
-- -> Hair Care/Skin Care/etc., and hair_wash_log/hair_experiments'
-- product_ids arrays) — editing it here updates everywhere at once.
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null,
  name text not null,
  brand text,
  category text,
  quantity_or_size text,
  condition text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_user_area_idx
  on public.inventory_items (user_id, area);

create or replace function public.set_inventory_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at
  before update on public.inventory_items
  for each row
  execute function public.set_inventory_items_updated_at();

alter table public.inventory_items enable row level security;

drop policy if exists "Users can view their own inventory items" on public.inventory_items;
create policy "Users can view their own inventory items"
  on public.inventory_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own inventory items" on public.inventory_items;
create policy "Users can insert their own inventory items"
  on public.inventory_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own inventory items" on public.inventory_items;
create policy "Users can update their own inventory items"
  on public.inventory_items for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own inventory items" on public.inventory_items;
create policy "Users can delete their own inventory items"
  on public.inventory_items for delete
  using (auth.uid() = user_id);

-- Sticker support (see js/stickerShared.js and the README's "Stickers"
-- section): sticker_id has no foreign key, same reasoning as every
-- other cross-entity reference in this file — deleting a sticker is a
-- Sticker Library action, not something that should ever silently blank
-- out an inventory item. status replaces the old free-text condition
-- column with a fixed picklist (New/In Use/Almost Empty/Empty/Finished/
-- Repurchase Needed/Archived), validated app-side like every other
-- fixed-list field in this app (no db-level enum). size replaces
-- quantity_or_size (same field, clearer name). Dropped rather than left
-- unused since no real data exists yet to carry over.
alter table public.inventory_items add column if not exists sticker_id uuid;
alter table public.inventory_items add column if not exists status text;
alter table public.inventory_items add column if not exists size text;
alter table public.inventory_items add column if not exists source_url text;
alter table public.inventory_items drop column if exists condition;
alter table public.inventory_items drop column if exists quantity_or_size;

-- One row per individually purchased container of an item (a specific
-- bottle or jar, not the reusable product identity above) — "how long
-- did THIS one last" is a property of the purchase, not the product, so
-- an item can be rebought over and over with a fresh purchase row each
-- time rather than overwriting the last one's dates/price. A real
-- foreign key (unlike the loose cross-entity references elsewhere in
-- this file) because a purchase genuinely can't exist without its item —
-- deleting the item should take its purchase history with it. Estimated
-- Duration and Estimated Monthly Cost are computed from purchase_price/
-- date_started/date_finished at render time (see
-- estimatedDurationDays/estimatedMonthlyCost in js/maintenanceShared.js)
-- rather than stored, so they're never stale.
create table if not exists public.inventory_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  purchase_date date,
  purchase_price numeric,
  purchase_location text,
  date_started date,
  date_finished date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_purchases_item_idx
  on public.inventory_purchases (inventory_item_id);

create or replace function public.set_inventory_purchases_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_inventory_purchases_updated_at on public.inventory_purchases;
create trigger set_inventory_purchases_updated_at
  before update on public.inventory_purchases
  for each row
  execute function public.set_inventory_purchases_updated_at();

alter table public.inventory_purchases enable row level security;

drop policy if exists "Users can view their own inventory purchases" on public.inventory_purchases;
create policy "Users can view their own inventory purchases"
  on public.inventory_purchases for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own inventory purchases" on public.inventory_purchases;
create policy "Users can insert their own inventory purchases"
  on public.inventory_purchases for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own inventory purchases" on public.inventory_purchases;
create policy "Users can update their own inventory purchases"
  on public.inventory_purchases for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own inventory purchases" on public.inventory_purchases;
create policy "Users can delete their own inventory purchases"
  on public.inventory_purchases for delete
  using (auth.uid() = user_id);

-- One row per photo of an item (see js/inventoryItem.js) — a shoe often
-- wants more than one angle, so this is a small gallery per item rather
-- than a single photo_url column. Same real-FK-cascade reasoning as
-- inventory_purchases: a photo is meaningless without its item.
-- photo_url points at Supabase Storage (the "inventory-photos" bucket
-- below) rather than storing image bytes in the table.
create table if not exists public.inventory_item_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  photo_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_item_photos_item_idx
  on public.inventory_item_photos (inventory_item_id);

alter table public.inventory_item_photos enable row level security;

drop policy if exists "Users can view their own inventory item photos" on public.inventory_item_photos;
create policy "Users can view their own inventory item photos"
  on public.inventory_item_photos for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own inventory item photos" on public.inventory_item_photos;
create policy "Users can insert their own inventory item photos"
  on public.inventory_item_photos for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own inventory item photos" on public.inventory_item_photos;
create policy "Users can update their own inventory item photos"
  on public.inventory_item_photos for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own inventory item photos" on public.inventory_item_photos;
create policy "Users can delete their own inventory item photos"
  on public.inventory_item_photos for delete
  using (auth.uid() = user_id);

-- Storage bucket for inventory_item_photos (see photo_url above). Same
-- public-read / per-user-folder-scoped-write pattern as the hair-photos
-- bucket further up this file (see uploadPhoto in js/inventoryItem.js).
insert into storage.buckets (id, name, public)
values ('inventory-photos', 'inventory-photos', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view inventory photos" on storage.objects;
create policy "Anyone can view inventory photos"
  on storage.objects for select
  using (bucket_id = 'inventory-photos');

drop policy if exists "Users can upload their own inventory photos" on storage.objects;
create policy "Users can upload their own inventory photos"
  on storage.objects for insert
  with check (bucket_id = 'inventory-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own inventory photos" on storage.objects;
create policy "Users can delete their own inventory photos"
  on storage.objects for delete
  using (bucket_id = 'inventory-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- One row per step in an area's routine (e.g. Cleanse, Tone, Moisturize
-- for Skin Care) — what order products actually get used in, reorderable
-- like every other ordered list in this app. area = 'hair' is Hair Lab's
-- own Hair Routine panel now too, not a separate hair_routine_steps
-- table — one routine system for every area.
create table if not exists public.maintenance_routine_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_routine_steps_user_area_sort_idx
  on public.maintenance_routine_steps (user_id, area, sort_order);

create or replace function public.set_maintenance_routine_steps_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_maintenance_routine_steps_updated_at on public.maintenance_routine_steps;
create trigger set_maintenance_routine_steps_updated_at
  before update on public.maintenance_routine_steps
  for each row
  execute function public.set_maintenance_routine_steps_updated_at();

alter table public.maintenance_routine_steps enable row level security;

drop policy if exists "Users can view their own maintenance routine steps" on public.maintenance_routine_steps;
create policy "Users can view their own maintenance routine steps"
  on public.maintenance_routine_steps for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own maintenance routine steps" on public.maintenance_routine_steps;
create policy "Users can insert their own maintenance routine steps"
  on public.maintenance_routine_steps for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own maintenance routine steps" on public.maintenance_routine_steps;
create policy "Users can update their own maintenance routine steps"
  on public.maintenance_routine_steps for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own maintenance routine steps" on public.maintenance_routine_steps;
create policy "Users can delete their own maintenance routine steps"
  on public.maintenance_routine_steps for delete
  using (auth.uid() = user_id);

-- How one Inventory item performs in one maintenance area — not the
-- product itself (that's inventory_items), just this area's routine
-- step, rating, performance notes, and repurchase decision for it. The
-- same item can have a usage row in more than one area (a jar of
-- coconut oil rated well for Body Care and rated poorly for Hair Care,
-- each with its own independent rating/notes/repurchase), which is the
-- whole point of separating the two — under the old maintenance_products
-- table this meant either sharing one rating across contexts or
-- creating a duplicate product record per area. A real foreign key to
-- inventory_items (unlike routine_step_id, which stays a loose reference
-- like every other cross-entity link in this file): a usage row is
-- meaningless without its item, so deleting the item takes its usage
-- rows with it, while deleting a routine step never touches the usage
-- rows that happen to point at it.
create table if not exists public.maintenance_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  routine_step_id uuid,
  rating integer,
  notes text,
  repurchase text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_usage_user_area_idx
  on public.maintenance_usage (user_id, area);

create index if not exists maintenance_usage_item_idx
  on public.maintenance_usage (inventory_item_id);

create or replace function public.set_maintenance_usage_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_maintenance_usage_updated_at on public.maintenance_usage;
create trigger set_maintenance_usage_updated_at
  before update on public.maintenance_usage
  for each row
  execute function public.set_maintenance_usage_updated_at();

alter table public.maintenance_usage enable row level security;

drop policy if exists "Users can view their own maintenance usage" on public.maintenance_usage;
create policy "Users can view their own maintenance usage"
  on public.maintenance_usage for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own maintenance usage" on public.maintenance_usage;
create policy "Users can insert their own maintenance usage"
  on public.maintenance_usage for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own maintenance usage" on public.maintenance_usage;
create policy "Users can update their own maintenance usage"
  on public.maintenance_usage for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own maintenance usage" on public.maintenance_usage;
create policy "Users can delete their own maintenance usage"
  on public.maintenance_usage for delete
  using (auth.uid() = user_id);

-- routine_step_id is superseded by routine_version_items membership
-- (see the Stickers section below) — which routine a rating applies to
-- is now visible directly from the versioned routine itself, so a
-- separate pointer here would just be one more place to go stale.
alter table public.maintenance_usage drop column if exists routine_step_id;

-- ==================== Stickers + Versioned Routines (see js/stickerShared.js and friends) ====================
-- A sticker is a small reusable image (a die-cut product icon, ~256-384px,
-- ideally transparent) — created once, then reused across Inventory items
-- and routine steps rather than re-uploaded per place it's used. Deleting
-- a sticker is a Sticker Library action (see js/stickerShared.js's
-- isStickerInUse), never automatic: an inventory item or a routine
-- version's sticker_id both stay put even if the sticker they point at
-- is later deleted (loose references, like the rest of this file) —
-- what actually blocks deletion is the app checking first.
create table if not exists public.stickers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  image_path text,
  sticker_type text not null default 'product',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stickers_user_idx on public.stickers (user_id);

create or replace function public.set_stickers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_stickers_updated_at on public.stickers;
create trigger set_stickers_updated_at
  before update on public.stickers
  for each row
  execute function public.set_stickers_updated_at();

alter table public.stickers enable row level security;

drop policy if exists "Users can view their own stickers" on public.stickers;
create policy "Users can view their own stickers"
  on public.stickers for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own stickers" on public.stickers;
create policy "Users can insert their own stickers"
  on public.stickers for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own stickers" on public.stickers;
create policy "Users can update their own stickers"
  on public.stickers for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own stickers" on public.stickers;
create policy "Users can delete their own stickers"
  on public.stickers for delete
  using (auth.uid() = user_id);

-- Storage bucket for sticker images. Same public-read /
-- per-user-folder-scoped-write pattern as hair-photos/inventory-photos
-- above (see uploadSticker in js/stickerShared.js).
insert into storage.buckets (id, name, public)
values ('stickers', 'stickers', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view stickers" on storage.objects;
create policy "Anyone can view stickers"
  on storage.objects for select
  using (bucket_id = 'stickers');

drop policy if exists "Users can upload their own stickers" on storage.objects;
create policy "Users can upload their own stickers"
  on storage.objects for insert
  with check (bucket_id = 'stickers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own sticker uploads" on storage.objects;
create policy "Users can delete their own sticker uploads"
  on storage.objects for delete
  using (bucket_id = 'stickers' and (storage.foldername(name))[1] = auth.uid()::text);

-- maintenance_routine_steps used to live here: one flat ordered list per
-- area, no sections, no history. Gone (dropped below, no data to
-- migrate) — a routine is now versioned (routine_versions) with each
-- version holding its own ordered, sectioned list of items
-- (routine_version_items), so "what did I use in May" and "what am I
-- using now" are both answerable instead of only the latter. area =
-- 'hair' is Hair Lab's own Hair Routine panel too, same as before — one
-- routine system for every area, not a Hair-only table.
drop table if exists public.maintenance_routine_steps cascade;

-- One routine per area (e.g. the "Skin Care" routine, area = 'skin').
-- Not much more than a name and an area — routine_versions below is
-- where the actual content lives.
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists routines_user_area_idx
  on public.routines (user_id, area);

alter table public.routines enable row level security;

drop policy if exists "Users can view their own routines" on public.routines;
create policy "Users can view their own routines"
  on public.routines for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own routines" on public.routines;
create policy "Users can insert their own routines"
  on public.routines for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own routines" on public.routines;
create policy "Users can update their own routines"
  on public.routines for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own routines" on public.routines;
create policy "Users can delete their own routines"
  on public.routines for delete
  using (auth.uid() = user_id);

-- One row per era of a routine. ended_at null means it's the current,
-- active version — starting a new version closes the previous one by
-- setting its ended_at (see startNewRoutineVersion in
-- js/stickerShared.js) rather than ever overwriting a version's items in
-- place. A real foreign key to routines (unlike the loose references
-- elsewhere in this file): a version is structurally owned by its
-- routine, so deleting the routine takes its whole history with it.
create table if not exists public.routine_versions (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_number integer not null,
  started_at date not null default current_date,
  ended_at date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists routine_versions_routine_idx
  on public.routine_versions (routine_id, version_number);

alter table public.routine_versions enable row level security;

drop policy if exists "Users can view their own routine versions" on public.routine_versions;
create policy "Users can view their own routine versions"
  on public.routine_versions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own routine versions" on public.routine_versions;
create policy "Users can insert their own routine versions"
  on public.routine_versions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own routine versions" on public.routine_versions;
create policy "Users can update their own routine versions"
  on public.routine_versions for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own routine versions" on public.routine_versions;
create policy "Users can delete their own routine versions"
  on public.routine_versions for delete
  using (auth.uid() = user_id);

-- One row per sticker/item in one version's ordered list. `section`
-- (e.g. 'morning', 'night', 'weekly') is free text, not a fixed list —
-- a routine's sections are whatever the user names them.
-- inventory_item_id and sticker_id are both loose references (no
-- foreign key, unlike this table's real FK to routine_versions): once a
-- version is closed, its items are a historical snapshot — deleting the
-- Inventory item or the sticker later must never change how that
-- snapshot reads (see the README's "preserve routine snapshots" note).
-- sticker_id is the visual snapshot; inventory_item_id is what lets a
-- log or history entry still link through to the live product page when
-- the item still exists.
create table if not exists public.routine_version_items (
  id uuid primary key default gen_random_uuid(),
  routine_version_id uuid not null references public.routine_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  inventory_item_id uuid,
  sticker_id uuid,
  section text not null default 'default',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists routine_version_items_version_idx
  on public.routine_version_items (routine_version_id, section, position);

alter table public.routine_version_items enable row level security;

drop policy if exists "Users can view their own routine version items" on public.routine_version_items;
create policy "Users can view their own routine version items"
  on public.routine_version_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own routine version items" on public.routine_version_items;
create policy "Users can insert their own routine version items"
  on public.routine_version_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own routine version items" on public.routine_version_items;
create policy "Users can update their own routine version items"
  on public.routine_version_items for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own routine version items" on public.routine_version_items;
create policy "Users can delete their own routine version items"
  on public.routine_version_items for delete
  using (auth.uid() = user_id);

-- One log entry per day per area. routine_version_id is a loose
-- snapshot reference (no foreign key) — locked to whichever version was
-- active when the entry was saved, so editing or starting a new routine
-- version later never changes how a past log reads (see
-- routine_version_items above for the same reasoning). condition/
-- dryness/irritation/breakouts are free text (a small fixed picklist
-- per field, validated app-side) so this table reads for hair or body
-- logs too, not only skin.
create table if not exists public.maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null,
  log_date date not null default current_date,
  routine_version_id uuid,
  condition text,
  dryness text,
  irritation text,
  breakouts text,
  notes text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_logs_user_area_date_idx
  on public.maintenance_logs (user_id, area, log_date);

create or replace function public.set_maintenance_logs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_maintenance_logs_updated_at on public.maintenance_logs;
create trigger set_maintenance_logs_updated_at
  before update on public.maintenance_logs
  for each row
  execute function public.set_maintenance_logs_updated_at();

alter table public.maintenance_logs enable row level security;

drop policy if exists "Users can view their own maintenance logs" on public.maintenance_logs;
create policy "Users can view their own maintenance logs"
  on public.maintenance_logs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own maintenance logs" on public.maintenance_logs;
create policy "Users can insert their own maintenance logs"
  on public.maintenance_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own maintenance logs" on public.maintenance_logs;
create policy "Users can update their own maintenance logs"
  on public.maintenance_logs for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own maintenance logs" on public.maintenance_logs;
create policy "Users can delete their own maintenance logs"
  on public.maintenance_logs for delete
  using (auth.uid() = user_id);
