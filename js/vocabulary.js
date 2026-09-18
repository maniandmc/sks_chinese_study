'use strict';

/* ============================================================
   vocabulary.js — 단어 탭(표/카드), 단어 상세, 전역 단어장
   ============================================================ */

const Vocabulary = (() => {

  let currentLessonRef = null;

  /* ================= 단원 내 단어 탭 ================= */

  function renderLessonVocab(container, lesson) {
    currentLessonRef = lesson;

    container.innerHTML = `
      <div class="inline-edit-banner">${App.ICONS.edit} 편집 모드입니다. 단어 행에 마우스를 올리면 수정·삭제 버튼이 나타납니다.</div>
      <div class="vocab-search">
        ${App.ICONS.search}
        <input type="text" id="lesson-vocab-search" placeholder="단어, 병음, 뜻으로 검색">
      </div>
      <table class="vocab-table" id="lesson-vocab-table">
        <thead>
          <tr><th>단어</th><th>병음</th><th>품사</th><th>뜻</th><th class="inline-edit-controls-th"></th></tr>
        </thead>
        <tbody></tbody>
      </table>
      <div class="vocab-cards" id="lesson-vocab-cards"></div>
      <button class="btn-primary inline-add-btn" id="btn-add-vocab">${App.ICONS.plus} 단어 추가</button>
      <div id="vocab-edit-form-host"></div>
      <div class="word-detail" id="lesson-word-detail"></div>
    `;

    renderVocabList(lesson.vocabulary);

    container.querySelector('#lesson-vocab-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const filtered = lesson.vocabulary.filter(v =>
        v.word.toLowerCase().includes(q) ||
        v.pinyin.toLowerCase().includes(q) ||
        v.meaning.toLowerCase().includes(q) ||
        v.partOfSpeech.toLowerCase().includes(q)
      );
      renderVocabList(filtered);
    });

    container.querySelector('#btn-add-vocab').addEventListener('click', () => {
      EditorForms.renderVocabForm(document.getElementById('vocab-edit-form-host'), lesson.id, null, async () => {
        App.invalidateCache();
        const refreshed = await App.getLesson(lesson.id);
        currentLessonRef = refreshed;
        renderVocabList(refreshed.vocabulary);
        App.renderInfoPanel(refreshed);
      });
    });

    App.setLessonProgressField(lesson.id, 'vocab', true);
    App.renderInfoPanel(lesson);
    App.renderSidebarLessonList();
  }

  function renderVocabList(list) {
    const tbody = document.querySelector('#lesson-vocab-table tbody');
    const cardsEl = document.getElementById('lesson-vocab-cards');

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="vocab-empty">검색 결과가 없습니다</td></tr>`;
      cardsEl.innerHTML = `<div class="vocab-empty">검색 결과가 없습니다</div>`;
      return;
    }

    tbody.innerHTML = list.map(v => `
      <tr data-word="${encodeURIComponent(v.word)}">
        <td class="vt-word zh">${v.word}</td>
        <td>${v.pinyin}</td>
        <td class="vt-pos">${v.partOfSpeech}</td>
        <td>${v.meaning}</td>
        <td class="vt-row-edit-cell">
          <div class="inline-edit-controls">
            <button class="inline-edit-btn" data-edit-word="${encodeURIComponent(v.word)}" title="수정" aria-label="단어 수정">${App.ICONS.edit}</button>
            <button class="inline-edit-btn danger" data-delete-word="${encodeURIComponent(v.word)}" title="삭제" aria-label="단어 삭제">${App.ICONS.trash}</button>
          </div>
        </td>
      </tr>
    `).join('');

    cardsEl.innerHTML = list.map(v => `
      <div class="vocab-card" data-word="${encodeURIComponent(v.word)}">
        <div class="vc-left">
          <div class="vc-word zh">${v.word}</div>
          <div class="vc-pinyin">${v.pinyin}</div>
        </div>
        <div class="vc-meaning">
          ${v.meaning}
          <span class="vc-pos">${v.partOfSpeech}</span>
        </div>
        <div class="inline-edit-controls">
          <button class="inline-edit-btn" data-edit-word="${encodeURIComponent(v.word)}" title="수정" aria-label="단어 수정">${App.ICONS.edit}</button>
          <button class="inline-edit-btn danger" data-delete-word="${encodeURIComponent(v.word)}" title="삭제" aria-label="단어 삭제">${App.ICONS.trash}</button>
        </div>
      </div>
    `).join('');

    tbody.querySelectorAll('tr[data-word]').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.inline-edit-btn')) return;
        showWordDetail(decodeURIComponent(row.dataset.word));
      });
    });
    cardsEl.querySelectorAll('.vocab-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.inline-edit-btn')) return;
        showWordDetail(decodeURIComponent(card.dataset.word));
      });
    });

    tbody.querySelectorAll('[data-edit-word]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const word = decodeURIComponent(btn.dataset.editWord);
        const v = currentLessonRef.vocabulary.find(item => item.word === word);
        EditorForms.renderVocabForm(document.getElementById('vocab-edit-form-host'), currentLessonRef.id, v, async () => {
          App.invalidateCache();
          const refreshed = await App.getLesson(currentLessonRef.id);
          currentLessonRef = refreshed;
          renderVocabList(refreshed.vocabulary);
          App.renderInfoPanel(refreshed);
        });
      });
    });
    cardsEl.querySelectorAll('[data-edit-word]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const word = decodeURIComponent(btn.dataset.editWord);
        const v = currentLessonRef.vocabulary.find(item => item.word === word);
        EditorForms.renderVocabForm(document.getElementById('vocab-edit-form-host'), currentLessonRef.id, v, async () => {
          App.invalidateCache();
          const refreshed = await App.getLesson(currentLessonRef.id);
          currentLessonRef = refreshed;
          renderVocabList(refreshed.vocabulary);
          App.renderInfoPanel(refreshed);
        });
      });
    });

    tbody.querySelectorAll('[data-delete-word]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const word = decodeURIComponent(btn.dataset.deleteWord);
        if (!confirm(`"${word}" 단어를 삭제하시겠습니까?`)) return;
        await App.deleteVocabWord(currentLessonRef.id, word);
        App.invalidateCache();
        const refreshed = await App.getLesson(currentLessonRef.id);
        currentLessonRef = refreshed;
        App.showToast('단어를 삭제했습니다');
        renderVocabList(refreshed.vocabulary);
        App.renderInfoPanel(refreshed);
      });
    });
    cardsEl.querySelectorAll('[data-delete-word]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const word = decodeURIComponent(btn.dataset.deleteWord);
        if (!confirm(`"${word}" 단어를 삭제하시겠습니까?`)) return;
        await App.deleteVocabWord(currentLessonRef.id, word);
        App.invalidateCache();
        const refreshed = await App.getLesson(currentLessonRef.id);
        currentLessonRef = refreshed;
        App.showToast('단어를 삭제했습니다');
        renderVocabList(refreshed.vocabulary);
        App.renderInfoPanel(refreshed);
      });
    });
  }

  function showWordDetail(word) {
    const v = currentLessonRef.vocabulary.find(item => item.word === word);
    if (!v) return;

    const isSaved = App.isBookmarked('words', v.word);
    const detail = document.getElementById('lesson-word-detail');
    detail.innerHTML = `
      <p class="wd-word zh">${v.word}</p>
      <p class="wd-pinyin">${v.pinyin}</p>
      <span class="wd-pos">${v.partOfSpeech}</span>
      <p class="wd-meaning">${v.meaning}</p>
      <div class="wd-actions">
        <button class="action-chip" id="btn-speak-word">${App.ICONS.volume} 발음</button>
        <button class="action-chip ${isSaved ? 'saved' : ''}" id="btn-save-word">
          ${isSaved ? App.ICONS.starFilled : App.ICONS.star} ${isSaved ? '저장됨' : '단어장에 저장'}
        </button>
      </div>
      <p class="wd-example-label">예문</p>
      <p class="wd-example zh">${v.example}</p>
    `;
    detail.classList.add('show');

    detail.querySelector('#btn-speak-word').addEventListener('click', () => App.speak(v.word));
    detail.querySelector('#btn-save-word').addEventListener('click', () => {
      const nowSaved = App.toggleBookmark('words', v.word);
      App.showToast(nowSaved ? '단어장에 저장했습니다' : '저장을 취소했습니다');
      showWordDetail(word);
    });

    if (typeof detail.scrollIntoView === 'function') {
      detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  async function showWordDetailByWord(lessonId, word) {
    const lesson = await App.getLesson(lessonId);
    currentLessonRef = lesson;
    showWordDetail(word);
  }

  /* ================= 전역 단어장 페이지 ================= */

  async function renderGlobalVocab(container) {
    const lessons = await App.getAllLessons();
    const meta = await App.getLessonsMeta();

    const allWords = [];
    lessons.forEach((lesson, idx) => {
      if (!lesson) return;
      lesson.vocabulary.forEach(v => {
        allWords.push({ ...v, lessonId: lesson.id, lessonTitle: meta.lessons[idx].title });
      });
    });

    container.innerHTML = `
      <div class="content-inner">
        <div class="page-header">
          <h1>전체 단어장</h1>
          <p>모든 단원의 단어를 한 번에 검색하고 살펴보세요.</p>
        </div>
        <div class="vocab-search">
          ${App.ICONS.search}
          <input type="text" id="global-vocab-search" placeholder="단어, 병음, 뜻, 품사, 단원으로 검색">
        </div>
        <table class="vocab-table" id="global-vocab-table">
          <thead>
            <tr><th>단어</th><th>병음</th><th>품사</th><th>뜻</th><th>단원</th></tr>
          </thead>
          <tbody></tbody>
        </table>
        <div class="vocab-cards" id="global-vocab-cards"></div>
      </div>
    `;

    renderGlobalList(allWords);

    document.getElementById('global-vocab-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const filtered = allWords.filter(v =>
        v.word.toLowerCase().includes(q) ||
        v.pinyin.toLowerCase().includes(q) ||
        v.meaning.toLowerCase().includes(q) ||
        v.partOfSpeech.toLowerCase().includes(q) ||
        v.lessonTitle.toLowerCase().includes(q)
      );
      renderGlobalList(filtered);
    });
  }

  function renderGlobalList(list) {
    const tbody = document.querySelector('#global-vocab-table tbody');
    const cardsEl = document.getElementById('global-vocab-cards');

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="vocab-empty">검색 결과가 없습니다</td></tr>`;
      cardsEl.innerHTML = `<div class="vocab-empty">검색 결과가 없습니다</div>`;
      return;
    }

    tbody.innerHTML = list.map(v => `
      <tr onclick="App.goToWordFromSearch(${v.lessonId}, '${encodeURIComponent(v.word)}')">
        <td class="vt-word zh">${v.word}</td>
        <td>${v.pinyin}</td>
        <td class="vt-pos">${v.partOfSpeech}</td>
        <td>${v.meaning}</td>
        <td class="zh" style="color:var(--color-text-tertiary);font-size:13px;">${v.lessonTitle}</td>
      </tr>
    `).join('');

    cardsEl.innerHTML = list.map(v => `
      <div class="vocab-card" onclick="App.goToWordFromSearch(${v.lessonId}, '${encodeURIComponent(v.word)}')">
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
  }

  return { renderLessonVocab, showWordDetailByWord, renderGlobalVocab };
})();
