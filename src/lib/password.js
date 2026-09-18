/**
 * 설계 문서 5.2 / 5.6 — 비밀번호.
 * PBKDF2-SHA-256, salt 16바이트, base64 저장.
 * Workers의 PBKDF2 반복 횟수 상한이 100,000이므로 그 값을 기본으로 쓴다.
 * (상한을 넘기면 Workers가 요청을 거부한다 — 부록 A A-7)
 */

export const DEFAULT_ITERS = 100000;
export const SALT_BYTES = 16;
export const HASH_BITS = 256;

const enc = new TextEncoder();

export function toBase64(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function newSalt() {
  return toBase64(randomBytes(SALT_BYTES));
}

/** @returns {Promise<string>} base64 해시 */
export async function hashPassword(password, saltB64, iters = DEFAULT_ITERS) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(saltB64), iterations: iters },
    key,
    HASH_BITS,
  );
  return toBase64(bits);
}

/** 상수 시간 비교 (5.2) */
export function timingSafeEqual(a, b) {
  const ab = enc.encode(String(a));
  const bb = enc.encode(String(b));
  // 길이 차이가 즉시 노출되지 않도록 길이가 달라도 전체를 순회한다
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

export async function verifyPassword(password, user) {
  const computed = await hashPassword(password, user.password_salt, user.password_iters);
  return timingSafeEqual(computed, user.password_hash);
}

export async function createPasswordFields(password, iters = DEFAULT_ITERS) {
  const salt = newSalt();
  const hash = await hashPassword(password, salt, iters);
  return { password_hash: hash, password_salt: salt, password_iters: iters };
}

/** 혼동 문자(0/O/1/l/I 등) 제외 — 5.6 */
const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateTempPassword(length = 12) {
  const bytes = randomBytes(length * 2);
  let out = '';
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    // 모듈로 편향을 피하려고 알파벳 길이의 배수 범위를 벗어난 값은 버린다
    const limit = 256 - (256 % TEMP_ALPHABET.length);
    if (bytes[i] >= limit) continue;
    out += TEMP_ALPHABET[bytes[i] % TEMP_ALPHABET.length];
  }
  return out.length === length ? out : out + generateTempPassword(length - out.length);
}

/**
 * 비밀번호 정책 (5.2): 최소 8자, login_id와 동일 금지. 복잡도 규칙 없음.
 * @returns {string|null} 오류 메시지 또는 null
 */
export function validatePasswordPolicy(password, loginId) {
  if (typeof password !== 'string' || password.length < 8) {
    return '비밀번호는 8자 이상이어야 합니다.';
  }
  if (password.length > 200) return '비밀번호가 너무 깁니다.';
  if (loginId && password.toLowerCase() === String(loginId).toLowerCase()) {
    return '비밀번호는 로그인 ID와 같을 수 없습니다.';
  }
  return null;
}
