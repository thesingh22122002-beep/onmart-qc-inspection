import { sql } from '../../../../../lib/db';
import { requirePermission, logAction } from '../../../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ *
 * Admin edit / archive for a saved inspection.
 *
 * Three rules this file keeps:
 *   1. Nothing is ever destroyed. DELETE sets deleted = true, so the
 *      row stays in the table and can be brought back.
 *   2. Edits are guarded by `version`. If the record changed since the
 *      admin opened it, the save is refused rather than silently
 *      overwriting somebody else's work.
 *   3. The `payload` column is kept in step with the columns, because
 *      that is what the QC app reads when it syncs. Changing one and
 *      not the other would make the dashboard and the app disagree.
 * ------------------------------------------------------------------ */

function json(body, status = 200) {
  return Response.json(body, { status });
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clean(v, max = 200) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, max);
}

/** The fields an admin may change. Scores stay read-only — those come
 *  from the checklist and must be corrected in the app, not typed over. */
function editable(body) {
  const storeLabel = clean(body.storeLabel, 160);
  const inspectDate = clean(body.inspectDate, 10);
  const shift = clean(body.shift, 40);
  const auditorName = clean(body.auditorName, 120);
  const areaManager = clean(body.areaManager, 120);
  const contact = clean(body.contact, 120);
  return { storeLabel, inspectDate, shift, auditorName, areaManager, contact };
}

function validate(f, currentDate) {
  if (!f.storeLabel) return 'ត្រូវបំពេញឈ្មោះហាង';
  if (!f.inspectDate) return 'ត្រូវបំពេញកាលបរិច្ឆេទ';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.inspectDate)) return 'ទម្រង់កាលបរិច្ឆេទត្រូវជា YYYY-MM-DD';
  const d = new Date(f.inspectDate + 'T00:00:00Z');
  if (isNaN(d.getTime())) return 'កាលបរិច្ឆេទមិនត្រឹមត្រូវ';
  // Only object to a future date the admin is actually introducing. A record
  // that already carries one must stay editable, or a bad date would lock
  // the whole row — including the fields needed to correct it.
  if (f.inspectDate !== currentDate && d.getTime() > Date.now() + 864e5) {
    return 'កាលបរិច្ឆេទមិនអាចនៅអនាគតទេ';
  }
  if (!f.auditorName) return 'ត្រូវបំពេញឈ្មោះអ្នកត្រួតពិនិត្យ';
  return null;
}

/** A date column may arrive as a string or as a Date depending on the
 *  driver. Both have to come out as YYYY-MM-DD, because that is what the
 *  date input sends back and what the validator expects. */
