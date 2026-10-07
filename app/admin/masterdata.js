'use client';
import { useCallback, useEffect, useState } from 'react';
import { T, Card, SectionTitle, Btn, Field, Input, Select, Pill, Table, Td, Modal } from './ui.js';
import RefreshBar from './refreshbar.js';

const TABS = [
  { k: 'store', label: 'ហាង / Stores' },
  { k: 'auditor', label: 'អ្នកប្រើប្រាស់ / Users' },
  { k: 'content', label: 'ខ្លឹមសារ / Content' },
  { k: 'setting', label: 'ការកំណត់ / Settings' },
];

const COLS = {
  store: [['code', 'លេខកូដ'], ['name', 'ឈ្មោះហាង'], ['active', 'ស្ថានភាព'], ['version', 'កំណែ']],
  auditor: [['name', 'ឈ្មោះ'], ['email', 'អ៊ីមែល'], ['role', 'តួនាទី'], ['active', 'ស្ថានភាព'], ['version', 'កំណែ']],
  content: [['title', 'ចំណងជើង'], ['kind', 'ប្រភេទ'], ['published', 'ផ្សាយ'], ['version', 'កំណែ']],
  setting: [['key', 'សោ'], ['value', 'តម្លៃ'], ['version', 'កំណែ']],
};

const ROLES = ['super_admin', 'admin', 'qc_officer', 'operation'];

function cell(row, key) {
  const v = row[key];
  if (key === 'active' || key === 'published') {
    return <Pill tone={v ? 'good' : 'muted'}>{v ? 'សកម្ម' : 'អសកម្ម'}</Pill>;
  }
  if (key === 'version') return <Pill tone="muted">v{v}</Pill>;
  if (v === null || v === undefined || v === '') return '—';
  return String(v).length > 70 ? String(v).slice(0, 70) + '…' : String(v);
}

