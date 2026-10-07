import { sql } from './db.js';
import { recordVersion, bumpRevision } from './versioning.js';

/* ==================================================================== *
 * Controlled QA/QC records — the Edit & Save architecture.
 *
 *   Never overwrite → Always version → Always validate
 *                   → Always record  → Always protect previous data.
 *
 * Every save answers WHO / WHAT / WHEN / WHY / WHO APPROVED / EFFECTIVE.
 * ==================================================================== */

export const STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending_approval',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
};

export const STATUS_LABEL = {
  draft: 'ព្រាង / Draft',
  pending_approval: 'រង់ចាំអនុម័ត / Pending Approval',
  approved: 'បានអនុម័ត / Approved',
  published: 'បានផ្សាយ / Published',
  archived: 'រក្សាទុក / Archived',
};

export const CHANGE_CATEGORIES = [
  'Correction',
  'Standard Revision',
  'New Requirement',
  'Product Change',
  'Process Change',
  'System Correction',
  'Other',
];

/* Fields the form may write. Anything outside this list is ignored, so a
 * crafted request cannot reach Record ID, Document Code, Created By,
 * Created Date or the audit columns. */
export const EDITABLE_FIELDS = [
  'title', 'description', 'specification', 'standard', 'target',
  'frequency', 'responsible', 'remarks', 'effective_date', 'category',
  'attachment_name', 'attachment_data', 'image_data', 'related_docs',
];

/* Shown in the form but never writable after creation. */
export const READONLY_FIELDS = [
  'id', 'record_code', 'created_by', 'created_by_name', 'created_at',
  'version', 'version_label', 'status',
];

const MAX_TEXT = 4000;
const MAX_SHORT = 255;
const MAX_ATTACHMENT = 900 * 1024; // matches the photo route's per-item cap

export function versionLabel(n) {
  return 'P' + Number(n || 1);
}

/* ------------------------------ errors ----------------------------- */

export class AppError extends Error {
  constructor(status, body) {
    super(body?.error || 'Error');
    this.status = status;
    this.body = body;
  }
}

/* ---------------------------- validation --------------------------- */

/**
 * Returns { ok, errors } where errors is keyed by field name so the UI
 * can highlight exactly the offending inputs.
 */
export function validate(payload, { isCreate = false } = {}) {
  const errors = {};
  const s = (k) => (payload[k] === undefined || payload[k] === null ? '' : String(payload[k]));

  if (!s('title').trim()) errors.title = 'ចំណងជើងត្រូវតែបំពេញ / Title is required';
  else if (s('title').length > MAX_SHORT) errors.title = `យ៉ាងច្រើន ${MAX_SHORT} តួអក្សរ`;

  if (isCreate) {
    const code = s('record_code').trim();
    if (!code) errors.record_code = 'លេខកូដឯកសារត្រូវតែបំពេញ / Document code is required';
    else if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]{2,63}$/.test(code)) {
      errors.record_code = 'ទម្រង់មិនត្រឹមត្រូវ — ប្រើអក្សរ លេខ និង - _ . / ប៉ុណ្ណោះ';
    }
  }

  for (const f of ['description', 'specification', 'standard', 'remarks']) {
    if (s(f).length > MAX_TEXT) errors[f] = `យ៉ាងច្រើន ${MAX_TEXT} តួអក្សរ`;
  }
  for (const f of ['target', 'frequency', 'responsible', 'category']) {
    if (s(f).length > MAX_SHORT) errors[f] = `យ៉ាងច្រើន ${MAX_SHORT} តួអក្សរ`;
  }

  const eff = s('effective_date').trim();
  if (eff) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eff)) {
      errors.effective_date = 'ទម្រង់កាលបរិច្ឆេទត្រូវតែ YYYY-MM-DD';
    } else if (isNaN(new Date(eff).getTime())) {
      errors.effective_date = 'កាលបរិច្ឆេទមិនត្រឹមត្រូវ';
    }
  }

  const att = s('attachment_data');
  if (att) {
    if (!/^data:[\w.+-]+\/[\w.+-]+;base64,/.test(att)) {
      errors.attachment_data = 'ឯកសារភ្ជាប់មិនត្រឹមត្រូវ';
    } else if (att.length > MAX_ATTACHMENT * 1.4) {
      errors.attachment_data = 'ឯកសារភ្ជាប់ធំពេក (អតិបរមា ~900KB)';
    }
  }
  const img = s('image_data');
  if (img && !/^data:image\//.test(img)) {
    errors.image_data = 'រូបភាពមិនត្រឹមត្រូវ';
  }

  if (payload.related_docs !== undefined && !Array.isArray(payload.related_docs)) {
    errors.related_docs = 'ឯកសារពាក់ព័ន្ធត្រូវតែជាបញ្ជី';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/* Strip anything not editable, so read-only fields cannot be smuggled in. */
export function sanitizePayload(payload) {
  const out = {};
  for (const f of EDITABLE_FIELDS) {
    if (payload[f] !== undefined) out[f] = payload[f];
  }
  if (out.effective_date === '') out.effective_date = null;
  if (out.related_docs && !Array.isArray(out.related_docs)) out.related_docs = [];
  return out;
}

/* ------------------------------ diff ------------------------------- */

const DIFF_IGNORE = new Set([
  'attachment_data', 'image_data', 'id', 'created_at', 'updated_at',
  'created_by', 'updated_by', 'created_by_name', 'updated_by_name',
]);

/** Field-level comparison tagged added / changed / removed. */
export function diffRecords(before, after) {
  const keys = Array.from(new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ])).filter((k) => !DIFF_IGNORE.has(k));

  const out = [];
  for (const k of keys) {
    const a = before?.[k];
    const b = after?.[k];
    const av = a === null || a === undefined ? '' : String(a);
    const bv = b === null || b === undefined ? '' : String(b);
    if (av === bv) continue;
    out.push({
      field: k,
      previous: av,
      next: bv,
      kind: !av ? 'added' : !bv ? 'removed' : 'changed',
    });
  }
  return out;
}

