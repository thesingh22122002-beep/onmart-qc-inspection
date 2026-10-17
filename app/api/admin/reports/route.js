import { sql } from '../../../../lib/db';
import { requirePermission } from '../../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Store / QC / user performance over a date range, used for the on-screen
// report and as the source for the Excel, PDF and Word exports.
export async function GET(req) {
  const { error } = await requirePermission('reports', 'view');
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const store = searchParams.get('store') || '';
  const auditor = searchParams.get('auditor') || '';
  const q = '%' + (searchParams.get('q') || '').trim().toLowerCase() + '%';

  const [rows, byStore, byAuditor, byMonth, summary, stores, auditors] = await Promise.all([
    sql`SELECT id, store_label, inspect_date, month, shift, auditor_name, auditor_email,
               total_score, total_max, pct, band, auto_fail, updated_at,
               jsonb_array_length(COALESCE(faults,'[]'::jsonb)) AS fault_count
        FROM inspections
        WHERE deleted = false
          AND (${from} = '' OR inspect_date >= (${from})::date)
          AND (${to} = '' OR inspect_date <= (${to})::date)
          AND (${store} = '' OR store_label = ${store})
          AND (${auditor} = '' OR auditor_email = ${auditor})
          AND (lower(COALESCE(store_label,'')) LIKE ${q} OR lower(COALESCE(auditor_name,'')) LIKE ${q})
        ORDER BY inspect_date DESC, updated_at DESC LIMIT 1000`,

    sql`SELECT store_label, count(*) AS n, round(avg(pct)::numeric,1) AS avg_pct,
               min(pct) AS min_pct, max(pct) AS max_pct,
               sum(CASE WHEN auto_fail THEN 1 ELSE 0 END) AS fails
        FROM inspections
        WHERE deleted = false
          AND (${from} = '' OR inspect_date >= (${from})::date)
          AND (${to} = '' OR inspect_date <= (${to})::date)
          AND (${store} = '' OR store_label = ${store})
          AND (${auditor} = '' OR auditor_email = ${auditor})
          AND (lower(COALESCE(store_label,'')) LIKE ${q} OR lower(COALESCE(auditor_name,'')) LIKE ${q})
        GROUP BY store_label ORDER BY avg_pct DESC NULLS LAST`,

    sql`SELECT auditor_name, auditor_email, count(*) AS n, round(avg(pct)::numeric,1) AS avg_pct
        FROM inspections
        WHERE deleted = false
          AND (${from} = '' OR inspect_date >= (${from})::date)
          AND (${to} = '' OR inspect_date <= (${to})::date)
          AND (${store} = '' OR store_label = ${store})
          AND (${auditor} = '' OR auditor_email = ${auditor})
          AND (lower(COALESCE(store_label,'')) LIKE ${q} OR lower(COALESCE(auditor_name,'')) LIKE ${q})
        GROUP BY auditor_name, auditor_email ORDER BY n DESC`,

    sql`SELECT month, count(*) AS n, round(avg(pct)::numeric,1) AS avg_pct
        FROM inspections
        WHERE deleted = false AND month IS NOT NULL
          AND (${from} = '' OR inspect_date >= (${from})::date)
          AND (${to} = '' OR inspect_date <= (${to})::date)
          AND (${store} = '' OR store_label = ${store})
          AND (${auditor} = '' OR auditor_email = ${auditor})
          AND (lower(COALESCE(store_label,'')) LIKE ${q} OR lower(COALESCE(auditor_name,'')) LIKE ${q})
        GROUP BY month ORDER BY month`,

    sql`SELECT count(*) AS n, round(avg(pct)::numeric,1) AS avg_pct,
               sum(CASE WHEN auto_fail THEN 1 ELSE 0 END) AS fails,
               sum(total_score) AS score_sum, sum(total_max) AS max_sum
        FROM inspections
        WHERE deleted = false
          AND (${from} = '' OR inspect_date >= (${from})::date)
          AND (${to} = '' OR inspect_date <= (${to})::date)
          AND (${store} = '' OR store_label = ${store})
          AND (${auditor} = '' OR auditor_email = ${auditor})
          AND (lower(COALESCE(store_label,'')) LIKE ${q} OR lower(COALESCE(auditor_name,'')) LIKE ${q})`,

    sql`SELECT DISTINCT store_label FROM inspections WHERE deleted = false AND store_label <> '' ORDER BY store_label`,
    sql`SELECT DISTINCT auditor_email, auditor_name FROM inspections WHERE deleted = false AND auditor_email <> '' ORDER BY auditor_name`
  ]);

  return Response.json({
    ok: true,
    filters: { from, to, store, auditor },
    summary: summary[0] || {},
    rows, byStore, byAuditor, byMonth,
    options: { stores: stores.map(s => s.store_label), auditors }
  });
}
