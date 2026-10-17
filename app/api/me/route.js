import { cookies } from 'next/headers';
import { verifySession, COOKIE, secret } from '../../../lib/auth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  const token = cookies().get(COOKIE)?.value;
  const s = await verifySession(token, secret());
  if (!s) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true, user: { email: s.email, name: s.name, role: s.role } });
}
