# ON MART QC — ប្រព័ន្ធត្រួតពិនិត្យគុណភាពហាង

ប្រព័ន្ធត្រួតពិនិត្យគុណភាពហាង ON MART ដែលដំណើរការលើគ្រប់ឧបករណ៍ — កុំព្យូទ័រ, ថេប្លេត, ទូរស័ព្ទ Android និង iPhone — ជាគេហទំព័រ និងជាកម្មវិធី (PWA) ដែលដំឡើងលើអេក្រង់ដើមបាន។

- ៣៥ ចំណុច ក្នុង ៧ សសរស្តម្ភ (៨០០ ពិន្ទុ) + STANDARDIZE ១០ ចំណុច (២០០ ពិន្ទុ) = **១០០០ ពិន្ទុ**
- ការវាយតម្លៃ ០–៥ និងរូបមន្តដើម
- នាំចេញ **PDF / Word / Excel** ជាភាសាខ្មែរ (ពុម្ពអក្សរខ្មែរបង្កប់ក្នុង PDF)
- **សមកាលកម្មឆ្លងឧបករណ៍** តាម Neon Postgres
- ដំណើរការ **ក្រៅបណ្ដាញ** រួចផ្ញើឡើងវិញពេលមានបណ្ដាញ

## Files

| File | Purpose |
|---|---|
| `server.js` | Node HTTP server — login, session cookie, JSON APIs, static files |
| `qc.html` | ទម្រង់ដើម (មិនប្ដូរ) + ស្រទាប់សមកាលកម្មបន្ថែមនៅចុងឯកសារ |
| `sw.js` | Service worker — offline shell |
| `manifest.webmanifest`, `icon-*.png` | PWA |
| `jspdf*.js`, `xlsx*.js`, `jszip*.js` | Export libraries, served locally — គ្មានការពឹងលើ CDN |

No build step and no subdirectories: `npm install && npm start`.

## Environment variables

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `SESSION_SECRET` | Long random string used to sign session cookies |
| `PORT` | Set automatically by the host |

## Sync model

`persistHistory()`, `loadHistory()` and `deleteHistoryEntry()` from the original template are wrapped, never replaced:

1. localStorage stays the source of truth on the device, so the app works with no signal.
2. Every save pushes to `POST /api/inspections`; every load, every tab focus and every 45s pulls from `GET /api/inspections`.
3. Merge is last-write-wins on `savedAt` / `updated_at`.
4. Deletes are soft (`deleted = true`) so other devices learn about them.
5. The full snapshot is stored in `inspections.payload` (JSONB) so a record round-trips unchanged, with reporting columns indexed alongside it.
