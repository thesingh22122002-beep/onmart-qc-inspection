'use client';
import { useCallback, useEffect, useState } from 'react';
import { T, Card, SectionTitle, Btn, Field, Input, Select, Pill, Table, Td, Modal, mkSay } from './compat.js';
import RefreshBar from './refreshbar';
import RecordForm from './recordform';

const STATUSES = [
  { k: 'all', label: 'ទាំងអស់ / All' },
  { k: 'draft', label: 'ព្រាង / Draft' },
  { k: 'pending_approval', label: 'រង់ចាំអនុម័ត / Pending' },
  { k: 'approved', label: 'បានអនុម័ត / Approved' },
  { k: 'published', label: 'បានផ្សាយ / Published' },
  { k: 'archived', label: 'រក្សាទុក / Archived' },
];

const TONE = {
  draft: 'muted', pending_approval: 'warn', approved: 'good',
  published: 'good', archived: 'danger',
};

const LABEL = {
  draft: 'Draft', pending_approval: 'Pending Approval',
  approved: 'Approved', published: 'Published', archived: 'Archived',
};

const CATEGORIES = [
  'Correction', 'Standard Revision', 'New Requirement', 'Product Change',
  'Process Change', 'System Correction', 'Other',
];

function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleString();
}

export default function Records({ allow, toast }) {
  const say = mkSay(toast);
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(null);       // { id, mode }
  const [history, setHistory] = useState(null);
  const [creating, setCreating] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const canCreate = allow('records', 'create');
  const canEdit = allow('records', 'edit');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = `/api/admin/records?status=${status}&q=${encodeURIComponent(q)}`;
      const r = await fetch(u, { cache: 'no-store' });
      const j = await r.json();
      setRows(r.ok ? (j.records || []) : []);
      if (!r.ok) say(j.error || 'Load failed', 'danger');
    } catch (e) {
      say('Load failed: ' + e.message, 'danger');
    } finally {
      setLoading(false);
    }
  }, [status, q, toast]);

  useEffect(() => {
    const t = setTimeout(load, q ? 350 : 0);   // debounce the search box
    return () => clearTimeout(t);
  }, [load, q]);

  async function openHistory(row) {
    try {
      const r = await fetch(`/api/admin/records/${row.id}/history`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { say(j.error || 'History unavailable', 'danger'); return; }
      setHistory({ row, entries: j.history || [] });
    } catch (e) {
      say('History failed: ' + e.message, 'danger');
    }
  }

  async function create() {
    const e = {};
    if (!String(creating.record_code || '').trim()) e.record_code = 'ត្រូវការលេខកូដ / Code required';
    if (!String(creating.title || '').trim()) e.title = 'ត្រូវការឈ្មោះ / Name required';
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const r = await fetch('/api/admin/records', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          payload: creating,
          changeReason: creating.change_reason || 'Initial creation',
          changeCategory: creating.change_category || 'New Requirement',
          requestId: creating._rid,
        }),
      });
      const j = await r.json();
      if (r.status === 422 || r.status === 409) {
        setErrors(j.fields || {});
        say(j.error || 'Please correct the highlighted fields before saving.', 'danger');
        return;
      }
      if (!r.ok) { say(j.message || j.error || 'Save failed', 'danger'); return; }
      say(`${j.recordCode} created as ${j.versionLabel} (Draft)`, 'good');
      setCreating(null);
      load();
    } catch (e2) {
      say('Save failed: ' + e2.message, 'danger');
    } finally {
      setSaving(false);
    }
  }

  function startCreate() {
    let rid = 'rq-' + Date.now();
    try { if (crypto?.randomUUID) rid = crypto.randomUUID(); } catch (_) { /* noop */ }
    setErrors({});
    setCreating({ record_code: '', title: '', change_category: 'New Requirement', _rid: rid });
  }

  return (
    <div>
      <SectionTitle
        title="ឯកសារគ្រប់គ្រង QA/QC / Controlled Records"
        sub="កុំសរសេរជាន់ → បង្កើតកំណែ → ផ្ទៀងផ្ទាត់ → កត់ត្រា → ការពារទិន្នន័យចាស់"
      />

      <RefreshBar onSynced={load} />

      <Card>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          {STATUSES.map((s) => (
            <button
              key={s.k}
              onClick={() => setStatus(s.k)}
              style={{
                fontFamily: T?.km, fontSize: 13, padding: '7px 13px',
                borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${status === s.k ? '#1d4ed8' : '#cbd5e1'}`,
                background: status === s.k ? '#1d4ed8' : '#fff',
                color: status === s.k ? '#fff' : '#334155',
              }}
            >{s.label}</button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input
              value={q}
              placeholder="ស្វែងរកលេខកូដ ឬឈ្មោះ…"
              style={{ minWidth: 220 }}
              onChange={(e) => setQ(e.target.value)}
            />
            {canCreate && <Btn onClick={startCreate}>+ ឯកសារថ្មី / New Record</Btn>}
          </div>
        </div>

        <Table head={['លេខកូដ', 'ឈ្មោះ', 'កំណែ', 'ស្ថានភាព', 'ចូលជាធរមាន', 'កែចុងក្រោយ', 'សកម្មភាព']}>
          {loading && <tr><Td colSpan={7}>កំពុងផ្ទុក…</Td></tr>}
          {!loading && rows.length === 0 && (
            <tr><Td colSpan={7}>គ្មានឯកសារ — ចុច “ឯកសារថ្មី” ដើម្បីបង្កើត</Td></tr>
          )}
          {!loading && rows.map((r) => (
            <tr key={r.id}>
              <Td><code style={{ fontSize: 12.5 }}>{r.record_code}</code></Td>
              <Td>{r.title}</Td>
              <Td><Pill tone="muted">{r.version_label}</Pill></Td>
              <Td><Pill tone={TONE[r.status] || 'muted'}>{LABEL[r.status] || r.status}</Pill></Td>
              <Td>{r.effective_date ? String(r.effective_date).slice(0, 10) : '—'}</Td>
              <Td style={{ fontSize: 12.5 }}>
                {r.updated_by_name || r.updated_by || '—'}<br />
                <span style={{ color: '#64748b' }}>{when(r.updated_at)}</span>
              </Td>
              <Td>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Btn small ghost onClick={() => setOpen({ id: r.id, mode: 'view' })}>មើល</Btn>
                  {canEdit && r.status !== 'archived' && (
                    <Btn small onClick={() => setOpen({ id: r.id, mode: r.status === 'published' ? 'view' : 'edit' })}>
                      កែ
                    </Btn>
                  )}
                  <Btn small ghost onClick={() => openHistory(r)}>ប្រវត្តិ</Btn>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      {open && (
        <RecordForm
          recordId={open.id}
          mode={open.mode}
          allow={allow}
          toast={toast}
          onClose={() => setOpen(null)}
          onSaved={load}
        />
      )}

      {creating && (
        <Modal title="ឯកសារគ្រប់គ្រងថ្មី / New Controlled Record" onClose={() => setCreating(null)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="លេខកូដឯកសារ / Document Code *">
              <Input
                value={creating.record_code}
                placeholder="QC-STD-001"
                style={errors.record_code ? { border: '1.5px solid #dc2626', background: '#fef2f2' } : undefined}
                onChange={(e) => setCreating({ ...creating, record_code: e.target.value })}
              />
              {errors.record_code && (
                <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4, fontFamily: T?.km }}>
                  {errors.record_code}
                </div>
              )}
            </Field>
            <Field label="ឈ្មោះ / Name *">
              <Input
                value={creating.title}
                style={errors.title ? { border: '1.5px solid #dc2626', background: '#fef2f2' } : undefined}
                onChange={(e) => setCreating({ ...creating, title: e.target.value })}
              />
              {errors.title && (
                <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4, fontFamily: T?.km }}>
                  {errors.title}
                </div>
              )}
            </Field>
            <Field label="ស្តង់ដារ / Standard">
              <Input value={creating.standard || ''}
                onChange={(e) => setCreating({ ...creating, standard: e.target.value })} />
            </Field>
            <Field label="ប្រភេទការផ្លាស់ប្ដូរ / Change Category">
              <Select value={creating.change_category}
                onChange={(e) => setCreating({ ...creating, change_category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </div>
          <p style={{ fontFamily: T?.km, fontSize: 12.5, color: '#64748b', marginTop: 12, lineHeight: 1.7 }}>
            ឯកសារថ្មីចាប់ផ្ដើមជា <strong>P1 — Draft</strong>។ លេខកូដមិនអាចកែបានក្រោយពីបង្កើតទេ។
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
            <Btn ghost onClick={() => setCreating(null)}>បោះបង់</Btn>
            <Btn disabled={saving} onClick={create}>{saving ? 'Saving…' : 'បង្កើត / Create'}</Btn>
          </div>
        </Modal>
      )}

      {history && (
        <Modal
          title={`ប្រវត្តិសវនកម្ម — ${history.row.record_code}`}
          onClose={() => setHistory(null)}
          wide
        >
          <Table head={['កំណែ', 'សកម្មភាព', 'អ្នកប្រើ', 'កាលបរិច្ឆេទ', 'មូលហេតុ', 'ប្រភេទ', 'ស្ថានភាព']}>
            {history.entries.length === 0 && <tr><Td colSpan={7}>គ្មានប្រវត្តិ</Td></tr>}
            {history.entries.map((h) => (
              <tr key={h.id}>
                <Td><Pill tone={h.status === 'current' ? 'good' : 'muted'}>
                  {h.version_label || 'P' + h.version}
                </Pill></Td>
                <Td>{h.action || '—'}</Td>
                <Td>{h.created_by_name || h.created_by || '—'}</Td>
                <Td style={{ whiteSpace: 'nowrap' }}>{when(h.created_at)}</Td>
                <Td>{h.change_note || '—'}</Td>
                <Td>{h.change_category || '—'}</Td>
                <Td>{LABEL[h.approval_status] || h.approval_status || '—'}</Td>
              </tr>
            ))}
          </Table>

          {history.entries.some((h) => h.changes?.length) && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontFamily: T?.km, fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>
                ការផ្លាស់ប្ដូរតាមវាល / Field changes
              </div>
              {history.entries.filter((h) => h.changes?.length).map((h) => (
                <div key={'c' + h.id} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 5 }}>
                    {h.version_label || 'P' + h.version} · {when(h.created_at)} · {h.created_by_name || '—'}
                  </div>
                  <Table head={['វាល', 'ពីមុន', 'ថ្មី']}>
                    {h.changes.map((c) => (
                      <tr key={h.id + c.field}>
                        <Td><code style={{ fontSize: 12 }}>{c.field}</code></Td>
                        <Td><span style={{ color: '#b91c1c' }}>{c.previous || '—'}</span></Td>
                        <Td><span style={{ color: '#15803d' }}>{c.next || '—'}</span></Td>
                      </tr>
                    ))}
                  </Table>
                </div>
              ))}
            </div>
          )}

          <p style={{ fontFamily: T?.km, fontSize: 12.5, color: '#64748b', marginTop: 12, lineHeight: 1.7 }}>
            កំណត់ត្រាសវនកម្មគឺ <strong>អានតែប៉ុណ្ណោះ</strong> — មិនអាចកែ ឬលុបបានទេ។
          </p>
        </Modal>
      )}
    </div>
  );
}