/* ---------------------------- idempotency -------------------------- */

/**
 * Duplicate-save protection at the backend. A repeated request_id returns
 * the original result instead of writing a second record.
 */
export async function checkReceipt(requestId) {
  if (!requestId) return null;
  const rows = await sql`select result from save_receipts where request_id = ${requestId}`;
  return rows[0]?.result || null;
}

export async function storeReceipt(requestId, user, entity, entityId, result) {
  if (!requestId) return;
  try {
    await sql`insert into save_receipts (request_id, user_email, entity, entity_id, result)
              values (${requestId}, ${user?.email || null}, ${entity},
                      ${entityId ? String(entityId) : null},
                      ${JSON.stringify(result)}::jsonb)
              on conflict (request_id) do nothing`;
  } catch (_) { /* a missed receipt must not fail the save */ }
}

/* ------------------------------ reads ------------------------------ */

export async function listRecords({ status, q, limit = 200 } = {}) {
  const lim = Math.min(Number(limit) || 200, 500);
  if (status && status !== 'all') {
    return sql`select id::text as id, record_code, title, category, standard, target,
                      frequency, responsible, effective_date, version, version_label,
                      status, is_current, updated_at, updated_by_name, updated_by,
                      created_at, created_by_name
               from qc_records where status = ${status}
               order by record_code limit ${lim}`;
  }
  if (q) {
    const like = '%' + String(q).toLowerCase() + '%';
    return sql`select id::text as id, record_code, title, category, standard, target,
                      frequency, responsible, effective_date, version, version_label,
                      status, is_current, updated_at, updated_by_name, updated_by,
                      created_at, created_by_name
               from qc_records
               where lower(record_code) like ${like} or lower(title) like ${like}
               order by record_code limit ${lim}`;
  }
  return sql`select id::text as id, record_code, title, category, standard, target,
                    frequency, responsible, effective_date, version, version_label,
                    status, is_current, updated_at, updated_by_name, updated_by,
                    created_at, created_by_name
             from qc_records order by record_code limit ${lim}`;
}

export async function getRecord(id) {
  const rows = await sql`select *, id::text as id from qc_records where id = ${Number(id)}`;
  return rows[0] || null;
}

export async function getRecordByCode(code) {
  const rows = await sql`select *, id::text as id from qc_records
                         where lower(record_code) = ${String(code).toLowerCase()}`;
  return rows[0] || null;
}

export async function recordHistory(id, limit = 100) {
  return sql`select id, version, version_label, status, action, data, old_data,
                    change_note, change_category, approval_status, effective_date,
                    created_by, created_by_name, created_at,
                    approved_by_name, approved_at
             from record_versions
             where entity = 'qc_record' and entity_id = ${String(id)}
             order by version desc
             limit ${Math.min(Number(limit) || 100, 300)}`;
}

/* ------------------------------ writes ----------------------------- */

