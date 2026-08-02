-- Turns an existing "Fidel Classroom" project into a navigation-hub
-- workspace (see js/navBoard.js) with this flat structure — everything
-- on one screen, no nested folder:
--
-- Fidel Classroom (project)
-- ├── Fidel Classroom   → status panel (tap to cycle in progress/waiting/complete)
-- ├── My Amharic Path   → external link
-- ├── Teacher Dashboard → external link
-- └── Project Notes     → Notion link
--
-- Run this AFTER creating a project named exactly "Fidel Classroom"
-- through the app's normal "Add a Project" flow (name matters, icon/color
-- picked in the form don't). Safe to re-run.
--
-- To change a label or URL later, just update the row directly, e.g.:
--   update public.nav_items set url = '...' where title = 'Teacher Dashboard';

update public.projects
set workspace_type = 'nav'
where name = 'Fidel Classroom';

-- Fresh install: all four panels at the root, flat.
insert into public.nav_items (project_id, user_id, parent_id, kind, title, icon, color, sort_order, url)
select p.id, p.user_id, null, v.kind, v.title, v.icon, v.color, v.sort_order, v.url
from public.projects p
cross join (
  values
    ('status', 'Fidel Classroom', 'language', 'amber', 0, null),
    ('link', 'My Amharic Path', 'route', 'sage', 1, 'https://senait16-creator.github.io/fidel-classroom/'),
    ('link', 'Teacher Dashboard', 'layout-dashboard', 'blue', 2, 'https://senait16-creator.github.io/fidel-classroom/'),
    ('link', 'Project Notes', 'notebook-pen', 'lavender', 3, 'https://app.notion.com/p/Fidel-Classroom-the-Classroom-3abf72174b1b8041ab81cdc6aa7f4193')
) as v(kind, title, icon, color, sort_order, url)
where p.name = 'Fidel Classroom'
  and not exists (
    select 1 from public.nav_items ni where ni.project_id = p.id and ni.title = v.title
  );

-- Migration for anyone who already seeded the earlier nested version of
-- this (Fidel Classroom as a folder containing Teacher Dashboard and
-- Project Notes): flatten it. Turns the "Fidel Classroom" folder into
-- the status panel, and promotes its two children up to the root level,
-- next to My Amharic Path. Naturally a no-op once already flat, so this
-- is safe to re-run alongside the fresh-install insert above.
update public.nav_items rs
set kind = 'status', sort_order = 0
from public.projects p
where rs.project_id = p.id
  and p.name = 'Fidel Classroom'
  and rs.title = 'Fidel Classroom'
  and rs.parent_id is null
  and rs.kind = 'folder';

update public.nav_items child
set parent_id = null, sort_order = 2
from public.projects p, public.nav_items parent
where child.project_id = p.id
  and p.name = 'Fidel Classroom'
  and child.title = 'Teacher Dashboard'
  and child.parent_id = parent.id
  and parent.title = 'Fidel Classroom';

update public.nav_items child
set parent_id = null, sort_order = 3
from public.projects p, public.nav_items parent
where child.project_id = p.id
  and p.name = 'Fidel Classroom'
  and child.title = 'Project Notes'
  and child.parent_id = parent.id
  and parent.title = 'Fidel Classroom';

-- Updates the Fidel Classroom status panel's icon even if it was
-- already seeded with the older 'graduation-cap' icon. Safe to re-run.
update public.nav_items
set icon = 'language'
from public.projects p
where nav_items.project_id = p.id
  and p.name = 'Fidel Classroom'
  and nav_items.title = 'Fidel Classroom'
  and nav_items.kind = 'status';
