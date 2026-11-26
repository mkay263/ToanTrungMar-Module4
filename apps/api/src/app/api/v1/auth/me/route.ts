import { APP_CONFIG } from '../../../../../core/config';
import { resolveSessionFromToken } from '../../../../../core/auth/service';
import { jsonSuccess } from '../../../../../core/http';
import {
  extractSessionTokenFromRequest,
  requireAuthenticatedSession,
} from '../../../../../core/permissions';

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('optional') === '1') {
    const rawToken = extractSessionTokenFromRequest(req);
    const resolved = await resolveSessionFromToken(rawToken);
    const response = jsonSuccess({
      user: resolved?.user ?? null,
      authenticated: Boolean(resolved?.user),
    });
    if (rawToken && !resolved) {
      const isHttps =
        req.headers.get('x-forwarded-proto') === 'https' || req.url.startsWith('https://');
      response.cookies.set(APP_CONFIG.sessionCookieName, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: isHttps,
        path: '/',
        maxAge: 0,
      });
    }
    return response;
  }

  const auth = await requireAuthenticatedSession(req, { requireCsrf: false });
  if (!auth.ok) return auth.response;

  return jsonSuccess({ user: auth.user });
}

