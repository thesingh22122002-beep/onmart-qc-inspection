import { sql } from './db';
import { currentUser } from './session';

export const ADMIN_ROLES = ['super_admin', 'admin'];

/* Who may open the admin area at all. Getting in is not the same as being
   allowed to do anything: the permission matrix still decides every action,
   and a role with nothing granted can look at nothing. Inspectors and QC
   officers work in the QC app itself and are not listed here. */
export const ADMIN_AREA_ROLES = ['super_admin', 'admin', 'qc_supervisor', 'management'];
/* Roles, widest first. A new role starts with no permissions at all —
   permissionMap() fails closed — so an admin must grant them explicitly on
   the Roles screen before anyone in that role can do anything. */
export const ALL_ROLES = ['super_admin', 'admin', 'qc_supervisor', 'inspector', 'management', 'qc_officer'];
export const MODULES = ['dashboard', 'users', 'roles', 'content', 'reports', 'audit', 'settings', 'inspections', 'masterdata', 'approvals', 'records'];

export const ROLE_LABEL = {
  super_admin: 'អ្នកគ្រប់គ្រងកំពូល / Super Admin',
  admin: 'អ្នកគ្រប់គ្រង / Admin',
  qc_supervisor: 'អ្នកគ្រប់គ្រង QC / QC Supervisor',
  inspector: 'អ្នកត្រួតពិនិត្យ / Inspector',
  management: 'ថ្នាក់ដឹកនាំ (អានតែប៉ុណ្ណោះ) / Management',
  qc_officer: 'មន្ត្រី QC / QC Officer'
};

export const MODULE_LABEL = {
  dashboard: 'ផ្ទាំងគ្រប់គ្រង',
  users: 'អ្នកប្រើប្រាស់',
  roles: 'តួនាទី និងសិទ្ធិ',
  content: 'មាតិកា',
  reports: 'របាយការណ៍',
  audit: 'កំណត់ហេតុសកម្មភាព',
  settings: 'ការកំណត់',
  inspections: 'សវនកម្ម'
};

function deny(code, msg) {
  return Response.json({ ok: false, error: msg }, { status: code });
}

// Any signed-in user, for endpoints that only need identity.
export async function requireUser() {
  const u = await currentUser();
  if (!u) return { error: deny(401, 'unauthorized') };
  return { user: u };
}

// Signed in AND allowed into the admin area at all.
export async function requireAdmin() {
  const u = await currentUser();
  if (!u) return { error: deny(401, 'unauthorized') };
  if (!ADMIN_ROLES.includes(u.role)) return { error: deny(403, 'forbidden') };
  return { user: u };
}

let permCache = null;
let permCacheAt = 0;

export async function permissionMap(force) {
  const now = Date.now();
  if (!force && permCache && now - permCacheAt < 15000) return permCache;
  let rows;
  try {
    rows = await sql`SELECT role, module, can_view, can_create, can_edit, can_delete, can_approve, can_export
                     FROM role_permissions`;
  } catch (e) {
    // If permissions cannot be read, fail closed rather than erroring out:
    // every non-super-admin check then simply returns false.
    return permCache || {};
  }
  const map = {};
  rows.forEach(r => {
    map[r.role] = map[r.role] || {};
    map[r.role][r.module] = {
      view: r.can_view, create: r.can_create, edit: r.can_edit,
      delete: r.can_delete, approve: r.can_approve, export: r.can_export
    };
  });
  permCache = map;
  permCacheAt = now;
  return map;
}

export function clearPermissionCache() { permCache = null; }

export async function can(role, module, action) {
  if (role === 'super_admin') return true;
  const map = await permissionMap();
  return !!(map[role] && map[role][module] && map[role][module][action]);
}

/* Signed in and allowed into the admin area, without demanding a particular
   permission. The shell itself (navigation, who am I, the permission matrix)
   needs this: gating it on a 'dashboard' permission left every newly added
   role unable to open the screen where that permission is granted. What each
   role can then see and do is still decided by the matrix. */
export async function requireAdminArea() {
  const u = await currentUser();
  if (!u) return { error: deny(401, 'unauthorized') };
  if (!ADMIN_AREA_ROLES.includes(u.role)) return { error: deny(403, 'forbidden') };
  return { user: u };
}

// Signed in, allowed into the admin area, and permitted for this module+action.
export async function requirePermission(module, action) {
  const u = await currentUser();
  if (!u) return { error: deny(401, 'unauthorized') };
  if (!ADMIN_AREA_ROLES.includes(u.role)) return { error: deny(403, 'forbidden') };
  const user = u;
  if (!(await can(user.role, module, action))) {
    return { error: deny(403, 'អ្នកគ្មានសិទ្ធិសម្រាប់សកម្មភាពនេះទេ') };
  }
  return { user };
}

// Every admin write is recorded. Never let logging break the action.
/* The reason for a change is recorded alongside it. There is no migration
   runner in this project, so the column is added on first use: additive,
   repeatable, and harmless if it is already there. */
let reasonColumnReady = false;
async function ensureReasonColumn() {
  if (reasonColumnReady) return true;
  try {
    await sql`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason text`;
    reasonColumnReady = true;
  } catch (_) {
    // Older Postgres or no rights to alter: fall back to logging without it.
  }
  return reasonColumnReady;
}

export async function logAction(req, user, { action, module, target, before, after, reason }) {
  try {
    const ua = (req?.headers?.get('user-agent') || '').slice(0, 300);
    const ip = (req?.headers?.get('x-forwarded-for') || '').split(',')[0].trim();
    const why = reason ? String(reason).trim().slice(0, 500) : null;

    if (await ensureReasonColumn()) {
      await sql`INSERT INTO audit_logs (actor_email, actor_name, action, module, target,
                                        before_value, after_value, ip, user_agent, reason)
                VALUES (${user?.email || ''}, ${user?.name || ''}, ${action}, ${module}, ${target || null},
                        ${before ? JSON.stringify(before) : null}::jsonb,
                        ${after ? JSON.stringify(after) : null}::jsonb, ${ip}, ${ua}, ${why})`;
      return;
    }

    await sql`INSERT INTO audit_logs (actor_email, actor_name, action, module, target, before_value, after_value, ip, user_agent)
              VALUES (${user?.email || ''}, ${user?.name || ''}, ${action}, ${module}, ${target || null},
                      ${before ? JSON.stringify(before) : null}::jsonb,
                      ${after ? JSON.stringify(after) : null}::jsonb, ${ip}, ${ua})`;
  } catch (e) { /* audit must never block the operation */ }
}

export async function settingsMap() {
  const rows = await sql`SELECT key, value FROM app_settings`;
  const out = {};
  rows.forEach(r => { out[r.key] = r.value; });
  return out;
}
