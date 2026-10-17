'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  T, Card, SectionTitle, Stat, Btn, Field, Input, Select, Textarea,
  Pill, Table, Td, Modal, Confirm, Toasts, useToasts, Bars,
  fmtWhen, deviceOf, randomPassword
} from './ui';
import { exportExcel, exportPdf, exportWord } from './exporters';
import Records from './records';
import MasterData from './masterdata';
import Approvals from './approvals';

const NAV = [
  { key: 'dashboard', label: 'ផ្ទាំងគ្រប់គ្រង', icon: '▣' },
  { key: 'users', label: 'អ្នកប្រើប្រាស់', icon: '◉' },
  { key: 'roles', label: 'តួនាទី និងសិទ្ធិ', icon: '⚿' },
  { key: 'content', label: 'មាតិកា', icon: '✎' },
  { key: 'reports', label: 'របាយការណ៍', icon: '▤' },
  { key: 'audit', label: 'កំណត់ហេតុសកម្មភាព', icon: '⌁' },
  { key: 'settings', label: 'ការកំណត់', icon: '⚙' },
  { key: 'records', label: 'ឯកសារគ្រប់គ្រង', icon: '▦' },
  { key: 'masterdata', label: 'ទិន្នន័យមេ', icon: '▥' },
  { key: 'approvals', label: 'ការអនុម័ត', icon: '✓' }
];

const ROLE_LABEL = { super_admin: 'អ្នកគ្រប់គ្រងកំពូល', admin: 'អ្នកគ្រប់គ្រង', qc_officer: 'មន្ត្រី QC' };
const MODULE_LABEL = {
  dashboard: 'ផ្ទាំងគ្រប់គ្រង', users: 'អ្នកប្រើប្រាស់', roles: 'តួនាទី និងសិទ្ធិ',
  content: 'មាតិកា', reports: 'របាយការណ៍', audit: 'កំណត់ហេតុ', settings: 'ការកំណត់', inspections: 'សវនកម្ម'
};
const ACTION_LABEL = { view: 'មើល', create: 'បង្កើត', edit: 'កែ', delete: 'លុប', approve: 'អនុម័ត', export: 'នាំចេញ' };
const KIND_LABEL = { announcement: 'សេចក្ដីជូនដំណឹង', training: 'វីដេអូបណ្ដុះបណ្ដាល', document: 'ឯកសារ' };

function today() { return new Date().toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }

export default function AdminPage() {
  const [tab, setTab] = useState('dashboard');
  const [data, setData] = useState(null);
  const [fatal, setFatal] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const toast = useToasts();

  const load = useCallback(() => {
    fetch('/api/admin/overview', { cache: 'no-store' })
      .then(r => {
        if (r.status === 401) { window.location.href = '/'; return null; }
        if (r.status === 403) { setFatal('ទំព័រនេះសម្រាប់តែអ្នកគ្រប់គ្រងប៉ុណ្ណោះ'); return null; }
        return r.json();
      })
      .then(d => { if (d && d.ok) setData(d); })
      .catch(() => setFatal('មិនអាចទាញទិន្នន័យបាន'));
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 90000); return () => clearInterval(t); }, [load]);

  const perms = data?.permissions || {};
  const allow = (mod, act) => data?.me?.role === 'super_admin' || !!(perms[mod] && perms[mod][act]);

  const visibleNav = useMemo(
    () => NAV.filter(n => n.key === 'dashboard' || allow(n.key, 'view')),
    [data] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (data && !visibleNav.find(n => n.key === tab)) setTab(visibleNav[0]?.key || 'dashboard');
  }, [data, visibleNav, tab]);

  if (fatal) {
    return (
      <div style={S.center}>
        <Card style={{ maxWidth: 420, textAlign: 'center' }}>
          <p style={{ color: T.red, fontSize: 14, lineHeight: 1.9, margin: 0 }}>{fatal}</p>
          <div style={{ marginTop: 14 }}><Btn kind="blue" onClick={() => (window.location.href = '/app')}>ត្រឡប់ទៅកម្មវិធី</Btn></div>
        </Card>
      </div>
    );
  }
  if (!data) return <div style={S.center}><Card>កំពុងទាញទិន្នន័យ…</Card></div>;

  const company = data.settings.company_name || 'ON MART';

  return (
    <div style={S.shell}>
      {/* ---- top navigation ---- */}
      <header style={S.top}>
        <button style={S.burger} onClick={() => setNavOpen(o => !o)} aria-label="menu">☰</button>
        <img src="/logo.png" alt="ON MART" style={S.logo} />
        <div style={{ minWidth: 0 }}>
          <div style={S.topTitle}>{company} — ផ្ទាំងគ្រប់គ្រងប្រព័ន្ធ</div>
          <div className="sm-hide" style={S.topSub}>{data.settings.company_tagline || 'ប្រព័ន្ធត្រួតពិនិត្យគុណភាពហាង'}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="sm-hide" style={S.who}>
            {data.me.name} · <b>{ROLE_LABEL[data.me.role] || data.me.role}</b>
          </span>
          <a href="/app" className="sm-hide" style={S.topLink}>កម្មវិធី QC</a>
          <Btn kind="ghost" style={{ color: '#CBD5E1' }} onClick={() => {
            fetch('/api/logout', { method: 'POST' }).finally(() => (window.location.href = '/'));
          }}>ចាកចេញ</Btn>
        </div>
      </header>

      <div style={S.body}>
        {/* ---- sidebar ---- */}
        <nav style={{ ...S.side, display: navOpen ? 'flex' : undefined }} data-open={navOpen ? '1' : '0'}>
          {visibleNav.map(n => (
            <button key={n.key}
              onClick={() => { setTab(n.key); setNavOpen(false); }}
              style={{ ...S.navItem, ...(tab === n.key ? S.navItemOn : null) }}>
              <span style={{ opacity: .7, width: 16, display: 'inline-block' }}>{n.icon}</span> {n.label}
            </button>
          ))}
          <div style={S.sideFoot}>
            កំណែប្រព័ន្ធ · {data.month}
          </div>
        </nav>

        <main style={S.main}>
          {tab === 'dashboard' && <Dashboard data={data} allow={allow} go={setTab} />}
          {tab === 'users' && <Users data={data} allow={allow} reload={load} toast={toast} />}
          {tab === 'roles' && <Roles data={data} allow={allow} toast={toast} />}
          {tab === 'content' && <Content allow={allow} toast={toast} />}
          {tab === 'reports' && <Reports allow={allow} toast={toast} company={company} />}
          {tab === 'audit' && <Audit allow={allow} toast={toast} />}
          {tab === 'settings' && <Settings data={data} allow={allow} reload={load} toast={toast} />}
          {tab === 'records' && <Records allow={allow} toast={toast} />}
          {tab === 'masterdata' && <MasterData allow={allow} toast={toast} />}
          {tab === 'approvals' && <Approvals allow={allow} toast={toast} />}
        </main>
      </div>

      <Toasts items={toast.items} onDone={toast.done} />
      <style>{`
        @media (max-width: 900px){
          nav[data-open="0"]{display:none !important}
          nav[data-open="1"]{position:fixed !important;inset:56px 0 0 0;z-index:900;width:auto !important;overflow-y:auto}
        }
        @media (min-width: 901px){ button[aria-label="menu"]{display:none !important} }
        @media (max-width: 620px){
          .sm-hide{display:none !important}
          header{gap:8px !important;padding:8px 10px !important}
        }
        *{box-sizing:border-box}
        body{margin:0}
      `}</style>
    </div>
  );
}

