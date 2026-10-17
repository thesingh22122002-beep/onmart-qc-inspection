import { sql } from '../../../../../lib/db';
import { requirePermission, logAction } from '../../../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE = 2 * 1024 * 1024;
const MAX_FILE = 4 * 1024 * 1024;

// Fetch one item in full, including the stored image / file payloads.
export async function GET(req, { params }) {
  const { error } = await requirePermission('content', 'view');
  if (error) return error;
  const id = parseInt(params.id, 10);
  const r = await sql`SELECT * FROM content_items WHERE id = ${id}`;
  if (!r[0]) return Response.json({ ok: false, error: 'រកមិនឃើញ' }, { status: 404 });
  return Response.json({ ok: true, item: r[0] });
}

export async function PATCH(req, { params }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return Response.json({ ok: false, error: 'bad id' }, { status: 400 });

  let b;
  try { b = await req.json(); } catch (e) { return Response.json({ ok: false, error: 'bad json' }, { status: 400 }); }

  // publish / unpublish is an approval, editing content is an edit
  const needed = (typeof b.published === 'boolean' && Object.keys(b).length === 1) ? 'approve' : 'edit';
  const { user, error } = await requirePermission('content', needed);
  if (error) return error;

  const prev = await sql`SELECT id, kind, title, body, published, pinned, category_id, file_name FROM content_items WHERE id = ${id}`;
  if (!prev[0]) return Response.json({ ok: false, error: 'រកមិនឃើញ' }, { status: 404 });

  if (b.image_data && String(b.image_data).length > MAX_IMAGE) {
    return Response.json({ ok: false, error: 'រូបភាពធំពេក (អតិបរមា ២MB)' }, { status: 413 });
  }
  if (b.file_data && String(b.file_data).length > MAX_FILE) {
    return Response.json({ ok: false, error: 'ឯកសារធំពេក (អតិបរមា ៤MB)' }, { status: 413 });
  }

  await sql`UPDATE content_items SET
      title       = COALESCE(${b.title === undefined ? null : String(b.title).trim()}, title),
      body        = COALESCE(${b.body === undefined ? null : String(b.body)}, body),
      category_id = COALESCE(${b.category_id === undefined ? null : (b.category_id ? Number(b.category_id) : null)}, category_id),
      published   = COALESCE(${b.published === undefined ? null : !!b.published}, published),
      pinned      = COALESCE(${b.pinned === undefined ? null : !!b.pinned}, pinned),
      image_data  = COALESCE(${b.image_data === undefined ? null : (b.image_data || null)}, image_data),
      file_name   = COALESCE(${b.file_name === undefined ? null : (b.file_name || null)}, file_name),
      file_data   = COALESCE(${b.file_data === undefined ? null : (b.file_data || null)}, file_data),
      updated_at  = now()
    WHERE id = ${id}`;

  if (b.clear_image) await sql`UPDATE content_items SET image_data = NULL, updated_at = now() WHERE id = ${id}`;
  if (b.clear_file) await sql`UPDATE content_items SET file_data = NULL, file_name = NULL, updated_at = now() WHERE id = ${id}`;

  const after = await sql`SELECT id, kind, title, body, published, pinned, category_id, file_name FROM content_items WHERE id = ${id}`;
  await logAction(req, user, {
    action: needed === 'approve' ? (b.published ? 'បោះពុម្ពផ្សាយមាតិកា' : 'ដកការផ្សាយមាតិកា') : 'កែប្រែមាតិកា',
    module: 'content', target: prev[0].title, before: prev[0], after: after[0]
  });

  return Response.json({ ok: true, item: after[0] });
}

export async function DELETE(req, { params }) {
  const { user, error } = await requirePermission('content', 'delete');
  if (error) return error;
  const id = parseInt(params.id, 10);
  const prev = await sql`SELECT id, kind, title, published FROM content_items WHERE id = ${id}`;
  if (!prev[0]) return Response.json({ ok: false, error: 'រកមិនឃើញ' }, { status: 404 });
  await sql`DELETE FROM content_items WHERE id = ${id}`;
  await logAction(req, user, { action: 'លុបមាតិកា', module: 'content', target: prev[0].title, before: prev[0] });
  return Response.json({ ok: true });
}
