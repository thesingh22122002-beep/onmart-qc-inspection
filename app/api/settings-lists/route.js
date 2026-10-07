import { sql } from '../../../lib/db.js';
import { currentUser, guard, audit, json } from '../../../lib/guard.js';
import * as admin from '../../../lib/admin.js';
import { recordVersion, bumpRevision, submitChangeRequest } from '../../../lib/versioning.js';
import { checkReceipt, storeReceipt } from '../../../lib/records.js';

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

/* ==================================================================== *
 * PATCH — single-row operations (Edit / Save row / Delete row).
 *
 * Body: {
 *   op:   'upsert' | 'delete',
 *   kind: 'store'  | 'inspector',
 *   code, name,                 // the new values
 *   originalCode, originalName, // what the row held before (for rename)
 *   requestId                   // duplicate-click protection
 * }
 *
 * Same guarantees as the bulk save: delete is a deactivation, every
 * change writes a version row, and a user who may edit but not approve
 * has the change queued instead of applied.
 * ==================================================================== */

async function queueRowChange(req, user, body, before) {
  const cr = await submitChangeRequest({
    entity: body.kind === 'inspector' ? 'setting' : 'store',
    entityId: null,
    operation: body.op === 'delete' ? 'deactivate' : 'update',
    payload: { row: true, ...body },
    before,
  }, user);
  await audit(req, user, {
    action: 'submit_row_' + body.op, module: 'masterdata',
    target: body.kind + ':' + (body.originalCode || body.code || body.originalName || body.name),
    before, after: body,
  });
  return json({
    queued: true,
    requestId: cr.id,
    message: 'បានដាក់ស្នើសុំការអនុម័ត / Submitted for approval',
  });
}

