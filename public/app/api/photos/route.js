import { sql } from '../../../lib/db';
import { currentUser } from '../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PER_PHOTO = 900 * 1024;   // a 1400px JPEG lands far below this
const MAX_PER_SAVE = 40;

// Photos for one inspection, used by the history PDF / Word exports.
export async function GET(req) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('inspection_id') || '';
  if (!id) return Response.json({ ok: false, error: 'missing inspection_id' }, { status: 400 });

  const rows = await sql`SELECT item_id, file_name, data_url
                         FROM inspection_photos WHERE inspection_id = ${id}
                         ORDER BY id`;
  return Response.json({ ok: true, photos: rows });
}

// Replaces the stored set for this inspection, so re-saving stays consistent.
export async function POST(req) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let b;
  try { b = await req.json(); } catch (e) { return Response.json({ ok: false, error: 'bad json' }, { status: 400 }); }

  const id = String(b.inspection_id || '');
  if (!id) return Response.json({ ok: false, error: 'missing inspection_id' }, { status: 400 });

  const list = Array.isArray(b.photos) ? b.photos.slice(0, MAX_PER_SAVE) : [];
  const usable = list.filter(p => p && typeof p.dataUrl === 'string'
    && p.dataUrl.startsWith('data:image/')
    && p.dataUrl.length <= MAX_PER_PHOTO);

  await sql`DELETE FROM inspection_photos WHERE inspection_id = ${id}`;
  for (const p of usable) {
    await sql`INSERT INTO inspection_photos (inspection_id, item_id, file_name, data_url)
              VALUES (${id}, ${String(p.itemId || '')}, ${String(p.name || '')}, ${p.dataUrl})`;
  }

  return Response.json({ ok: true, saved: usable.length, skipped: list.length - usable.length });
}
