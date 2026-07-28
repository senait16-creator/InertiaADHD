# InertiaADHD — Personal Project Dashboard (v1)

A personal visual workspace: one consistent place to land, see your active
projects as cards, and re-enter one. Version 1 is intentionally small — see
`Out of scope` below.

Plain HTML/CSS/JS (no build step) + Supabase, deployed to GitHub Pages.

## Preview mode

Until real Supabase credentials are added to `js/supabaseClient.js`, the app
runs entirely in the browser: no sign-in required, and projects are stored in
`localStorage` (see `js/demoStore.js`) instead of a real account. A small
banner on the dashboard makes this visible. This exists so the interface can
be reviewed on a phone or desktop before any backend is wired up — once real
keys are added, the app automatically switches to Supabase + magic-link
auth, and the banner disappears.

## Setup

### 1. Run the database schema

Open the SQL editor for your Supabase project and run `supabase/schema.sql`:
https://supabase.com/dashboard/project/moiorcyltstlrhwxxuzk/sql/new

This creates the `projects` table with Row Level Security so each signed-in
user can only read and write their own rows.

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

Sign-in uses Supabase's passwordless email link (magic link) — the smallest
secure option for a single user, and the session persists in the browser so
normal visits go straight to the dashboard.

In Supabase → Authentication → URL Configuration, set:
- **Site URL**: your GitHub Pages URL (e.g. `https://senait16-creator.github.io/inertiaadhd/`)
- **Redirect URLs**: add the same URL plus `index.html`, e.g.
  `https://senait16-creator.github.io/inertiaadhd/index.html`

### 4. Enable GitHub Pages

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
index.html          dashboard (project grid + Add Project modal)
login.html           passwordless sign-in
project.html          single project view (edit / delete)
css/styles.css        shared styles
js/supabaseClient.js  Supabase connection (fill in your keys)
js/auth.js            session helpers
js/demoStore.js        local preview data (used until Supabase is configured)
js/dashboard.js        dashboard logic
js/login.js            sign-in logic
js/project.js           project detail logic
supabase/schema.sql     database schema + RLS policies
```

Kept deliberately flat and framework-free so features can be layered in
later (routines, notes, more project fields) without a rewrite.

## Out of scope for v1

Tasks, routines, habits, calendars, notifications, collaboration, notes,
file uploads, AI features, progress percentages, drag-and-drop, and public
profiles are all intentionally deferred. v1 is only the dashboard and basic
project cards.
