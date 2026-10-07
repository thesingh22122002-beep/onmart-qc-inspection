'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { T, Card, Btn, Field, Input, Select, Textarea, Pill, Table, Td, Modal } from './ui.js';

/* ------------------------------------------------------------------ *
 * Edit & Save form for a controlled QA/QC record.
 *
 * Never overwrite → always version → always validate → always record
 *                 → always protect previous data.
 * ------------------------------------------------------------------ */

const CATEGORIES = [
  'Correction', 'Standard Revision', 'New Requirement', 'Product Change',
  'Process Change', 'System Correction', 'Other',
];

const STATUS_TONE = {
  draft: 'muted', pending_approval: 'warn', approved: 'good',
  published: 'good', archived: 'danger',
};

const STATUS_LABEL = {
  draft: 'ព្រាង / Draft',
  pending_approval: 'រង់ចាំអនុម័ត / Pending Approval',
  approved: 'បានអនុម័ត / Approved',
  published: 'បានផ្សាយ / Published',
  archived: 'រក្សាទុក / Archived',
};

const TEXT_FIELDS = [
  ['title', 'ឈ្មោះ / Name', 'input', true],
  ['description', 'ការពិពណ៌នា / Description', 'area'],
  ['specification', 'លក្ខណៈបច្ចេកទេស / Specification', 'area'],
  ['standard', 'ស្តង់ដារ / Standard', 'area'],
  ['target', 'គោលដៅ / Target', 'input'],
  ['frequency', 'ភាពញឹកញាប់ / Frequency', 'input'],
  ['responsible', 'អ្នកទទួលខុសត្រូវ / Responsible Person', 'input'],
  ['remarks', 'កំណត់សម្គាល់ / Remarks', 'area'],
];

function stamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${m[d.getMonth()]}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function newRequestId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) { /* fall through */ }
  return 'rq-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

function ChangeTable({ changes }) {
  if (!changes || changes.length === 0) {
    return <p style={{ fontFamily: T?.km, fontSize: 13, color: '#64748b' }}>គ្មានការផ្លាស់ប្ដូរ / No changes</p>;
  }
  const tone = { added: '#15803d', removed: '#b91c1c', changed: '#b45309' };
  const label = { added: 'បន្ថែម / Added', removed: 'ដក / Removed', changed: 'ប្ដូរ / Changed' };
  return (
    <Table head={['វាល / Field', 'ពីមុន / Previous', 'ថ្មី / New', '']}>
      {changes.map((c) => (
        <tr key={c.field}>
          <Td><code style={{ fontSize: 12 }}>{c.field}</code></Td>
          <Td><span style={{ color: '#b91c1c' }}>{c.previous || '—'}</span></Td>
          <Td><span style={{ color: '#15803d' }}>{c.next || '—'}</span></Td>
          <Td><span style={{ color: tone[c.kind], fontSize: 12 }}>{label[c.kind]}</span></Td>
        </tr>
      ))}
    </Table>
  );
}