async function snapshot(rec, action, user, { reason, category, approver } = {}) {
  const clean = { ...rec };
  delete clean.attachment_data;
  delete clean.image_data;
  return recordVersion(
    'qc_record', rec.id, clean, user, reason || action, approver
  ).then(async (ver) => {
    await sql`update record_versions
              set action = ${action},
                  change_category = ${category || null},
                  approval_status = ${rec.status},
                  version_label = ${rec.version_label},
                  effective_date = ${rec.effective_date || null}
              where id = ${ver.id}`;
    return ver;
  });
}

export async function createRecord(payload, user, { requestId, reason, category } = {}) {
  const cached = await checkReceipt(requestId);
  if (cached) return { ...cached, deduplicated: true };

  const v = validate({ ...payload, record_code: payload.record_code }, { isCreate: true });
  if (!v.ok) throw new AppError(422, { error: 'Please correct the highlighted fields before saving.', fields: v.errors });

  const dup = await getRecordByCode(payload.record_code);
  if (dup) {
    throw new AppError(409, {
      error: 'លេខកូដឯកសារនេះមានរួចហើយ / This document code already exists.',
      fields: { record_code: 'លេខកូដស្ទួន / Duplicate code' },
    });
  }

  const p = sanitizePayload(payload);
  const rows = await sql`
    insert into qc_records
      (record_code, title, description, specification, standard, target, frequency,
       responsible, remarks, effective_date, category, attachment_name,
       attachment_data, image_data, related_docs, version, version_label, status,
       change_reason, change_category, created_by, created_by_name,
       updated_by, updated_by_name)
    values
      (${String(payload.record_code).trim()}, ${p.title}, ${p.description || null},
       ${p.specification || null}, ${p.standard || null}, ${p.target || null},
       ${p.frequency || null}, ${p.responsible || null}, ${p.remarks || null},
       ${p.effective_date || null}, ${p.category || null}, ${p.attachment_name || null},
       ${p.attachment_data || null}, ${p.image_data || null},
       ${JSON.stringify(p.related_docs || [])}::jsonb,
       1, 'P1', 'draft', ${reason || null}, ${category || null},
       ${user?.email || null}, ${user?.name || null},
       ${user?.email || null}, ${user?.name || null})
    returning *, id::text as id`;

  const rec = rows[0];
  await snapshot(rec, 'CREATE', user, { reason, category });
  await bumpRevision();

  const result = {
    ok: true, id: rec.id, recordCode: rec.record_code,
    version: rec.version, versionLabel: rec.version_label, status: rec.status,
    updatedBy: rec.updated_by_name || rec.updated_by, updatedAt: rec.updated_at,
  };
  await storeReceipt(requestId, user, 'qc_record', rec.id, result);
  return result;
}

/**
 * Save an edit.
 *
 * Optimistic locking: baseVersion is the version the form was loaded from.
 * If the stored version has moved on, nothing is written and a 409 is
 * raised carrying the latest record and a diff, so the caller can offer
 * Reload Latest / Compare Changes / Cancel rather than silently clobbering
 * the other user's work.
 */
