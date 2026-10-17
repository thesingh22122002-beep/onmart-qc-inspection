import { guard, json } from '../../../../../../lib/guard.js';
import { recordHistory, diffRecords } from '../../../../../../lib/records.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read-only audit history for one record.
 *
 * Each entry carries its own old → new diff so the History dialog can show
 * Added / Changed / Removed without a second round trip. There is no write
 * method here by design: audit records are read-only.
 */
export async function GET(req, ctx) {
  const g = await guard(req, 'records', 'view');
  if (g.error) return g.error;

  const { id } = await ctx.params;
  try {
    const rows = await recordHistory(id, new URL(req.url).searchParams.get('limit'));
    const history = rows.map((r) => ({
      ...r,
      changes: r.old_data ? diffRecords(r.old_data, r.data) : [],
    }));
    return json({ id, history });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
