-- Turns an existing "Day Routine" project into a routine-board workspace
-- and seeds it with four broad, repeatable daytime-transition items.
--
-- Run this AFTER creating a project named exactly "Day Routine" through
-- the app's normal "Add a Project" flow (name matters, icon/color picked
-- in the form don't). Safe to re-run: flips workspace_type again if
-- needed, and only seeds steps if the project doesn't already have any.
--
-- Unlike Morning/Night, these items aren't a fixed sequence of tasks —
-- they're a way to mark "I've intentionally entered this mode of work"
-- (e.g. tapping Project doesn't track which project, just that you
-- started one), so the same four items repeat all day rather than being
-- a one-time-per-day checklist. They behave exactly like any other
-- routine item otherwise: Available -> Ready -> In Progress -> Complete,
-- with optional Track Time and a subtitle via long-press.

update public.projects
set workspace_type = 'routine'
where name = 'Day Routine';

insert into public.routine_steps (project_id, user_id, name, icon, color, sort_order)
select p.id, p.user_id, v.name, v.icon, v.color, v.sort_order
from public.projects p
cross join (
  values
    ('Get Ready', 'shirt', 'blue', 0),
    ('Work / Job', 'briefcase', 'sage', 1),
    ('Academics', 'book-open', 'amber', 2),
    ('Project', 'folder', 'lavender', 3)
) as v(name, icon, color, sort_order)
where p.name = 'Day Routine'
  and not exists (
    select 1 from public.routine_steps rs where rs.project_id = p.id
  );

-- Puts Day Routine between Morning and Night in the Routines list (both
-- of which default to sort_order 0, same as every other project) —
-- purely a display-order tweak, doesn't touch any other project's row.
update public.projects set sort_order = 0 where name = 'Morning Routine';
update public.projects set sort_order = 1 where name = 'Day Routine';
update public.projects set sort_order = 2 where name = 'Night Routine';