export async function updateRecord(id, payload, user, {
  requestId, reason, category, baseVersion, requireReason = true,
} = {}) {
  const cached = await checkReceipt(requestId);
  if (cached) return { ...cached, deduplicated: true };

  const current = await getRecord(id);
  if (!current) throw new AppError(404, { error: 'រកមិនឃើញកំណត់ត្រា / Record not found' });

  if (current.status === STATUS.PUBLISHED) {
    throw new AppError(409, {
      error: 'ឯកសារដែលបានផ្សាយមិនអាចកែដោយផ្ទាល់ទេ — សូមបង្កើតកំណែថ្មី។',
      errorEn: 'A published controlled document cannot be edited directly. Create a new version instead.',
      needsNewVersion: true,
    });
  }
  if (current.status === STATUS.ARCHIVED) {
    throw new AppError(409, { error: 'កំណត់ត្រាត្រូវបានរក្សាទុក មិនអាចកែបានទេ / Record is archived' });
  }

  if (baseVersion !== undefined && baseVersion !== null
      && Number(baseVersion) !== Number(current.version)) {
    throw new AppError(409, {
      error: 'This record has been updated by another user.',
      errorKm: 'កំណត់ត្រានេះត្រូវបានកែប្រែដោយអ្នកប្រើផ្សេង។',
      detail: 'The version you are editing is no longer the latest version.',
      conflict: true,
      yourVersion: Number(baseVersion),
      latestVersion: Number(current.version),
      latest: current,
      diff: diffRecords(sanitizePayload(current), sanitizePayload(payload)),
    });
  }

  const v = validate(payload);
  if (!v.ok) throw new AppError(422, { error: 'Please correct the highlighted fields before saving.', fields: v.errors });

  if (requireReason && !String(reason || '').trim()) {
    throw new AppError(422, {
      error: 'សូមបញ្ចូលមូលហេតុនៃការផ្លាស់ប្ដូរ / Reason for change is required',
      fields: { change_reason: 'ត្រូវការមូលហេតុ' },
    });
  }
  if (requireReason && category && !CHANGE_CATEGORIES.includes(category)) {
    throw new AppError(422, { error: 'Invalid change category', fields: { change_category: 'មិនត្រឹមត្រូវ' } });
  }

  const p = sanitizePayload(payload);
  const nextVersion = Number(current.version) + 1;

  const rows = await sql`
    update qc_records set
      title = ${p.title},
      description = ${p.description ?? current.description},
      specification = ${p.specification ?? current.specification},
      standard = ${p.standard ?? current.standard},
      target = ${p.target ?? current.target},
      frequency = ${p.frequency ?? current.frequency},
      responsible = ${p.responsible ?? current.responsible},
      remarks = ${p.remarks ?? current.remarks},
      effective_date = ${p.effective_date ?? current.effective_date},
      category = ${p.category ?? current.category},
      attachment_name = ${p.attachment_name ?? current.attachment_name},
      attachment_data = ${p.attachment_data ?? current.attachment_data},
      image_data = ${p.image_data ?? current.image_data},
      related_docs = ${JSON.stringify(p.related_docs ?? current.related_docs ?? [])}::jsonb,
      version = ${nextVersion},
      version_label = ${versionLabel(nextVersion)},
      status = 'draft',
      change_reason = ${reason || null},
      change_category = ${category || null},
      updated_by = ${user?.email || null},
      updated_by_name = ${user?.name || null},
      updated_at = now()
    where id = ${Number(id)} and version = ${Number(current.version)}
    returning *, id::text as id`;

  if (!rows[0]) {
    // Lost a race between the check and the write — treat as a conflict.
    const latest = await getRecord(id);
    throw new AppError(409, {
      error: 'This record has been updated by another user.',
      errorKm: 'កំណត់ត្រានេះត្រូវបានកែប្រែដោយអ្នកប្រើផ្សេង។',
      conflict: true, latestVersion: latest?.version, latest,
    });
  }

  const rec = rows[0];
  const ver = await snapshot(rec, 'UPDATE', user, { reason, category });
  await sql`update record_versions set old_data = ${JSON.stringify({
    ...current, attachment_data: undefined, image_data: undefined,
  })}::jsonb where id = ${ver.id}`;
  await bumpRevision();

  const result = {
    ok: true, id: rec.id, recordCode: rec.record_code,
    version: rec.version, versionLabel: rec.version_label, status: rec.status,
    updatedBy: rec.updated_by_name || rec.updated_by, updatedAt: rec.updated_at,
    changes: diffRecords(sanitizePayload(current), sanitizePayload(rec)),
  };
  await storeReceipt(requestId, user, 'qc_record', rec.id, result);
  return result;
}

/* --------------------------- transitions --------------------------- */

const ALLOWED = {
  submit: [STATUS.DRAFT],
  approve: [STATUS.PENDING],
  reject: [STATUS.PENDING],
  publish: [STATUS.APPROVED, STATUS.PENDING, STATUS.DRAFT],
  archive: [STATUS.DRAFT, STATUS.PENDING, STATUS.APPROVED, STATUS.PUBLISHED],
};

