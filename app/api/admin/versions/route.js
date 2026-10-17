import { guard, audit, json } from '../../../../lib/guard.js';
import { isEntity, listVersions, restoreVersion } from '../../../../lib/versioning.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Version history for one record. */
export async function GET(req) {
  const g = await guard(req, 'masterdata', 'view');
  if (g.error) return g.error;

  const p = new URL(req.url).searchParams;
  const entity = p.get('entity');
  const id = p.get('id');
  if (!isEntity(entity) || !id) return json({ error: 'entity and id are required' }, 400);

  try {
    const rows = await listVersions(entity, id, p.get('limit'));
    return json({ entity, id, versions: rows });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

/* Restore replays an old version forward as a new version. */
export async function POST(req) {
  const g = await guard(req, 'masterdata', 'approve');
  if (g.error) return g.error;

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'Invalid request body' }, 400);
  }
  const { entity, id, version } = body || {};
  if (!isEntity(entity) || !id || !version) {
    return json({ error: 'entity, id and version are required' }, 400);
  }

  try {
    const ver = await restoreVersion(entity, id, version, g.user);
    await audit(req, g.user, {
      action: 'restore_version', module: 'masterdata',
      target: entity + ':' + id, after: { restoredFrom: version, newVersion: ver.version },
    });
    return json({ ok: true, newVersion: ver.version });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
