/**
 * 설계 문서 6.5 — 검색용 병음 정규화.
 * 서버(저장 시)와 이관 스크립트가 **이 모듈 하나만** 사용한다.
 * 프로토타입 app.js의 검색 규칙(성조 무시, ü/ǖ 계열 → v)과 동일하게 맞췄다.
 */

const TONE_MAP = {
  ā: 'a', á: 'a', ǎ: 'a', à: 'a', a: 'a',
  ē: 'e', é: 'e', ě: 'e', è: 'e',
  ī: 'i', í: 'i', ǐ: 'i', ì: 'i',
  ō: 'o', ó: 'o', ǒ: 'o', ò: 'o',
  ū: 'u', ú: 'u', ǔ: 'u', ù: 'u',
  ǖ: 'v', ǘ: 'v', ǚ: 'v', ǜ: 'v', ü: 'v',
  ń: 'n', ň: 'n', ǹ: 'n', ḿ: 'm',
};

/** 병음 문자열 → 성조 없는 소문자, 공백 제거 */
export function normalizePinyin(input) {
  if (input == null) return '';
  let s = String(input).toLowerCase();
  // 결합 문자(U+0304 등)로 표현된 성조도 처리
  s = s.normalize('NFC');
  let out = '';
  for (const ch of s) {
    out += TONE_MAP[ch] !== undefined ? TONE_MAP[ch] : ch;
  }
  // 남아 있는 결합 성조 기호 제거
  out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return out.replace(/\s+/g, '');
}

/** 검색어 정규화 — 저장값과 같은 함수를 써야 성조 무시 검색이 성립한다 */
export function normalizeQuery(input) {
  return normalizePinyin(input);
}
