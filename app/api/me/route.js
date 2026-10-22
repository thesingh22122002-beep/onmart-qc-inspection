import { cookies } from 'next/headers';
import { sql } from '../../../lib/db';
import { verifySession, signSession, COOKIE, SESSION_TTL_MS, secret } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ *
 * Who is signed in.
 *
 * The session cookie carries the role as it was at sign-in. If an
 * account is promoted — or demoted — afterwards, that snapshot goes
 * stale, and because the middleware gates /admin on the same snapshot
 * the person loses the admin area until they happen to sign out and
 * back in. Nothing on screen explains why.
 *
 * So the live role is read here and, when it has drifted, the cookie is
 * re-issued with the current one. The next request through the
 * middleware then sees the truth.
 * ------------------------------------------------------------------ */

export async function GET() {
  const token = cookies().get(COOKIE)?.value;
  const s = await verifySession(token, secret());
  if (!s) return Response.json({ ok: false }, { status: 401 });

  let role = s.role;
  let name = s.name;
  let active = true;
  let refreshed = false;

  try {
    // Sign-in matches on lower(email); this must match the same way, or an
    // account stored with different capitalisation would never be found.
    const rows = await sql`SELECT role, name, active FROM auditors
                           WHERE lower(email) = ${String(s.email || '').toLowerCase()} LIMIT 1`;
    if (rows[0]) {
      if (rows[0].role && rows[0].role !== role) { role = rows[0].role; refreshed = true; }
      if (rows[0].name) name = rows[0].name;
      active = rows[0].active !== false;
    }
  } catch (_) {
    // If the lookup fails, keep what the signed cookie says rather than
    // locking anyone out over a database hiccup.
  }

  const body = {
    ok: true,
    user: { email: s.email, name, role, active },
    isAdmin: role === 'admin' || role === 'super_admin',
    roleRefreshed: refreshed
  };

  const headers = { 'Content-Type': 'application/json' };

  if (refreshed) {
    const remaining = Math.max(60 * 1000, Number(s.exp || 0) - Date.now());
    const payload = {
      uid: s.uid, email: s.email, name, role,
      exp: Date.now() + Math.min(remaining, SESSION_TTL_MS)
    };
    const fresh = await signSession(payload, secret());
    headers['Set-Cookie'] =
      `${COOKIE}=${fresh}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(remaining / 1000)}`;
  }

  return new Response(JSON.stringify(body), { status: 200, headers });
}
