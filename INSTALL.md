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
lib/records.js
app/api/admin/masterdata/route.js
app/api/admin/versions/route.js
app/api/admin/approvals/route.js
app/api/admin/refresh/route.js
app/api/admin/drafts/route.js
app/api/admin/records/route.js
app/api/admin/records/[id]/route.js
app/api/admin/records/[id]/history/route.js
app/api/admin/records/[id]/action/route.js
app/api/settings-lists/route.js
app/api/sync-state/route.js
public/qc-settings-save.js            (needs ONE line in qc.html — see §5)
public/qc-settings-save.html          (same code, inline alternative)
app/admin/refreshbar.js
app/admin/masterdata.js
app/admin/approvals.js
app/admin/records.js
app/admin/recordform.js
```

The `[id]` folder name is literal — keep the square brackets.

Keep the same folder paths. No existing file is overwritten.

---

## 2. Edit `lib/admin.js` — add two modules

Find the `MODULES` array and add the two new entries at the end:

```js
export const MODULES = [
  'dashboard', 'users', 'roles', 'content',
  'reports', 'audit', 'settings', 'inspections',
  'masterdata', 'approvals', 'records',   // <-- add these three
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
import Records from './records.js';
```

**b.** Add two entries to the sidebar nav list (the array that already holds
`dashboard`, `users`, `roles`, …):

```js
{ k: 'records',    label: 'ឯកសារគ្រប់គ្រង / Controlled Records', icon: '📘' },
{ k: 'masterdata', label: 'ទិន្នន័យមេ / Master Data', icon: '🗂' },
{ k: 'approvals',  label: 'ការអនុម័ត / Approvals',   icon: '✅' },
```

**c.** Render them alongside the existing sections:

```jsx
{section === 'records'    && <Records    allow={allow} toast={toast} />}
{section === 'masterdata' && <MasterData allow={allow} toast={toast} />}
{section === 'approvals'  && <Approvals  allow={allow} toast={toast} />}
```

`allow` and `toast` are the helpers already in that file. If your toast
helper has a different name, pass whatever function takes
`(message, tone)`.

---

## 5. Add the Save bar to the Settings page  ← **easy to miss**

Copying `qc-settings-save.js` into `public/` is **not enough on its own**.
A file sitting in `public/` is downloadable but never runs. The page has to
ask for it.

Open `public/qc.html`, scroll to the very end, and add this **one line**
immediately before `</body>`:

```html
<script src="/qc-settings-save.js"></script>
```

That is the only change to `qc.html` — one line, not a pasted block.

To confirm it worked, open the Settings page and look at the bottom of the
screen: a white bar reading *In sync with the server* should appear beneath
the green sync pill. If it does not, open the browser console (F12) and
check for a 404 on `/qc-settings-save.js`.

The script is additive: it reads the inputs already on the page and appends
a save bar. It replaces no function, overwrites no variable, and if it cannot
find the lists it does nothing rather than breaking the page.

(`public/qc-settings-save.html` is the same code wrapped in `<script>` tags,
if you would rather paste it inline than load a file. Use one or the other,
not both.)

### What the bar does

A fixed bar at the bottom of the Settings screen showing one of four states:

- **In sync with the server** — nothing to save
- **You have unsaved changes** — the Save button lights up
- **Saving your changes…** — button disabled, so a double tap cannot save twice
- **✓ Saved** with *Last Updated* and *Updated By*

Plus:

- **Leaving with unsaved changes** triggers the browser's confirm prompt, and
  **Reload** asks before discarding.
- **Unsaved edits are kept in `localStorage`** as you type, so a crashed tab
  or a flat battery does not lose the list.
- **Validation errors highlight the offending input in red** and scroll to it,
  rather than only showing a message.
- **An empty store list is refused** on both the client and the server. Saving
  an empty list would deactivate every store, so it is treated as a mistake.
- **Users without permission** see a read-only notice and a disabled button;
  their local editing still works exactly as before, it just does not sync.
- **Users who may edit but not approve** see **Submit** instead of **Save**,
  and their change goes to the Approvals queue.

### How the lists are found

The script locates the two columns by their visible labels — បញ្ជីហាង and
អ្នកសវនកម្ម — rather than by class names or internal variables, so restyling
the template will not break saving. Store inputs are read in pairs (code,
name); inspector inputs one per row, with blank and `(placeholder)` rows
skipped.

I tested this against a mock of your Settings screen with all ten stores.
The first attempt had a bug — the column finder walked too far up the DOM and
grabbed both columns at once, sending 11 stores and 23 inspectors. It now
rejects any ancestor containing the other column's label, and reads exactly
10 stores and 1 inspector. Read-only mode, the Submit variant and red-row
highlighting were each tested separately.

### Where the data goes

- **Stores** → the `stores` table, matched on code. New codes are inserted,
  changed names updated, and a code removed from the list is **deactivated,
  never deleted**, so historical inspections that reference it still resolve.
  Every one of those writes creates a version row.
- **Inspectors** → `app_settings` under `inspector_list` as a JSON array.
  Deliberately *not* the `auditors` table: a name on this list belongs in a
  dropdown, and writing it to `auditors` would silently create login accounts.

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
| `qc_records` | Controlled QA/QC documents — code, version, status, effective date, change reason. |
| `record_drafts` | Private auto-saved drafts. Separate from the record, so autosave can never alter a live value. |
| `save_receipts` | Request-ID receipts for duplicate-save protection. |

**New columns** (all with safe defaults, existing rows unaffected)

- `stores`: `updated_at`, `deleted`, `version`, `updated_by`
- `auditors`: `version`, `updated_by`
- `content_items`: `version`, `updated_by`
- `app_settings`: `version`, `updated_by`

**Baseline seeded** — every existing record now has a version 1 snapshot:
10 stores, 6 users, 9 settings. Inspections were not touched.

**Roles** — `operation` added across all 10 modules; `masterdata` and
`approvals` permissions added for `super_admin`, `admin` and `qc_officer`.

| Role | Master data | Approvals | Controlled records |
|---|---|---|---|
| Super Admin | view, create, edit, delete, approve, export | full — approves and rejects | edit, approve, publish, archive |
| Admin | view, create, edit, export — **changes go to the approval queue** | view and submit only | edit, save draft, submit |
| QA/QC (`qc_officer`) | view only | none | edit and submit |
| Operation (`operation`) | view only | none | view and create only |
| Viewer (`viewer`) | view only | none | view only |

The `viewer` role was added across all eleven modules.

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

## Edit & Save architecture — where each rule lives

| Your spec | Where it is enforced |
|---|---|
| §2 View / Edit / History per record | `app/admin/records.js` — three buttons per row |
| §2 Load latest value, show version + status | `RecordForm.load()` re-fetches on open, never uses the list row |
| §3 Read-only fields | `EDITABLE_FIELDS` in `lib/records.js`; `sanitizePayload()` drops everything else, so a crafted request cannot reach Record ID, Document Code or Created By |
| §4 Unsaved-changes prompt | `beforeunload` for tab close, plus a Save / Discard / Cancel dialog on in-app close |
| §5 Validation | `validate()` returns per-field messages; the form highlights each input in red |
| §6 Confirm Update | mandatory dialog before every save of a controlled record |
| §7 Change Reason + Category | required; the seven categories from your list |
| §8 Version control | P1 → P2 → P3; the save writes the new version and snapshots the old one |
| §10 Save status | Saving… / ✓ success panel with code, version, user, time, status / failure panel |
| §11 Duplicate-save protection | button disabled while saving **and** a `request_id` receipt server-side, so a retry returns the first result instead of writing twice |
| §12 Concurrent editing | `where version = baseVersion` — a stale save writes nothing and returns 409 with Reload Latest / Compare Changes / Cancel |
| §13 Auto-save draft | every 45s into `record_drafts`, private to the editor, never published |
| §14 Save & Continue | separate from Save & Close |
| §15 Save Draft vs Submit vs Publish | separate buttons, separate permissions — an Admin who can edit cannot approve |
| §16 Audit trail | `record_versions` + your existing `audit_logs`; both read-only, no update or delete path exists |
| §17 Change comparison | `diffRecords()` tags each field Added / Changed / Removed |
| §18 Cancel | returns to View when clean, prompts when dirty |
| §19 Delete | there is no delete — only Archive, which sets `status = 'archived'` |
| §20 Refresh after save | the form reloads and the parent list refreshes; the revision bumps so other screens notice |
| §21 API shape | `GET/POST /records`, `GET/PUT/PATCH /records/{id}`, `/records/{id}/history`, `/records/{id}/action` for submit, approve, reject, publish, archive, new-version |
| §22 Database shape | `qc_records` for the current record, `record_versions` for history — the two-table split you recommended |
| §23 Permissions | the five roles, per module × action |
| §24 Button structure | View / Edit / History, then Save & Continue / Save Changes / Submit for Approval / Cancel; published records show Create New Version instead of Edit |

### Lifecycle

```
draft ──submit──> pending_approval ──approve──> approved ──publish──> published
  ^                      │                                               │
  └────── reject ────────┘                                      new-version
                                                                        │
                                                                        v
                                                                      draft (P+1)
any state ──archive──> archived        (archived is never deleted)
```

A published document cannot be edited directly — the form disables the
fields and offers **Create New Version**, which opens P(n+1) as a draft
while the published P(n) stays untouched in history.

### What I tested against your live database

- Saving with the current version bumps P1 → P2 and writes the new value.
- Saving with a **stale** version writes nothing: the update matched zero
  rows and the stored value stayed at the newer one. That is Admin B being
  stopped from overwriting Admin A, verified rather than assumed.
- Duplicate document codes are caught case-insensitively.
- The draft and receipt tables accept and de-duplicate correctly.
- All test rows were removed afterwards; your 10 stores, 6 users, 9
  inspections and 25 baseline versions are untouched.

---

## Known limitation

`app/admin/masterdata.js` edits store, user, content and setting records.
The inspection **standards** themselves (the 45 checklist items and the 526
MCQ options) still live in `MCQ_BY_ITEM` inside `public/qc.html`, so they are
changed by editing that file rather than through this screen. Moving them
into `record_versions` so standards get the same versioning and approval flow
is the natural next step — it needs the checklist definition lifted out of the
HTML and into the database first.
