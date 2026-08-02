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
├─ Maintenance                 → self-care areas + Inventory ("what I own") + Relationships
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

The page background is also time-of-day aware (see `applyBackgroundGradient`
in `js/home.js`): a soft golden-hour gradient in the morning (5–11am), a
soft dusk gradient through evening and night (5pm–5am), and the plain
background through the middle of the day. Panels, icon colors, and text
are unaffected either way — only the backdrop behind them changes.

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

Sign-in is plain email + password. The session persists in the browser so
normal visits go straight to the home screen.

Create the account once in Supabase → Authentication → Users (or sign up
through Supabase directly), then set a password for it. `set-password.html`
in this app also works for setting/changing a password once signed in.

In Supabase → Authentication → URL Configuration, set:
- **Site URL**: your GitHub Pages URL (e.g. `https://senait16-creator.github.io/InertiaADHD/`)

### 4. (Optional) Set up routine workspaces

Most projects open to a blank placeholder page — that's still the default.
A project can instead open a visual, icon-first routine board (large
tiles that step through a state on every plain tap — ⚪ Available → ⚫
Ready (up next; not exclusive, so a few steps can be Ready at once) →
🟡 In Progress (rises to the top) → 🟢 Complete (sinks to the bottom) →
back to Available — plus press-and-drag to reorder within the board
itself), and shows up under **Routines** on the home screen instead of
**Projects**. Deliberately plain taps rather than double-taps, so
there's no timing window to fight with the phone's own double-tap-zoom
gesture. In-progress steps rise to the top, Ready steps come next, and
complete steps sink to the bottom, all automatically — and any step
still marked done from an earlier day resets back to not-done the next
time the board loads, so the board always reflects today, not a
running history.

Every step shows a completion timestamp once it turns Complete, e.g.
"Done 8:14 AM" — that part isn't gated by anything. Duration tracking
is a separate, opt-in-per-step addition on top of that: long-press a
step for "Edit Routine Item" and turn on **Track duration**. A tracked
step shows a small clock badge, and once complete also shows how long
it took, e.g. "Done 8:22 AM · 7 min" — the gap between the tap that
turned it In Progress and the tap that turned it Complete.

The same long-press modal also has an optional **Subtitle** — a short
free-text line shown under the step's title (e.g. which book an
Audiobook step is on right now), truncated rather than wrapped if it's
long. To try it:

1. Create a project through the normal **Add a Project** flow (from the
   Projects panel), named exactly `Morning Routine`, `Day Routine`,
   `Evening Routine`, and/or `Night Routine`.
2. Run `supabase/seed_morning_routine.sql`, `supabase/seed_day_routine.sql`,
   `supabase/seed_evening_routine.sql`, and/or `supabase/seed_night_routine.sql`
   in the SQL editor. Each flags its project to use the routine workspace
   and seeds its steps.

Day and Evening Routine are the odd ones out: unlike Morning/Night's
fixed daily checklist, their items (Day: Get Ready, Work / Job,
Academics, Project — Evening: Work, Projects, Maintenance) are broad
and repeatable — tapping Project just marks "I've started working on
one of my personal projects," not which one, so the same items apply
throughout the routine rather than being a one-time-per-day list.
Otherwise it's the exact same board with the exact same tap cycle.
Evening sits between Day and Night — Night Routine's fixed bedtime-prep
checklist takes over once work/projects/self-care wind down.

The home screen looks for projects named exactly `Morning Routine` and
`Night Routine` to decide what the dynamic panel links to — other
routine-workspace projects (Day Routine included) still appear under
Routines, just without a home-screen shortcut. There's no UI yet for
creating routine-workspace
projects some other way, or for editing a routine's steps beyond the
tap/drag board itself.

Every card also has a second, separately-tappable zone: the icon square
opens the step's attached resource (if it has one), while everything
else on the card — label, badges, the rest of its surface — always
advances the tap cycle above, no matter what the icon does. The two
never compete for the same tap: "do the task" and "open what's attached
to it" are deliberately different gestures on the same card. A step
with no resource just does nothing when its icon is tapped.

