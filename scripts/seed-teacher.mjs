#!/usr/bin/env node
/**
 * 부록 C — 시드 교사 생성 / 교사 비밀번호 복구.
 *
 * Worker와 **동일한 파라미터**(PBKDF2-SHA-256, 100,000회, 16바이트 salt, base64)로
 * 해시를 만들어 SQL 파일을 출력한다. 평문 비밀번호는 파일·로그에 남기지 않는다.
 *
 * 사용법:
 *   # 생성 (비밀번호는 stdin으로 전달 — 셸 히스토리에 남지 않게)
 *   printf '%s' 'MyPassw0rd' | node scripts/seed-teacher.mjs \
 *       --login teacher1 --name '김선생' --out seed-teacher.sql
 *
 *   # 분실 복구 (C.2)
 *   printf '%s' 'TempPassw0rd' | node scripts/seed-teacher.mjs \
 *       --login teacher1 --reset --out reset-teacher.sql
 *
 * 이후:
 *   npx wrangler d1 execute textbook --file seed-teacher.sql   # 로컬 → 스테이징 → 운영
 *   rm seed-teacher.sql
 */

import { writeFileSync } from 'node:fs';
import { createPasswordFields, DEFAULT_ITERS } from '../src/lib/password.js';

function parseArgs(argv) {
  const out = { iters: DEFAULT_ITERS };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reset') out.reset = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

const sqlStr = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const args = parseArgs(process.argv);
if (!args.login) {
  console.error('--login <로그인ID> 는 필수입니다. --help 는 파일 상단 주석 참고.');
  process.exit(1);
}

const password = process.env.CTB_SEED_PASSWORD || (await readStdin());
if (!password || password.length < 8) {
  console.error('비밀번호를 stdin 또는 CTB_SEED_PASSWORD로 전달하세요 (8자 이상).');
  process.exit(1);
}

const iters = Number(args.iters) || DEFAULT_ITERS;
if (iters > 100000) {
  console.error('Workers의 PBKDF2 반복 횟수 상한은 100,000입니다.');
  process.exit(1);
}

const f = await createPasswordFields(password, iters);
const outPath = args.out || (args.reset ? 'reset-teacher.sql' : 'seed-teacher.sql');

let sql;
if (args.reset) {
  // session_version 증가로 기존 세션이 전부 즉시 무효화된다 (5.4)
  sql = `-- 교사 비밀번호 재설정 (부록 C.2). 실행 후 이 파일을 삭제하세요.
UPDATE users
   SET password_hash = ${sqlStr(f.password_hash)},
       password_salt = ${sqlStr(f.password_salt)},
       password_iters = ${f.password_iters},
       must_change_password = 1,
       session_version = session_version + 1,
       failed_login_count = 0,
       locked_until = NULL,
       disabled_at = NULL
 WHERE role = 'teacher' AND login_id = ${sqlStr(args.login)};
`;
} else {
  if (!args.name) {
    console.error('--name <표시 이름> 은 생성 시 필수입니다.');
    process.exit(1);
  }
  sql = `-- 시드 교사 생성 (부록 C.1). 실행 후 이 파일을 삭제하세요.
INSERT INTO users (
  id, login_id, password_hash, password_salt, password_iters,
  display_name, role, must_change_password, session_version
) VALUES (
  ${sqlStr(crypto.randomUUID())},
  ${sqlStr(String(args.login).toLowerCase())},
  ${sqlStr(f.password_hash)},
  ${sqlStr(f.password_salt)},
  ${f.password_iters},
  ${sqlStr(args.name)},
  'teacher',
  1,
  1
);
`;
}

writeFileSync(outPath, sql, 'utf8');
console.log(`생성됨: ${outPath}`);
console.log('다음: npx wrangler d1 execute <DB> --file ' + outPath + '   (실행 후 파일 삭제)');
