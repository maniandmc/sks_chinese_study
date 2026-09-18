/**
 * 테스트 하네스 — 네트워크·외부 의존성 없이 Worker를 그대로 실행한다.
 *
 *   D1       → node:sqlite (DatabaseSync) 위에 D1 API(prepare/bind/first/all/run/batch)를 얹은 shim
 *   KV       → Map 기반 shim (TTL 포함)
 *   fetch    → src/worker.js의 default export를 직접 호출
 *
 * 주의: shim은 "D1과 같은 인터페이스"를 흉내 낼 뿐이다.
 * 실제 D1의 CASCADE/배치 동작은 M1 완료 기준대로 `wrangler d1` 환경에서 한 번 더 확인할 것.
 * (단, foreign_keys는 D1과 동일하게 ON으로 켜 두었다.)
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import worker from '../../src/worker.js';
import { createPasswordFields } from '../../src/lib/password.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
export const ORIGIN = 'https://textbook.test';

function normalizeParam(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

function normalizeRow(row) {
  if (!row) return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === 'bigint' ? Number(v) : v;
  return out;
}

class D1Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new D1Statement(this.db, this.sql, params.map(normalizeParam));
  }
  _stmt() {
    return this.db.prepare(this.sql);
  }
  async first(column) {
    const row = normalizeRow(this._stmt().get(...this.params));
    if (!row) return null;
    return column ? row[column] : row;
  }
  async all() {
    const rows = this._stmt().all(...this.params).map(normalizeRow);
    return { results: rows, success: true, meta: {} };
  }
  async run() {
    const r = this._stmt().run(...this.params);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

function createD1(db) {
  return {
    prepare: (sql) => new D1Statement(db, sql),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const st of statements) out.push(await st.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
    _raw: db,
  };
}

function createKV() {
  const store = new Map();
  return {
    async get(key) {
      const rec = store.get(key);
      if (!rec) return null;
      if (rec.expiresAt && rec.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return rec.value;
    },
    async put(key, value, options = {}) {
      store.set(key, {
        value,
        expiresAt: options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : null,
      });
    },
    async delete(key) {
      store.delete(key);
    },
    _store: store,
  };
}

export function createTestEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(join(ROOT, 'migrations', '0001_init.sql'), 'utf8'));
  return { DB: createD1(db), SESSIONS: createKV(), ASSETS: null };
}

// ---------------------------------------------------------------------------
// HTTP 클라이언트 (쿠키 보관)
// ---------------------------------------------------------------------------

export function createClient(env) {
  let cookie = null;
  return {
    get cookie() { return cookie; },
    setCookie(v) { cookie = v; },
    async request(method, path, { body, origin = ORIGIN, headers = {} } = {}) {
      const init = { method, headers: { ...headers } };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
        init.headers['content-type'] = 'application/json';
      }
      if (origin && method !== 'GET') init.headers.origin = origin;
      if (cookie) init.headers.cookie = cookie;

      const res = await worker.fetch(new Request(`${ORIGIN}/api/v1${path}`, init), env);
      const setCookies = typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [res.headers.get('set-cookie')].filter(Boolean);
      for (const sc of setCookies) {
        const pair = sc.split(';')[0];
        cookie = pair.endsWith('=') ? null : pair;
      }
      let json = null;
      if (res.status !== 204) {
        const text = await res.text();
        if (text) { try { json = JSON.parse(text); } catch { json = text; } }
      }
      return { status: res.status, body: json, code: json?.error?.code ?? null, res };
    },
    get(p, o) { return this.request('GET', p, o); },
    post(p, body, o) { return this.request('POST', p, { ...o, body: body ?? {} }); },
    patch(p, body, o) { return this.request('PATCH', p, { ...o, body: body ?? {} }); },
    put(p, body, o) { return this.request('PUT', p, { ...o, body: body ?? {} }); },
    del(p, o) { return this.request('DELETE', p, o); },
  };
}

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

/** 테스트 속도를 위해 반복 횟수를 낮춘다. 운영은 100,000 (5.2) */
export const TEST_ITERS = 1000;

export async function createUser(env, { loginId, name, role, password = 'password123', ...rest }) {
  const id = crypto.randomUUID();
  const f = await createPasswordFields(password, TEST_ITERS);
  await env.DB.prepare(
    `INSERT INTO users (id, login_id, password_hash, password_salt, password_iters,
                        display_name, role, must_change_password, created_by, disabled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, loginId.toLowerCase(), f.password_hash, f.password_salt, f.password_iters,
    name || loginId, role, rest.mustChangePassword ? 1 : 0, rest.createdBy ?? null, rest.disabledAt ?? null,
  ).run();
  return { id, loginId, password, role };
}

export async function createClass(env, { teacherId, name = '클래스', archived = false }) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO classes (id, teacher_id, name, archived_at) VALUES (?, ?, ?, ?)',
  ).bind(id, teacherId, name, archived ? new Date().toISOString() : null).run();
  return { id };
}

export async function addMember(env, classId, studentId) {
  await env.DB.prepare(
    'INSERT INTO class_memberships (id, class_id, student_id) VALUES (?, ?, ?)',
  ).bind(crypto.randomUUID(), classId, studentId).run();
}

export async function createLesson(env, { classId = null, ownerUserId = null, createdBy, title = '第一课', orderIndex = 0 }) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO lessons (id, class_id, owner_user_id, order_index, title, chinese_title, korean_title, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, classId, ownerUserId, orderIndex, title, '中文标题', '한국어 제목', createdBy).run();
  return { id };
}

export async function addSentence(env, lessonId, localId = 'l1s1') {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO sentences (id, lesson_id, local_id, order_index, chinese, pinyin, translation)
     VALUES (?, ?, ?, 0, '中文', 'zhōngwén', '중국어')`,
  ).bind(id, lessonId, localId).run();
  return { id };
}

export async function login(env, user) {
  const client = createClient(env);
  const res = await client.post('/auth/login', { loginId: user.loginId, password: user.password });
  if (res.status !== 200) throw new Error(`로그인 실패: ${res.status} ${JSON.stringify(res.body)}`);
  return client;
}
