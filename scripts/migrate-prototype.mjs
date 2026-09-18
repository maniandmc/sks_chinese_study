#!/usr/bin/env node
/**
 * 설계 문서 11장 — 프로토타입 JSON → D1 이관.
 *
 * data/lessons.json + lesson0N.json 을 읽어 "샘플 클래스"(시드 교사 소유)의
 * 공식 교재로 넣는 INSERT SQL을 생성한다.
 *
 * 사용법:
 *   node scripts/migrate-prototype.mjs \
 *     --data public/data --teacher-login teacher1 \
 *     --class-name '샘플 클래스' --out migrations/seed_sample_class.sql
 *
 *   npx wrangler d1 execute textbook --file migrations/seed_sample_class.sql
 *
 * 규칙 (11.2)
 *   - 모든 PK는 신규 UUID. 기존 문자열 id(l1s1, g1, q1)는 local_id에 보존.
 *   - 단어는 id가 없었으므로 local_id = l{n}v{순번} 을 새로 발급.
 *   - pinyin_normalized 는 서버와 **같은 모듈**(src/lib/normalize.js)로 계산.
 *   - lessons.json의 숫자 id는 버리고 order_index(0,1,2)로만 쓴다.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizePinyin } from '../src/lib/normalize.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

const s = (v) => (v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v == null ? 'NULL' : Number(v));

const args = parseArgs(process.argv);
const dataDir = args.data || 'public/data';
const teacherLogin = (args['teacher-login'] || '').toLowerCase();
const className = args['class-name'] || '샘플 클래스';
const outPath = args.out || 'migrations/seed_sample_class.sql';

if (!teacherLogin) {
  console.error('--teacher-login <시드 교사 로그인ID> 는 필수입니다.');
  process.exit(1);
}

const TEACHER = `(SELECT id FROM users WHERE login_id = ${s(teacherLogin)} AND role = 'teacher')`;

const meta = JSON.parse(readFileSync(join(dataDir, 'lessons.json'), 'utf8'));
const classId = crypto.randomUUID();

const lines = [
  `-- 프로토타입 교재 이관 (설계 문서 11장). 생성 시각: ${new Date().toISOString()}`,
  `-- 전제: 시드 교사(login_id=${teacherLogin})가 이미 존재해야 한다 (부록 C.1).`,
  '',
  `INSERT INTO classes (id, teacher_id, name, description) VALUES (`,
  `  ${s(classId)}, ${TEACHER}, ${s(className)}, ${s('프로토타입에서 이관된 교재')}`,
  `);`,
  '',
];

const counts = { lessons: 0, sentences: 0, vocabulary: 0, grammar: 0, quiz: 0, options: 0 };

meta.lessons.forEach((entry, lessonIndex) => {
  const lesson = JSON.parse(readFileSync(join(dataDir, entry.file), 'utf8'));
  const lessonId = crypto.randomUUID();
  const num = entry.id; // local_id 접두에만 쓰는 원본 번호
  counts.lessons++;

  lines.push(`-- ── ${entry.title} ${entry.chineseTitle} ─────────────────────────`);
  lines.push(
    `INSERT INTO lessons (id, class_id, owner_user_id, order_index, title, chinese_title, korean_title, created_by) VALUES (`,
    `  ${s(lessonId)}, ${s(classId)}, NULL, ${lessonIndex}, ${s(lesson.title)}, ${s(lesson.chineseTitle)}, ${s(lesson.koreanTitle)}, ${TEACHER}`,
    `);`,
  );

  (lesson.sentences || []).forEach((sent, i) => {
    counts.sentences++;
    lines.push(
      `INSERT INTO sentences (id, lesson_id, local_id, order_index, chinese, pinyin, translation) VALUES (` +
        `${s(crypto.randomUUID())}, ${s(lessonId)}, ${s(sent.id)}, ${i}, ${s(sent.chinese)}, ${s(sent.pinyin)}, ${s(sent.translation)});`,
    );
  });

  (lesson.vocabulary || []).forEach((v, i) => {
    counts.vocabulary++;
    const localId = `l${num}v${i + 1}`; // 프로토타입에는 id가 없어 새로 발급 (A-2)
    lines.push(
      `INSERT INTO vocabulary (id, lesson_id, local_id, order_index, word, pinyin, pinyin_normalized, part_of_speech, meaning, example) VALUES (` +
        `${s(crypto.randomUUID())}, ${s(lessonId)}, ${s(localId)}, ${i}, ${s(v.word)}, ${s(v.pinyin)}, ${s(normalizePinyin(v.pinyin))}, ${s(v.partOfSpeech)}, ${s(v.meaning)}, ${s(v.example)});`,
    );
  });

  (lesson.grammar || []).forEach((g, i) => {
    counts.grammar++;
    lines.push(
      `INSERT INTO grammar_points (id, lesson_id, local_id, order_index, number, title, description, example, translation) VALUES (` +
        `${s(crypto.randomUUID())}, ${s(lessonId)}, ${s(g.id)}, ${i}, ${s(g.number)}, ${s(g.title)}, ${s(g.description)}, ${s(g.example)}, ${s(g.translation)});`,
    );
  });

  (lesson.quiz || []).forEach((q, i) => {
    counts.quiz++;
    const qid = crypto.randomUUID();
    lines.push(
      `INSERT INTO quiz_questions (id, lesson_id, local_id, order_index, question, answer_index, explanation) VALUES (` +
        `${s(qid)}, ${s(lessonId)}, ${s(q.id)}, ${i}, ${s(q.question)}, ${n(q.answerIndex)}, ${s(q.explanation)});`,
    );
    (q.options || []).forEach((opt, oi) => {
      counts.options++;
      lines.push(
        `INSERT INTO quiz_options (question_id, order_index, option_text) VALUES (${s(qid)}, ${oi}, ${s(opt)});`,
      );
    });
    if (q.answerIndex >= (q.options || []).length) {
      console.error(`경고: ${entry.file} ${q.id} 의 answerIndex가 options 범위를 벗어납니다.`);
    }
  });

  lines.push('');
});

lines.push(
  '-- 11.3 검증 쿼리',
  `-- SELECT (SELECT COUNT(*) FROM lessons)         AS lessons,   -- ${counts.lessons}`,
  `--        (SELECT COUNT(*) FROM sentences)       AS sentences, -- ${counts.sentences}`,
  `--        (SELECT COUNT(*) FROM vocabulary)      AS vocabulary,-- ${counts.vocabulary}`,
  `--        (SELECT COUNT(*) FROM grammar_points)  AS grammar,   -- ${counts.grammar}`,
  `--        (SELECT COUNT(*) FROM quiz_questions)  AS quiz,      -- ${counts.quiz}`,
  `--        (SELECT COUNT(*) FROM quiz_options)    AS options;   -- ${counts.options}`,
  '',
);

writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`생성됨: ${outPath}`);
console.log('개수:', counts);
