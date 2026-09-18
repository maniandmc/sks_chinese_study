'use strict';

/* ============================================================
   views.js — 홈 화면 / 북마크 화면
   ============================================================ */

const Views = (() => {

  async function renderHome(container) {
    const meta = await App.getLessonsMeta();
    const lastId = App.getLastLessonId() || meta.lessons[0].id;
    const lastLesson = await App.getLesson(lastId);
    const pct = App.getLessonPercent(lastId);

    const lessonCards = await Promise.all(meta.lessons.map(async (l) => {
      const p = App.getLessonPercent(l.id);
      return `
        <button class="lesson-card" onclick="App.navigate('reader', {lessonId:${l.id}})">
          <p class="lc-num zh">${l.title}</p>
          <p class="lc-title zh">${l.chineseTitle}</p>
          <div class="lc-progress-row">
            <div class="progress-bar-track" style="flex:1"><div class="progress-bar-fill" style="width:${p}%"></div></div>
            <span class="lc-percent">${p}%</span>
          </div>
        </button>
      `;
    }));

    container.innerHTML = `
      <div class="content-inner">
        <div class="home-hero">
          <h1>중국어 온라인 교재</h1>
          <p>오늘도 중국어를 한 걸음씩 공부해요.</p>
        </div>

        <div class="continue-card">
          <p class="cc-label zh">현재 학습 · ${lastLesson.title}</p>
          <p class="cc-title zh">${lastLesson.chineseTitle}</p>
          <p class="cc-sub">${lastLesson.koreanTitle}</p>
          <div class="cc-progress-row">
            <div class="progress-bar-track" style="flex:1"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
            <span class="cc-percent">${pct}%</span>
          </div>
          <button class="btn-primary" onclick="App.navigate('reader', {lessonId:${lastId}})">
            계속 공부하기 ${App.ICONS.chevronRight}
          </button>
        </div>

        <p class="section-heading">전체 단원</p>
        <div class="lesson-grid">
          ${lessonCards.join('')}
        </div>
      </div>
    `;
  }

  async function renderBookmarks(container) {
    const bookmarks = App.getBookmarks();
    const lessons = await App.getAllLessons();
    const meta = await App.getLessonsMeta();

    // 북마크된 단어
    const wordItems = [];
    lessons.forEach((lesson, idx) => {
      if (!lesson) return;
      lesson.vocabulary.forEach(v => {
        if (bookmarks.words.includes(v.word)) {
          wordItems.push({ ...v, lessonId: lesson.id, lessonTitle: meta.lessons[idx].title });
        }
      });
    });

    // 북마크된 문장
    const sentenceItems = [];
    lessons.forEach((lesson, idx) => {
      if (!lesson) return;
      lesson.sentences.forEach(s => {
        if (bookmarks.sentences.includes(s.id)) {
          sentenceItems.push({ ...s, lessonId: lesson.id, lessonTitle: meta.lessons[idx].title });
        }
      });
    });

    const isEmpty = wordItems.length === 0 && sentenceItems.length === 0;

    if (isEmpty) {
      container.innerHTML = `
        <div class="content-inner">
          <div class="page-header">
            <h1>북마크</h1>
            <p>저장한 단어와 문장을 모아볼 수 있어요.</p>
          </div>
          <div class="empty-state">
            ${App.ICONS.bookmark}
            <p>아직 저장한 단어나 문장이 없습니다.</p>
          </div>
        </div>
      `;
      return;
    }

    const sentenceHTML = sentenceItems.map(s => `
      <div class="sentence-block" style="cursor:default;" onclick="App.navigate('reader', {lessonId:${s.lessonId}, tab:'text'})">
        <div class="sb-chinese zh">${s.chinese}</div>
        <div class="sb-translation show">${s.translation}</div>
        <div class="ln-progress" style="margin-top:6px;color:var(--color-text-tertiary);font-size:12px;">${s.lessonTitle}</div>
      </div>
    `).join('');

    const wordHTML = wordItems.map(v => `
      <div class="vocab-card">
        <div class="vc-left">
          <div class="vc-word zh">${v.word}</div>
          <div class="vc-pinyin">${v.pinyin} · ${v.lessonTitle}</div>
        </div>
        <div class="vc-meaning">
          ${v.meaning}
          <span class="vc-pos">${v.partOfSpeech}</span>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="content-inner">
        <div class="page-header">
          <h1>북마크</h1>
          <p>저장한 단어와 문장을 모아볼 수 있어요.</p>
        </div>

        ${sentenceItems.length ? `
          <p class="section-heading">저장한 문장 (${sentenceItems.length})</p>
          <div class="passage" style="margin-bottom:30px;">${sentenceHTML}</div>
        ` : ''}

        ${wordItems.length ? `
          <p class="section-heading">저장한 단어 (${wordItems.length})</p>
          <div class="vocab-cards" style="display:flex;">${wordHTML}</div>
        ` : ''}
      </div>
    `;
  }

  return { renderHome, renderBookmarks };
})();
