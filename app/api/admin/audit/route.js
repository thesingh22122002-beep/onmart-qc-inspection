import { sql } from '../../../../lib/db';
import { requirePermission } from '../../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { error } = await requirePermission('audit', 'view');
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = '%' + (searchParams.get('q') || '').trim().toLowerCase() + '%';
  const module = searchParams.get('module') || '';
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10) || 200, 1000);

  const rows = await sql`
    SELECT id, actor_email, actor_name, action, module, target, before_value, after_value, ip, created_at
    FROM audit_logs
    WHERE (${module} = '' OR module = ${module})
      AND (${from} = '' OR created_at >= (${from})::timestamptz)
      AND (${to} = '' OR created_at < ((${to})::date + 1)::timestamptz)
      AND (lower(COALESCE(actor_email,'')) LIKE ${q}
           OR lower(COALESCE(actor_name,'')) LIKE ${q}
           OR lower(action) LIKE ${q}
           OR lower(COALESCE(target,'')) LIKE ${q})
    ORDER BY created_at DESC
    LIMIT ${limit}`;

  return Response.json({ ok: true, logs: rows });
}
