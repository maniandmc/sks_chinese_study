/**
 * M3 완료 기준 — 14.2 권한 테스트 매트릭스를 자동 테스트로 고정한다.
 *
 * 행위자: 교사A(클래스A 소유), 교사B(타 교사), 학생M(가입), 학생N(미가입), 비로그인, 정지 학생
 *
 * 표기: 매트릭스의 ✅는 "권한 게이트를 통과했다"는 뜻이다.
 * 쓰기 핸들러 본체는 M4/M5에서 채우므로, 게이트를 통과한 쓰기 요청은 지금 501을 돌려준다.
 * → 아래 GATE_PASSED 상수를 M4/M5에서 200/201/204로 바꾸면 그대로 회귀 테스트가 된다.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMember, addSentence, createClass, createClient, createLesson, createTestEnv, createUser, login,
} from './harness/env.mjs';

const GATE_PASSED = 501; // NOT_IMPLEMENTED — 권한 검사는 통과했다는 뜻

let env, teacherA, teacherB, studentM, studentN, disabled, classA, classLesson, personalLesson, sentence;
let asTeacherA, asTeacherB, asStudentM, asStudentN, anonymous, asDisabled;

beforeEach(async () => {
  env = createTestEnv();
  teacherA = await createUser(env, { loginId: 'teacherA', role: 'teacher' });
  teacherB = await createUser(env, { loginId: 'teacherB', role: 'teacher' });
  studentM = await createUser(env, { loginId: 'studentM', role: 'student', createdBy: teacherA.id });
  studentN = await createUser(env, { loginId: 'studentN', role: 'student', createdBy: teacherA.id });
  disabled = await createUser(env, { loginId: 'studentD', role: 'student', createdBy: teacherA.id });

  classA = await createClass(env, { teacherId: teacherA.id, name: '클래스A' });
  await addMember(env, classA.id, studentM.id);
  await addMember(env, classA.id, disabled.id);

  classLesson = await createLesson(env, { classId: classA.id, createdBy: teacherA.id });
  sentence = await addSentence(env, classLesson.id, 'l1s1');
  personalLesson = await createLesson(env, { ownerUserId: studentM.id, createdBy: studentM.id });

  asTeacherA = await login(env, teacherA);
  asTeacherB = await login(env, teacherB);
  asStudentM = await login(env, studentM);
  asStudentN = await login(env, studentN);
  asDisabled = await login(env, disabled);
  anonymous = createClient(env);

  // 로그인 후 정지 → 기존 쿠키가 살아 있는 상태를 재현
  await env.DB.prepare('UPDATE users SET disabled_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), disabled.id).run();
});

const status = async (p) => (await p).status;

describe('14.2 클래스A 단원', () => {
  test('읽기: 교사A 200 / 교사B 404 / 학생M 200 / 학생N 404 / 비로그인 401 / 정지 401', async () => {
    assert.equal(await status(asTeacherA.get(`/lessons/${classLesson.id}`)), 200);
    assert.equal(await status(asTeacherB.get(`/lessons/${classLesson.id}`)), 404);
    assert.equal(await status(asStudentM.get(`/lessons/${classLesson.id}`)), 200);
    assert.equal(await status(asStudentN.get(`/lessons/${classLesson.id}`)), 404);
    assert.equal(await status(anonymous.get(`/lessons/${classLesson.id}`)), 401);
    assert.equal(await status(asDisabled.get(`/lessons/${classLesson.id}`)), 401);
  });

  test('수정/삭제: 학생M은 403(읽기는 되지만 쓰기 불가), 교사B·학생N은 404', async () => {
    assert.equal(await status(asTeacherA.patch(`/lessons/${classLesson.id}`, { title: 'x' })), GATE_PASSED);
    assert.equal(await status(asTeacherB.patch(`/lessons/${classLesson.id}`, { title: 'x' })), 404);
    assert.equal(await status(asStudentM.patch(`/lessons/${classLesson.id}`, { title: 'x' })), 403);
    assert.equal(await status(asStudentN.patch(`/lessons/${classLesson.id}`, { title: 'x' })), 404);
    assert.equal(await status(anonymous.patch(`/lessons/${classLesson.id}`, { title: 'x' })), 401);
    assert.equal(await status(asDisabled.del(`/lessons/${classLesson.id}`)), 401);
    assert.equal(await status(asStudentM.del(`/lessons/${classLesson.id}`)), 403);
  });

  test('하위 리소스 CRUD도 같은 게이트를 상속한다 (7.2)', async () => {
    const paths = ['sentences', 'vocabulary', 'grammar', 'quiz'];
    for (const p of paths) {
      assert.equal(await status(asTeacherA.post(`/lessons/${classLesson.id}/${p}`, {})), GATE_PASSED, p);
      assert.equal(await status(asStudentM.post(`/lessons/${classLesson.id}/${p}`, {})), 403, p);
      assert.equal(await status(asStudentN.post(`/lessons/${classLesson.id}/${p}`, {})), 404, p);
      assert.equal(await status(asTeacherB.post(`/lessons/${classLesson.id}/${p}`, {})), 404, p);
    }
    assert.equal(
      await status(asStudentM.del(`/lessons/${classLesson.id}/sentences/${sentence.id}`)), 403);
    assert.equal(
      await status(asTeacherA.del(`/lessons/${classLesson.id}/sentences/${sentence.id}`)), GATE_PASSED);
  });

  test('개인 교재로 복사: 읽을 수 있으면 가능 (R4)', async () => {
    assert.equal(await status(asStudentM.post(`/lessons/${classLesson.id}/copy-to-personal`)), GATE_PASSED);
    assert.equal(await status(asTeacherA.post(`/lessons/${classLesson.id}/copy-to-personal`)), GATE_PASSED);
    assert.equal(await status(asStudentN.post(`/lessons/${classLesson.id}/copy-to-personal`)), 404);
    assert.equal(await status(asTeacherB.post(`/lessons/${classLesson.id}/copy-to-personal`)), 404);
    assert.equal(await status(anonymous.post(`/lessons/${classLesson.id}/copy-to-personal`)), 401);
  });

  test('진행률 갱신/초기화: 읽을 수 있으면 본인 것은 가능 (R5)', async () => {
    assert.equal(await status(asStudentM.put(`/lessons/${classLesson.id}/progress`, { text: true })), GATE_PASSED);
    assert.equal(await status(asStudentM.del(`/lessons/${classLesson.id}/progress`)), GATE_PASSED);
    assert.equal(await status(asStudentN.put(`/lessons/${classLesson.id}/progress`, { text: true })), 404);
    assert.equal(await status(asTeacherB.del(`/lessons/${classLesson.id}/progress`)), 404);
    assert.equal(await status(anonymous.del(`/lessons/${classLesson.id}/progress`)), 401);
  });

  /**
   * ⚠️ 문서와의 의도적 차이
   * 14.2 표는 학생N(미가입)도 403으로 적었지만, 7.3의 "읽기 권한 없는 리소스는 404"와 충돌한다.
   * 403을 주면 그 클래스가 존재한다는 사실이 새어 나가므로 여기서는 404를 택했다.
   * 가입 학생(학생M)은 클래스의 존재를 이미 알고 있으므로 403이 맞다.
   */
  test('클래스 멤버 추가/제거: 소유 교사만. 가입 학생 403, 미가입·타 교사 404', async () => {
    assert.equal(await status(asTeacherA.post(`/classes/${classA.id}/members`, { studentId: studentN.id })), GATE_PASSED);
    assert.equal(await status(asStudentM.post(`/classes/${classA.id}/members`, { studentId: studentN.id })), 403);
    assert.equal(await status(asStudentN.post(`/classes/${classA.id}/members`, { studentId: studentN.id })), 404);
    assert.equal(await status(asTeacherB.post(`/classes/${classA.id}/members`, { studentId: studentN.id })), 404);
    assert.equal(await status(anonymous.get(`/classes/${classA.id}/members`)), 401);
  });
});

