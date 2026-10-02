import { NextResponse } from 'next/server';
import { verifySession, COOKIE, secret } from './lib/auth';

export const config = {
  matcher: ['/qc.html', '/app', '/admin']
};

export async function middleware(req) {
  const token = req.cookies.get(COOKIE)?.value;
  const s = await verifySession(token, secret());
  if (!s) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  if (req.nextUrl.pathname === '/admin' && !['super_admin','admin'].includes(s.role)) {
    const url = req.nextUrl.clone();
    url.pathname = '/app';
    url.search = '';
    return NextResponse.redirect(url);
  }
  if (req.nextUrl.pathname === '/app') {
    const url = req.nextUrl.clone();
    url.pathname = '/qc.html';
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}
