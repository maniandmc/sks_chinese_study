/**
 * 설계 문서 8.2 — /auth/*  (M2)
 */

import { ApiError, json, noContent, readJson, unauthenticated, validation } from '../lib/http.js';
import {
  DEFAULT_ITERS,
  createPasswordFields,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from '../lib/password.js';
import { clearedCookie, createSession, destroySession, sessionCookie } from '../lib/session.js';

const MAX_FAILED_ATTEMPTS = 5;     // 5.5
const LOCK_MINUTES = 15;

// 존재하지 않는 계정에서도 같은 시간이 걸리도록 쓰는 더미 salt (5.5)
const DUMMY_SALT = 'AAAAAAAAAAAAAAAAAAAAAA==';

function publicUser(user) {
  return {
    id: user.id,
    loginId: user.login_id,
    role: user.role,
    displayName: user.display_name,
    mustChangePassword: !!user.must_change_password,
  };
}

async function findByLoginId(env, loginId) {
  // login_id 컬럼은 COLLATE NOCASE — 대소문자 무시 조회 (5.1)
  return env.DB.prepare('SELECT * FROM users WHERE login_id = ?').bind(loginId).first();
}

export async function login(ctx) {
  const { env, request } = ctx;
  const body = await readJson(request);
  const loginId = typeof body.loginId === 'string' ? body.loginId.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!loginId || !password) throw validation('로그인 ID와 비밀번호를 입력해 주세요.');

  const user = await findByLoginId(env, loginId);

  // 계정 존재 여부를 응답 시간·메시지로 구분할 수 없게 한다 (5.5 / 12.1)
  const genericFailure = () => unauthenticated('로그인 ID 또는 비밀번호가 올바르지 않습니다.');

  if (!user) {
    await hashPassword(password, DUMMY_SALT, DEFAULT_ITERS);
    throw genericFailure();
  }

  const now = Date.now();
  if (user.locked_until && new Date(user.locked_until).getTime() > now) {
    throw new ApiError(
      'RATE_LIMITED',
      `로그인 시도가 너무 많습니다. ${LOCK_MINUTES}분 후 다시 시도해 주세요.`,
    );
  }

  const ok = await verifyPassword(password, user);

  if (!ok) {
    const failed = Number(user.failed_login_count) + 1;
    const lockedUntil =
      failed >= MAX_FAILED_ATTEMPTS ? new Date(now + LOCK_MINUTES * 60_000).toISOString() : null;
    await env.DB.prepare(
      'UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?',
    ).bind(failed >= MAX_FAILED_ATTEMPTS ? 0 : failed, lockedUntil, user.id).run();
    throw genericFailure();
  }

  // 정지 계정은 비밀번호가 맞아도 들어올 수 없다. 메시지는 구분하지 않는다.
  if (user.disabled_at != null) throw genericFailure();

  await env.DB.prepare(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?',
  ).bind(user.id).run();

  const sessionId = await createSession(env, user);
  return json(publicUser(user), 200, { 'set-cookie': sessionCookie(sessionId) });
}

export async function logout(ctx) {
  await destroySession(ctx.env, ctx.sessionId);
  return noContent({ 'set-cookie': clearedCookie() });
}

export async function me(ctx) {
  return json(publicUser(ctx.user));
}

export async function changePassword(ctx) {
  const { env, request, user, sessionId } = ctx;
  const body = await readJson(request);
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  const full = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  if (!full) throw unauthenticated();

  if (!(await verifyPassword(currentPassword, full))) {
    throw validation('현재 비밀번호가 올바르지 않습니다.');
  }
  const policyError = validatePasswordPolicy(newPassword, full.login_id);
  if (policyError) throw validation(policyError);
  if (await verifyPassword(newPassword, full)) {
    throw validation('이전과 다른 비밀번호를 사용해 주세요.');
  }

  const fields = await createPasswordFields(newPassword);
  await env.DB.prepare(
    `UPDATE users
        SET password_hash = ?, password_salt = ?, password_iters = ?,
            must_change_password = 0,
            session_version = session_version + 1,
            failed_login_count = 0, locked_until = NULL
      WHERE id = ?`,
  ).bind(fields.password_hash, fields.password_salt, fields.password_iters, full.id).run();

  // session_version을 올렸으므로 다른 기기의 세션은 전부 무효가 된다 (5.4).
  // 본인 세션만 재발급해 로그인 상태를 유지한다 (5.6).
  await destroySession(env, sessionId);
  const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(full.id).first();
  const newSessionId = await createSession(env, updated);

  return json(publicUser(updated), 200, { 'set-cookie': sessionCookie(newSessionId) });
}

export function registerAuthRoutes(router) {
  router.post('/auth/login', login);
  router.post('/auth/logout', logout);
  router.get('/auth/me', me);
  router.post('/auth/change-password', changePassword);
}