describe('14.2 학생M의 개인 단원', () => {
  test('읽기/수정/삭제/복사는 본인만. 교사A도 404 (R3 완전히 사적)', async () => {
    assert.equal(await status(asStudentM.get(`/lessons/${personalLesson.id}`)), 200);
    assert.equal(await status(asStudentM.patch(`/lessons/${personalLesson.id}`, { title: 'x' })), GATE_PASSED);

    for (const other of [asTeacherA, asTeacherB, asStudentN]) {
      assert.equal(await status(other.get(`/lessons/${personalLesson.id}`)), 404);
      assert.equal(await status(other.patch(`/lessons/${personalLesson.id}`, { title: 'x' })), 404);
      assert.equal(await status(other.del(`/lessons/${personalLesson.id}`)), 404);
      assert.equal(await status(other.post(`/lessons/${personalLesson.id}/copy-to-personal`)), 404);
    }
  });

  test('개인 단원 목록에는 본인 것만 나온다', async () => {
    const mine = await asStudentM.get('/me/lessons');
    assert.equal(mine.body.lessons.length, 1);
    assert.equal(mine.body.lessons[0].id, personalLesson.id);
    assert.equal(mine.body.lessons[0].scope, 'personal');

    const teacher = await asTeacherA.get('/me/lessons');
    assert.equal(teacher.body.lessons.length, 0);
  });
});