/* ============================ DASHBOARD ============================ */
function Dashboard({ data, allow, go }) {
  const s = data.stats;
  return (
    <>
      <SectionTitle title="ទិដ្ឋភាពរួម" sub={`ទិន្នន័យបច្ចុប្បន្ន · ខែ ${data.month}`} />

      <div style={S.grid5}>
        <Stat label="អ្នកប្រើសរុប" value={s.totalUsers} />
        <Stat label="កំពុងសកម្ម" value={s.activeUsers} tone="good" hint={`ចូលក្នុង ៧ ថ្ងៃ៖ ${s.recentlyActive}`} />
        <Stat label="អ្នកប្រើថ្មី (៣០ ថ្ងៃ)" value={s.newUsers} />
        <Stat label="ហាង / សាខា" value={s.totalStores} />
        <Stat label="សវនកម្មសរុប" value={s.totalInspections} hint={`ខែនេះ៖ ${s.thisMonth}`} />
      </div>

      <div style={{ ...S.grid3, marginTop: 14 }}>
        <Stat label="មធ្យមភាគពិន្ទុ" value={s.avgPct == null ? '—' : s.avgPct + '%'} />
        <Stat label="ធ្លាក់ (auto-fail)" value={s.fails} tone={s.fails > 0 ? 'bad' : 'good'} />
        <Stat label="សំណើពាក្យសម្ងាត់" value={s.pendingPasswordRequests} tone={s.pendingPasswordRequests > 0 ? 'bad' : undefined} />
      </div>

      <div style={{ ...S.two, marginTop: 14 }}>
        <Card>
          <SectionTitle title="ការជូនដំណឹងប្រព័ន្ធ" />
          {data.notifications.length === 0
            ? <p style={S.empty}>គ្មានអ្វីត្រូវចាប់អារម្មណ៍ទេ</p>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {data.notifications.map((n, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 10, alignItems: 'center', padding: '9px 12px', borderRadius: 10,
                  background: n.level === 'danger' ? '#FEF2F2' : n.level === 'warn' ? '#FFFBEB' : '#F8FAFC',
                  border: '1px solid ' + (n.level === 'danger' ? '#FECACA' : n.level === 'warn' ? '#FDE68A' : T.line)
                }}>
                  <Pill tone={n.level === 'danger' ? 'bad' : n.level === 'warn' ? 'warn' : 'info'}>
                    {n.level === 'danger' ? 'បន្ទាន់' : n.level === 'warn' ? 'ចាំបាច់' : 'ព័ត៌មាន'}
                  </Pill>
                  <span style={{ fontSize: 13, lineHeight: 1.8 }}>{n.text}</span>
                </div>
              ))}
            </div>}
        </Card>

        <Card>
          <SectionTitle title="សកម្មភាពរហ័ស" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {allow('users', 'create') && <Btn kind="blue" onClick={() => go('users')}>បង្កើតអ្នកប្រើថ្មី</Btn>}
            {allow('users', 'view') && <Btn onClick={() => go('users')}>គ្រប់គ្រងអ្នកប្រើ</Btn>}
            {allow('content', 'create') && <Btn onClick={() => go('content')}>បន្ថែមសេចក្ដីជូនដំណឹង</Btn>}
            {allow('reports', 'view') && <Btn onClick={() => go('reports')}>មើលរបាយការណ៍</Btn>}
            {allow('audit', 'view') && <Btn onClick={() => go('audit')}>កំណត់ហេតុសកម្មភាព</Btn>}
            {allow('roles', 'view') && <Btn onClick={() => go('roles')}>កំណត់សិទ្ធិតួនាទី</Btn>}
            <Btn onClick={() => (window.location.href = '/app')}>បើកកម្មវិធី QC</Btn>
          </div>
        </Card>
      </div>

      <div style={{ ...S.two, marginTop: 14 }}>
        <Card>
          <SectionTitle title="មធ្យមភាគពិន្ទុតាមហាង" />
          <Bars data={data.byStore.map(b => ({ label: b.store_label || '—', value: b.avg_pct, tone: Number(b.avg_pct) < 70 ? 'bad' : '' }))}
            max={100} format={v => v + '%'} />
        </Card>
        <Card>
          <SectionTitle title="និន្នាការតាមខែ" />
          <Bars data={[...data.monthly].reverse().map(m => ({ label: m.month, value: m.avg_pct }))}
            max={100} format={v => v + '%'} />
        </Card>
      </div>

      <Card style={{ marginTop: 14 }}>
        <SectionTitle title="សវនកម្មថ្មីៗ" />
        <Table head={['ហាង', 'កាលបរិច្ឆេទ', 'អ្នកត្រួតពិនិត្យ', { label: 'ពិន្ទុ', right: true }, { label: '%', right: true }, 'កម្រិត', 'រក្សាទុក']}>
          {data.recent.length === 0
            ? <tr><Td>មិនទាន់មានសវនកម្ម</Td></tr>
            : data.recent.map(r => (
              <tr key={r.id}>
                <Td>{r.store_label || '—'}</Td>
                <Td>{r.inspect_date ? String(r.inspect_date).slice(0, 10) : '—'}</Td>
                <Td>{r.auditor_name || r.auditor_email}</Td>
                <Td right>{r.total_score} / {r.total_max}</Td>
                <Td right>{r.pct}%</Td>
                <Td>{r.auto_fail ? <Pill tone="bad">ធ្លាក់</Pill> : (r.band || '—')}</Td>
                <Td>{fmtWhen(r.updated_at)}</Td>
              </tr>
            ))}
        </Table>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionTitle title="សកម្មភាពអ្នកគ្រប់គ្រងថ្មីៗ" />
        <Table head={['អ្នកធ្វើ', 'សកម្មភាព', 'ម៉ូឌុល', 'គោលដៅ', 'ពេលវេលា']} minWidth={620}>
          {data.activity.length === 0
            ? <tr><Td>មិនទាន់មានកំណត់ហេតុ</Td></tr>
            : data.activity.map(a => (
              <tr key={a.id}>
                <Td>{a.actor_name || a.actor_email}</Td>
                <Td>{a.action}</Td>
                <Td>{MODULE_LABEL[a.module] || a.module}</Td>
                <Td>{a.target || '—'}</Td>
                <Td>{fmtWhen(a.created_at)}</Td>
              </tr>
            ))}
        </Table>
      </Card>
    </>
  );
}

