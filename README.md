# 중국어 온라인 교재 — 서버 (M1 ~ M3)

설계 문서 v1.1의 **M1(스키마·이관) / M2(인증) / M3(권한 코어)** 구현입니다.
런타임·테스트 모두 **외부 의존성이 없습니다**(Node 22.5+ 내장 모듈과 Web Crypto만 사용).

```
migrations/0001_init.sql      6.3 스키마
scripts/seed-teacher.mjs      부록 C — 시드 교사 생성 / 비번 복구 SQL 생성
scripts/migrate-prototype.mjs 11장 — 프로토타입 JSON → INSERT SQL
scripts/bench-pbkdf2.mjs      5.2 — 반복 횟수별 CPU 시간 측정
src/lib/http.js               8.1 응답 규약, ApiError
src/lib/router.js             경량 라우터
src/lib/normalize.js          6.5 병음 정규화 (서버·이관 스크립트 공용)
src/lib/password.js           5.2 PBKDF2, 상수 시간 비교, 임시 비번
src/lib/session.js            5.3/5.4 KV 세션 + D1 재검증
src/lib/permissions.js        7장 권한 코어  ← M3의 핵심
src/routes/auth.js            8.2 /auth/*
src/routes/lessons.js         8.4~8.7 읽기 구현 + 쓰기 게이트
src/worker.js                 4장 — 라우팅·CSRF·정적 서빙
public/                       기존 프로토타입 (아직 손대지 않음, M6에서 연동)
test/                         61개 테스트 (스키마·이관·인증·권한 매트릭스)
```

## 실행

```bash
node --test test/*.test.mjs      # 전체 테스트 (약 1초)
node scripts/bench-pbkdf2.mjs    # 반복 횟수별 CPU 시간
```

### 처음 세팅 (로컬)

```bash
npx wrangler d1 create textbook
npx wrangler kv namespace create SESSIONS
# 발급된 ID를 wrangler.jsonc에 채운 뒤
npx wrangler d1 migrations apply textbook --local

# 시드 교사 (평문 비번은 stdin으로만 전달)
printf '%s' '임시비번8자이상' | node scripts/seed-teacher.mjs \
  --login teacher1 --name '김선생' --out seed.sql
npx wrangler d1 execute textbook --local --file seed.sql && rm seed.sql

# 프로토타입 교재 이관
node scripts/migrate-prototype.mjs --data public/data \
  --teacher-login teacher1 --class-name '샘플 클래스' --out sample.sql
npx wrangler d1 execute textbook --local --file sample.sql

npx wrangler dev
```

## 완료 기준 대비 상태

| 단계 | DoD | 상태 |
|---|---|---|
| M1 | 11.3 검증 쿼리 통과 | ✅ `migrate.test.mjs` — 단원 3 / 문장 10 / 단어 14 / 문법 5 / 퀴즈 6 |
| M1 | CASCADE / SET NULL / CHECK 확인 | ✅ `schema.test.mjs` (단, 아래 "남은 확인" 참고) |
| M2 | 5.4의 5단계 검사 동작 | ✅ `auth.test.mjs` |
| M2 | 정지 후 다음 요청에서 401 | ✅ (KV 세션이 살아 있어도 D1 조회로 차단) |
| M2 | **실제 배포 환경에서 로그인 성공(CPU 확인)** | ⏳ 배포 필요 — 아래 ①번 |
| M3 | 매트릭스 전 셀 통과 | ✅ `permissions.test.mjs` (한 셀은 의도적으로 다름 — ③번) |
| M3 | 타 단원 하위 ID 우회 차단 | ✅ `requireChildRow` + 테스트 |

### 쓰기 엔드포인트가 501을 돌려주는 이유

M3의 목표는 "권한 게이트 확정"입니다. 그래서 `/lessons/:id` 계열 **쓰기 경로의 라우트와 게이트는
전부 자리에 있고**, 본체만 `501 NOT_IMPLEMENTED`입니다. 테스트는 "게이트를 통과했다"를 501로 확인합니다.
M4/M5에서 핸들러를 채운 뒤 `permissions.test.mjs`의 `GATE_PASSED` 상수를 200/201/204로 바꾸면
그대로 회귀 테스트가 됩니다.

## 결정이 필요하거나 알아두셔야 할 것

