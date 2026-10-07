import { sql } from './db.js';

/* ------------------------------------------------------------------ *
 * Versioned master-data core.
 *
 * Rule enforced here: a save NEVER overwrites history.
 *   - the live table always holds the current values (so every existing
 *     page, query and export keeps working untouched)
 *   - record_versions gains one new row per save; the previous row is
 *     marked 'superseded' but is never updated in place or deleted
 *
 * Entities are a closed set because the Neon tagged-template `sql` does
 * not interpolate identifiers. Every statement below is literal.
 * ------------------------------------------------------------------ */

export const ENTITIES = ['store', 'auditor', 'content', 'setting'];

export const ENTITY_LABEL = {
  store: 'ហាង / Store',
  auditor: 'អ្នកសវនកម្ម / Inspector',
  content: 'ខ្លឹមសារ / Content',
  setting: 'ការកំណត់ប្រព័ន្ធ / Setting',
};

export function isEntity(e) {
  return ENTITIES.includes(e);
}

/* ---------------------------- reads ------------------------------- */

export async function listCurrent(entity) {
  switch (entity) {
    case 'store':
      return sql`select id::text as id, code, name, active, deleted, version,
                        updated_at, updated_by
                 from stores where deleted = false order by code`;
    case 'auditor':
      return sql`select id::text as id, email, name, role, active, branch, phone,
                        note, version, updated_at, updated_by
                 from auditors order by name`;
    case 'content':
      return sql`select id::text as id, kind, category_id, title, published, pinned,
                        version, updated_at, updated_by
                 from content_items order by updated_at desc`;
    case 'setting':
      return sql`select key as id, key, value, version, updated_at, updated_by
                 from app_settings order by key`;
    default:
      return [];
  }
}

export async function readOne(entity, id) {
  let rows = [];
  switch (entity) {
    case 'store':
      rows = await sql`select id::text as id, code, name, active, deleted, version
                       from stores where id = ${Number(id)}`;
      break;
    case 'auditor':
      rows = await sql`select id::text as id, email, name, role, active, branch,
                              phone, note, version
                       from auditors where id = ${Number(id)}`;
      break;
    case 'content':
      rows = await sql`select id::text as id, kind, category_id, title, body,
                              published, pinned, version
                       from content_items where id = ${Number(id)}`;
      break;
    case 'setting':
      rows = await sql`select key as id, key, value, version
                       from app_settings where key = ${String(id)}`;
      break;
  }
  return rows[0] || null;
}

export async function listVersions(entity, id, limit = 50) {
  return sql`select id, version, status, data, change_note,
                    created_by, created_by_name, created_at,
                    approved_by_name, approved_at
             from record_versions
             where entity = ${entity} and entity_id = ${String(id)}
             order by version desc
             limit ${Math.min(Number(limit) || 50, 200)}`;
}

/* --------------------------- versioning --------------------------- */

async function nextVersion(entity, id) {
  const r = await sql`select coalesce(max(version), 0) + 1 as v
                      from record_versions
                      where entity = ${entity} and entity_id = ${String(id)}`;
  return Number(r[0].v);
}

/**
 * Record a new version. Supersedes the previous current row without
 * deleting it, then inserts the new one as 'current'.
 */
export async function recordVersion(entity, id, data, user, note, approver) {
  const v = await nextVersion(entity, id);
  await sql`update record_versions set status = 'superseded'
            where entity = ${entity} and entity_id = ${String(id)}
              and status = 'current'`;
  const rows = await sql`
    insert into record_versions
      (entity, entity_id, version, data, status, change_note,
       created_by, created_by_name, approved_by, approved_by_name, approved_at)
    values
      (${entity}, ${String(id)}, ${v}, ${JSON.stringify(data)}::jsonb, 'current',
       ${note || null}, ${user?.email || null}, ${user?.name || null},
       ${approver?.email || null}, ${approver?.name || null},
       ${approver ? new Date().toISOString() : null})
    returning id, version`;
  return rows[0];
}

/* ------------------------- apply to live -------------------------- */

