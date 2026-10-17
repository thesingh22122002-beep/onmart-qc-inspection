import { cookies } from 'next/headers';
import { verifySession, COOKIE, secret } from './auth';

export async function currentUser() {
  const token = cookies().get(COOKIE)?.value;
  return await verifySession(token, secret());
}
