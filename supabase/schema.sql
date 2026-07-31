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

-- One row per step in the current routine (Shampoo, Conditioner, ...) —
-- not an experiment, just what you actually do, reorderable like any
-- other list in this app.
create table if not exists public.hair_routine_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hair_routine_steps_user_sort_idx
  on public.hair_routine_steps (user_id, sort_order);

create or replace function public.set_hair_routine_steps_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_hair_routine_steps_updated_at on public.hair_routine_steps;
create trigger set_hair_routine_steps_updated_at
  before update on public.hair_routine_steps
  for each row
  execute function public.set_hair_routine_steps_updated_at();

alter table public.hair_routine_steps enable row level security;

drop policy if exists "Users can view their own hair routine steps" on public.hair_routine_steps;
create policy "Users can view their own hair routine steps"
  on public.hair_routine_steps for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own hair routine steps" on public.hair_routine_steps;
create policy "Users can insert their own hair routine steps"
  on public.hair_routine_steps for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own hair routine steps" on public.hair_routine_steps;
create policy "Users can update their own hair routine steps"
  on public.hair_routine_steps for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own hair routine steps" on public.hair_routine_steps;
create policy "Users can delete their own hair routine steps"
  on public.hair_routine_steps for delete
  using (auth.uid() = user_id);

-- A growing personal product database — referenced by id (not name)
-- from hair_wash_log.product_ids and hair_experiments.product_ids
-- below, so renaming a product never breaks those links.
create table if not exists public.hair_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  brand text,
  category text,
  notes text,
  favorite boolean not null default false,
  repurchase text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hair_products_user_idx
  on public.hair_products (user_id);

create or replace function public.set_hair_products_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_hair_products_updated_at on public.hair_products;
create trigger set_hair_products_updated_at
  before update on public.hair_products
  for each row
  execute function public.set_hair_products_updated_at();

alter table public.hair_products enable row level security;

drop policy if exists "Users can view their own hair products" on public.hair_products;
create policy "Users can view their own hair products"
  on public.hair_products for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own hair products" on public.hair_products;
create policy "Users can insert their own hair products"
  on public.hair_products for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own hair products" on public.hair_products;
create policy "Users can update their own hair products"
  on public.hair_products for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own hair products" on public.hair_products;
create policy "Users can delete their own hair products"
  on public.hair_products for delete
  using (auth.uid() = user_id);

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
