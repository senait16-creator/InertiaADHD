-- Turns an existing "Evening Routine" project into a routine-board
-- workspace and seeds it with three broad, repeatable evening-mode
-- items.
--
-- Run this AFTER creating a project named exactly "Evening Routine"
-- through the app's normal "Add a Project" flow (name matters — unlike
-- Morning/Day/Night's seed files, this one *does* also override the
-- icon/color picked in the form, below, since that was asked for
-- explicitly this time). Safe to re-run: flips workspace_type again if
-- needed, and only seeds steps if the project doesn't already have any.
--
-- Same "mode of time," not "one-time checklist," shape as Day Routine:
-- tapping Work doesn't track which task, just that this stretch of
-- evening is work time, so the same three items repeat as often as
-- needed rather than being crossed off once. Evening sits between Day
-- and Night — after work/projects/self-care wind down is when Night
-- Routine's fixed bedtime-prep checklist (brush teeth, shower, etc.)
-- takes over.

update public.projects
set workspace_type = 'routine',
    icon = 'sunset',
    icon_type = 'lucide',
    color = 'amber'
where name = 'Evening Routine';

insert into public.routine_steps (project_id, user_id, name, icon, color, sort_order)
select p.id, p.user_id, v.name, v.icon, v.color, v.sort_order
from public.projects p
cross join (
  values
    ('Work', 'briefcase', 'sage', 0),
    ('Projects', 'palette', 'amber', 1),
    ('Maintenance', 'sparkles', 'lavender', 2)
) as v(name, icon, color, sort_order)
where p.name = 'Evening Routine'
  and not exists (
    select 1 from public.routine_steps rs where rs.project_id = p.id
  );

-- Slots Evening between Day and Night in the Routines list (Night was
-- previously 2, set by seed_day_routine.sql).
update public.projects set sort_order = 0 where name = 'Morning Routine';
update public.projects set sort_order = 1 where name = 'Day Routine';
update public.projects set sort_order = 2 where name = 'Evening Routine';
update public.projects set sort_order = 3 where name = 'Night Routine';