A step's resource is either a plain external `link` (opens in a new
tab), or, via its `kind` column (currently only set through a one-off
SQL update — see the `video_panel` blocks in
`supabase/seed_morning_routine.sql`), a small library of video cards —
Morning video and Stretch both work this way today. The step's own
status cycle is unaffected either way; for a video-library step it just
moves onto the same card, reused as the panel's own header. Each video
card stores a URL, display title, optional duration, optional note, and
display order:

- **Adding a video** — tap **+ Add Video**, paste any common YouTube
  link shape (`youtube.com/watch?v=…`, `youtu.be/…`, Shorts, or embed
  URLs). The thumbnail and title are derived automatically: the
  thumbnail from YouTube's standard thumbnail URL pattern (falling back
  to a lower resolution if the highest one isn't available for that
  video), the title via YouTube's public oEmbed endpoint — but only
  when the title field is still empty, so it never silently overwrites
  something typed by hand. A **↻** button next to the title always
  force-refetches on demand.
- **Editing a video** — tap the pencil icon on any card to change its
  URL, title, duration, note, or supply a custom thumbnail URL that
  overrides the automatic one. Replacing the URL re-derives the
  thumbnail (and the title, if it was still on its auto-fetched value).
- **A non-YouTube or unreachable URL** doesn't block the panel — the
  card just shows a generic placeholder ("Preview unavailable") and
  stays fully editable.
- Tapping a card's thumbnail/title (not the pencil) opens its URL in a
  new tab. Deleting is available from the same edit modal.

The five starting cards (once seeded) aren't a finished routine to
maintain — they're a small, disposable experiment: try one for a week,
then replace or keep it. There's no cap on how many cards a panel can
hold.

Long-press a step and check **Not today** for a third option beyond the
usual done/not-done: the card turns blue and sinks below even Complete
(see `statusRank`), for a step you're deliberately setting aside for
today rather than skipping past on the way to Complete. It isn't part
of the normal tap cycle — a plain tap on a "Not Today" card just undoes
it, back to Available — and it resets on its own the next day, same as
Complete does. Each time a step is marked this way it's also logged to
a permanent `routine_skips` table (mirroring how completions are logged
to `routine_completions`), so a future Insights view could eventually
notice a skip pattern the same way it already notices completions.

