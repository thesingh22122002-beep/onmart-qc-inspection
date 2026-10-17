import { sql } from '../../../lib/db';
import { currentUser, guard, audit, json } from '../../../lib/guard';
import * as admin from '../../../lib/admin';
import { recordVersion, bumpRevision } from '../../../lib/versioning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ *
 * English ⇄ Khmer glossary for the QC system.
 *
 * This is a controlled terminology list, not machine translation. The
 * point is that one English term always maps to the same Khmer wording
 * across inspections, reports and exports — "Chiller" must not be three
 * different Khmer phrases in three different reports.
 *
 * Stored as one JSON document in app_settings, versioned like every
 * other master record.
 * ------------------------------------------------------------------ */

const KEY = 'glossary_en_km';
const MAX_TERMS = 2000;
const MAX_LEN = 300;

/* Seeded from the terminology already used across the system, so the
 * list is useful on first open rather than empty. */
const SEED = [
  { en: 'Service', km: 'សេវាកម្ម', cat: 'Pillar' },
  { en: 'Show', km: 'ការបង្ហាញ', cat: 'Pillar' },
  { en: 'Supply', km: 'ការផ្គត់ផ្គង់', cat: 'Pillar' },
  { en: 'Save', km: 'ការសន្សំ', cat: 'Pillar' },
  { en: 'Secure', km: 'សុវត្ថិភាព', cat: 'Pillar' },
  { en: 'Sanitize', km: 'អនាម័យ', cat: 'Pillar' },
  { en: 'Operation Compliance', km: 'ការអនុលោមប្រតិបត្តិការ', cat: 'Pillar' },
  { en: 'Standardize', km: 'ស្តង់ដារ', cat: 'Pillar' },
  { en: 'Store', km: 'ហាង', cat: 'General' },
  { en: 'Inspector', km: 'អ្នកសវនកម្ម', cat: 'General' },
  { en: 'Inspection', km: 'ការត្រួតពិនិត្យ', cat: 'General' },
  { en: 'Date', km: 'កាលបរិច្ឆេទ', cat: 'General' },
  { en: 'Shift', km: 'វេន', cat: 'General' },
  { en: 'Score', km: 'ពិន្ទុ', cat: 'General' },
  { en: 'Total Score', km: 'ពិន្ទុសរុប', cat: 'General' },
  { en: 'Pass', km: 'ជាប់', cat: 'Result' },
  { en: 'Fail', km: 'បរាជ័យ', cat: 'Result' },
  { en: 'Good', km: 'ល្អ', cat: 'Result' },
  { en: 'Improve', km: 'ត្រូវកែលម្អ', cat: 'Result' },
  { en: 'Not Applicable', km: 'មិនពាក់ព័ន្ធ', cat: 'Result' },
  { en: 'Branch Manager', km: 'អ្នកគ្រប់គ្រងសាខា', cat: 'Role' },
  { en: 'Store Supervisor', km: 'អ្នកគ្រប់គ្រងហាង', cat: 'Role' },
  { en: 'Store Crew', km: 'បុគ្គលិកហាង', cat: 'Role' },
  { en: 'Corrective Action', km: 'វិធានការកែតម្រូវ', cat: 'Quality' },
  { en: 'Root Cause', km: 'មូលហេតុចម្បង', cat: 'Quality' },
  { en: 'Standard', km: 'ស្តង់ដារ', cat: 'Quality' },
  { en: 'Specification', km: 'លក្ខណៈបច្ចេកទេស', cat: 'Quality' },
  { en: 'Frequency', km: 'ភាពញឹកញាប់', cat: 'Quality' },
  { en: 'Expiry Date', km: 'ថ្ងៃផុតកំណត់', cat: 'Quality' },
  { en: 'Temperature', km: 'សីតុណ្ហភាព', cat: 'Quality' },
  { en: 'Chiller', km: 'ទូត្រជាក់', cat: 'Equipment' },
  { en: 'Freezer', km: 'ទូកកកាំង', cat: 'Equipment' },
  { en: 'Shelf', km: 'ធ្នើរ', cat: 'Equipment' },
  { en: 'Cashier', km: 'អ្នកគិតលុយ', cat: 'Equipment' },
  { en: 'Remark', km: 'កំណត់សម្គាល់', cat: 'General' },
  { en: 'Evidence Photo', km: 'រូបភាពភស្តុតាង', cat: 'General' },
];

