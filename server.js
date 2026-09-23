/* ============================================================
   ON MART QC — single-file server
   Serves the original inspection template, handles login, and
   stores inspections in Neon Postgres so every device sees the
   same data. No build step, no subfolders.
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const PORT = process.env.PORT || 3000;
const COOKIE = 'qc_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SECRET = process.env.SESSION_SECRET || 'onmart-qc-dev-secret-change-me';

let _sql = null;
function sql(strings, ...values) {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql(strings, ...values);
}

/* ---------------- crypto helpers (Web Crypto) ---------------- */
const enc = new TextEncoder();
const subtle = require('crypto').webcrypto.subtle;

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function hex(buf) {
  return Buffer.from(buf).toString('hex');
}

async function verifyPassword(password, stored) {
  try {
    const [scheme, iterStr, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'pbkdf2') return false;
    const key = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt: Buffer.from(saltHex, 'hex'), iterations: parseInt(iterStr, 10), hash: 'SHA-256' },
      key, 256
    );
    const a = hex(bits);
    if (a.length !== hashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ hashHex.charCodeAt(i);
    return diff === 0;
  } catch (e) { return false; }
}

async function hmacKey() {
  return subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signSession(payload) {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = await subtle.sign('HMAC', await hmacKey(), enc.encode(body));
  return body + '.' + b64url(sig);
}
async function verifySession(token) {
  try {
    if (!token || token.indexOf('.') < 0) return null;
    const [body, sig] = token.split('.');
    const ok = await subtle.verify('HMAC', await hmacKey(), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(fromB64url(body).toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) { return null; }
}

/* ---------------- http helpers ---------------- */
function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function json(res, code, obj, extra) {
  const headers = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {});
  res.writeHead(code, headers);
  res.end(JSON.stringify(obj));
}
function body(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 8e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); } });
  });
}
async function user(req) {
  return verifySession(cookies(req)[COOKIE]);
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.css': 'text/css; charset=utf-8'
};
const STATIC = new Set([
  'xlsx.full.min.js', 'jszip.min.js', 'jspdf.umd.min.js', 'jspdf.plugin.autotable.min.js',
  'icon-192.png', 'icon-512.png', 'manifest.webmanifest', 'sw.js'
]);

function serveFile(res, name, cache) {
  const file = path.join(__dirname, name);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(name)] || 'application/octet-stream',
      'Cache-Control': cache || 'no-cache'
    });
    res.end(buf);
  });
}

/* ---------------- login page ---------------- */
const LOGIN_HTML = `<!doctype html><html lang="km"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ON MART — ប្រព័ន្ធត្រួតពិនិត្យគុណភាពហាង</title>
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icon-192.png">
<meta name="theme-color" content="#0f172a">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;
 background:linear-gradient(160deg,#0f172a,#1e293b 55%,#334155);
 font-family:'Khmer OS','Noto Sans Khmer','Khmer UI','Leelawadee UI',system-ui,-apple-system,Segoe UI,sans-serif}
form{width:100%;max-width:400px;background:#fff;border-radius:18px;padding:32px 26px;box-shadow:0 24px 60px rgba(0,0,0,.35)}
.logo{width:58px;height:58px;border-radius:14px;background:#dc2626;color:#fff;display:flex;align-items:center;
 justify-content:center;font-weight:800;font-size:22px;margin:0 auto 14px}
h1{margin:0 0 2px;text-align:center;font-size:24px;color:#0f172a;letter-spacing:2px}
p.sub{margin:0 0 22px;text-align:center;font-size:14px;color:#64748b;line-height:1.7}
label{display:block;font-size:13px;color:#334155;margin-bottom:6px;font-weight:600}
input{width:100%;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px;
 margin-bottom:16px;font-family:inherit}
button{width:100%;padding:13px 16px;background:#dc2626;color:#fff;border:0;border-radius:10px;font-size:16px;
 font-weight:700;cursor:pointer;font-family:inherit}
button[disabled]{opacity:.6}
#err{display:none;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;
 font-size:13px;margin-bottom:12px;line-height:1.6}
p.foot{font-size:12px;color:#94a3b8;text-align:center;margin:18px 0 0;line-height:1.7}
</style></head><body>
<form id="f">
  <div class="logo">OM</div>
  <h1>ON MART</h1>
  <p class="sub">ប្រព័ន្ធត្រួតពិនិត្យគុណភាពហាង (QC)</p>
  <label for="e">អ៊ីមែល</label>
  <input id="e" type="email" autocomplete="username" placeholder="name@onmart.local" required>
  <label for="p">ពាក្យសម្ងាត់</label>
  <input id="p" type="password" autocomplete="current-password" required>
  <div id="err"></div>
  <button id="b" type="submit">ចូលប្រើប្រព័ន្ធ</button>
  <p class="foot">ទិន្នន័យរក្សាទុកលើម៉ាស៊ីនមេ និងធ្វើសមកាលកម្មគ្រប់ឧបករណ៍</p>
</form>
<script>
var f=document.getElementById('f'),b=document.getElementById('b'),err=document.getElementById('err');
f.addEventListener('submit',function(ev){
  ev.preventDefault(); err.style.display='none'; b.disabled=true; b.textContent='កំពុងចូល…';
  fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:document.getElementById('e').value,password:document.getElementById('p').value})})
  .then(function(r){return r.json()})
  .then(function(d){
    if(d.ok){ location.href='/app'; return; }
    err.textContent=d.error||'ចូលប្រើមិនបានសម្រេច'; err.style.display='block';
    b.disabled=false; b.textContent='ចូលប្រើប្រព័ន្ធ';
  })
  .catch(function(){ err.textContent='បណ្ដាញមានបញ្ហា សូមព្យាយាមម្ដងទៀត'; err.style.display='block';
    b.disabled=false; b.textContent='ចូលប្រើប្រព័ន្ធ'; });
});
</script></body></html>`;

