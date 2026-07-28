-- Turns an existing "Fidel Classroom" project into a navigation-hub
-- workspace (see js/navBoard.js) with this structure:
--
-- Fidel Classroom (project)
-- ├── Fidel Classroom (folder)
-- │   ├── Teacher Dashboard  → external link
-- │   └── Project Notes     → Notion link
-- └── My Amharic Path       → external link
--
-- Run this AFTER creating a project named exactly "Fidel Classroom"
-- through the app's normal "Add a Project" flow (name matters, icon/color
-- picked in the form don't). Safe to re-run: flips workspace_type again if
-- needed, and only seeds items where none already exist at that level.
--
-- To change a label or URL later, just update the row directly, e.g.:
--   update public.nav_items set url = '...' where title = 'Teacher Dashboard';

update public.projects
set workspace_type = 'nav'
where name = 'Fidel Classroom';

-- Root-level items: the "Fidel Classroom" folder + the "My Amharic Path" link.
insert into public.nav_items (project_id, user_id, parent_id, kind, title, icon, color, sort_order, url)
select p.id, p.user_id, null, v.kind, v.title, v.icon, v.color, v.sort_order, v.url
from public.projects p
cross join (
  values
    ('folder', 'Fidel Classroom', 'graduation-cap', 'amber', 0, null),
    ('link', 'My Amharic Path', 'route', 'sage', 1, 'https://senait16-creator.github.io/fidel-classroom/')
) as v(kind, title, icon, color, sort_order, url)
where p.name = 'Fidel Classroom'
  and not exists (
    select 1 from public.nav_items ni where ni.project_id = p.id and ni.parent_id is null
  );

-- Children of the "Fidel Classroom" folder: Teacher Dashboard + Project Notes.
insert into public.nav_items (project_id, user_id, parent_id, kind, title, icon, color, sort_order, url)
select p.id, p.user_id, parent.id, v.kind, v.title, v.icon, v.color, v.sort_order, v.url
from public.projects p
join public.nav_items parent
  on parent.project_id = p.id
  and parent.parent_id is null
  and parent.title = 'Fidel Classroom'
  and parent.kind = 'folder'
cross join (
  values
    ('link', 'Teacher Dashboard', 'layout-dashboard', 'blue', 0, 'https://senait16-creator.github.io/fidel-classroom/'),
    ('link', 'Project Notes', 'notebook-pen', 'lavender', 1, 'https://app.notion.com/p/Fidel-Classroom-the-Classroom-3abf72174b1b8041ab81cdc6aa7f4193')
) as v(kind, title, icon, color, sort_order, url)
where p.name = 'Fidel Classroom'
  and not exists (
    select 1 from public.nav_items ni where ni.project_id = p.id and ni.parent_id = parent.id
  );
