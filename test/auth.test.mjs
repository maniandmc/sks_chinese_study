/**
 * M2 완료 기준 — 5.4의 5단계 검사, 정지 즉시 401, 비번 변경 강제.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, createTestEnv, createUser, login, ORIGIN } from './harness/env.mjs';

async function setup() {
  const env = createTestEnv();
  const teacher = await createUser(env, { loginId: 'teacher1', role: 'teacher', password: 'teacherPass1' });
  const student = await createUser(env, {
    loginId: 'student1', role: 'student', password: 'tempPass123',
    createdBy: teacher.id, mustChangePassword: true,
  });
  return { env, teacher, student };
}

describe('M2 인증', () => {
  test('로그인 성공 시 HttpOnly·Secure·SameSite=Strict 쿠키가 내려온다 (5.3)', async () => {
    const { env, teacher } = await setup();
    const client = createClient(env);
    const res = await client.post('/auth/login', { loginId: 'teacher1', password: 'teacherPass1' });

    assert.equal(res.status, 200);
    assert.equal(res.body.role, 'teacher');
    const setCookie = res.res.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.match(setCookie, /Max-Age=604800/);
  });

  test('login_id는 대소문자를 구분하지 않는다 (5.1)', async () => {
    const { env } = await setup();
    const client = createClient(env);
    const res = await client.post('/auth/login', { loginId: 'TEACHER1', password: 'teacherPass1' });
    assert.equal(res.status, 200);
  });

  test('비밀번호 오류와 없는 계정은 같은 코드·메시지를 돌려준다 (5.5)', async () => {
    const { env } = await setup();
    const c = createClient(env);
    const wrong = await c.post('/auth/login', { loginId: 'teacher1', password: 'nope' });
    const missing = await c.post('/auth/login', { loginId: 'nobody', password: 'nope' });
    assert.equal(wrong.status, 401);
    assert.equal(missing.status, 401);
    assert.equal(wrong.body.error.message, missing.body.error.message);
  });

  test('5회 실패하면 15분 잠긴다 (5.5)', async () => {
    const { env } = await setup();
    const c = createClient(env);
    for (let i = 0; i < 5; i++) {
      const r = await c.post('/auth/login', { loginId: 'teacher1', password: 'nope' });
      assert.equal(r.status, 401);
    }
    // 잠긴 뒤에는 올바른 비밀번호도 통과하지 못한다
    const locked = await c.post('/auth/login', { loginId: 'teacher1', password: 'teacherPass1' });
    assert.equal(locked.status, 429);
    assert.equal(locked.code, 'RATE_LIMITED');

    const row = await env.DB.prepare('SELECT locked_until FROM users WHERE login_id = ?')
      .bind('teacher1').first();
    const minutes = (new Date(row.locked_until).getTime() - Date.now()) / 60000;
    assert.ok(minutes > 14 && minutes <= 15, `잠금 해제까지 약 15분이어야 함 (실제 ${minutes})`);
  });

  test('로그인 성공 시 실패 카운터가 초기화된다', async () => {
    const { env } = await setup();
    const c = createClient(env);
    await c.post('/auth/login', { loginId: 'teacher1', password: 'nope' });
    await c.post('/auth/login', { loginId: 'teacher1', password: 'teacherPass1' });
    const row = await env.DB.prepare('SELECT failed_login_count, locked_until FROM users WHERE login_id=?')
      .bind('teacher1').first();
    assert.equal(row.failed_login_count, 0);
    assert.equal(row.locked_until, null);
  });

  test('정지된 계정은 로그인할 수 없고, 기존 쿠키도 다음 요청부터 401이다 (5.4)', async () => {
    const { env, teacher, student } = await setup();
    const client = await login(env, { loginId: 'student1', password: 'tempPass123' });
    assert.equal((await client.get('/auth/me')).status, 200);

    await env.DB.prepare('UPDATE users SET disabled_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), student.id).run();

    const after = await client.get('/auth/me');
    assert.equal(after.status, 401, 'KV 세션이 남아 있어도 D1 조회로 즉시 차단');

    const fresh = createClient(env);
    const res = await fresh.post('/auth/login', { loginId: 'student1', password: 'tempPass123' });
    assert.equal(res.status, 401);
    assert.ok(teacher);
  });

  test('session_version이 오르면 다른 기기의 기존 세션이 무효화된다 (5.4)', async () => {
    const { env, teacher } = await setup();
    const deviceA = await login(env, { loginId: 'teacher1', password: 'teacherPass1' });
    const deviceB = await login(env, { loginId: 'teacher1', password: 'teacherPass1' });

    assert.equal((await deviceA.get('/auth/me')).status, 200);
    await env.DB.prepare('UPDATE users SET session_version = session_version + 1 WHERE id = ?')
      .bind(teacher.id).run();

    assert.equal((await deviceA.get('/auth/me')).status, 401);
    assert.equal((await deviceB.get('/auth/me')).status, 401);
  });

  test('must_change_password 상태에서는 허용 경로 외 전부 403이다 (5.4 5단계)', async () => {
    const { env } = await setup();
    const client = await login(env, { loginId: 'student1', password: 'tempPass123' });

    const me = await client.get('/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.mustChangePassword, true);

    const blocked = await client.get('/me/lessons');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.code, 'PASSWORD_CHANGE_REQUIRED');
  });

  test('비번 변경: 본인 세션은 유지되고 다른 기기 세션은 끊긴다 (5.6)', async () => {
    const { env } = await setup();
    const phone = await login(env, { loginId: 'student1', password: 'tempPass123' });
    const laptop = await login(env, { loginId: 'student1', password: 'tempPass123' });

    const changed = await laptop.post('/auth/change-password', {
      currentPassword: 'tempPass123', newPassword: 'newStrongPass1',
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.mustChangePassword, false);

    // 변경한 기기: 새 쿠키로 계속 사용 가능, 비번 변경 게이트도 풀림
    assert.equal((await laptop.get('/auth/me')).status, 200);
    assert.equal((await laptop.get('/me/lessons')).status, 200);
    // 다른 기기: session_version 증가로 무효
    assert.equal((await phone.get('/auth/me')).status, 401);

    // 새 비밀번호로만 로그인된다
    const c = createClient(env);
    assert.equal((await c.post('/auth/login', { loginId: 'student1', password: 'tempPass123' })).status, 401);
    assert.equal((await c.post('/auth/login', { loginId: 'student1', password: 'newStrongPass1' })).status, 200);
  });

  test('비번 변경은 현재 비번 확인·정책·직전 비번 재사용을 검사한다 (5.2)', async () => {
    const { env } = await setup();
    const client = await login(env, { loginId: 'student1', password: 'tempPass123' });

    const wrongCurrent = await client.post('/auth/change-password', {
      currentPassword: 'wrong', newPassword: 'newStrongPass1',
    });
    assert.equal(wrongCurrent.status, 400);

    const tooShort = await client.post('/auth/change-password', {
      currentPassword: 'tempPass123', newPassword: 'short',
    });
    assert.equal(tooShort.status, 400);

    const sameAsLoginId = await client.post('/auth/change-password', {
      currentPassword: 'tempPass123', newPassword: 'student1',
    });
    assert.equal(sameAsLoginId.status, 400);

    const reuse = await client.post('/auth/change-password', {
      currentPassword: 'tempPass123', newPassword: 'tempPass123',
    });
    assert.equal(reuse.status, 400);
  });

  test('로그아웃하면 세션이 KV에서 지워지고 쿠키가 만료된다', async () => {
    const { env } = await setup();
    const client = await login(env, { loginId: 'teacher1', password: 'teacherPass1' });
    const res = await client.post('/auth/logout');
    assert.equal(res.status, 204);
    assert.match(res.res.headers.get('set-cookie') ?? '', /Max-Age=0/);
    assert.equal(env.SESSIONS._store.size, 0);
  });

  test('쿠키 없이 보호 경로에 접근하면 401이다', async () => {
    const { env } = await setup();
    const c = createClient(env);
    assert.equal((await c.get('/auth/me')).status, 401);
    assert.equal((await c.get('/me/lessons')).status, 401);
  });

  test('상태 변경 요청은 Origin이 다르면 거부된다 (5.7)', async () => {
    const { env } = await setup();
    const c = createClient(env);
    const evil = await c.request('POST', '/auth/login', {
      body: { loginId: 'teacher1', password: 'teacherPass1' },
      origin: 'https://evil.example',
    });
    assert.equal(evil.status, 403);

    const missing = await c.request('POST', '/auth/login', {
      body: { loginId: 'teacher1', password: 'teacherPass1' },
      origin: null,
    });
    assert.equal(missing.status, 403);
  });

  test('JSON이 아닌 Content-Type은 거부된다 (5.7)', async () => {
    const { env } = await setup();
    const res = await (await import('../src/worker.js')).default.fetch(
      new Request(`${ORIGIN}/api/v1/auth/login`, {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'text/plain' },
        body: 'loginId=teacher1',
      }),
      env,
    );
    assert.equal(res.status, 400);
  });

  test('어떤 응답에도 비밀번호 관련 필드가 실리지 않는다 (12.1)', async () => {
    const { env } = await setup();
    const client = await login(env, { loginId: 'teacher1', password: 'teacherPass1' });
    const me = await client.get('/auth/me');
    const keys = Object.keys(me.body).join(',');
    assert.ok(!/password_hash|password_salt|passwordHash/i.test(JSON.stringify(me.body)), keys);
  });
});

describe('M2 로그아웃 후 세션 재사용', () => {
  test('로그아웃한 세션 ID를 다시 써도 401이다', async () => {
    const env = createTestEnv();
    await createUser(env, { loginId: 't', role: 'teacher', password: 'password123' });
    const client = await login(env, { loginId: 't', password: 'password123' });
    const stolen = client.cookie;
    await client.post('/auth/logout');

    const attacker = createClient(env);
    attacker.setCookie(stolen);
    assert.equal((await attacker.get('/auth/me')).status, 401);
  });
});
