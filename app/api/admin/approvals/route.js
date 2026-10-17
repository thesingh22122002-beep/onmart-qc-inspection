import { guard, audit, json } from '../../../../lib/guard.js';
import { listChangeRequests, decideChangeRequest } from '../../../../lib/versioning.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const g = await guard(req, 'approvals', 'view');
  if (g.error) return g.error;

  const p = new URL(req.url).searchParams;
  try {
    const rows = await listChangeRequests(p.get('status') || 'pending', p.get('limit'));
    return json({ requests: rows });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

/* Approve (apply + version) or reject. Neither path removes data. */
export async function POST(req) {
  const g = await guard(req, 'approvals', 'approve');
  if (g.error) return g.error;

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'Invalid request body' }, 400);
  }
  const { id, decision, note } = body || {};
  if (!id || !['approve', 'reject'].includes(decision)) {
    return json({ error: 'id and decision (approve|reject) are required' }, 400);
  }

  try {
    const result = await decideChangeRequest(id, decision, note, g.user);
    await audit(req, g.user, {
      action: 'decide_change', module: 'approvals',
      target: 'change_request:' + id, after: { decision, ...result },
    });
    return json({ ok: true, ...result });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
