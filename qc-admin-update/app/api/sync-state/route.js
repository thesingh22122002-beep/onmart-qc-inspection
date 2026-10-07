import { currentUser, json } from '../../../lib/guard.js';
import { getSyncState } from '../../../lib/versioning.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Tiny poll endpoint for auto-refresh.
 *
 * Any signed-in user may read it: it exposes only a revision counter and
 * the sync banner, never record data. Clients compare the revision with
 * the one they last loaded and re-fetch only when it has moved, so the
 * poll costs one small row read rather than a full master-data reload.
 */
export async function GET(req) {
  const user = await currentUser(req);
  if (!user) return json({ error: 'Not signed in' }, 401);

  try {
    const s = await getSyncState();
    return json({
      revision: Number(s.revision),
      lastUpdated: s.last_synced_at,
      updatedBy: s.last_synced_by_name || s.last_synced_by || null,
      status: s.status,
    });
  } catch (e) {
    // A failed poll must never look like "data changed".
    return json({ error: String(e.message || e) }, 500);
  }
}
