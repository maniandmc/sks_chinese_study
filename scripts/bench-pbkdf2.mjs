#!/usr/bin/env node
/**
 * 5.2 / 12.5 — PBKDF2 반복 횟수와 CPU 시간 측정.
 *
 * 로컬 결과는 참고치일 뿐이다. **무료 플랜의 요청당 CPU 제한(약 10ms)** 판단은
 * 반드시 배포 환경에서 실제 로그인으로 확인해야 한다 (M2 완료 기준).
 * 로컬 값이 이미 10ms를 훌쩍 넘으면 배포 전에 계획을 세울 근거가 된다.
 *
 * 사용법: node scripts/bench-pbkdf2.mjs [반복횟수...]
 */

import { hashPassword, newSalt } from '../src/lib/password.js';

const iterations = process.argv.slice(2).map(Number).filter(Boolean);
const targets = iterations.length ? iterations : [10000, 25000, 50000, 100000];
const salt = newSalt();
const ROUNDS = 5;

console.log('PBKDF2-SHA-256 / 256bit / salt 16B');
console.log('반복횟수\t평균(ms)\t최대(ms)');

for (const iters of targets) {
  const times = [];
  for (let i = 0; i < ROUNDS; i++) {
    const t0 = performance.now();
    await hashPassword('benchmark-password', salt, iters);
    times.push(performance.now() - t0);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`${iters}\t\t${avg.toFixed(2)}\t\t${Math.max(...times).toFixed(2)}`);
}

console.log(`
참고
 - 로그인 요청 1회당 해시 1회(실패한 로그인도 더미 해시 1회)가 든다.
 - 배포 후 실제 로그인 응답의 CPU 시간을 Cloudflare 대시보드에서 확인하고,
   초과하면 (a) 반복 횟수 하향 (b) 유료 플랜 중 하나를 택한다.
 - 반복 횟수는 users.password_iters에 사용자별로 저장되므로,
   기존 계정을 건드리지 않고 신규/변경 계정부터 값을 바꿀 수 있다.`);
