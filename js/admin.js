'use strict';

/* ============================================================
   admin.js — 교재 관리 화면
   - 단원 추가/수정/삭제
   - 선택 단원의 문장/단어/문법/문제 추가/수정/삭제
     (실제 폼은 EditorForms 공용 모듈을 사용)
   - 편집 내용은 localStorage에 즉시 저장됨
   - "이 단원 내보내기" / "전체 내보내기"로 JSON 파일 다운로드
   ============================================================ */

const Admin = (() => {

  let selectedLessonId = null;

  async function render(container, lessonId) {
    const meta = await App.getLessonsMeta();

    if (lessonId && meta.lessons.some(l => l.id === lessonId)) {
      selectedLessonId = lessonId;
    } else if (selectedLessonId === null && meta.lessons.length > 0) {
      selectedLessonId = meta.lessons[0].id;
    } else if (meta.lessons.length === 0) {
      selectedLessonId = null;
    }

    container.innerHTML = `
      <div class="content-inner" style="max-width:920px;">
        <div class="page-header">
          <h1>교재 관리</h1>
          <p>단원과 본문·단어·문법·문제를 추가·수정·삭제할 수 있습니다. 변경 사항은 이 브라우저에 자동 저장되며, 학습 화면에서 편집한 내용과도 동일하게 반영됩니다.</p>
        </div>

        <div class="admin-toolbar">
          <button class="btn-secondary" id="admin-export-all">${App.ICONS.book} 전체 JSON 내보내기</button>
          <button class="btn-secondary" id="admin-reset-all" style="color:var(--color-error);border-color:var(--color-error-soft);">편집 내용 전체 초기화</button>
        </div>

        <div class="admin-layout">
          <div class="admin-lesson-panel">
            <p class="panel-title">단원 목록</p>
            <div class="admin-lesson-list" id="admin-lesson-list"></div>
            <button class="btn-primary admin-add-lesson-btn" id="admin-add-lesson-btn">+ 새 단원 추가</button>
          </div>
          <div class="admin-detail-panel" id="admin-detail-panel"></div>
        </div>
      </div>
    `;

    container.querySelector('#admin-export-all').addEventListener('click', async () => {
      await App.exportAll();
      App.showToast('전체 단원을 JSON으로 내보냈습니다');
    });

    container.querySelector('#admin-reset-all').addEventListener('click', () => {
      if (!confirm('저장된 모든 편집 내용을 삭제하고 원본 데이터로 되돌립니다. 계속하시겠습니까?')) return;
      App.resetAllEdits();
      selectedLessonId = null;
      App.navigate('admin');
      App.renderSidebarLessonList();
      App.showToast('편집 내용을 초기화했습니다');
    });

    container.querySelector('#admin-add-lesson-btn').addEventListener('click', () => {
      const panel = document.getElementById('admin-detail-panel');
      panel.innerHTML = '<div id="admin-lesson-form-host"></div>';
      EditorForms.renderLessonMetaForm(panel.querySelector('#admin-lesson-form-host'), null, async (cancelled, newId) => {
        if (!cancelled && newId) selectedLessonId = newId;
        App.renderSidebarLessonList();
        const main = document.getElementById('main-content');
        await renderLessonList(main);
        await renderDetailPanel(main);
      });
    });

    await renderLessonList(container);
    await renderDetailPanel(container);
  }

  /* ================= 왼쪽: 단원 목록 ================= */

  async function renderLessonList(container) {
    const meta = await App.getLessonsMeta();
    const listEl = container.querySelector('#admin-lesson-list');

    if (meta.lessons.length === 0) {
      listEl.innerHTML = `<p class="vocab-empty" style="padding:16px 0;">등록된 단원이 없습니다. 아래 버튼으로 추가하세요.</p>`;
      return;
    }

    listEl.innerHTML = meta.lessons.map(l => `
      <button class="admin-lesson-item ${l.id === selectedLessonId ? 'active' : ''}" data-lesson-id="${l.id}">
        <span class="ali-title zh">${l.title}</span>
        <span class="ali-sub zh">${l.chineseTitle}</span>
      </button>
    `).join('');

    listEl.querySelectorAll('.admin-lesson-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        selectedLessonId = Number(btn.dataset.lessonId);
        renderLessonList(container);
        await renderDetailPanel(container);
      });
    });
  }

  /* ================= 오른쪽: 선택 단원 상세 편집 ================= */

  async function renderDetailPanel(container) {
    const panel = container.querySelector('#admin-detail-panel') || document.getElementById('admin-detail-panel');
    if (!panel) return;

    if (!selectedLessonId) {
      panel.innerHTML = `
        <div class="empty-state">
          <p>왼쪽에서 단원을 선택하거나 새 단원을 추가하세요.</p>
        </div>
      `;
      return;
    }

    const lesson = await App.getLesson(selectedLessonId);
    if (!lesson) {
      panel.innerHTML = `<div class="empty-state"><p>단원을 불러올 수 없습니다.</p></div>`;
      return;
    }

    panel.innerHTML = `
      <div class="admin-card">
        <div class="admin-lesson-header-row">
          <div>
            <p class="rh-label zh" style="margin-bottom:2px;">${lesson.title}</p>
            <p class="section-heading" style="margin:0;">${lesson.chineseTitle} <span style="color:var(--color-text-secondary);font-weight:400;">· ${lesson.koreanTitle}</span></p>
          </div>
          <div class="admin-lesson-header-actions">
            <button class="btn-secondary" id="admin-edit-lesson-meta">단원 정보 수정</button>
            <button class="btn-secondary" id="admin-export-lesson">이 단원 내보내기</button>
            <button class="btn-secondary" id="admin-delete-lesson" style="color:var(--color-error);border-color:var(--color-error-soft);">단원 삭제</button>
          </div>
        </div>
        <div id="admin-lesson-meta-form-host"></div>
      </div>

      <div class="tab-row" id="admin-tab-row">
        <button class="tab-btn active" data-atab="sentence">문장 (${lesson.sentences.length})</button>
        <button class="tab-btn" data-atab="vocab">단어 (${lesson.vocabulary.length})</button>
        <button class="tab-btn" data-atab="grammar">문법 (${lesson.grammar.length})</button>
        <button class="tab-btn" data-atab="quiz">문제 (${lesson.quiz.length})</button>
      </div>
      <div id="admin-tab-content"></div>
    `;

    panel.querySelector('#admin-edit-lesson-meta').addEventListener('click', () => {
      const host = panel.querySelector('#admin-lesson-meta-form-host');
      EditorForms.renderLessonMetaForm(host, lesson, async () => {
        App.renderSidebarLessonList();
        const main = document.getElementById('main-content');
        await renderLessonList(main);
        await renderDetailPanel(main);
      });
    });

    panel.querySelector('#admin-export-lesson').addEventListener('click', async () => {
      await App.exportLesson(lesson.id);
      App.showToast(`${lesson.title} 데이터를 내보냈습니다`);
    });

    panel.querySelector('#admin-delete-lesson').addEventListener('click', async () => {
      if (!confirm(`${lesson.title} (${lesson.chineseTitle}) 단원을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
      await App.deleteLesson(lesson.id);
      selectedLessonId = null;
      App.renderSidebarLessonList();
      const main = document.getElementById('main-content');
      await renderLessonList(main);
      await renderDetailPanel(main);
      App.showToast('단원을 삭제했습니다');
    });

    panel.querySelectorAll('#admin-tab-row .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('#admin-tab-row .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderAdminTab(btn.dataset.atab, lesson);
      });
    });

    renderAdminTab('sentence', lesson);
  }

  function renderAdminTab(tab, lesson) {
    const content = document.getElementById('admin-tab-content');
    if (!content) return;
    if (tab === 'sentence') renderSentenceAdmin(content, lesson);
    else if (tab === 'vocab') renderVocabAdmin(content, lesson);
    else if (tab === 'grammar') renderGrammarAdmin(content, lesson);
    else if (tab === 'quiz') renderQuizAdmin(content, lesson);
  }

  async function refreshAfterEdit(tab) {
    App.invalidateCache();
    const lesson = await App.getLesson(selectedLessonId);
    App.renderSidebarLessonList();
    const main = document.getElementById('main-content');
    await renderDetailPanel(main); // 탭 카운트 갱신 위해 헤더도 다시 그림
    const tabBtn = document.querySelector(`#admin-tab-row .tab-btn[data-atab="${tab}"]`);
    if (tabBtn) {
      document.querySelectorAll('#admin-tab-row .tab-btn').forEach(b => b.classList.remove('active'));
      tabBtn.classList.add('active');
    }
    renderAdminTab(tab, lesson);
  }

  /* ---------------- 문장 관리 ---------------- */

  function renderSentenceAdmin(content, lesson) {
    const rows = lesson.sentences.map(s => `
      <div class="admin-row" data-id="${s.id}">
        <div class="admin-row-main">
          <p class="zh admin-row-zh">${App.escapeHTML(s.chinese)}</p>
          <p class="admin-row-sub">${App.escapeHTML(s.pinyin)}</p>
          <p class="admin-row-sub">${App.escapeHTML(s.translation)}</p>
        </div>
        <div class="admin-row-actions">
          <button class="icon-text-btn" data-action="edit">수정</button>
          <button class="icon-text-btn danger" data-action="delete">삭제</button>
        </div>
      </div>
    `).join('');

    content.innerHTML = `
      <div class="admin-list">${rows || emptyRow('아직 등록된 문장이 없습니다')}</div>
      <button class="btn-primary admin-add-btn" id="admin-add-sentence">+ 문장 추가</button>
      <div id="admin-inline-form"></div>
    `;

    content.querySelectorAll('.admin-row').forEach(row => {
      const id = row.dataset.id;
      const sentence = lesson.sentences.find(s => s.id === id);
      row.querySelector('[data-action="edit"]').addEventListener('click', () => {
        EditorForms.renderSentenceForm(content.querySelector('#admin-inline-form'), lesson.id, sentence, () => refreshAfterEdit('sentence'));
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm('이 문장을 삭제하시겠습니까?')) return;
        await App.deleteSentence(lesson.id, id);
        App.showToast('문장을 삭제했습니다');
        refreshAfterEdit('sentence');
      });
    });

    content.querySelector('#admin-add-sentence').addEventListener('click', () => {
      EditorForms.renderSentenceForm(content.querySelector('#admin-inline-form'), lesson.id, null, () => refreshAfterEdit('sentence'));
    });
  }

  /* ---------------- 단어 관리 ---------------- */

  function renderVocabAdmin(content, lesson) {
    const rows = lesson.vocabulary.map(v => `
      <div class="admin-row" data-word="${encodeURIComponent(v.word)}">
        <div class="admin-row-main">
          <p class="zh admin-row-zh">${App.escapeHTML(v.word)} <span class="admin-row-sub" style="display:inline;">${App.escapeHTML(v.pinyin)} · ${App.escapeHTML(v.partOfSpeech)}</span></p>
          <p class="admin-row-sub">${App.escapeHTML(v.meaning)}</p>
        </div>
        <div class="admin-row-actions">
          <button class="icon-text-btn" data-action="edit">수정</button>
          <button class="icon-text-btn danger" data-action="delete">삭제</button>
        </div>
      </div>
    `).join('');

    content.innerHTML = `
      <div class="admin-list">${rows || emptyRow('아직 등록된 단어가 없습니다')}</div>
      <button class="btn-primary admin-add-btn" id="admin-add-vocab">+ 단어 추가</button>
      <div id="admin-inline-form"></div>
    `;

    content.querySelectorAll('.admin-row').forEach(row => {
      const word = decodeURIComponent(row.dataset.word);
      const v = lesson.vocabulary.find(item => item.word === word);
      row.querySelector('[data-action="edit"]').addEventListener('click', () => {
        EditorForms.renderVocabForm(content.querySelector('#admin-inline-form'), lesson.id, v, () => refreshAfterEdit('vocab'));
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm(`"${word}" 단어를 삭제하시겠습니까?`)) return;
        await App.deleteVocabWord(lesson.id, word);
        App.showToast('단어를 삭제했습니다');
        refreshAfterEdit('vocab');
      });
    });

    content.querySelector('#admin-add-vocab').addEventListener('click', () => {
      EditorForms.renderVocabForm(content.querySelector('#admin-inline-form'), lesson.id, null, () => refreshAfterEdit('vocab'));
    });
  }

  /* ---------------- 문법 관리 ---------------- */

  function renderGrammarAdmin(content, lesson) {
    const rows = lesson.grammar.map(g => `
      <div class="admin-row" data-id="${g.id}">
        <div class="admin-row-main">
          <p class="admin-row-zh">${g.number}. ${App.escapeHTML(g.title)}</p>
          <p class="admin-row-sub">${App.escapeHTML(g.description)}</p>
        </div>
        <div class="admin-row-actions">
          <button class="icon-text-btn" data-action="edit">수정</button>
          <button class="icon-text-btn danger" data-action="delete">삭제</button>
        </div>
      </div>
    `).join('');

    content.innerHTML = `
      <div class="admin-list">${rows || emptyRow('아직 등록된 문법이 없습니다')}</div>
      <button class="btn-primary admin-add-btn" id="admin-add-grammar">+ 문법 추가</button>
      <div id="admin-inline-form"></div>
    `;

    content.querySelectorAll('.admin-row').forEach(row => {
      const id = row.dataset.id;
      const g = lesson.grammar.find(item => item.id === id);
      row.querySelector('[data-action="edit"]').addEventListener('click', () => {
        EditorForms.renderGrammarForm(content.querySelector('#admin-inline-form'), lesson.id, g, () => refreshAfterEdit('grammar'));
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm('이 문법 항목을 삭제하시겠습니까?')) return;
        await App.deleteGrammar(lesson.id, id);
        App.showToast('문법 항목을 삭제했습니다');
        refreshAfterEdit('grammar');
      });
    });

    content.querySelector('#admin-add-grammar').addEventListener('click', () => {
      EditorForms.renderGrammarForm(content.querySelector('#admin-inline-form'), lesson.id, null, () => refreshAfterEdit('grammar'));
    });
  }

  /* ---------------- 연습문제 관리 ---------------- */

  function renderQuizAdmin(content, lesson) {
    const rows = lesson.quiz.map((q, i) => `
      <div class="admin-row" data-id="${q.id}">
        <div class="admin-row-main">
          <p class="admin-row-zh">Q${i + 1}. ${App.escapeHTML(q.question)}</p>
          <p class="admin-row-sub">보기: ${q.options.map(App.escapeHTML).join(' / ')}</p>
          <p class="admin-row-sub">정답: ${App.escapeHTML(q.options[q.answerIndex])}</p>
        </div>
        <div class="admin-row-actions">
          <button class="icon-text-btn" data-action="edit">수정</button>
          <button class="icon-text-btn danger" data-action="delete">삭제</button>
        </div>
      </div>
    `).join('');

    content.innerHTML = `
      <div class="admin-list">${rows || emptyRow('아직 등록된 문제가 없습니다')}</div>
      <button class="btn-primary admin-add-btn" id="admin-add-quiz">+ 문제 추가</button>
      <div id="admin-inline-form"></div>
    `;

    content.querySelectorAll('.admin-row').forEach(row => {
      const id = row.dataset.id;
      const q = lesson.quiz.find(item => item.id === id);
      row.querySelector('[data-action="edit"]').addEventListener('click', () => {
        EditorForms.renderQuizForm(content.querySelector('#admin-inline-form'), lesson.id, q, () => refreshAfterEdit('quiz'));
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm('이 문제를 삭제하시겠습니까?')) return;
        await App.deleteQuiz(lesson.id, id);
        App.showToast('문제를 삭제했습니다');
        refreshAfterEdit('quiz');
      });
    });

    content.querySelector('#admin-add-quiz').addEventListener('click', () => {
      EditorForms.renderQuizForm(content.querySelector('#admin-inline-form'), lesson.id, null, () => refreshAfterEdit('quiz'));
    });
  }

  /* ---------------- 공통 ---------------- */

  function emptyRow(message) {
    return `<div class="admin-empty-row">${message}</div>`;
  }

  return { render };
})();
