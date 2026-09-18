/**
 * 설계 문서 8.4 / 8.5 / 8.6 / 8.7
 *
 * M3 범위: 읽기 경로와 **권한 게이트**를 전부 확정한다.
 * 쓰기 핸들러의 본체는 M4/M5에서 채운다. 그때까지는 게이트를 통과한 뒤
 * 501 NOT_IMPLEMENTED를 돌려준다 — 테스트는 "게이트를 통과했다"는 사실을 501로 확인한다.
 */

import { ApiError, json } from '../lib/http.js';
import {
  ACCESSIBLE_LESSONS_WHERE,
  accessibleLessonBindings,
  lessonPermissions,
  lessonScope,
  requireChildRow,
  requireClassManage,
  requireClassRead,
  requireLessonAccess,
} from '../lib/permissions.js';

const notImplemented = (milestone) =>
  new ApiError('NOT_IMPLEMENTED', `이 엔드포인트는 ${milestone}에서 구현됩니다.`);

function lessonMeta(row) {
  return {
    id: row.id,
    scope: lessonScope(row),
    classId: row.class_id,
    ownerUserId: row.owner_user_id,
    orderIndex: row.order_index,
    title: row.title,
    chineseTitle: row.chinese_title,
    koreanTitle: row.korean_title,
    copiedFromLessonId: row.copied_from_lesson_id,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// 목록
// ---------------------------------------------------------------------------

async function listClassLessons(ctx) {
  const cls = await requireClassRead(ctx.env, ctx.user, ctx.params.classId);
  const { results } = await ctx.env.DB.prepare(
    'SELECT * FROM lessons WHERE class_id = ? ORDER BY order_index, created_at',
  ).bind(cls.id).all();
  return json({ lessons: results.map(lessonMeta) });
}

async function listMyLessons(ctx) {
  const { results } = await ctx.env.DB.prepare(
    'SELECT * FROM lessons WHERE owner_user_id = ? ORDER BY order_index, created_at',
  ).bind(ctx.user.id).all();
  return json({ lessons: results.map(lessonMeta) });
}

/** 6.6 조건 재사용 확인용(검색·단어장·진행률이 M5에서 그대로 쓴다) */
export async function listAccessibleLessons(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT l.* FROM lessons l WHERE ${ACCESSIBLE_LESSONS_WHERE} ORDER BY l.order_index`,
  ).bind(...accessibleLessonBindings(userId)).all();
  return results;
}

// ---------------------------------------------------------------------------
// 단원 상세 (8.5) — 프로토타입 lesson JSON과 호환되는 형태 (8.1)
// ---------------------------------------------------------------------------

async function getLesson(ctx) {
  const { env, user, params } = ctx;
  const lesson = await requireLessonAccess(env, user, params.id, 'read');

  const [sentences, vocabulary, grammar, quiz] = await Promise.all([
    env.DB.prepare('SELECT * FROM sentences WHERE lesson_id = ? ORDER BY order_index').bind(lesson.id).all(),
    env.DB.prepare('SELECT * FROM vocabulary WHERE lesson_id = ? ORDER BY order_index').bind(lesson.id).all(),
    env.DB.prepare('SELECT * FROM grammar_points WHERE lesson_id = ? ORDER BY order_index').bind(lesson.id).all(),
    env.DB.prepare('SELECT * FROM quiz_questions WHERE lesson_id = ? ORDER BY order_index').bind(lesson.id).all(),
  ]);

  const questionIds = quiz.results.map((q) => q.id);
  let optionsByQuestion = new Map();
  if (questionIds.length) {
    const placeholders = questionIds.map(() => '?').join(',');
    const { results: optionRows } = await env.DB.prepare(
      `SELECT * FROM quiz_options WHERE question_id IN (${placeholders}) ORDER BY question_id, order_index`,
    ).bind(...questionIds).all();
    for (const o of optionRows) {
      if (!optionsByQuestion.has(o.question_id)) optionsByQuestion.set(o.question_id, []);
      optionsByQuestion.get(o.question_id).push(o.option_text);
    }
  }

  return json({
    ...lessonMeta(lesson),
    permissions: await lessonPermissions(env, user, lesson),
    sentences: sentences.results.map((s) => ({
      id: s.id,
      localId: s.local_id,
      chinese: s.chinese,
      pinyin: s.pinyin,
      translation: s.translation,
    })),
    vocabulary: vocabulary.results.map((v) => ({
      id: v.id,
      localId: v.local_id,
      word: v.word,
      pinyin: v.pinyin,
      partOfSpeech: v.part_of_speech,
      meaning: v.meaning,
      example: v.example,
    })),
    grammar: grammar.results.map((g) => ({
      id: g.id,
      localId: g.local_id,
      number: g.number,
      title: g.title,
      description: g.description,
      example: g.example,
      translation: g.translation,
    })),
    quiz: quiz.results.map((q) => ({
      id: q.id,
      localId: q.local_id,
      question: q.question,
      options: optionsByQuestion.get(q.id) || [],
      answerIndex: q.answer_index,
      explanation: q.explanation,
    })),
  });
}

// ---------------------------------------------------------------------------
// 쓰기 경로 — 게이트만 확정 (본체는 M4/M5)
// ---------------------------------------------------------------------------

const CHILD_TABLE_BY_SEGMENT = {
  sentences: 'sentences',
  vocabulary: 'vocabulary',
  grammar: 'grammar_points',
  quiz: 'quiz_questions',
};

/** 하위 리소스 쓰기: 단원 쓰기 게이트 + (수정/삭제면) 그 행이 이 단원 소속인지 확인 */
function childHandler(segment, { withId }) {
  return async (ctx) => {
    const lesson = await requireLessonAccess(ctx.env, ctx.user, ctx.params.id, 'write');
    if (withId) {
      const childId = ctx.params.sid ?? ctx.params.vid ?? ctx.params.gid ?? ctx.params.qid;
      await requireChildRow(ctx.env, CHILD_TABLE_BY_SEGMENT[segment], childId, lesson.id);
    }
    throw notImplemented('M4');
  };
}

export function registerLessonRoutes(router) {
  // 목록 · 상세
  router.get('/classes/:classId/lessons', listClassLessons);
  router.get('/me/lessons', listMyLessons);
  router.get('/lessons/:id', getLesson);

  // 단원 생성/수정/삭제 (M4)
  router.post('/classes/:classId/lessons', async (ctx) => {
    await requireClassManage(ctx.env, ctx.user, ctx.params.classId, { allowArchived: false });
    throw notImplemented('M4');
  });
  router.post('/me/lessons', async () => { throw notImplemented('M4'); });
  router.patch('/lessons/:id', async (ctx) => {
    await requireLessonAccess(ctx.env, ctx.user, ctx.params.id, 'write');
    throw notImplemented('M4');
  });
  router.delete('/lessons/:id', async (ctx) => {
    await requireLessonAccess(ctx.env, ctx.user, ctx.params.id, 'write');
    throw notImplemented('M4');
  });

  // 복사 — 읽을 수만 있으면 가능 (9.1)
  router.post('/lessons/:id/copy-to-personal', async (ctx) => {
    await requireLessonAccess(ctx.env, ctx.user, ctx.params.id, 'read');
    throw notImplemented('M4');
  });

  // 하위 리소스 (8.6)
  for (const [segment, idParam] of [
    ['sentences', 'sid'], ['vocabulary', 'vid'], ['grammar', 'gid'], ['quiz', 'qid'],
  ]) {
    router.post(`/lessons/:id/${segment}`, childHandler(segment, { withId: false }));
    router.patch(`/lessons/:id/${segment}/:${idParam}`, childHandler(segment, { withId: true }));
    router.delete(`/lessons/:id/${segment}/:${idParam}`, childHandler(segment, { withId: true }));
  }

  // 진행률 (8.7, M5) — 읽기 권한이면 본인 행을 다룰 수 있다
  router.get('/lessons/:id/progress', async (ctx) => {
    await requireLessonAccess(ctx.env, ctx.user, ctx.params.id, 'read');
    throw notImplemented('M5');
  });
  router.put('/lessons/:id/progress', async (ctx) => {
    await requireLessonAccess(ctx.env, ctx.user, ctx.params.id, 'read');
    throw notImplemented('M5');
  });
  router.delete('/lessons/:id/progress', async (ctx) => {
    await requireLessonAccess(ctx.env, ctx.user, ctx.params.id, 'read');
    throw notImplemented('M5');
  });

  // 클래스 멤버 관리 (8.4, M4)
  router.get('/classes/:id/members', async (ctx) => {
    await requireClassManage(ctx.env, ctx.user, ctx.params.id);
    throw notImplemented('M4');
  });
  router.post('/classes/:id/members', async (ctx) => {
    await requireClassManage(ctx.env, ctx.user, ctx.params.id);
    throw notImplemented('M4');
  });
  router.delete('/classes/:id/members/:studentId', async (ctx) => {
    await requireClassManage(ctx.env, ctx.user, ctx.params.id);
    throw notImplemented('M4');
  });
}
