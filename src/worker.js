/**
 * Cloudflare Worker 엔트리 — 설계 문서 4장.
 *
 *   /api/v1/*  → 라우터 → (CSRF 검사) → 세션 미들웨어 → 권한 미들웨어 → 핸들러
 *   그 외      → 정적 파일(ASSETS)
 */

import { ApiError, errorResponse, json } from './lib/http.js';
import { Router } from './lib/router.js';
import { assertPasswordChangeGate, authenticate } from './lib/session.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerLessonRoutes } from './routes/lessons.js';

const API_PREFIX = '/api/v1';

/** 로그인 없이 호출할 수 있는 경로 (8.2) */
const PUBLIC_ROUTES = new Set(['POST /auth/login']);

const router = new Router();
registerAuthRoutes(router);
registerLessonRoutes(router);

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 5.7 — SameSite=Strict + 같은 도메인에 더해 Origin 헤더를 검사한다 */
function assertSameOrigin(request) {
  if (!STATE_CHANGING.has(request.method)) return;
  const origin = request.headers.get('origin');
  if (!origin) {
    throw new ApiError('FORBIDDEN', 'Origin 헤더가 필요합니다.');
  }
  const expected = new URL(request.url).origin;
  if (origin !== expected) {
    throw new ApiError('FORBIDDEN', '허용되지 않은 Origin입니다.');
  }
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'content-security-policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function handleApi(request, env, url) {
  const path = url.pathname.slice(API_PREFIX.length) || '/';
  const method = request.method;

  const matched = router.match(method, path);
  if (!matched) throw new ApiError('NOT_FOUND', '존재하지 않는 엔드포인트입니다.');
  if (matched.methodNotAllowed) throw new ApiError('VALIDATION', '허용되지 않은 메서드입니다.');

  assertSameOrigin(request);

  const ctx = { request, env, url, params: matched.params, path, method, user: null, sessionId: null };

  if (!PUBLIC_ROUTES.has(`${method} ${path}`)) {
    const { user, sessionId } = await authenticate(request, env);
    assertPasswordChangeGate(user, method, path);
    ctx.user = user;
    ctx.sessionId = sessionId;
  }

  return matched.handler(ctx);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === API_PREFIX || url.pathname.startsWith(API_PREFIX + '/')) {
      try {
        return withSecurityHeaders(await handleApi(request, env, url));
      } catch (err) {
        if (!(err instanceof ApiError)) console.error('unhandled', err && err.stack);
        return withSecurityHeaders(errorResponse(err));
      }
    }

    if (env.ASSETS) {
      return withSecurityHeaders(await env.ASSETS.fetch(request));
    }
    return json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
  },
};
