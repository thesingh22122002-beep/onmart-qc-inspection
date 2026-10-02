import { sql } from '../../../../lib/db';
import { requirePermission, logAction } from '../../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { error } = await requirePermission('users', 'view');
  if (error) return error;
  const rows = await sql`SELECT p.id, p.email, p.status, p.requested_at, p.handled_at, p.handled_by,
                                a.id AS auditor_id, a.name
                         FROM password_requests p
                         LEFT JOIN auditors a ON lower(a.email) = lower(p.email)
                         ORDER BY (p.status = 'pending') DESC, p.requested_at DESC LIMIT 100`;
  return Response.json({ ok: true, requests: rows });
}

// Dismiss a request without changing the password.
export async function PATCH(req) {
  const { user, error } = await requirePermission('users', 'edit');
  if (error) return error;
  let b;
  try { b = await req.json(); } catch (e) { return Response.json({ ok: false, error: 'bad json' }, { status: 400 }); }
  const id = parseInt(b.id, 10);
  if (!Number.isFinite(id)) return Response.json({ ok: false, error: 'bad id' }, { status: 400 });
  await sql`UPDATE password_requests SET status = 'dismissed', handled_at = now(), handled_by = ${user.email} WHERE id = ${id}`;
  await logAction(req, user, { action: 'បដិសេធសំណើពាក្យសម្ងាត់', module: 'users', target: String(id) });
  return Response.json({ ok: true });
}
