/**
 * 설계 문서 8.1 — 공통 응답 규약.
 * 오류 형태: { "error": { "code": "FORBIDDEN", "message": "…" } }
 */

export const CODES = {
  UNAUTHENTICATED: 401,
  PASSWORD_CHANGE_REQUIRED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
};

export class ApiError extends Error {
  constructor(code, message, extra) {
    super(message || code);
    this.code = code;
    this.status = CODES[code] ?? 500;
    this.extra = extra || null;
  }
}

/** 읽기 권한이 없는 리소스는 존재 여부를 숨기기 위해 404 (7.3) */
export const notFound = (msg = '대상을 찾을 수 없습니다.') => new ApiError('NOT_FOUND', msg);
export const forbidden = (msg = '권한이 없습니다.') => new ApiError('FORBIDDEN', msg);
export const unauthenticated = (msg = '로그인이 필요합니다.') => new ApiError('UNAUTHENTICATED', msg);
export const validation = (msg = '요청 값이 올바르지 않습니다.') => new ApiError('VALIDATION', msg);
export const conflict = (msg = '이미 존재합니다.') => new ApiError('CONFLICT', msg);

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...BASE_HEADERS, ...extraHeaders },
  });
}

export function noContent(extraHeaders = {}) {
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store', ...extraHeaders } });
}

export function errorResponse(err) {
  if (err instanceof ApiError) {
    const body = { error: { code: err.code, message: err.message } };
    if (err.extra) body.error.details = err.extra;
    return json(body, err.status);
  }
  // 예기치 못한 오류는 내부 정보를 노출하지 않는다 (12.1)
  return json({ error: { code: 'INTERNAL', message: '서버 오류가 발생했습니다.' } }, 500);
}

const MAX_BODY_BYTES = 1024 * 1024; // 12.2 — 요청 본문 1MB

/** JSON 본문 파싱: Content-Type 강제(5.7 CSRF 방어의 일부) + 크기 제한 */
export async function readJson(request) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) {
    throw validation('Content-Type은 application/json이어야 합니다.');
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw validation('요청 본문이 너무 큽니다.');
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw validation('본문은 JSON 객체여야 합니다.');
    }
    return parsed;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw validation('JSON 형식이 올바르지 않습니다.');
  }
}