export default function RecordForm({ recordId, mode, allow, toast, onClose, onSaved }) {
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState({});
  const [baseVersion, setBaseVersion] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(mode === 'edit');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('Standard Revision');
  const [confirm, setConfirm] = useState(null);   // { intent }
  const [conflict, setConflict] = useState(null);
  const [failure, setFailure] = useState(null);
  const [success, setSuccess] = useState(null);
  const [draftAt, setDraftAt] = useState(null);
  const [leaveGuard, setLeaveGuard] = useState(null);
  const [preview, setPreview] = useState(null);

  const requestIdRef = useRef(null);
  const originalRef = useRef({});

  const canEdit = allow('records', 'edit');
  const canApprove = allow('records', 'approve');
  const canArchive = allow('records', 'delete');
  const isPublished = record?.status === 'published';
  const isArchived = record?.status === 'archived';

  /* ------------------------- load latest ------------------------- */

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/records/${recordId}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { toast?.(j.error || 'Load failed', 'danger'); onClose?.(); return; }
      const rec = j.record;
      setRecord(rec);
      setBaseVersion(rec.version);
      const f = {};
      for (const [k] of TEXT_FIELDS) f[k] = rec[k] || '';
      f.category = rec.category || '';
      f.effective_date = rec.effective_date ? String(rec.effective_date).slice(0, 10) : '';
      setForm(f);
      originalRef.current = { ...f };
      setErrors({});
      setConflict(null);
      setFailure(null);

      // Offer a newer unsaved draft if one exists.
      try {
        const dr = await fetch(`/api/admin/drafts?entity=qc_record&id=${recordId}`, { cache: 'no-store' });
        const dj = await dr.json();
        if (dj?.draft?.data && dj.draft.base_version === rec.version) {
          setDraftAt(dj.draft.saved_at);
        }
      } catch (_) { /* a missing draft is normal */ }
    } catch (e) {
      toast?.('Load failed: ' + e.message, 'danger');
      onClose?.();
    } finally {
      setLoading(false);
    }
  }, [recordId, toast, onClose]);

  useEffect(() => { load(); }, [load]);

  /* --------------------------- dirty ----------------------------- */

  const dirty = useMemo(() => {
    const o = originalRef.current || {};
    return Object.keys(form).some((k) => String(form[k] ?? '') !== String(o[k] ?? ''));
  }, [form]);

  // Browser-level guard for tab close and reload.
  useEffect(() => {
    if (!editing || !dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; return ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [editing, dirty]);

  /* ------------------------- autosave ---------------------------- */

  useEffect(() => {
    if (!editing || !dirty || isPublished || isArchived) return undefined;
    const id = setInterval(async () => {
      try {
        const r = await fetch('/api/admin/drafts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            entity: 'qc_record', id: recordId, data: form, baseVersion,
          }),
        });
        const j = await r.json();
        if (j.ok) setDraftAt(j.savedAt);
      } catch (_) { /* autosave stays silent */ }
    }, 45000);
    return () => clearInterval(id);
  }, [editing, dirty, form, recordId, baseVersion, isPublished, isArchived]);

  /* ------------------------ client validate ---------------------- */

  function clientValidate() {
    const e = {};
    if (!String(form.title || '').trim()) e.title = 'ឈ្មោះត្រូវតែបំពេញ / Name is required';
    if (form.effective_date && !/^\d{4}-\d{2}-\d{2}$/.test(form.effective_date)) {
      e.effective_date = 'ទម្រង់ត្រូវតែ YYYY-MM-DD';
    }
    if (!String(reason || '').trim()) e.change_reason = 'សូមបញ្ចូលមូលហេតុ / Reason is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  /* ---------------------------- save ----------------------------- */

  async function doSave(intent) {
    if (saving) return;                       // duplicate-click protection
    if (!requestIdRef.current) requestIdRef.current = newRequestId();

    setSaving(true);
    setFailure(null);
    try {
      const r = await fetch(`/api/admin/records/${recordId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          payload: form,
          baseVersion,
          changeReason: reason,
          changeCategory: category,
          requestId: requestIdRef.current,
        }),
      });
      const j = await r.json();

      if (r.status === 422) {
        setErrors(j.fields || {});
        toast?.('Please correct the highlighted fields before saving.', 'danger');
        return;
      }
      if (r.status === 409 && j.conflict) {
        setConflict(j);
        return;
      }
      if (!r.ok) {
        setFailure(j.message || j.error || 'Save Failed');
        return;
      }

      requestIdRef.current = null;
      originalRef.current = { ...form };
      setBaseVersion(j.version);
      setSuccess({
        recordCode: j.recordCode, version: j.versionLabel,
        status: j.status, updatedBy: j.updatedBy, updatedAt: j.updatedAt,
        changes: j.changes || [],
      });

      // The draft has become the saved record.
      fetch(`/api/admin/drafts?entity=qc_record&id=${recordId}`, { method: 'DELETE' }).catch(() => {});
      setDraftAt(null);

      if (intent === 'submit') await act('submit', false);

      await load();
      onSaved?.();

      if (intent === 'close') {
        setEditing(false);
        onClose?.();
      } else if (intent === 'continue') {
        setEditing(true);
      }
    } catch (e) {
      setFailure('Save Failed — ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  /* -------------------------- lifecycle -------------------------- */

  async function act(action, reload = true) {
    try {
      const r = await fetch(`/api/admin/records/${recordId}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, reason, category }),
      });
      const j = await r.json();
      if (!r.ok) { toast?.(j.error || j.errorEn || 'Action failed', 'danger'); return; }
      toast?.(`${j.recordCode} → ${STATUS_LABEL[j.status] || j.status}`, 'good');
      if (reload) { await load(); onSaved?.(); }
    } catch (e) {
      toast?.('Action failed: ' + e.message, 'danger');
    }
  }

  async function viewChanges() {
    try {
      const r = await fetch(`/api/admin/records/${recordId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: form }),
      });
      const j = await r.json();
      setPreview(j.changes || []);
    } catch (e) {
      toast?.('Compare failed: ' + e.message, 'danger');
    }
  }

  function tryClose() {
    if (editing && dirty) { setLeaveGuard(true); return; }
    onClose?.();
  }

  async function restoreDraft() {
    try {
      const r = await fetch(`/api/admin/drafts?entity=qc_record&id=${recordId}`, { cache: 'no-store' });
      const j = await r.json();
      if (j?.draft?.data) { setForm(j.draft.data); setEditing(true); }
      setDraftAt(null);
    } catch (_) { setDraftAt(null); }
  }

  /* ---------------------------- render --------------------------- */

  if (loading) {
    return <Modal title="កំពុងផ្ទុក…" onClose={onClose} wide><p>កំពុងផ្ទុកទិន្នន័យចុងក្រោយ…</p></Modal>;
  }
  if (!record) return null;

  const ro = {
    opacity: 0.65, background: '#f1f5f9', cursor: 'not-allowed',
  };
  const errStyle = (k) => (errors[k]
    ? { border: '1.5px solid #dc2626', background: '#fef2f2' }
    : undefined);

  const locked = !editing || isPublished || isArchived;

  return (
    <Modal
      title={`${record.record_code} — ${record.title}`}
      onClose={tryClose}
      wide
    >
      {/* ---------- header strip: version / status / who / when ---------- */}
      <div style={{
        display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center',
        padding: '10px 14px', borderRadius: 10, marginBottom: 16,
        background: '#f8fafc', border: '1px solid #e2e8f0', fontFamily: T?.km,
        fontSize: 13, lineHeight: 1.6,
      }}>
        <Pill tone="muted">Version {record.version_label}</Pill>
        <Pill tone={STATUS_TONE[record.status] || 'muted'}>
          {STATUS_LABEL[record.status] || record.status}
        </Pill>
        <div><strong>Last Updated:</strong> {stamp(record.updated_at)}</div>
        <div><strong>Updated By:</strong> {record.updated_by_name || record.updated_by || '—'}</div>
        {record.approved_by_name && (
          <div><strong>Approved By:</strong> {record.approved_by_name}</div>
        )}
        {record.effective_date && (
          <div><strong>Effective:</strong> {String(record.effective_date).slice(0, 10)}</div>
        )}
      </div>

      {draftAt && !editing && (
        <div style={{
          padding: '9px 13px', borderRadius: 9, marginBottom: 14, fontSize: 13,
          background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af',
          fontFamily: T?.km, display: 'flex', gap: 10, alignItems: 'center',
        }}>
          <span>មានព្រាងដែលមិនទាន់រក្សាទុក ចាប់ពី {stamp(draftAt)}។</span>
          <Btn small ghost onClick={restoreDraft}>បើកព្រាង / Restore draft</Btn>
          <Btn small ghost onClick={() => setDraftAt(null)}>មិនយក</Btn>
        </div>
      )}

      {isPublished && (
        <div style={{
          padding: '9px 13px', borderRadius: 9, marginBottom: 14, fontSize: 13,
          background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534',
          fontFamily: T?.km, lineHeight: 1.7,
        }}>
          ឯកសារដែលបានផ្សាយមិនអាចកែដោយផ្ទាល់ទេ។ សូមចុច <strong>បង្កើតកំណែថ្មី</strong> ដើម្បីកែប្រែ —
          កំណែ {record.version_label} នឹងនៅរក្សាទុកក្នុងប្រវត្តិដដែល។
        </div>
      )}

      {/* ----------------------------- form ----------------------------- */}
      <div style={{ display: 'grid', gap: 13 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
          <Field label="លេខកូដឯកសារ / Document Code (អានតែប៉ុណ្ណោះ)">
            <Input value={record.record_code} disabled style={ro} />
          </Field>
          <Field label="បង្កើតដោយ / Created By (អានតែប៉ុណ្ណោះ)">
            <Input value={`${record.created_by_name || record.created_by || '—'} · ${stamp(record.created_at)}`} disabled style={ro} />
          </Field>
        </div>

        {TEXT_FIELDS.map(([k, label, kind, required]) => (
          <Field key={k} label={label + (required ? ' *' : '')} error={errors[k]}>
            {kind === 'area' ? (
              <Textarea
                rows={3}
                value={form[k] || ''}
                disabled={locked}
                style={{ ...(locked ? ro : {}), ...errStyle(k) }}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            ) : (
              <Input
                value={form[k] || ''}
                disabled={locked}
                style={{ ...(locked ? ro : {}), ...errStyle(k) }}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            )}
            {errors[k] && (
              <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4, fontFamily: T?.km }}>
                {errors[k]}
              </div>
            )}
          </Field>
        ))}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
          <Field label="ប្រភេទ / Category">
            <Input
              value={form.category || ''}
              disabled={locked}
              style={{ ...(locked ? ro : {}), ...errStyle('category') }}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </Field>
          <Field label="ថ្ងៃចូលជាធរមាន / Effective Date" error={errors.effective_date}>
            <Input
              type="date"
              value={form.effective_date || ''}
              disabled={locked}
              style={{ ...(locked ? ro : {}), ...errStyle('effective_date') }}
              onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
            />
            {errors.effective_date && (
              <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{errors.effective_date}</div>
            )}
          </Field>
        </div>

        {editing && !isPublished && !isArchived && (
          <div style={{
            padding: 13, borderRadius: 10, background: '#fffbeb',
            border: '1px solid #fde68a', display: 'grid', gap: 11,
          }}>
            <div style={{ fontFamily: T?.km, fontSize: 13, fontWeight: 600, color: '#92400e' }}>
              មូលហេតុនៃការផ្លាស់ប្ដូរ / Reason for Change *
            </div>
            <Field label="មូលហេតុ / Reason" error={errors.change_reason}>
              <Input
                value={reason}
                placeholder="ឧ. កែស្តង់ដារសីតុណ្ហភាពតាមការពិនិត្យរបស់ QA"
                style={errStyle('change_reason')}
                onChange={(e) => setReason(e.target.value)}
              />
              {errors.change_reason && (
                <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4, fontFamily: T?.km }}>
                  {errors.change_reason}
                </div>
              )}
            </Field>
            <Field label="ប្រភេទការផ្លាស់ប្ដូរ / Change Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </div>
        )}
      </div>

      {draftAt && editing && (
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 10, fontFamily: T?.km }}>
          ព្រាងបានរក្សាទុកនៅ {stamp(draftAt)} · Draft saved at {stamp(draftAt)}
        </div>
      )}

      {/* ---------------------------- actions ---------------------------- */}
      <div style={{
        display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap',
        justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: 16,
      }}>
        {!editing && (
          <>
            {canEdit && !isPublished && !isArchived && (
              <Btn onClick={() => setEditing(true)}>កែប្រែ / Edit</Btn>
            )}
            {canEdit && isPublished && (
              <Btn onClick={() => setConfirm({ intent: 'new-version' })}>
                បង្កើតកំណែថ្មី / Create New Version
              </Btn>
            )}
            <Btn ghost onClick={tryClose}>បិទ / Close</Btn>
          </>
        )}

        {editing && (
          <>
            <Btn small ghost onClick={viewChanges} disabled={!dirty}>
              មើលការផ្លាស់ប្ដូរ / View Changes
            </Btn>
            <Btn ghost onClick={tryClose}>បោះបង់ / Cancel</Btn>
            <Btn ghost disabled={saving || !dirty}
              onClick={() => { if (clientValidate()) setConfirm({ intent: 'continue' }); }}>
              រក្សាទុក និងបន្ត / Save &amp; Continue
            </Btn>
            <Btn disabled={saving || !dirty}
              onClick={() => { if (clientValidate()) setConfirm({ intent: 'close' }); }}>
              {saving ? 'Saving…' : 'រក្សាទុក / Save Changes'}
            </Btn>
            {!canApprove && (
              <Btn disabled={saving}
                onClick={() => { if (clientValidate()) setConfirm({ intent: 'submit' }); }}>
                ដាក់ស្នើសុំអនុម័ត / Submit for Approval
              </Btn>
            )}
          </>
        )}

        {!editing && canApprove && record.status === 'pending_approval' && (
          <>
            <Btn danger ghost onClick={() => act('reject')}>បដិសេធ / Reject</Btn>
            <Btn onClick={() => act('approve')}>អនុម័ត / Approve</Btn>
          </>
        )}
        {!editing && canApprove && ['approved', 'draft'].includes(record.status) && (
          <Btn onClick={() => act('publish')}>ផ្សាយ / Publish</Btn>
        )}
        {!editing && canArchive && record.status !== 'archived' && (
          <Btn danger ghost onClick={() => setConfirm({ intent: 'archive' })}>
            រក្សាទុកជាឯកសារចាស់ / Archive
          </Btn>
        )}
      </div>

      {/* --------------------------- dialogs ---------------------------- */}

      {confirm && (
        <Modal title="បញ្ជាក់ការកែប្រែ / Confirm Update" onClose={() => setConfirm(null)}>
          <p style={{ fontFamily: T?.km, fontSize: 14, lineHeight: 1.8 }}>
            {confirm.intent === 'archive'
              ? 'កំណត់ត្រានេះនឹងត្រូវដាក់ជា Archived។ វានៅតែរក្សាទុកក្នុងមូលដ្ឋានទិន្នន័យ និងប្រវត្តិសវនកម្មដដែល។'
              : confirm.intent === 'new-version'
                ? `កំណែថ្មីនឹងត្រូវបង្កើត។ កំណែ ${record.version_label} ដែលបានផ្សាយនឹងនៅរក្សាទុកក្នុងប្រវត្តិ។`
                : 'អ្នកកំពុងនឹងកែប្រែកំណត់ត្រានេះ។ កំណែមុននឹងត្រូវរក្សាទុកក្នុងប្រវត្តិ។'}
          </p>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
            You are about to update this record. The previous version will be retained in the history.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
            <Btn ghost onClick={() => setConfirm(null)}>Cancel</Btn>
            <Btn disabled={saving} onClick={() => {
              const intent = confirm.intent;
              setConfirm(null);
              if (intent === 'archive') act('archive');
              else if (intent === 'new-version') act('new-version');
              else doSave(intent);
            }}>
              {saving ? 'Saving…' : 'Confirm & Save'}
            </Btn>
          </div>
        </Modal>
      )}

      {conflict && (
        <Modal title="កំណត់ត្រាត្រូវបានកែដោយអ្នកផ្សេង" onClose={() => setConflict(null)}>
          <p style={{ fontFamily: T?.km, fontSize: 14, lineHeight: 1.8 }}>
            <strong>This record has been updated by another user.</strong><br />
            The version you are editing (P{conflict.yourVersion}) is no longer the latest
            version (P{conflict.latestVersion}).
          </p>
          <p style={{ fontFamily: T?.km, fontSize: 13, color: '#b45309', marginTop: 8 }}>
            ការកែប្រែរបស់អ្នកមិនត្រូវបានរក្សាទុកទេ ហើយការងាររបស់អ្នកផ្សេងមិនត្រូវបានសរសេរជាន់ឡើយ។
          </p>
          {conflict.diff?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <ChangeTable changes={conflict.diff} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
            <Btn ghost onClick={() => setConflict(null)}>Cancel</Btn>
            <Btn ghost onClick={() => setPreview(conflict.diff || [])}>Compare Changes</Btn>
            <Btn onClick={() => { setConflict(null); requestIdRef.current = null; load(); }}>
              Reload Latest
            </Btn>
          </div>
        </Modal>
      )}

      {failure && (
        <Modal title="Save Failed" onClose={() => setFailure(null)}>
          <p style={{ fontFamily: T?.km, fontSize: 14, lineHeight: 1.8 }}>
            <strong>ទិន្នន័យមុនរបស់អ្នកនៅតែមានសុវត្ថិភាព។ គ្មានការផ្លាស់ប្ដូរណាត្រូវបានអនុវត្តទេ។</strong><br />
            Your previous data is still safe. No changes were applied.
          </p>
          <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 10 }}>{failure}</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
            <Btn ghost onClick={() => setFailure(null)}>Cancel</Btn>
            <Btn disabled={saving} onClick={() => { setFailure(null); doSave('continue'); }}>
              Try Again
            </Btn>
          </div>
        </Modal>
      )}

      {success && (
        <Modal title="✓ Changes saved successfully" onClose={() => setSuccess(null)}>
          <div style={{ fontFamily: T?.km, fontSize: 14, lineHeight: 2 }}>
            <div><strong>{success.recordCode}</strong> updated successfully.</div>
            <div>Version: <strong>{success.version}</strong></div>
            <div>Status: <strong>{STATUS_LABEL[success.status] || success.status}</strong></div>
            <div>Updated by: {success.updatedBy || '—'}</div>
            <div>{stamp(success.updatedAt)}</div>
          </div>
          {success.changes?.length > 0 && (
            <div style={{ marginTop: 14 }}><ChangeTable changes={success.changes} /></div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
            <Btn onClick={() => setSuccess(null)}>យល់ព្រម / OK</Btn>
          </div>
        </Modal>
      )}

      {preview && (
        <Modal title="ការប្រៀបធៀបការផ្លាស់ប្ដូរ / View Changes" onClose={() => setPreview(null)} wide>
          <ChangeTable changes={preview} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn ghost onClick={() => setPreview(null)}>បិទ / Close</Btn>
          </div>
        </Modal>
      )}

      {leaveGuard && (
        <Modal title="Unsaved Changes" onClose={() => setLeaveGuard(null)}>
          <p style={{ fontFamily: T?.km, fontSize: 14, lineHeight: 1.8 }}>
            អ្នកមានការកែប្រែដែលមិនទាន់រក្សាទុក។ តើអ្នកចង់រក្សាទុកមុននឹងចាកចេញទេ?<br />
            <span style={{ color: '#64748b', fontSize: 13 }}>
              You have unsaved changes. Do you want to save them before leaving?
            </span>
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Btn ghost onClick={() => setLeaveGuard(null)}>Cancel</Btn>
            <Btn danger ghost onClick={() => {
              setLeaveGuard(null);
              setForm({ ...originalRef.current });
              setEditing(false);
              onClose?.();
            }}>Discard Changes</Btn>
            <Btn disabled={saving} onClick={() => {
              setLeaveGuard(null);
              if (clientValidate()) setConfirm({ intent: 'close' });
            }}>Save Changes</Btn>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
