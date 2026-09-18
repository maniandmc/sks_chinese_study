'use strict';

/* ============================================================
   app.js — 앱 코어: 데이터 로딩, 상태, 라우팅, 홈 화면,
   사이드바, 테마, 진행률, 북마크, 전역 검색 오버레이
   ============================================================ */

const App = (() => {

  /* ---------------- 상태 ---------------- */
  const state = {
    lessonsMeta: null,      // lessons.json 내용
    lessonCache: {},        // { lessonId: lessonData }
    currentLessonId: null,
    currentView: 'home',    // home | reader | vocabulary | bookmarks
    currentTab: 'text',     // text | vocab | grammar | quiz (reader 내부)
  };

  const STORAGE_KEYS = {
    progress: 'ctb_progress_v1',
    bookmarks: 'ctb_bookmarks_v1',
    theme: 'ctb_theme_v1',
    toggles: 'ctb_toggles_v1',
    editMode: 'ctb_edit_mode_v1',
    lessonsOverride: 'ctb_lessons_override_v1',   // lessons.json 오버레이 (단원 추가/삭제 반영)
    lessonDataPrefix: 'ctb_lesson_data_v1_',        // + lessonId → 해당 단원 편집본
  };

  /* ---------------- 데이터 로딩 (fetch 우선, 실패 시 로컬 번들) ---------------- */
  /*
   * 편집 우선순위: localStorage 편집본 > 원본 JSON(fetch) > data-bundle.js(file:// fallback)
   * "저장"은 전부 localStorage에 즉시 반영되고, "내보내기"로 JSON 파일을 다운로드해
   * data/ 폴더에 덮어쓰면 영구 반영됩니다.
   */

  async function loadJSON(filename) {
    try {
      const res = await fetch(`data/${filename}`);
      if (!res.ok) throw new Error('fetch failed');
      return await res.json();
    } catch (e) {
      // file:// 환경 등 fetch가 막힌 경우 -> 로컬 번들 사용
      if (window.__TEXTBOOK_BUNDLE__ && window.__TEXTBOOK_BUNDLE__[filename]) {
        return window.__TEXTBOOK_BUNDLE__[filename];
      }
      console.error(`데이터를 불러오지 못했습니다: ${filename}`, e);
      return null;
    }
  }

  async function getLessonsMeta() {
    if (!state.lessonsMeta) {
      const override = readStore(STORAGE_KEYS.lessonsOverride, null);
      state.lessonsMeta = override || await loadJSON('lessons.json');
    }
    return state.lessonsMeta;
  }

  async function getLesson(lessonId) {
    if (state.lessonCache[lessonId]) return state.lessonCache[lessonId];

    const edited = readStore(STORAGE_KEYS.lessonDataPrefix + lessonId, null);
    if (edited) {
      state.lessonCache[lessonId] = edited;
      return edited;
    }

    const meta = await getLessonsMeta();
    const info = meta.lessons.find(l => l.id === lessonId);
    if (!info) return null;

    // 새로 추가된 단원(원본 JSON 파일이 없는 경우)은 편집본만 존재해야 하므로
    // 여기 도달했다면 편집본이 없다는 뜻 -> 원본 파일 시도, 없으면 빈 템플릿
    const data = info.file ? await loadJSON(info.file) : null;
    const finalData = data || emptyLessonTemplate(lessonId, info);
    state.lessonCache[lessonId] = finalData;
    return finalData;
  }

  function emptyLessonTemplate(id, info) {
    return {
      id,
      title: info.title,
      chineseTitle: info.chineseTitle,
      koreanTitle: info.koreanTitle,
      sentences: [],
      vocabulary: [],
      grammar: [],
      quiz: [],
    };
  }

  async function getAllLessons() {
    const meta = await getLessonsMeta();
    const all = await Promise.all(meta.lessons.map(l => getLesson(l.id)));
    return all;
  }

  function invalidateCache() {
    state.lessonsMeta = null;
    state.lessonCache = {};
  }

  /* ---------------- 단원 데이터 저장/추가/삭제 (관리자 기능) ---------------- */

  function saveLessonData(lessonId, lessonData) {
    writeStore(STORAGE_KEYS.lessonDataPrefix + lessonId, lessonData);
    state.lessonCache[lessonId] = lessonData;
  }

  async function addLesson({ title, chineseTitle, koreanTitle }) {
    const meta = await getLessonsMeta();
    const newId = meta.lessons.length > 0 ? Math.max(...meta.lessons.map(l => l.id)) + 1 : 1;
    const newMeta = {
      lessons: [
        ...meta.lessons,
        { id: newId, title, chineseTitle, koreanTitle, file: `lesson${String(newId).padStart(2, '0')}.json` },
      ],
    };
    writeStore(STORAGE_KEYS.lessonsOverride, newMeta);
    state.lessonsMeta = newMeta;

    const emptyData = {
      id: newId, title, chineseTitle, koreanTitle,
      sentences: [], vocabulary: [], grammar: [], quiz: [],
    };
    saveLessonData(newId, emptyData);
    return newId;
  }

  async function updateLessonMeta(lessonId, { title, chineseTitle, koreanTitle }) {
    const meta = await getLessonsMeta();
    const newMeta = {
      lessons: meta.lessons.map(l => l.id === lessonId ? { ...l, title, chineseTitle, koreanTitle } : l),
    };
    writeStore(STORAGE_KEYS.lessonsOverride, newMeta);
    state.lessonsMeta = newMeta;

    const lesson = await getLesson(lessonId);
    const updated = { ...lesson, title, chineseTitle, koreanTitle };
    saveLessonData(lessonId, updated);
  }

  async function deleteLesson(lessonId) {
    const meta = await getLessonsMeta();
    const newMeta = { lessons: meta.lessons.filter(l => l.id !== lessonId) };
    writeStore(STORAGE_KEYS.lessonsOverride, newMeta);
    state.lessonsMeta = newMeta;

    try { localStorage.removeItem(STORAGE_KEYS.lessonDataPrefix + lessonId); } catch (e) {}
    delete state.lessonCache[lessonId];

    // 진행률/북마크에서도 해당 단원 흔적 정리(선택적 — 문장/단어 id는 남아있어도 표시만 안 될 뿐 무해)
    const progress = getProgress();
    delete progress[lessonId];
    writeStore(STORAGE_KEYS.progress, progress);
  }

  function genId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  async function addSentence(lessonId, sentence) {
    const lesson = await getLesson(lessonId);
    const newSentence = { id: genId('s'), ...sentence };
    const updated = { ...lesson, sentences: [...lesson.sentences, newSentence] };
    saveLessonData(lessonId, updated);
    return newSentence.id;
  }

  async function updateSentence(lessonId, sentenceId, fields) {
    const lesson = await getLesson(lessonId);
    const updated = {
      ...lesson,
      sentences: lesson.sentences.map(s => s.id === sentenceId ? { ...s, ...fields } : s),
    };
    saveLessonData(lessonId, updated);
  }

  async function deleteSentence(lessonId, sentenceId) {
    const lesson = await getLesson(lessonId);
    const updated = { ...lesson, sentences: lesson.sentences.filter(s => s.id !== sentenceId) };
    saveLessonData(lessonId, updated);

    const b = getBookmarks();
    b.sentences = b.sentences.filter(id => id !== sentenceId);
    writeStore(STORAGE_KEYS.bookmarks, b);
  }

  async function addVocabWord(lessonId, word) {
    const lesson = await getLesson(lessonId);
    const updated = { ...lesson, vocabulary: [...lesson.vocabulary, word] };
    saveLessonData(lessonId, updated);
  }

  async function updateVocabWord(lessonId, originalWord, fields) {
    const lesson = await getLesson(lessonId);
    const updated = {
      ...lesson,
      vocabulary: lesson.vocabulary.map(v => v.word === originalWord ? { ...v, ...fields } : v),
    };
    saveLessonData(lessonId, updated);
  }

  async function deleteVocabWord(lessonId, word) {
    const lesson = await getLesson(lessonId);
    const updated = { ...lesson, vocabulary: lesson.vocabulary.filter(v => v.word !== word) };
    saveLessonData(lessonId, updated);

    const b = getBookmarks();
    b.words = b.words.filter(w => w !== word);
    writeStore(STORAGE_KEYS.bookmarks, b);
  }

  async function addGrammar(lessonId, grammar) {
    const lesson = await getLesson(lessonId);
    const number = String(lesson.grammar.length + 1).padStart(2, '0');
    const newGrammar = { id: genId('g'), number, ...grammar };
    const updated = { ...lesson, grammar: [...lesson.grammar, newGrammar] };
    saveLessonData(lessonId, updated);
  }

  async function updateGrammar(lessonId, grammarId, fields) {
    const lesson = await getLesson(lessonId);
    const updated = {
      ...lesson,
      grammar: lesson.grammar.map(g => g.id === grammarId ? { ...g, ...fields } : g),
    };
    saveLessonData(lessonId, updated);
  }

  async function deleteGrammar(lessonId, grammarId) {
    const lesson = await getLesson(lessonId);
    const remaining = lesson.grammar.filter(g => g.id !== grammarId)
      .map((g, i) => ({ ...g, number: String(i + 1).padStart(2, '0') }));
    const updated = { ...lesson, grammar: remaining };
    saveLessonData(lessonId, updated);
  }

  async function addQuiz(lessonId, quiz) {
    const lesson = await getLesson(lessonId);
    const newQuiz = { id: genId('q'), ...quiz };
    const updated = { ...lesson, quiz: [...lesson.quiz, newQuiz] };
    saveLessonData(lessonId, updated);
  }

  async function updateQuiz(lessonId, quizId, fields) {
    const lesson = await getLesson(lessonId);
    const updated = {
      ...lesson,
      quiz: lesson.quiz.map(q => q.id === quizId ? { ...q, ...fields } : q),
    };
    saveLessonData(lessonId, updated);
  }

  async function deleteQuiz(lessonId, quizId) {
    const lesson = await getLesson(lessonId);
    const updated = { ...lesson, quiz: lesson.quiz.filter(q => q.id !== quizId) };
    saveLessonData(lessonId, updated);
  }

  /* ---------------- 내보내기 / 초기화 ---------------- */

  function downloadJSON(filename, dataObj) {
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportLesson(lessonId) {
    const lesson = await getLesson(lessonId);
    const meta = await getLessonsMeta();
    const info = meta.lessons.find(l => l.id === lessonId);
    downloadJSON(info.file, lesson);
  }

  async function exportLessonsMeta() {
    const meta = await getLessonsMeta();
    downloadJSON('lessons.json', meta);
  }

  async function exportAll() {
    await exportLessonsMeta();
    const meta = await getLessonsMeta();
    for (const l of meta.lessons) {
      await exportLesson(l.id);
    }
  }

  function resetAllEdits() {
    const meta = readStore(STORAGE_KEYS.lessonsOverride, null);
    try { localStorage.removeItem(STORAGE_KEYS.lessonsOverride); } catch (e) {}
    if (meta) {
      meta.lessons.forEach(l => {
        try { localStorage.removeItem(STORAGE_KEYS.lessonDataPrefix + l.id); } catch (e) {}
      });
    }
    invalidateCache();
  }

  /* ---------------- localStorage 유틸 ---------------- */

  function readStore(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('localStorage 저장 실패', e);
    }
  }

  /* ---------------- 진행률 ---------------- */
  // progress 구조: { [lessonId]: { text: bool, vocab: bool, grammar: bool, quiz: bool } }

  function getProgress() {
    return readStore(STORAGE_KEYS.progress, {});
  }

  function getLessonProgress(lessonId) {
    const all = getProgress();
    return all[lessonId] || { text: false, vocab: false, grammar: false, quiz: false };
  }

  function setLessonProgressField(lessonId, field, value) {
    const all = getProgress();
    if (!all[lessonId]) all[lessonId] = { text: false, vocab: false, grammar: false, quiz: false };
    all[lessonId][field] = value;
    writeStore(STORAGE_KEYS.progress, all);
  }

  function getLessonPercent(lessonId) {
    const p = getLessonProgress(lessonId);
    const total = 4;
    const done = ['text', 'vocab', 'grammar', 'quiz'].filter(k => p[k]).length;
    return Math.round((done / total) * 100);
  }

  function getLastLessonId() {
    return readStore('ctb_last_lesson', null);
  }

  function setLastLessonId(id) {
    writeStore('ctb_last_lesson', id);
  }

  /* ---------------- 북마크 ---------------- */
  // bookmarks: { lessons: [id...], sentences: [sentenceId...], words: [word...] }

  function getBookmarks() {
    return readStore(STORAGE_KEYS.bookmarks, { lessons: [], sentences: [], words: [] });
  }

  function toggleBookmark(type, id) {
    const b = getBookmarks();
    const arr = b[type];
    const idx = arr.indexOf(id);
    let nowSaved;
    if (idx === -1) {
      arr.push(id);
      nowSaved = true;
    } else {
      arr.splice(idx, 1);
      nowSaved = false;
    }
    writeStore(STORAGE_KEYS.bookmarks, b);
    return nowSaved;
  }

  function isBookmarked(type, id) {
    const b = getBookmarks();
    return b[type].includes(id);
  }

  /* ---------------- 테마 ---------------- */

  function initTheme() {
    const saved = readStore(STORAGE_KEYS.theme, 'light');
    applyTheme(saved);
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    writeStore(STORAGE_KEYS.theme, theme);
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
    }
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyTheme(isDark ? 'light' : 'dark');
  }

  /* ---------------- 표시 토글 (병음/번역) : 전역 기억 ---------------- */

  function getDisplayToggles() {
    return readStore(STORAGE_KEYS.toggles, { pinyin: false, translation: false });
  }

  function setDisplayToggle(key, value) {
    const t = getDisplayToggles();
    t[key] = value;
    writeStore(STORAGE_KEYS.toggles, t);
  }

  /* ---------------- 편집 모드 (학습 화면 인라인 편집) ---------------- */
  /*
   * 지금은 로그인이 없으므로 "이 브라우저를 쓰는 사람 = 학생 본인"이라는
   * 전제로, 편집 모드는 누구나 켜고 끌 수 있다. 나중에 로그인이 추가되면
   * isEditModeAvailable() 같은 권한 체크를 이 지점에 끼워 넣을 수 있도록
   * 판단 로직을 한 곳(getEditMode/setEditMode)에 모아둔다.
   */

  function getEditMode() {
    return readStore(STORAGE_KEYS.editMode, false);
  }

  function setEditMode(value) {
    writeStore(STORAGE_KEYS.editMode, value);
    updateEditModeButton();
    document.body.classList.toggle('edit-mode-on', value);
    // 현재 보고 있는 화면을 편집 UI 유무에 맞게 다시 그림
    rerenderCurrentView();
  }

  function toggleEditMode() {
    setEditMode(!getEditMode());
    showToast(getEditMode() ? '편집 모드를 켰습니다' : '편집 모드를 껐습니다');
  }

  function updateEditModeButton() {
    const btn = document.getElementById('edit-mode-toggle-btn');
    if (!btn) return;
    const on = getEditMode();
    btn.classList.toggle('active', on);
    btn.innerHTML = ICONS.edit;
    btn.setAttribute('aria-label', on ? '편집 모드 끄기' : '편집 모드 켜기');
  }

  async function rerenderCurrentView() {
    const opts = {};
    if (state.currentLessonId) {
      opts.lessonId = state.currentLessonId;
      opts.tab = state.currentTab;
    }
    await navigate(state.currentView, opts);
  }

  /* ---------------- 아이콘 (인라인 SVG, stroke 기반) ---------------- */

  const ICONS = {
    home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>`,
    book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/></svg>`,
    vocab: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h13v16l-3-2-3 2-3-2-3 2z"/><path d="M9 8h7M9 11.5h7"/></svg>`,
    bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12v17l-6-4-6 4z"/></svg>`,
    bookmarkFilled: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12v17l-6-4-6 4z"/></svg>`,
    star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>`,
    starFilled: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
    sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>`,
    moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>`,
    volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>`,
    chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>`,
    menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`,
    inbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 12h4l1.5 3h5L16 12h4"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`,
  };

  /* ---------------- Toast ---------------- */

  let toastTimer = null;
  function showToast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  /* ---------------- 오디오(TTS) ---------------- */

  function speak(text) {
    if (!('speechSynthesis' in window)) {
      showToast('이 브라우저는 음성 재생을 지원하지 않습니다');
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 0.92;
    window.speechSynthesis.speak(utter);
  }

  /* ---------------- 사이드바 (모바일) ---------------- */

  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-backdrop').classList.add('show');
  }
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop').classList.remove('show');
  }

  /* ---------------- 라우팅 ---------------- */

  async function navigate(view, opts = {}) {
    state.currentView = view;
    closeSidebar();

    // 사이드바 nav-item active 상태 갱신
    document.querySelectorAll('.nav-item[data-view]').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view);
    });

    const main = document.getElementById('main-content');

    if (view === 'home') {
      state.currentLessonId = null;
      renderLessonSidebarActive(null);
      await Views.renderHome(main);
      renderInfoPanel(null);
    } else if (view === 'reader') {
      state.currentLessonId = opts.lessonId;
      setLastLessonId(opts.lessonId);
      renderLessonSidebarActive(opts.lessonId);
      await Reader.render(main, opts.lessonId, opts.tab || 'text');
      const lesson = await getLesson(opts.lessonId);
      renderInfoPanel(lesson);
    } else if (view === 'vocabulary') {
      state.currentLessonId = null;
      renderLessonSidebarActive(null);
      await Vocabulary.renderGlobalVocab(main);
      renderInfoPanel(null);
    } else if (view === 'bookmarks') {
      state.currentLessonId = null;
      renderLessonSidebarActive(null);
      await Views.renderBookmarks(main);
      renderInfoPanel(null);
    } else if (view === 'admin') {
      state.currentLessonId = null;
      renderLessonSidebarActive(null);
      await Admin.render(main, opts.lessonId || null);
      renderInfoPanel(null);
    }

    main.scrollTop = 0;
  }

  function renderLessonSidebarActive(lessonId) {
    document.querySelectorAll('.lesson-nav-item').forEach(el => {
      el.classList.toggle('active', Number(el.dataset.lessonId) === lessonId);
    });
  }

  /* ---------------- 사이드바: 단원 목록 렌더 ---------------- */

  async function renderSidebarLessonList() {
    const meta = await getLessonsMeta();
    const container = document.getElementById('sidebar-lesson-list');
    if (!container) return;
    const rows = await Promise.all(meta.lessons.map(async (l) => {
      const pct = getLessonPercent(l.id);
      return `
        <button class="lesson-nav-item" data-lesson-id="${l.id}" onclick="App.navigate('reader', {lessonId: ${l.id}})">
          <span class="ln-title zh">${l.title}</span>
          <span class="ln-progress">${pct}%</span>
        </button>
      `;
    }));
    container.innerHTML = rows.join('');
  }

  /* ---------------- 오른쪽 정보 패널 ---------------- */

  function renderInfoPanel(lesson) {
    const panel = document.getElementById('info-panel');
    if (!panel) return;

    if (!lesson) {
      panel.innerHTML = `
        <div class="panel-section">
          <p class="panel-title">안내</p>
          <p style="font-size:13px;color:var(--color-text-secondary);line-height:1.6;">
            단원을 선택하면 현재 학습 정보가 여기에 표시됩니다.
          </p>
        </div>
      `;
      return;
    }

    const p = getLessonProgress(lesson.id);
    const pct = getLessonPercent(lesson.id);

    const statusRow = (label, key) => {
      const done = p[key];
      const cls = done ? 'done' : 'todo';
      const text = done ? '완료' : '미학습';
      return `
        <div class="panel-progress-row">
          <span>${label}</span>
          <span class="status-dot ${cls}">${text}</span>
        </div>
      `;
    };

    panel.innerHTML = `
      <div class="panel-section">
        <p class="panel-title">현재 단원</p>
        <div class="panel-lesson-card">
          <p class="pl-title zh">${lesson.title}</p>
          <p class="pl-sub">${lesson.koreanTitle}</p>
          <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
          <div class="progress-text-row"><span>학습 진행률</span><span>${pct}%</span></div>
        </div>
      </div>
      <div class="panel-section">
        <p class="panel-title">학습 진행률</p>
        ${statusRow('본문', 'text')}
        ${statusRow('단어', 'vocab')}
        ${statusRow('문법', 'grammar')}
        ${statusRow('연습문제', 'quiz')}
      </div>
      <div class="panel-section">
        <p class="panel-title">단원 메뉴</p>
        <div class="lesson-menu-list">
          <button class="lesson-menu-item ${state.currentTab === 'text' ? 'active' : ''}" onclick="App.navigate('reader', {lessonId:${lesson.id}, tab:'text'})">본문</button>
          <button class="lesson-menu-item ${state.currentTab === 'vocab' ? 'active' : ''}" onclick="App.navigate('reader', {lessonId:${lesson.id}, tab:'vocab'})">단어</button>
          <button class="lesson-menu-item ${state.currentTab === 'grammar' ? 'active' : ''}" onclick="App.navigate('reader', {lessonId:${lesson.id}, tab:'grammar'})">문법</button>
          <button class="lesson-menu-item ${state.currentTab === 'quiz' ? 'active' : ''}" onclick="App.navigate('reader', {lessonId:${lesson.id}, tab:'quiz'})">연습문제</button>
        </div>
      </div>
    `;
  }

  /* ---------------- 전역 검색 오버레이 ---------------- */

  async function openSearchOverlay() {
    document.getElementById('search-overlay').classList.add('show');
    const input = document.getElementById('search-overlay-input');
    input.value = '';
    input.focus();
    renderSearchResults('');
  }

  function closeSearchOverlay() {
    document.getElementById('search-overlay').classList.remove('show');
  }

  async function renderSearchResults(query) {
    const resultsEl = document.getElementById('search-overlay-results');
    const q = query.trim().toLowerCase();
    if (!q) {
      resultsEl.innerHTML = `<div class="search-overlay-empty">단어(중국어/병음/한국어 뜻)를 입력해 검색하세요</div>`;
      return;
    }

    const lessons = await getAllLessons();
    const meta = await getLessonsMeta();
    const matches = [];

    lessons.forEach((lesson, idx) => {
      if (!lesson) return;
      const lessonTitle = meta.lessons[idx].title;
      lesson.vocabulary.forEach(v => {
        const haystack = [v.word, v.pinyin, v.meaning, v.partOfSpeech, lessonTitle, lesson.koreanTitle]
          .join(' ').toLowerCase();
        // 병음 검색 시 성조 기호 무시 지원 (간단 매칭)
        const pinyinPlain = v.pinyin.toLowerCase().replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, c => {
          const map = { ā:'a',á:'a',ǎ:'a',à:'a', ē:'e',é:'e',ě:'e',è:'e', ī:'i',í:'i',ǐ:'i',ì:'i', ō:'o',ó:'o',ǒ:'o',ò:'o', ū:'u',ú:'u',ǔ:'u',ù:'u', ǖ:'v',ǘ:'v',ǚ:'v',ǜ:'v' };
          return map[c] || c;
        });
        if (haystack.includes(q) || pinyinPlain.includes(q)) {
          matches.push({ ...v, lessonId: lesson.id, lessonTitle });
        }
      });
    });

    if (matches.length === 0) {
      resultsEl.innerHTML = `<div class="search-overlay-empty">"${escapeHTML(query)}"에 대한 검색 결과가 없습니다</div>`;
      return;
    }

    resultsEl.innerHTML = matches.map(m => `
      <button class="search-result-item" onclick="App.goToWordFromSearch(${m.lessonId}, '${encodeURIComponent(m.word)}')">
        <span>
          <span class="sr-word zh">${m.word}</span>
          <span class="sr-pinyin">${m.pinyin}</span>
          <div class="sr-meaning">${m.meaning}</div>
        </span>
        <span class="sr-lesson zh">${m.lessonTitle}</span>
      </button>
    `).join('');
  }

  async function goToWordFromSearch(lessonId, encodedWord) {
    closeSearchOverlay();
    await navigate('reader', { lessonId, tab: 'vocab' });
    const word = decodeURIComponent(encodedWord);
    setTimeout(() => Vocabulary.showWordDetailByWord(lessonId, word), 60);
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------------- 초기화 ---------------- */

  async function init() {
    initTheme();

    // 헤더 이벤트
    document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
    document.getElementById('edit-mode-toggle-btn').addEventListener('click', toggleEditMode);
    document.getElementById('hamburger-btn').addEventListener('click', openSidebar);
    document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebar);
    document.getElementById('search-overlay-close').addEventListener('click', closeSearchOverlay);
    document.getElementById('search-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'search-overlay') closeSearchOverlay();
    });
    document.getElementById('search-overlay-input').addEventListener('input', (e) => {
      renderSearchResults(e.target.value);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSearchOverlay();
    });

    document.body.classList.toggle('edit-mode-on', getEditMode());
    updateEditModeButton();

    await renderSidebarLessonList();

    // 초기 화면: 마지막 학습 단원이 있으면 홈에서 이어서 볼 수 있도록만 하고, 항상 홈에서 시작
    await navigate('home');
  }

  return {
    init, navigate, getLessonsMeta, getLesson, getAllLessons, invalidateCache,
    getProgress, getLessonProgress, setLessonProgressField, getLessonPercent,
    getLastLessonId, setLastLessonId,
    getBookmarks, toggleBookmark, isBookmarked,
    getDisplayToggles, setDisplayToggle,
    getEditMode, setEditMode, toggleEditMode,
    showToast, speak, ICONS, escapeHTML,
    renderSidebarLessonList, renderInfoPanel,
    openSearchOverlay, closeSearchOverlay, goToWordFromSearch,
    closeSidebar,
    // 관리자(편집) 기능
    addLesson, updateLessonMeta, deleteLesson,
    addSentence, updateSentence, deleteSentence,
    addVocabWord, updateVocabWord, deleteVocabWord,
    addGrammar, updateGrammar, deleteGrammar,
    addQuiz, updateQuiz, deleteQuiz,
    exportLesson, exportLessonsMeta, exportAll, resetAllEdits,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