/* ============================== USERS ============================== */
function Users({ data, allow, reload, toast }) {
  const [filters, setFilters] = useState({ q: '', role: '', status: '', branch: '' });
  const [rows, setRows] = useState(null);
  const [requests, setRequests] = useState([]);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const fetchRows = useCallback(() => {
    const p = new URLSearchParams(filters).toString();
    fetch('/api/admin/users?' + p, { cache: 'no-store' })
      .then(r => r.json()).then(d => { if (d.ok) setRows(d.users); else toast.err(d.error || 'មិនអាចទាញបញ្ជី'); })
      .catch(() => toast.err('បណ្ដាញមានបញ្ហា'));
    fetch('/api/admin/password-requests', { cache: 'no-store' })
      .then(r => r.json()).then(d => { if (d.ok) setRequests(d.requests); }).catch(() => {});
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setTimeout(fetchRows, 200); return () => clearTimeout(t); }, [fetchRows]);

  const branches = useMemo(
    () => Array.from(new Set((data.users || []).map(u => u.branch).filter(Boolean))),
    [data.users]
  );

  async function send(url, method, body, okMsg) {
    try {
      const r = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      const d = await r.json();
      if (d.ok) { toast.ok(okMsg); fetchRows(); reload(); return d; }
      toast.err(d.error || 'មិនបានសម្រេច');
    } catch (e) { toast.err('បណ្ដាញមានបញ្ហា'); }
    return null;
  }

  function exportUsers(kind) {
    const head = ['ឈ្មោះ', 'អ៊ីមែល', 'តួនាទី', 'សាខា', 'ទូរស័ព្ទ', 'ស្ថានភាព', 'ចូលចុងក្រោយ', 'ចំនួនចូល', 'សវនកម្ម'];
    const body = (rows || []).map(u => [
      u.name, u.email, ROLE_LABEL[u.role] || u.role, u.branch || '', u.phone || '',
      u.active ? 'សកម្ម' : 'បិទ', u.last_login ? new Date(u.last_login).toLocaleString('km-KH') : 'មិនទាន់ចូល',
      u.login_count, u.total_inspections ?? ''
    ]);
    const title = 'បញ្ជីអ្នកប្រើប្រាស់';
    const sub = `ចំនួន ${body.length} · បង្កើតថ្ងៃ ${new Date().toLocaleDateString('km-KH')}`;
    if (kind === 'xlsx') exportExcel([{ name: 'Users', head, rows: body }], 'onmart-users.xlsx');
    if (kind === 'pdf') exportPdf({ title, subtitle: sub, tables: [{ name: title, head, rows: body }], fileName: 'onmart-users.pdf', landscape: true });
    if (kind === 'doc') exportWord({ title, subtitle: sub, tables: [{ name: title, head, rows: body }], fileName: 'onmart-users.doc' });
  }

  return (
    <>
      <SectionTitle
        title="គ្រប់គ្រងអ្នកប្រើប្រាស់"
        sub="ស្វែងរក ត្រង បង្កើត កែប្រែ កំណត់តួនាទី និងពាក្យសម្ងាត់"
        right={<>
          {allow('users', 'export') && <>
            <Btn onClick={() => exportUsers('xlsx')}>Excel</Btn>
            <Btn onClick={() => exportUsers('pdf')}>PDF</Btn>
            <Btn onClick={() => exportUsers('doc')}>Word</Btn>
          </>}
          {allow('users', 'create') && <Btn kind="primary" onClick={() => setCreating(true)}>+ បង្កើតអ្នកប្រើ</Btn>}
        </>} />

      {requests.filter(r => r.status === 'pending').length > 0 && (
        <Card style={{ marginBottom: 14, borderLeft: '4px solid ' + T.amber }}>
          <SectionTitle title="សំណើកំណត់ពាក្យសម្ងាត់ថ្មី" sub="អ្នកប្រើបានចុច «ភ្លេចពាក្យសម្ងាត់» នៅទំព័រចូល" />
          <Table head={['អ៊ីមែល', 'ឈ្មោះ', 'ស្នើនៅ', 'សកម្មភាព']} minWidth={520}>
            {requests.filter(r => r.status === 'pending').map(r => (
              <tr key={r.id}>
                <Td mono>{r.email}</Td>
                <Td>{r.name || '—'}</Td>
                <Td>{fmtWhen(r.requested_at)}</Td>
                <Td>
                  {allow('users', 'edit') && r.auditor_id && (
                    <Btn kind="blue" onClick={() => {
                      const pw = randomPassword();
                      setConfirm({
                        text: `កំណត់ពាក្យសម្ងាត់ថ្មីសម្រាប់ ${r.email}?`,
                        detail: 'ពាក្យសម្ងាត់ថ្មីនឹងបង្ហាញម្ដងគត់ — សូមចម្លងប្រាប់អ្នកប្រើ។',
                        onYes: async () => {
                          setConfirm(null);
                          await send('/api/admin/users/' + r.auditor_id, 'PATCH', { password: pw },
                            `ពាក្យសម្ងាត់ថ្មីរបស់ ${r.email} គឺ៖ ${pw}`);
                        }
                      });
                    }}>កំណត់ពាក្យសម្ងាត់</Btn>
                  )}
                  {allow('users', 'edit') && (
                    <Btn style={{ marginLeft: 6 }}
                      onClick={() => send('/api/admin/password-requests', 'PATCH', { id: r.id }, 'បានបដិសេធសំណើ')}>បដិសេធ</Btn>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card style={{ marginBottom: 14 }}>
        <div style={S.filterRow}>
          <Field label="ស្វែងរក (ឈ្មោះ ឬអ៊ីមែល)">
            <Input value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} placeholder="វាយដើម្បីស្វែងរក…" />
          </Field>
          <Field label="តួនាទី">
            <Select value={filters.role} onChange={e => setFilters({ ...filters, role: e.target.value })}>
              <option value="">ទាំងអស់</option>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="ស្ថានភាព">
            <Select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
              <option value="">ទាំងអស់</option>
              <option value="active">សកម្ម</option>
              <option value="inactive">បិទ</option>
            </Select>
          </Field>
          <Field label="សាខា">
            <Select value={filters.branch} onChange={e => setFilters({ ...filters, branch: e.target.value })}>
              <option value="">ទាំងអស់</option>
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <Table head={['ឈ្មោះ', 'អ៊ីមែល', 'តួនាទី', 'សាខា', 'ចូលចុងក្រោយ', 'ឧបករណ៍',
          { label: 'ចូល', right: true }, { label: 'សវនកម្ម', right: true }, 'ស្ថានភាព', 'សកម្មភាព']} minWidth={1000}>
          {rows === null
            ? <tr><Td>កំពុងទាញ…</Td></tr>
            : rows.length === 0
              ? <tr><Td>រកមិនឃើញអ្នកប្រើណាមួយ</Td></tr>
              : rows.map(u => (
                <tr key={u.id} style={{ opacity: u.active ? 1 : .55 }}>
                  <Td>{u.name}</Td>
                  <Td mono>{u.email}</Td>
                  <Td>{ROLE_LABEL[u.role] || u.role}</Td>
                  <Td>{u.branch || '—'}</Td>
                  <Td>{u.last_login ? fmtWhen(u.last_login) : 'មិនទាន់ចូល'}</Td>
                  <Td>{deviceOf(u.last_user_agent)}</Td>
                  <Td right>{u.login_count}</Td>
                  <Td right>{(data.users.find(x => x.id === u.id) || {}).total_inspections ?? '—'}</Td>
                  <Td><Pill tone={u.active ? 'ok' : 'off'}>{u.active ? 'សកម្ម' : 'បិទ'}</Pill></Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {allow('users', 'edit') && <Btn onClick={() => setEditing(u)}>កែ</Btn>}
                      {allow('users', 'edit') && (
                        <Btn onClick={() => {
                          const pw = randomPassword();
                          setConfirm({
                            text: `កំណត់ពាក្យសម្ងាត់ថ្មីសម្រាប់ ${u.email}?`,
                            detail: 'ពាក្យសម្ងាត់ថ្មីនឹងបង្ហាញម្ដងគត់។',
                            onYes: async () => {
                              setConfirm(null);
                              await send('/api/admin/users/' + u.id, 'PATCH', { password: pw }, `ពាក្យសម្ងាត់ថ្មី៖ ${pw}`);
                            }
                          });
                        }}>ពាក្យសម្ងាត់</Btn>
                      )}
                      {allow('users', 'edit') && (
                        <Btn onClick={() => send('/api/admin/users/' + u.id, 'PATCH', { active: !u.active },
                          u.active ? 'បានបិទគណនី' : 'បានបើកគណនី')}>{u.active ? 'បិទ' : 'បើក'}</Btn>
                      )}
                      {allow('users', 'delete') && (
                        <Btn kind="danger" onClick={() => setConfirm({
                          danger: true,
                          text: `លុបគណនី ${u.email} ជាអចិន្ត្រៃយ៍?`,
                          detail: 'សវនកម្មដែលគណនីនេះបានធ្វើនៅតែរក្សាទុកដដែល។ សកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ។',
                          onYes: async () => { setConfirm(null); await send('/api/admin/users/' + u.id, 'DELETE', null, 'បានលុបគណនី'); }
                        })}>លុប</Btn>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
        </Table>
      </Card>

      {creating && <UserForm
        title="បង្កើតអ្នកប្រើថ្មី"
        canSetRole={data.me.role === 'super_admin'}
        branches={branches}
        onClose={() => setCreating(false)}
        onSave={async v => {
          const d = await send('/api/admin/users', 'POST', v, `បង្កើត ${v.email} រួចរាល់ · ពាក្យសម្ងាត់៖ ${v.password}`);
          if (d) setCreating(false);
        }} />}

      {editing && <UserForm
        title={'កែប្រែ ' + editing.name}
        initial={editing}
        canSetRole={data.me.role === 'super_admin'}
        branches={branches}
        onClose={() => setEditing(null)}
        onSave={async v => {
          const d = await send('/api/admin/users/' + editing.id, 'PATCH',
            { name: v.name, branch: v.branch, phone: v.phone, note: v.note, role: v.role }, 'បានរក្សាទុក');
          if (d) setEditing(null);
        }} />}

      {confirm && <Confirm {...confirm} onNo={() => setConfirm(null)} />}
    </>
  );
}

function UserForm({ title, initial, onClose, onSave, canSetRole, branches }) {
  const [v, setV] = useState({
    name: initial?.name || '', email: initial?.email || '',
    role: initial?.role || 'qc_officer', branch: initial?.branch || '',
    phone: initial?.phone || '', note: initial?.note || '',
    password: initial ? '' : randomPassword()
  });
  const isNew = !initial;
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <Btn onClick={onClose}>បោះបង់</Btn>
      <Btn kind="primary" onClick={() => onSave(v)}>រក្សាទុក</Btn>
    </>}>
      <div style={S.formGrid}>
        <Field label="ឈ្មោះពេញ"><Input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="អ៊ីមែល">
          <Input type="email" value={v.email} disabled={!isNew}
            onChange={e => setV({ ...v, email: e.target.value })}
            style={!isNew ? { background: '#F8FAFC', color: T.muted } : null} />
        </Field>
        <Field label="តួនាទី">
          <Select value={v.role} disabled={!canSetRole} onChange={e => setV({ ...v, role: e.target.value })}>
            {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="សាខា / ហាង">
          <Input list="branch-list" value={v.branch} onChange={e => setV({ ...v, branch: e.target.value })} />
          <datalist id="branch-list">{(branches || []).map(b => <option key={b} value={b} />)}</datalist>
        </Field>
        <Field label="ទូរស័ព្ទ"><Input value={v.phone} onChange={e => setV({ ...v, phone: e.target.value })} /></Field>
        {isNew && <Field label="ពាក្យសម្ងាត់ដំបូង"><Input value={v.password} onChange={e => setV({ ...v, password: e.target.value })} /></Field>}
        <Field label="កំណត់សម្គាល់" wide><Textarea value={v.note} onChange={e => setV({ ...v, note: e.target.value })} /></Field>
      </div>
      {!canSetRole && <p style={S.hint}>មានតែអ្នកគ្រប់គ្រងកំពូលទេ ដែលអាចប្ដូរតួនាទី។</p>}
    </Modal>
  );
}

/* ============================== ROLES ============================== */
function Roles({ data, allow, toast }) {
  const [perm, setPerm] = useState(data.allPermissions || {});
  const [busy, setBusy] = useState('');
  const modules = data.modules;
  const roles = data.roles;
  const actions = ['view', 'create', 'edit', 'delete', 'approve', 'export'];
  const canEdit = allow('roles', 'edit');

  async function toggle(role, module, action, value) {
    setBusy(role + module + action);
    try {
      const r = await fetch('/api/admin/roles', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, module, action, value })
      });
      const d = await r.json();
      if (d.ok) { setPerm(d.permissions); toast.ok('បានរក្សាទុកសិទ្ធិ'); }
      else toast.err(d.error || 'មិនបានសម្រេច');
    } catch (e) { toast.err('បណ្ដាញមានបញ្ហា'); }
    setBusy('');
  }

  return (
    <>
      <SectionTitle title="តួនាទី និងសិទ្ធិ"
        sub="កំណត់ថាតួនាទីនីមួយៗអាចធ្វើអ្វីបានក្នុងម៉ូឌុលនីមួយៗ។ អ្នកគ្រប់គ្រងកំពូលមានសិទ្ធិពេញជានិច្ច។" />
      {roles.map(role => (
        <Card key={role} style={{ marginBottom: 14 }}>
          <SectionTitle title={ROLE_LABEL[role] || role}
            sub={role === 'super_admin' ? 'សិទ្ធិពេញលេញ — មិនអាចកែបានទេ' : undefined} />
          <Table head={['ម៉ូឌុល', ...actions.map(a => ACTION_LABEL[a])]} minWidth={660}>
            {modules.map(m => (
              <tr key={m}>
                <Td>{MODULE_LABEL[m] || m}</Td>
                {actions.map(a => {
                  const on = role === 'super_admin' ? true : !!(perm[role] && perm[role][m] && perm[role][m][a]);
                  const locked = role === 'super_admin' || !canEdit;
                  return (
                    <Td key={a}>
                      <input type="checkbox" checked={on} disabled={locked || busy === role + m + a}
                        onChange={e => toggle(role, m, a, e.target.checked)}
                        style={{ width: 17, height: 17, cursor: locked ? 'not-allowed' : 'pointer' }} />
                    </Td>
                  );
                })}
              </tr>
            ))}
          </Table>
        </Card>
      ))}
      {!canEdit && <p style={S.hint}>អ្នកអាចមើលបាន ប៉ុន្តែគ្មានសិទ្ធិកែសិទ្ធិតួនាទីទេ។</p>}
    </>
  );
}

/* ============================= CONTENT ============================= */
function Content({ allow, toast }) {
  const [filters, setFilters] = useState({ kind: '', q: '', status: '', category: '' });
  const [state, setState] = useState({ items: null, categories: [] });
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [newCat, setNewCat] = useState('');

  const fetchItems = useCallback(() => {
    const p = new URLSearchParams(filters).toString();
    fetch('/api/admin/content?' + p, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.ok) setState({ items: d.items, categories: d.categories }); else toast.err(d.error || 'មិនអាចទាញមាតិកា'); })
      .catch(() => toast.err('បណ្ដាញមានបញ្ហា'));
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setTimeout(fetchItems, 200); return () => clearTimeout(t); }, [fetchItems]);

  async function send(url, method, body, okMsg) {
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json();
      if (d.ok) { toast.ok(okMsg); fetchItems(); return d; }
      toast.err(d.error || 'មិនបានសម្រេច');
    } catch (e) { toast.err('បណ្ដាញមានបញ្ហា'); }
    return null;
  }

  return (
    <>
      <SectionTitle title="គ្រប់គ្រងមាតិកា"
        sub="សេចក្ដីជូនដំណឹង ឯកសារ និងសម្ភារៈបណ្ដុះបណ្ដាល — រក្សាទុកលើម៉ាស៊ីនមេ ដោយមិនប៉ះពាល់ទម្រង់កម្មវិធី QC"
        right={allow('content', 'create') ? <Btn kind="primary" onClick={() => setCreating(true)}>+ បន្ថែមមាតិកា</Btn> : null} />

      <Card style={{ marginBottom: 14 }}>
        <div style={S.filterRow}>
          <Field label="ស្វែងរក"><Input value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} placeholder="ចំណងជើង ឬខ្លឹមសារ…" /></Field>
          <Field label="ប្រភេទមាតិកា">
            <Select value={filters.kind} onChange={e => setFilters({ ...filters, kind: e.target.value })}>
              <option value="">ទាំងអស់</option>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label="ចំណាត់ថ្នាក់">
            <Select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}>
              <option value="">ទាំងអស់</option>
              {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="ស្ថានភាព">
            <Select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
              <option value="">ទាំងអស់</option>
              <option value="published">បានផ្សាយ</option>
              <option value="draft">សេចក្ដីព្រាង</option>
            </Select>
          </Field>
        </div>
      </Card>

      {allow('content', 'create') && (
        <Card style={{ marginBottom: 14 }}>
          <SectionTitle title="ចំណាត់ថ្នាក់" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {state.categories.map(c => <Pill key={c.id} tone="info">{c.name}</Pill>)}
            {state.categories.length === 0 ? <span style={S.empty}>មិនទាន់មាន</span> : null}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="ឈ្មោះចំណាត់ថ្នាក់ថ្មី" style={{ maxWidth: 260 }} />
            <Btn kind="blue" onClick={async () => {
              if (!newCat.trim()) return;
              const d = await send('/api/admin/content', 'POST', { category: newCat.trim() }, 'បានបន្ថែមចំណាត់ថ្នាក់');
              if (d) setNewCat('');
            }}>បន្ថែម</Btn>
          </div>
        </Card>
      )}

      <Card>
        <Table head={['ចំណងជើង', 'ប្រភេទ', 'ចំណាត់ថ្នាក់', 'រូបភាព', 'ឯកសារ', 'ស្ថានភាព', 'ធ្វើបច្ចុប្បន្នភាព', 'សកម្មភាព']} minWidth={900}>
          {state.items === null
            ? <tr><Td>កំពុងទាញ…</Td></tr>
            : state.items.length === 0
              ? <tr><Td>មិនទាន់មានមាតិកា</Td></tr>
              : state.items.map(it => (
                <tr key={it.id}>
                  <Td>{it.pinned ? '📌 ' : ''}{it.title}</Td>
                  <Td>{KIND_LABEL[it.kind] || it.kind}</Td>
                  <Td>{it.category_name || '—'}</Td>
                  <Td>{it.has_image ? '✓' : '—'}</Td>
                  <Td>{it.has_file ? (it.file_name || '✓') : '—'}</Td>
                  <Td><Pill tone={it.published ? 'ok' : 'off'}>{it.published ? 'បានផ្សាយ' : 'ព្រាង'}</Pill></Td>
                  <Td>{fmtWhen(it.updated_at)}</Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {allow('content', 'edit') && <Btn onClick={async () => {
                        const r = await fetch('/api/admin/content/' + it.id).then(x => x.json());
                        if (r.ok) setEditing(r.item); else toast.err(r.error || 'មិនអាចបើក');
                      }}>កែ</Btn>}
                      {allow('content', 'approve') && (
                        <Btn kind={it.published ? 'default' : 'blue'}
                          onClick={() => send('/api/admin/content/' + it.id, 'PATCH', { published: !it.published },
                            it.published ? 'បានដកការផ្សាយ' : 'បានបោះពុម្ពផ្សាយ')}>
                          {it.published ? 'ដកការផ្សាយ' : 'ផ្សាយ'}
                        </Btn>
                      )}
                      {allow('content', 'delete') && (
                        <Btn kind="danger" onClick={() => setConfirm({
                          danger: true, text: `លុបមាតិកា «${it.title}»?`,
                          onYes: async () => { setConfirm(null); await send('/api/admin/content/' + it.id, 'DELETE', null, 'បានលុប'); }
                        })}>លុប</Btn>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
        </Table>
      </Card>

      {(creating || editing) && <ContentForm
        initial={editing}
        categories={state.categories}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSave={async v => {
          const d = editing
            ? await send('/api/admin/content/' + editing.id, 'PATCH', v, 'បានរក្សាទុក')
            : await send('/api/admin/content', 'POST', v, 'បានបង្កើតមាតិកា');
          if (d) { setCreating(false); setEditing(null); }
        }} />}

      {confirm && <Confirm {...confirm} onNo={() => setConfirm(null)} />}
    </>
  );
}

function ContentForm({ initial, categories, onClose, onSave }) {
  const [v, setV] = useState({
    kind: initial?.kind || 'announcement',
    title: initial?.title || '',
    body: initial?.body || '',
    category_id: initial?.category_id || '',
    published: initial?.published ?? false,
    pinned: initial?.pinned ?? false,
    image_data: initial?.image_data || '',
    file_name: initial?.file_name || '',
    file_data: initial?.file_data || ''
  });
  const [err, setErr] = useState('');

  function readFile(file, max, cb) {
    if (!file) return;
    if (file.size > max) { setErr(`ឯកសារធំពេក (អតិបរមា ${Math.round(max / 1048576)}MB)`); return; }
    const r = new FileReader();
    r.onload = () => { setErr(''); cb(r.result, file.name); };
    r.readAsDataURL(file);
  }

  return (
    <Modal title={initial ? 'កែប្រែមាតិកា' : 'បន្ថែមមាតិកា'} onClose={onClose} width={660} footer={<>
      <Btn onClick={onClose}>បោះបង់</Btn>
      <Btn kind="primary" onClick={() => onSave(v)}>រក្សាទុក</Btn>
    </>}>
      <div style={S.formGrid}>
        <Field label="ប្រភេទ">
          <Select value={v.kind} onChange={e => setV({ ...v, kind: e.target.value })}>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="ចំណាត់ថ្នាក់">
          <Select value={v.category_id || ''} onChange={e => setV({ ...v, category_id: e.target.value })}>
            <option value="">— គ្មាន —</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="ចំណងជើង" wide><Input value={v.title} onChange={e => setV({ ...v, title: e.target.value })} /></Field>
        <Field label="ខ្លឹមសារ" wide><Textarea value={v.body} onChange={e => setV({ ...v, body: e.target.value })} style={{ minHeight: 140 }} /></Field>

        <Field label="រូបភាព (អតិបរមា ២MB)">
          <input type="file" accept="image/*" style={{ fontSize: 12 }}
            onChange={e => readFile(e.target.files[0], 2 * 1048576, d => setV({ ...v, image_data: d }))} />
        </Field>
        <Field label="ឯកសារភ្ជាប់ (អតិបរមា ៤MB)">
          <input type="file" style={{ fontSize: 12 }}
            onChange={e => readFile(e.target.files[0], 4 * 1048576, (d, n) => setV({ ...v, file_data: d, file_name: n }))} />
        </Field>

        {v.image_data ? (
          <div style={{ gridColumn: '1 / -1' }}>
            <img src={v.image_data} alt="" style={{ maxWidth: 240, borderRadius: 10, border: '1px solid ' + T.line }} />
            <div style={{ marginTop: 6 }}><Btn kind="danger" onClick={() => setV({ ...v, image_data: '', clear_image: true })}>ដករូបភាព</Btn></div>
          </div>
        ) : null}
        {v.file_name ? <p style={{ ...S.hint, gridColumn: '1 / -1' }}>ឯកសារ៖ {v.file_name}</p> : null}

        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <label style={S.check}>
            <input type="checkbox" checked={v.published} onChange={e => setV({ ...v, published: e.target.checked })} /> បោះពុម្ពផ្សាយ
          </label>
          <label style={S.check}>
            <input type="checkbox" checked={v.pinned} onChange={e => setV({ ...v, pinned: e.target.checked })} /> ដាក់នៅខាងលើគេ
          </label>
        </div>
      </div>
      {err ? <p style={{ color: T.red, fontSize: 13, marginTop: 10 }}>{err}</p> : null}
    </Modal>
  );
}

/* ============================= REPORTS ============================= */
function Reports({ allow, toast, company }) {
  const [f, setF] = useState({ from: monthStart(), to: today(), store: '', auditor: '', q: '' });
  const [d, setD] = useState(null);

  const run = useCallback(() => {
    const p = new URLSearchParams(f).toString();
    fetch('/api/admin/reports?' + p, { cache: 'no-store' })
      .then(r => r.json()).then(j => { if (j.ok) setD(j); else toast.err(j.error || 'មិនអាចទាញរបាយការណ៍'); })
      .catch(() => toast.err('បណ្ដាញមានបញ្ហា'));
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setTimeout(run, 250); return () => clearTimeout(t); }, [run]);

  function tables() {
    return [
      {
        name: 'សង្ខេបតាមហាង',
        head: ['ហាង', 'ចំនួនសវនកម្ម', 'មធ្យមភាគ %', 'ទាបបំផុត', 'ខ្ពស់បំផុត', 'ធ្លាក់'],
        rows: (d.byStore || []).map(b => [b.store_label || '—', b.n, b.avg_pct, b.min_pct, b.max_pct, b.fails])
      },
      {
        name: 'សង្ខេបតាមអ្នកត្រួតពិនិត្យ',
        head: ['អ្នកត្រួតពិនិត្យ', 'អ៊ីមែល', 'ចំនួន', 'មធ្យមភាគ %'],
        rows: (d.byAuditor || []).map(a => [a.auditor_name || '—', a.auditor_email, a.n, a.avg_pct])
      },
      {
        name: 'សវនកម្មលម្អិត',
        head: ['ហាង', 'កាលបរិច្ឆេទ', 'វេន', 'អ្នកត្រួតពិនិត្យ', 'ពិន្ទុ', 'អតិបរមា', '%', 'កម្រិត', 'ធ្លាក់', 'ចំនួនកំហុស'],
        rows: (d.rows || []).map(r => [
          r.store_label || '—', String(r.inspect_date || '').slice(0, 10), r.shift || '',
          r.auditor_name || r.auditor_email, r.total_score, r.total_max, r.pct, r.band || '',
          r.auto_fail ? 'ធ្លាក់' : '', r.fault_count
        ])
      }
    ];
  }

  function subtitle() {
    return `${company} · ចាប់ពី ${f.from || '—'} ដល់ ${f.to || '—'}` +
      (f.store ? ` · ហាង៖ ${f.store}` : '') +
      ` · សវនកម្ម ${d.summary.n || 0} · មធ្យមភាគ ${d.summary.avg_pct ?? '—'}%`;
  }

  function doExport(kind) {
    if (!d) return;
    const title = 'របាយការណ៍គុណភាពហាង';
    if (kind === 'xlsx') exportExcel(tables().map(t => ({ name: t.name, head: t.head, rows: t.rows })), 'onmart-report.xlsx');
    if (kind === 'pdf') exportPdf({ title, subtitle: subtitle(), tables: tables(), fileName: 'onmart-report.pdf', landscape: true });
    if (kind === 'doc') exportWord({ title, subtitle: subtitle(), tables: tables(), fileName: 'onmart-report.doc' });
  }

  return (
    <>
      <SectionTitle title="របាយការណ៍ និងការវិភាគ"
        sub="ត្រងតាមកាលបរិច្ឆេទ ហាង និងអ្នកត្រួតពិនិត្យ រួចនាំចេញ"
        right={allow('reports', 'export') && d ? <>
          <Btn onClick={() => doExport('xlsx')}>Excel</Btn>
          <Btn onClick={() => doExport('pdf')}>PDF</Btn>
          <Btn onClick={() => doExport('doc')}>Word</Btn>
        </> : null} />

      <Card style={{ marginBottom: 14 }}>
        <div style={S.filterRow}>
          <Field label="ចាប់ពី"><Input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="ដល់"><Input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></Field>
          <Field label="ហាង">
            <Select value={f.store} onChange={e => setF({ ...f, store: e.target.value })}>
              <option value="">ទាំងអស់</option>
              {(d?.options.stores || []).map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="អ្នកត្រួតពិនិត្យ">
            <Select value={f.auditor} onChange={e => setF({ ...f, auditor: e.target.value })}>
              <option value="">ទាំងអស់</option>
              {(d?.options.auditors || []).map(a => <option key={a.auditor_email} value={a.auditor_email}>{a.auditor_name || a.auditor_email}</option>)}
            </Select>
          </Field>
          <Field label="ស្វែងរក"><Input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="ហាង ឬឈ្មោះ…" /></Field>
        </div>
      </Card>

      {!d ? <Card>កំពុងទាញ…</Card> : (
        <>
          <div style={S.grid4}>
            <Stat label="សវនកម្ម" value={d.summary.n || 0} />
            <Stat label="មធ្យមភាគ" value={d.summary.avg_pct == null ? '—' : d.summary.avg_pct + '%'} />
            <Stat label="ធ្លាក់" value={d.summary.fails || 0} tone={Number(d.summary.fails) > 0 ? 'bad' : 'good'} />
            <Stat label="ពិន្ទុសរុប" value={`${d.summary.score_sum || 0} / ${d.summary.max_sum || 0}`} />
          </div>

          <div style={{ ...S.two, marginTop: 14 }}>
            <Card>
              <SectionTitle title="មធ្យមភាគតាមហាង" />
              <Bars data={d.byStore.map(b => ({ label: b.store_label || '—', value: b.avg_pct, tone: Number(b.avg_pct) < 70 ? 'bad' : '' }))} max={100} format={v => v + '%'} />
            </Card>
            <Card>
              <SectionTitle title="និន្នាការតាមខែ" />
              <Bars data={d.byMonth.map(m => ({ label: m.month, value: m.avg_pct }))} max={100} format={v => v + '%'} />
            </Card>
          </div>

          <Card style={{ marginTop: 14 }}>
            <SectionTitle title="សង្ខេបតាមអ្នកត្រួតពិនិត្យ" />
            <Table head={['អ្នកត្រួតពិនិត្យ', 'អ៊ីមែល', { label: 'ចំនួន', right: true }, { label: 'មធ្យមភាគ', right: true }]} minWidth={560}>
              {d.byAuditor.length === 0 ? <tr><Td>គ្មានទិន្នន័យ</Td></tr> : d.byAuditor.map(a => (
                <tr key={a.auditor_email}>
                  <Td>{a.auditor_name || '—'}</Td><Td mono>{a.auditor_email}</Td>
                  <Td right>{a.n}</Td><Td right>{a.avg_pct}%</Td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card style={{ marginTop: 14 }}>
            <SectionTitle title={`សវនកម្មលម្អិត (${d.rows.length})`} />
            <Table head={['ហាង', 'កាលបរិច្ឆេទ', 'អ្នកត្រួតពិនិត្យ', { label: 'ពិន្ទុ', right: true }, { label: '%', right: true }, 'កម្រិត', { label: 'កំហុស', right: true }]} minWidth={760}>
              {d.rows.length === 0 ? <tr><Td>គ្មានសវនកម្មក្នុងជួរនេះ</Td></tr> : d.rows.map(r => (
                <tr key={r.id}>
                  <Td>{r.store_label || '—'}</Td>
                  <Td>{String(r.inspect_date || '').slice(0, 10)}</Td>
                  <Td>{r.auditor_name || r.auditor_email}</Td>
                  <Td right>{r.total_score} / {r.total_max}</Td>
                  <Td right>{r.pct}%</Td>
                  <Td>{r.auto_fail ? <Pill tone="bad">ធ្លាក់</Pill> : (r.band || '—')}</Td>
                  <Td right>{r.fault_count}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </>
  );
}

/* ============================== AUDIT ============================== */
function Audit({ allow, toast }) {
  const [f, setF] = useState({ q: '', module: '', from: '', to: '' });
  const [logs, setLogs] = useState(null);
  const [open, setOpen] = useState(null);

  const run = useCallback(() => {
    const p = new URLSearchParams(f).toString();
    fetch('/api/admin/audit?' + p, { cache: 'no-store' })
      .then(r => r.json()).then(d => { if (d.ok) setLogs(d.logs); else toast.err(d.error || 'មិនអាចទាញកំណត់ហេតុ'); })
      .catch(() => toast.err('បណ្ដាញមានបញ្ហា'));
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setTimeout(run, 250); return () => clearTimeout(t); }, [run]);

  function doExport(kind) {
    const head = ['ពេលវេលា', 'អ្នកធ្វើ', 'អ៊ីមែល', 'សកម្មភាព', 'ម៉ូឌុល', 'គោលដៅ', 'តម្លៃចាស់', 'តម្លៃថ្មី'];
    const rows = (logs || []).map(l => [
      new Date(l.created_at).toLocaleString('km-KH'), l.actor_name || '', l.actor_email || '',
      l.action, MODULE_LABEL[l.module] || l.module, l.target || '',
      l.before_value ? JSON.stringify(l.before_value) : '', l.after_value ? JSON.stringify(l.after_value) : ''
    ]);
    const title = 'កំណត់ហេតុសកម្មភាពអ្នកគ្រប់គ្រង';
    if (kind === 'xlsx') exportExcel([{ name: 'Audit', head, rows }], 'onmart-audit.xlsx');
    if (kind === 'pdf') exportPdf({ title, subtitle: `ចំនួន ${rows.length} កំណត់ត្រា`, tables: [{ name: title, head, rows }], fileName: 'onmart-audit.pdf', landscape: true });
    if (kind === 'doc') exportWord({ title, subtitle: `ចំនួន ${rows.length} កំណត់ត្រា`, tables: [{ name: title, head, rows }], fileName: 'onmart-audit.doc' });
  }

  return (
    <>
      <SectionTitle title="កំណត់ហេតុសកម្មភាព"
        sub="អ្នកណាធ្វើអ្វី នៅពេលណា ក្នុងម៉ូឌុលណា និងតម្លៃមុន/ក្រោយ"
        right={allow('audit', 'export') ? <>
          <Btn onClick={() => doExport('xlsx')}>Excel</Btn>
          <Btn onClick={() => doExport('pdf')}>PDF</Btn>
          <Btn onClick={() => doExport('doc')}>Word</Btn>
        </> : null} />

      <Card style={{ marginBottom: 14 }}>
        <div style={S.filterRow}>
          <Field label="ស្វែងរក"><Input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="ឈ្មោះ សកម្មភាព ឬគោលដៅ…" /></Field>
          <Field label="ម៉ូឌុល">
            <Select value={f.module} onChange={e => setF({ ...f, module: e.target.value })}>
              <option value="">ទាំងអស់</option>
              {Object.entries(MODULE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label="ចាប់ពី"><Input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="ដល់"><Input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></Field>
        </div>
      </Card>

      <Card>
        <Table head={['ពេលវេលា', 'អ្នកធ្វើ', 'សកម្មភាព', 'ម៉ូឌុល', 'គោលដៅ', 'លម្អិត']} minWidth={760}>
          {logs === null ? <tr><Td>កំពុងទាញ…</Td></tr>
            : logs.length === 0 ? <tr><Td>គ្មានកំណត់ហេតុក្នុងលក្ខខណ្ឌនេះ</Td></tr>
              : logs.map(l => (
                <tr key={l.id}>
                  <Td>{new Date(l.created_at).toLocaleString('km-KH')}</Td>
                  <Td>{l.actor_name || l.actor_email}</Td>
                  <Td>{l.action}</Td>
                  <Td>{MODULE_LABEL[l.module] || l.module}</Td>
                  <Td>{l.target || '—'}</Td>
                  <Td>{(l.before_value || l.after_value) ? <Btn onClick={() => setOpen(l)}>មើល</Btn> : '—'}</Td>
                </tr>
              ))}
        </Table>
      </Card>

      {open && (
        <Modal title="ការប្ដូរតម្លៃ" onClose={() => setOpen(null)} width={680} footer={<Btn onClick={() => setOpen(null)}>បិទ</Btn>}>
          <p style={{ fontSize: 13, color: T.muted, marginTop: 0 }}>
            {open.action} · {MODULE_LABEL[open.module] || open.module} · {open.target || '—'} · {new Date(open.created_at).toLocaleString('km-KH')}
          </p>
          <div style={S.two}>
            <div>
              <b style={{ fontSize: 13 }}>តម្លៃចាស់</b>
              <pre style={S.pre}>{open.before_value ? JSON.stringify(open.before_value, null, 2) : '—'}</pre>
            </div>
            <div>
              <b style={{ fontSize: 13 }}>តម្លៃថ្មី</b>
              <pre style={S.pre}>{open.after_value ? JSON.stringify(open.after_value, null, 2) : '—'}</pre>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ============================= SETTINGS ============================ */
function Settings({ data, allow, reload, toast }) {
  const [v, setV] = useState(data.settings);
  const [busy, setBusy] = useState(false);
  const canEdit = allow('settings', 'edit');

  async function save(patch) {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
      });
      const d = await r.json();
      if (d.ok) { setV(d.settings); toast.ok('បានរក្សាទុក'); reload(); }
      else toast.err(d.error || 'មិនបានសម្រេច');
    } catch (e) { toast.err('បណ្ដាញមានបញ្ហា'); }
    setBusy(false);
  }

  const set = (k, val) => setV(s => ({ ...s, [k]: val }));

  return (
    <>
      <SectionTitle title="ការកំណត់ប្រព័ន្ធ" />

      <Card style={{ marginBottom: 14 }}>
        <SectionTitle title="ប្រវត្តិរូបអ្នកគ្រប់គ្រង" />
        <div style={S.formGrid}>
          <Field label="ឈ្មោះ"><Input value={data.me.name} disabled style={{ background: '#F8FAFC' }} /></Field>
          <Field label="អ៊ីមែល"><Input value={data.me.email} disabled style={{ background: '#F8FAFC' }} /></Field>
          <Field label="តួនាទី"><Input value={ROLE_LABEL[data.me.role] || data.me.role} disabled style={{ background: '#F8FAFC' }} /></Field>
        </div>
        <p style={S.hint}>ដើម្បីប្ដូរឈ្មោះ ឬពាក្យសម្ងាត់របស់អ្នក សូមប្រើផ្ទាំង «អ្នកប្រើប្រាស់»។</p>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionTitle title="ព័ត៌មានក្រុមហ៊ុន" sub="បង្ហាញនៅក្បាលផ្ទាំងគ្រប់គ្រង និងលើរបាយការណ៍នាំចេញ" />
        <div style={S.formGrid}>
          <Field label="ឈ្មោះក្រុមហ៊ុន"><Input value={v.company_name || ''} disabled={!canEdit} onChange={e => set('company_name', e.target.value)} /></Field>
          <Field label="ពាក្យស្លោក"><Input value={v.company_tagline || ''} disabled={!canEdit} onChange={e => set('company_tagline', e.target.value)} /></Field>
          <Field label="ទំនាក់ទំនង"><Input value={v.company_contact || ''} disabled={!canEdit} onChange={e => set('company_contact', e.target.value)} /></Field>
        </div>
        {canEdit && <div style={{ marginTop: 12 }}>
          <Btn kind="primary" disabled={busy} onClick={() => save({
            company_name: v.company_name, company_tagline: v.company_tagline, company_contact: v.company_contact
          })}>រក្សាទុក</Btn>
        </div>}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionTitle title="ការបង្កើតគណនីដោយខ្លួនឯង" sub="បុគ្គលិកបង្កើតគណនីនៅទំព័រចូល ដោយបញ្ចូលលេខកូដនេះ" />
        <div style={S.formGrid}>
          <Field label="លេខកូដចូលរួម"><Input value={v.signup_code || ''} disabled={!canEdit} onChange={e => set('signup_code', e.target.value)} /></Field>
          <Field label="ស្ថានភាព">
            <Select value={v.signup_open === 'false' ? 'false' : 'true'} disabled={!canEdit} onChange={e => set('signup_open', e.target.value)}>
              <option value="true">បើក</option>
              <option value="false">បិទ</option>
            </Select>
          </Field>
        </div>
        {canEdit && <div style={{ marginTop: 12 }}>
          <Btn kind="primary" disabled={busy} onClick={() => save({ signup_code: v.signup_code, signup_open: v.signup_open !== 'false' })}>រក្សាទុក</Btn>
        </div>}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionTitle title="ការជូនដំណឹង" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={S.check}>
            <input type="checkbox" disabled={!canEdit} checked={v.notify_on_autofail !== 'false'}
              onChange={e => set('notify_on_autofail', e.target.checked ? 'true' : 'false')} />
            ជូនដំណឹងនៅផ្ទាំងគ្រប់គ្រង ពេលមានសវនកម្មធ្លាក់
          </label>
          <label style={S.check}>
            <input type="checkbox" disabled={!canEdit} checked={v.notify_on_new_user !== 'false'}
              onChange={e => set('notify_on_new_user', e.target.checked ? 'true' : 'false')} />
            ជូនដំណឹងពេលមានគណនីថ្មី
          </label>
        </div>
        {canEdit && <div style={{ marginTop: 12 }}>
          <Btn kind="primary" disabled={busy} onClick={() => save({
            notify_on_autofail: v.notify_on_autofail !== 'false', notify_on_new_user: v.notify_on_new_user !== 'false'
          })}>រក្សាទុក</Btn>
        </div>}
      </Card>

      <Card>
        <SectionTitle title="សុវត្ថិភាព" />
        <div style={S.formGrid}>
          <Field label="ប្រវែងពាក្យសម្ងាត់អប្បបរមា">
            <Input type="number" min="8" max="64" value={v.security_min_password || '8'} disabled={!canEdit}
              onChange={e => set('security_min_password', e.target.value)} />
          </Field>
          <Field label="រយៈពេលចងចាំការចូល (ថ្ងៃ)">
            <Input value={v.security_session_days || '30'} disabled />
          </Field>
        </div>
        {canEdit && <div style={{ marginTop: 12 }}>
          <Btn kind="primary" disabled={busy} onClick={() => save({ security_min_password: v.security_min_password })}>រក្សាទុក</Btn>
        </div>}
      </Card>
    </>
  );
}

/* ============================== STYLES ============================= */
const S = {
  shell: { minHeight: '100dvh', background: T.bg, fontFamily: T.km, color: T.text },
  center: { minHeight: '100dvh', background: T.bg, fontFamily: T.km, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  top: {
    position: 'sticky', top: 0, zIndex: 800, display: 'flex', alignItems: 'center', gap: 12,
    background: T.ink, color: '#fff', padding: '10px 16px', borderBottom: '3px solid ' + T.amber, minHeight: 56, boxSizing: 'border-box'
  },
  burger: { background: 'transparent', border: 0, color: '#fff', fontSize: 20, cursor: 'pointer', padding: '0 4px' },
  logo: {
    height: 32, width: 'auto', maxWidth: 110, objectFit: 'contain',
    background: '#fff', borderRadius: 7, padding: '3px 6px', flex: '0 0 auto'
  },
  topTitle: { fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  topSub: { fontSize: 11, color: '#9BA2AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  who: { fontSize: 12, color: '#CBD5E1', whiteSpace: 'nowrap' },
  topLink: { fontSize: 12.5, color: T.amber, textDecoration: 'none', whiteSpace: 'nowrap' },

  body: { display: 'flex', alignItems: 'flex-start' },
  side: {
    flex: '0 0 226px', background: T.ink2, minHeight: 'calc(100dvh - 56px)',
    display: 'flex', flexDirection: 'column', gap: 2, padding: '14px 10px 20px', boxSizing: 'border-box',
    position: 'sticky', top: 56
  },
  navItem: {
    textAlign: 'left', background: 'transparent', border: 0, borderLeft: '3px solid transparent',
    color: '#9BA2AF', padding: '11px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    borderRadius: '0 9px 9px 0', fontFamily: 'inherit', lineHeight: 1.6
  },
  navItemOn: { color: '#fff', background: 'rgba(227,167,46,.14)', borderLeftColor: T.amber },
  sideFoot: { marginTop: 'auto', color: '#64748B', fontSize: 11, padding: '14px 14px 0' },

  main: { flex: '1 1 0', minWidth: 0, padding: '20px 18px 60px', maxWidth: 1400 },

  grid5: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' },
  grid4: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' },
  grid3: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' },
  two: { display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' },
  filterRow: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' },
  formGrid: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, lineHeight: 1.8, cursor: 'pointer' },
  hint: { fontSize: 12, color: T.muted, margin: '12px 0 0', lineHeight: 1.8 },
  empty: { fontSize: 13, color: T.muted, margin: 0 },
  pre: {
    background: '#F8FAFC', border: '1px solid ' + T.line, borderRadius: 9, padding: 10,
    fontSize: 11.5, overflowX: 'auto', margin: '6px 0 0', maxHeight: 320
  }
};
