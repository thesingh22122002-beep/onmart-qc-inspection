import { sql } from '../../../lib/db';
import { currentUser } from '../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const rows = await sql`SELECT code, name FROM stores WHERE active = true ORDER BY code`;
  return Response.json({ ok: true, stores: rows });
}