describe('14.2 추가 시나리오', () => {
  test('다른 단원의 문장 ID를 내 단원 URL에 넣으면 404다', async () => {
    const otherLesson = await createLesson(env, { classId: classA.id, createdBy: teacherA.id, orderIndex: 1 });
    // 교사A는 두 단원 모두 쓰기 권한이 있지만, 문장은 URL의 단원 소속이어야 한다
    const res = await asTeacherA.patch(`/lessons/${otherLesson.id}/sentences/${sentence.id}`, { chinese: 'x' });
    assert.equal(res.status, 404);
    assert.equal(res.code, 'NOT_FOUND');
  });

  test('본문에 role/ownerId/classId를 넣어도 무시된다', async () => {
    const res = await asStudentM.patch(`/lessons/${classLesson.id}`, {
      title: 'x', role: 'teacher', ownerId: studentM.id, classId: classA.id,
    });
    assert.equal(res.status, 403, '본문 값으로 권한이 올라가면 안 된다');

    const read = await asStudentN.get(`/lessons/${classLesson.id}`);
    assert.equal(read.status, 404);
  });

  test('보관된 클래스: 학생은 읽기 가능, 교사는 편집 403 (7.4 / D-3)', async () => {
    await env.DB.prepare('UPDATE classes SET archived_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), classA.id).run();

    assert.equal(await status(asStudentM.get(`/lessons/${classLesson.id}`)), 200);
    assert.equal(await status(asTeacherA.get(`/lessons/${classLesson.id}`)), 200);

    const blocked = await asTeacherA.patch(`/lessons/${classLesson.id}`, { title: 'x' });
    assert.equal(blocked.status, 403);
    assert.match(blocked.body.error.message, /보관/);

    // 새 단원 생성도 막힌다
    assert.equal(await status(asTeacherA.post(`/classes/${classA.id}/lessons`, {})), 403);

    // 진행률·복사는 읽기 권한 기반이므로 계속 된다
    assert.equal(await status(asStudentM.put(`/lessons/${classLesson.id}/progress`, { text: true })), GATE_PASSED);
    assert.equal(await status(asStudentM.post(`/lessons/${classLesson.id}/copy-to-personal`)), GATE_PASSED);
  });

  test('클래스에서 빠진 학생은 그 단원에 접근할 수 없다 (7.5)', async () => {
    assert.equal(await status(asStudentM.get(`/lessons/${classLesson.id}`)), 200);
    await env.DB.prepare('DELETE FROM class_memberships WHERE class_id = ? AND student_id = ?')
      .bind(classA.id, studentM.id).run();
    assert.equal(await status(asStudentM.get(`/lessons/${classLesson.id}`)), 404);

    // 재가입하면 다시 보인다 (progress는 보존되어 있음)
    await addMember(env, classA.id, studentM.id);
    assert.equal(await status(asStudentM.get(`/lessons/${classLesson.id}`)), 200);
  });

  test('존재하지 않는 단원과 권한 없는 단원의 응답이 구분되지 않는다 (7.3)', async () => {
    const ghost = await asStudentN.get(`/lessons/${crypto.randomUUID()}`);
    const forbidden = await asStudentN.get(`/lessons/${classLesson.id}`);
    assert.equal(ghost.status, 404);
    assert.equal(forbidden.status, 404);
    assert.equal(ghost.body.error.message, forbidden.body.error.message);
  });

  test('permissions 필드가 역할에 맞게 내려간다 (8.5 / 10.5)', async () => {
    const teacherView = (await asTeacherA.get(`/lessons/${classLesson.id}`)).body.permissions;
    assert.deepEqual(teacherView, { canEdit: true, canCopy: true, canResetProgress: true });

    const studentView = (await asStudentM.get(`/lessons/${classLesson.id}`)).body.permissions;
    assert.deepEqual(studentView, { canEdit: false, canCopy: true, canResetProgress: true });

    const personalView = (await asStudentM.get(`/lessons/${personalLesson.id}`)).body.permissions;
    assert.deepEqual(personalView, { canEdit: true, canCopy: false, canResetProgress: true });
  });

  test('클래스 단원 목록은 가입자·소유 교사만 볼 수 있다', async () => {
    assert.equal(await status(asTeacherA.get(`/classes/${classA.id}/lessons`)), 200);
    assert.equal(await status(asStudentM.get(`/classes/${classA.id}/lessons`)), 200);
    assert.equal(await status(asStudentN.get(`/classes/${classA.id}/lessons`)), 404);
    assert.equal(await status(asTeacherB.get(`/classes/${classA.id}/lessons`)), 404);
  });

  test('단원 상세 응답이 프로토타입 JSON과 호환되는 형태다 (8.1)', async () => {
    const body = (await asStudentM.get(`/lessons/${classLesson.id}`)).body;
    assert.equal(body.chineseTitle, '中文标题');
    assert.equal(body.koreanTitle, '한국어 제목');
    assert.equal(body.scope, 'class');
    assert.equal(body.sentences.length, 1);
    assert.equal(body.sentences[0].localId, 'l1s1');
    assert.match(body.sentences[0].id, /^[0-9a-f-]{36}$/, 'UI 식별자는 UUID');
    assert.ok(Array.isArray(body.vocabulary) && Array.isArray(body.grammar) && Array.isArray(body.quiz));
  });
});
