import { sql } from '../../../../lib/db';
import { requirePermission, logAction } from '../../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ *
 * The full list of saved inspections for the admin area.
 *
 * The dashboard shows only the fifteen most recent. This is the whole
 * table: searchable, filterable, paged, and including the archived
 * rows so a deletion can be undone long after it happened.
 * ------------------------------------------------------------------ */

function json(body, status = 200) {
  return Response.json(body, { status });
}

function ymd(v) {
  if (!v) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
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
    totalScore: r.total_score,
    totalMax: r.total_max,
    pct: r.pct,
    band: r.band,
    autoFail: r.auto_fail,
    faultCount: r.fault_count === undefined || r.fault_count === null ? null : Number(r.fault_count),
    deleted: r.deleted,
    version: r.version,
    updatedAt: r.updated_at
  };
}

export async function GET(req) {
  const { error } = await requirePermission('inspections', 'view');
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  const store = (searchParams.get('store') || '').trim();
  const month = (searchParams.get('month') || '').trim();
  const auditor = (searchParams.get('auditor') || '').trim();
  const status = (searchParams.get('status') || 'active').trim();   // active | archived | all

  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(searchParams.get('pageSize')) || 25));
  const offset = (page - 1) * pageSize;

  // Empty-string parameters mean "no filter"; COALESCE keeps one query
  // shape instead of stitching SQL together from strings.
  const like = q ? '%' + q + '%' : null;
  const wantDeleted = status === 'archived' ? true : status === 'all' ? null : false;

  const [rows, totals, facets] = await Promise.all([
    sql`SELECT id, store_label, inspect_date, month, shift, auditor_name, auditor_email,
               total_score, total_max, pct, band, auto_fail, deleted, version, updated_at,
               jsonb_array_length(COALESCE(faults, '[]'::jsonb)) AS fault_count
        FROM inspections
        WHERE (${wantDeleted}::boolean IS NULL OR deleted = ${wantDeleted})
          AND (${store}::text = '' OR store_label = ${store})
          AND (${month}::text = '' OR month = ${month})
          AND (${auditor}::text = '' OR auditor_name = ${auditor})
          AND (${like}::text IS NULL OR store_label ILIKE ${like}
               OR auditor_name ILIKE ${like} OR auditor_email ILIKE ${like})
        ORDER BY inspect_date DESC NULLS LAST, updated_at DESC
        LIMIT ${pageSize} OFFSET ${offset}`,

    sql`SELECT count(*)::int AS total,
               count(*) FILTER (WHERE deleted)::int AS archived
        FROM inspections
        WHERE (${wantDeleted}::boolean IS NULL OR deleted = ${wantDeleted})
          AND (${store}::text = '' OR store_label = ${store})
          AND (${month}::text = '' OR month = ${month})
          AND (${auditor}::text = '' OR auditor_name = ${auditor})
          AND (${like}::text IS NULL OR store_label ILIKE ${like}
               OR auditor_name ILIKE ${like} OR auditor_email ILIKE ${like})`,

    // choices for the filter dropdowns, taken from the data itself
    sql`SELECT
          (SELECT COALESCE(json_agg(s ORDER BY s), '[]'::json)
             FROM (SELECT DISTINCT store_label AS s FROM inspections
                    WHERE store_label IS NOT NULL AND store_label <> '') x) AS stores,
          (SELECT COALESCE(json_agg(m ORDER BY m DESC), '[]'::json)
             FROM (SELECT DISTINCT month AS m FROM inspections
                    WHERE month IS NOT NULL AND month <> '') y) AS months,
          (SELECT COALESCE(json_agg(a ORDER BY a), '[]'::json)
             FROM (SELECT DISTINCT auditor_name AS a FROM inspections
                    WHERE auditor_name IS NOT NULL AND auditor_name <> '') z) AS auditors`
  ]);

  const t = totals[0] || { total: 0, archived: 0 };
  const f = facets[0] || {};

  return json({
    ok: true,
    rows: rows.map(shape),
    total: t.total,
    archived: t.archived,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(t.total / pageSize)),
    stores: f.stores || [],
    months: f.months || [],
    auditors: f.auditors || []
  });
}

/* --------------------- act on several at once ---------------------- */
export async function POST(req) {
  let body;
  try { body = await req.json(); } catch (_) { return json({ ok: false, error: 'bad json' }, 400); }

  const action = String(body.action || '');
  if (action !== 'archive' && action !== 'restore') {
    return json({ ok: false, error: 'សកម្មភាពមិនស្គាល់' }, 400);
  }

  // Archiving is a delete; restoring is an edit. Each needs its own right.
  const { user, error } = await requirePermission('inspections', action === 'archive' ? 'delete' : 'edit');
  if (error) return error;

  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 500) : [];
  if (!ids.length) return json({ ok: false, error: 'មិនទាន់បានជ្រើសកំណត់ត្រាណាទេ' }, 400);

  const target = action === 'archive';
  const rows = await sql`
    UPDATE inspections
       SET deleted = ${target}, updated_at = now(), version = version + 1
     WHERE id = ANY(${ids}) AND deleted = ${!target}
    RETURNING id`;

  const changed = rows.map(r => r.id);

  await logAction(req, user, {
    action: action === 'archive' ? 'archive_bulk' : 'restore_bulk',
    module: 'inspections',
    target: changed.length === 1 ? changed[0] : changed.length + ' records',
    before: { ids, action },
    after: { changed }
  });

  return json({ ok: true, changed, skipped: ids.filter(id => changed.indexOf(id) < 0) });
}
