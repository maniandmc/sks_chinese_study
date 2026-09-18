/**
 * M1 완료 기준 — CASCADE / SET NULL / CHECK(정확히 하나)가 실제로 동작하는지.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMember, addSentence, createClass, createLesson, createTestEnv, createUser,
} from './harness/env.mjs';

async function setup() {
  const env = createTestEnv();
  const teacher = await createUser(env, { loginId: 'teacher1', role: 'teacher' });
  const student = await createUser(env, { loginId: 'student1', role: 'student', createdBy: teacher.id });
  const cls = await createClass(env, { teacherId: teacher.id });
  await addMember(env, cls.id, student.id);
  return { env, teacher, student, cls };
}

const count = async (env, sql, ...params) =>
  Number((await env.DB.prepare(sql).bind(...params).first()).c);

describe('M1 스키마', () => {
  test('lessons: class_id와 owner_user_id는 정확히 하나만 채워져야 한다', async () => {
    const { env, teacher, cls } = await setup();

    // 둘 다 NULL → 위반
    await assert.rejects(() =>
      env.DB.prepare(
        `INSERT INTO lessons (id, class_id, owner_user_id, title, chinese_title, korean_title, created_by)
         VALUES (?, NULL, NULL, 't', 'c', 'k', ?)`,
      ).bind(crypto.randomUUID(), teacher.id).run());

    // 둘 다 값 → 위반
    await assert.rejects(() =>
      env.DB.prepare(
        `INSERT INTO lessons (id, class_id, owner_user_id, title, chinese_title, korean_title, created_by)
         VALUES (?, ?, ?, 't', 'c', 'k', ?)`,
      ).bind(crypto.randomUUID(), cls.id, teacher.id, teacher.id).run());

    // 하나만 → 정상
    await createLesson(env, { classId: cls.id, createdBy: teacher.id });
    await createLesson(env, { ownerUserId: teacher.id, createdBy: teacher.id });
    assert.equal(await count(env, 'SELECT COUNT(*) c FROM lessons'), 2);
  });

  test('클래스 삭제 시 교재·하위·멤버십·진행률·북마크가 CASCADE로 함께 지워진다', async () => {
    const { env, teacher, student, cls } = await setup();
    const lesson = await createLesson(env, { classId: cls.id, createdBy: teacher.id });
    const sentence = await addSentence(env, lesson.id);
    await env.DB.prepare(
      'INSERT INTO progress (user_id, lesson_id, text_done) VALUES (?, ?, 1)',
    ).bind(student.id, lesson.id).run();
    await env.DB.prepare(
      'INSERT INTO bookmarks (id, user_id, sentence_id) VALUES (?, ?, ?)',
    ).bind(crypto.randomUUID(), student.id, sentence.id).run();

    await env.DB.prepare('DELETE FROM classes WHERE id = ?').bind(cls.id).run();

    assert.equal(await count(env, 'SELECT COUNT(*) c FROM lessons'), 0);
    assert.equal(await count(env, 'SELECT COUNT(*) c FROM sentences'), 0);
    assert.equal(await count(env, 'SELECT COUNT(*) c FROM class_memberships'), 0);
    assert.equal(await count(env, 'SELECT COUNT(*) c FROM progress'), 0);
    assert.equal(await count(env, 'SELECT COUNT(*) c FROM bookmarks'), 0);
  });

  test('원본 단원을 지워도 복사본은 살아남고 copied_from_lesson_id만 NULL이 된다 (9.4)', async () => {
    const { env, teacher, student, cls } = await setup();
    const origin = await createLesson(env, { classId: cls.id, createdBy: teacher.id });
    const copyId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO lessons (id, owner_user_id, title, chinese_title, korean_title, copied_from_lesson_id, created_by)
       VALUES (?, ?, 't', 'c', 'k', ?, ?)`,
    ).bind(copyId, student.id, origin.id, student.id).run();

    await env.DB.prepare('DELETE FROM lessons WHERE id = ?').bind(origin.id).run();

    const copy = await env.DB.prepare('SELECT * FROM lessons WHERE id = ?').bind(copyId).first();
    assert.ok(copy, '복사본이 남아 있어야 한다');
    assert.equal(copy.copied_from_lesson_id, null);
  });

  test('local_id는 단원 안에서만 유일하다 — g1/q1 충돌이 해소된다 (A-1)', async () => {
    const { env, teacher, cls } = await setup();
    const l1 = await createLesson(env, { classId: cls.id, createdBy: teacher.id, orderIndex: 0 });
    const l2 = await createLesson(env, { classId: cls.id, createdBy: teacher.id, orderIndex: 1 });

    const insertGrammar = (lessonId) =>
      env.DB.prepare(
        `INSERT INTO grammar_points (id, lesson_id, local_id, number, title, description, example, translation)
         VALUES (?, ?, 'g1', '01', 't', 'd', 'e', 'tr')`,
      ).bind(crypto.randomUUID(), lessonId).run();

    await insertGrammar(l1.id);
    await insertGrammar(l2.id);              // 다른 단원의 같은 g1 → 허용
    await assert.rejects(() => insertGrammar(l1.id)); // 같은 단원 중복 → 거부
  });

  test('북마크는 대상이 정확히 하나여야 하고 중복은 UNIQUE로 막힌다', async () => {
    const { env, teacher, student, cls } = await setup();
    const lesson = await createLesson(env, { classId: cls.id, createdBy: teacher.id });

    // 대상 0개
    await assert.rejects(() =>
      env.DB.prepare('INSERT INTO bookmarks (id, user_id) VALUES (?, ?)')
        .bind(crypto.randomUUID(), student.id).run());

    const sentence = await addSentence(env, lesson.id);
    // 대상 2개
    await assert.rejects(() =>
      env.DB.prepare('INSERT INTO bookmarks (id, user_id, lesson_id, sentence_id) VALUES (?, ?, ?, ?)')
        .bind(crypto.randomUUID(), student.id, lesson.id, sentence.id).run());

    const insertLessonBm = () =>
      env.DB.prepare('INSERT INTO bookmarks (id, user_id, lesson_id) VALUES (?, ?, ?)')
        .bind(crypto.randomUUID(), student.id, lesson.id).run();
    await insertLessonBm();
    await assert.rejects(insertLessonBm, '같은 대상 중복 북마크는 거부');
  });

  test('학생을 클래스에서 빼도 progress·bookmarks는 보존된다 (7.5)', async () => {
    const { env, teacher, student, cls } = await setup();
    const lesson = await createLesson(env, { classId: cls.id, createdBy: teacher.id });
    await env.DB.prepare('INSERT INTO progress (user_id, lesson_id, text_done) VALUES (?, ?, 1)')
      .bind(student.id, lesson.id).run();

    await env.DB.prepare('DELETE FROM class_memberships WHERE class_id = ? AND student_id = ?')
      .bind(cls.id, student.id).run();

    assert.equal(await count(env, 'SELECT COUNT(*) c FROM progress'), 1);
  });

  test('login_id는 대소문자를 무시하고 유일하다 (5.1)', async () => {
    const env = createTestEnv();
    await createUser(env, { loginId: 'Teacher1', role: 'teacher' });
    await assert.rejects(() => createUser(env, { loginId: 'TEACHER1', role: 'student' }));
  });

  test('progress는 (user_id, lesson_id) 복합 PK다 (A-9)', async () => {
    const { env, teacher, student, cls } = await setup();
    const lesson = await createLesson(env, { classId: cls.id, createdBy: teacher.id });
    const ins = () => env.DB.prepare('INSERT INTO progress (user_id, lesson_id) VALUES (?, ?)')
      .bind(student.id, lesson.id).run();
    await ins();
    await assert.rejects(ins);
  });

  test('role / bool 컬럼의 CHECK가 동작한다', async () => {
    const env = createTestEnv();
    await assert.rejects(() => createUser(env, { loginId: 'x', role: 'admin' }));
  });
});
