-- Turns an existing "Night Routine" project into a routine-board workspace
-- and seeds it with the steps described for it.
--
-- Run this AFTER creating a project named exactly "Night Routine" through
-- the app's normal "Add a Project" flow (name matters, icon/color picked
-- in the form don't). Safe to re-run: flips workspace_type again if
-- needed, and only seeds steps if the project doesn't already have any.
--
-- Note: "Review the 2026 Vision" doesn't link anywhere yet — routine step
-- links currently only open external URLs in a new tab (see
-- js/routineBoard.js), which isn't the right behavior for navigating to
-- another page inside the app. That's a small follow-up, not done here.

update public.projects
set workspace_type = 'routine'
where name = 'Night Routine';

insert into public.routine_steps (project_id, user_id, name, icon, color, sort_order)
select p.id, p.user_id, v.name, v.icon, v.color, v.sort_order
from public.projects p
cross join (
  values
    ('Brush teeth', 'smile', 'lavender', 0),
    ('Wash face', 'smile-plus', 'blue', 1),
    ('Shower', 'shower-head', 'sage', 2),
    ('Do hair', 'crown', 'green', 3),
    ('Put on pajamas', 'shirt', 'amber', 4),
    ('Outline tomorrow', 'notebook-pen', 'sage', 5),
    ('Review the 2026 Vision', 'compass', 'amber', 6)
) as v(name, icon, color, sort_order)
where p.name = 'Night Routine'
  and not exists (
    select 1 from public.routine_steps rs where rs.project_id = p.id
  );

-- Updates the Brush teeth icon even if it was already seeded with an
-- older icon ('brush-cleaning', then 'smile-plus'). Safe to re-run.
update public.routine_steps rs
set icon = 'smile'
from public.projects p
where rs.project_id = p.id
  and p.name = 'Night Routine'
  and rs.name = 'Brush teeth';

-- Updates the Wash face icon even if it was already seeded with the
-- older 'droplets' icon. Safe to re-run.
update public.routine_steps rs
set icon = 'smile-plus'
from public.projects p
where rs.project_id = p.id
  and p.name = 'Night Routine'
  and rs.name = 'Wash face';

-- Updates the Do hair icon even if it was already seeded with the older
-- 'wind' icon. Safe to re-run.
update public.routine_steps rs
set icon = 'crown'
from public.projects p
where rs.project_id = p.id
  and p.name = 'Night Routine'
  and rs.name = 'Do hair';

-- Two more steps, added after the original seven: framed as tomorrow's
-- prep rather than tonight's chores — a water bottle that's already
-- full and a room that's already tidy are a small gift to whoever wakes
-- up next. Same per-step-name guard as the morning routine's later
-- additions, so this still adds to an already-seeded project. Safe to
-- re-run.
insert into public.routine_steps (project_id, user_id, name, icon, color, sort_order)
select p.id, p.user_id, v.name, v.icon, v.color, v.sort_order
from public.projects p
cross join (
  values
    ('Fill water bottle', 'bottle', 'blue', 7),
    ('Tidy room', 'home', 'sage', 8)
) as v(name, icon, color, sort_order)
where p.name = 'Night Routine'
  and not exists (
    select 1 from public.routine_steps rs where rs.project_id = p.id and rs.name = v.name
  );