Some habits are only naturally *partly* done by the end of one routine
— 10K Steps doesn't really finish by breakfast. Check **Continues in
phases** in the same long-press modal (deliberately opt-in per step,
not something every step gets, so it stays meaningful rather than
becoming a generic "I'll do it later" escape hatch) and completing that
step offers to drop a small continuation card — "Finish Remaining 10K
Steps" — into another routine. The original still turns green like any
completion (Morning isn't lying about what happened), but also picks up
a small hourglass badge for as long as that continuation card stays
open; completing the continuation elsewhere clears the badge, and a
completed continuation gets deleted outright on the next day's load
(rather than reset like a normal step) since it was only ever temporary
for that one day. 10K Steps in Morning Routine is seeded this way
already — the same checkbox works for anything else that's naturally
phased (hydration, say), no code changes needed to add another.

### 5. Routine Insights

Every routine board quietly logs a permanent history row each time a
step is tapped Complete (see `recordCompletion` in `js/routineBoard.js`
and the `routine_completions` table) — separate from the board's own
state, which only reflects today and resets daily. The routine board
answers "what do I want to do next"; Insights (`insights.html`, opened
from the small chart icon at the top right of the Routines page)
answers "what patterns am I noticing" — the two stay deliberately
separate, and the board never reads its own history back.

Insights is reflection, not motivation: no streaks, badges, progress
rings, or red "missed day" warnings — just plain counts, averages, and
small single-color charts, switchable between **Days** / **Weeks** /
**Months** / **Years** (like Apple Health, this changes both the
chart's bucket size and the underlying averaging window). It shows:

- **Routine Flow** — a few plain-language observations, only once
  there's enough data behind them (e.g. "Your average morning routine
  starts at 7:42 AM and takes 46 minutes," "You almost always complete
  Water before Medication").
- **Overall** — for a project named exactly `Morning Routine` or
  `Night Routine`: how many days it was fully completed, and the
  average start/completion time and duration.
- **Individual Routine Items** — every step across every routine
  project: how often it's done, its average time of day, and (if
  tracked) its average duration.
- **Track Time** — just the steps with duration tracking on (see
  section 4): average/shortest/longest duration and total time spent
  in the selected range.
- **Not Today** — how often each step got set aside rather than done
  (see section 4's Not Today toggle), per step, with the same small
  trend chart as Individual Routine Items. Framed as a pattern to
  notice, not a miss to explain — same non-judgmental stance as the
  rest of this page. Only appears once there's a skip logged; a fresh
  account (or one that's never used the toggle) simply won't show this
  section.

### 6. Maintenance

Maintenance (`maintenance.html`) is a grid of self-care areas (see
`js/maintenanceAreas.js`) — the same rectangular panel-tile treatment
used everywhere else in the app (Routines, nav-board, ...), not a
full-width list. Only areas with a real board built belong in that
list at all — currently Inventory, Hair, Hair Care, Skin Care, Body
Care, Nail Care, Jewelry, Tech, Digital, and Relationships.

Hair (`hair.html` and friends) is its own experimentation framework,
not a category board — see "Hair Lab" below.

Inventory, and the Hair Care/Skin Care/Body Care/Nail Care/Jewelry
areas, are three separate concepts on purpose — see "Inventory" below
for the full rationale: Inventory answers "what do I own," Maintenance
answers "how do I care for and use what I own" by referencing Inventory
items rather than duplicating them, and Hair Lab (above) answers "how
do I test and improve a routine."

Relationships (`relationships.html`, `person.html`) is a different
shape — one profile per person, not a plain list — so it's its own
pair of pages rather than another category board (see
`js/maintenanceAreas.js`'s `href` override). The point is noticing your
relationship landscape and being intentional about it, not tracking
"performance": no health scores, streaks, or "overdue" warnings
anywhere. Tap **+ Add Person** for a profile with:

- **Relationship Circle** — single-select (Core / Go-To, Close Friend,
  Community, Growing Friendship, Distant Friend, Acquaintance, Family,
  Mentor, Professional).
- **Current Season** — multi-select tags (Flourishing, Growing, Stable,
  Needs Tending, Gray Area, Reconciliation, Space, Boundaries) — an
  honest description of the present, not a rating.
- **Investment Intention** — single-select (Invest More, Maintain,
  Occasional Check-ins, Give Space, Revisit Later).
- **How I Feel Around Them** — multi-select tags (Safe, Peaceful,
  Energized, Seen, Comfortable, Curious, Uncertain, Tense, Drained,
  Anxious, Guarded) — a private observation, not a judgment of them.
- **Last Meaningful Connection** — a date, never turned into a
  countdown or "overdue" flag.
- **Relationship Intention** — a short free-text answer to "What does
  loving this person well look like in this season?"
- **Notes** — free text for life updates, prayer needs, birthdays,
  anything worth remembering.

The list page filters by circle/season/investment intention, plus a
gentle **Reconnect** view: people whose season reads positive/stable
(at least one of Flourishing/Growing/Stable — see
`isReconnectCandidate` in `js/relationshipOptions.js`), whose stated
intention is to stay engaged (Invest More/Maintain/Occasional
Check-ins), and who haven't had a connection logged in 30+ days (or
ever). It's presented as a quiet aside under the card ("You haven't had
a meaningful connection with Maya in a while"), never a red flag or a
count. Long-press a card for Edit/Delete, same pattern as a project
card.

### 7. Navigation-hub projects (e.g. Fidel Classroom)

A project can instead open a flat set of panels (see `js/navBoard.js`),
three kinds: a `link` panel opens an external URL in a new tab; a
`folder` panel opens another screen of panels in-page, for when a
project's structure genuinely needs nesting; a `status` panel doesn't
navigate anywhere — tapping it cycles its own status instead (not
started -> in progress, yellow -> waiting, blue -> complete, green ->
back to not started), the same tap-to-advance idea as the routine board.
That's how a project's own status shows up: as one panel among its
others, not a separate component. It's generic — any project can use
it — and stays a calm navigation hub, no task lists or notes inside it.
To try the first real example:

1. Create a project through **Add a Project**, named exactly
   `Fidel Classroom`.
2. Run `supabase/seed_fidel_classroom.sql` in the SQL editor. It flags the
   project to use this workspace and seeds four panels flat, on one
   screen:
   ```
   Fidel Classroom (project)
   ├── Fidel Classroom   → status panel (tap to cycle in progress/waiting/complete)
   ├── My Amharic Path   → external link
   ├── Teacher Dashboard → external link
   └── Project Notes     → Notion link
   ```

`supabase/seed_graduation_prep.sql` is a second example, showing status
panels can also stand in for sub-areas rather than just the project
itself — a `Graduation Prep` project with four independent status
panels (Academics, Housing, Career Seeds, and Graduation Prep as a
catch-all), each cycling on its own:
```
Graduation Prep (project)
├── Academics       → status panel
├── Housing         → status panel
├── Career Seeds    → status panel
└── Graduation Prep → status panel
```

There's no in-app editor for this yet — change a label, icon, color, or
URL by updating the `nav_items` row directly in the SQL editor (e.g.
`update public.nav_items set url = '...' where title = 'Teacher Dashboard';`).

### 8. Enable GitHub Pages

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
login.html             email + password sign-in
set-password.html       set/change the account password
routines.html            list of routine-workspace projects
insights.html             Routine Insights (reflection, not motivation)
projects.html               the original project dashboard (Add Project modal)
maintenance.html              list of self-care areas with a real board built
category.html                    a maintenance area's board (generic 4-section)
relationships.html                  list of people (Maintenance → Relationships)
person.html                            one person's relationship profile
hair.html                                 Hair Lab home (reorderable panel grid)
hair-products.html                          Products list (Inventory items, area=hair)
hair-product.html                             one product (identity + hair usage + stats)
hair-washlog.html                               Wash Log
hair-experiments.html                             Experiments list
hair-experiment.html                                one experiment (full structured form)
hair-gallery.html                                     Results Gallery
hair-learned.html                                       What I've Learned
hair-notes.html                                           Notes & Resources
inventory.html                                              Inventory home (category grid)
inventory-items.html                                          Inventory item list, sticker gallery (?area=)
inventory-item.html                                             one item: sticker + identity + purchases + "used in"
maintenance-home.html                                             a Maintenance area's Active Routine + Items gallery (?area=)
maintenance-history.html                                            a Maintenance area's routine version timeline (?area=)
maintenance-log.html                                                  a Maintenance area's log entries + locked snapshot (?area=)
vision.html                               calm placeholder
reminders.html                              calm placeholder
project.html                                    single project view (edit / delete / routine board)

css/styles.css          shared styles

js/supabaseClient.js    Supabase connection (fill in your keys)
js/auth.js               session helpers
js/demoStore.js            local preview data (used until Supabase is configured)
js/colors.js                 project color palette + color-picker widget
js/lucideIcons.js              curated Lucide icon set + icon-picker widget
js/routineBoard.js               visual routine board (tap-to-advance / drag)
js/insights.js                     Routine Insights — reads routine_completions only
js/navBoard.js                        navigation-hub board (folder / link panels)
js/maintenanceAreas.js                   fixed list of maintenance areas
js/relationshipOptions.js                   fixed option lists + Reconnect heuristic
js/relationships.js                            people list, filters, long-press menu
js/person.js                                      one person's profile (create/edit/delete)
js/hairShared.js                                    shared Hair constants + Start Experiment modal
js/hair.js                                            Hair Lab home logic (reorderable panels)
js/hairProducts.js                                      Products list logic (Inventory items, area=hair)
js/hairProduct.js                                         one product (identity + hair usage + stats)
js/hairWashLog.js                                           Wash Log logic
js/hairExperiments.js                                         Experiments list logic
js/hairExperiment.js                                            one experiment's full form
js/hairGallery.js                                                 Results Gallery (photo upload)
js/hairLearned.js                                                   What I've Learned logic
js/hairNotes.js                                                       Notes & Resources logic
js/inventory.js                                                         Inventory home logic
js/inventoryItems.js                                                      Inventory item list + sticker gallery logic
js/inventoryItem.js                                                         one item: sticker + identity + purchases logic
js/maintenanceShared.js                                                       AREAS config + duration/cost helpers
js/stickerShared.js                                                             Sticker Library: shared choose/create modals + crop
js/maintenanceHome.js                                                             Active Routine (view/edit) + Items gallery logic
js/maintenanceHistory.js                                                            routine version timeline logic
js/maintenanceLog.js                                                                  log entry + locked snapshot logic
js/home.js                                           home screen logic
js/login.js                                            sign-in logic
js/setPassword.js                                        set/change password logic
js/routines.js                                             routines list logic
js/projects.js                                               projects dashboard logic
js/maintenance.js                                              maintenance areas list logic
js/category.js                                                   maintenance board (add/edit/delete/reorder)
js/vision.js                                                       vision placeholder logic
js/reminders.js                                                      reminders placeholder logic
js/project.js                                                          project detail logic

supabase/schema.sql                database schema + RLS policies
supabase/seed_morning_routine.sql    one-off seed for Morning Routine
supabase/seed_day_routine.sql          one-off seed for Day Routine
supabase/seed_evening_routine.sql        one-off seed for Evening Routine
supabase/seed_night_routine.sql          one-off seed for Night Routine
supabase/seed_fidel_classroom.sql          one-off seed for Fidel Classroom
supabase/seed_graduation_prep.sql            one-off seed for Graduation Prep
```

Kept deliberately flat and framework-free — one HTML/JS pair per screen, no
router, no framework — so more areas can be added later the same way,
without a rewrite.

## Credits

Icons use a curated subset of [Tabler](https://tabler.io/icons) (MIT
license), self-hosted as inline SVG in `js/lucideIcons.js` (filename kept
for import compatibility) — no CDN dependency.

## Out of scope for v1

Tasks, habits, calendars, real push notifications, collaboration, file
uploads, AI features, progress percentages, and public profiles are all
intentionally deferred. The Projects dashboard itself stays a plain grid
of project cards, border colored by identity, same as any other project.
2026 Vision and Reminders are calm visual placeholders with no tracking,
scheduling, or notification logic behind them yet. Routine Insights'
"occasional encouraging summaries" (see section 5) are read in-page
rather than pushed — this is a static site with no server to send an
actual notification from.

Edit/Delete for a project live behind the ⋯ button at the top of its
page (or long-press the card from the list) — kept off the page itself
so the page stays about the workspace, not managing the project.
Inactivity nudges tied to a nav board's "in progress" status panel are a
deliberate future version, not built yet.

Four exceptions so far: the routine workspace (a hand-picked prototype of
drag-and-drop reordering and a tap-to-advance-state interaction model),
Hair (its own experimentation framework, see "Hair Lab" below), the
navigation-hub workspace (link/folder/status panels, first used for
Fidel Classroom), and Relationships (its own richer per-person profile,
since a person doesn't fit the plain title/notes/link shape a category
board uses) — all meant to validate a feel before any general system
gets built around them. Relationships follows the same spirit in its
own vocabulary: Season and Feelings are honest descriptions, never a
score, and Reconnect is a quiet aside, never an overdue warning.

### Hair Lab

Hair (`hair.html` and friends) has a different premise than the rest of
Maintenance — not "give me the right routine," but "help me become my
own expert." The premise: hair has too many interacting variables (curl
pattern, density, porosity, health, climate, product combinations,
drying method, water content, technique) for someone else's routine to
reliably transfer to your own hair. So instead of "what routine should
I use," it's built around "what happens if I change this one
variable," and every screen answers one of four questions — Routine
("what do I usually do?"), Experiment ("what am I trying?"),
Observation ("what happened?"), Learning ("what do I now know?") — shown
as a small loop strip at the top of `hair.html`.

Seven panels, reorderable by press-and-drag (order persisted per-user
in `hair_settings`): **Hair Routine** (`maintenance-home.html?area=hair`)
— the current process as a sticker-forward Active Routine, not an
experiment; the exact same generic Maintenance area page every other
category uses (Active Routine + Items gallery + History + Log), not a
Hair-only one — see "Stickers, Versioned Routines & Logs" below.
**Products** (`hair-products.html`/`hair-product.html`) — Inventory
items filed under Hair Products, sticker-forward like everywhere else,
manually added (name/brand/category/notes); a product's detail page
computes (never asks you to track) Experiments Used, Average Results,
Most Common Pairing, and a one-sentence insight ("Works best when hair
is very damp") that only appears once 2+ well-rated experiments using
it agree on a moisture level — silence until there's real signal, same
restraint as Insights (section 5). See "Inventory" below for why
products live there instead of a Hair-only table.
**Wash Log** (`hair-washlog.html`) — plain history entries (products
used, style before, notes) that either show a link to the experiment
they became, or a "start an experiment from this wash" action.
**Experiments** (`hair-experiments.html`/`hair-experiment.html`) — the
core of it: every experiment opens with one sentence ("What am I
changing? Everything stays the same. Only this changes: ___"), then
structured fields (section tested, hair condition, moisture, products
used + order, drying method with conditional RevAir fields when
selected, protective style after), six 5-star result ratings
(Definition/Volume/Softness/Frizz/Shrinkage/Longevity), observations
with a one-tap "Save as a lesson," liked/disliked short-lists, what to
try next, and would-I-repeat-this rather than a pass/fail. A "Testing:
___" banner is a soft reminder only, not a field lock. **Results
Gallery** (`hair-gallery.html`) — experiment → result → photo → date,
photos resized client-side and stored in Supabase Storage's
`hair-photos` bucket (or as a data URL in demo mode). **What I've
Learned** (`hair-learned.html`) — permanent lessons, mostly arriving
via an experiment's "Save as a lesson," a personal handbook rather than
a re-read of every experiment. **Notes & Resources**
(`hair-notes.html`) — links, videos, product recommendations, ideas,
and future experiments to try someday.

Products are referenced everywhere by id, never by name, so renaming
one never breaks a pairing/lesson lookup.

Explicitly **not v1** (per an explicit decision to hold off until the
rest was built): voice capture (talk through an experiment naturally,
AI structures it) and product search/auto-import (search a product by
name, app imports brand/category/image/price/link) — both would need a
small server-side piece (speech-to-text, a scraping/lookup service, or
at minimum an Open Graph fetch for pasted product URLs, since the
browser can't fetch arbitrary external pages itself) and neither is
needed for the experimentation framework to be useful on its own. Also
deferred: any AI layer that reads *across* experiments (identifying
which variable likely caused an outcome, spotting repeated patterns,
suggesting the next variable to test, recommending sample sizes before
a full-size purchase) — the structured fields and permanent lessons
being built now are what any of that would eventually read from. Worth
noting for later: this framework isn't inherently hair-specific — hair
is just where it got proven out first.

### Inventory

Three separate concepts, kept deliberately apart so the app scales
past hair without every new category needing its own bespoke system:

- **Inventory** (`inventory.html` and friends) answers "what do I own."
- **Maintenance** (the Hair Care/Skin Care/Body Care/Nail Care/Jewelry
  tiles) answers "how do I care for and use what I own, in what order,
  and how has that changed over time," by *referencing* Inventory items
  rather than duplicating them.
- **Hair Lab's own tables** (Experiments, Wash Log) answer "how do I
  test and improve a routine before adopting it" — also referencing
  Inventory items, not a Hair-only product copy.

Inventory is the single source of truth for products across the whole
app, including Hair Lab. It has three levels, on purpose, not two:

- **`inventory_items`** — the reusable product identity: Sticker, Name,
  Brand, Category, Size, Status, Source URL, Notes. One row per
  distinct product, shared by every screen that touches it. **Status**
  is a fixed picklist (New / In Use / Almost Empty / Empty / Finished /
  Repurchase Needed / Archived), not free text — chosen so the gallery
  can reliably hide Finished items by default and offer a one-tap
  "Repurchase?" suggestion once something reads Empty, neither of which
  is possible with an open-ended Condition field.
- **`inventory_item_photos`** — a small gallery per item (upload a
  file, or on a phone, take a picture directly — the file input's
  `capture` attribute opens the camera). Separate from the item's
  Sticker (below): photos are "documentation," a sticker is
  "recognition" — the small icon you actually scan a shelf of items by.
  Not every item needs a routine or a cost, so this one lives directly
  under Inventory rather than any Maintenance area.
- **`inventory_purchases`** — one row per individually bought
  container of that item (a specific bottle or jar), each with its own
  Purchase Date/Price/Location and Date Started/Finished. Kept
  separate from the item's identity because "how long did *this* jar
  last" is a property of the jar, not the product — rebuying the same
  item logs a fresh purchase row rather than overwriting the last
  one's dates. Adding an item with a Price Paid filled in (on
  `maintenance-home.html`'s Add Item form) creates one of these rows
  behind the scenes rather than a separate flat field, so it's never a
  second source of truth for price. Estimated Duration and Estimated
  Monthly Cost are never stored, only computed at render time from a
  purchase's price and dates (see
  `estimatedDurationDays`/`estimatedMonthlyCost` in
  `js/maintenanceShared.js`), and only once a purchase has a full
  start-to-finish life to measure.
- **`maintenance_usage`** — how one item performs in *one* maintenance
  area, beyond Status: Rating (/10), Performance Notes, Repurchase.
  Currently edited from Hair Lab's own product page only (it doesn't
  have an obvious home on the generic sticker/gallery pages below, and
  nothing else in the app reads it) — a jar of coconut oil can still be
  rated 9/10 for Body Care and 4/10 for Hair Care at the same time,
  without two separate product records, if that ever gets its own
  generic surface again.

### Stickers, Versioned Routines & Logs

The generic Maintenance area page (`maintenance-home.html?area=skin`,
`?area=hair`, etc. — one page, `js/maintenanceHome.js`, used by every
area including Hair Care) merges what used to be three separate pages
(a products list, a product detail page, a plain routine list) into
one: an **Active Routine** widget on top, an **Items** gallery below,
plus links to that area's **History** (`maintenance-history.html`) and
**Log** (`maintenance-log.html`). The goal is a complete feedback loop
— own it, recognize it, use it in order, know when it ran out or
changed, see how the routine evolved over time, and correlate skin/hair
changes with routine changes — rather than a flat inventory list.

**Stickers** (`stickers` table, `js/stickerShared.js`) are the visual
identity you actually recognize things by — a small square image
(photograph or upload → drag-to-reposition + pinch-to-zoom crop →
saved as a ~320px WebP, JPEG fallback where a browser can't encode
WebP on canvas) attached to an Inventory item, a routine step, or
nothing at all (a placeholder step). Deliberately **not** its own page
in the nav — `js/stickerShared.js` injects one shared pair of modals
(Choose / Create) into any page that needs them once, so the crop UI
and the Sticker Library list exist in exactly one place instead of
being duplicated per page. Deleting a sticker is blocked while it's
still referenced by any Inventory item or routine step
(`isStickerInUse`). Background removal is an explicit **V2**: the
create-sticker modal has a "Remove background" checkbox, visibly
present but disabled and labeled a no-op — doing it well needs either a
client-side ML model (this app's first real dependency) or a
server-side proxy, the same category of deferred work as Hair Lab's
voice capture and product search.

**Routines** are versioned, not a single mutable list —
`routines` (one per area) → `routine_versions` (`ended_at IS NULL`
marks the current one; a version has a `version_number` and optional
`notes`) → `routine_version_items` (which items/stickers are in the
version, grouped into free-text `section`s like "Morning"/"Night", each
with a `position` for order). Tapping **Edit** on the Active Routine
widget reveals a sectioned builder — drag chips to reorder, tap a **+**
to insert (from Inventory or straight from the Sticker Library), tap a
step for its detail with a Remove option. Tapping **Done** with real
changes prompts a choice, not a silent save: **Update current
version** (fixing a typo or wrong sticker — the version stays one
entry in History) or **Start a new version** (an actual product swap —
closes today's version and opens the next one). Nothing about a closed
version is ever touched again, which is what makes History
trustworthy. `routine_version_items` deliberately keeps two *loose*
(no foreign key) references — `inventory_item_id` and `sticker_id` — in
the same row, so a closed version stays an accurate historical snapshot
even if the linked Inventory item or sticker is later deleted; the
sticker is the visual record, the item link is just a convenience while
it still exists. **History** (`maintenance-history.html`) is a
read-only timeline of every version, oldest reasoning first, each with
its date range, notes, and the stickers that were in it.

**Logs** (`maintenance_logs`, `maintenance-log.html`) are periodic
check-ins, not tied to any one product: Condition/Dryness/Irritation/
Breakouts (severity chips, not numeric scores), free-text Notes, and an
optional progress photo. Each log entry stores a loose
`routine_version_id` reference and renders that **exact version's**
sticker row inline as a permanent snapshot — editing the routine later,
even starting a whole new version, never changes what an old log entry
visually shows, which is the entire point: a log from three weeks ago
should still show what you were using three weeks ago, not what you
switched to since.

The item gallery on `maintenance-home.html` hides Status = Finished by
default behind a "Show Finished (N)" toggle, and offers a one-tap
"Repurchase?" suggestion chip once an item's Status reads Empty rather
than asking you to notice and update it yourself. An item's **Used In**
list (shown on both `inventory-item.html` and Hair Lab's own
`hair-product.html`) now reflects which areas' *current* routine
versions include it — derived from `routine_version_items` joined
through `routine_versions`/`routines` (`listCurrentRoutineMembershipsForItem`
in demo mode; a nested Supabase select in real mode) — rather than the
old flat per-area usage list, since "where does this actually live in
my routine right now" is what that section is for.

Skin Care, Body Care, Nail Care, Jewelry, Tech, and Digital
(`maintenance-home.html?area=skin`, etc.) share this one generic page
over these tables — Tech and Digital are nothing more than two more
keys in `js/maintenanceShared.js`'s `AREAS`, same gallery/Active
Routine/History/Log as any other area, just holding electronics or
software/subscriptions instead of skincare. Hair Care
(`maintenance-home.html?area=hair`) is the same generic system's
seventh area, no special-casing at all — it reads/writes the exact
same `inventory_items` rows (and, for its own
Rating/Notes/Repurchase fields, the same `maintenance_usage` rows) Hair
Lab's own Products panel (`hair-products.html`/`hair-product.html`)
does, just through the generic page instead of Hair Lab's
experimentation-flavored one. Hair Lab's product page composes
purchases, the sticker, and its own stats (Experiments used, Average
results, Most common pairing, Lessons that mention this product)
computed from `hair_experiments`/`hair_wash_log`, whose `product_ids`
arrays reference `inventory_items` directly — adding or editing a
product from either Hair Lab or Maintenance → Hair Care touches the
exact same rows, so the two views can never drift into separate
records for one product.

Not every Inventory category has a Maintenance area — Shoes is
Inventory-only (`inventory-items.html?area=shoes`, no "how do I care
for it" routine), the last remaining one from the original "eventually"
list (clothing, fitness equipment, books, ...) after Tech and Digital
were promoted to full areas: categories can exist in Inventory without
ever needing a Maintenance tile.

Explicitly **not v1** here too: background removal beyond the labeled
no-op checkbox above; a "Last used" date on gallery cards (no honest
per-item signal exists yet to compute it from); tap-to-expand full item
detail from a gallery card; a "Skipped routine today" toggle on the Log
form; and a shelf/storage-location visual metaphor for the gallery —
all deferred until real day-to-day use surfaces whether they're
actually needed, rather than designed speculatively up front.
