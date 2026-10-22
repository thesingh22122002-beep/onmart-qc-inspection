'use client';
import { useCallback, useEffect, useState } from 'react';
import { T, Card, SectionTitle, Stat, Btn, Field, Input, Select, Pill, Table, Td, Modal } from './compat.js';

/* ------------------------------------------------------------------ *
 * Admin · Inspections
 *
 * The whole saved-audit table, not just the recent fifteen on the
 * dashboard: search and filters, per-row edit and delete, tick boxes
 * for acting on several at once, and an archive view so a deletion can
 * be undone later. Nothing here erases a row — "delete" archives it.
 * ------------------------------------------------------------------ */

const BTN_SM = { padding: '5px 10px', fontSize: 12 };
const EMPTY_FILTERS = { q: '', store: '', month: '', auditor: '', status: 'active' };

function fmtPct(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) + '%' : '—';
}

export default function Inspections({ allow, toast }) {
  const canEdit = allow('inspections', 'edit');
  const canDelete = allow('inspections', 'delete');

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState({});          // id -> true
  const [editing, setEditing] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind, ids, label }
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ ...filters, page: String(page), pageSize: '25' });
    fetch('/api/admin/inspections?' + p.toString(), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { toast.err(d.error || 'មិនអាចទាញបញ្ជីសវនកម្ម'); return; }
        setData(d);
        // forget ticks for rows that are no longer listed, so a hidden
        // row can never be caught by a bulk action
        const here = new Set(d.rows.map(r => r.id));
        setSel(s => {
          const n = {};
          Object.keys(s).forEach(id => { if (here.has(id)) n[id] = true; });
          return n;
        });
      })
      .catch(() => toast.err('បណ្ដាញមានបញ្ហា'))
      .finally(() => setLoading(false));
  }, [filters, page, toast]);

  useEffect(() => { load(); }, [load]);

  const rows = data ? data.rows : [];
  const selIds = Object.keys(sel).filter(id => sel[id]);
  const allTicked = rows.length > 0 && selIds.length === rows.length;

  function setF(k, v) { setPage(1); setFilters(f => ({ ...f, [k]: v })); }

  function toggleAll(on) {
    if (!on) { setSel({}); return; }
    const n = {};
    rows.forEach(r => { n[r.id] = true; });
    setSel(n);
  }

  async function openEditor(row) {
    setOpeningId(row.id);
    try {
      const r = await fetch('/api/admin/inspections/' + encodeURIComponent(row.id), { cache: 'no-store' });
      const d = await r.json();
      if (!d.ok) { toast.err(d.error || 'មិនអាចទាញកំណត់ត្រា'); return; }
      setEditing(d.record);
    } catch (_) { toast.err('បណ្ដាញមានបញ្ហា'); }
    finally { setOpeningId(null); }
  }

  async function runBulk(kind, ids) {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/inspections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: kind, ids })
      });
      const d = await r.json();
      if (!d.ok) { toast.err(d.error || 'សកម្មភាពមិនបានសម្រេច'); return; }
      const n = (d.changed || []).length;
      toast.push(kind === 'archive'
        ? `បានផ្ទេរទៅប័ណ្ណសារ ${n} កំណត់ត្រា`
        : `បានស្ដារឡើងវិញ ${n} កំណត់ត្រា`, 'ok');
      setConfirm(null);
      setSel({});
      load();
    } catch (_) { toast.err('បណ្ដាញមានបញ្ហា'); }
    finally { setBusy(false); }
  }

  const showingArchived = filters.status === 'archived';

  return (
    <>
      <SectionTitle title="សវនកម្មទាំងអស់"
        sub="ការលុបមិនបំផ្លាញទិន្នន័យទេ — វាផ្ទេរទៅប័ណ្ណសារ ហើយអាចស្ដារវិញបានគ្រប់ពេល" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Stat label="កំណត់ត្រាត្រូវនឹងតម្រង" value={data ? data.total : '—'} />
        <Stat label="ទំព័រ" value={data ? `${data.page} / ${data.pages}` : '—'} />
        <Stat label="បានជ្រើស" value={selIds.length} tone={selIds.length ? 'good' : undefined} />
      </div>

      <Card style={{ marginTop: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <Field label="ស្វែងរក (ហាង ឬ អ្នកត្រួតពិនិត្យ)">
            <Input value={filters.q} placeholder="វាយដើម្បីស្វែងរក…"
              onChange={e => setF('q', e.target.value)} />
          </Field>
          <Field label="ហាង">
            <Select value={filters.store} onChange={e => setF('store', e.target.value)}>
              <option value="">គ្រប់ហាងទាំងអស់</option>
              {(data ? data.stores : []).map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="ខែ">
            <Select value={filters.month} onChange={e => setF('month', e.target.value)}>
              <option value="">គ្រប់ខែទាំងអស់</option>
              {(data ? data.months : []).map(m => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="អ្នកត្រួតពិនិត្យ">
            <Select value={filters.auditor} onChange={e => setF('auditor', e.target.value)}>
              <option value="">គ្រប់អ្នកទាំងអស់</option>
              {(data ? data.auditors : []).map(a => <option key={a} value={a}>{a}</option>)}
            </Select>
          </Field>
          <Field label="ស្ថានភាព">
            <Select value={filters.status} onChange={e => setF('status', e.target.value)}>
              <option value="active">កំពុងប្រើ</option>
              <option value="archived">ប័ណ្ណសារ</option>
              <option value="all">ទាំងអស់</option>
            </Select>
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <Btn onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>សម្អាតតម្រង</Btn>
            <Btn kind="blue" onClick={load} disabled={loading}>{loading ? '…' : 'ផ្ទុកឡើងវិញ'}</Btn>
          </div>
        </div>
      </Card>

      {selIds.length > 0 && (
        <div style={{
          marginTop: 14, padding: '11px 14px', borderRadius: 10,
          background: '#EEF4FF', border: '1px solid #CBD9F5',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'
        }}>
          <b>បានជ្រើស {selIds.length} កំណត់ត្រា</b>
          {canDelete && !showingArchived && (
            <Btn kind="primary" style={BTN_SM} disabled={busy}
              onClick={() => setConfirm({ kind: 'archive', ids: selIds })}>លុបដែលបានជ្រើស</Btn>
          )}
          {canEdit && showingArchived && (
            <Btn kind="blue" style={BTN_SM} disabled={busy}
              onClick={() => setConfirm({ kind: 'restore', ids: selIds })}>ស្ដារដែលបានជ្រើស</Btn>
          )}
          <Btn style={BTN_SM} onClick={() => setSel({})}>សម្អាតការជ្រើស</Btn>
        </div>
      )}

      <Card style={{ marginTop: 14 }}>
        <Table minWidth={1040} head={[
          <input key="all" type="checkbox" checked={allTicked}
            ref={el => { if (el) el.indeterminate = selIds.length > 0 && !allTicked; }}
            onChange={e => toggleAll(e.target.checked)} aria-label="ជ្រើសទាំងអស់" />,
          'ហាង', 'កាលបរិច្ឆេទ', 'វេន', 'អ្នកត្រួតពិនិត្យ',
          { label: 'ពិន្ទុ', right: true }, { label: '%', right: true },
          'កម្រិត', { label: 'កំហុស', right: true }, 'ធ្លាក់', 'សកម្មភាព'
        ]}>
          {!data
            ? <tr><Td colSpan={11}>កំពុងទាញទិន្នន័យ…</Td></tr>
            : rows.length === 0
              ? <tr><Td colSpan={11}>គ្មានកំណត់ត្រាត្រូវនឹងតម្រង</Td></tr>
              : rows.map(r => {
                const ticked = !!sel[r.id];
                return (
                  <tr key={r.id} style={ticked ? { background: '#F3F7FF' } : undefined}>
                    <Td>
                      <input type="checkbox" checked={ticked}
                        onChange={e => setSel(s => {
                          const n = { ...s };
                          if (e.target.checked) n[r.id] = true; else delete n[r.id];
                          return n;
                        })} />
                    </Td>
                    <Td>{r.storeLabel || '—'}</Td>
                    <Td>{r.inspectDate || '—'}</Td>
                    <Td>{r.shift || '—'}</Td>
                    <Td>{r.auditorName || r.auditorEmail || '—'}</Td>
                    <Td right>{r.totalScore} / {r.totalMax}</Td>
                    <Td right>{fmtPct(r.pct)}</Td>
                    <Td>{r.band || '—'}</Td>
                    <Td right>{r.faultCount === null ? '—' : r.faultCount}</Td>
                    <Td>{r.autoFail ? <Pill tone="bad">ធ្លាក់</Pill> : <Pill tone="good">ជាប់</Pill>}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}>
                        {r.deleted ? (
                          <>
                            <Pill tone="off">ប័ណ្ណសារ</Pill>
                            {canEdit && (
                              <Btn kind="blue" style={BTN_SM} disabled={busy}
                                onClick={() => runBulk('restore', [r.id])}>ស្ដារវិញ</Btn>
                            )}
                          </>
                        ) : (
                          <>
                            {canEdit && (
                              <Btn style={BTN_SM} disabled={openingId === r.id}
                                onClick={() => openEditor(r)}>{openingId === r.id ? '…' : '✎ កែ'}</Btn>
                            )}
                            {canDelete && (
                              <Btn kind="primary" style={BTN_SM}
                                onClick={() => setConfirm({ kind: 'archive', ids: [r.id], label: r.storeLabel })}>
                                🗑 លុប
                              </Btn>
                            )}
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
        </Table>

        {data && data.pages > 1 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <Btn style={BTN_SM} disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← មុន</Btn>
            <span style={{ fontSize: 13, color: T.muted }}>ទំព័រ {data.page} ក្នុងចំណោម {data.pages}</span>
            <Btn style={BTN_SM} disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>បន្ទាប់ →</Btn>
          </div>
        )}
      </Card>

      {editing && (
        <InspectionEditor
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
          toast={toast}
        />
      )}

      {confirm && (
        <Modal
          title="សូមបញ្ជាក់"
          width={460}
          onClose={() => setConfirm(null)}
          footer={<>
            <Btn onClick={() => setConfirm(null)} disabled={busy}>បោះបង់</Btn>
            <Btn kind={confirm.kind === 'archive' ? 'primary' : 'blue'} disabled={busy}
              onClick={() => runBulk(confirm.kind, confirm.ids)}>
              {busy ? 'កំពុងដំណើរការ…' : 'បាទ/ចាស បន្ត'}
            </Btn>
          </>}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.9 }}>
            {confirm.kind === 'archive'
              ? (confirm.ids.length === 1
                ? `លុបសវនកម្មរបស់ ${confirm.label || '—'} មែនទេ?`
                : `លុបសវនកម្មចំនួន ${confirm.ids.length} ដែលបានជ្រើសមែនទេ?`)
              : `ស្ដារកំណត់ត្រាចំនួន ${confirm.ids.length} ឡើងវិញមែនទេ?`}
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: T.muted, lineHeight: 1.8 }}>
            {confirm.kind === 'archive'
              ? 'កំណត់ត្រាផ្ទេរទៅប័ណ្ណសារ មិនត្រូវលុបចោលពីមូលដ្ឋានទិន្នន័យទេ។ អ្នកអាចមើល និងស្ដារវិញបានពីតម្រង "ប័ណ្ណសារ"។'
              : 'កំណត់ត្រានឹងត្រឡប់មកបញ្ជីកំពុងប្រើវិញ។'}
            {' '}សកម្មភាពនេះត្រូវកត់ក្នុងកំណត់ហេតុសកម្មភាព។
          </p>
        </Modal>
      )}
    </>
  );
}

/* ---------------------- edit one inspection ----------------------- *
 * Scores stay read-only: they are calculated from the checklist, and
 * typing over them here would put this record out of step with the
 * audit that produced it.
 * ------------------------------------------------------------------ */
function InspectionEditor({ record, onClose, onSaved, toast }) {
  const [form, setForm] = useState({
    storeLabel: record.storeLabel || '',
    inspectDate: record.inspectDate || '',
    shift: record.shift || '',
    auditorName: record.auditorName || '',
    areaManager: record.areaManager || '',
    contact: record.contact || ''
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const dirty = Object.keys(form).some(k => String(form[k] || '') !== String(record[k] || ''));

  function close() {
    if (dirty && !window.confirm('មានការផ្លាស់ប្ដូរមិនទាន់រក្សាទុក — ចាកចេញមែនទេ?')) return;
    onClose();
  }

  async function save() {
    setErr('');
    setSaving(true);
    try {
      const r = await fetch('/api/admin/inspections/' + encodeURIComponent(record.id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, version: record.version })
      });
      const d = await r.json();
      if (!d.ok) { setErr(d.error || 'រក្សាទុកមិនបានសម្រេច'); return; }
      toast.push('បានរក្សាទុក', 'ok');
      onSaved(d.record);
    } catch (_) {
      setErr('បណ្ដាញមានបញ្ហា — សូមព្យាយាមម្ដងទៀត');
    } finally { setSaving(false); }
  }

  const ro = { background: '#F8FAFC', color: '#64748B' };

  return (
    <Modal title="កែសវនកម្ម" onClose={close} width={640}
      footer={<>
        <Btn onClick={close} disabled={saving}>បោះបង់</Btn>
        <Btn kind="blue" onClick={save} disabled={saving || !dirty}>
          {saving ? 'កំពុងរក្សាទុក…' : 'រក្សាទុក'}
        </Btn>
      </>}>
      {err && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B',
          borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.8, marginBottom: 14
        }}>{err}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="ហាង" wide>
          <Input value={form.storeLabel} onChange={e => set('storeLabel', e.target.value)} />
        </Field>
        <Field label="កាលបរិច្ឆេទ">
          <Input type="date" value={form.inspectDate} onChange={e => set('inspectDate', e.target.value)} />
        </Field>
        <Field label="វេន">
          <Input value={form.shift} onChange={e => set('shift', e.target.value)} placeholder="ព្រឹក / រសៀល / យប់" />
        </Field>
        <Field label="អ្នកត្រួតពិនិត្យ">
          <Input value={form.auditorName} onChange={e => set('auditorName', e.target.value)} />
        </Field>
        <Field label="អ្នកគ្រប់គ្រងតំបន់">
          <Input value={form.areaManager} onChange={e => set('areaManager', e.target.value)} />
        </Field>
        <Field label="ទំនាក់ទំនង" wide>
          <Input value={form.contact} onChange={e => set('contact', e.target.value)} />
        </Field>
        <Field label="ពិន្ទុ (អានតែប៉ុណ្ណោះ)">
          <Input value={`${record.totalScore} / ${record.totalMax}`} readOnly style={ro} />
        </Field>
        <Field label="កម្រិត (អានតែប៉ុណ្ណោះ)">
          <Input value={`${record.pct}% · ${record.band || '—'}${record.autoFail ? ' · ធ្លាក់ស្វ័យប្រវត្តិ' : ''}`}
            readOnly style={ro} />
        </Field>
      </div>

      <p style={{ margin: '14px 0 0', fontSize: 12.5, color: T.muted, lineHeight: 1.9 }}>
        ពិន្ទុមកពីបញ្ជីត្រួតពិនិត្យ ដូច្នេះវាកែនៅទីនេះមិនបានទេ — បើពិន្ទុខុស សូមកែក្នុងកម្មវិធី QC។
        អ៊ីម៉ែលអ្នកត្រួតពិនិត្យ <b>{record.auditorEmail || '—'}</b> និងកំណែ <b>{record.version}</b> ត្រូវរក្សាទុកដដែល។
        រាល់ការកែត្រូវកត់ក្នុងកំណត់ហេតុសកម្មភាព។
      </p>
    </Modal>
  );
}
