'use client';
import { useCallback, useEffect, useState } from 'react';
import { T, Card, SectionTitle, Btn, Pill, Table, Td, Modal, Field, Input } from './ui.js';

const STATUSES = [
  { k: 'pending', label: 'រង់ចាំ / Pending' },
  { k: 'applied', label: 'អនុម័ត / Approved' },
  { k: 'rejected', label: 'បដិសេធ / Rejected' },
  { k: 'all', label: 'ទាំងអស់ / All' },
];

const OP_LABEL = {
  create: 'បង្កើត / Create',
  update: 'កែប្រែ / Update',
  deactivate: 'បិទ / Deactivate',
  delete: 'លុបទន់ / Soft delete',
};

const TONE = { pending: 'warn', applied: 'good', rejected: 'danger', approved: 'good' };

function Diff({ before, after }) {
  const keys = Array.from(new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ])).filter((k) => !['id', 'version', 'updated_at', 'updated_by', 'created_at'].includes(k));

  const changed = keys.filter((k) => String(before?.[k] ?? '') !== String(after?.[k] ?? ''));
  if (changed.length === 0) {
    return <p style={{ fontFamily: T?.km, fontSize: 13, color: '#64748b' }}>គ្មានការផ្លាស់ប្ដូរដែលអាចបង្ហាញបាន។</p>;
  }

  return (
    <Table head={['វាល / Field', 'ពីមុន / Before', 'ក្រោយ / After']}>
      {changed.map((k) => (
        <tr key={k}>
          <Td><code style={{ fontSize: 12 }}>{k}</code></Td>
          <Td><span style={{ color: '#b91c1c' }}>{String(before?.[k] ?? '—')}</span></Td>
          <Td><span style={{ color: '#15803d' }}>{String(after?.[k] ?? '—')}</span></Td>
        </tr>
      ))}
    </Table>
  );
}

export default function Approvals({ allow, toast }) {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const canApprove = allow('approvals', 'approve');

  const load = useCallback(async (s) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/approvals?status=${s}`, { cache: 'no-store' });
      const j = await r.json();
      setRows(r.ok ? (j.requests || []) : []);
      if (!r.ok) toast?.(j.error || 'Load failed', 'danger');
    } catch (e) {
      toast?.('Load failed: ' + e.message, 'danger');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(status); }, [status, load]);

  async function decide(decision) {
    if (!open) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/approvals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: open.id, decision, note: note || null }),
      });
      const j = await r.json();
      if (!r.ok) { toast?.(j.error || 'Failed', 'danger'); return; }
      toast?.(
        decision === 'approve'
          ? `អនុម័ត និងអនុវត្តជាកំណែ v${j.version}`
          : 'បានបដិសេធសំណើ',
        decision === 'approve' ? 'good' : 'warn'
      );
      setOpen(null);
      setNote('');
      load(status);
    } catch (e) {
      toast?.('Failed: ' + e.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SectionTitle
        title="ការអនុម័តការផ្លាស់ប្ដូរ / Change Approvals"
        sub="សំណើកែប្រែទិន្នន័យមេ រង់ចាំការពិនិត្យពី Super Admin"
      />

      <Card>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {STATUSES.map((s) => (
            <button
              key={s.k}
              onClick={() => setStatus(s.k)}
              style={{
                fontFamily: T?.km, fontSize: 13, padding: '7px 14px',
                borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${status === s.k ? '#1d4ed8' : '#cbd5e1'}`,
                background: status === s.k ? '#1d4ed8' : '#fff',
                color: status === s.k ? '#fff' : '#334155',
              }}
            >{s.label}</button>
          ))}
        </div>

        <Table head={['ប្រភេទ', 'សកម្មភាព', 'ដាក់ស្នើដោយ', 'កាលបរិច្ឆេទ', 'ស្ថានភាព', '']}>
          {loading && <tr><Td colSpan={6}>កំពុងផ្ទុក…</Td></tr>}
          {!loading && rows.length === 0 && (
            <tr><Td colSpan={6}>គ្មានសំណើ</Td></tr>
          )}
          {!loading && rows.map((r) => (
            <tr key={r.id}>
              <Td>{r.entity}{r.entity_id ? ` #${r.entity_id}` : ''}</Td>
              <Td>{OP_LABEL[r.operation] || r.operation}</Td>
              <Td>{r.requested_by_name || r.requested_by || '—'}</Td>
              <Td>{r.requested_at ? new Date(r.requested_at).toLocaleString() : '—'}</Td>
              <Td><Pill tone={TONE[r.status] || 'muted'}>{r.status}</Pill></Td>
              <Td>
                <Btn small ghost onClick={() => { setOpen(r); setNote(''); }}>
                  {r.status === 'pending' && canApprove ? 'ពិនិត្យ' : 'មើល'}
                </Btn>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      {open && (
        <Modal title={`សំណើ #${open.id} — ${open.entity}`} onClose={() => setOpen(null)} wide>
          <div style={{ fontFamily: T?.km, fontSize: 13.5, marginBottom: 14, lineHeight: 1.8 }}>
            <div><strong>សកម្មភាព:</strong> {OP_LABEL[open.operation] || open.operation}</div>
            <div><strong>ដាក់ស្នើដោយ:</strong> {open.requested_by_name || open.requested_by || '—'}</div>
            <div><strong>ស្ថានភាព:</strong> {open.status}</div>
            {open.decided_at && (
              <div><strong>សម្រេចដោយ:</strong> {open.decided_by_name || open.decided_by} — {new Date(open.decided_at).toLocaleString()}</div>
            )}
            {open.decision_note && <div><strong>កំណត់ចំណាំ:</strong> {open.decision_note}</div>}
          </div>

          <Diff before={open.before_value} after={open.payload} />

          {open.status === 'pending' && canApprove && (
            <>
              <div style={{ marginTop: 16 }}>
                <Field label="កំណត់ចំណាំសម្រេចចិត្ត / Decision note">
                  <Input value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="ស្រេចចិត្ត / optional" />
                </Field>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
                <Btn danger ghost disabled={busy} onClick={() => decide('reject')}>បដិសេធ / Reject</Btn>
                <Btn disabled={busy} onClick={() => decide('approve')}>
                  {busy ? 'កំពុងដំណើរការ…' : 'អនុម័ត / Approve'}
                </Btn>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
