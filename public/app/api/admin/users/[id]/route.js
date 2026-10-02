import { sql } from '../../../../../lib/db';
import { requirePermission, logAction, ALL_ROLES } from '../../../../../lib/admin';
import { hashPassword } from '../../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function load(id) {
  const r = await sql`SELECT id, email, name, role, active, branch, phone, note FROM auditors WHERE id = ${id}`;
  return r[0] || null;
}

// Edit, activate/deactivate, assign role, reset password.
export async function PATCH(req, { params }) {
  const { user, error } = await requirePermission('users', 'edit');
  if (error) return error;

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return Response.json({ ok: false, error: 'bad id' }, { status: 400 });

  let b;
  try { b = await req.json(); } catch (e) { return Response.json({ ok: false, error: 'bad json' }, { status: 400 }); }

  const before = await load(id);
  if (!before) return Response.json({ ok: false, error: 'រកមិនឃើញគណនី' }, { status: 404 });

  if (typeof b.active === 'boolean') {
    if (id === user.uid && b.active === false) {
      return Response.json({ ok: false, error: 'មិនអាចបិទគណនីខ្លួនឯងបានទេ' }, { status: 400 });
    }
    await sql`UPDATE auditors SET active = ${b.active}, updated_at = now() WHERE id = ${id}`;
  }

  if (b.role && ALL_ROLES.includes(b.role)) {
    if (user.role !== 'super_admin') {
      return Response.json({ ok: false, error: 'មានតែអ្នកគ្រប់គ្រងកំពូលទេ ដែលអាចប្ដូរតួនាទី' }, { status: 403 });
    }
    if (id === user.uid && b.role !== 'super_admin') {
      return Response.json({ ok: false, error: 'មិនអាចបន្ថយតួនាទីខ្លួនឯងបានទេ' }, { status: 400 });
    }
    await sql`UPDATE auditors SET role = ${b.role}, updated_at = now() WHERE id = ${id}`;
  }

  if (b.name !== undefined || b.branch !== undefined || b.phone !== undefined || b.note !== undefined) {
    await sql`UPDATE auditors SET
                name   = COALESCE(${b.name === undefined ? null : String(b.name).trim()}, name),
                branch = COALESCE(${b.branch === undefined ? null : String(b.branch).trim()}, branch),
                phone  = COALESCE(${b.phone === undefined ? null : String(b.phone).trim()}, phone),
                note   = COALESCE(${b.note === undefined ? null : String(b.note).trim()}, note),
                updated_at = now()
              WHERE id = ${id}`;
  }

  if (b.password) {
    const pw = String(b.password);
    if (pw.length < 8) return Response.json({ ok: false, error: 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៨ តួ' }, { status: 400 });
    const hash = await hashPassword(pw);
    await sql`UPDATE auditors SET password_hash = ${hash}, must_change_password = true, updated_at = now() WHERE id = ${id}`;
    await sql`UPDATE password_requests SET status = 'done', handled_at = now(), handled_by = ${user.email}
              WHERE lower(email) = lower(${before.email}) AND status = 'pending'`;
  }

  const after = await load(id);
  await logAction(req, user, {
    action: b.password ? 'កំណត់ពាក្យសម្ងាត់ថ្មី' : 'កែប្រែអ្នកប្រើ',
    module: 'users', target: before.email,
    before: b.password ? null : before,
    after: b.password ? null : after
  });

  return Response.json({ ok: true, user: after });
}

export async function DELETE(req, { params }) {
  const { user, error } = await requirePermission('users', 'delete');
  if (error) return error;

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return Response.json({ ok: false, error: 'bad id' }, { status: 400 });
  if (id === user.uid) return Response.json({ ok: false, error: 'មិនអាចលុបគណនីខ្លួនឯងបានទេ' }, { status: 400 });

  const before = await load(id);
  if (!before) return Response.json({ ok: false, error: 'រកមិនឃើញគណនី' }, { status: 404 });
  if (before.role === 'super_admin' && user.role !== 'super_admin') {
    return Response.json({ ok: false, error: 'គ្មានសិទ្ធិលុបអ្នកគ្រប់គ្រងកំពូល' }, { status: 403 });
  }

  await sql`DELETE FROM auditors WHERE id = ${id}`;
  await logAction(req, user, { action: 'លុបអ្នកប្រើ', module: 'users', target: before.email, before });

  return Response.json({ ok: true, deleted: before.email });
}
