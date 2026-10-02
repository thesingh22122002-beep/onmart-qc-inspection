import { sql } from '../../../../lib/db';
import { requirePermission, logAction, settingsMap } from '../../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Only these keys may be written from the settings screen.
const ALLOWED = new Set([
  'signup_code', 'signup_open',
  'company_name', 'company_tagline', 'company_contact',
  'notify_on_autofail', 'notify_on_new_user',
  'security_min_password', 'security_session_days'
]);

export async function GET() {
  const { error } = await requirePermission('settings', 'view');
  if (error) return error;
  return Response.json({ ok: true, settings: await settingsMap() });
}

export async function PATCH(req) {
  const { user, error } = await requirePermission('settings', 'edit');
  if (error) return error;

  let b;
  try { b = await req.json(); } catch (e) { return Response.json({ ok: false, error: 'bad json' }, { status: 400 }); }

  const before = await settingsMap();
  const written = {};

  for (const [key, raw] of Object.entries(b)) {
    if (!ALLOWED.has(key)) continue;
    let value = typeof raw === 'boolean' ? (raw ? 'true' : 'false') : String(raw).trim();
    if (key === 'signup_code' && value.length < 4) {
      return Response.json({ ok: false, error: 'លេខកូដត្រូវមានយ៉ាងតិច ៤ តួ' }, { status: 400 });
    }
    if (key === 'security_min_password') {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n) || n < 8 || n > 64) {
        return Response.json({ ok: false, error: 'ប្រវែងពាក្យសម្ងាត់ត្រូវនៅចន្លោះ ៨ និង ៦៤' }, { status: 400 });
      }
      value = String(n);
    }
    await sql`INSERT INTO app_settings (key, value, updated_at) VALUES (${key}, ${value}, now())
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
    written[key] = value;
  }

  if (Object.keys(written).length) {
    await logAction(req, user, {
      action: 'ប្ដូរការកំណត់ប្រព័ន្ធ', module: 'settings',
      target: Object.keys(written).join(', '),
      before: Object.fromEntries(Object.keys(written).map(k => [k, before[k]])),
      after: written
    });
  }

  return Response.json({ ok: true, settings: await settingsMap() });
}
