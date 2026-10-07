'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { T, Btn, Pill } from './ui.js';

const INTERVALS = [
  { v: 0, label: 'បិទ / Off' },
  { v: 5, label: '5 នាទី / 5 min' },
  { v: 10, label: '10 នាទី / 10 min' },
  { v: 15, label: '15 នាទី / 15 min' },
];

function stamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${months[d.getMonth()]}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Refresh / sync banner.
 *
 * onSynced(payload) is called after a successful sync so the parent can
 * repaint dashboards and dropdowns from the returned data.
 *
 * Auto-refresh polls /api/sync-state (one small row) and only performs a
 * full refresh when the revision has actually moved, so an idle dashboard
 * costs almost nothing.
 */
export default function RefreshBar({ onSynced, pollSeconds = 60 }) {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(null);
  const [failure, setFailure] = useState(null);
  const [mins, setMins] = useState(10);
  const revRef = useRef(0);
  const lastAutoRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/refresh', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (j.state) {
        setState({
          lastUpdated: j.state.last_synced_at,
          updatedBy: j.state.last_synced_by_name || j.state.last_synced_by,
          status: j.state.status,
          pending: j.pending,
        });
        revRef.current = Number(j.state.revision) || 0;
      }
    } catch (_) { /* banner only; silence is correct here */ }
  }, []);

  const sync = useCallback(async (auto = false) => {
    setBusy(true);
    setFailure(null);
    try {
      const r = await fetch('/api/admin/refresh', { method: 'POST' });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setFailure(j.message || 'Sync Failed — Your existing data has not been deleted. Please try again.');
        setState((s) => (s ? { ...s, status: 'failed' } : s));
        return;
      }
      revRef.current = Number(j.revision) || revRef.current;
      setState({
        lastUpdated: j.lastUpdated,
        updatedBy: j.updatedBy,
        status: 'ok',
        pending: j.stats?.pending ?? 0,
      });
      if (onSynced) onSynced(j, auto);
    } catch (e) {
      setFailure('Sync Failed — Your existing data has not been deleted. Please try again.');
    } finally {
      setBusy(false);
      lastAutoRef.current = Date.now();
    }
  }, [onSynced]);

  useEffect(() => { load(); }, [load]);

  // Cheap poll: full refresh only when someone else moved the revision,
  // or when the chosen interval has elapsed.
  useEffect(() => {
    if (!mins) return undefined;
    const id = setInterval(async () => {
      if (document.hidden || busy) return;
      try {
        const r = await fetch('/api/sync-state', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        const moved = Number(j.revision) !== revRef.current;
        const due = Date.now() - lastAutoRef.current > mins * 60000;
        if (moved || due) sync(true);
      } catch (_) { /* a failed poll is not a data change */ }
    }, Math.max(15, pollSeconds) * 1000);
    return () => clearInterval(id);
  }, [mins, busy, sync, pollSeconds]);

  const failed = failure || state?.status === 'failed';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '10px 14px', borderRadius: 12, marginBottom: 16,
      background: failed ? '#fef2f2' : '#f8fafc',
      border: `1px solid ${failed ? '#fecaca' : '#e2e8f0'}`,
      fontFamily: T?.km,
    }}>
      <Btn onClick={() => sync(false)} disabled={busy}>
        {busy ? 'កំពុងធ្វើសមកាលកម្ម…' : '⟳ ធ្វើបច្ចុប្បន្នភាព / Refresh'}
      </Btn>

      <div style={{ fontSize: 13, lineHeight: 1.5 }}>
        <div><strong>Last Updated:</strong> {stamp(state?.lastUpdated)}</div>
        <div><strong>Updated By:</strong> {state?.updatedBy || '—'}</div>
      </div>

      <Pill tone={failed ? 'danger' : 'good'}>
        {failed ? 'Sync Failed' : 'Successfully Synchronized'}
      </Pill>

      {state?.pending > 0 && (
        <Pill tone="warn">{state.pending} រង់ចាំអនុម័ត / pending</Pill>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>Auto</span>
        <select
          value={mins}
          onChange={(e) => setMins(Number(e.target.value))}
          style={{
            fontFamily: T?.km, fontSize: 13, padding: '4px 8px',
            borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff',
          }}
        >
          {INTERVALS.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
        </select>
      </div>

      {failed && (
        <div style={{ flexBasis: '100%', fontSize: 13, color: '#b91c1c' }}>
          ធ្វើសមកាលកម្មមិនបានសម្រេច — ទិន្នន័យដែលមានស្រាប់របស់អ្នកមិនត្រូវបានលុបទេ។ សូមព្យាយាមម្តងទៀត។
          <br />{failure}
        </div>
      )}
    </div>
  );
}