function clean(v) {
  return v === undefined || v === '' ? null : v;
}

/**
 * Write the change into the live table. Additive and non-destructive:
 * 'delete' is a soft deactivate, never a row removal.
 * Returns the id of the affected record.
 */
export async function applyToLive(entity, operation, id, payload, user) {
  const by = user?.email || null;

  if (entity === 'store') {
    if (operation === 'create') {
      const r = await sql`insert into stores (code, name, active, updated_by)
                          values (${payload.code}, ${payload.name},
                                  ${payload.active !== false}, ${by})
                          returning id::text as id`;
      return r[0].id;
    }
    if (operation === 'delete' || operation === 'deactivate') {
      await sql`update stores
                set active = false,
                    deleted = ${operation === 'delete'},
                    version = version + 1,
                    updated_at = now(), updated_by = ${by}
                where id = ${Number(id)}`;
      return String(id);
    }
    await sql`update stores
              set code = ${payload.code}, name = ${payload.name},
                  active = ${payload.active !== false},
                  version = version + 1,
                  updated_at = now(), updated_by = ${by}
              where id = ${Number(id)}`;
    return String(id);
  }

  if (entity === 'auditor') {
    if (operation === 'delete' || operation === 'deactivate') {
      await sql`update auditors
                set active = false, version = version + 1,
                    updated_at = now(), updated_by = ${by}
                where id = ${Number(id)}`;
      return String(id);
    }
    await sql`update auditors
              set name = ${payload.name},
                  role = ${payload.role},
                  active = ${payload.active !== false},
                  branch = ${clean(payload.branch)},
                  phone = ${clean(payload.phone)},
                  note = ${clean(payload.note)},
                  version = version + 1,
                  updated_at = now(), updated_by = ${by}
              where id = ${Number(id)}`;
    return String(id);
  }

  if (entity === 'content') {
    if (operation === 'delete') {
      await sql`update content_items
                set published = false, version = version + 1,
                    updated_at = now(), updated_by = ${by}
                where id = ${Number(id)}`;
      return String(id);
    }
    await sql`update content_items
              set title = ${payload.title},
                  body = ${clean(payload.body)},
                  published = ${!!payload.published},
                  pinned = ${!!payload.pinned},
                  version = version + 1,
                  updated_at = now(), updated_by = ${by}
              where id = ${Number(id)}`;
    return String(id);
  }

  if (entity === 'setting') {
    const key = String(id || payload.key);
    await sql`insert into app_settings (key, value, updated_at, updated_by, version)
              values (${key}, ${String(payload.value ?? '')}, now(), ${by}, 1)
              on conflict (key) do update
                set value = excluded.value,
                    updated_at = now(),
                    updated_by = ${by},
                    version = app_settings.version + 1`;
    return key;
  }

  throw new Error('unknown entity: ' + entity);
}

/* ----------------------- approval workflow ------------------------ */

export async function submitChangeRequest(
  { entity, entityId, operation, payload, before },
  user
) {
  const rows = await sql`
    insert into change_requests
      (entity, entity_id, operation, payload, before_value,
       status, requested_by, requested_by_name)
    values
      (${entity}, ${entityId ? String(entityId) : null}, ${operation},
       ${JSON.stringify(payload || {})}::jsonb,
       ${before ? JSON.stringify(before) : null}::jsonb,
       'pending', ${user?.email || null}, ${user?.name || null})
    returning id, requested_at`;
  return rows[0];
}

export async function listChangeRequests(status = 'pending', limit = 100) {
  if (status === 'all') {
    return sql`select * from change_requests
               order by requested_at desc limit ${Math.min(Number(limit) || 100, 300)}`;
  }
  return sql`select * from change_requests where status = ${status}
             order by requested_at desc limit ${Math.min(Number(limit) || 100, 300)}`;
}

export async function countPending() {
  const r = await sql`select count(*)::int as n from change_requests where status = 'pending'`;
  return r[0]?.n || 0;
}

