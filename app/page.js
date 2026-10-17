'use client';

import { useEffect, useState } from 'react';

const KM = "'ONMART Khmer','Khmer OS','Noto Sans Khmer','Khmer UI','Leelawadee UI',system-ui,-apple-system,Segoe UI,sans-serif";
const LAST_EMAIL = 'qc_last_email';

export default function AuthPage() {
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [password2, setPassword2] = useState('');
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    // Already signed in from a previous visit? Go straight in.
    fetch('/api/me').then(r => r.json()).then(d => {
      if (d && d.ok) window.location.href = '/app';
    }).catch(() => {});
    try {
      const saved = localStorage.getItem(LAST_EMAIL);
      if (saved) setEmail(saved);
    } catch (e) {}
  }, []);

  function remember_email(value) {
    try {
      if (remember) localStorage.setItem(LAST_EMAIL, value);
      else localStorage.removeItem(LAST_EMAIL);
    } catch (e) {}
  }

  async function forgot() {
    setErr(''); setInfo('');
    if (!email) { setErr('សូមបញ្ចូលអ៊ីមែលរបស់អ្នកជាមុនសិន'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/forgot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const d = await r.json();
      if (d.ok) setInfo(d.message); else setErr(d.error || 'មិនបានសម្រេច');
    } catch (e) { setErr('បណ្ដាញមានបញ្ហា'); }
    setBusy(false);
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');

    if (tab === 'register' && password !== password2) {
      setErr('ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នា');
      return;
    }

    setBusy(true);
    const url = tab === 'login' ? '/api/login' : '/api/register';
    const payload = tab === 'login'
      ? { email, password, remember }
      : { name, email, password, code, remember };

    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (d.ok) {
        remember_email(email);
        window.location.href = '/app';
      } else {
        setErr(d.error || 'មិនបានសម្រេច');
        setBusy(false);
      }
    } catch (e2) {
      setErr('បណ្ដាញមានបញ្ហា សូមព្យាយាមម្ដងទៀត');
      setBusy(false);
    }
  }

  const isLogin = tab === 'login';

  return (
    <div style={S.wrap}>
      <form onSubmit={submit} style={S.card}>
        <img src="/logo.png" alt="ON MART" style={S.logo} />
        <h1 style={S.h1}>ON MART</h1>
        <p style={S.sub}>ប្រព័ន្ធត្រួតពិនិត្យគុណភាពហាង (QC)</p>

        <div style={S.tabs}>
          <button type="button" style={isLogin ? S.tabOn : S.tab}
            onClick={() => { setTab('login'); setErr(''); }}>ចូលប្រើ</button>
          <button type="button" style={!isLogin ? S.tabOn : S.tab}
            onClick={() => { setTab('register'); setErr(''); }}>បង្កើតគណនី</button>
        </div>

        {!isLogin && (
          <>
            <label style={S.label}>ឈ្មោះពេញ</label>
            <input style={S.input} value={name} onChange={e => setName(e.target.value)}
              placeholder="ឧ. ថៃ សីហា" required />
          </>
        )}

        <label style={S.label}>អ៊ីមែល</label>
        <input style={S.input} type="email" value={email} autoComplete="username"
          onChange={e => setEmail(e.target.value)} placeholder="name@onmart.local" required />

        <label style={S.label}>ពាក្យសម្ងាត់</label>
        <input style={S.input} type="password" value={password}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          onChange={e => setPassword(e.target.value)} required />

        {!isLogin && (
          <>
            <label style={S.label}>បញ្ជាក់ពាក្យសម្ងាត់</label>
            <input style={S.input} type="password" value={password2} autoComplete="new-password"
              onChange={e => setPassword2(e.target.value)} required />

            <label style={S.label}>លេខកូដចូលរួមរបស់ក្រុមហ៊ុន</label>
            <input style={S.input} value={code} onChange={e => setCode(e.target.value)}
              placeholder="សុំពីអ្នកគ្រប់គ្រង" required />
          </>
        )}

        <label style={S.check}>
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          <span>ចងចាំខ្ញុំលើឧបករណ៍នេះ (៣០ ថ្ងៃ)</span>
        </label>

        {isLogin ? (
          <button type="button" style={S.link} onClick={forgot}>ភ្លេចពាក្យសម្ងាត់?</button>
        ) : null}

        {info ? <div style={S.info}>{info}</div> : null}
        {err ? <div style={S.err}>{err}</div> : null}

        <button style={{ ...S.btn, opacity: busy ? 0.6 : 1 }} disabled={busy} type="submit">
          {busy ? 'សូមរង់ចាំ…' : (isLogin ? 'ចូលប្រើប្រព័ន្ធ' : 'បង្កើតគណនី')}
        </button>

        <p style={S.foot}>
          {isLogin
            ? 'ទិន្នន័យរក្សាទុកលើម៉ាស៊ីនមេ និងធ្វើសមកាលកម្មគ្រប់ឧបករណ៍'
            : 'គណនីថ្មីជា "អ្នកត្រួតពិនិត្យ" — អ្នកគ្រប់គ្រងអាចប្ដូរសិទ្ធិនៅពេលក្រោយ'}
        </p>
      </form>
    </div>
  );
}

const S = {
  wrap: {
    minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(160deg,#0f172a 0%,#1e293b 55%,#334155 100%)',
    padding: '24px', fontFamily: KM, margin: 0
  },
  card: {
    width: '100%', maxWidth: 400, background: '#fff', borderRadius: 18, padding: '30px 26px',
    boxShadow: '0 24px 60px rgba(0,0,0,.35)', display: 'flex', flexDirection: 'column'
  },
  logo: {
    height: 54, width: 'auto', maxWidth: 190, objectFit: 'contain',
    alignSelf: 'center', marginBottom: 16
  },
  h1: { margin: '0 0 2px', textAlign: 'center', fontSize: 24, color: '#0f172a', letterSpacing: 2 },
  sub: { margin: '0 0 18px', textAlign: 'center', fontSize: 14, color: '#64748b', lineHeight: 1.7 },
  tabs: { display: 'flex', gap: 6, background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: 18 },
  tab: {
    flex: 1, padding: '9px 8px', border: 0, background: 'transparent', color: '#64748b',
    borderRadius: 7, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit'
  },
  tabOn: {
    flex: 1, padding: '9px 8px', border: 0, background: '#fff', color: '#0f172a', fontWeight: 700,
    borderRadius: 7, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 1px 3px rgba(15,23,42,.12)'
  },
  label: { fontSize: 13, color: '#334155', marginBottom: 6, fontWeight: 600 },
  input: {
    padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 15,
    marginBottom: 14, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box'
  },
  check: {
    display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569',
    marginBottom: 14, cursor: 'pointer', lineHeight: 1.7
  },
  btn: {
    padding: '13px 16px', background: '#dc2626', color: '#fff', border: 0, borderRadius: 10,
    fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
  },
  link: {
    background: 'none', border: 0, color: '#2C62C4', fontSize: 13, cursor: 'pointer',
    padding: 0, marginBottom: 14, alignSelf: 'flex-start', fontFamily: 'inherit', textDecoration: 'underline'
  },
  info: {
    background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 8,
    padding: '10px 12px', fontSize: 13, marginBottom: 12, lineHeight: 1.8
  },
  err: {
    background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8,
    padding: '10px 12px', fontSize: 13, marginBottom: 12, lineHeight: 1.7
  },
  foot: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 18, lineHeight: 1.7 }
};
