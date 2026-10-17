import { sql } from '../../../lib/db';
import { hashPassword, signSession, COOKIE, SESSION_TTL_MS, secret } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function setting(key, fallback) {
  try {
    const rows = await sql`SELECT value FROM app_settings WHERE key = ${key} LIMIT 1`;
    return rows[0] ? rows[0].value : fallback;
  } catch (e) { return fallback; }
}

export async function POST(req) {
  let b;
  try { b = await req.json(); } catch (e) { return Response.json({ ok: false, error: 'bad json' }, { status: 400 }); }

  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const code = String(b.code || '').trim();
  const remember = b.remember !== false;

  if (!name || !email || !password) {
    return Response.json({ ok: false, error: 'សូមបំពេញគ្រប់ប្រអប់' }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ ok: false, error: 'អ៊ីមែលមិនត្រឹមត្រូវ' }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ ok: false, error: 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៨ តួ' }, { status: 400 });
  }

  const open = (await setting('signup_open', 'true')) === 'true';
  if (!open) {
    return Response.json({ ok: false, error: 'ការបង្កើតគណនីត្រូវបានបិទ — សូមទាក់ទងអ្នកគ្រប់គ្រង' }, { status: 403 });
  }

  const expected = await setting('signup_code', 'ONMART2026');
  if (code !== expected) {
    return Response.json({ ok: false, error: 'លេខកូដចូលរួមមិនត្រឹមត្រូវ' }, { status: 403 });
  }

  const exists = await sql`SELECT id FROM auditors WHERE lower(email) = ${email} LIMIT 1`;
  if (exists.length) {
    return Response.json({ ok: false, error: 'អ៊ីមែលនេះមានគណនីរួចហើយ — សូមចូលប្រើវិញ' }, { status: 409 });
  }

  const hash = await hashPassword(password);
  const ua = (req.headers.get('user-agent') || '').slice(0, 300);
  const rows = await sql`INSERT INTO auditors
      (email, name, role, active, password_hash, must_change_password, last_login, login_count, last_user_agent)
      VALUES (${email}, ${name}, 'qc_officer', true, ${hash}, false, now(), 1, ${ua})
      RETURNING id, email, name, role`;
  const user = rows[0];

  const ttl = remember ? SESSION_TTL_MS : 12 * 60 * 60 * 1000;
  const token = await signSession(
    { uid: user.id, email: user.email, name: user.name, role: user.role, exp: Date.now() + ttl },
    secret()
  );
  const cookie = `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax` +
    (remember ? `; Max-Age=${Math.floor(ttl / 1000)}` : '');

  return new Response(JSON.stringify({ ok: true, user: { email: user.email, name: user.name, role: user.role } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie }
  });
}
