/**
 * 설계 문서 7장 — 권한 모델과 검증 로직 (M3 코어).
 *
 * 원칙
 *  - 클라이언트가 보낸 role / ownerId / classId 는 **절대 신뢰하지 않는다**.
 *    판단 근거는 (URL 경로 + 세션 사용자 + D1 조회) 뿐이다.
 *  - 읽기 권한이 없으면 404 (존재 여부 노출 방지), 읽기는 되는데 쓰기가 안 되면 403. (7.3)
 */

import { forbidden, notFound } from './http.js';

export const LESSON_SCOPE = { CLASS: 'class', PERSONAL: 'personal' };

export function lessonScope(lesson) {
  return lesson.class_id != null ? LESSON_SCOPE.CLASS : LESSON_SCOPE.PERSONAL;
}

/** 6.6 — 접근 가능한 단원 공통 조건. :uid 바인딩 3회 필요 */
export const ACCESSIBLE_LESSONS_WHERE = `(
     l.owner_user_id = ?
  OR l.class_id IN (SELECT class_id FROM class_memberships WHERE student_id = ?)
  OR l.class_id IN (SELECT id FROM classes WHERE teacher_id = ?)
)`;

export function accessibleLessonBindings(userId) {
  return [userId, userId, userId];
}

export async function loadLesson(env, lessonId) {
  return env.DB.prepare('SELECT * FROM lessons WHERE id = ?').bind(lessonId).first();
}

export async function loadClass(env, classId) {
  return env.DB.prepare('SELECT * FROM classes WHERE id = ?').bind(classId).first();
}

async function isMember(env, classId, studentId) {
  const row = await env.DB.prepare(
    'SELECT 1 AS ok FROM class_memberships WHERE class_id = ? AND student_id = ?',
  ).bind(classId, studentId).first();
  return !!row;
}

// ---------------------------------------------------------------------------
// 7.1 판정 함수
// ---------------------------------------------------------------------------

export async function canReadLesson(env, user, lesson) {
  if (!lesson) return false;
  if (lessonScope(lesson) === LESSON_SCOPE.PERSONAL) {
    // 교사라도 학생의 개인 교재는 볼 수 없다 (R3)
    return lesson.owner_user_id === user.id;
  }
  const cls = await loadClass(env, lesson.class_id);
  if (!cls) return false;
  if (user.role === 'teacher') return cls.teacher_id === user.id;
  return isMember(env, cls.id, user.id);
}

export async function canWriteLesson(env, user, lesson) {
  if (!lesson) return false;
  if (lessonScope(lesson) === LESSON_SCOPE.PERSONAL) {
    return lesson.owner_user_id === user.id; // 교사·학생 모두 본인 것만
  }
  if (user.role !== 'teacher') return false; // 학생은 클래스 교재를 절대 쓰지 못한다 (R2)
  const cls = await loadClass(env, lesson.class_id);
  if (!cls) return false;
  // 보관된 클래스는 편집 불가 (7.4 / D-3)
  return cls.teacher_id === user.id && cls.archived_at == null;
}

/** 원본을 읽을 수만 있으면 복사할 수 있다 (R4) */
export const canCopyLesson = canReadLesson;

/** 본인 progress 행만 지우는 동작이므로 읽기 권한이면 충분하다 (R5) */
export const canResetProgress = canReadLesson;

export function canManageClass(user, cls) {
  return !!cls && user.role === 'teacher' && cls.teacher_id === user.id;
}

export function canManageStudent(user, student) {
  return !!student && user.role === 'teacher' && student.created_by === user.id;
}

// ---------------------------------------------------------------------------
// 7.2 적용 방식 — 라우트 공통 미들웨어
// ---------------------------------------------------------------------------

/**
 * lesson 관련 라우트 공통 게이트.
 * @param {'read'|'write'} mode
 * @returns {Promise<object>} lesson 행
 * @throws 404(읽기 불가) / 403(읽기 가능·쓰기 불가)
 */
export async function requireLessonAccess(env, user, lessonId, mode) {
  const lesson = await loadLesson(env, lessonId);
  if (!(await canReadLesson(env, user, lesson))) throw notFound('단원을 찾을 수 없습니다.');
  if (mode === 'write' && !(await canWriteLesson(env, user, lesson))) {
    const cls = lesson.class_id ? await loadClass(env, lesson.class_id) : null;
    if (cls && cls.archived_at != null && canManageClass(user, cls)) {
      throw forbidden('보관된 클래스의 교재는 편집할 수 없습니다. 보관을 해제해 주세요.');
    }
    throw forbidden('이 교재를 편집할 권한이 없습니다.');
  }
  return lesson;
}

const CHILD_TABLES = new Set(['sentences', 'vocabulary', 'grammar_points', 'quiz_questions']);

/**
 * 하위 리소스는 lessonId 게이트를 통과한 뒤에도
 * "그 행이 정말 이 단원 소속인지"를 쿼리 조건으로 확인한다.
 * (다른 단원의 문장 ID를 내 단원 URL에 넣는 우회 차단 — 14.2 추가 시나리오)
 */
export async function requireChildRow(env, table, childId, lessonId) {
  if (!CHILD_TABLES.has(table)) throw new Error(`허용되지 않은 테이블: ${table}`);
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND lesson_id = ?`)
    .bind(childId, lessonId)
    .first();
  if (!row) throw notFound('대상을 찾을 수 없습니다.');
  return row;
}

/** 클래스 관리 게이트 — 읽을 수도 없는 클래스는 404, 관리 권한만 없으면 403 */
export async function requireClassManage(env, user, classId, { allowArchived = true } = {}) {
  const cls = await loadClass(env, classId);
  if (!cls) throw notFound('클래스를 찾을 수 없습니다.');
  if (!canManageClass(user, cls)) {
    // 가입 학생이면 존재는 아니까 403, 그 외에는 존재를 숨겨 404
    if (user.role === 'student' && (await isMember(env, cls.id, user.id))) {
      throw forbidden('클래스를 관리할 권한이 없습니다.');
    }
    throw notFound('클래스를 찾을 수 없습니다.');
  }
  if (!allowArchived && cls.archived_at != null) {
    throw forbidden('보관된 클래스입니다. 보관을 해제해 주세요.');
  }
  return cls;
}

/** 클래스 읽기 게이트(소유 교사 또는 가입 학생) */
export async function requireClassRead(env, user, classId) {
  const cls = await loadClass(env, classId);
  if (!cls) throw notFound('클래스를 찾을 수 없습니다.');
  if (user.role === 'teacher') {
    if (cls.teacher_id !== user.id) throw notFound('클래스를 찾을 수 없습니다.');
  } else if (!(await isMember(env, cls.id, user.id))) {
    throw notFound('클래스를 찾을 수 없습니다.');
  }
  return cls;
}

/** 8.5 응답의 permissions 필드 (UI 힌트일 뿐, 서버는 매 쓰기마다 다시 검사한다) */
export async function lessonPermissions(env, user, lesson) {
  return {
    canEdit: await canWriteLesson(env, user, lesson),
    canCopy: lessonScope(lesson) === LESSON_SCOPE.CLASS,
    canResetProgress: true, // 읽기 게이트를 이미 통과한 상태에서만 계산한다
  };
}
