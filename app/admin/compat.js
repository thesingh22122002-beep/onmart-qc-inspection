'use client';
import {
  T, Card, SectionTitle, Stat, Field, Input, Select, Textarea,
  Table, Bars, fmtWhen, deviceOf, randomPassword,
  Btn as RawBtn, Pill as RawPill, Td as RawTd, Modal as RawModal,
} from './ui';

/* ------------------------------------------------------------------ *
 * Thin adapters over the existing ui.js primitives.
 *
 * The new admin sections were written against a slightly different prop
 * vocabulary. Rather than edit ui.js — which every existing screen
 * depends on — the differences are absorbed here, in one file.
 * ------------------------------------------------------------------ */

/* ui.js Btn takes kind="default|primary|blue|ghost|danger".
   The new sections use boolean flags plus `small`. */
export function Btn({ small, ghost, danger, primary, blue, style, ...rest }) {
  const kind = danger ? 'danger'
    : ghost ? 'ghost'
      : primary ? 'primary'
        : blue ? 'blue'
          : 'default';
  const sm = small ? { padding: '5px 10px', fontSize: 12 } : null;
  return <RawBtn kind={kind} style={{ ...sm, ...style }} {...rest} />;
}

/* ui.js Pill tones are ok | off | bad | info | warn. */
const TONE = {
  good: 'ok', ok: 'ok',
  muted: 'off', off: 'off',
  danger: 'bad', bad: 'bad',
  warn: 'warn', info: 'info',
};
export function Pill({ tone, children }) {
  return <RawPill tone={TONE[tone] || 'off'}>{children}</RawPill>;
}

/* ui.js Td does not forward colSpan, which the empty-state rows need. */
export function Td({ colSpan, children, ...rest }) {
  if (colSpan === undefined) return <RawTd {...rest}>{children}</RawTd>;
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: '9px 10px', borderBottom: '1px solid #F1F5F9',
        lineHeight: 1.7, color: '#64748B', ...(rest.style || {}),
      }}
    >
      {children}
    </td>
  );
}

/* ui.js Modal sizes by `width`; the new sections ask for `wide`. */
export function Modal({ wide, width, ...rest }) {
  return <RawModal width={width || (wide ? 920 : 560)} {...rest} />;
}

/**
 * useToasts() returns an object, not a function. The new sections call
 * say(message, tone) with tone 'good' | 'warn' | 'danger'.
 */
export function mkSay(toast) {
  return function say(message, tone) {
    if (!toast) return;
    const kind = tone === 'danger' ? 'err' : 'ok';
    if (typeof toast.push === 'function') toast.push(message, kind);
    else if (typeof toast === 'function') toast(message, kind);
  };
}

export {
  T, Card, SectionTitle, Stat, Field, Input, Select, Textarea,
  Table, Bars, fmtWhen, deviceOf, randomPassword,
};
