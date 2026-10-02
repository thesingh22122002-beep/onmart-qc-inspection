'use client';

import { useEffect, useState } from 'react';

/* Brand tokens taken from the QC app so the admin area matches it. */
export const T = {
  ink: '#16233A',
  ink2: '#1E2C45',
  amber: '#E3A72E',
  red: '#CF4331',
  blue: '#2C62C4',
  green: '#2E8B57',
  bg: '#F1F5F9',
  line: '#E2E8F0',
  text: '#0F172A',
  muted: '#64748B',
  km: "'Khmer OS','Noto Sans Khmer','Khmer UI','Leelawadee UI',system-ui,-apple-system,Segoe UI,sans-serif"
};

export function Card({ children, style, pad = 20 }) {
  return (
    <section style={{
      background: '#fff', borderRadius: 14, padding: pad,
      boxShadow: '0 1px 3px rgba(15,23,42,.08)', ...style
    }}>{children}</section>
  );
}

export function SectionTitle({ title, sub, right }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 17, color: T.text }}>{title}</h2>
        {sub ? <p style={{ margin: '4px 0 0', fontSize: 12.5, color: T.muted, lineHeight: 1.7 }}>{sub}</p> : null}
      </div>
      {right ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{right}</div> : null}
    </div>
  );
}

export function Stat({ label, value, tone, hint }) {
  const color = tone === 'bad' ? T.red : tone === 'good' ? T.green : T.text;
  return (
    <Card pad={16}>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.3, color }}>{value}</div>
      <div style={{ fontSize: 12, color: T.muted, marginTop: 2, lineHeight: 1.7 }}>{label}</div>
      {hint ? <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{hint}</div> : null}
    </Card>
  );
}

export function Btn({ children, onClick, kind = 'default', disabled, type = 'button', style }) {
  const base = {
    padding: '9px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', border: '1px solid transparent', opacity: disabled ? .55 : 1, whiteSpace: 'nowrap'
  };
  const kinds = {
    default: { background: '#F1F5F9', color: '#334155', borderColor: '#CBD5E1' },
    primary: { background: T.red, color: '#fff' },
    blue: { background: T.blue, color: '#fff' },
    ghost: { background: 'transparent', color: T.muted, borderColor: 'transparent' },
    danger: { background: '#FEE2E2', color: '#B91C1C', borderColor: '#FECACA' }
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...kinds[kind], ...style }}>
      {children}
    </button>
  );
}

export function Field({ label, children, wide }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, gridColumn: wide ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{label}</span>
      {children}
    </label>
  );
}

export const inputStyle = {
  padding: '9px 11px', border: '1px solid #CBD5E1', borderRadius: 9, fontSize: 13.5,
  fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', background: '#fff', color: T.text
};

export function Input(props) { return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />; }
export function Select(props) { return <select {...props} style={{ ...inputStyle, ...(props.style || {}) }} />; }
export function Textarea(props) {
  return <textarea {...props} style={{ ...inputStyle, minHeight: 90, resize: 'vertical', ...(props.style || {}) }} />;
}

export function Pill({ children, tone }) {
  const tones = {
    ok: { background: '#DCFCE7', color: '#166534' },
    off: { background: '#F1F5F9', color: '#64748B' },
    bad: { background: '#FEE2E2', color: '#B91C1C' },
    info: { background: '#DBEAFE', color: '#1E40AF' },
    warn: { background: '#FEF3C7', color: '#92400E' }
  };
  return <span style={{ borderRadius: 999, padding: '2px 10px', fontSize: 11.5, whiteSpace: 'nowrap', ...(tones[tone] || tones.off) }}>{children}</span>;
}

export function Table({ head, children, minWidth = 720 }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth }}>
        <thead><tr>{head.map((h, i) => (
          <th key={i} style={{
            textAlign: h.right ? 'right' : 'left', padding: '9px 10px',
            borderBottom: '2px solid ' + T.line, color: '#475569', fontWeight: 600, whiteSpace: 'nowrap'
          }}>{h.label !== undefined ? h.label : h}</th>
        ))}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, right, mono, style }) {
  return (
    <td style={{
      padding: '9px 10px', borderBottom: '1px solid #F1F5F9', lineHeight: 1.7,
      textAlign: right ? 'right' : 'left', whiteSpace: right ? 'nowrap' : undefined,
      fontFamily: mono ? 'ui-monospace,Menlo,monospace' : undefined, fontSize: mono ? 12 : undefined,
      ...style
    }}>{children}</td>
  );
}

