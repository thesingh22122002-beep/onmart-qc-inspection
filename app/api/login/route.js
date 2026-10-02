import { sql } from '../../../lib/db';
import { verifyPassword, signSession, COOKIE, SESSION_TTL_MS, secret } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch (e) { body = {}; }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) {
    return Response.json({ ok: false, error: 'សូមបញ្ចូលអ៊ីមែល និងពាក្យសម្ងាត់' }, { status: 400 });
  }

  const rows = await sql`SELECT id, email, name, role, active, password_hash, must_change_password
                         FROM auditors WHERE lower(email) = ${email} LIMIT 1`;
  const user = rows[0];
  if (!user || !user.active || !user.password_hash) {
    return Response.json({ ok: false, error: 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ' }, { status: 401 });
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return Response.json({ ok: false, error: 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ' }, { status: 401 });
  }

  const ua = (req.headers.get('user-agent') || '').slice(0, 300);
  try {
    await sql`UPDATE auditors
              SET last_login = now(), login_count = login_count + 1, last_user_agent = ${ua}
              WHERE id = ${user.id}`;
  } catch (e) { /* never block a login on bookkeeping */ }

  // "remember me" keeps the session for 30 days; otherwise it ends with the browser.
  const remember = body.remember !== false;
  const ttl = remember ? SESSION_TTL_MS : 12 * 60 * 60 * 1000;

  const payload = {
    uid: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    exp: Date.now() + ttl
  };
  const token = await signSession(payload, secret());
  const cookie = `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax` +
    (remember ? `; Max-Age=${Math.floor(ttl / 1000)}` : '');

  return new Response(JSON.stringify({
    ok: true,
    user: { email: user.email, name: user.name, role: user.role, mustChangePassword: user.must_change_password }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie }
  });
}
