-- Turns an existing "Morning Routine" project into a routine-board
-- workspace and seeds it with the ten steps from the approved prototype.
--
-- Run this AFTER creating a project named exactly "Morning Routine"
-- through the app's normal "Add a Project" flow (name matters, icon/color
-- picked in the form don't). Safe to re-run: flips workspace_type again if
-- needed, and only seeds steps if the project doesn't already have any.

update public.projects
set workspace_type = 'routine'
where name = 'Morning Routine';

insert into public.routine_steps (project_id, user_id, name, icon, color, sort_order, link)
select p.id, p.user_id, v.name, v.icon, v.color, v.sort_order, v.link
from public.projects p
cross join (
  values
    ('Morning video', 'monitor-play', 'sage', 0, 'https://www.youtube.com/watch?v=UAZJC-yirR0&list=PL7E_dGgQuBhAxYVfdb2v9p_KgdyXWWykT&index=2'),
    ('Audiobook', 'headphones', 'blue', 1, null),
    ('Daily Amharic', 'amarigna', 'amber', 2, null),
    ('10K Steps', 'footprints', 'green', 3, null),
    ('Brush teeth', 'smile', 'lavender', 4, null),
    ('Wash face', 'smile-plus', 'blue', 5, null),
    ('Shower', 'shower-head', 'sage', 6, null),
    ('Stretch', 'stretching', 'green', 7, null),
    ('Exercise', 'dumbbell', 'amber', 8, null),
    ('Bible Study', 'book-heart', 'lavender', 9, null)
) as v(name, icon, color, sort_order, link)
where p.name = 'Morning Routine'
  and not exists (
    select 1 from public.routine_steps rs where rs.project_id = p.id
  );

-- Renames the "Fidel Classroom" step to "Daily Amharic" even if it was
-- already seeded under the old name. Safe to re-run (a no-op once
-- already renamed, since no row will match the old name anymore).
update public.routine_steps rs
set name = 'Daily Amharic'
from public.projects p
where rs.project_id = p.id
  and p.name = 'Morning Routine'
  and rs.name = 'Fidel Classroom';

-- Sets/updates the Morning video link even if the steps above were already
-- seeded before this column existed. Safe to re-run.
update public.routine_steps rs
set link = 'https://www.youtube.com/watch?v=UAZJC-yirR0&list=PL7E_dGgQuBhAxYVfdb2v9p_KgdyXWWykT&index=2'
from public.projects p
where rs.project_id = p.id
  and p.name = 'Morning Routine'
  and rs.name = 'Morning video';

-- Updates the Brush teeth icon even if it was already seeded with an
-- older icon ('brush-cleaning', then 'smile-plus'). Safe to re-run.
update public.routine_steps rs
set icon = 'smile'
from public.projects p
where rs.project_id = p.id
  and p.name = 'Morning Routine'
  and rs.name = 'Brush teeth';

-- Updates the Wash face icon even if it was already seeded with the
-- older 'droplets' icon. Safe to re-run.
update public.routine_steps rs
set icon = 'smile-plus'
from public.projects p
where rs.project_id = p.id
  and p.name = 'Morning Routine'
  and rs.name = 'Wash face';

-- Updates the Stretch icon even if it was already seeded with the
-- older, non-stretch-specific 'activity' icon. Safe to re-run.
update public.routine_steps rs
set icon = 'stretching'
from public.projects p
where rs.project_id = p.id
  and p.name = 'Morning Routine'
  and rs.name = 'Stretch';

-- Turns Stretch into a 'video_panel' kind step: tapping its icon square
-- now opens a secondary screen of video cards (see js/routineBoard.js)
-- instead of the plain-link/no-op it'd otherwise do there; tapping the
-- rest of the card still cycles its own status exactly as before.
-- Starts with zero videos; add them from the panel itself. Safe to
-- re-run.
update public.routine_steps rs
set kind = 'video_panel'
from public.projects p
where rs.project_id = p.id
  and p.name = 'Morning Routine'
  and rs.name = 'Stretch';

-- Turns Morning video into a 'video_panel' step too, so its icon opens
-- a small library the same way Stretch's does, rather than the single
-- external link it used to open on first tap. Safe to re-run.
update public.routine_steps rs
set kind = 'video_panel'
from public.projects p
where rs.project_id = p.id
  and p.name = 'Morning Routine'
  and rs.name = 'Morning video';

-- Carries the step's existing single link over as the library's first
-- video, only if it doesn't already have any (so this never duplicates
-- on a re-run, and never overwrites videos added by hand from the
-- panel itself since).
insert into public.routine_step_videos (user_id, step_id, url, title, sort_order)
select rs.user_id, rs.id, rs.link, 'Morning Video', 0
from public.routine_steps rs
join public.projects p on p.id = rs.project_id
where p.name = 'Morning Routine'
  and rs.name = 'Morning video'
  and rs.link is not null
  and not exists (
    select 1 from public.routine_step_videos v where v.step_id = rs.id
  );

-- Updates the Daily Amharic step's icon even if it was already seeded
-- with an older icon ('graduation-cap', then 'language') under its old
-- name, "Fidel Classroom" — the rename above runs first, so this
-- matches on the current name either way. Safe to re-run.
update public.routine_steps rs
set icon = 'amarigna'
from public.projects p
where rs.project_id = p.id
  and p.name = 'Morning Routine'
  and rs.name = 'Daily Amharic';

-- Six more steps, added after the original ten. A separate insert (rather
-- than adding to the values list above) because that first insert only
-- fires for a project with zero steps — this one checks per-step-name
-- instead, so it still adds these to an already-seeded project. Safe to
-- re-run either way.
insert into public.routine_steps (project_id, user_id, name, icon, color, sort_order, link)
select p.id, p.user_id, v.name, v.icon, v.color, v.sort_order, v.link
from public.projects p
cross join (
  values
    ('Drink Water', 'droplets', 'blue', 10, null),
    ('Make Bed', 'bed', 'sage', 11, null),
    ('Get Dressed', 'shirt', 'lavender', 12, null),
    ('Tea / Coffee', 'coffee', 'amber', 13, null),
    ('Medication', 'pill', 'green', 14, null),
    ('One Productive Task', 'zap', 'lavender', 15, null)
) as v(name, icon, color, sort_order, link)
where p.name = 'Morning Routine'
  and not exists (
    select 1 from public.routine_steps rs where rs.project_id = p.id and rs.name = v.name
  );

-- Hair, added after the sixteen steps above. Same per-step-name guard,
-- so it only adds to a project that doesn't already have it.
insert into public.routine_steps (project_id, user_id, name, icon, color, sort_order, link)
select p.id, p.user_id, v.name, v.icon, v.color, v.sort_order, v.link
from public.projects p
cross join (
  values
    ('Hair', 'crown', 'amber', 16, null)
) as v(name, icon, color, sort_order, link)
where p.name = 'Morning Routine'
  and not exists (
    select 1 from public.routine_steps rs where rs.project_id = p.id and rs.name = v.name
  );

-- No Breakfast, added after Hair. Same per-step-name guard.
insert into public.routine_steps (project_id, user_id, name, icon, color, sort_order, link)
select p.id, p.user_id, v.name, v.icon, v.color, v.sort_order, v.link
from public.projects p
cross join (
  values
    ('No Breakfast', 'utensils', 'blue', 17, null)
) as v(name, icon, color, sort_order, link)
where p.name = 'Morning Routine'
  and not exists (
    select 1 from public.routine_steps rs where rs.project_id = p.id and rs.name = v.name
  );
