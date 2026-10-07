# Admin Data Update & Refresh System — install pack

Drop-in for the existing **onmart-qc** Next.js app. Nothing here replaces an
existing file. Eight new files, plus two small edits to files you already have.

The database side is **already done** — applied to the live Neon project
`onmart-qc-inspection` on 07-Oct-2026. No data was deleted; existing records
were baselined as version 1.

---

## 1. Copy the new files

```
lib/versioning.js
lib/guard.js
app/api/admin/masterdata/route.js
app/api/admin/versions/route.js
app/api/admin/approvals/route.js
app/api/admin/refresh/route.js
app/api/sync-state/route.js
app/admin/refreshbar.js
app/admin/masterdata.js
app/admin/approvals.js
```

Keep the same folder paths. No existing file is overwritten.

---

## 2. Edit `lib/admin.js` — add two modules

Find the `MODULES` array and add the two new entries at the end:

```js
export const MODULES = [
  'dashboard', 'users', 'roles', 'content',
  'reports', 'audit', 'settings', 'inspections',
  'masterdata', 'approvals',          // <-- add these two
];
```

That is the only change to this file. `can()`, `permissionMap()`,
`requireUser()` and `logAction()` are used as-is.

---

## 3. Edit `app/admin/page.js` — mount the two sections

**a.** Add the imports near the other section imports:

```js
import MasterData from './masterdata.js';
import Approvals from './approvals.js';
```

**b.** Add two entries to the sidebar nav list (the array that already holds
`dashboard`, `users`, `roles`, …):

```js
{ k: 'masterdata', label: 'ទិន្នន័យមេ / Master Data', icon: '🗂' },
{ k: 'approvals',  label: 'ការអនុម័ត / Approvals',   icon: '✅' },
```

**c.** Render them alongside the existing sections:

```jsx
{section === 'masterdata' && <MasterData allow={allow} toast={toast} />}
{section === 'approvals'  && <Approvals  allow={allow} toast={toast} />}
```

`allow` and `toast` are the helpers already in that file. If your toast
helper has a different name, pass whatever function takes
`(message, tone)`.

---

## 4. Deploy

Same as always: drag the project folder onto the **onmart-qc** project page
on Vercel → Deploy to Production.

---

## What was applied to the database

Additive only — `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`INSERT … ON CONFLICT DO NOTHING`. No `DROP`, no `DELETE` against your data.

**New tables**

| Table | Purpose |
|---|---|
| `record_versions` | One row per saved version. Old rows are marked `superseded`, never updated in place or removed. |
| `change_requests` | Approval queue for changes submitted by Admin. |
| `sync_state` | Revision counter plus the Last Updated / Updated By / status banner. |

**New columns** (all with safe defaults, existing rows unaffected)

- `stores`: `updated_at`, `deleted`, `version`, `updated_by`
- `auditors`: `version`, `updated_by`
- `content_items`: `version`, `updated_by`
- `app_settings`: `version`, `updated_by`

**Baseline seeded** — every existing record now has a version 1 snapshot:
10 stores, 6 users, 9 settings. Inspections were not touched.

**Roles** — `operation` added across all 10 modules; `masterdata` and
`approvals` permissions added for `super_admin`, `admin` and `qc_officer`.

| Role | Master data | Approvals |
|---|---|---|
| Super Admin | view, create, edit, delete, approve, export | full — approves and rejects |
| Admin | view, create, edit, export — **changes go to the approval queue** | view and submit only |
| QA/QC (`qc_officer`) | view only | none |
| Operation (`operation`) | view only | none |

---

## How the rules in your spec are enforced

**Never overwrite history.** A save supersedes the previous version row and
inserts a new one. v1 → v2 → v3 all remain readable in the ប្រវត្តិ (History)
dialog. Restoring v1 does not rewind — it replays v1's values forward as a
new v4, so the fact that a restore happened is itself part of the record.

**Nothing is ever hard-deleted.** "Delete" sets `active = false` (and
`deleted = true` for stores). Every row and every version stays.

**Approval routing.** Whether a save applies immediately or queues is decided
by the `masterdata.approve` permission, so it follows the role matrix rather
than being hard-coded. Super Admin commits directly; Admin's edits land in
the queue with a before/after diff for review.

**Refresh order.** `POST /api/admin/refresh` flushes approved-but-unapplied
changes first, then re-reads, then bumps the revision and stamps the banner.
It performs no writes during the read phase, so it cannot duplicate rows.

**Failure is safe.** If any step throws, the revision is *not* bumped, no
data row is touched, and the response is the exact message you specified:
*Sync Failed — Your existing data has not been deleted. Please try again.*

**Auto-refresh.** The bar offers Off / 5 / 10 / 15 minutes, defaulting to 10.
It polls `/api/sync-state`, which returns only a revision counter, and does a
full refresh only when the revision has moved or the interval has elapsed.
Polling pauses while the tab is hidden. It also refreshes after every save
and after every approval.

---

## Known limitation

`app/admin/masterdata.js` edits store, user, content and setting records.
The inspection **standards** themselves (the 45 checklist items and the 526
MCQ options) still live in `MCQ_BY_ITEM` inside `public/qc.html`, so they are
changed by editing that file rather than through this screen. Moving them
into `record_versions` so standards get the same versioning and approval flow
is the natural next step — it needs the checklist definition lifted out of the
HTML and into the database first.
