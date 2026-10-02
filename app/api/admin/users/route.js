import { sql } from '../../../../lib/db';
import { requirePermission, logAction, ALL_ROLES } from '../../../../lib/admin';
import { hashPassword } from '../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Search / filter the user list.
export async function GET(req) {
  const { error } = await requirePermission('users', 'view');
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = '%' + (searchParams.get('q') || '').trim().toLowerCase() + '%';
  const role = searchParams.get('role') || '';
  const status = searchParams.get('status') || '';
  const branch = searchParams.get('branch') || '';

  const rows = await sql`
    SELECT id, email, name, role, active, branch, phone, note,
           last_login, login_count, last_user_agent, created_at
    FROM auditors
    WHERE (lower(email) LIKE ${q} OR lower(name) LIKE ${q})
      AND (${role} = '' OR role = ${role})
      AND (${branch} = '' OR branch = ${branch})
      AND (${status} = '' OR (${status} = 'active' AND active = true) OR (${status} = 'inactive' AND active = false))
    ORDER BY created_at DESC`;

  return Response.json({ ok: true, users: rows });
}

export async function POST(req) {
  const { user, error } = await requirePermission('users', 'create');
  if (error) return error;

  let b;
  try { b = await req.json(); } catch (e) { return Response.json({ ok: false, error: 'bad json' }, { status: 400 }); }

  const email = String(b.email || '').trim().toLowerCase();
  const name = String(b.name || '').trim();
  const role = ALL_ROLES.includes(b.role) ? b.role : 'qc_officer';
  const branch = String(b.branch || '').trim();
  const phone = String(b.phone || '').trim();
  const password = String(b.password || '');

  if (!email || !name) return Response.json({ ok: false, error: 'សូមបញ្ចូលឈ្មោះ និងអ៊ីមែល' }, { status: 400 });
  if (password.length < 8) return Response.json({ ok: false, error: 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៨ តួ' }, { status: 400 });
  if (role === 'super_admin' && user.role !== 'super_admin') {
    return Response.json({ ok: false, error: 'មានតែអ្នកគ្រប់គ្រងកំពូលទេ ដែលអាចបង្កើតអ្នកគ្រប់គ្រងកំពូល' }, { status: 403 });
  }

  const exists = await sql`SELECT id FROM auditors WHERE lower(email) = ${email} LIMIT 1`;
  if (exists.length) return Response.json({ ok: false, error: 'អ៊ីមែលនេះមានរួចហើយ' }, { status: 409 });

  const hash = await hashPassword(password);
  const rows = await sql`INSERT INTO auditors (email, name, role, branch, phone, active, password_hash, must_change_password)
                         VALUES (${email}, ${name}, ${role}, ${branch}, ${phone}, true, ${hash}, true)
                         RETURNING id, email, name, role, branch, phone, active`;

  await logAction(req, user, {
    action: 'បង្កើតអ្នកប្រើ', module: 'users', target: email,
    after: { email, name, role, branch, phone }
  });

  return Response.json({ ok: true, user: rows[0] });
}
