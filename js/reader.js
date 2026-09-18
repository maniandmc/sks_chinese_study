'use strict';

/* ============================================================
   reader.js — 교재 화면: 본문 / 단어 / 문법 / 연습문제 탭
   ============================================================ */

const Reader = (() => {

  let currentLesson = null;
  let currentTab = 'text';
  let selectedSentenceId = null;

  async function render(container, lessonId, tab = 'text') {
    currentLesson = await App.getLesson(lessonId);
    currentTab = tab;
    selectedSentenceId = null;

    if (!currentLesson) {
      container.innerHTML = `<div class="content-inner"><p>단원을 불러올 수 없습니다.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="content-inner">
        <div class="reader-header">
          <p class="rh-label zh">${currentLesson.title}</p>
          <h2 class="zh">${currentLesson.chineseTitle}</h2>
          <p class="rh-korean">${currentLesson.koreanTitle}</p>
        </div>

        <div class="tab-row">
          <button class="tab-btn ${tab === 'text' ? 'active' : ''}" data-tab="text">본문</button>
          <button class="tab-btn ${tab === 'vocab' ? 'active' : ''}" data-tab="vocab">단어</button>
          <button class="tab-btn ${tab === 'grammar' ? 'active' : ''}" data-tab="grammar">문법</button>
          <button class="tab-btn ${tab === 'quiz' ? 'active' : ''}" data-tab="quiz">연습문제</button>
        </div>

        <div class="tab-panel ${tab === 'text' ? 'active' : ''}" id="tab-text"></div>
        <div class="tab-panel ${tab === 'vocab' ? 'active' : ''}" id="tab-vocab"></div>
        <div class="tab-panel ${tab === 'grammar' ? 'active' : ''}" id="tab-grammar"></div>
        <div class="tab-panel ${tab === 'quiz' ? 'active' : ''}" id="tab-quiz"></div>
      </div>
    `;

    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    renderTabContent(tab);
  }

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    renderTabContent(tab);
    App.renderInfoPanel(currentLesson); // 단원 메뉴 active 갱신 목적
  }

  function renderTabContent(tab) {
    if (tab === 'text') renderTextTab();
    else if (tab === 'vocab') Vocabulary.renderLessonVocab(document.getElementById('tab-vocab'), currentLesson);
    else if (tab === 'grammar') renderGrammarTab();
    else if (tab === 'quiz') renderQuizTab();
  }

  /* ================= 본문 탭 ================= */

  function renderTextTab() {
    const el = document.getElementById('tab-text');
    const toggles = App.getDisplayToggles();
    const bookmarks = App.getBookmarks();

    const sentencesHTML = currentLesson.sentences.map(s => {
      const isBookmarked = bookmarks.sentences.includes(s.id);
      return `
        <div class="sentence-block ${isBookmarked ? 'bookmarked' : ''}" data-sentence-id="${s.id}">
          <div class="inline-edit-controls">
            <button class="inline-edit-btn" data-edit-sentence="${s.id}" title="수정" aria-label="문장 수정">${App.ICONS.edit}</button>
            <button class="inline-edit-btn danger" data-delete-sentence="${s.id}" title="삭제" aria-label="문장 삭제">${App.ICONS.trash}</button>
          </div>
          <div class="sb-chinese zh">${s.chinese}</div>
          <div class="sb-pinyin ${toggles.pinyin ? 'show' : ''}">${s.pinyin}</div>
          <div class="sb-translation ${toggles.translation ? 'show' : ''}">${s.translation}</div>
        </div>
      `;
    }).join('');

    el.innerHTML = `
      <div class="inline-edit-banner">${App.ICONS.edit} 편집 모드입니다. 문장에 마우스를 올리면 수정·삭제 버튼이 나타납니다.</div>
      <div class="reader-toolbar">
        <button class="toggle-chip ${toggles.pinyin ? 'active' : ''}" id="toggle-pinyin">拼音</button>
        <button class="toggle-chip ${toggles.translation ? 'active' : ''}" id="toggle-translation">번역</button>
        <button class="toggle-chip" id="btn-read-all">${App.ICONS.volume} 전체 듣기</button>
      </div>
      <div class="passage">${sentencesHTML}</div>
      <button class="btn-primary inline-add-btn" id="btn-add-sentence">${App.ICONS.plus} 문장 추가</button>
      <div id="sentence-edit-form-host"></div>
      <div class="sentence-detail" id="sentence-detail"></div>
    `;

    el.querySelector('#toggle-pinyin').addEventListener('click', () => {
      const t = App.getDisplayToggles();
      App.setDisplayToggle('pinyin', !t.pinyin);
      renderTextTab();
    });
    el.querySelector('#toggle-translation').addEventListener('click', () => {
      const t = App.getDisplayToggles();
      App.setDisplayToggle('translation', !t.translation);
      renderTextTab();
    });
    el.querySelector('#btn-read-all').addEventListener('click', () => {
      const fullText = currentLesson.sentences.map(s => s.chinese).join('');
      App.speak(fullText);
    });

    el.querySelectorAll('.sentence-block').forEach(block => {
      block.addEventListener('click', () => selectSentence(block.dataset.sentenceId));
    });

    el.querySelectorAll('[data-edit-sentence]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sentence = currentLesson.sentences.find(s => s.id === btn.dataset.editSentence);
        const formHost = document.getElementById('sentence-edit-form-host');
        EditorForms.renderSentenceForm(formHost, currentLesson.id, sentence, async () => {
          App.invalidateCache();
          currentLesson = await App.getLesson(currentLesson.id);
          renderTextTab();
        });
      });
    });

    el.querySelectorAll('[data-delete-sentence]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('이 문장을 삭제하시겠습니까?')) return;
        await App.deleteSentence(currentLesson.id, btn.dataset.deleteSentence);
        App.invalidateCache();
        currentLesson = await App.getLesson(currentLesson.id);
        App.showToast('문장을 삭제했습니다');
        renderTextTab();
      });
    });

    el.querySelector('#btn-add-sentence').addEventListener('click', () => {
      const formHost = document.getElementById('sentence-edit-form-host');
      EditorForms.renderSentenceForm(formHost, currentLesson.id, null, async () => {
        App.invalidateCache();
        currentLesson = await App.getLesson(currentLesson.id);
        renderTextTab();
      });
    });

    // 본문을 한 번이라도 열람하면 진행률 '완료' 처리
    App.setLessonProgressField(currentLesson.id, 'text', true);
    App.renderInfoPanel(currentLesson);
    App.renderSidebarLessonList();
  }

  function selectSentence(sentenceId) {
    const sentence = currentLesson.sentences.find(s => s.id === sentenceId);
    if (!sentence) return;

    selectedSentenceId = sentenceId;

    document.querySelectorAll('.sentence-block').forEach(b => {
      b.classList.toggle('selected', b.dataset.sentenceId === sentenceId);
    });

    const isSaved = App.isBookmarked('sentences', sentenceId);
    const detail = document.getElementById('sentence-detail');
    detail.innerHTML = `
      <p class="sd-zh zh">${sentence.chinese}</p>
      <p class="sd-pinyin">${sentence.pinyin}</p>
      <p class="sd-kr">${sentence.translation}</p>
      <div class="sd-actions">
        <button class="action-chip" id="btn-speak-sentence">${App.ICONS.volume} 문장 듣기</button>
        <button class="action-chip ${isSaved ? 'saved' : ''}" id="btn-save-sentence">
          ${isSaved ? App.ICONS.starFilled : App.ICONS.star} ${isSaved ? '저장됨' : '문장 저장'}
        </button>
      </div>
    `;
    detail.classList.add('show');

    detail.querySelector('#btn-speak-sentence').addEventListener('click', () => App.speak(sentence.chinese));
    detail.querySelector('#btn-save-sentence').addEventListener('click', () => {
      const nowSaved = App.toggleBookmark('sentences', sentenceId);
      App.showToast(nowSaved ? '문장을 저장했습니다' : '저장을 취소했습니다');
      renderTextTab();
      setTimeout(() => selectSentence(sentenceId), 0);
    });

    if (typeof detail.scrollIntoView === 'function') {
      detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /* ================= 문법 탭 ================= */

  function renderGrammarTab() {
    const el = document.getElementById('tab-grammar');
    const cards = currentLesson.grammar.map(g => `
      <div class="grammar-card" data-grammar-id="${g.id}">
        <div class="inline-edit-controls">
          <button class="inline-edit-btn" data-edit-grammar="${g.id}" title="수정" aria-label="문법 수정">${App.ICONS.edit}</button>
          <button class="inline-edit-btn danger" data-delete-grammar="${g.id}" title="삭제" aria-label="문법 삭제">${App.ICONS.trash}</button>
        </div>
        <p class="gc-number">${g.number}</p>
        <p class="gc-title">${g.title}</p>
        <p class="gc-desc">${g.description}</p>
        <div class="gc-example-box">
          <p class="gc-example-zh zh">${g.example}</p>
          <p class="gc-example-kr">${g.translation}</p>
        </div>
      </div>
    `).join('');

    el.innerHTML = `
      <div class="inline-edit-banner">${App.ICONS.edit} 편집 모드입니다. 문법 카드에 마우스를 올리면 수정·삭제 버튼이 나타납니다.</div>
      <div class="grammar-list">${cards}</div>
      <button class="btn-primary inline-add-btn" id="btn-add-grammar">${App.ICONS.plus} 문법 추가</button>
      <div id="grammar-edit-form-host"></div>
    `;

    el.querySelectorAll('[data-edit-grammar]').forEach(btn => {
      btn.addEventListener('click', () => {
        const grammar = currentLesson.grammar.find(g => g.id === btn.dataset.editGrammar);
        EditorForms.renderGrammarForm(document.getElementById('grammar-edit-form-host'), currentLesson.id, grammar, async () => {
          App.invalidateCache();
          currentLesson = await App.getLesson(currentLesson.id);
          renderGrammarTab();
        });
      });
    });

    el.querySelectorAll('[data-delete-grammar]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('이 문법 항목을 삭제하시겠습니까?')) return;
        await App.deleteGrammar(currentLesson.id, btn.dataset.deleteGrammar);
        App.invalidateCache();
        currentLesson = await App.getLesson(currentLesson.id);
        App.showToast('문법 항목을 삭제했습니다');
        renderGrammarTab();
      });
    });

    el.querySelector('#btn-add-grammar').addEventListener('click', () => {
      EditorForms.renderGrammarForm(document.getElementById('grammar-edit-form-host'), currentLesson.id, null, async () => {
        App.invalidateCache();
        currentLesson = await App.getLesson(currentLesson.id);
        renderGrammarTab();
      });
    });

    App.setLessonProgressField(currentLesson.id, 'grammar', true);
    App.renderInfoPanel(currentLesson);
    App.renderSidebarLessonList();
  }

  /* ================= 연습문제 탭 ================= */

  function renderQuizTab() {
    const el = document.getElementById('tab-quiz');
    const cards = currentLesson.quiz.map((q, i) => `
      <div class="quiz-card" data-quiz-id="${q.id}">
        <div class="inline-edit-controls">
          <button class="inline-edit-btn" data-edit-quiz="${q.id}" title="수정" aria-label="문제 수정">${App.ICONS.edit}</button>
          <button class="inline-edit-btn danger" data-delete-quiz="${q.id}" title="삭제" aria-label="문제 삭제">${App.ICONS.trash}</button>
        </div>
        <p class="qc-label">QUIZ ${String(i + 1).padStart(2, '0')}</p>
        <p class="qc-question">${q.question}</p>
        <div class="quiz-options">
          ${q.options.map((opt, oi) => `
            <button class="quiz-option" data-option-index="${oi}">
              <span class="qo-dot"></span>
              <span>${opt}</span>
            </button>
          `).join('')}
        </div>
        <button class="quiz-check-btn" disabled>정답 확인</button>
        <div class="quiz-result"></div>
      </div>
    `).join('');

    el.innerHTML = `
      <div class="inline-edit-banner">${App.ICONS.edit} 편집 모드입니다. 문제 카드에 마우스를 올리면 수정·삭제 버튼이 나타납니다.</div>
      <div class="quiz-list">${cards}</div>
      <button class="btn-primary inline-add-btn" id="btn-add-quiz">${App.ICONS.plus} 문제 추가</button>
      <div id="quiz-edit-form-host"></div>
    `;

    el.querySelectorAll('.quiz-card').forEach((card, qi) => {
      const quiz = currentLesson.quiz[qi];
      let selected = null;
      const checkBtn = card.querySelector('.quiz-check-btn');
      const options = card.querySelectorAll('.quiz-option');
      const resultEl = card.querySelector('.quiz-result');

      options.forEach((opt, oi) => {
        opt.addEventListener('click', () => {
          if (opt.classList.contains('disabled')) return;
          selected = oi;
          options.forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          checkBtn.disabled = false;
        });
      });

      checkBtn.addEventListener('click', () => {
        if (selected === null) return;
        const isCorrect = selected === quiz.answerIndex;
        options.forEach((o, oi) => {
          o.classList.add('disabled');
          if (oi === quiz.answerIndex) o.classList.add('correct');
          else if (oi === selected && !isCorrect) o.classList.add('wrong');
        });
        checkBtn.disabled = true;
        resultEl.classList.add('show', isCorrect ? 'correct' : 'wrong');
        resultEl.innerHTML = isCorrect
          ? '✓ 정답입니다!'
          : `✕ 다시 생각해 보세요.<span class="qr-hint">${quiz.explanation}</span>`;

        checkAllQuizCompleted();
      });

      card.querySelector(`[data-edit-quiz="${quiz.id}"]`).addEventListener('click', () => {
        EditorForms.renderQuizForm(document.getElementById('quiz-edit-form-host'), currentLesson.id, quiz, async () => {
          App.invalidateCache();
          currentLesson = await App.getLesson(currentLesson.id);
          renderQuizTab();
        });
      });

      card.querySelector(`[data-delete-quiz="${quiz.id}"]`).addEventListener('click', async () => {
        if (!confirm('이 문제를 삭제하시겠습니까?')) return;
        await App.deleteQuiz(currentLesson.id, quiz.id);
        App.invalidateCache();
        currentLesson = await App.getLesson(currentLesson.id);
        App.showToast('문제를 삭제했습니다');
        renderQuizTab();
      });
    });

    el.querySelector('#btn-add-quiz').addEventListener('click', () => {
      EditorForms.renderQuizForm(document.getElementById('quiz-edit-form-host'), currentLesson.id, null, async () => {
        App.invalidateCache();
        currentLesson = await App.getLesson(currentLesson.id);
        renderQuizTab();
      });
    });

    checkAllQuizCompleted(true);
  }

  function checkAllQuizCompleted(silent = false) {
    const cards = document.querySelectorAll('#tab-quiz .quiz-card');
    let allAnswered = true;
    cards.forEach(card => {
      if (!card.querySelector('.quiz-result.show')) allAnswered = false;
    });
    if (allAnswered && cards.length > 0) {
      App.setLessonProgressField(currentLesson.id, 'quiz', true);
      if (!silent) {
        App.showToast('연습문제를 모두 완료했습니다!');
      }
      App.renderInfoPanel(currentLesson);
      App.renderSidebarLessonList();
    }
  }

  return { render, switchTab };
})();
