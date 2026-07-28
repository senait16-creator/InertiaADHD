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

insert into public.routine_steps (project_id, user_id, name, icon, color, sort_order)
select p.id, p.user_id, v.name, v.icon, v.color, v.sort_order
from public.projects p
cross join (
  values
    ('Morning video', 'monitor-play', 'sage', 0),
    ('Audiobook', 'headphones', 'blue', 1),
    ('Fidel Classroom', 'graduation-cap', 'amber', 2),
    ('10K Steps', 'footprints', 'green', 3),
    ('Brush teeth', 'brush-cleaning', 'lavender', 4),
    ('Wash face', 'droplets', 'blue', 5),
    ('Shower', 'shower-head', 'sage', 6),
    ('Stretch', 'activity', 'green', 7),
    ('Exercise', 'dumbbell', 'amber', 8),
    ('Bible Study', 'book-heart', 'lavender', 9)
) as v(name, icon, color, sort_order)
where p.name = 'Morning Routine'
  and not exists (
    select 1 from public.routine_steps rs where rs.project_id = p.id
  );
