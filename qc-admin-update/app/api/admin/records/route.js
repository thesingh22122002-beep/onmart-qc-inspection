import { guard, audit, json } from '../../../../lib/guard.js';
import { listRecords, createRecord, AppError } from '../../../../lib/records.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* GET /api/admin/records?status=&q= */
export async function GET(req) {
  const g = await guard(req, 'records', 'view');
  if (g.error) return g.error;

  const p = new URL(req.url).searchParams;
  try {
    const rows = await listRecords({
      status: p.get('status') || 'all',
      q: p.get('q') || '',
      limit: p.get('limit'),
    });
    return json({ records: rows });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

/* POST /api/admin/records — create a new controlled record as Draft. */
export async function POST(req) {
  const g = await guard(req, 'records', 'create');
  if (g.error) return g.error;

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'Invalid request body' }, 400);
  }

  try {
    const result = await createRecord(body.payload || {}, g.user, {
      requestId: body.requestId,
      reason: body.changeReason,
      category: body.changeCategory,
    });
    if (!result.deduplicated) {
      await audit(req, g.user, {
        action: 'CREATE', module: 'records',
        target: 'qc_record:' + result.id,
        after: { recordCode: result.recordCode, version: result.versionLabel, status: result.status },
      });
    }
    return json(result, result.deduplicated ? 200 : 201);
  } catch (e) {
    if (e instanceof AppError) return json(e.body, e.status);
    return json({
      error: 'Save Failed',
      message: 'Your previous data is still safe. No changes were applied.',
      detail: String(e.message || e),
    }, 500);
  }
}
