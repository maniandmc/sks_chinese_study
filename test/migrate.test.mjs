/**
 * M1 완료 기준 — 11.3의 검증 쿼리 통과.
 * seed-teacher.mjs → migrate-prototype.mjs 가 만든 SQL을 실제로 적용해 본다.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestEnv } from './harness/env.mjs';
import { normalizePinyin } from '../src/lib/normalize.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'public', 'data');

describe('M1 이관 스크립트', () => {
  let env;
  let tmp;

  before(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'ctb-'));
    const seedSql = join(tmp, 'seed.sql');
    const dataSql = join(tmp, 'data.sql');

    execFileSync('node', [
      join(ROOT, 'scripts', 'seed-teacher.mjs'),
      '--login', 'teacher1', '--name', '김선생', '--out', seedSql, '--iters', '1000',
    ], { input: 'seedPassw0rd', encoding: 'utf8' });

    execFileSync('node', [
      join(ROOT, 'scripts', 'migrate-prototype.mjs'),
      '--data', DATA_DIR, '--teacher-login', 'teacher1',
      '--class-name', '샘플 클래스', '--out', dataSql,
    ], { encoding: 'utf8' });

    env = createTestEnv();
    await env.DB.exec(readFileSync(seedSql, 'utf8'));
    await env.DB.exec(readFileSync(dataSql, 'utf8'));
  });

  const one = async (sql) => (await env.DB.prepare(sql).bind().first());

  test('11.3 검증 쿼리: 단원 3 / 문장 10 / 단어 14 / 문법 5 / 퀴즈 6', async () => {
    const row = await one(`SELECT
      (SELECT COUNT(*) FROM lessons)        AS lessons,
      (SELECT COUNT(*) FROM sentences)      AS sentences,
      (SELECT COUNT(*) FROM vocabulary)     AS vocabulary,
      (SELECT COUNT(*) FROM grammar_points) AS grammar,
      (SELECT COUNT(*) FROM quiz_questions) AS quiz,
      (SELECT COUNT(*) FROM quiz_options)   AS options`);
    assert.deepEqual(
      { lessons: row.lessons, sentences: row.sentences, vocabulary: row.vocabulary, grammar: row.grammar, quiz: row.quiz },
      { lessons: 3, sentences: 10, vocabulary: 14, grammar: 5, quiz: 6 },
    );
    assert.ok(row.options >= 6 * 2, '퀴즈 옵션이 함께 들어가야 한다');
  });

  test('모든 단원이 샘플 클래스 소유이고 개인 교재는 없다', async () => {
    const row = await one(
      `SELECT COUNT(*) AS c FROM lessons WHERE class_id IS NULL OR owner_user_id IS NOT NULL`);
    assert.equal(row.c, 0);
    const cls = await one(`SELECT c.name, u.login_id FROM classes c JOIN users u ON u.id = c.teacher_id`);
    assert.equal(cls.name, '샘플 클래스');
    assert.equal(cls.login_id, 'teacher1');
  });

  test('order_index가 lessons.json 순서를 보존한다', async () => {
    const { results } = await env.DB.prepare(
      'SELECT title, order_index FROM lessons ORDER BY order_index',
    ).bind().all();
    assert.deepEqual(results.map((r) => r.title), ['第一课', '第二课', '第三课']);
    assert.deepEqual(results.map((r) => r.order_index), [0, 1, 2]);
  });

  test('기존 문자열 id가 local_id에 보존된다 (l1s1 / g1 / q1)', async () => {
    const s = await one(`SELECT COUNT(*) AS c FROM sentences WHERE local_id = 'l1s1'`);
    assert.equal(s.c, 1);
    const g = await one(`SELECT COUNT(*) AS c FROM grammar_points WHERE local_id = 'g1'`);
    assert.equal(g.c, 3, 'g1은 세 단원에 각각 하나씩 — 충돌 없이 공존해야 한다');
    const q = await one(`SELECT COUNT(*) AS c FROM quiz_questions WHERE local_id = 'q1'`);
    assert.equal(q.c, 3);
  });

  test('단어에 local_id가 새로 발급된다 (l{n}v{순번})', async () => {
    const row = await one(`SELECT COUNT(*) AS c FROM vocabulary WHERE local_id LIKE 'l1v%'`);
    assert.equal(row.c, 10);
    const dup = await one(
      `SELECT COUNT(*) AS c FROM (SELECT lesson_id, local_id FROM vocabulary GROUP BY 1,2 HAVING COUNT(*) > 1)`);
    assert.equal(dup.c, 0, 'UNIQUE(lesson_id, local_id) 위반 없음');
  });

  test('pinyin_normalized가 서버와 같은 함수로 계산되어 있다 (6.5)', async () => {
    const { results } = await env.DB.prepare('SELECT pinyin, pinyin_normalized FROM vocabulary').bind().all();
    for (const r of results) {
      assert.equal(r.pinyin_normalized, normalizePinyin(r.pinyin));
    }
    const hit = await one(
      `SELECT COUNT(*) AS c FROM vocabulary WHERE pinyin_normalized LIKE '%jiating%'`);
    assert.ok(hit.c >= 1, '성조를 뺀 "jiating"으로 家庭이 검색되어야 한다');
  });

  test('퀴즈 옵션 순서와 answer_index가 맞물린다', async () => {
    const row = await one(`SELECT COUNT(*) AS c
        FROM quiz_questions q
        LEFT JOIN quiz_options o ON o.question_id = q.id AND o.order_index = q.answer_index
       WHERE o.option_text IS NULL`);
    assert.equal(row.c, 0, '모든 정답 인덱스가 실제 옵션을 가리켜야 한다');
  });

  test('시드 교사는 must_change_password=1 로 들어간다 (부록 C.1)', async () => {
    const u = await one(`SELECT role, must_change_password, session_version FROM users WHERE login_id='teacher1'`);
    assert.equal(u.role, 'teacher');
    assert.equal(u.must_change_password, 1);
    assert.equal(u.session_version, 1);
  });

  test('시드 교사가 없으면 이관 SQL이 실패한다(조용히 NULL로 들어가지 않는다)', async () => {
    const fresh = createTestEnv();
    const dataSql = readFileSync(join(tmp, 'data.sql'), 'utf8');
    await assert.rejects(() => fresh.DB.exec(dataSql));
  });
});
