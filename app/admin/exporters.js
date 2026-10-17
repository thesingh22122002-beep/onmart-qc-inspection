'use client';

/* Exports reuse the same libraries the QC app already ships, loaded from
   this site rather than a CDN, plus the embedded Khmer font that qc.html
   carries so PDFs render Khmer correctly. */

let loaded = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('load failed: ' + src));
    document.head.appendChild(s);
  });
}

export function ensureLibs() {
  if (!loaded) {
    loaded = Promise.all([
      loadScript('/vendor/xlsx.full.min.js'),
      loadScript('/vendor/jspdf.umd.min.js')
    ]).then(() => loadScript('/vendor/jspdf.plugin.autotable.min.js'));
  }
  return loaded;
}

let khmerFont = null;
async function getKhmerFont() {
  if (khmerFont !== null) return khmerFont;
  try {
    const res = await fetch('/khmer-font.json', { cache: 'force-cache' });
    if (!res.ok) throw new Error('no font');
    const j = await res.json();
    khmerFont = j && j.normal ? j : false;
  } catch (e) { khmerFont = false; }
  return khmerFont;
}

// jsPDF silently drops everything after a glyph the font lacks, so the
// same sanitiser the QC app uses is applied to every dynamic string.
export function sanitize(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/→/g, '->').replace(/←/g, '<-').replace(/↑/g, '^').replace(/↓/g, 'v')
    .replace(/±/g, '+/-').replace(/√/g, 'sqrt').replace(/≈/g, '~')
    .replace(/≤/g, '<=').replace(/≥/g, '>=')
    .replace(/[←-⇿]/g, '').replace(/[∀-⋿]/g, '')
    .replace(/[⌀-⏿]/g, '').replace(/[☀-➿]/g, '')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportExcel(sheets, fileName) {
  await ensureLibs();
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  sheets.forEach(s => {
    const ws = XLSX.utils.aoa_to_sheet([s.head, ...(s.rows.length ? s.rows : [s.head.map(() => '')])]);
    ws['!cols'] = s.head.map(h => ({ wch: Math.min(42, Math.max(12, String(h).length + 6)) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 28));
  });
  XLSX.writeFile(wb, fileName);
}

export async function exportPdf({ title, subtitle, tables, images, fileName, landscape }) {
  await ensureLibs();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait' });

  let FONT = 'helvetica';
  const f = await getKhmerFont();
  if (f && f.normal) {
    try {
      doc.addFileToVFS('NotoSansKhmer-Regular.ttf', f.normal);
      doc.addFont('NotoSansKhmer-Regular.ttf', 'NotoKhmer', 'normal');
      doc.addFileToVFS('NotoSansKhmer-Bold.ttf', f.bold || f.normal);
      doc.addFont('NotoSansKhmer-Bold.ttf', 'NotoKhmer', 'bold');
      FONT = 'NotoKhmer';
    } catch (e) { FONT = 'helvetica'; }
  }

  doc.setFont(FONT, 'bold'); doc.setFontSize(15);
  doc.text(sanitize(title), 14, 18);
  doc.setFont(FONT, 'normal'); doc.setFontSize(10);
  if (subtitle) doc.text(sanitize(subtitle), 14, 25);

  let y = subtitle ? 30 : 24;

  (tables || []).forEach(t => {
    doc.setFont(FONT, 'bold'); doc.setFontSize(11);
    doc.text(sanitize(t.name), 14, y + 6);
    doc.autoTable({
      startY: y + 9,
      head: [t.head.map(sanitize)],
      body: t.rows.map(r => r.map(c => sanitize(c))),
      styles: { font: FONT, fontStyle: 'normal', fontSize: 8, cellPadding: 2 },
      headStyles: { font: FONT, fontStyle: 'bold', fillColor: [44, 98, 196] },
      alternateRowStyles: { fillColor: [247, 249, 252] }
    });
    y = doc.lastAutoTable.finalY + 8;
    if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 18; }
  });

  (images || []).forEach(img => {
    if (!img || !img.data) return;
    if (y > doc.internal.pageSize.getHeight() - 70) { doc.addPage(); y = 18; }
    doc.setFont(FONT, 'normal'); doc.setFontSize(9);
    if (img.caption) { doc.text(sanitize(img.caption), 14, y + 5); y += 7; }
    try { doc.addImage(img.data, 14, y, 70, 50); y += 56; } catch (e) { /* skip unreadable image */ }
  });

  doc.save(fileName);
}

export function exportWord({ title, subtitle, tables, images, fileName }) {
  const esc = v => String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      body{font-family:'Khmer OS','Noto Sans Khmer',sans-serif;font-size:11pt;color:#16233A}
      h1{font-size:17pt;margin:0 0 4px} h2{font-size:13pt;margin:18px 0 6px}
      p.sub{color:#64748B;font-size:10pt;margin:0 0 14px}
      table{border-collapse:collapse;width:100%;margin-bottom:14px}
      th{background:#2C62C4;color:#fff;border:1px solid #CBD5E1;padding:6px;font-size:9.5pt;text-align:left}
      td{border:1px solid #CBD5E1;padding:6px;font-size:9.5pt}
      img{max-width:420px;margin:6px 0}
    </style></head><body>`;

  html += `<h1>${esc(title)}</h1>`;
  if (subtitle) html += `<p class="sub">${esc(subtitle)}</p>`;

  (tables || []).forEach(t => {
    html += `<h2>${esc(t.name)}</h2><table><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>`;
    t.rows.forEach(r => { html += `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`; });
    html += `</table>`;
  });

  (images || []).forEach(img => {
    if (!img || !img.data) return;
    if (img.caption) html += `<p>${esc(img.caption)}</p>`;
    html += `<img src="${img.data}">`;
  });

  html += `</body></html>`;
  download(new Blob(['﻿', html], { type: 'application/msword' }), fileName);
}
