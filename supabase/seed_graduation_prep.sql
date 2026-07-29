-- Turns an existing "Graduation Prep" project into a navigation-hub
-- workspace (see js/navBoard.js) with four independent status panels,
-- flat on one screen — each one tap-to-cycles its own in progress
-- (yellow) / waiting (blue) / complete (green) separately, so e.g.
-- Academics can read complete while Housing is still in progress:
--
-- Graduation Prep (project)
-- ├── Academics       → status panel
-- ├── Housing         → status panel
-- ├── Career Seeds    → status panel
-- └── Graduation Prep → status panel
--
-- Run this AFTER creating a project named exactly "Graduation Prep"
-- through the app's normal "Add a Project" flow (name matters, icon/color
-- picked in the form don't). Safe to re-run: flips workspace_type again
-- if needed, and only seeds panels that don't already exist by title.
--
-- To change a label, icon, or color later, just update the row directly,
-- e.g.: update public.nav_items set icon = '...' where title = 'Housing';

update public.projects
set workspace_type = 'nav'
where name = 'Graduation Prep';

insert into public.nav_items (project_id, user_id, parent_id, kind, title, icon, color, sort_order)
select p.id, p.user_id, null, v.kind, v.title, v.icon, v.color, v.sort_order
from public.projects p
cross join (
  values
    ('status', 'Academics', 'graduation-cap', 'blue', 0),
    ('status', 'Housing', 'home', 'sage', 1),
    ('status', 'Career Seeds', 'sprout', 'amber', 2),
    ('status', 'Graduation Prep', 'award', 'lavender', 3)
) as v(kind, title, icon, color, sort_order)
where p.name = 'Graduation Prep'
  and not exists (
    select 1 from public.nav_items ni where ni.project_id = p.id and ni.title = v.title
  );
