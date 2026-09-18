/**
 * 의존성 없는 초경량 라우터.
 * 패턴: '/lessons/:id/sentences/:sid'  → params { id, sid }
 * ':' 세그먼트만 지원하면 충분하다(8장 경로 전부 이 형태).
 *
 * 참고: '/classes/:classId/lessons:reorder' 처럼 콜론이 접미로 붙는 경로는
 * 세그먼트 끝에 ':action'이 오는 형태라 리터럴로 취급된다(아래 compile 참고).
 */

function compile(pattern) {
  const parts = pattern.split('/').filter(Boolean);
  return parts.map((p) => {
    // ':reorder' 처럼 세그먼트 전체가 파라미터인 경우만 파라미터로 본다.
    // 'lessons:reorder' 는 리터럴.
    if (p.startsWith(':') && !p.includes(':', 1)) return { param: p.slice(1) };
    return { literal: p };
  });
}

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    this.routes.push({ method, pattern, parts: compile(pattern), handler });
    return this;
  }

  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  patch(p, h) { return this.add('PATCH', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }

  /** @returns {{handler, params}|null} */
  match(method, path) {
    const segs = path.split('/').filter(Boolean);
    let pathMatched = false;
    for (const route of this.routes) {
      if (route.parts.length !== segs.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < segs.length; i++) {
        const part = route.parts[i];
        if (part.literal !== undefined) {
          if (part.literal !== segs[i]) { ok = false; break; }
        } else {
          params[part.param] = decodeURIComponent(segs[i]);
        }
      }
      if (!ok) continue;
      pathMatched = true;
      if (route.method === method) return { handler: route.handler, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}
