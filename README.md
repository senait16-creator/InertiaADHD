# InertiaADHD — Personal Visual Workspace (v1)

A personal visual workspace: a calm home screen that guides you toward
whichever area of your life needs you right now, instead of one flat list
of everything. Version 1 is intentionally small — see `Out of scope` below.

Plain HTML/CSS/JS (no build step) + Supabase, deployed to GitHub Pages.

## Information architecture

The home screen (`index.html`) is five entry panels, not a project grid,
and has no subtitle — the layout is meant to communicate what's relevant
by itself rather than a line of text explaining it:

```
Home
├─ Morning / Night / Routines  → dynamic, see below
├─ Maintenance                 → calm placeholder (self-care areas, not built yet)
├─ Projects                    → the original project dashboard (everything else)
├─ 2026 Vision                 → calm placeholder
└─ Reminders                   → calm placeholder, deliberately the smallest panel
```

The first panel is dynamic rather than always "Routines": mornings
(roughly 5–11am) it becomes a direct **Morning** shortcut straight into
the Morning Routine board, skipping the routines list entirely; nights
(8pm–5am) it becomes **Night** the same way. Outside those hours — or if
the relevant routine project doesn't exist yet — it falls back to a
generic **Routines** card pointing at the full list (`routines.html`),
which is also where any additional routines (Sunday Reset, Travel, etc.)
would live rather than cluttering the home screen. Every other panel and
the tile treatment itself stay exactly the same either way — only this
one tile's content and link change.

## Preview mode

Until real Supabase credentials are added to `js/supabaseClient.js`, the app
runs entirely in the browser: no sign-in required, and projects are stored in
`localStorage` (see `js/demoStore.js`) instead of a real account. A small
banner on the home screen makes this visible. This exists so the interface
can be reviewed on a phone or desktop before any backend is wired up — once
real keys are added, the app automatically switches to Supabase + magic-link
auth, and the banner disappears.

Real credentials are now wired into `js/supabaseClient.js`, so this
deployment runs in normal (signed-in) mode. The first time you sign in on a
device that had preview-mode data saved, any leftover local projects are
copied into your account automatically and the local copies are cleared —
you'll see a brief "Imported N projects" note the one time this happens.

## Setup

### 1. Run the database schema

Open the SQL editor for your Supabase project and run `supabase/schema.sql`:
https://supabase.com/dashboard/project/moiorcyltstlrhwxxuzk/sql/new

This creates the `projects` and `routine_steps` tables with Row Level
Security so each signed-in user can only read and write their own rows.
Every statement in it is idempotent (safe to re-run), so if you already ran
it once, just re-run it to pick up any new columns/tables added since.

### 2. Add your Supabase keys

In `js/supabaseClient.js`, replace the placeholders with your project's
values (Supabase dashboard → Project Settings → API):

```js
const SUPABASE_URL = "https://moiorcyltstlrhwxxuzk.supabase.co";
const SUPABASE_ANON_KEY = "<your anon/public key>";
```

The anon key is meant to be public — access control comes from the RLS
policies in `schema.sql`, not from hiding this key.

### 3. Configure auth

Sign-in is passwordless: enter your email, get a 6-digit code, type it in —
no password, no leaving the app. The session persists in the browser so
normal visits go straight to the home screen.

In Supabase → Authentication → Email Templates → **Magic Link**, make sure
the template includes `{{ .Token }}` somewhere in the body (the default
template only shows the link) so the code actually shows up in the email.

In Supabase → Authentication → URL Configuration, set:
- **Site URL**: your GitHub Pages URL (e.g. `https://senait16-creator.github.io/InertiaADHD/`)

### 4. (Optional) Set up routine workspaces

Most projects open to a blank placeholder page — that's still the default.
A project can instead open a visual, icon-first routine board (large tiles:
tap to focus a step, double-tap to mark it done, press-and-drag to
reorder), and shows up under **Routines** on the home screen instead of
**Projects**. To try it:

1. Create a project through the normal **Add a Project** flow (from the
   Projects panel), named exactly `Morning Routine` and/or `Night Routine`.
2. Run `supabase/seed_morning_routine.sql` and/or
   `supabase/seed_night_routine.sql` in the SQL editor. Each flags its
   project to use the routine workspace and seeds its steps.

The home screen looks for projects named exactly `Morning Routine` and
`Night Routine` to decide what the dynamic panel links to — other
routine-workspace projects still appear under Routines, just without a
home-screen shortcut. There's no UI yet for creating routine-workspace
projects some other way, or for editing a routine's steps beyond the
tap/double-tap/drag board itself.

### 5. Enable GitHub Pages

`.github/workflows/deploy.yml` deploys the site automatically on every push
to `main` via GitHub Actions. In the repo, go to **Settings → Pages** and set
**Source** to "GitHub Actions" once, then pushes to `main` deploy
automatically.

## Local development

No build tools needed — just serve the folder statically, e.g.:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Structure

```
index.html            home screen (five entry panels, one time-aware)
login.html             passwordless sign-in
routines.html            list of routine-workspace projects
projects.html             the original project dashboard (Add Project modal)
maintenance.html            calm placeholder
vision.html                   calm placeholder
reminders.html                  calm placeholder
project.html                      single project view (edit / delete / routine board)

css/styles.css          shared styles

js/supabaseClient.js    Supabase connection (fill in your keys)
js/auth.js               session helpers
js/demoStore.js            local preview data (used until Supabase is configured)
js/colors.js                 project color palette + color-picker widget
js/lucideIcons.js              curated Lucide icon set + icon-picker widget
js/routineBoard.js               visual routine board (tap / double-tap / drag)
js/home.js                         home screen logic
js/login.js                          sign-in logic
js/routines.js                         routines list logic
js/projects.js                           projects dashboard logic
js/maintenance.js                          maintenance placeholder logic
js/vision.js                                 vision placeholder logic
js/reminders.js                                reminders placeholder logic
js/project.js                                    project detail logic

supabase/schema.sql                database schema + RLS policies
supabase/seed_morning_routine.sql    one-off seed for Morning Routine
supabase/seed_night_routine.sql        one-off seed for Night Routine
```

Kept deliberately flat and framework-free — one HTML/JS pair per screen, no
router, no framework — so more areas can be added later the same way,
without a rewrite.

## Credits

Icons use a curated subset of [Lucide](https://lucide.dev) (ISC license),
self-hosted as inline SVG in `js/lucideIcons.js` — no CDN dependency.

## Out of scope for v1

Tasks, habits, calendars, notifications, collaboration, notes, file
uploads, AI features, progress percentages, and public profiles are all
intentionally deferred. The Projects dashboard itself stays a plain grid of
project cards — no tabs, filters, or metrics there. Maintenance, 2026
Vision, and Reminders are calm visual placeholders with no tracking,
scheduling, or notification logic behind them yet.

The one exception is the routine workspace: a hand-picked prototype of
drag-and-drop reordering and a tap/double-tap interaction model, meant to
validate the feel before any general "workspace types" system gets built.