function ymd(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

async function loadOne(id) {
  const rows = await sql`
    SELECT id, store_code, store_label, inspect_date, month, shift,
           auditor_name, auditor_email, area_manager, contact,
           total_score, total_max, pct, band, auto_fail,
           payload, deleted, version, updated_at
    FROM inspections WHERE id = ${id} LIMIT 1`;
  return rows[0] || null;
}

function shape(r) {
  return {
    id: r.id,
    storeLabel: r.store_label,
    inspectDate: ymd(r.inspect_date),
    month: r.month,
    shift: r.shift,
    auditorName: r.auditor_name,
    auditorEmail: r.auditor_email,
    areaManager: r.area_manager,
    contact: r.contact,
    totalScore: r.total_score,
    totalMax: r.total_max,
    pct: r.pct,
    band: r.band,
    autoFail: r.auto_fail,
    deleted: r.deleted,
    version: r.version,
    updatedAt: r.updated_at
  };
}

/* ------------------------------- read ------------------------------ */
export async function GET(_req, { params }) {
  const { error } = await requirePermission('inspections', 'view');
  if (error) return error;

  const row = await loadOne(String(params.id || ''));
  if (!row) return json({ ok: false, error: 'រកមិនឃើញកំណត់ត្រា' }, 404);
  return json({ ok: true, record: shape(row) });
}

/* ------------------------------- edit ------------------------------ */
export async function PATCH(req, { params }) {
  const { user, error } = await requirePermission('inspections', 'edit');
  if (error) return error;

  const id = String(params.id || '');
  if (!id) return json({ ok: false, error: 'missing id' }, 400);

  let body;
  try { body = await req.json(); } catch (_) { return json({ ok: false, error: 'bad json' }, 400); }

  const before = await loadOne(id);
  if (!before) return json({ ok: false, error: 'រកមិនឃើញកំណត់ត្រា' }, 404);
  if (before.deleted) return json({ ok: false, error: 'កំណត់ត្រានេះត្រូវបានទុកក្នុងប័ណ្ណសារ — សូមស្ដារមុនកែ' }, 409);

  const f = editable(body);
  const bad = validate(f, ymd(before.inspect_date));
  if (bad) return json({ ok: false, error: bad }, 400);

  // Optimistic lock: refuse rather than overwrite a newer version.
  const expected = body.version === undefined || body.version === null ? null : num(body.version, -1);
  if (expected !== null && Number(before.version) !== expected) {
    return json({
      ok: false, conflict: true,
      error: 'កំណត់ត្រានេះត្រូវបានកែដោយអ្នកផ្សេងរួចហើយ — សូមផ្ទុកឡើងវិញ',
      record: shape(before)
    }, 409);
  }

  const month = f.inspectDate.slice(0, 7);

  // Keep the snapshot the QC app reads in step with the columns.
  const payload = (before.payload && typeof before.payload === 'object') ? { ...before.payload } : {};
  payload.store = f.storeLabel;
  payload.date = f.inspectDate;
  payload.month = month;
  payload.shift = f.shift;
  payload.auditor = f.auditorName;
  payload.areamgr = f.areaManager;
  payload.contact = f.contact;

  const rows = await sql`
    UPDATE inspections SET
      store_label  = ${f.storeLabel},
      inspect_date = ${f.inspectDate},
      month        = ${month},
      shift        = ${f.shift},
      auditor_name = ${f.auditorName},
      area_manager = ${f.areaManager},
      contact      = ${f.contact},
      payload      = ${JSON.stringify(payload)}::jsonb,
      updated_at   = now(),
      version      = version + 1
    WHERE id = ${id} AND deleted = false
    RETURNING id, store_code, store_label, inspect_date, month, shift,
              auditor_name, auditor_email, area_manager, contact,
              total_score, total_max, pct, band, auto_fail,
              payload, deleted, version, updated_at`;

  if (!rows[0]) return json({ ok: false, error: 'កែមិនបានសម្រេច' }, 409);

  await logAction(req, user, {
    action: 'update', module: 'inspections', target: id,
    before: shape(before), after: shape(rows[0])
  });

  return json({ ok: true, record: shape(rows[0]) });
}

/* ------------------------ archive and restore ---------------------- */
export async function DELETE(req, { params }) {
  const { user, error } = await requirePermission('inspections', 'delete');
  if (error) return error;

  const id = String(params.id || '');
  const before = await loadOne(id);
  if (!before) return json({ ok: false, error: 'រកមិនឃើញកំណត់ត្រា' }, 404);
  if (before.deleted) return json({ ok: true, record: shape(before), already: true });

  const rows = await sql`
    UPDATE inspections SET deleted = true, updated_at = now(), version = version + 1
    WHERE id = ${id}
    RETURNING id, store_label, inspect_date, month, shift, auditor_name, auditor_email,
              area_manager, contact, total_score, total_max, pct, band, auto_fail,
              payload, deleted, version, updated_at`;

  await logAction(req, user, {
    action: 'archive', module: 'inspections', target: id,
    before: shape(before), after: rows[0] ? shape(rows[0]) : null
  });

  return json({ ok: true, record: rows[0] ? shape(rows[0]) : null });
}

/** POST { action: 'restore' } — bring an archived inspection back. */
export async function POST(req, { params }) {
  const { user, error } = await requirePermission('inspections', 'edit');
  if (error) return error;

  let body = {};
  try { body = await req.json(); } catch (_) { /* an empty body means restore */ }
  if (body.action && body.action !== 'restore') {
    return json({ ok: false, error: 'សកម្មភាពមិនស្គាល់' }, 400);
  }

  const id = String(params.id || '');
  const before = await loadOne(id);
  if (!before) return json({ ok: false, error: 'រកមិនឃើញកំណត់ត្រា' }, 404);

  const rows = await sql`
    UPDATE inspections SET deleted = false, updated_at = now(), version = version + 1
    WHERE id = ${id}
    RETURNING id, store_label, inspect_date, month, shift, auditor_name, auditor_email,
              area_manager, contact, total_score, total_max, pct, band, auto_fail,
              payload, deleted, version, updated_at`;

  await logAction(req, user, {
    action: 'restore', module: 'inspections', target: id,
    before: shape(before), after: rows[0] ? shape(rows[0]) : null
  });

  return json({ ok: true, record: rows[0] ? shape(rows[0]) : null });
}
