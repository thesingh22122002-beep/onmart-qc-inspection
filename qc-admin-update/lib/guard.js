import * as admin from './admin.js';

/* ------------------------------------------------------------------ *
 * Single adaptation point.
 *
 * Every new route guards through here, so if the helper signatures in
 * lib/admin.js differ from what is assumed below, there is exactly one
 * file to adjust rather than six.
 *
 * Assumed from the existing codebase:
 *   admin.requireUser(req) -> session user { email, name, role } | null
 *   admin.can(role, module, action) -> boolean (may be async)
 *   admin.logAction(req, user, { action, module, target, before, after })
 * ------------------------------------------------------------------ */

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function currentUser(req) {
  try {
    const u = await admin.requireUser(req);
    return u && u.email ? u : null;
  } catch (_) {
    return null;
  }
}

/**
 * Resolve the acting user and check one permission.
 * Fails closed: any error anywhere becomes a denial, never an allow.
 * Returns { user } on success or { error: Response } on refusal.
 */
export async function guard(req, module, action) {
  const user = await currentUser(req);
  if (!user) return { error: json({ error: 'Not signed in' }, 401) };
  let ok = false;
  try {
    ok = await admin.can(user.role, module, action);
  } catch (_) {
    ok = false;
  }
  if (!ok) {
    return {
      error: json(
        { error: 'អ្នកមិនមានសិទ្ធិសម្រាប់សកម្មភាពនេះទេ / Permission denied', module, action },
        403
      ),
    };
  }
  return { user };
}

export async function audit(req, user, entry) {
  try {
    await admin.logAction(req, user, entry);
  } catch (_) {
    // Audit must never block the operation it records.
  }
}