export default function MasterData({ allow, toast }) {
  const [tab, setTab] = useState('store');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState(null);      // { row, operation }
  const [history, setHistory] = useState(null); // { entity, id, versions }
  const [saving, setSaving] = useState(false);

  const canEdit = allow('masterdata', 'edit');
  const canCreate = allow('masterdata', 'create');
  const canApprove = allow('masterdata', 'approve');

  const load = useCallback(async (entity) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/masterdata?entity=${entity}`, { cache: 'no-store' });
      const j = await r.json();
      setRows(r.ok ? (j.rows || []) : []);
      if (!r.ok) toast?.(j.error || 'Load failed', 'danger');
    } catch (e) {
      toast?.('Load failed: ' + e.message, 'danger');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(tab); }, [tab, load]);

  async function save() {
    if (!edit) return;
    setSaving(true);
    try {
      const r = await fetch('/api/admin/masterdata', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entity: tab,
          operation: edit.operation,
          id: edit.row?.id,
          payload: edit.row,
          note: edit.note || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) { toast?.(j.error || 'Save failed', 'danger'); return; }
      if (j.queued) {
        toast?.('បានដាក់ស្នើសុំការអនុម័ត / Submitted for approval', 'warn');
      } else {
        toast?.(`រក្សាទុកជាកំណែ v${j.version} / Saved as version ${j.version}`, 'good');
      }
      setEdit(null);
      load(tab);
    } catch (e) {
      toast?.('Save failed: ' + e.message, 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(row) {
    try {
      const r = await fetch(`/api/admin/versions?entity=${tab}&id=${encodeURIComponent(row.id)}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { toast?.(j.error || 'History unavailable', 'danger'); return; }
      setHistory({ entity: tab, id: row.id, label: row.name || row.title || row.key || row.id, versions: j.versions || [] });
    } catch (e) {
      toast?.('History failed: ' + e.message, 'danger');
    }
  }

  async function restore(version) {
    if (!history) return;
    try {
      const r = await fetch('/api/admin/versions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity: history.entity, id: history.id, version }),
      });
      const j = await r.json();
      if (!r.ok) { toast?.(j.error || 'Restore failed', 'danger'); return; }
      toast?.(`ស្ដារពីកំណែ v${version} ទៅជា v${j.newVersion}`, 'good');
      setHistory(null);
      load(tab);
    } catch (e) {
      toast?.('Restore failed: ' + e.message, 'danger');
    }
  }

  function blank() {
    if (tab === 'store') return { code: '', name: '', active: true };
    if (tab === 'setting') return { key: '', value: '' };
    return {};
  }

  const cols = COLS[tab];

  return (
    <div>
      <SectionTitle
        title="ទិន្នន័យមេ / Master Data"
        sub="រាល់ការរក្សាទុកបង្កើតកំណែថ្មី ទិន្នន័យចាស់មិនត្រូវបានលុបឡើយ"
      />

      <RefreshBar onSynced={() => load(tab)} />

      <Card>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {TABS.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              style={{
                fontFamily: T?.km, fontSize: 13, padding: '7px 14px',
                borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${tab === t.k ? '#1d4ed8' : '#cbd5e1'}`,
                background: tab === t.k ? '#1d4ed8' : '#fff',
                color: tab === t.k ? '#fff' : '#334155',
              }}
            >{t.label}</button>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            {canCreate && (tab === 'store' || tab === 'setting') && (
              <Btn onClick={() => setEdit({ row: blank(), operation: 'create' })}>
                + បន្ថែមថ្មី / New
              </Btn>
            )}
          </div>
        </div>

        {!canApprove && canEdit && (
          <div style={{
            fontSize: 13, padding: '8px 12px', borderRadius: 8, marginBottom: 12,
            background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
            fontFamily: T?.km,
          }}>
            ការកែប្រែរបស់អ្នកនឹងត្រូវដាក់ស្នើសុំការអនុម័តពី Super Admin មុននឹងអនុវត្ត។
          </div>
        )}

        <Table head={[...cols.map((c) => c[1]), 'សកម្មភាព']}>
          {loading && (
            <tr><Td colSpan={cols.length + 1}>កំពុងផ្ទុក…</Td></tr>
          )}
          {!loading && rows.length === 0 && (
            <tr><Td colSpan={cols.length + 1}>គ្មានទិន្នន័យ</Td></tr>
          )}
          {!loading && rows.map((row) => (
            <tr key={row.id}>
              {cols.map((c) => <Td key={c[0]}>{cell(row, c[0])}</Td>)}
              <Td>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {canEdit && (
                    <Btn small onClick={() => setEdit({ row: { ...row }, operation: 'update' })}>
                      កែ
                    </Btn>
                  )}
                  <Btn small ghost onClick={() => openHistory(row)}>ប្រវត្តិ</Btn>
                  {allow('masterdata', 'delete') && row.active !== false && (
                    <Btn small danger onClick={() => setEdit({ row: { ...row }, operation: 'deactivate' })}>
                      បិទ
                    </Btn>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      {edit && (
        <Modal
          title={
            edit.operation === 'create' ? 'បន្ថែមកំណត់ត្រាថ្មី'
              : edit.operation === 'deactivate' ? 'បិទកំណត់ត្រានេះ'
                : 'កែប្រែកំណត់ត្រា'
          }
          onClose={() => setEdit(null)}
        >
          {edit.operation === 'deactivate' ? (
            <p style={{ fontFamily: T?.km, fontSize: 14, lineHeight: 1.7 }}>
              កំណត់ត្រានេះនឹងត្រូវបានកំណត់ជា <strong>អសកម្ម</strong> ប៉ុណ្ណោះ។
              ទិន្នន័យ និងប្រវត្តិកំណែទាំងអស់នៅតែរក្សាទុកដដែល។
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {tab === 'store' && (
                <>
                  <Field label="លេខកូដហាង / Store code">
                    <Input value={edit.row.code || ''}
                      onChange={(e) => setEdit({ ...edit, row: { ...edit.row, code: e.target.value } })} />
                  </Field>
                  <Field label="ឈ្មោះហាង / Store name">
                    <Input value={edit.row.name || ''}
                      onChange={(e) => setEdit({ ...edit, row: { ...edit.row, name: e.target.value } })} />
                  </Field>
                </>
              )}

              {tab === 'auditor' && (
                <>
                  <Field label="ឈ្មោះ / Name">
                    <Input value={edit.row.name || ''}
                      onChange={(e) => setEdit({ ...edit, row: { ...edit.row, name: e.target.value } })} />
                  </Field>
                  <Field label="តួនាទី / Role">
                    <Select value={edit.row.role || 'qc_officer'}
                      onChange={(e) => setEdit({ ...edit, row: { ...edit.row, role: e.target.value } })}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </Select>
                  </Field>
                  <Field label="សាខា / Branch">
                    <Input value={edit.row.branch || ''}
                      onChange={(e) => setEdit({ ...edit, row: { ...edit.row, branch: e.target.value } })} />
                  </Field>
                  <Field label="ទូរស័ព្ទ / Phone">
                    <Input value={edit.row.phone || ''}
                      onChange={(e) => setEdit({ ...edit, row: { ...edit.row, phone: e.target.value } })} />
                  </Field>
                </>
              )}

              {tab === 'content' && (
                <Field label="ចំណងជើង / Title">
                  <Input value={edit.row.title || ''}
                    onChange={(e) => setEdit({ ...edit, row: { ...edit.row, title: e.target.value } })} />
                </Field>
              )}

              {tab === 'setting' && (
                <>
                  <Field label="សោ / Key">
                    <Input value={edit.row.key || ''}
                      disabled={edit.operation !== 'create'}
                      onChange={(e) => setEdit({ ...edit, row: { ...edit.row, key: e.target.value, id: e.target.value } })} />
                  </Field>
                  <Field label="តម្លៃ / Value">
                    <Input value={edit.row.value || ''}
                      onChange={(e) => setEdit({ ...edit, row: { ...edit.row, value: e.target.value } })} />
                  </Field>
                </>
              )}

              {tab !== 'setting' && (
                <Field label="ស្ថានភាព / Status">
                  <Select value={edit.row.active === false ? 'no' : 'yes'}
                    onChange={(e) => setEdit({ ...edit, row: { ...edit.row, active: e.target.value === 'yes' } })}>
                    <option value="yes">សកម្ម / Active</option>
                    <option value="no">អសកម្ម / Inactive</option>
                  </Select>
                </Field>
              )}

              <Field label="មូលហេតុនៃការកែប្រែ / Change note">
                <Input value={edit.note || ''} placeholder="ឧ. កែឈ្មោះតាមសំណើរប្រតិបត្តិការ"
                  onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
              </Field>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
            <Btn ghost onClick={() => setEdit(null)}>បោះបង់</Btn>
            <Btn onClick={save} disabled={saving}>
              {saving ? 'កំពុងរក្សាទុក…' : canApprove ? 'រក្សាទុក / Save' : 'ដាក់ស្នើ / Submit'}
            </Btn>
          </div>
        </Modal>
      )}

      {history && (
        <Modal title={`ប្រវត្តិកំណែ — ${history.label}`} onClose={() => setHistory(null)} wide>
          <Table head={['កំណែ', 'ស្ថានភាព', 'ដោយ', 'កាលបរិច្ឆេទ', 'មូលហេតុ', '']}>
            {history.versions.length === 0 && (
              <tr><Td colSpan={6}>គ្មានប្រវត្តិ</Td></tr>
            )}
            {history.versions.map((v) => (
              <tr key={v.id}>
                <Td><Pill tone={v.status === 'current' ? 'good' : 'muted'}>v{v.version}</Pill></Td>
                <Td>{v.status === 'current' ? 'បច្ចុប្បន្ន' : 'ចាស់'}</Td>
                <Td>{v.created_by_name || v.created_by || '—'}</Td>
                <Td>{v.created_at ? new Date(v.created_at).toLocaleString() : '—'}</Td>
                <Td>{v.change_note || '—'}</Td>
                <Td>
                  {canApprove && v.status !== 'current' && (
                    <Btn small ghost onClick={() => restore(v.version)}>ស្ដារ</Btn>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
          <p style={{ fontFamily: T?.km, fontSize: 12.5, color: '#64748b', marginTop: 12, lineHeight: 1.7 }}>
            ការស្ដារមិនលុបកំណែណាមួយទេ — វាចម្លងទិន្នន័យកំណែចាស់ទៅជាកំណែថ្មីបន្ថែមទៀត។
          </p>
        </Modal>
      )}
    </div>
  );
}
