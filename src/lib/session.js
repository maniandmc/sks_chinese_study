/**
 * 설계 문서 5.3 / 5.4 — 세션.
 *
 * KV는 "이 세션 ID가 우리가 발급한 것인가"만 확인한다.
 * 권한·정지·세션 무효화 판단은 **매 요청 D1의 users 행**으로 한다.
 * (KV 쓰기 전파가 최대 60초 걸릴 수 있어 KV 삭제만으로는 즉시 폐기가 보장되지 않음 — 부록 A A-6)
 */

import { ApiError, unauthenticated } from './http.js';
import { toBase64, randomBytes } from './password.js';

export const COOKIE_NAME = 'ctb_session';
export const SESSION_TTL_SECONDS = 604800; // 7일 고정, 갱신 없음 (D-4)

function toBase64Url(bytes) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

export function sessionCookie(sessionId) {
  return `${COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearedCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

/** 로그인 성공 시 32바이트 랜덤 세션 ID 발급 */
export async function createSession(env, user) {
  const sessionId = toBase64Url(randomBytes(32));
  const record = {
    userId: user.id,
    sessionVersion: user.session_version,
    createdAt: new Date().toISOString(),
  };
  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(record), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return sessionId;
}

export async function destroySession(env, sessionId) {
  if (sessionId) await env.SESSIONS.delete(`session:${sessionId}`);
}

/** 그 사용자의 모든 세션을 D1 기준으로 즉시 무효화 (정지·비번 변경·재발급) */
export async function bumpSessionVersion(env, userId) {
  await env.DB.prepare('UPDATE users SET session_version = session_version + 1 WHERE id = ?')
    .bind(userId)
    .run();
}

/**
 * 5.4의 1~4단계. must_change_password(5단계)는 경로 허용 목록이 필요하므로
 * worker.js에서 처리한다.
 * @returns {{user: object, sessionId: string}}
 */
export async function authenticate(request, env) {
  const sessionId = parseCookies(request)[COOKIE_NAME];
  if (!sessionId) throw unauthenticated();

  const raw = await env.SESSIONS.get(`session:${sessionId}`);
  if (!raw) throw unauthenticated('세션이 만료되었습니다.');

  let record;
  try {
    record = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw unauthenticated('세션이 올바르지 않습니다.');
  }

  const user = await env.DB.prepare(
    `SELECT id, login_id, display_name, role, disabled_at, session_version, must_change_password
       FROM users WHERE id = ?`,
  ).bind(record.userId).first();

  if (!user) throw unauthenticated('세션이 올바르지 않습니다.');
  if (user.disabled_at != null) throw unauthenticated('정지된 계정입니다.');
  if (Number(user.session_version) !== Number(record.sessionVersion)) {
    throw unauthenticated('세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

  return { user, sessionId };
}

/** 5.4의 5단계 — 비번 변경 강제 상태에서 허용되는 경로 (8.2) */
const PASSWORD_CHANGE_ALLOWED = new Set([
  'GET /auth/me',
  'POST /auth/change-password',
  'POST /auth/logout',
]);

export function assertPasswordChangeGate(user, method, path) {
  if (!user.must_change_password) return;
  if (PASSWORD_CHANGE_ALLOWED.has(`${method} ${path}`)) return;
  throw new ApiError('PASSWORD_CHANGE_REQUIRED', '비밀번호를 먼저 변경해야 합니다.');
}
