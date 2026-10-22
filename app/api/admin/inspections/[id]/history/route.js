import { sql } from '../../../../../../lib/db';
import { requirePermission } from '../../../../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ *
 * Read-only change history for one audit record.
 *
 * The activity log is append-only: this file offers no way to write to
 * it or erase it, and nothing else in the admin area does either. Each
 * entry carries who, when, what changed from what to what, and why.
 * ------------------------------------------------------------------ */

function json(body, status = 200) {
  return Response.json(body, { status });
}

/** Which fields actually differ between two snapshots. */
function diff(before, after) {
  const out = [];
  if (!before || !after) return out;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    // version and updatedAt change on every write; they are not news.
    if (k === 'version' || k === 'updatedAt') continue;
    const sa = a === undefined || a === null ? '' : String(a);
    const sb = b === undefined || b === null ? '' : String(b);
    if (sa !== sb) out.push({ field: k, from: sa, to: sb });
  }
  return out;
}

const FIELD_LABEL = {
  storeLabel: 'ហាង',
  inspectDate: 'កាលបរិច្ឆេទ',
  month: 'ខែ',
  shift: 'វេន',
  auditorName: 'អ្នកត្រួតពិនិត្យ',
  auditorEmail: 'អ៊ីមែលអ្នកត្រួតពិនិត្យ',
  areaManager: 'អ្នកគ្រប់គ្រងតំបន់',
  contact: 'ទំនាក់ទំនង',
  totalScore: 'ពិន្ទុ',
  totalMax: 'ពិន្ទុពេញ',
  pct: 'ភាគរយ',
  band: 'កម្រិត',
  autoFail: 'ធ្លាក់ស្វ័យប្រវត្តិ',
  deleted: 'ស្ថានភាពប័ណ្ណសារ'
};

const ACTION_LABEL = {
  update: 'កែ',
  archive: 'ផ្ទេរទៅប័ណ្ណសារ',
  restore: 'ស្ដារឡើងវិញ',
  archive_bulk: 'ផ្ទេរទៅប័ណ្ណសារ (ច្រើន)',
  restore_bulk: 'ស្ដារឡើងវិញ (ច្រើន)'
};

export async function GET(req, { params }) {
  const { error } = await requirePermission('inspections', 'view');
  if (error) return error;

  const id = String(params.id || '');
  if (!id) return json({ ok: false, error: 'missing id' }, 400);

  const limit = Math.min(200, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 50));

  let rows = [];
  try {
    rows = await sql`SELECT id, actor_email, actor_name, action, target,
                            before_value, after_value, reason, created_at
                       FROM audit_logs
                      WHERE module = 'inspections' AND target = ${id}
                      ORDER BY created_at DESC, id DESC
                      LIMIT ${limit}`;
  } catch (_) {
    // Older databases may not have the reason column yet.
    rows = await sql`SELECT id, actor_email, actor_name, action, target,
                            before_value, after_value, created_at
                       FROM audit_logs
                      WHERE module = 'inspections' AND target = ${id}
                      ORDER BY created_at DESC, id DESC
                      LIMIT ${limit}`;
  }

  // The History dialog reads `entries`; keep that name.
  return json({
    ok: true,
    id,
    entries: rows.map(r => ({
      id: r.id,
      actor: r.actor_name || r.actor_email || '—',
      actorEmail: r.actor_email || '',
      action: r.action,
      actionLabel: ACTION_LABEL[r.action] || r.action,
      reason: r.reason || '',
      at: r.created_at,
      changes: diff(r.before_value, r.after_value)
        .map(c => ({ ...c, label: FIELD_LABEL[c.field] || c.field }))
    }))
  });
}