export async function transition(id, action, user, { reason } = {}) {
  const rec = await getRecord(id);
  if (!rec) throw new AppError(404, { error: 'រកមិនឃើញកំណត់ត្រា / Record not found' });

  const allowed = ALLOWED[action];
  if (!allowed) throw new AppError(400, { error: 'Unknown action: ' + action });
  if (!allowed.includes(rec.status)) {
    throw new AppError(409, {
      error: `មិនអាចធ្វើ "${action}" ពីស្ថានភាព "${rec.status}" បានទេ`,
      errorEn: `Cannot ${action} a record with status ${rec.status}`,
    });
  }

  let rows;
  if (action === 'submit') {
    rows = await sql`update qc_records
                     set status = 'pending_approval', submitted_by = ${user?.email || null},
                         submitted_at = now(), updated_at = now()
                     where id = ${Number(id)} returning *, id::text as id`;
  } else if (action === 'approve') {
    rows = await sql`update qc_records
                     set status = 'approved', approved_by = ${user?.email || null},
                         approved_by_name = ${user?.name || null}, approved_at = now(),
                         updated_at = now()
                     where id = ${Number(id)} returning *, id::text as id`;
  } else if (action === 'reject') {
    rows = await sql`update qc_records
                     set status = 'draft', approved_by = null, approved_by_name = null,
                         approved_at = null, updated_at = now()
                     where id = ${Number(id)} returning *, id::text as id`;
  } else if (action === 'publish') {
    rows = await sql`update qc_records
                     set status = 'published', is_current = true,
                         published_by = ${user?.email || null}, published_at = now(),
                         approved_by = coalesce(approved_by, ${user?.email || null}),
                         approved_by_name = coalesce(approved_by_name, ${user?.name || null}),
                         approved_at = coalesce(approved_at, now()),
                         updated_at = now()
                     where id = ${Number(id)} returning *, id::text as id`;
  } else {
    // archive — never a row removal
    rows = await sql`update qc_records
                     set status = 'archived', is_current = false,
                         archived_by = ${user?.email || null}, archived_at = now(),
                         updated_at = now()
                     where id = ${Number(id)} returning *, id::text as id`;
  }

  const updated = rows[0];
  await snapshot(updated, action.toUpperCase(), user, {
    reason, approver: ['approve', 'publish'].includes(action) ? user : undefined,
  });
  await bumpRevision();

  return {
    ok: true, id: updated.id, status: updated.status,
    version: updated.version, versionLabel: updated.version_label,
    recordCode: updated.record_code,
    updatedBy: user?.name || user?.email, updatedAt: updated.updated_at,
  };
}

/**
 * Create a new editable version of a published document. The published
 * P-n stays exactly as it is in history; editing resumes on P-(n+1).
 */
export async function newVersionFrom(id, user, { reason, category } = {}) {
  const rec = await getRecord(id);
  if (!rec) throw new AppError(404, { error: 'រកមិនឃើញកំណត់ត្រា / Record not found' });
  if (rec.status !== STATUS.PUBLISHED) {
    throw new AppError(409, { error: 'មានតែឯកសារដែលបានផ្សាយទេដែលត្រូវការកំណែថ្មី' });
  }
  const next = Number(rec.version) + 1;
  const rows = await sql`update qc_records
                         set version = ${next}, version_label = ${versionLabel(next)},
                             status = 'draft', change_reason = ${reason || null},
                             change_category = ${category || null},
                             published_by = null, published_at = null,
                             approved_by = null, approved_by_name = null, approved_at = null,
                             updated_by = ${user?.email || null},
                             updated_by_name = ${user?.name || null}, updated_at = now()
                         where id = ${Number(id)} and version = ${Number(rec.version)}
                         returning *, id::text as id`;
  if (!rows[0]) throw new AppError(409, { error: 'Record changed, please reload', conflict: true });

  const ver = await snapshot(rows[0], 'NEW_VERSION', user, { reason, category });
  await sql`update record_versions set old_data = ${JSON.stringify({
    ...rec, attachment_data: undefined, image_data: undefined,
  })}::jsonb where id = ${ver.id}`;
  await bumpRevision();

  return {
    ok: true, id: rows[0].id, version: next, versionLabel: versionLabel(next),
    status: 'draft', recordCode: rows[0].record_code,
  };
}

/* ------------------------------ drafts ----------------------------- */

export async function saveDraft(entity, entityId, user, data, baseVersion) {
  const rows = await sql`
    insert into record_drafts (entity, entity_id, owner_email, data, base_version, saved_at)
    values (${entity}, ${entityId ? String(entityId) : null}, ${user.email},
            ${JSON.stringify(data)}::jsonb, ${baseVersion ?? null}, now())
    on conflict (entity, coalesce(entity_id, ''), owner_email) do update
      set data = excluded.data, base_version = excluded.base_version, saved_at = now()
    returning saved_at`;
  return rows[0];
}

export async function getDraft(entity, entityId, user) {
  const rows = await sql`select data, base_version, saved_at from record_drafts
                         where entity = ${entity}
                           and coalesce(entity_id, '') = ${entityId ? String(entityId) : ''}
                           and owner_email = ${user.email}`;
  return rows[0] || null;
}

export async function dropDraft(entity, entityId, user) {
  await sql`delete from record_drafts
            where entity = ${entity}
              and coalesce(entity_id, '') = ${entityId ? String(entityId) : ''}
              and owner_email = ${user.email}`;
}
