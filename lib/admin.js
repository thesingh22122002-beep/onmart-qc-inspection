import { sql } from './db';
import { currentUser } from './session';

export const ADMIN_ROLES = ['super_admin', 'admin'];
export const ALL_ROLES = ['super_admin', 'admin', 'qc_officer'];
export const MODULES = ['dashboard', 'users', 'roles', 'content', 'reports', 'audit', 'settings', 'inspections', 'masterdata', 'approvals', 'records'];

export const ROLE_LABEL = {
  super_admin: 'អ្នកគ្រប់គ្រងកំពូល',
  admin: 'អ្នកគ្រប់គ្រង',
  qc_officer: 'មន្ត្រី QC'
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

// Signed in, in the admin area, and permitted for this module + action.
export async function requirePermission(module, action) {
  const { user, error } = await requireAdmin();
  if (error) return { error };
  if (!(await can(user.role, module, action))) {
    return { error: deny(403, 'អ្នកគ្មានសិទ្ធិសម្រាប់សកម្មភាពនេះទេ') };
  }
  return { user };
}

// Every admin write is recorded. Never let logging break the action.
export async function logAction(req, user, { action, module, target, before, after }) {
  try {
    const ua = (req?.headers?.get('user-agent') || '').slice(0, 300);
    const ip = (req?.headers?.get('x-forwarded-for') || '').split(',')[0].trim();
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
