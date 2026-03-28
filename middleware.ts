export { auth as middleware } from '@/lib/auth';

export const config = {
  matcher: [
    // Protect all routes except auth pages, api/auth, and static files
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
