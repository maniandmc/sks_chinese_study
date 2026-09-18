-- =========================================================
-- 중국어 온라인 교재 — D1 스키마 v1.1
-- 설계 문서 6.3 기준. 변경 시 번호를 올려 새 파일로 추가할 것.
-- =========================================================

-- ---------------------------------------------------------
-- 사용자
-- ---------------------------------------------------------
CREATE TABLE users (
  id                    TEXT PRIMARY KEY,                 -- uuid
  login_id              TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash         TEXT NOT NULL,                    -- base64
  password_salt         TEXT NOT NULL,                    -- base64
  password_iters        INTEGER NOT NULL DEFAULT 100000,  -- Workers 상한 100000
  display_name          TEXT NOT NULL,
  role                  TEXT NOT NULL CHECK (role IN ('teacher','student')),
  must_change_password  INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0,1)),
  session_version       INTEGER NOT NULL DEFAULT 1,       -- 올리면 기존 세션 전부 무효
  failed_login_count    INTEGER NOT NULL DEFAULT 0,
  locked_until          TEXT,                             -- ISO 시각, NULL이면 잠금 없음
  created_by            TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  disabled_at           TEXT                              -- NULL이면 정상
);
CREATE INDEX idx_users_created_by ON users(created_by);

-- ---------------------------------------------------------
-- 클래스 / 멤버십
-- ---------------------------------------------------------
CREATE TABLE classes (
  id           TEXT PRIMARY KEY,
  teacher_id   TEXT NOT NULL REFERENCES users(id),
  name         TEXT NOT NULL,
  description  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at  TEXT                                        -- 보관(종강). 7.4 참고
);
CREATE INDEX idx_classes_teacher ON classes(teacher_id);

CREATE TABLE class_memberships (
  id          TEXT PRIMARY KEY,
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id  TEXT NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (class_id, student_id)
);
CREATE INDEX idx_membership_student ON class_memberships(student_id);

-- ---------------------------------------------------------
-- 교재(단원): 클래스 소유 또는 개인 소유 (정확히 하나)
-- ---------------------------------------------------------
CREATE TABLE lessons (
  id                     TEXT PRIMARY KEY,
  class_id               TEXT REFERENCES classes(id) ON DELETE CASCADE,
  owner_user_id          TEXT REFERENCES users(id)   ON DELETE CASCADE,
  order_index            INTEGER NOT NULL DEFAULT 0,
  title                  TEXT NOT NULL,
  chinese_title          TEXT NOT NULL,
  korean_title           TEXT NOT NULL,
  copied_from_lesson_id  TEXT REFERENCES lessons(id) ON DELETE SET NULL,
  created_by             TEXT NOT NULL REFERENCES users(id),
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((class_id IS NULL) <> (owner_user_id IS NULL))
);
CREATE INDEX idx_lessons_class ON lessons(class_id, order_index);
CREATE INDEX idx_lessons_owner ON lessons(owner_user_id, order_index);
CREATE INDEX idx_lessons_copied_from ON lessons(copied_from_lesson_id);
CREATE INDEX idx_lessons_created_by ON lessons(created_by);

CREATE TABLE sentences (
  id           TEXT PRIMARY KEY,
  lesson_id    TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  local_id     TEXT NOT NULL,
  order_index  INTEGER NOT NULL DEFAULT 0,
  chinese      TEXT NOT NULL,
  pinyin       TEXT NOT NULL,
  translation  TEXT NOT NULL,
  UNIQUE (lesson_id, local_id)
);
CREATE INDEX idx_sentences_lesson ON sentences(lesson_id, order_index);

CREATE TABLE vocabulary (
  id                TEXT PRIMARY KEY,
  lesson_id         TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  local_id          TEXT NOT NULL,
  order_index       INTEGER NOT NULL DEFAULT 0,
  word              TEXT NOT NULL,
  pinyin            TEXT NOT NULL,
  pinyin_normalized TEXT NOT NULL,                         -- 성조 제거·소문자 (서버가 계산)
  part_of_speech    TEXT,
  meaning           TEXT NOT NULL,
  example           TEXT,
  UNIQUE (lesson_id, local_id)
);
CREATE INDEX idx_vocabulary_lesson ON vocabulary(lesson_id, order_index);
CREATE INDEX idx_vocabulary_word   ON vocabulary(word);
CREATE INDEX idx_vocabulary_pinyin_norm ON vocabulary(pinyin_normalized);

CREATE TABLE grammar_points (
  id           TEXT PRIMARY KEY,
  lesson_id    TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  local_id     TEXT NOT NULL,
  order_index  INTEGER NOT NULL DEFAULT 0,
  number       TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  example      TEXT NOT NULL,
  translation  TEXT NOT NULL,
  UNIQUE (lesson_id, local_id)
);
CREATE INDEX idx_grammar_lesson ON grammar_points(lesson_id, order_index);

CREATE TABLE quiz_questions (
  id            TEXT PRIMARY KEY,
  lesson_id     TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  local_id      TEXT NOT NULL,
  order_index   INTEGER NOT NULL DEFAULT 0,
  question      TEXT NOT NULL,
  answer_index  INTEGER NOT NULL,                          -- quiz_options.order_index 기준 (0부터)
  explanation   TEXT,
  UNIQUE (lesson_id, local_id)
);
CREATE INDEX idx_quiz_lesson ON quiz_questions(lesson_id, order_index);

CREATE TABLE quiz_options (
  question_id   TEXT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  order_index   INTEGER NOT NULL,
  option_text   TEXT NOT NULL,
  PRIMARY KEY (question_id, order_index)
);

-- ---------------------------------------------------------
-- 진행률 (사용자 × 단원)
-- ---------------------------------------------------------
CREATE TABLE progress (
  user_id       TEXT NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  lesson_id     TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  text_done     INTEGER NOT NULL DEFAULT 0 CHECK (text_done    IN (0,1)),
  vocab_done    INTEGER NOT NULL DEFAULT 0 CHECK (vocab_done   IN (0,1)),
  grammar_done  INTEGER NOT NULL DEFAULT 0 CHECK (grammar_done IN (0,1)),
  quiz_done     INTEGER NOT NULL DEFAULT 0 CHECK (quiz_done    IN (0,1)),
  quiz_score    INTEGER,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, lesson_id)
);
CREATE INDEX idx_progress_lesson ON progress(lesson_id);

-- ---------------------------------------------------------
-- 북마크 (대상별 FK, 정확히 하나)
-- ---------------------------------------------------------
CREATE TABLE bookmarks (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id      TEXT REFERENCES lessons(id)    ON DELETE CASCADE,
  sentence_id    TEXT REFERENCES sentences(id)  ON DELETE CASCADE,
  vocabulary_id  TEXT REFERENCES vocabulary(id) ON DELETE CASCADE,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ( (lesson_id IS NOT NULL) + (sentence_id IS NOT NULL) + (vocabulary_id IS NOT NULL) = 1 )
);
CREATE UNIQUE INDEX uq_bm_lesson   ON bookmarks(user_id, lesson_id)     WHERE lesson_id     IS NOT NULL;
CREATE UNIQUE INDEX uq_bm_sentence ON bookmarks(user_id, sentence_id)   WHERE sentence_id   IS NOT NULL;
CREATE UNIQUE INDEX uq_bm_vocab    ON bookmarks(user_id, vocabulary_id) WHERE vocabulary_id IS NOT NULL;
CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);
