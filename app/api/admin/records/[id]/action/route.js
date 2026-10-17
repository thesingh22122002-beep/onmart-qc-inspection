import { guard, audit, json } from '../../../../../../lib/guard.js';
import { transition, newVersionFrom, AppError } from '../../../../../../lib/records.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Which permission each lifecycle step needs. Approve and publish are
 * deliberately separate from edit, so an Admin who may edit cannot also
 * sign the change off. */
const NEEDS = {
  submit: ['records', 'edit'],
  approve: ['records', 'approve'],
  reject: ['records', 'approve'],
  publish: ['records', 'approve'],
  archive: ['records', 'delete'],
  'new-version': ['records', 'create'],
};

/* POST /api/admin/records/{id}/action  body: { action, reason, category } */
export async function POST(req, ctx) {
  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'Invalid request body' }, 400);
  }

  const action = String(body.action || '');
  const needs = NEEDS[action];
  if (!needs) return json({ error: 'Unknown action: ' + action }, 400);

  const g = await guard(req, needs[0], needs[1]);
  if (g.error) return g.error;

  const { id } = await ctx.params;
  try {
    const result = action === 'new-version'
      ? await newVersionFrom(id, g.user, { reason: body.reason, category: body.category })
      : await transition(id, action, g.user, { reason: body.reason });

    await audit(req, g.user, {
      action: action.toUpperCase().replace('-', '_'),
      module: 'records',
      target: 'qc_record:' + id,
      after: {
        status: result.status,
        version: result.versionLabel,
        reason: body.reason || null,
      },
    });
    return json(result);
  } catch (e) {
    if (e instanceof AppError) return json(e.body, e.status);
    return json({
      error: 'Action Failed',
      message: 'Your previous data is still safe. No changes were applied.',
      detail: String(e.message || e),
    }, 500);
  }
}
