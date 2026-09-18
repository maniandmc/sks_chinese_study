'use strict';

/* ============================================================
   editor-forms.js — 문장 / 단어 / 문법 / 문제 편집 폼 (공용)

   Admin(교재 관리 화면)과 InlineEditor(학습 화면 편집 모드)가
   동일한 폼 마크업·검증·저장 로직을 공유하기 위한 모듈입니다.
   폼을 어디에 그릴지(hostEl)와 저장 후 무엇을 할지(onDone)만
   호출부에서 넘겨주면 됩니다.
   ============================================================ */

const EditorForms = (() => {

  function safeScrollIntoView(el) {
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /* ---------------- 문장 폼 ---------------- */

  function renderSentenceForm(hostEl, lessonId, sentence, onDone) {
    hostEl.innerHTML = `
      <div class="admin-card">
        <p class="section-heading">${sentence ? '문장 수정' : '새 문장 추가'}</p>
        <div class="admin-field">
          <label>중국어 문장</label>
          <textarea id="ef-s-chinese" class="zh" rows="2" placeholder="中国人非常重视家庭。">${sentence ? App.escapeHTML(sentence.chinese) : ''}</textarea>
        </div>
        <div class="admin-field">
          <label>병음</label>
          <input type="text" id="ef-s-pinyin" value="${sentence ? App.escapeHTML(sentence.pinyin) : ''}" placeholder="Zhōngguórén fēicháng zhòngshì jiātíng.">
        </div>
        <div class="admin-field">
          <label>한국어 번역</label>
          <textarea id="ef-s-translation" rows="2" placeholder="중국인은 가족을 매우 중요하게 생각한다.">${sentence ? App.escapeHTML(sentence.translation) : ''}</textarea>
        </div>
        <div class="admin-form-actions">
          <button class="btn-primary" id="ef-s-save">저장</button>
          <button class="btn-secondary" id="ef-s-cancel">취소</button>
        </div>
      </div>
    `;

    hostEl.querySelector('#ef-s-cancel').addEventListener('click', () => { hostEl.innerHTML = ''; });
    hostEl.querySelector('#ef-s-save').addEventListener('click', async () => {
      const chinese = hostEl.querySelector('#ef-s-chinese').value.trim();
      const pinyin = hostEl.querySelector('#ef-s-pinyin').value.trim();
      const translation = hostEl.querySelector('#ef-s-translation').value.trim();
      if (!chinese || !pinyin || !translation) {
        App.showToast('모든 항목을 입력해주세요');
        return;
      }
      if (sentence) {
        await App.updateSentence(lessonId, sentence.id, { chinese, pinyin, translation });
        App.showToast('문장을 수정했습니다');
      } else {
        await App.addSentence(lessonId, { chinese, pinyin, translation });
        App.showToast('문장을 추가했습니다');
      }
      hostEl.innerHTML = '';
      if (onDone) await onDone();
    });

    safeScrollIntoView(hostEl);
  }

  /* ---------------- 단어 폼 ---------------- */

  function renderVocabForm(hostEl, lessonId, word, onDone) {
    hostEl.innerHTML = `
      <div class="admin-card">
        <p class="section-heading">${word ? '단어 수정' : '새 단어 추가'}</p>
        <div class="admin-field-row">
          <div class="admin-field">
            <label>단어</label>
            <input type="text" id="ef-v-word" class="zh" value="${word ? App.escapeHTML(word.word) : ''}" placeholder="家庭" ${word ? 'disabled' : ''}>
          </div>
          <div class="admin-field">
            <label>병음</label>
            <input type="text" id="ef-v-pinyin" value="${word ? App.escapeHTML(word.pinyin) : ''}" placeholder="jiātíng">
          </div>
        </div>
        <div class="admin-field-row">
          <div class="admin-field">
            <label>품사</label>
            <input type="text" id="ef-v-pos" value="${word ? App.escapeHTML(word.partOfSpeech) : ''}" placeholder="명사">
          </div>
          <div class="admin-field">
            <label>뜻</label>
            <input type="text" id="ef-v-meaning" value="${word ? App.escapeHTML(word.meaning) : ''}" placeholder="가정, 가족">
          </div>
        </div>
        <div class="admin-field">
          <label>예문 (중국어)</label>
          <input type="text" id="ef-v-example" class="zh" value="${word ? App.escapeHTML(word.example || '') : ''}" placeholder="中国人的家庭观念和西方人有一些不同。">
        </div>
        <div class="admin-form-actions">
          <button class="btn-primary" id="ef-v-save">저장</button>
          <button class="btn-secondary" id="ef-v-cancel">취소</button>
        </div>
      </div>
    `;

    hostEl.querySelector('#ef-v-cancel').addEventListener('click', () => { hostEl.innerHTML = ''; });
    hostEl.querySelector('#ef-v-save').addEventListener('click', async () => {
      const wordText = hostEl.querySelector('#ef-v-word').value.trim();
      const pinyin = hostEl.querySelector('#ef-v-pinyin').value.trim();
      const partOfSpeech = hostEl.querySelector('#ef-v-pos').value.trim();
      const meaning = hostEl.querySelector('#ef-v-meaning').value.trim();
      const example = hostEl.querySelector('#ef-v-example').value.trim();

      if (!wordText || !pinyin || !partOfSpeech || !meaning) {
        App.showToast('예문을 제외한 모든 항목을 입력해주세요');
        return;
      }

      if (word) {
        await App.updateVocabWord(lessonId, word.word, { pinyin, partOfSpeech, meaning, example });
        App.showToast('단어를 수정했습니다');
      } else {
        const lesson = await App.getLesson(lessonId);
        const exists = lesson.vocabulary.some(v => v.word === wordText);
        if (exists) {
          App.showToast('이미 등록된 단어입니다');
          return;
        }
        await App.addVocabWord(lessonId, { word: wordText, pinyin, partOfSpeech, meaning, example });
        App.showToast('단어를 추가했습니다');
      }
      hostEl.innerHTML = '';
      if (onDone) await onDone();
    });

    safeScrollIntoView(hostEl);
  }

  /* ---------------- 문법 폼 ---------------- */

  function renderGrammarForm(hostEl, lessonId, grammar, onDone) {
    hostEl.innerHTML = `
      <div class="admin-card">
        <p class="section-heading">${grammar ? '문법 수정' : '새 문법 추가'}</p>
        <div class="admin-field">
          <label>제목 (예: "和" — ~와, ~과)</label>
          <input type="text" id="ef-g-title" value="${grammar ? App.escapeHTML(grammar.title) : ''}" placeholder="&quot;和&quot; — ~와, ~과">
        </div>
        <div class="admin-field">
          <label>설명</label>
          <textarea id="ef-g-desc" rows="2" placeholder="두 명사나 대상을 연결할 때 사용하는 표현입니다.">${grammar ? App.escapeHTML(grammar.description) : ''}</textarea>
        </div>
        <div class="admin-field">
          <label>예문 (중국어)</label>
          <input type="text" id="ef-g-example" class="zh" value="${grammar ? App.escapeHTML(grammar.example) : ''}" placeholder="中国人的家庭观念和西方人有一些不同。">
        </div>
        <div class="admin-field">
          <label>예문 번역</label>
          <input type="text" id="ef-g-translation" value="${grammar ? App.escapeHTML(grammar.translation) : ''}" placeholder="중국인의 가족관념은 서양인과 조금 다르다.">
        </div>
        <div class="admin-form-actions">
          <button class="btn-primary" id="ef-g-save">저장</button>
          <button class="btn-secondary" id="ef-g-cancel">취소</button>
        </div>
      </div>
    `;

    hostEl.querySelector('#ef-g-cancel').addEventListener('click', () => { hostEl.innerHTML = ''; });
    hostEl.querySelector('#ef-g-save').addEventListener('click', async () => {
      const title = hostEl.querySelector('#ef-g-title').value.trim();
      const description = hostEl.querySelector('#ef-g-desc').value.trim();
      const example = hostEl.querySelector('#ef-g-example').value.trim();
      const translation = hostEl.querySelector('#ef-g-translation').value.trim();

      if (!title || !description || !example || !translation) {
        App.showToast('모든 항목을 입력해주세요');
        return;
      }

      if (grammar) {
        await App.updateGrammar(lessonId, grammar.id, { title, description, example, translation });
        App.showToast('문법 항목을 수정했습니다');
      } else {
        await App.addGrammar(lessonId, { title, description, example, translation });
        App.showToast('문법 항목을 추가했습니다');
      }
      hostEl.innerHTML = '';
      if (onDone) await onDone();
    });

    safeScrollIntoView(hostEl);
  }

  /* ---------------- 문제 폼 ---------------- */

  function renderQuizForm(hostEl, lessonId, quiz, onDone) {
    const options = quiz ? quiz.options : ['', '', '', ''];

    hostEl.innerHTML = `
      <div class="admin-card">
        <p class="section-heading">${quiz ? '문제 수정' : '새 문제 추가'}</p>
        <div class="admin-field">
          <label>질문</label>
          <input type="text" id="ef-q-question" value="${quiz ? App.escapeHTML(quiz.question) : ''}" placeholder="&quot;家庭&quot;의 뜻은?">
        </div>
        <div class="admin-field">
          <label>보기 (정답 앞의 라디오 버튼을 선택하세요)</label>
          <div class="admin-quiz-options">
            ${options.map((opt, i) => `
              <div class="admin-quiz-option-row">
                <input type="radio" name="ef-q-answer" value="${i}" ${quiz && quiz.answerIndex === i ? 'checked' : (!quiz && i === 1 ? 'checked' : '')}>
                <input type="text" class="ef-q-opt-input" data-index="${i}" value="${App.escapeHTML(opt)}" placeholder="보기 ${i + 1}">
              </div>
            `).join('')}
          </div>
        </div>
        <div class="admin-field">
          <label>해설</label>
          <input type="text" id="ef-q-explanation" value="${quiz ? App.escapeHTML(quiz.explanation) : ''}" placeholder="家庭 = 가정, 가족">
        </div>
        <div class="admin-form-actions">
          <button class="btn-primary" id="ef-q-save">저장</button>
          <button class="btn-secondary" id="ef-q-cancel">취소</button>
        </div>
      </div>
    `;

    hostEl.querySelector('#ef-q-cancel').addEventListener('click', () => { hostEl.innerHTML = ''; });
    hostEl.querySelector('#ef-q-save').addEventListener('click', async () => {
      const question = hostEl.querySelector('#ef-q-question').value.trim();
      const explanation = hostEl.querySelector('#ef-q-explanation').value.trim();
      const optInputs = hostEl.querySelectorAll('.ef-q-opt-input');
      const newOptions = Array.from(optInputs).map(inp => inp.value.trim());
      const answerRadio = hostEl.querySelector('input[name="ef-q-answer"]:checked');

      if (!question || !explanation || newOptions.some(o => !o) || !answerRadio) {
        App.showToast('모든 항목을 입력하고 정답을 선택해주세요');
        return;
      }

      const answerIndex = Number(answerRadio.value);
      const data = { question, options: newOptions, answerIndex, explanation };

      if (quiz) {
        await App.updateQuiz(lessonId, quiz.id, data);
        App.showToast('문제를 수정했습니다');
      } else {
        await App.addQuiz(lessonId, data);
        App.showToast('문제를 추가했습니다');
      }
      hostEl.innerHTML = '';
      if (onDone) await onDone();
    });

    safeScrollIntoView(hostEl);
  }

  /* ---------------- 단원 정보 폼 (제목류) ---------------- */

  function renderLessonMetaForm(hostEl, lesson, onDone) {
    hostEl.innerHTML = `
      <div class="admin-card">
        <p class="section-heading">${lesson ? '단원 정보 수정' : '새 단원 추가'}</p>
        <div class="admin-field">
          <label>단원 번호 (예: 第一课)</label>
          <input type="text" id="ef-l-title" value="${lesson ? App.escapeHTML(lesson.title) : ''}" placeholder="第四课">
        </div>
        <div class="admin-field">
          <label>중국어 제목</label>
          <input type="text" id="ef-l-chinese" class="zh" value="${lesson ? App.escapeHTML(lesson.chineseTitle) : ''}" placeholder="中国的节日">
        </div>
        <div class="admin-field">
          <label>한국어 제목</label>
          <input type="text" id="ef-l-korean" value="${lesson ? App.escapeHTML(lesson.koreanTitle) : ''}" placeholder="중국의 명절">
        </div>
        <div class="admin-form-actions">
          <button class="btn-primary" id="ef-l-save">저장</button>
          <button class="btn-secondary" id="ef-l-cancel">취소</button>
        </div>
      </div>
    `;

    hostEl.querySelector('#ef-l-cancel').addEventListener('click', () => { hostEl.innerHTML = ''; if (onDone) onDone(true); });
    hostEl.querySelector('#ef-l-save').addEventListener('click', async () => {
      const title = hostEl.querySelector('#ef-l-title').value.trim();
      const chineseTitle = hostEl.querySelector('#ef-l-chinese').value.trim();
      const koreanTitle = hostEl.querySelector('#ef-l-korean').value.trim();

      if (!title || !chineseTitle || !koreanTitle) {
        App.showToast('모든 항목을 입력해주세요');
        return;
      }

      let newId = null;
      if (lesson) {
        await App.updateLessonMeta(lesson.id, { title, chineseTitle, koreanTitle });
        App.showToast('단원 정보를 수정했습니다');
      } else {
        newId = await App.addLesson({ title, chineseTitle, koreanTitle });
        App.showToast('새 단원을 추가했습니다');
      }
      hostEl.innerHTML = '';
      if (onDone) await onDone(false, newId);
    });

    safeScrollIntoView(hostEl);
  }

  return {
    renderSentenceForm, renderVocabForm, renderGrammarForm, renderQuizForm, renderLessonMetaForm,
    safeScrollIntoView,
  };
})();
