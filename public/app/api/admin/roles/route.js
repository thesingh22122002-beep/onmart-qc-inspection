import { sql } from '../../../../lib/db';
import { requirePermission, logAction, clearPermissionCache, permissionMap, MODULES, ALL_ROLES } from '../../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'];

export async function GET() {
  const { error } = await requirePermission('roles', 'view');
  if (error) return error;
  return Response.json({
    ok: true,
    modules: MODULES,
    roles: ALL_ROLES,
    actions: ACTIONS,
    permissions: await permissionMap(true)
  });
}

// Super Admin decides what each role may do per module.
export async function PATCH(req) {
  const { user, error } = await requirePermission('roles', 'edit');
  if (error) return error;

  let b;
  try { b = await req.json(); } catch (e) { return Response.json({ ok: false, error: 'bad json' }, { status: 400 }); }

  const role = b.role;
  const module = b.module;
  const action = b.action;
  const value = !!b.value;

  if (!ALL_ROLES.includes(role) || !MODULES.includes(module) || !ACTIONS.includes(action)) {
    return Response.json({ ok: false, error: 'សំណើមិនត្រឹមត្រូវ' }, { status: 400 });
  }
  if (role === 'super_admin') {
    return Response.json({ ok: false, error: 'សិទ្ធិអ្នកគ្រប់គ្រងកំពូលមិនអាចកាត់បន្ថយបានទេ' }, { status: 400 });
  }

  const before = await sql`SELECT * FROM role_permissions WHERE role = ${role} AND module = ${module}`;

  // Make sure the row exists, then set the one column this action maps to.
  // Each branch is a literal statement — no column name is ever interpolated.
  await sql`INSERT INTO role_permissions (role, module) VALUES (${role}, ${module})
            ON CONFLICT (role, module) DO NOTHING`;

  if (action === 'view') {
    await sql`UPDATE role_permissions SET can_view = ${value}, updated_at = now() WHERE role = ${role} AND module = ${module}`;
  } else if (action === 'create') {
    await sql`UPDATE role_permissions SET can_create = ${value}, updated_at = now() WHERE role = ${role} AND module = ${module}`;
  } else if (action === 'edit') {
    await sql`UPDATE role_permissions SET can_edit = ${value}, updated_at = now() WHERE role = ${role} AND module = ${module}`;
  } else if (action === 'delete') {
    await sql`UPDATE role_permissions SET can_delete = ${value}, updated_at = now() WHERE role = ${role} AND module = ${module}`;
  } else if (action === 'approve') {
    await sql`UPDATE role_permissions SET can_approve = ${value}, updated_at = now() WHERE role = ${role} AND module = ${module}`;
  } else {
    await sql`UPDATE role_permissions SET can_export = ${value}, updated_at = now() WHERE role = ${role} AND module = ${module}`;
  }

  clearPermissionCache();

  await logAction(req, user, {
    action: 'ប្ដូរសិទ្ធិតួនាទី', module: 'roles', target: `${role} / ${module} / ${action}`,
    before: before[0] || null, after: { role, module, [action]: value }
  });

  return Response.json({ ok: true, permissions: await permissionMap(true) });
}
