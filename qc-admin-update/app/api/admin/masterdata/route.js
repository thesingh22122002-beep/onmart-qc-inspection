import { guard, audit, json } from '../../../../lib/guard.js';
import * as admin from '../../../../lib/admin.js';
import {
  isEntity, listCurrent, readOne, applyToLive, recordVersion,
  submitChangeRequest, bumpRevision,
} from '../../../../lib/versioning.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const g = await guard(req, 'masterdata', 'view');
  if (g.error) return g.error;

  const entity = new URL(req.url).searchParams.get('entity') || 'store';
  if (!isEntity(entity)) return json({ error: 'Unknown entity' }, 400);

  try {
    const rows = await listCurrent(entity);
    return json({ entity, rows });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

/**
 * Create / update / deactivate a master record.
 *
 * Who can commit directly is decided by the approve permission:
 *   - approve = true  (Super Admin) -> applied immediately, new version
 *   - approve = false (Admin)       -> queued as a pending change request
 *
 * Nothing here deletes a row or an earlier version.
 */
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'Invalid request body' }, 400);
  }

  const { entity, operation = 'update', id, payload = {}, note } = body || {};
  if (!isEntity(entity)) return json({ error: 'Unknown entity' }, 400);

  const needed =
    operation === 'create' ? 'create'
      : operation === 'delete' || operation === 'deactivate' ? 'delete'
        : 'edit';

  const g = await guard(req, 'masterdata', needed);
  if (g.error) return g.error;
  const user = g.user;

  // Minimal validation before anything is written.
  if (entity === 'store' && operation !== 'delete' && operation !== 'deactivate') {
    if (!String(payload.code || '').trim()) return json({ error: 'លេខកូដហាងត្រូវតែបំពេញ / Store code is required' }, 400);
    if (!String(payload.name || '').trim()) return json({ error: 'ឈ្មោះហាងត្រូវតែបំពេញ / Store name is required' }, 400);
  }
  if (entity === 'auditor' && operation === 'update') {
    if (!String(payload.name || '').trim()) return json({ error: 'ឈ្មោះត្រូវតែបំពេញ / Name is required' }, 400);
  }

  const before = id ? await readOne(entity, id) : null;

  let canApprove = false;
  try {
    canApprove = await admin.can(user.role, 'masterdata', 'approve');
  } catch (_) {
    canApprove = false;
  }

  try {
    if (!canApprove) {
      const cr = await submitChangeRequest(
        { entity, entityId: id, operation, payload, before }, user
      );
      await audit(req, user, {
        action: 'submit_change', module: 'masterdata',
        target: entity + ':' + (id || 'new'), before, after: payload,
      });
      return json({
        queued: true,
        requestId: cr.id,
        message: 'បានដាក់ស្នើសុំការអនុម័ត / Submitted for approval',
      });
    }

    const liveId = await applyToLive(entity, operation, id, payload, user);
    const fresh = await readOne(entity, liveId);
    const ver = await recordVersion(
      entity, liveId, fresh || payload, user, note || operation, user
    );
    const revision = await bumpRevision();

    await audit(req, user, {
      action: operation + '_masterdata', module: 'masterdata',
      target: entity + ':' + liveId, before, after: fresh,
    });

    return json({
      ok: true, entityId: liveId, version: ver.version, revision, record: fresh,
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
