import { sql } from '../../../../lib/db.js';
import { guard, audit, json } from '../../../../lib/guard.js';
import {
  listCurrent, decideChangeRequest, countPending,
  markSynced, markSyncFailed, getSyncState,
} from '../../../../lib/versioning.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Current sync banner, without performing a sync. */
export async function GET(req) {
  const g = await guard(req, 'masterdata', 'view');
  if (g.error) return g.error;
  try {
    const [state, pending] = await Promise.all([getSyncState(), countPending()]);
    return json({ state, pending });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

/**
 * Refresh / synchronise master data.
 *
 * Order matters and follows the spec:
 *   1. flush any approved-but-not-yet-applied change requests
 *   2. re-read the latest data from the database
 *   3. bump the revision and stamp the sync banner
 *
 * This endpoint performs no deletes. If any step throws, the failure is
 * recorded without bumping the revision and without touching data rows,
 * and the caller is told explicitly that nothing was lost.
 */
export async function POST(req) {
  const g = await guard(req, 'masterdata', 'view');
  if (g.error) return g.error;
  const user = g.user;

  const applied = [];
  try {
    // 1. Flush approved work that has not been written to the live tables.
    const stuck = await sql`select id from change_requests
                            where status = 'approved'
                            order by requested_at asc limit 200`;
    for (const row of stuck) {
      try {
        const r = await decideChangeRequest(row.id, 'approve', 'Applied during refresh', user);
        applied.push({ id: row.id, ...r });
      } catch (e) {
        // One bad request must not abort the whole refresh.
        applied.push({ id: row.id, error: String(e.message || e) });
      }
    }

    // 2. Re-read the latest state. Reads only — no writes, so no duplicates.
    const [stores, auditors, content, settings] = await Promise.all([
      listCurrent('store'),
      listCurrent('auditor'),
      listCurrent('content'),
      listCurrent('setting'),
    ]);

    const stats = await sql`
      select
        (select count(*)::int from inspections where coalesce(deleted,false) = false) as inspections,
        (select count(*)::int from stores where deleted = false) as stores,
        (select count(*)::int from auditors where active) as active_users,
        (select count(*)::int from change_requests where status = 'pending') as pending`;

    // 3. Stamp the banner and publish a new revision.
    const state = await markSynced(user, { status: 'ok', detail: null });

    await audit(req, user, {
      action: 'refresh_sync', module: 'masterdata',
      target: 'master_data',
      after: { revision: state.revision, applied: applied.length },
    });

    return json({
      ok: true,
      status: 'Successfully Synchronized',
      statusKm: 'ធ្វើសមកាលកម្មបានជោគជ័យ',
      revision: Number(state.revision),
      lastUpdated: state.last_synced_at,
      updatedBy: state.last_synced_by_name || state.last_synced_by || user.name || user.email,
      appliedChanges: applied,
      stats: stats[0] || {},
      data: { stores, auditors, content, settings },
    });
  } catch (e) {
    await markSyncFailed(user, e.message || e);
    return json({
      ok: false,
      status: 'Sync Failed',
      statusKm: 'ធ្វើសមកាលកម្មមិនបានសម្រេច',
      message: 'Sync Failed — Your existing data has not been deleted. Please try again.',
      messageKm: 'ធ្វើសមកាលកម្មមិនបានសម្រេច — ទិន្នន័យដែលមានស្រាប់របស់អ្នកមិនត្រូវបានលុបទេ។ សូមព្យាយាមម្តងទៀត។',
      detail: String(e.message || e),
      appliedChanges: applied,
    }, 500);
  }
}