**① PBKDF2 100,000회는 무료 플랜에서 위험합니다.**
로컬 측정값이 100,000회에서 약 17.6ms입니다(50,000회 ≈ 9.3ms). 무료 플랜의 요청당 CPU 제한이
약 10ms라 로그인이 시간 초과될 가능성이 높습니다. 선택지는 (a) 반복 횟수를 50,000 이하로 낮추기
(b) 유료 플랜. `users.password_iters`가 사용자별 컬럼이라 **나중에 계정을 건드리지 않고 바꿀 수 있습니다.**
배포 후 실제 로그인으로 한 번 측정하고 정하시면 됩니다.

**② 잠금 응답은 계정 존재를 약간 노출합니다.**
5.5는 "존재하지 않는 ID도 같은 응답"을 요구하지만, 10.2는 로그인 화면에 잠금 메시지를 요구합니다.
현재는 비밀번호 오류·없는 계정 = 동일한 401, 잠긴 계정만 429로 구분합니다. 노출을 완전히 막으려면
잠금도 401로 합치면 되는데, 그러면 사용자가 "왜 맞는 비번이 안 되는지" 알 수 없습니다.

**③ 14.2 매트릭스 한 셀을 다르게 구현했습니다.**
"클래스 멤버 추가/제거 → 학생N(미가입) 403"은 7.3의 "읽기 권한 없는 리소스는 404"와 충돌합니다.
403을 주면 클래스의 존재가 새어 나가므로 **미가입 학생·타 교사는 404**, 가입 학생만 403으로 했습니다.
문서 쪽을 고치시는 게 좋겠습니다.

**④ M0 조사 결과 — 프론트에 XSS 구멍이 있습니다.**
`reader.js`(7), `vocabulary.js`(11), `views.js`(3) = 총 21곳이 `innerHTML`에 콘텐츠를 그대로
끼워 넣는데 `escapeHTML` 호출이 **0회**입니다(`admin.js`·`editor-forms.js`는 escape를 씁니다).
지금은 혼자 쓰는 프로토타입이라 무해하지만, 교사가 쓴 콘텐츠를 학생 브라우저가 렌더하는 순간
저장형 XSS가 됩니다. M6에서 반드시 고쳐야 합니다. 나머지 `App.*` 호출 지점은 아래에 정리했습니다.

**⑤ `login_id`는 소문자로 저장합니다.** 표시 이름은 `display_name`을 씁니다.

**⑥ 남은 확인**: 테스트의 D1은 `node:sqlite` 위에 얹은 shim입니다(외래 키 ON).
실제 D1에서 CASCADE/배치가 같은지는 `wrangler d1` 환경에서 한 번 확인하는 게 좋습니다 —
M1 DoD에 이미 그렇게 적혀 있습니다.

## M0 조사 결과 (부록 B 보강용)

`app.js` 외 파일이 호출하는 `App.*` — 데이터 접근 계층 교체 시 영향 받는 지점:

| 호출 | 횟수 | M6에서 |
|---|---|---|
| `showToast` / `escapeHTML` / `ICONS` / `renderInfoPanel` / `renderSidebarLessonList` | 111 | 그대로 유지 (UI 유틸) |
| `getLesson` | 20 | `GET /lessons/:id` + 캐시 (이미 async) |
| `invalidateCache` | 15 | 쓰기 성공 시 캐시 무효화로 의미 유지 (10.6) |
| `getLessonsMeta` | 5 | 워크스페이스별 목록 API |
| `setLessonProgressField` / `getLessonPercent` | 6 | 낙관적 캐시 갱신 + `PUT /lessons/:id/progress` |
| `toggleBookmark` / `isBookmarked` / `getBookmarks` | 6 | 캐시 + `POST/DELETE /bookmarks` |
| 엔티티 CRUD(`add/update/delete` × 문장·단어·문법·퀴즈·단원) | 17 | 하위 리소스 API. **단어는 식별자가 `word` → `vocab.id`로 바뀜** |
| `getAllLessons` | 2 | 제거 → `GET /vocabulary`, `GET /search` |
| `resetAllEdits` | 1 | 폐기 (3.5) |
| `exportLesson` / `exportAll` | 2 | 클라이언트 변환 유지 |

## 다음 (M4)

`src/routes/lessons.js`의 501 핸들러를 채우는 작업입니다. 게이트·응답 형태·테스트가 이미
자리에 있어서, 각 핸들러는 "검증 → 쿼리 → 응답"만 쓰면 됩니다.
`copy-to-personal`(9.1)만 `db.batch()` 바인딩 파라미터 수를 실제 규모로 확인해야 합니다.