/**
 * Approve: apply to live, record the version, mark the request applied.
 * Reject: mark rejected. Nothing is ever deleted either way.
 */
export async function decideChangeRequest(id, decision, note, approver) {
  const rows = await sql`select * from change_requests where id = ${Number(id)}`;
  const cr = rows[0];
  if (!cr) throw new Error('Change request not found');
  if (cr.status !== 'pending') throw new Error('Change request already ' + cr.status);

  if (decision !== 'approve') {
    await sql`update change_requests
              set status = 'rejected', decided_by = ${approver?.email || null},
                  decided_by_name = ${approver?.name || null},
                  decided_at = now(), decision_note = ${note || null}
              where id = ${Number(id)}`;
    return { status: 'rejected' };
  }

  const liveId = await applyToLive(
    cr.entity,
    cr.operation,
    cr.entity_id,
    cr.payload,
    { email: cr.requested_by, name: cr.requested_by_name }
  );
  const fresh = await readOne(cr.entity, liveId);
  const ver = await recordVersion(
    cr.entity,
    liveId,
    fresh || cr.payload,
    { email: cr.requested_by, name: cr.requested_by_name },
    note || cr.operation + ' approved',
    approver
  );
  await sql`update change_requests
            set status = 'applied', decided_by = ${approver?.email || null},
                decided_by_name = ${approver?.name || null},
                decided_at = now(), decision_note = ${note || null},
                applied_at = now(), applied_version = ${ver.version},
                entity_id = ${String(liveId)}
            where id = ${Number(id)}`;
  await bumpRevision();
  return { status: 'applied', version: ver.version, entityId: liveId };
}

/* --------------------------- restore ------------------------------ */

/**
 * Restoring an old version does not rewind history — it replays that
 * version's data forward as a brand-new version.
 */
export async function restoreVersion(entity, id, version, user) {
  const rows = await sql`select data from record_versions
                         where entity = ${entity} and entity_id = ${String(id)}
                           and version = ${Number(version)}`;
  if (!rows[0]) throw new Error('Version not found');
  const data = rows[0].data;
  await applyToLive(entity, 'update', id, data, user);
  const fresh = await readOne(entity, id);
  const ver = await recordVersion(
    entity, id, fresh || data, user,
    'Restored from version ' + version
  );
  await bumpRevision();
  return ver;
}

/* -------------------------- sync state ---------------------------- */

export async function getSyncState(scope = 'master_data') {
  const rows = await sql`select * from sync_state where scope = ${scope}`;
  if (rows[0]) return rows[0];
  const ins = await sql`insert into sync_state (scope) values (${scope})
                        on conflict (scope) do nothing
                        returning *`;
  return ins[0] || { scope, revision: 1, status: 'ok', last_synced_at: new Date() };
}

export async function bumpRevision(scope = 'master_data') {
  const rows = await sql`update sync_state
                         set revision = revision + 1
                         where scope = ${scope}
                         returning revision`;
  return rows[0]?.revision || 1;
}

export async function markSynced(user, { status = 'ok', detail = null, scope = 'master_data' } = {}) {
  const rows = await sql`
    insert into sync_state (scope, revision, last_synced_at, last_synced_by,
                            last_synced_by_name, status, detail)
    values (${scope}, 1, now(), ${user?.email || null}, ${user?.name || null},
            ${status}, ${detail})
    on conflict (scope) do update
      set revision = sync_state.revision + 1,
          last_synced_at = now(),
          last_synced_by = ${user?.email || null},
          last_synced_by_name = ${user?.name || null},
          status = ${status},
          detail = ${detail}
    returning *`;
  return rows[0];
}

export async function markSyncFailed(user, detail, scope = 'master_data') {
  // Deliberately does NOT bump revision and touches no data rows.
  try {
    await sql`update sync_state
              set status = 'failed', detail = ${String(detail).slice(0, 500)},
                  last_synced_by = ${user?.email || null},
                  last_synced_by_name = ${user?.name || null}
              where scope = ${scope}`;
  } catch (_) { /* never let bookkeeping mask the real error */ }
}
