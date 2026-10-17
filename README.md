# ON MART QC — ប្រព័ន្ធត្រួតពិនិត្យគុណភាពហាង

ប្រព័ន្ធត្រួតពិនិត្យគុណភាពហាង ON MART ដែលដំណើរការលើគ្រប់ឧបករណ៍ — កុំព្យូទ័រ, ថេប្លេត, ទូរស័ព្ទ (Android / iPhone) — ជាគេហទំព័រ និងជាកម្មវិធី (PWA) ដែលអាចដំឡើងលើអេក្រង់ដើម។

## អ្វីដែលមាន

- **គំរូដើមទាំងស្រុង** — ៣៥ ចំណុច ក្នុង ៧ សសរស្តម្ភ (៨០០ ពិន្ទុ) + STANDARDIZE (២០០ ពិន្ទុ) = ១០០០ ពិន្ទុ
- **ការវាយតម្លៃ ០–៥** និងរូបមន្តដើម
- **នាំចេញ PDF / Word / Excel** ជាភាសាខ្មែរ (ពុម្ពអក្សរខ្មែរបង្កប់ក្នុង PDF)
- **សមកាលកម្មឆ្លងឧបករណ៍** — រក្សាទុកលើម៉ាស៊ីនមេ Neon Postgres
- **ដំណើរការក្រៅបណ្ដាញ** — រក្សាទុកក្នុងឧបករណ៍ រួចផ្ញើឡើងវិញពេលមានបណ្ដាញ

## Architecture

| Layer | What |
|---|---|
| `public/qc.html` | ទម្រង់ដើម (មិនប្ដូរ) + ស្រទាប់សមកាលកម្មបន្ថែមនៅចុងឯកសារ |
| `public/vendor/*` | jsPDF, jspdf-autotable, SheetJS, JSZip (local — គ្មានការពឹងលើ CDN) |
| `app/page.js` | ទំព័រចូលប្រើ |
| `app/api/*` | login / logout / me / stores / inspections (JSON) |
| `middleware.js` | ការពារ `/qc.html` និង `/app` ដោយ cookie HMAC |
| `lib/auth.js` | PBKDF2-SHA256 + HMAC session (Web Crypto only) |
| `public/sw.js` | Service worker — offline shell |

## Environment variables

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `SESSION_SECRET` | Long random string used to sign session cookies |

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the two values
npm run build && npm start
```

## Deploy

Deploy to Vercel as a Next.js project, with the two environment variables above set for Production, Preview and Development.

## Sync model

`persistHistory()`, `loadHistory()` and `deleteHistoryEntry()` from the original template are wrapped, never replaced:

1. localStorage stays the source of truth on the device (works with no signal).
2. Every save pushes to `POST /api/inspections`; every load and every 45s pulls from `GET /api/inspections`.
3. Merge is last-write-wins on `savedAt` / `updated_at`.
4. Deletes are soft (`deleted = true`) so other devices learn about them.
5. The full snapshot is stored in `inspections.payload` (JSONB) so a record round-trips byte-identical, with the reporting columns indexed alongside it.
