import { guard, json } from '../../../../lib/guard.js';
import { saveDraft, getDraft, dropDraft } from '../../../../lib/records.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ *
 * Auto-save drafts.
 *
 * A draft is private to the person editing and is never published. It is
 * stored separately from the record, so autosave can never alter a live
 * value or create a version. Saving the record clears its draft.
 * ------------------------------------------------------------------ */

export async function GET(req) {
  const g = await guard(req, 'records', 'view');
  if (g.error) return g.error;

  const p = new URL(req.url).searchParams;
  try {
    const draft = await getDraft(p.get('entity') || 'qc_record', p.get('id'), g.user);
    return json({ draft });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

export async function POST(req) {
  const g = await guard(req, 'records', 'edit');
  if (g.error) return g.error;

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'Invalid request body' }, 400);
  }

  try {
    const r = await saveDraft(
      body.entity || 'qc_record',
      body.id,
      g.user,
      body.data || {},
      body.baseVersion
    );
    return json({ ok: true, savedAt: r.saved_at });
  } catch (e) {
    // A failed autosave must stay silent in the UI, never block typing.
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

export async function DELETE(req) {
  const g = await guard(req, 'records', 'edit');
  if (g.error) return g.error;

  const p = new URL(req.url).searchParams;
  try {
    await dropDraft(p.get('entity') || 'qc_record', p.get('id'), g.user);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