async function readGlossary() {
  const rows = await sql`select value from app_settings where key = ${KEY}`;
  if (!rows[0]) return null;
  try {
    const v = JSON.parse(rows[0].value);
    return Array.isArray(v) ? v : null;
  } catch (_) {
    return null;
  }
}

function clean(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const en = String(raw?.en ?? '').trim();
    const km = String(raw?.km ?? '').trim();
    const cat = String(raw?.cat ?? '').trim().slice(0, 60);
    if (!en || !km) continue;
    if (en.length > MAX_LEN || km.length > MAX_LEN) continue;
    const k = en.toLowerCase();
    if (seen.has(k)) continue;        // one Khmer wording per English term
    seen.add(k);
    out.push({ en, km, cat: cat || 'General' });
    if (out.length >= MAX_TERMS) break;
  }
  out.sort((a, b) => a.en.localeCompare(b.en));
  return out;
}

/* GET — the glossary, seeding it on first use. */
export async function GET(req) {
  const user = await currentUser();
  if (!user) return json({ error: 'សូមចូលប្រើម្ដងទៀត / Please sign in again' }, 401);

  let canEdit = false;
  try {
    canEdit = await admin.can(user.role, 'masterdata', 'edit');
  } catch (_) {
    canEdit = false;
  }

  try {
    let terms = await readGlossary();
    if (!terms) {
      terms = clean(SEED);
      // Seed without failing the read if the write is refused.
      try {
        await sql`insert into app_settings (key, value, updated_at, updated_by, version)
                  values (${KEY}, ${JSON.stringify(terms)}, now(), ${user.email || null}, 1)
                  on conflict (key) do nothing`;
      } catch (_) { /* a read-only user still gets the seeded list */ }
    }
    return json({ terms, canEdit, count: terms.length });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

/* PUT — replace the whole glossary. Versioned, never destructive. */
export async function PUT(req) {
  const g = await guard(req, 'masterdata', 'edit');
  if (g.error) return g.error;
  const user = g.user;

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'Invalid request body' }, 400);
  }

  const terms = clean(body.terms);
  if (terms.length === 0) {
    return json({
      error: 'បញ្ជីពាក្យទទេ — ការរក្សាទុកត្រូវបានបញ្ឈប់ដើម្បីការពារទិន្នន័យ',
      errorEn: 'The glossary is empty. Save was stopped to protect your existing data.',
    }, 422);
  }

  try {
    const before = await readGlossary();
    await sql`insert into app_settings (key, value, updated_at, updated_by, version)
              values (${KEY}, ${JSON.stringify(terms)}, now(), ${user.email || null}, 1)
              on conflict (key) do update
                set value = excluded.value, updated_at = now(),
                    updated_by = ${user.email || null},
                    version = app_settings.version + 1`;
    await recordVersion('setting', KEY, { key: KEY, count: terms.length },
      user, 'Glossary saved from Settings page', user);
    await bumpRevision();
    await audit(req, user, {
      action: 'save_glossary', module: 'masterdata', target: 'setting:' + KEY,
      before: { count: before ? before.length : 0 },
      after: { count: terms.length },
    });
    return json({
      ok: true, count: terms.length,
      savedAt: new Date().toISOString(),
      savedBy: user.name || user.email,
    });
  } catch (e) {
    return json({
      error: 'Save Failed',
      message: 'Your previous data is still safe. No changes were applied.',
      messageKm: 'ទិន្នន័យមុនរបស់អ្នកនៅតែមានសុវត្ថិភាព។ គ្មានការផ្លាស់ប្ដូរណាត្រូវបានអនុវត្តទេ។',
      detail: String(e.message || e),
    }, 500);
  }
}
