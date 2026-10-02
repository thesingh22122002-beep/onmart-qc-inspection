import { sql } from '../../../lib/db';
import { currentUser } from '../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

export async function GET(req) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const since = searchParams.get('since');

  const rows = since
    ? await sql`SELECT id, payload, deleted, updated_at FROM inspections
                WHERE updated_at > ${since} ORDER BY updated_at ASC LIMIT 2000`
    : await sql`SELECT id, payload, deleted, updated_at FROM inspections
                ORDER BY updated_at ASC LIMIT 2000`;

  const now = new Date().toISOString();
  return Response.json({
    ok: true,
    serverTime: now,
    items: rows.map(r => ({
      id: r.id,
      deleted: r.deleted,
      updatedAt: r.updated_at,
      snapshot: r.payload
    }))
  });
}

export async function POST(req) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body;
  try { body = await req.json(); } catch (e) { return Response.json({ ok: false, error: 'bad json' }, { status: 400 }); }

  const list = Array.isArray(body.items) ? body.items : (body.snapshot ? [body.snapshot] : []);
  if (!list.length) return Response.json({ ok: false, error: 'no items' }, { status: 400 });

  const saved = [];
  for (const s of list) {
    if (!s || !s.id) continue;
    const r = await sql`
      INSERT INTO inspections (
        id, store_code, store_label, inspect_date, month, shift,
        auditor_email, auditor_name, area_manager, contact,
        total_score, total_max, pct, band, auto_fail,
        pillar_rows, ratings, notes, zt, faults, payload,
        device_id, deleted, created_at, updated_at
      ) VALUES (
        ${String(s.id)}, ${s.storeCode || s.store || ''}, ${s.store || ''},
        ${s.date || null}, ${s.month || (s.date ? String(s.date).slice(0, 7) : null)}, ${s.shift || ''},
        ${user.email}, ${s.auditor || user.name || ''}, ${s.areamgr || ''}, ${s.contact || ''},
        ${num(s.totalScore)}, ${num(s.totalMax)}, ${num(s.pct)}, ${s.band || ''}, ${!!s.autoFail},
        ${JSON.stringify(s.pillarRows || [])}::jsonb, ${JSON.stringify(s.ratings || {})}::jsonb,
        ${JSON.stringify(s.notes || {})}::jsonb, ${JSON.stringify(s.zt || {})}::jsonb,
        ${JSON.stringify(s.faults || [])}::jsonb, ${JSON.stringify(s)}::jsonb,
        ${String(body.deviceId || '')}, false, now(), now()
      )
      ON CONFLICT (id) DO UPDATE SET
        store_code = EXCLUDED.store_code,
        store_label = EXCLUDED.store_label,
        inspect_date = EXCLUDED.inspect_date,
        month = EXCLUDED.month,
        shift = EXCLUDED.shift,
        auditor_email = EXCLUDED.auditor_email,
        auditor_name = EXCLUDED.auditor_name,
        area_manager = EXCLUDED.area_manager,
        contact = EXCLUDED.contact,
        total_score = EXCLUDED.total_score,
        total_max = EXCLUDED.total_max,
        pct = EXCLUDED.pct,
        band = EXCLUDED.band,
        auto_fail = EXCLUDED.auto_fail,
        pillar_rows = EXCLUDED.pillar_rows,
        ratings = EXCLUDED.ratings,
        notes = EXCLUDED.notes,
        zt = EXCLUDED.zt,
        faults = EXCLUDED.faults,
        payload = EXCLUDED.payload,
        device_id = EXCLUDED.device_id,
        deleted = false,
        updated_at = now(),
        version = inspections.version + 1
      RETURNING id, updated_at`;
    if (r[0]) saved.push({ id: r[0].id, updatedAt: r[0].updated_at });
  }

  return Response.json({ ok: true, saved, serverTime: new Date().toISOString() });
}
