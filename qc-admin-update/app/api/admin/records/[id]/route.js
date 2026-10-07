import { guard, audit, json } from '../../../../../lib/guard.js';
import { getRecord, updateRecord, diffRecords, sanitizePayload, AppError } from '../../../../../lib/records.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* GET one record — always the latest database value, for Edit mode. */
export async function GET(req, ctx) {
  const g = await guard(req, 'records', 'view');
  if (g.error) return g.error;

  const { id } = await ctx.params;
  try {
    const rec = await getRecord(id);
    if (!rec) return json({ error: 'រកមិនឃើញកំណត់ត្រា / Record not found' }, 404);
    return json({ record: rec });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

/**
 * PUT — save an edit as a new version.
 *
 * Body: { payload, baseVersion, changeReason, changeCategory, requestId }
 *
 * baseVersion drives optimistic locking; requestId makes a repeated save
 * idempotent. A validation failure returns 422 with per-field messages so
 * the form can highlight them; a concurrent edit returns 409 with the
 * latest record and a diff.
 */
export async function PUT(req, ctx) {
  const g = await guard(req, 'records', 'edit');
  if (g.error) return g.error;

  const { id } = await ctx.params;
  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'Invalid request body' }, 400);
  }

  let before = null;
  try {
    before = await getRecord(id);
    const result = await updateRecord(id, body.payload || {}, g.user, {
      requestId: body.requestId,
      reason: body.changeReason,
      category: body.changeCategory,
      baseVersion: body.baseVersion,
      requireReason: body.requireReason !== false,
    });

    if (!result.deduplicated) {
      await audit(req, g.user, {
        action: 'UPDATE', module: 'records',
        target: 'qc_record:' + id,
        before: before ? sanitizePayload(before) : null,
        after: {
          ...sanitizePayload(body.payload || {}),
          version: result.versionLabel,
          status: result.status,
          reason: body.changeReason || null,
          category: body.changeCategory || null,
        },
      });
    }
    return json(result);
  } catch (e) {
    if (e instanceof AppError) return json(e.body, e.status);
    return json({
      error: 'Save Failed',
      message: 'Your previous data is still safe. No changes were applied.',
      messageKm: 'ទិន្នន័យមុនរបស់អ្នកនៅតែមានសុវត្ថិភាព។ គ្មានការផ្លាស់ប្ដូរណាត្រូវបានអនុវត្តទេ។',
      detail: String(e.message || e),
    }, 500);
  }
}

/* PATCH — preview the diff without writing anything (View Changes). */
export async function PATCH(req, ctx) {
  const g = await guard(req, 'records', 'view');
  if (g.error) return g.error;

  const { id } = await ctx.params;
  try {
    const body = await req.json();
    const current = await getRecord(id);
    if (!current) return json({ error: 'Record not found' }, 404);
    return json({
      changes: diffRecords(sanitizePayload(current), sanitizePayload(body.payload || {})),
      latestVersion: current.version,
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
