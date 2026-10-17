import { sql } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// No mail service is connected, so a reset is a request an admin approves
// from the admin area. The reply is identical whether or not the address
// exists, so this cannot be used to discover accounts.
export async function POST(req) {
  let b;
  try { b = await req.json(); } catch (e) { b = {}; }
  const email = String(b.email || '').trim().toLowerCase();
  const generic = { ok: true, message: 'បើអ៊ីមែលនេះមានក្នុងប្រព័ន្ធ សំណើត្រូវបានផ្ញើទៅអ្នកគ្រប់គ្រង។ សូមទាក់ទងអ្នកគ្រប់គ្រងដើម្បីទទួលពាក្យសម្ងាត់ថ្មី។' };

  if (!email) return Response.json({ ok: false, error: 'សូមបញ្ចូលអ៊ីមែល' }, { status: 400 });

  try {
    const found = await sql`SELECT id FROM auditors WHERE lower(email) = ${email} LIMIT 1`;
    if (found.length) {
      const open = await sql`SELECT id FROM password_requests WHERE lower(email) = ${email} AND status = 'pending' LIMIT 1`;
      if (!open.length) {
        await sql`INSERT INTO password_requests (email, status) VALUES (${email}, 'pending')`;
      }
    }
  } catch (e) { /* fall through to the same generic reply */ }

  return Response.json(generic);
}
