import { sql } from '../../../../lib/db';
import { requirePermission, permissionMap, settingsMap, MODULES, ALL_ROLES } from '../../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { user, error } = await requirePermission('dashboard', 'view');
  if (error) return error;

  const month = new Date().toISOString().slice(0, 7);
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const since7 = new Date(Date.now() - 7 * 864e5).toISOString();

  const [users, totals, byStore, recent, activity, pwReq, stores, monthly] = await Promise.all([
    sql`SELECT a.id, a.email, a.name, a.role, a.active, a.branch, a.phone,
               a.last_login, a.login_count, a.last_user_agent, a.created_at,
               (SELECT count(*) FROM inspections i WHERE i.auditor_email = a.email AND i.deleted = false) AS total_inspections,
               (SELECT count(*) FROM inspections i WHERE i.auditor_email = a.email AND i.deleted = false AND i.month = ${month}) AS month_inspections
        FROM auditors a ORDER BY a.created_at`,

    sql`SELECT count(*) AS total,
               count(*) FILTER (WHERE month = ${month}) AS this_month,
               count(*) FILTER (WHERE auto_fail) AS fails,
               round(avg(pct)::numeric, 1) AS avg_pct
        FROM inspections WHERE deleted = false`,

    sql`SELECT store_label, count(*) AS n, round(avg(pct)::numeric,1) AS avg_pct,
               sum(CASE WHEN auto_fail THEN 1 ELSE 0 END) AS fails, max(inspect_date) AS last_date
        FROM inspections WHERE deleted = false
        GROUP BY store_label ORDER BY avg_pct DESC NULLS LAST`,

    sql`SELECT id, store_label, inspect_date, total_score, total_max, pct, band, auto_fail,
               auditor_name, auditor_email, updated_at
        FROM inspections WHERE deleted = false ORDER BY updated_at DESC LIMIT 15`,

    sql`SELECT id, actor_name, actor_email, action, module, target, created_at
        FROM audit_logs ORDER BY created_at DESC LIMIT 15`,

    sql`SELECT count(*) AS pending FROM password_requests WHERE status = 'pending'`,

    sql`SELECT count(*) AS total FROM stores WHERE active = true`,

    sql`SELECT month, count(*) AS n, round(avg(pct)::numeric,1) AS avg_pct
        FROM inspections WHERE deleted = false AND month IS NOT NULL
        GROUP BY month ORDER BY month DESC LIMIT 12`
  ]);

  const activeUsers = users.filter(u => u.active).length;
  const newUsers = users.filter(u => u.created_at && new Date(u.created_at).toISOString() > since30).length;
  const recentlyActive = users.filter(u => u.last_login && new Date(u.last_login).toISOString() > since7).length;

  const notifications = [];
  const t = totals[0] || {};
  if (Number(t.fails) > 0) {
    notifications.push({ level: 'danger', text: `មានសវនកម្មធ្លាក់ (auto-fail) ចំនួន ${t.fails}` });
  }
  if (Number(pwReq[0]?.pending) > 0) {
    notifications.push({ level: 'warn', text: `សំណើកំណត់ពាក្យសម្ងាត់ថ្មី ${pwReq[0].pending} រង់ចាំដំណើរការ` });
  }
  const inactive = users.filter(u => !u.active).length;
  if (inactive > 0) notifications.push({ level: 'info', text: `គណនីបិទ ${inactive}` });
  if (Number(t.this_month) === 0) {
    notifications.push({ level: 'info', text: 'មិនទាន់មានសវនកម្មណាមួយក្នុងខែនេះ' });
  }

  return Response.json({
    ok: true,
    month,
    me: { email: user.email, name: user.name, role: user.role },
    permissions: (await permissionMap())[user.role] || {},
    allPermissions: await permissionMap(),
    modules: MODULES,
    roles: ALL_ROLES,
    settings: await settingsMap(),
    stats: {
      totalUsers: users.length,
      activeUsers,
      newUsers,
      recentlyActive,
      totalStores: Number(stores[0]?.total || 0),
      totalInspections: Number(t.total || 0),
      thisMonth: Number(t.this_month || 0),
      avgPct: t.avg_pct,
      fails: Number(t.fails || 0),
      pendingPasswordRequests: Number(pwReq[0]?.pending || 0)
    },
    users, byStore, recent, activity, monthly, notifications
  });
}
