import { neon } from '@neondatabase/serverless';

let _sql = null;

function client() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _sql = neon(url);
  }
  return _sql;
}

// Lazy tagged-template proxy: the connection is only created on first query,
// so `next build` can collect page data without a live database.
export function sql(strings, ...values) {
  return client()(strings, ...values);
}