/* ---------------- routes ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  try {
    /* ---- auth ---- */
    if (p === '/api/login' && req.method === 'POST') {
      const b = await body(req);
      const email = String(b.email || '').trim().toLowerCase();
      const password = String(b.password || '');
      if (!email || !password) return json(res, 400, { ok: false, error: 'សូមបញ្ចូលអ៊ីមែល និងពាក្យសម្ងាត់' });

      const rows = await sql`SELECT id, email, name, role, active, password_hash
                             FROM auditors WHERE lower(email) = ${email} LIMIT 1`;
      const u = rows[0];
      if (!u || !u.active || !u.password_hash || !(await verifyPassword(password, u.password_hash))) {
        return json(res, 401, { ok: false, error: 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ' });
      }
      const token = await signSession({
        uid: u.id, email: u.email, name: u.name, role: u.role, exp: Date.now() + SESSION_TTL_MS
      });
      return json(res, 200, { ok: true, user: { email: u.email, name: u.name, role: u.role } }, {
        'Set-Cookie': COOKIE + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + Math.floor(SESSION_TTL_MS / 1000)
      });
    }

    if (p === '/api/logout' && req.method === 'POST') {
      return json(res, 200, { ok: true }, { 'Set-Cookie': COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
    }

    if (p === '/api/me') {
      const u = await user(req);
      if (!u) return json(res, 401, { ok: false });
      return json(res, 200, { ok: true, user: { email: u.email, name: u.name, role: u.role } });
    }

    if (p === '/api/stores') {
      const u = await user(req);
      if (!u) return json(res, 401, { ok: false, error: 'unauthorized' });
      const rows = await sql`SELECT code, name FROM stores WHERE active = true ORDER BY code`;
      return json(res, 200, { ok: true, stores: rows });
    }

    /* ---- inspections ---- */
    if (p === '/api/inspections' && req.method === 'GET') {
      const u = await user(req);
      if (!u) return json(res, 401, { ok: false, error: 'unauthorized' });
      const rows = await sql`SELECT id, payload, deleted, updated_at FROM inspections
                             ORDER BY updated_at ASC LIMIT 2000`;
      return json(res, 200, {
        ok: true,
        serverTime: new Date().toISOString(),
        items: rows.map(r => ({ id: r.id, deleted: r.deleted, updatedAt: r.updated_at, snapshot: r.payload }))
      });
    }

    if (p === '/api/inspections' && req.method === 'POST') {
      const u = await user(req);
      if (!u) return json(res, 401, { ok: false, error: 'unauthorized' });
      const b = await body(req);
      const list = Array.isArray(b.items) ? b.items : (b.snapshot ? [b.snapshot] : []);
      if (!list.length) return json(res, 400, { ok: false, error: 'no items' });

      const saved = [];
      for (const s of list) {
        if (!s || !s.id) continue;
        const r = await sql`
          INSERT INTO inspections (
            id, store_code, store_label, inspect_date, month, shift,
            auditor_email, auditor_name, area_manager, contact,
            total_score, total_max, pct, band, auto_fail,
            pillar_rows, ratings, notes, zt, faults, payload,
            device_id, deleted, created_at, updated_at
          ) VALUES (
            ${String(s.id)}, ${s.storeCode || s.store || ''}, ${s.store || ''},
            ${s.date || null}, ${s.month || (s.date ? String(s.date).slice(0, 7) : null)}, ${s.shift || ''},
            ${u.email}, ${s.auditor || u.name || ''}, ${s.areamgr || ''}, ${s.contact || ''},
            ${num(s.totalScore)}, ${num(s.totalMax)}, ${num(s.pct)}, ${s.band || ''}, ${!!s.autoFail},
            ${JSON.stringify(s.pillarRows || [])}::jsonb, ${JSON.stringify(s.ratings || {})}::jsonb,
            ${JSON.stringify(s.notes || {})}::jsonb, ${JSON.stringify(s.zt || {})}::jsonb,
            ${JSON.stringify(s.faults || [])}::jsonb, ${JSON.stringify(s)}::jsonb,
            ${String(b.deviceId || '')}, false, now(), now()
          )
          ON CONFLICT (id) DO UPDATE SET
            store_code = EXCLUDED.store_code, store_label = EXCLUDED.store_label,
            inspect_date = EXCLUDED.inspect_date, month = EXCLUDED.month, shift = EXCLUDED.shift,
            auditor_email = EXCLUDED.auditor_email, auditor_name = EXCLUDED.auditor_name,
            area_manager = EXCLUDED.area_manager, contact = EXCLUDED.contact,
            total_score = EXCLUDED.total_score, total_max = EXCLUDED.total_max,
            pct = EXCLUDED.pct, band = EXCLUDED.band, auto_fail = EXCLUDED.auto_fail,
            pillar_rows = EXCLUDED.pillar_rows, ratings = EXCLUDED.ratings, notes = EXCLUDED.notes,
            zt = EXCLUDED.zt, faults = EXCLUDED.faults, payload = EXCLUDED.payload,
            device_id = EXCLUDED.device_id, deleted = false,
            updated_at = now(), version = inspections.version + 1
          RETURNING id, updated_at`;
        if (r[0]) saved.push({ id: r[0].id, updatedAt: r[0].updated_at });
      }
      return json(res, 200, { ok: true, saved, serverTime: new Date().toISOString() });
    }

    if (p.startsWith('/api/inspections/') && req.method === 'DELETE') {
      const u = await user(req);
      if (!u) return json(res, 401, { ok: false, error: 'unauthorized' });
      const id = decodeURIComponent(p.slice('/api/inspections/'.length));
      if (!id) return json(res, 400, { ok: false, error: 'missing id' });
      await sql`UPDATE inspections SET deleted = true, updated_at = now(), version = version + 1 WHERE id = ${id}`;
      return json(res, 200, { ok: true, id });
    }

    if (p.startsWith('/api/')) return json(res, 404, { ok: false, error: 'not found' });

    /* ---- pages ---- */
    if (p === '/' ) {
      const u = await user(req);
      if (u) { res.writeHead(302, { Location: '/app' }); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(LOGIN_HTML);
    }

    if (p === '/app' || p === '/qc.html') {
      const u = await user(req);
      if (!u) { res.writeHead(302, { Location: '/' }); return res.end(); }
      return serveFile(res, 'qc.html', 'no-cache');
    }

    if (p === '/healthz') return json(res, 200, { ok: true, time: new Date().toISOString() });

    /* ---- static ---- */
    const name = p.slice(1);
    if (STATIC.has(name)) {
      const cache = name === 'sw.js' ? 'no-cache' : 'public, max-age=31536000, immutable';
      return serveFile(res, name, cache);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (e) {
    console.error('ERROR', p, e && e.message);
    if (!res.headersSent) json(res, 500, { ok: false, error: 'server error' });
    else res.end();
  }
});

server.listen(PORT, () => console.log('ON MART QC listening on ' + PORT));
