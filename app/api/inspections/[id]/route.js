import { sql } from '../../../../lib/db';
import { currentUser } from '../../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Soft delete so every other device learns the record is gone.
export async function DELETE(_req, { params }) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const id = String(params.id || '');
  if (!id) return Response.json({ ok: false, error: 'missing id' }, { status: 400 });

  await sql`UPDATE inspections SET deleted = true, updated_at = now(), version = version + 1 WHERE id = ${id}`;
  return Response.json({ ok: true, id, serverTime: new Date().toISOString() });
}
