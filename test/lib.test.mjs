/**
 * 보조 유닛 테스트 — 정규화(6.5)와 라우터.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePinyin, normalizeQuery } from '../src/lib/normalize.js';
import { Router } from '../src/lib/router.js';
import { timingSafeEqual, generateTempPassword, validatePasswordPolicy } from '../src/lib/password.js';

describe('병음 정규화 (6.5)', () => {
  test('성조를 제거하고 소문자·공백 없는 형태로 만든다', () => {
    assert.equal(normalizePinyin('jiātíng'), 'jiating');
    assert.equal(normalizePinyin('Zhōngguórén de'), 'zhongguorende');
    assert.equal(normalizePinyin('nǚ ér'), 'nver', 'ü 계열은 v로 통일 (프로토타입과 동일)');
  });

  test('결합 문자로 된 성조도 처리한다', () => {
    assert.equal(normalizePinyin('jia\u0304ti\u0301ng'), 'jiating');
  });

  test('검색어와 저장값이 같은 함수로 정규화된다', () => {
    assert.equal(normalizeQuery('JIĀTÍNG'), normalizePinyin('jiātíng'));
  });

  test('빈 값과 null을 안전하게 처리한다', () => {
    assert.equal(normalizePinyin(null), '');
    assert.equal(normalizePinyin(''), '');
  });
});

describe('라우터', () => {
  const router = new Router();
  router.get('/lessons/:id', () => 'lesson');
  router.delete('/lessons/:id/sentences/:sid', () => 'sentence');
  router.post('/classes/:classId/lessons:reorder', () => 'reorder');

  test('파라미터를 추출한다', () => {
    const m = router.match('DELETE', '/lessons/abc/sentences/xyz');
    assert.deepEqual(m.params, { id: 'abc', sid: 'xyz' });
  });

  test(':reorder 같은 접미 액션은 리터럴로 취급한다', () => {
    const m = router.match('POST', '/classes/c1/lessons:reorder');
    assert.deepEqual(m.params, { classId: 'c1' });
    assert.equal(router.match('POST', '/classes/c1/lessons'), null);
  });

  test('경로는 있는데 메서드가 다르면 methodNotAllowed', () => {
    assert.equal(router.match('PUT', '/lessons/abc').methodNotAllowed, true);
  });

  test('없는 경로는 null', () => {
    assert.equal(router.match('GET', '/nope'), null);
  });
});

describe('비밀번호 유틸 (5.2 / 5.6)', () => {
  test('timingSafeEqual', () => {
    assert.equal(timingSafeEqual('abc', 'abc'), true);
    assert.equal(timingSafeEqual('abc', 'abd'), false);
    assert.equal(timingSafeEqual('abc', 'abcd'), false);
  });

  test('임시 비번은 12자 이상이고 혼동 문자를 쓰지 않는다', () => {
    for (let i = 0; i < 20; i++) {
      const p = generateTempPassword();
      assert.equal(p.length, 12);
      assert.doesNotMatch(p, /[0O1lI]/);
    }
  });

  test('비밀번호 정책', () => {
    assert.ok(validatePasswordPolicy('short', 'user'));
    assert.ok(validatePasswordPolicy('studentA', 'studentA'));
    assert.equal(validatePasswordPolicy('goodpassword', 'user'), null);
  });
});
