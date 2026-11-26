import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = 'tt_v2_indep_session';
const MIN_SESSION_TOKEN_LENGTH = 16;

function sanitizeNextPath(pathname: string, search: string): string | null {
  if (!pathname || pathname === '/' || pathname === '/dashboard' || pathname === '/login') {
    return null;
  }
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.startsWith('/api')) {
    return null;
  }
  const combined = `${pathname}${search || ''}`;
  return combined.length <= 512 ? combined : pathname.slice(0, 512);
}

function buildLoginRedirectUrl(request: NextRequest, safeNext: string | null): URL {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host')?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const proto =
    forwardedProto === 'https' || forwardedProto === 'http'
      ? forwardedProto
      : request.nextUrl.protocol.replace(':', '');

  const target =
    host && !/^0\.0\.0\.0(?::\d+)?$/.test(host)
      ? new URL('/login', `${proto}://${host}`)
      : new URL('/login', request.nextUrl.origin);

  if (safeNext) {
    target.searchParams.set('next', safeNext);
  }
  return target;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === '/login') {
    return NextResponse.next();
  }

  const rawSessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim() || '';
  const hasSessionCookie =
    rawSessionToken.length >= MIN_SESSION_TOKEN_LENGTH && /^[\x21-\x7E]+$/.test(rawSessionToken);

  if (!hasSessionCookie) {
    const safeNext = sanitizeNextPath(pathname, search);
    const loginUrl = buildLoginRedirectUrl(request, safeNext);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|brand/|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|webp|gif|svg|ico|css|js|map|woff|woff2|ttf)$).*)',
  ],
};
