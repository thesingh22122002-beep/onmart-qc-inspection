import { sql } from '../../../../lib/db';
import { requirePermission, logAction } from '../../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = ['announcement', 'training', 'document'];
const MAX_IMAGE = 2 * 1024 * 1024;   // ~2MB as a data URL
const MAX_FILE = 4 * 1024 * 1024;

export async function GET(req) {
  const { error } = await requirePermission('content', 'view');
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get('kind') || '';
  const q = '%' + (searchParams.get('q') || '').trim().toLowerCase() + '%';
  const status = searchParams.get('status') || '';
  const cat = searchParams.get('category') || '';

  const items = await sql`
    SELECT c.id, c.kind, c.category_id, c.title, c.body, c.file_name, c.published, c.pinned,
           c.created_by, c.created_at, c.updated_at,
           (c.image_data IS NOT NULL) AS has_image,
           (c.file_data IS NOT NULL) AS has_file,
           cat.name AS category_name
    FROM content_items c
    LEFT JOIN content_categories cat ON cat.id = c.category_id
    WHERE (${kind} = '' OR c.kind = ${kind})
      AND (${cat} = '' OR c.category_id = NULLIF(${cat}, '')::int)
      AND (${status} = '' OR (${status} = 'published' AND c.published = true) OR (${status} = 'draft' AND c.published = false))
      AND (lower(c.title) LIKE ${q} OR lower(COALESCE(c.body,'')) LIKE ${q})
    ORDER BY c.pinned DESC, c.updated_at DESC LIMIT 300`;

  const categories = await sql`SELECT id, name, kind, sort_order FROM content_categories ORDER BY sort_order, name`;
  return Response.json({ ok: true, items, categories });
}

export async function POST(req) {
  const { user, error } = await requirePermission('content', 'create');
  if (error) return error;

  let b;
  try { b = await req.json(); } catch (e) { return Response.json({ ok: false, error: 'bad json' }, { status: 400 }); }

  if (b.category) {
    const name = String(b.category).trim();
    if (!name) return Response.json({ ok: false, error: 'សូមបញ្ចូលឈ្មោះប្រភេទ' }, { status: 400 });
    const r = await sql`INSERT INTO content_categories (name, kind, sort_order)
                        VALUES (${name}, ${KINDS.includes(b.kind) ? b.kind : 'all'}, ${Number(b.sort_order) || 0})
                        RETURNING id, name, kind`;
    await logAction(req, user, { action: 'បង្កើតប្រភេទមាតិកា', module: 'content', target: name, after: r[0] });
    return Response.json({ ok: true, category: r[0] });
  }

  const kind = KINDS.includes(b.kind) ? b.kind : 'announcement';
  const title = String(b.title || '').trim();
  if (!title) return Response.json({ ok: false, error: 'សូមបញ្ចូលចំណងជើង' }, { status: 400 });

  const image = b.image_data ? String(b.image_data) : null;
  const file = b.file_data ? String(b.file_data) : null;
  if (image && image.length > MAX_IMAGE) return Response.json({ ok: false, error: 'រូបភាពធំពេក (អតិបរមា ២MB)' }, { status: 413 });
  if (file && file.length > MAX_FILE) return Response.json({ ok: false, error: 'ឯកសារធំពេក (អតិបរមា ៤MB)' }, { status: 413 });

  const rows = await sql`INSERT INTO content_items
      (kind, category_id, title, body, image_data, file_name, file_data, published, pinned, created_by)
      VALUES (${kind}, ${b.category_id ? Number(b.category_id) : null}, ${title}, ${b.body || ''},
              ${image}, ${b.file_name || null}, ${file}, ${!!b.published}, ${!!b.pinned}, ${user.email})
      RETURNING id, kind, title, published, pinned`;

  await logAction(req, user, { action: 'បង្កើតមាតិកា', module: 'content', target: title, after: rows[0] });
  return Response.json({ ok: true, item: rows[0] });
}