export async function PATCH(req) {
  const g = await guard(req, 'masterdata', 'edit');
  if (g.error) return g.error;
  const user = g.user;
  const email = user.email || null;

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'Invalid request body' }, 400);
  }

  const op = String(body.op || '');
  const kind = String(body.kind || 'store');
  if (!['upsert', 'delete'].includes(op)) return json({ error: 'Unknown op' }, 400);
  if (!['store', 'inspector'].includes(kind)) return json({ error: 'Unknown kind' }, 400);

  // Repeating a request returns the first answer rather than acting twice.
  if (body.requestId) {
    const cached = await checkReceipt(body.requestId);
    if (cached) return json({ ...cached, deduplicated: true });
  }

  let canApprove = false;
  try {
    canApprove = await admin.can(user.role, 'masterdata', 'approve');
  } catch (_) {
    canApprove = false;
  }

  try {
    /* ------------------------------ stores ------------------------------ */
    if (kind === 'store') {
      const code = String(body.code ?? '').trim();
      const name = String(body.name ?? '').trim();
      const originalCode = String(body.originalCode ?? '').trim() || code;

      if (op === 'upsert') {
        if (!code) return json({ error: 'ត្រូវការលេខកូដហាង / Store code is required', field: 'code' }, 422);
        if (!name) return json({ error: 'ត្រូវការឈ្មោះហាង / Store name is required', field: 'name' }, 422);
        if (code.length > 120 || name.length > 200) {
          return json({ error: 'អត្ថបទវែងពេក / Text too long', field: 'name' }, 422);
        }
      } else if (!originalCode) {
        return json({ error: 'រកមិនឃើញជួរដែលត្រូវលុប' }, 422);
      }

      const existing = await sql`select id::text as id, code, name, active, version
                                 from stores where lower(code) = ${originalCode.toLowerCase()}`;
      const before = existing[0] || null;

      if (!canApprove) return queueRowChange(req, user, body, before);

      if (op === 'delete') {
        if (!before) return json({ error: 'រកមិនឃើញហាងនេះ / Store not found' }, 404);
        const r = await sql`update stores
                            set active = false, version = version + 1,
                                updated_at = now(), updated_by = ${email}
                            where id = ${Number(before.id)}
                            returning id::text as id, code, name, active, version`;
        await recordVersion('store', r[0].id, r[0], user,
          'Deleted from Settings page (deactivated)', user);
        await bumpRevision();
        const result = {
          ok: true, op: 'delete', code: before.code,
          message: 'បានលុបចេញពីបញ្ជី ហើយកំណត់ជាអសកម្ម — ទិន្នន័យចាស់នៅរក្សាទុក',
          savedAt: new Date().toISOString(), savedBy: user.name || user.email,
        };
        await storeReceipt(body.requestId, user, 'store', before.id, result);
        await audit(req, user, {
          action: 'delete_store_row', module: 'masterdata',
          target: 'store:' + before.code, before, after: r[0],
        });
        return json(result);
      }

      // A rename must not collide with another store's code.
      if (code.toLowerCase() !== originalCode.toLowerCase()) {
        const clash = await sql`select id from stores where lower(code) = ${code.toLowerCase()}`;
        if (clash[0]) {
          return json({ error: 'លេខកូដនេះមានរួចហើយ / This code already exists', field: 'code' }, 409);
        }
      }

      let row;
      if (before) {
        const r = await sql`update stores
                            set code = ${code}, name = ${name},
                                active = true, deleted = false,
                                version = version + 1,
                                updated_at = now(), updated_by = ${email}
                            where id = ${Number(before.id)}
                            returning id::text as id, code, name, active, version`;
        row = r[0];
        await recordVersion('store', row.id, row, user, 'Row saved from Settings page', user);
      } else {
        const r = await sql`insert into stores (code, name, active, updated_by)
                            values (${code}, ${name}, true, ${email})
                            returning id::text as id, code, name, active, version`;
        row = r[0];
        await recordVersion('store', row.id, row, user, 'Row added from Settings page', user);
      }
      await bumpRevision();

      const result = {
        ok: true, op: 'upsert', created: !before,
        store: { code: row.code, name: row.name }, version: row.version,
        savedAt: new Date().toISOString(), savedBy: user.name || user.email,
      };
      await storeReceipt(body.requestId, user, 'store', row.id, result);
      await audit(req, user, {
        action: before ? 'update_store_row' : 'create_store_row', module: 'masterdata',
        target: 'store:' + row.code, before, after: row,
      });
      return json(result);
    }

    /* ---------------------------- inspectors ---------------------------- */
    const name = String(body.name ?? '').trim();
    const originalName = String(body.originalName ?? '').trim();
    const list = await readInspectors();
    const before = { inspectors: list };

    if (op === 'upsert' && !name) {
      return json({ error: 'ត្រូវការឈ្មោះអ្នកសវនកម្ម / Inspector name is required', field: 'name' }, 422);
    }
    if (op === 'delete' && !originalName) {
      return json({ error: 'រកមិនឃើញជួរដែលត្រូវលុប' }, 422);
    }

    if (!canApprove) return queueRowChange(req, user, body, before);

    let next;
    if (op === 'delete') {
      next = list.filter((n) => n.toLowerCase() !== originalName.toLowerCase());
      if (next.length === list.length) {
        return json({ error: 'រកមិនឃើញអ្នកសវនកម្មនេះ / Inspector not found' }, 404);
      }
    } else {
      const clash = list.some((n) =>
        n.toLowerCase() === name.toLowerCase() &&
        n.toLowerCase() !== originalName.toLowerCase());
      if (clash) {
        return json({ error: 'ឈ្មោះនេះមានរួចហើយ / This name already exists', field: 'name' }, 409);
      }
      next = originalName
        ? list.map((n) => (n.toLowerCase() === originalName.toLowerCase() ? name : n))
        : list.concat([name]);
      if (originalName && !list.some((n) => n.toLowerCase() === originalName.toLowerCase())) {
        next = list.concat([name]);
      }
    }

    await sql`insert into app_settings (key, value, updated_at, updated_by, version)
              values (${INSPECTOR_KEY}, ${JSON.stringify(next)}, now(), ${email}, 1)
              on conflict (key) do update
                set value = excluded.value, updated_at = now(),
                    updated_by = ${email}, version = app_settings.version + 1`;
    await recordVersion('setting', INSPECTOR_KEY,
      { key: INSPECTOR_KEY, value: JSON.stringify(next) }, user,
      op === 'delete' ? 'Inspector removed from Settings page'
                      : 'Inspector saved from Settings page', user);
    await bumpRevision();

    const result = {
      ok: true, op, inspectors: next,
      savedAt: new Date().toISOString(), savedBy: user.name || user.email,
    };
    await storeReceipt(body.requestId, user, 'setting', INSPECTOR_KEY, result);
    await audit(req, user, {
      action: op === 'delete' ? 'delete_inspector_row' : 'save_inspector_row',
      module: 'masterdata', target: 'inspector:' + (originalName || name),
      before, after: { inspectors: next },
    });
    return json(result);
  } catch (e) {
    return json({
      error: 'Save Failed',
      message: 'Your previous data is still safe. No changes were applied.',
      messageKm: 'ទិន្នន័យមុនរបស់អ្នកនៅតែមានសុវត្ថិភាព។ គ្មានការផ្លាស់ប្ដូរណាត្រូវបានអនុវត្តទេ។',
      detail: String(e.message || e),
    }, 500);
  }
}
