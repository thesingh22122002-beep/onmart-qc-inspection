import * as admin from './admin';

/* ------------------------------------------------------------------ *
 * Single adaptation point between the new routes and lib/admin.js.
 *
 * lib/admin.js returns result objects, not bare values:
 *   requireUser()  -> { user } | { error: Response }   (no arguments)
 *   can(role, module, action) -> Promise<boolean>
 *   logAction(req, user, { action, module, target, before, after })
 * ------------------------------------------------------------------ */

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Resolve the signed-in user, or null. */
export async function currentUser() {
  try {
    const r = await admin.requireUser();
    if (!r) return null;
    if (r.user && r.user.email) return r.user;   // the documented shape
    if (r.email) return r;                       // tolerate a bare user
    return null;
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
  const user = await currentUser();
  if (!user) {
    return {
      error: json({ error: 'សូមចូលប្រើម្ដងទៀត / Please sign in again' }, 401),
    };
  }

  let ok = false;
  try {
    ok = await admin.can(user.role, module, action);
  } catch (_) {
    ok = false;
  }

  if (!ok) {
    return {
      error: json(
        {
          error: 'អ្នកមិនមានសិទ្ធិសម្រាប់សកម្មភាពនេះទេ / Permission denied',
          module,
          action,
          role: user.role,
        },
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
