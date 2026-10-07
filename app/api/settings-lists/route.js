import { sql } from '../../../lib/db.js';
import { currentUser, guard, audit, json } from '../../../lib/guard.js';
import * as admin from '../../../lib/admin.js';
import { recordVersion, bumpRevision, submitChangeRequest } from '../../../lib/versioning.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ *
 * Save for the QC Settings page (ការកំណត់ — បញ្ជីជម្រើស).
 *
 * Stores go to the `stores` table; the inspector name list goes to
 * app_settings under `inspector_list`, because an inspector on this list
 * is a name used in a dropdown, not a login account — writing names into
 * `auditors` would silently create user records.
 *
 * Nothing is ever hard-deleted. A store removed from the list is
 * deactivated, so historical inspections that reference it keep working.
 * ------------------------------------------------------------------ */

const INSPECTOR_KEY = 'inspector_list';
const MAX_STORES = 500;
const MAX_INSPECTORS = 300;

async function readInspectors() {
  const rows = await sql`select value from app_settings where key = ${INSPECTOR_KEY}`;
  if (!rows[0]) return [];
  try {
    const v = JSON.parse(rows[0].value);
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

/* GET — current lists, plus what this user is allowed to do with them. */
export async function GET(req) {
  const user = await currentUser(req);
  if (!user) return json({ error: 'Not signed in' }, 401);

  let canEdit = false;
  let canApprove = false;
  try {
    canEdit = await admin.can(user.role, 'masterdata', 'edit');
    canApprove = await admin.can(user.role, 'masterdata', 'approve');
  } catch (_) {
    canEdit = false;
    canApprove = false;
  }

  try {
    const [stores, inspectors] = await Promise.all([
      sql`select code, name from stores where deleted = false and active = true order by code`,
      readInspectors(),
    ]);
    return json({
      stores, inspectors,
      canEdit, canApprove,
      role: user.role,
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

/**
 * POST — save both lists.
 *
 * Body: { stores: [{code, name}], inspectors: [name], requestId }
 *
 * Users who may edit but not approve get their change queued rather than
 * applied, matching the Master Data screen.
 */
export async function POST(req) {
  const g = await guard(req, 'masterdata', 'edit');
  if (g.error) return g.error;
  const user = g.user;

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'Invalid request body' }, 400);
  }

  /* ---------------------------- validate --------------------------- */

  const rawStores = Array.isArray(body.stores) ? body.stores : [];
  const rawInspectors = Array.isArray(body.inspectors) ? body.inspectors : [];

  if (rawStores.length > MAX_STORES) {
    return json({ error: `បញ្ជីហាងលើសកំណត់ (អតិបរមា ${MAX_STORES})` }, 422);
  }
  if (rawInspectors.length > MAX_INSPECTORS) {
    return json({ error: `បញ្ជីអ្នកសវនកម្មលើសកំណត់ (អតិបរមា ${MAX_INSPECTORS})` }, 422);
  }

  const stores = [];
  const seen = new Set();
  const errors = [];

  for (let i = 0; i < rawStores.length; i++) {
    const code = String(rawStores[i]?.code ?? '').trim();
    const name = String(rawStores[i]?.name ?? '').trim();
    if (!code && !name) continue;                 // blank row — ignore
    if (!code) { errors.push({ row: i, field: 'code', message: 'ត្រូវការលេខកូដហាង' }); continue; }
    if (!name) { errors.push({ row: i, field: 'name', message: 'ត្រូវការឈ្មោះហាង' }); continue; }
    if (code.length > 120 || name.length > 200) {
      errors.push({ row: i, field: 'name', message: 'អត្ថបទវែងពេក' });
      continue;
    }
    const key = code.toLowerCase();
    if (seen.has(key)) { errors.push({ row: i, field: 'code', message: 'លេខកូដស្ទួន / Duplicate code' }); continue; }
    seen.add(key);
    stores.push({ code, name });
  }

  const inspectors = [];
  const seenInspector = new Set();
  for (const raw of rawInspectors) {
    const n = String(raw ?? '').trim();
    if (!n || n.length > 200) continue;
    if (n.startsWith('(') && n.endsWith(')')) continue;   // placeholder row
    const k = n.toLowerCase();
    if (seenInspector.has(k)) continue;
    seenInspector.add(k);
    inspectors.push(n);
  }

  if (errors.length) {
    return json({
      error: 'សូមកែតម្រូវជួរដែលបានបន្លិច មុននឹងរក្សាទុក',
      errorEn: 'Please correct the highlighted rows before saving.',
      rows: errors,
    }, 422);
  }
  if (stores.length === 0) {
    return json({
      error: 'បញ្ជីហាងទទេ — ការរក្សាទុកត្រូវបានបញ្ឈប់ដើម្បីការពារទិន្នន័យ',
      errorEn: 'The store list is empty. Save was stopped to protect your existing data.',
    }, 422);
  }

  /* ------------------------- approval routing ----------------------- */

  let canApprove = false;
  try {
    canApprove = await admin.can(user.role, 'masterdata', 'approve');
  } catch (_) {
    canApprove = false;
  }

  try {
    const before = await sql`select code, name from stores
                             where deleted = false and active = true order by code`;
    const beforeInspectors = await readInspectors();

    if (!canApprove) {
      const cr = await submitChangeRequest({
        entity: 'store',
        entityId: null,
        operation: 'update',
        payload: { bulk: true, stores, inspectors },
        before: { stores: before, inspectors: beforeInspectors },
      }, user);
      await audit(req, user, {
        action: 'submit_settings_lists', module: 'masterdata',
        target: 'settings:lists',
        before: { stores: before.length, inspectors: beforeInspectors.length },
        after: { stores: stores.length, inspectors: inspectors.length },
      });
      return json({
        queued: true,
        requestId: cr.id,
        message: 'បានដាក់ស្នើសុំការអនុម័ត / Submitted for approval',
      });
    }

    /* ------------------------- apply the save ----------------------- */

    const email = user.email || null;
    let created = 0;
    let updated = 0;

    for (const s of stores) {
      const existing = await sql`select id, name, active from stores
                                 where lower(code) = ${s.code.toLowerCase()}`;
      if (existing[0]) {
        const row = existing[0];
        if (row.name !== s.name || row.active !== true) {
          const r = await sql`update stores
                              set name = ${s.name}, active = true, deleted = false,
                                  version = version + 1, updated_at = now(),
                                  updated_by = ${email}
                              where id = ${row.id}
                              returning id::text as id, code, name, active, version`;
          await recordVersion('store', r[0].id, r[0], user, 'Settings page save', user);
          updated++;
        }
      } else {
        const r = await sql`insert into stores (code, name, active, updated_by)
                            values (${s.code}, ${s.name}, true, ${email})
                            returning id::text as id, code, name, active, version`;
        await recordVersion('store', r[0].id, r[0], user, 'Added from Settings page', user);
        created++;
      }
    }

    // Stores no longer on the list are deactivated, never removed, so old
    // inspections that reference them still resolve.
    const codes = stores.map((s) => s.code.toLowerCase());
    const dropped = await sql`update stores
                              set active = false, version = version + 1,
                                  updated_at = now(), updated_by = ${email}
                              where deleted = false and active = true
                                and lower(code) <> all(${codes}::text[])
                              returning id::text as id, code, name, active, version`;
    for (const d of dropped) {
      await recordVersion('store', d.id, d, user, 'Removed from Settings page (deactivated)', user);
    }

    await sql`insert into app_settings (key, value, updated_at, updated_by, version)
              values (${INSPECTOR_KEY}, ${JSON.stringify(inspectors)}, now(), ${email}, 1)
              on conflict (key) do update
                set value = excluded.value, updated_at = now(),
                    updated_by = ${email}, version = app_settings.version + 1`;
    await recordVersion(
      'setting', INSPECTOR_KEY,
      { key: INSPECTOR_KEY, value: JSON.stringify(inspectors) },
      user, 'Inspector list saved from Settings page', user
    );

    const revision = await bumpRevision();

    await audit(req, user, {
      action: 'save_settings_lists', module: 'masterdata',
      target: 'settings:lists',
      before: { stores: before.length, inspectors: beforeInspectors.length },
      after: {
        stores: stores.length, inspectors: inspectors.length,
        created, updated, deactivated: dropped.length,
      },
    });

    return json({
      ok: true,
      savedAt: new Date().toISOString(),
      savedBy: user.name || user.email,
      revision,
      summary: {
        stores: stores.length,
        created, updated,
        deactivated: dropped.length,
        inspectors: inspectors.length,
      },
    });
  } catch (e) {
    return json({
      error: 'Save Failed',
      message: 'Your previous data is still safe. No changes were applied.',
      messageKm: 'ទិន្នន័យមុនរបស់អ្នកនៅតែមានសុវត្ថិភាព។ គ្មានការផ្លាស់ប្ដូរណាត្រូវបានអនុវត្តទេ។',
      detail: String(e.message || e),
    }, 500);
  }
}