export function Modal({ title, children, onClose, footer, width = 560 }) {
  useEffect(() => {
    function esc(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto'
      }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: width, boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid ' + T.line, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <Btn kind="ghost" onClick={onClose} style={{ fontSize: 18, padding: '2px 8px' }}>✕</Btn>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
        {footer ? (
          <div style={{ padding: '14px 20px', borderTop: '1px solid ' + T.line, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Confirm({ text, detail, onYes, onNo, danger }) {
  return (
    <Modal title="សូមបញ្ជាក់" onClose={onNo} width={440}
      footer={<>
        <Btn onClick={onNo}>បោះបង់</Btn>
        <Btn kind={danger ? 'primary' : 'blue'} onClick={onYes}>បាទ/ចាស បន្ត</Btn>
      </>}>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.9 }}>{text}</p>
      {detail ? <p style={{ margin: '10px 0 0', fontSize: 12.5, color: T.muted, lineHeight: 1.8 }}>{detail}</p> : null}
    </Modal>
  );
}

export function Toasts({ items, onDone }) {
  useEffect(() => {
    if (!items.length) return;
    const t = setTimeout(() => onDone(items[0].id), 5200);
    return () => clearTimeout(t);
  }, [items, onDone]);

  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 3000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 'min(420px, calc(100vw - 32px))' }}>
      {items.map(t => (
        <div key={t.id} onClick={() => onDone(t.id)} style={{
          background: t.kind === 'err' ? '#FEE2E2' : '#ECFDF5',
          color: t.kind === 'err' ? '#991B1B' : '#065F46',
          border: '1px solid ' + (t.kind === 'err' ? '#FECACA' : '#A7F3D0'),
          borderRadius: 11, padding: '11px 14px', fontSize: 13, lineHeight: 1.8,
          boxShadow: '0 8px 22px rgba(15,23,42,.14)', cursor: 'pointer', wordBreak: 'break-word'
        }}>{t.text}</div>
      ))}
    </div>
  );
}

export function useToasts() {
  const [items, setItems] = useState([]);
  function push(text, kind) { setItems(l => [...l, { id: Date.now() + Math.random(), text, kind }]); }
  function done(id) { setItems(l => l.filter(t => t.id !== id)); }
  return { items, push, done, ok: t => push(t, 'ok'), err: t => push(t, 'err') };
}

/* Simple inline bar chart — no library, matches the brand palette. */
export function Bars({ data, max, format }) {
  const top = max || Math.max(1, ...data.map(d => Number(d.value) || 0));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {data.length === 0 ? <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>មិនទាន់មានទិន្នន័យ</p> : null}
      {data.map((d, i) => {
        const v = Number(d.value) || 0;
        const pctw = Math.max(1.5, (v / top) * 100);
        return (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4, gap: 10 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
              <b style={{ whiteSpace: 'nowrap' }}>{format ? format(v) : v}</b>
            </div>
            <div style={{ height: 8, background: '#EEF2F7', borderRadius: 999 }}>
              <div style={{ width: pctw + '%', height: '100%', borderRadius: 999, background: d.tone === 'bad' ? T.red : T.blue }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function fmtWhen(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'ទើបតែឥឡូវ';
  if (mins < 60) return mins + ' នាទីមុន';
  if (mins < 1440) return Math.round(mins / 60) + ' ម៉ោងមុន';
  return d.toLocaleDateString('km-KH') + ' ' + d.toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit' });
}

export function deviceOf(ua) {
  if (!ua) return '—';
  if (/iPhone|iPad/i.test(ua)) return 'iPhone / iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS/i.test(ua)) return 'Mac';
  return 'ផ្សេងៗ';
}

export function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'QC-' + s;
}
