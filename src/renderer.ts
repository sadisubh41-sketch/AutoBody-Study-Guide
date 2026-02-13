import { me, loadProgress, saveProgress } from './lib/api';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

declare global {
    interface Window {
        mwaChart?: Chart;
        changeChart?: Chart;
        assessmentMwaChart?: Chart;
        assessmentChangeChart?: Chart;
        dashboardMwaChart?: Chart;
    }
}

// ── Utility helpers ──────────────────────────────────────────────────
function fisherYatesShuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function escapeAttr(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── UID-to-book index (built once at startup) ────────────────────────
let uidToBookIndex: Map<string, any> = new Map();

function buildUidToBookIndex(books: any[]) {
    uidToBookIndex = new Map();
    books.forEach(book => {
        book.sections.forEach((section: any) => {
            section.questions.forEach((q: any) => {
                uidToBookIndex.set(q.uid, book);
            });
        });
    });
}

function getBookForQuestion(uid: string): any | undefined {
    return uidToBookIndex.get(uid);
}

function normalizeClassifications(books: any[], codebook: any) {
    const validMwa = new Set(Object.keys(codebook?.mwa || {}));
    const validTasks = new Set(Object.keys(codebook?.tasks || {}));

    // Build reverse lookup from descriptive names → codes
    const mwaReverse: Record<string, string> = {};
    const taskReverse: Record<string, string> = {};
    if (codebook?.mwa) {
        Object.entries(codebook.mwa).forEach(([code, names]: [string, any]) => {
            if (names.en) mwaReverse[names.en.toLowerCase()] = code;
            if (names.ar) mwaReverse[names.ar.toLowerCase()] = code;
        });
    }
    if (codebook?.tasks) {
        Object.entries(codebook.tasks).forEach(([code, names]: [string, any]) => {
            if (names.en) taskReverse[names.en.toLowerCase()] = code;
            if (names.ar) taskReverse[names.ar.toLowerCase()] = code;
        });
    }

    books.forEach(book => {
        book.sections?.forEach((section: any) => {
            section.questions?.forEach((q: any) => {
                if (!q.classification) {
                    q.classification = { mwa: '', task: '' };
                }
                const mwa = (q.classification.mwa || '').trim();
                if (mwa && !validMwa.has(mwa)) {
                    q.classification.mwa = mwaReverse[mwa.toLowerCase()] || mwa;
                }
                const task = (q.classification.task || '').trim();
                if (task && !validTasks.has(task)) {
                    q.classification.task = taskReverse[task.toLowerCase()] || task;
                }
            });
        });
    });
}

async function fetchData() {
    try {
        const manifestResponse = await fetch('data.json');
        if (!manifestResponse.ok) throw new Error(`Could not fetch data.json. Status: ${manifestResponse.status}`);
        const manifest = await manifestResponse.json();
        const { codebook, bookFiles, glossaryFile } = manifest;
        if (!bookFiles || bookFiles.length === 0) throw new Error("No book files listed in data.json manifest.");

        const bookPromises = bookFiles.map(async (filename: string) => {
            const bookResponse = await fetch(`data/${filename}`);
            if (!bookResponse.ok) throw new Error(`Could not fetch data/${filename}. Status: ${bookResponse.status}`);
            return bookResponse.json();
        });

        let glossaryData: any[] = [];
        if (glossaryFile) {
            const glossaryResponse = await fetch(`data/${glossaryFile}`);
            if (!glossaryResponse.ok) throw new Error(`Could not fetch data/${glossaryFile}. Status: ${glossaryResponse.status}`);
            glossaryData = await glossaryResponse.json();
        }

        const bookResults = await Promise.allSettled(bookPromises);
        const loadedBooks: any[] = [];
        bookResults.forEach((result, i) => {
            if (result.status === 'fulfilled') {
                loadedBooks.push(result.value);
            } else {
                console.warn(`Failed to load book file "${bookFiles[i]}":`, result.reason);
            }
        });
        if (loadedBooks.length === 0) throw new Error("All book files failed to load.");
        return { codebook, books: loadedBooks, manifest, glossary: glossaryData };
    } catch (error: any) {
        console.error("Could not load app data:", error);
        const msg = error?.message ? escapeHtml(error.message) : 'Unknown error';
        document.body.textContent = '';
        const div = document.createElement('div');
        div.className = 'p-8 text-center bg-red-100 text-red-800 rounded-lg';
        div.innerHTML = `<strong>Error:</strong> ${msg}. Please ensure 'data.json' is in the root directory, and all other .json files are inside a 'data/' folder.`;
        document.body.appendChild(div);
        return null;
    }
}


async function main() {
    const APP_DATA = await fetchData();
    if (!APP_DATA) return;

    const state: {
        currentPage: string;
        settings: { username: string; language: string; theme: string };
        quiz: {
            isActive: boolean;
            mode: string;
            questions: any[];
            currentQuestionIndex: number;
            timer: number;
            timerInterval: ReturnType<typeof setInterval> | null;
            questionStartTime: number;
            sessionLog: any[];
            currentQuestionAnswered: boolean;
            currentAnswerLog: { initial: number | null; final: number | null };
            sessionInfo: { bookId: string | null; contextId: string | null; startTime?: string };
        };
        progress: Record<string, any>;
        assessmentLogs: any[];
        flaggedQuestions: string[];
        completedSections: string[];
        sessionHistory: any[];
    } = {
        currentPage: 'dashboard',
        settings: { username: '', language: 'en', theme: 'light' },
        quiz: {
            isActive: false,
            mode: 'study',
            questions: [],
            currentQuestionIndex: 0,
            timer: 0,
            timerInterval: null,
            questionStartTime: 0,
            sessionLog: [],
            currentQuestionAnswered: false,
            currentAnswerLog: { initial: null, final: null },
            sessionInfo: { bookId: null, contextId: null }
        },
        progress: {},
        assessmentLogs: [],
        flaggedQuestions: [],
        completedSections: [],
        sessionHistory: []
    };
    const { books: ALL_BOOKS_DATA, codebook: CODEBOOK, manifest: CURRENT_MANIFEST, glossary: GLOSSARY_TERMS } = APP_DATA;
    buildUidToBookIndex(ALL_BOOKS_DATA);
    normalizeClassifications(ALL_BOOKS_DATA, CODEBOOK);

    let wizardState: { currentStep: number; newBookData: any; newBookFileName: string | null } = {
        currentStep: 1,
        newBookData: null,
        newBookFileName: null,
    };
    
    let glossaryTermRegex: RegExp | null = null;
    let currentPopupTermData: any = null;

    const pages = document.querySelectorAll('.page');
    const navButtons = document.querySelectorAll('.nav-btn');
    const welcomeMessage = document.getElementById('welcome-message')!;
    const usernameInput = document.getElementById('username') as HTMLInputElement;
    const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
    const themeToggle = document.getElementById('theme-toggle') as HTMLInputElement;
    const resetProgressBtn = document.getElementById('reset-progress-btn')!;
    const bookSelectStudy = document.getElementById('book-select-study') as HTMLSelectElement;
    const sectionSelect = document.getElementById('section-select') as HTMLSelectElement;
    const startStudyBtn = document.getElementById('start-study-btn')!;
    const bookSelectQuiz = document.getElementById('book-select-quiz') as HTMLSelectElement;
    const quizSelect = document.getElementById('quiz-select') as HTMLSelectElement;
    const startQuizBtn = document.getElementById('start-quiz-btn')!;
    const generateNewAssessmentBtn = document.getElementById('generate-new-assessment-btn')!;
    const quizBreadcrumbs = document.getElementById('quiz-breadcrumbs')!;
    const quizTimer = document.getElementById('quiz-timer')!;
    const questionEN = document.getElementById('question-en')!;
    const questionAR = document.getElementById('question-ar')!;
    const choicesEN = document.getElementById('choices-en')!;
    const choicesAR = document.getElementById('choices-ar')!;
    const explanationBox = document.getElementById('explanation-box')!;
    const explanationEN = document.getElementById('explanation-en')!;
    const explanationAR = document.getElementById('explanation-ar')!;
    const nextQuestionBtn = document.getElementById('next-question-btn')!;
    const submitAnswerBtn = document.getElementById('submit-answer-btn')!;
    const endSessionBtn = document.getElementById('end-session-btn')!;
    const questionInfoFooter = document.getElementById('question-info-footer')!;
    const englishCol = document.getElementById('english-col')!;
    const arabicCol = document.getElementById('arabic-col')!;
    const toggleTranslationBtn = document.getElementById('toggle-translation-btn')!;
    const reportBookFilter = document.getElementById('report-book-filter') as HTMLSelectElement;
    const reportModeFilter = document.getElementById('report-mode-filter') as HTMLSelectElement;
    const reviewSearch = document.getElementById('review-search') as HTMLInputElement;
    const reviewFlaggedOnly = document.getElementById('review-flagged-only') as HTMLInputElement;
    const reviewList = document.getElementById('review-list')!;
    const flagQuestionBtn = document.getElementById('flag-question-btn')!;
    const flagIcon = document.getElementById('flag-icon')!;
    const reviewFilterStatus = document.getElementById('review-filter-status') as HTMLSelectElement;
    const reviewFilterBook = document.getElementById('review-filter-book') as HTMLSelectElement;
    const reviewFilterSubject = document.getElementById('review-filter-subject') as HTMLSelectElement;
    const reviewFilterMwa = document.getElementById('review-filter-mwa') as HTMLSelectElement;
    const resetFiltersBtn = document.getElementById('reset-filters-btn')!;
    const sessionSummaryModal = document.getElementById('session-summary-modal')!;
    const summaryTitle = document.getElementById('summary-title')!;
    const summaryScore = document.getElementById('summary-score')!;
    const summaryCorrect = document.getElementById('summary-correct')!;
    const summaryIncorrect = document.getElementById('summary-incorrect')!;
    const summaryBreakdown = document.getElementById('summary-breakdown')!;
    const summaryQuestionList = document.getElementById('summary-question-list')!;
    const summaryCloseBtn = document.getElementById('summary-close-btn')!;
    const summaryReportsBtn = document.getElementById('summary-reports-btn')!;
    const reportTabs = document.querySelectorAll('.report-tab');
    const reportTabContents = document.querySelectorAll('.report-tab-content');
    const reportsPlaceholder = document.getElementById('reports-placeholder')!;
    const reportsContent = document.getElementById('reports-content')!;
    const overallProgressStats = document.getElementById('overall-progress-stats')!;
    const overallScoreStats = document.getElementById('overall-score-stats')!;
    const modePerformanceBreakdown = document.getElementById('mode-performance-breakdown')!;
    const performanceBlocks = document.getElementById('performance-blocks')!;
    const assessmentSelectFilter = document.getElementById('assessment-select-filter') as HTMLSelectElement;
    const assessmentReportsPlaceholder = document.getElementById('assessment-reports-placeholder')!;
    const assessmentReportsContent = document.getElementById('assessment-reports-content')!;
    const assessmentOverallStats = document.getElementById('assessment-overall-stats')!;
    const assessmentPerformanceBlocks = document.getElementById('assessment-performance-blocks')!;
    const addBookWizardBtn = document.getElementById('add-book-wizard-btn')!;
    const addBookModal = document.getElementById('add-book-modal')!;
    const closeWizardBtn = document.getElementById('close-wizard-btn')!;
    const wizardStepIndicators = document.querySelectorAll('.wizard-step-indicator');
    const wizardStepContents = document.querySelectorAll('.wizard-step-content');
    const newBookFileInput = document.getElementById('new-book-file-input')!;
    const wizardValidationResults = document.getElementById('wizard-validation-results')!;
    const generateManifestBtn = document.getElementById('generate-manifest-btn')!;
    const wizardNextBtn = document.getElementById('wizard-next-btn') as HTMLButtonElement;
    const overallProgressDashboard = document.getElementById('overall-progress-dashboard')!;
    const quickAccessContent = document.getElementById('quick-access-content')!;
    const studyTip = document.getElementById('study-tip')!;
    const recentActivityLog = document.getElementById('recent-activity-log')!;
    const glossaryNavBtn = document.getElementById('glossary-nav-btn')!;
    const glossaryModal = document.getElementById('glossary-modal')!;
    const glossaryCloseBtn = document.getElementById('glossary-close-btn')!;
    const glossarySearchInput = document.getElementById('glossary-search-input') as HTMLInputElement;
    const glossaryAlphabetFilter = document.getElementById('glossary-alphabet-filter')!;
    const glossaryList = document.getElementById('glossary-list')!;
    const termPopup = document.getElementById('term-popup')!;


	async function loadState() {
	  // 1) Local fallback (instant)
	  try {
		const savedSettings = JSON.parse(localStorage.getItem('redSealAppSettings') || 'null');
		const savedProgress = JSON.parse(localStorage.getItem('redSealAppProgress') || 'null');
		if (savedSettings) state.settings = savedSettings;
		if (savedProgress) {
		  state.progress = savedProgress.progress || {};
		  state.assessmentLogs = savedProgress.assessmentLogs || [];
		  state.flaggedQuestions = savedProgress.flaggedQuestions || [];
		  state.completedSections = savedProgress.completedSections || [];
		  state.sessionHistory = savedProgress.sessionHistory || [];
		}
	  } catch (e) { console.warn('Failed to load local state:', e); }

	  // 2) Server load (authoritative if logged in)
	  try {
		const u = await me();
		if (!u?.user) return; // not logged in yet; keep local

		// Use a single book_id to store whole app state server-side
		const SERVER_BOOK_ID = 'APP_STATE';
		const res = await loadProgress(SERVER_BOOK_ID);
		const data = res?.data || null;
		if (data && typeof data === 'object') {
		  // Merge server data over local
		  if (data.settings) state.settings = data.settings;
		  if (data.progress) state.progress = data.progress;
		  if (Array.isArray(data.assessmentLogs)) state.assessmentLogs = data.assessmentLogs;
		  if (Array.isArray(data.flaggedQuestions)) state.flaggedQuestions = data.flaggedQuestions;
		  if (Array.isArray(data.completedSections)) state.completedSections = data.completedSections;
		  if (Array.isArray(data.sessionHistory)) state.sessionHistory = data.sessionHistory;
		}
	  } catch (e) {
		// If server isn’t available yet, just continue with local data
		console.warn('Server loadState failed (using local only):', e);
	  }
	}

	let saveTimer: number | null = null;

	function saveState() {
	  // 1) Always save locally (fast)
	  try {
		localStorage.setItem('redSealAppSettings', JSON.stringify(state.settings));
		localStorage.setItem('redSealAppProgress', JSON.stringify({
		  progress: state.progress,
		  assessmentLogs: state.assessmentLogs,
		  flaggedQuestions: state.flaggedQuestions,
		  completedSections: state.completedSections,
		  sessionHistory: state.sessionHistory
		}));
	  } catch (e) { console.warn('Failed to save local state:', e); }

	  // 2) Debounced server save (if logged in)
	  if (saveTimer) window.clearTimeout(saveTimer);
	  saveTimer = window.setTimeout(async () => {
		try {
		  const u = await me();
		  if (!u?.user) return; // not logged in yet

		  const SERVER_BOOK_ID = 'APP_STATE';
		  await saveProgress(SERVER_BOOK_ID, {
			settings: state.settings,
			progress: state.progress,
			assessmentLogs: state.assessmentLogs,
			flaggedQuestions: state.flaggedQuestions,
			completedSections: state.completedSections,
			sessionHistory: state.sessionHistory
		  });
		} catch (e) {
		  console.warn('Server saveState failed (kept local):', e);
		}
	  }, 800); // adjust debounce as you like
	}

    function navigateTo(pageId: string) {
        state.currentPage = pageId;
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById(`${pageId}-page`)?.classList.add('active');
        navButtons.forEach((b) => {
            const el = b as HTMLElement;
            let isActive = el.dataset.page === pageId;
            if (pageId === 'quiz') {
                if (state.quiz.mode === 'study' && el.dataset.page === 'study') isActive = true;
                if (state.quiz.mode === 'quiz' && el.dataset.page === 'quiz-setup') isActive = true;
                if (state.quiz.mode === 'assessment' && el.dataset.page === 'self-assessment') isActive = true;
            }
            b.classList.toggle('active', isActive);
        });

        if (pageId === 'dashboard') renderDashboard();
        if (pageId === 'study') populateSectionSelector();
        if (pageId === 'quiz-setup') populateQuizSelector();
        if (pageId === 'self-assessment') renderSelfAssessmentPage();
        if (pageId === 'reports') renderReportsPage();
        if (pageId === 'review') renderReviewPage();
    }

    function applySettings() {
        document.documentElement.classList.toggle('dark', state.settings.theme === 'dark');
        themeToggle.checked = state.settings.theme === 'dark';
        usernameInput.value = state.settings.username;
        welcomeMessage.textContent = state.settings.username ? `Welcome back, ${state.settings.username}!` : `Welcome! Set your name in Settings.`;
        languageSelect.value = state.settings.language;
        document.documentElement.lang = state.settings.language;
        document.documentElement.dir = state.settings.language === 'ar' ? 'rtl' : 'ltr';
    }

    function populateBookSelector() {
        const selectors = [bookSelectStudy, bookSelectQuiz, reportBookFilter, reviewFilterBook];
        selectors.forEach(selector => {
            const currentVal = selector.value;
            selector.innerHTML = '';
            if(selector.id !== 'book-select-study' && selector.id !== 'book-select-quiz') {
                const allOption = document.createElement('option');
                allOption.value = 'all'; allOption.textContent = 'All Books';
                selector.appendChild(allOption);
            }
            ALL_BOOKS_DATA.forEach(book => {
                const option = document.createElement('option');
                option.value = book.id; option.textContent = book.title[state.settings.language] || book.title.en;
                selector.appendChild(option);
            });
            selector.value = currentVal || (selector.id.includes('filter') ? 'all' : ALL_BOOKS_DATA[0]?.id);
        });
        populateSectionSelector();
        populateQuizSelector();
        populateReviewFilters();
        populateSubjectFilter(); // MODIFICATION: Call new function
    }

    function populateSectionSelector() {
        const bookId = bookSelectStudy.value;
        const book = ALL_BOOKS_DATA.find(b => b.id === bookId);
        sectionSelect.innerHTML = '';
        if (!book?.sections) return;
        book.sections.filter(s => !s.id.startsWith('qz')).forEach(section => {
            const option = document.createElement('option');
            option.value = section.id;
            const isCompleted = state.completedSections.includes(`${bookId}_${section.id}`);
            option.textContent = `${section.title[state.settings.language] || section.title.en}`;
            if (isCompleted) {
                option.classList.add('completed-section');
                option.textContent += ' ✅ (Completed)';
            }
            sectionSelect.appendChild(option);
        });
    }

    // MODIFICATION: Added new function to populate the subject filter
    function populateSubjectFilter() {
        const bookId = reviewFilterBook.value;
        const lang = state.settings.language;
        reviewFilterSubject.innerHTML = '<option value="all">All Subjects</option>';

        let sections: { id: string; title: string }[] = [];
        if (bookId === 'all') {
            // Get all unique sections from all books
            const allSectionsMap = new Map();
            ALL_BOOKS_DATA.forEach(book => {
                book.sections.forEach(section => {
                    if (!allSectionsMap.has(section.id)) {
                        allSectionsMap.set(section.id, section.title[lang] || section.title.en);
                    }
                });
            });
            // Convert map to array for sorting
            sections = Array.from(allSectionsMap, ([id, title]) => ({ id, title }));
            sections.sort((a, b) => a.title.localeCompare(b.title));
        } else {
            // Get sections for the selected book
            const book = ALL_BOOKS_DATA.find(b => b.id === bookId);
            if (book?.sections) {
                sections = book.sections.map(section => ({
                    id: section.id,
                    title: section.title[lang] || section.title.en
                }));
            }
        }

        sections.forEach(section => {
            const option = document.createElement('option');
            option.value = section.id;
            option.textContent = section.title;
            reviewFilterSubject.appendChild(option);
        });
    }

    function populateQuizSelector() {
        const bookId = bookSelectQuiz.value;
        const book = ALL_BOOKS_DATA.find(b => b.id === bookId);
        quizSelect.innerHTML = '';
        if (!book?.sections) return;
        book.sections.filter(s => s.id.startsWith('qz')).forEach(quiz => {
            const option = document.createElement('option');
            option.value = quiz.id;
            const isCompleted = state.completedSections.includes(`${bookId}_${quiz.id}`);
            option.textContent = `${quiz.title[state.settings.language] || quiz.title.en}`;
            if (isCompleted) {
                option.classList.add('completed-section');
                option.textContent += ' ✅ (Completed)';
            }
            quizSelect.appendChild(option);
        });
    }
    
    function populateReviewFilters() {
        reviewFilterMwa.innerHTML = '<option value="all">All Categories</option>';
        Object.entries(CODEBOOK.mwa).forEach(([key, value]: [string, any]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `${key}: ${value[state.settings.language] || value.en}`;
            reviewFilterMwa.appendChild(option);
        });
    }
    
    function highlightTermsInText(text: string, lang: string) {
        const isQuizActive = state.quiz.isActive;
        const isAllowedQuizMode = isQuizActive && (state.quiz.mode === 'study' || state.quiz.mode === 'quiz');
        const isReviewPage = state.currentPage === 'review';

        if (!isAllowedQuizMode && !isReviewPage) {
            return text;
        }

        if (!glossaryTermRegex || !text) return text;

        const termMap = GLOSSARY_TERMS.reduce((acc, term) => {
            if (term.norm_en) acc[term.norm_en.toLowerCase()] = term;
            if (term.norm_ar) acc[term.norm_ar.toLowerCase()] = term;
            return acc;
        }, {});
        return text.replace(glossaryTermRegex, (match) => {
            const normalizedMatch = match.toLowerCase();
            const termData = termMap[normalizedMatch];
            if (termData) {
                return `<span class="glossary-term-highlight" data-term-slug="${escapeAttr(termData.slug_en)}">${match}</span>`;
            }
            return match;
        });
    }

    function formatInlineRichText(value: any, lang: string) {
        if (value === undefined || value === null) return '';
        const normalized = String(value).replace(/\r\n/g, '\n');
        const withBreaks = normalized.replace(/\n/g, '<br>');
        return highlightTermsInText(withBreaks, lang);
    }

    function renderRichListItem(item: any, lang: string): string {
        if (item === undefined || item === null) return '';
        if (Array.isArray(item)) {
            return item.map(child => renderRichListItem(child, lang)).join('');
        }
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
            return `<li>${formatInlineRichText(item, lang)}</li>`;
        }
        if (typeof item === 'object') {
            const colorStyle = item.color ? ` style="color:${item.color}"` : '';
            const text = formatInlineRichText(item.content ?? item.text ?? item.value ?? '', lang);
            let childrenHtml = '';
            if (Array.isArray(item.items) && item.items.length > 0) {
                const nestedTag = item.style === 'ordered' ? 'ol' : 'ul';
                childrenHtml = `<${nestedTag} class="rich-text-list">${item.items.map(child => renderRichListItem(child, lang)).join('')}</${nestedTag}>`;
            }
            return `<li${colorStyle}>${text}${childrenHtml}</li>`;
        }
        return '';
    }

    function renderRichTextBlock(block: any, lang: string): string {
        if (block === undefined || block === null) return '';
        if (typeof block === 'string' || typeof block === 'number' || typeof block === 'boolean') {
            return `<p>${formatInlineRichText(block, lang)}</p>`;
        }
        if (Array.isArray(block)) {
            return block.map(item => renderRichTextBlock(item, lang)).join('');
        }
        if (block.html) {
            return highlightTermsInText(block.html, lang);
        }

        const colorStyle = block.color ? ` style="color:${block.color}"` : '';
        switch (block.type) {
            case 'heading': {
                const level = Math.min(Math.max(parseInt(block.level, 10) || 4, 2), 6);
                const text = formatInlineRichText(block.content ?? block.text ?? block.value ?? '', lang);
                return `<h${level} class="rich-text-heading"${colorStyle}>${text}</h${level}>`;
            }
            case 'list': {
                const listTag = block.style === 'ordered' ? 'ol' : 'ul';
                const items = Array.isArray(block.items) ? block.items.map(item => renderRichListItem(item, lang)).join('') : '';
                return `<${listTag} class="rich-text-list"${colorStyle}>${items}</${listTag}>`;
            }
            case 'note':
            case 'callout': {
                const variant = block.variant || 'info';
                const title = block.title ? `<strong>${formatInlineRichText(block.title, lang)}</strong>` : '';
                const body = block.content ? `<div>${formatInlineRichText(block.content, lang)}</div>` : '';
                const extra = block.html ? highlightTermsInText(block.html, lang) : '';
                return `<div class="rich-text-note rich-text-note-${variant}">${title}${body}${extra}</div>`;
            }
            case 'quote': {
                const text = formatInlineRichText(block.content ?? block.text ?? block.value ?? '', lang);
                return `<blockquote class="rich-text-quote"${colorStyle}>${text}</blockquote>`;
            }
            case 'divider': {
                return `<hr class="rich-text-divider">`;
            }
            default: {
                if (block.items) {
                    return renderRichTextBlock({ type: 'list', style: block.style, items: block.items, color: block.color }, lang);
                }
                const text = formatInlineRichText(block.content ?? block.text ?? block.value ?? '', lang);
                return `<p${colorStyle}>${text}</p>`;
            }
        }
    }

    function buildRichTextHtml(value: any, lang: string): string {
        if (value === undefined || value === null) return '';
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            const text = String(value).replace(/\r\n/g, '\n');
            const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
            if (paragraphs.length <= 1) {
                return `<p>${formatInlineRichText(text.trim(), lang)}</p>`;
            }
            return paragraphs.map(paragraph => `<p>${formatInlineRichText(paragraph, lang)}</p>`).join('');
        }
        if (Array.isArray(value)) {
            return value.map(item => renderRichTextBlock(item, lang)).join('');
        }
        if (typeof value === 'object') {
            return renderRichTextBlock(value, lang);
        }
        return '';
    }

    function interpretRichText(definition: any, lang: string): { html: string; direction: string | null } {
        if (definition === undefined || definition === null) {
            return { html: '', direction: null };
        }

        if (typeof definition === 'string' || typeof definition === 'number' || typeof definition === 'boolean' || Array.isArray(definition)) {
            return { html: buildRichTextHtml(definition, lang), direction: null };
        }

        if (typeof definition === 'object') {
            const direction = definition.direction || null;

            if (definition.html) {
                const html = highlightTermsInText(definition.html, lang);
                if (html) return { html, direction };
            }

            if (definition.richText !== undefined) {
                const html = buildRichTextHtml(definition.richText, lang);
                if (html) return { html, direction };
            }

            if (definition.blocks !== undefined) {
                const html = buildRichTextHtml(definition.blocks, lang);
                if (html) return { html, direction };
            }

            if (definition.plain !== undefined) {
                const html = buildRichTextHtml(definition.plain, lang);
                if (html) return { html, direction };
            }

            if (definition.content !== undefined && typeof definition.content !== 'object') {
                const html = buildRichTextHtml(definition.content, lang);
                if (html) return { html, direction };
            }

            const fallbackHtml = buildRichTextHtml(definition, lang);
            return { html: fallbackHtml, direction };
        }

        return { html: '', direction: null };
    }

    function resolveLocalizedRichText(content: any, lang: string): { html: string; direction: string | null } {
        if (!content) return { html: '', direction: null };

        if (typeof content === 'string' || Array.isArray(content) || typeof content === 'number' || typeof content === 'boolean') {
            return interpretRichText(content, lang);
        }

        if (typeof content !== 'object') {
            return { html: '', direction: null };
        }

        const languageKeys = ['en', 'ar', 'fr', 'es'];
        const hasLanguageKeys = languageKeys.some(key => Object.prototype.hasOwnProperty.call(content, key));

        if (hasLanguageKeys) {
            const localizedValue = content[lang];
            if (localizedValue !== undefined) {
                const parsed = interpretRichText(localizedValue, lang);
                if (parsed.html) return parsed;
            }

            for (const fallbackKey of languageKeys) {
                if (fallbackKey !== lang && content[fallbackKey] !== undefined) {
                    return interpretRichText(content[fallbackKey], fallbackKey);
                }
            }
            return { html: '', direction: null };
        }

        return interpretRichText(content, lang);
    }

    function applyRichTextToElement(element: HTMLElement | null, content: any, lang: string) {
        if (!element) return;
        const { html, direction } = resolveLocalizedRichText(content, lang);
        element.innerHTML = html || '';
        if (direction) {
            element.setAttribute('dir', direction);
        } else {
            element.removeAttribute('dir');
        }
    }

    function startQuiz(questions: any[], mode: string, bookId: string | null, contextId: string | null) {
        let questionsToAttempt = questions;
        if (mode !== 'assessment') {
            questionsToAttempt = questions.filter(q => !state.progress[q.uid]?.modes?.[mode]);
        }
        
        if (questionsToAttempt.length === 0 && mode !== 'assessment') {
            alert("You have already attempted all questions in this section. Reset your progress to try again.");
            return;
        }
        state.quiz = { 
            isActive: true, 
            mode, 
            questions: fisherYatesShuffle(questionsToAttempt),
            currentQuestionIndex: 0, 
            timer: 0, 
            timerInterval: null, 
            questionStartTime: 0, 
            sessionLog: [], 
            currentQuestionAnswered: false, 
            currentAnswerLog: { initial: null, final: null },
            sessionInfo: { bookId, contextId, startTime: new Date().toISOString() }
        };
        renderQuizQuestion();
        navigateTo('quiz');
    }
    
    function renderQuizQuestion() {
        const q = state.quiz.questions[state.quiz.currentQuestionIndex];
        if (!q) { endQuiz(); return; }

        arabicCol.classList.add('hidden');
        englishCol.classList.remove('md:col-span-1');
        englishCol.classList.add('md:col-span-2');
        toggleTranslationBtn.innerHTML = `<span class="text-sm">ترجمة</span> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>`;
        
        state.quiz.currentQuestionAnswered = false;
        state.quiz.currentAnswerLog = { initial: null, final: null };
        explanationBox.classList.add('hidden');
        choicesEN.innerHTML = ''; choicesAR.innerHTML = '';
        
        submitAnswerBtn.classList.remove('hidden');
        nextQuestionBtn.classList.add('hidden');
        
        const book = getBookForQuestion(q.uid);
        if (book && CODEBOOK) {
            const { mwa, task } = q.classification || { mwa: '', task: '' };
            const mwaText = CODEBOOK.mwa[mwa]?.[state.settings.language] || '';
            const taskText = CODEBOOK.tasks[task]?.[state.settings.language] || '';
            const bookText = book.title[state.settings.language];
            const section = book.sections.find(sec => sec.questions.some(ques => ques.uid === q.uid));
            const sectionText = section ? section.title[state.settings.language] : '';
            questionInfoFooter.innerHTML = `<div class="flex justify-between w-full flex-wrap gap-x-4"><div><div><strong>Book/Subject:</strong> ${bookText} &bull; ${sectionText}</div><div><strong>Category/Task:</strong> ${mwa} - ${mwaText} &bull; ${taskText}</div></div><div class="text-right"><strong>UID:</strong> ${q.uid}</div></div>`;
        } else { questionInfoFooter.innerHTML = `<span class="float-right">${q.uid}</span>`; }
        
        quizBreadcrumbs.textContent = `Question ${state.quiz.currentQuestionIndex + 1} of ${state.quiz.questions.length}`;
        
        questionEN.innerHTML = highlightTermsInText(q.question.en, 'en');
        questionAR.innerHTML = highlightTermsInText(q.question.ar, 'ar');


        q.choices.forEach((choice, index) => {
            const liEN = document.createElement('li'); liEN.className = "choice p-3 rounded-lg"; liEN.dataset.index = index; 
            liEN.innerHTML = `${String.fromCharCode(65 + index)}. ${highlightTermsInText(choice.en, 'en')}`; 
            choicesEN.appendChild(liEN);

            const liAR = document.createElement('li'); liAR.className = "choice p-3 rounded-lg rtl"; liAR.dataset.index = index; 
            liAR.innerHTML = `(${['أ', 'ب', 'ج', 'د'][index]}) ${highlightTermsInText(choice.ar, 'ar')}`; 
            choicesAR.appendChild(liAR);
        });
        
        updateFlagButton();
        nextQuestionBtn.textContent = (state.quiz.currentQuestionIndex === state.quiz.questions.length - 1) ? "Finish Session" : "Next Question";
        state.quiz.questionStartTime = Date.now();
        startQuizTimer();
    }

    function handleChoiceSelection(target: HTMLElement | null) {
        if (!target || state.quiz.currentQuestionAnswered) return;
        const selectedIndex = parseInt(target.dataset.index ?? '', 10);
        
        if (state.quiz.currentAnswerLog.initial === null) {
            state.quiz.currentAnswerLog.initial = selectedIndex;
        }
        state.quiz.currentAnswerLog.final = selectedIndex;

        document.querySelectorAll('.choice').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll(`.choice[data-index='${selectedIndex}']`).forEach(el => el.classList.add('selected'));
    }

    function lockAndGradeAnswer() {
        if (state.quiz.currentAnswerLog.final === null || state.quiz.currentQuestionAnswered) return;
        
        stopQuizTimer();
        state.quiz.currentQuestionAnswered = true;
        
        const q = state.quiz.questions[state.quiz.currentQuestionIndex];
        const { initial, final } = state.quiz.currentAnswerLog;
        const isCorrect = final === q.correctAnswerIndex;
        const timeSpent = Date.now() - state.quiz.questionStartTime;
        
        if (state.quiz.mode !== 'assessment') {
            // MODIFICATION: Added 'lastAnswer: null' to the default progress object
            const prog = state.progress[q.uid] = state.progress[q.uid] || { correct: 0, incorrect: 0, attempts: 0, totalTime: 0, answerChanges: { ccft: 0, iift: 0, c2i: 0, i2c: 0, i2i: 0 }, modes: {}, lastAnswer: null };
            prog.attempts++;
            prog.totalTime += timeSpent;
            if(isCorrect) prog.correct++; else prog.incorrect++;
            prog.lastAnswer = final; // MODIFICATION: Save the last answer here
    
            prog.modes[state.quiz.mode] = prog.modes[state.quiz.mode] || {correct: 0, incorrect: 0, totalTime: 0, attempts: 0};
            prog.modes[state.quiz.mode].correct += isCorrect ? 1 : 0;
            prog.modes[state.quiz.mode].incorrect += isCorrect ? 0 : 1;
            prog.modes[state.quiz.mode].totalTime += timeSpent;
            prog.modes[state.quiz.mode].attempts++;
            
            const initialWasCorrect = initial === q.correctAnswerIndex;
            if (initial === final) {
                if (isCorrect) prog.answerChanges.ccft++;
                else prog.answerChanges.iift++;
            } else if (initial !== null) {
                if (initialWasCorrect && !isCorrect) prog.answerChanges.c2i++;
                else if (!initialWasCorrect && isCorrect) prog.answerChanges.i2c++;
                else if (!initialWasCorrect && !isCorrect) prog.answerChanges.i2i++;
            }
        }
        
        state.quiz.sessionLog.push({ qId: q.uid, isCorrect, mwa: q.classification?.mwa || '', time: timeSpent, initial, final, correctAnswer: q.correctAnswerIndex});
        saveState();

        if (state.quiz.mode !== 'assessment') {
            document.querySelectorAll('.choice').forEach(item => {
                const itemIndex = parseInt((item as HTMLElement).dataset.index ?? '', 10);
                if (itemIndex === q.correctAnswerIndex) item.classList.add('correct');
                else if (itemIndex === final) item.classList.add('incorrect');
                (item as HTMLElement).style.pointerEvents = 'none';
            });
    
            applyRichTextToElement(explanationEN, q.explanation, 'en');
            applyRichTextToElement(explanationAR, q.explanation, 'ar');
            if ((explanationEN.innerHTML && explanationEN.innerHTML.trim()) || (explanationAR.innerHTML && explanationAR.innerHTML.trim())) {
                explanationBox.classList.remove('hidden');
            }
    
            nextQuestionBtn.classList.remove('hidden');
            submitAnswerBtn.classList.add('hidden');
        } else {
            advanceQuiz();
        }
    }

    function advanceQuiz() {
        if (state.quiz.mode !== 'assessment' && !state.quiz.currentQuestionAnswered) {
             alert("Please submit your answer first."); return;
        }
        if (state.quiz.currentQuestionIndex < state.quiz.questions.length - 1) {
            state.quiz.currentQuestionIndex++;
            renderQuizQuestion();
        } else { endQuiz(); }
    }

    function endQuiz() {
        stopQuizTimer();
        state.quiz.isActive = false;

        const { bookId, contextId, startTime } = state.quiz.sessionInfo;

        const sessionSummaryData = {
            mode: state.quiz.mode,
            contextId,
            bookId,
            startTime,
            endTime: new Date().toISOString(),
            sessionLog: state.quiz.sessionLog
        };

        if (state.quiz.mode === 'assessment') {
             const assessmentLog = state.assessmentLogs.find(log => log.id === contextId);
             if (assessmentLog) {
                 assessmentLog.sessionLog = state.quiz.sessionLog;
                 assessmentLog.status = 'completed';
                 assessmentLog.endDate = sessionSummaryData.endTime;
             }
        } else {
            state.sessionHistory.push(sessionSummaryData);
            if (state.sessionHistory.length > 20) state.sessionHistory.shift();

            if (bookId && contextId) {
                const book = ALL_BOOKS_DATA.find(b => b.id === bookId);
                const section = book?.sections.find(s => s.id === contextId);
                if (section) {
                    const allAttemptedInMode = section.questions.every(q => state.progress[q.uid]?.modes?.[state.quiz.mode]);
                    const sectionIdentifier = `${bookId}_${contextId}`;
                    if (allAttemptedInMode && !state.completedSections.includes(sectionIdentifier)) {
                        state.completedSections.push(sectionIdentifier);
                    }
                }
            }
        }
        saveState();
        showSessionSummary(state.quiz.sessionLog, state.quiz.mode);
    }

    function showSessionSummary(sessionLog: any[], mode: string) {
        const log = sessionLog;
        const total = log.length;
        if (total === 0) { 
            if(mode === 'assessment' || !state.quiz.isActive) { navigateTo('dashboard'); }
            return; 
        }

        const correct = log.filter(l => l.isCorrect).length;
        const incorrect = total - correct;
        const score = Math.round((correct / total) * 100);

        summaryTitle.textContent = `${mode.charAt(0).toUpperCase() + mode.slice(1)} Session Summary`;
        summaryScore.textContent = `${score}%`;
        summaryCorrect.textContent = String(correct);
        summaryIncorrect.textContent = String(incorrect);

        const mwaCounts: Record<string, { c: number; t: number }> = {};
        log.forEach(item => {
            mwaCounts[item.mwa] = mwaCounts[item.mwa] || { c: 0, t: 0 };
            mwaCounts[item.mwa].t++;
            if(item.isCorrect) mwaCounts[item.mwa].c++;
        });
        
        summaryBreakdown.innerHTML = `<h3 class="font-semibold mb-2">Performance by MWA</h3>` + Object.keys(mwaCounts).sort().map(mwa => {
            const {c, t} = mwaCounts[mwa];
            const mwaScore = Math.round((c/t)*100);
            const mwaName = CODEBOOK.mwa[mwa]?.[state.settings.language] || CODEBOOK.mwa[mwa]?.en || mwa;
            return `<div class="text-sm p-2 rounded ${mwaScore >= 70 ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'}"><strong>${mwaName}</strong>: ${c}/${t} correct (${mwaScore}%)</div>`;
        }).join('');
        
        summaryQuestionList.innerHTML = '';
        if (mode === 'assessment') {
            summaryReportsBtn.style.display = 'none';
            const allQuestions = ALL_BOOKS_DATA.flatMap(b => b.sections.flatMap(s => s.questions));
            summaryQuestionList.innerHTML = `<h3 class="font-semibold mt-4 mb-2">Question Review</h3>` + log.map((item, index) => {
                const questionData = allQuestions.find(q => q.uid === item.qId);
                if (!questionData) return '';
                const statusIcon = item.isCorrect ? '✅' : '❌';
                const isFlagged = state.flaggedQuestions.includes(item.qId);
                const flagIconHTML = isFlagged ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="text-indigo-600 inline-block ml-2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>` : '';
                const userChoice = String.fromCharCode(65 + item.final);
                const correctChoice = String.fromCharCode(65 + item.correctAnswer);

                const explanationEn = resolveLocalizedRichText(questionData.explanation, 'en');
                const explanationAr = resolveLocalizedRichText(questionData.explanation, 'ar');
                const englishExplanation = explanationEn.html ? `<div class="mb-3"><p class="font-bold mb-1">Explanation:</p><div class="rich-text"${explanationEn.direction ? ` dir="${explanationEn.direction}"` : ''}>${explanationEn.html}</div></div>` : '';
                const arabicExplanation = explanationAr.html ? `<div class="rtl"><p class="font-bold mt-2 mb-1">:الشرح</p><div class="rich-text"${explanationAr.direction ? ` dir="${explanationAr.direction}"` : ''}>${explanationAr.html}</div></div>` : '';

                return `
                <details class="border-b border-[var(--border-color)]">
                    <summary class="p-2 cursor-pointer flex justify-between items-center text-sm">
                       <span class="truncate"><strong>${index+1}.</strong> ${highlightTermsInText(questionData.question[state.settings.language], state.settings.language)}</span>
                       <span class="font-bold text-lg ml-2 flex items-center">${statusIcon}${flagIconHTML}</span>
                    </summary>
                    <div class="p-4 bg-slate-50 dark:bg-slate-800 border-t border-[var(--border-color)] text-sm">
                        <p>You answered: <strong>${userChoice}</strong>. The correct answer was: <strong>${correctChoice}</strong>.</p>
                        <hr class="my-2 border-[var(--border-color)]">
                        ${englishExplanation}
                        ${arabicExplanation}
                    </div>
                </details>
                `;
            }).join('');
        } else {
             summaryReportsBtn.style.display = 'inline-flex';
        }


        sessionSummaryModal.classList.remove('hidden');
    }

    function startQuizTimer() {
        stopQuizTimer(); 
        state.quiz.timer = 0;
        quizTimer.textContent = '00:00';
        state.quiz.timerInterval = setInterval(() => {
            state.quiz.timer++;
            const minutes = Math.floor(state.quiz.timer / 60).toString().padStart(2, '0');
            const seconds = (state.quiz.timer % 60).toString().padStart(2, '0');
            quizTimer.textContent = `${minutes}:${seconds}`;
        }, 1000);
    }

    function stopQuizTimer() { 
        if (state.quiz.timerInterval) {
            clearInterval(state.quiz.timerInterval); 
            state.quiz.timerInterval = null;
        }
    }
    
    function toggleFlagQuestion() {
        const q = state.quiz.questions[state.quiz.currentQuestionIndex];
        if (!q) return;
        const uid = q.uid;
        const flagIndex = state.flaggedQuestions.indexOf(uid);
        if (flagIndex > -1) state.flaggedQuestions.splice(flagIndex, 1);
        else state.flaggedQuestions.push(uid);
        saveState();
        updateFlagButton();
    }
    
    function updateFlagButton() {
        const q = state.quiz.questions[state.quiz.currentQuestionIndex];
        const isFlagged = q && state.flaggedQuestions.includes(q.uid);
        flagIcon.style.fill = isFlagged ? 'var(--primary-accent)' : 'none';
        flagIcon.classList.toggle('text-indigo-600', isFlagged);
        flagIcon.classList.toggle('text-slate-500', !isFlagged);
    }
    
    function generateAssessment() {
        const EXAM_SIZE = 120;
        const MWA_COUNTS: Record<string, number> = { A: 15, B: 28, C: 24, D: 13, E: 12, F: 22, G: 6 };
        const allQuestions = ALL_BOOKS_DATA.flatMap(b => b.sections.flatMap(s => s.questions));

        const previouslyUsedUids = new Set(state.assessmentLogs.flatMap(log => log.questions));
        const availableQuestions = allQuestions.filter(q => !previouslyUsedUids.has(q.uid));

        if (availableQuestions.length === 0) {
            alert(`There are no unique questions remaining. You can reset your progress to reuse questions.`);
            return;
        }

        const targetSize = Math.min(EXAM_SIZE, availableQuestions.length);

        if (targetSize < EXAM_SIZE) {
            if (!confirm(`There are only ${availableQuestions.length} unique questions remaining. Generate a smaller assessment?`)) {
                return;
            }
        }

        let assessmentQuestions: any[] = [];
        let usedUidsInCurrentGeneration = new Set<string>();

        for (const mwa in MWA_COUNTS) {
            const count = MWA_COUNTS[mwa];
            const mwaQuestions = availableQuestions.filter(q => (q.classification?.mwa || '') === mwa && !usedUidsInCurrentGeneration.has(q.uid));
            const picked = fisherYatesShuffle(mwaQuestions).slice(0, count);
            assessmentQuestions.push(...picked);
            picked.forEach(q => usedUidsInCurrentGeneration.add(q.uid));
        }

        const remainingNeeded = targetSize - assessmentQuestions.length;
        if (remainingNeeded > 0) {
            const remainingPool = availableQuestions.filter(q => !usedUidsInCurrentGeneration.has(q.uid));
            const topUp = fisherYatesShuffle(remainingPool).slice(0, remainingNeeded);
            assessmentQuestions.push(...topUp);
        }
        
        assessmentQuestions = fisherYatesShuffle(assessmentQuestions);
        
        const newAssessmentLog = {
            id: `asmt-${Date.now()}`,
            startDate: new Date().toISOString(),
            questions: assessmentQuestions.map(q => q.uid),
            sessionLog: [],
            status: 'in-progress'
        };
        state.assessmentLogs.push(newAssessmentLog);
        saveState();
        startQuiz(assessmentQuestions, 'assessment', null, newAssessmentLog.id);
    }
    
    function resumeAssessment(assessmentId: string) {
        const assessmentLog = state.assessmentLogs.find(log => log.id === assessmentId);
        if (!assessmentLog || assessmentLog.status === 'completed') {
            alert("This assessment cannot be resumed.");
            return;
        }
        
        const allQuestionsInDB = ALL_BOOKS_DATA.flatMap(b => b.sections.flatMap(s => s.questions));

        const answeredQuestionIds = new Set(assessmentLog.sessionLog.map(item => item.qId));
        const remainingQuestionIds = assessmentLog.questions.filter(uid => !answeredQuestionIds.has(uid));
        
        const remainingQuestions = remainingQuestionIds.map(uid => allQuestionsInDB.find(q => q.uid === uid)).filter(Boolean);

        if (remainingQuestions.length === 0) {
            assessmentLog.status = 'completed';
            saveState();
            renderSelfAssessmentPage();
            alert("Assessment is already complete.");
            return;
        }
        
        state.quiz = { 
            isActive: true, 
            mode: 'assessment', 
            questions: fisherYatesShuffle(remainingQuestions), 
            currentQuestionIndex: 0, 
            timer: 0, 
            timerInterval: null, 
            questionStartTime: 0, 
            sessionLog: assessmentLog.sessionLog, 
            currentQuestionAnswered: false, 
            currentAnswerLog: { initial: null, final: null },
            sessionInfo: { bookId: null, contextId: assessmentId, startTime: assessmentLog.startDate }
        };
        
        renderQuizQuestion();
        navigateTo('quiz');
    }

    function reviewCompletedAssessment(assessmentId: string) {
        const assessmentLog = state.assessmentLogs.find(l => l.id === assessmentId);
        if (assessmentLog && assessmentLog.status === 'completed') {
            showSessionSummary(assessmentLog.sessionLog, 'assessment');
        }
    }

    function deleteAssessment(assessmentId: string) {
        if (confirm("Are you sure you want to delete this assessment? This action cannot be undone.")) {
            state.assessmentLogs = state.assessmentLogs.filter(log => log.id !== assessmentId);
            saveState();
            renderSelfAssessmentPage();
            if (state.currentPage === 'reports') {
                renderAssessmentReports();
            }
        }
    }

    function renderSelfAssessmentPage() {
        const assessmentList = document.getElementById('assessment-list')!;
        assessmentList.innerHTML = '';
        if (state.assessmentLogs.length === 0) {
            assessmentList.innerHTML = `<p class="text-slate-500 text-center p-4">You have not generated any self-assessments yet.</p>`;
            return;
        }
    
        [...state.assessmentLogs].reverse().forEach(log => {
            const isCompleted = log.status === 'completed';
            let statsHTML = '', resultText = '', timeSpentText = '', actionButtonHTML = '';
            let cardClass = 'card p-4 rounded-lg flex flex-wrap justify-between items-center gap-y-2';
    
            if (isCompleted) {
                const correct = log.sessionLog.filter(i => i.isCorrect).length;
                const total = log.sessionLog.length;
                const score = total > 0 ? Math.round((correct / total) * 100) : 0;
                const passed = score >= 70;
                
                cardClass += passed ? ' bg-green-50 dark:bg-green-900/50 border-green-200 dark:border-green-700' : ' bg-red-50 dark:bg-red-900/50 border-red-200 dark:border-red-700';
                statsHTML = `<div class="font-semibold text-lg ${passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">${score}%</div><div class="text-xs">${correct} Correct / ${total - correct} Incorrect</div>`;
                resultText = `<div class="font-bold text-sm ${passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">${passed ? 'Pass' : 'Fail'}</div>`;
    
                if (log.startDate && log.endDate) {
                    const duration = new Date(log.endDate).getTime() - new Date(log.startDate).getTime();
                    if (!isNaN(duration) && duration > 0) {
                        const minutes = Math.floor((duration / (1000 * 60)) % 60);
                        const hours = Math.floor(duration / (1000 * 60 * 60));
                        timeSpentText = `<p class="text-xs text-slate-500 mt-1">Time: ${hours > 0 ? hours+'h ' : ''}${minutes}m</p>`;
                    }
                }
                actionButtonHTML = `<button data-id="${log.id}" class="review-assessment-btn btn-secondary flex items-center justify-center gap-1 w-24">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10M18 20V4M6 20V16"/></svg>
                    Review
                </button>`;
            } else {
                statsHTML = `<div class="text-sm font-semibold text-amber-600 dark:text-amber-400">In Progress</div>`;
                resultText = `<div class="text-sm font-semibold text-amber-600 dark:text-amber-400">${log.sessionLog.length} / ${log.questions.length} answered</div>`;
                actionButtonHTML = `<button data-id="${log.id}" class="resume-assessment-btn btn-secondary w-24">Resume</button>`;
            }
            
            const assessmentItem = document.createElement('div');
            assessmentItem.className = cardClass;
            assessmentItem.innerHTML = `
                <div class="flex-grow">
                    <p class="font-bold">Assessment from ${new Date(log.startDate).toLocaleString()}</p>
                    <div class="flex items-center gap-4">
                        <p class="text-xs text-slate-500">${log.questions.length} questions</p>${timeSpentText}
                    </div>
                </div>
                <div class="text-center w-32 px-2">${resultText}</div>
                <div class="text-right w-32">${statsHTML}</div>
                <div class="flex items-center gap-2 pl-4">
                  ${actionButtonHTML}
                  <button data-id="${log.id}" class="delete-assessment-btn p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900 text-slate-400 hover:text-red-600" title="Delete Assessment">
                     <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                  </button>
                </div>`;
            assessmentList.appendChild(assessmentItem);
        });
        
        document.querySelectorAll('.resume-assessment-btn').forEach(btn => btn.addEventListener('click', () => resumeAssessment((btn as HTMLElement).dataset.id!)));
        document.querySelectorAll('.review-assessment-btn').forEach(btn => btn.addEventListener('click', () => reviewCompletedAssessment((btn as HTMLElement).dataset.id!)));
        document.querySelectorAll('.delete-assessment-btn').forEach(btn => btn.addEventListener('click', () => deleteAssessment((btn as HTMLElement).dataset.id!)));
    }

    function collectQuestionPerformance(uid: string) {
        const stats = { correct: 0, incorrect: 0, total: 0, modes: new Set<string>() };
        const progressEntry = state.progress[uid];
        if (progressEntry && progressEntry.modes) {
            Object.entries(progressEntry.modes).forEach(([mode, modeStats]: [string, any]) => {
                if (mode !== 'assessment' && modeStats) {
                    stats.modes.add(mode);
                    stats.correct += modeStats.correct || 0;
                    stats.incorrect += modeStats.incorrect || 0;
                }
            });
        }

        if (stats.correct === 0 && stats.incorrect === 0) {
            state.sessionHistory.forEach(session => {
                if (session && session.mode && session.mode !== 'assessment' && Array.isArray(session.sessionLog)) {
                    const attempts = session.sessionLog.filter(entry => entry.qId === uid);
                    if (attempts.length > 0) {
                        stats.modes.add(session.mode);
                        attempts.forEach(entry => {
                            if (entry.isCorrect) stats.correct++;
                            else stats.incorrect++;
                        });
                    }
                }
            });
        }

        stats.total = stats.correct + stats.incorrect;
        return stats;
    }

    /**
     * Finds the last recorded answer for a specific question UID
     * by searching through session and assessment history.
     */
    // MODIFICATION: Rewrote this function to be more robust.
    // This now correctly finds the single most recent attempt across ALL sessions.
    function getLastAnswer(uid: string): number | null {
        // 1. Check the persistent progress object first.
        // This is the most reliable source as it's saved after every question.
        const progressEntry = state.progress[uid];
        if (progressEntry && typeof progressEntry.lastAnswer === 'number' && progressEntry.lastAnswer !== null) {
            return progressEntry.lastAnswer;
        }

        // 2. Fallback: Check session history (for sessions that *were* completed)
        let lastAttempt: any = null;
        let mostRecentTime = 0;

        // Check non-assessment sessions
        (state.sessionHistory || []).forEach(session => {
            if (!session || !session.endTime) return;
            const sessionEndTime = new Date(session.endTime).getTime();
            
            // Find *last* attempt for this UID in this session's log
            const attempt = (session.sessionLog || []).slice().reverse().find(log => log.qId === uid);
            
            if (attempt) {
                if (sessionEndTime > mostRecentTime) {
                    mostRecentTime = sessionEndTime;
                    lastAttempt = attempt;
                }
            }
        });

        // Check assessment logs
        (state.assessmentLogs || []).forEach(log => {
            if (!log) return;
            const assessmentTime = new Date(log.endDate || log.startDate).getTime();
            
            // Find *the* attempt for this UID in this log
            const attempt = (log.sessionLog || []).find(item => item.qId === uid);

            if (attempt) {
                 // MODIFICATION: Fixed typo "mostRealTime" to "mostRecentTime"
                 if (assessmentTime > mostRecentTime) {
                    mostRecentTime = assessmentTime;
                    lastAttempt = attempt;
                 }
            }
        });
        
        // After checking all sessions, return the 'final' answer of the most recent attempt
        return lastAttempt ? lastAttempt.final : null;
    }

    function renderReviewPage() {
        const lang = state.settings.language;
        const searchTerm = reviewSearch.value.toLowerCase();
        const flaggedOnly = reviewFlaggedOnly.checked;
        const statusFilter = reviewFilterStatus.value;
        const bookFilter = reviewFilterBook.value;
        const subjectFilter = reviewFilterSubject.value; // MODIFICATION: Get new filter value
        const mwaFilter = reviewFilterMwa.value;

        const attemptedUIDSet = new Set();
        Object.entries(state.progress).forEach(([uid, prog]) => {
            const modes = prog?.modes || {};
            const hasAttempts = Object.entries(modes).some(([mode, stats]: [string, any]) => mode !== 'assessment' && (stats?.attempts || stats?.correct || stats?.incorrect));
            if (hasAttempts || (prog.correct || 0) + (prog.incorrect || 0) > 0) {
                attemptedUIDSet.add(uid);
            }
        });
        state.sessionHistory.forEach(session => {
            if (Array.isArray(session?.sessionLog)) {
                session.sessionLog.forEach(entry => {
                    if (entry?.qId) attemptedUIDSet.add(entry.qId);
                });
            }
        });

        const allQuestions = ALL_BOOKS_DATA.flatMap(b => b.sections.flatMap(s => s.questions));
        const statsCache = new Map();
        const getStats = (uid) => {
            if (!statsCache.has(uid)) {
                statsCache.set(uid, collectQuestionPerformance(uid));
            }
            return statsCache.get(uid);
        };

        if (attemptedUIDSet.size === 0) {
            reviewList.innerHTML = `<p class="text-slate-500 text-center p-4">Answer questions in Study or Quiz mode to unlock the review list.</p>`;
            return;
        }

        const filteredQuestions = allQuestions
            .filter(q => attemptedUIDSet.has(q.uid))
            .map(question => ({ question, stats: getStats(question.uid) }))
            .filter(({ stats }) => stats.total > 0)
            .filter(({ question }) => !flaggedOnly || state.flaggedQuestions.includes(question.uid))
            .filter(({ question }) => {
                if (!searchTerm) return true;
                return question.question.en.toLowerCase().includes(searchTerm)
                    || question.question.ar.includes(searchTerm)
                    || question.uid.toLowerCase().includes(searchTerm);
            })
            .filter(({ stats }) => {
                if (statusFilter === 'all') return true;
                const mostlyCorrect = stats.correct >= stats.incorrect;
                return statusFilter === 'correct' ? mostlyCorrect : !mostlyCorrect;
            })
            .filter(({ question }) => bookFilter === 'all' || getBookForQuestion(question.uid)?.id === bookFilter)
            // MODIFICATION: Add filter logic for subject
            .filter(({ question }) => {
                if (subjectFilter === 'all') return true;
                // Find which section this question belongs to
                for (const book of ALL_BOOKS_DATA) {
                    for (const section of book.sections) {
                        if (section.questions.some(q_in_section => q_in_section.uid === question.uid)) {
                            return section.id === subjectFilter;
                        }
                    }
                }
                return false;
            })
            .filter(({ question }) => mwaFilter === 'all' || (question.classification?.mwa || '') === mwaFilter);

        // MODIFICATION: Reworked the entire HTML generation for the review list
        reviewList.innerHTML = filteredQuestions.length > 0 ? filteredQuestions.map(({ question: q, stats }) => {
            const isFlagged = state.flaggedQuestions.includes(q.uid);
            const statusIcon = stats.correct === stats.incorrect ? '⏳' : (stats.correct > stats.incorrect ? '✅' : '❌');
            const book = getBookForQuestion(q.uid);
            const section = book?.sections.find((s: any) => s.questions.some((qu: any) => qu.uid === q.uid));
            const bookText = book?.title?.[lang] || book?.title?.en || '';
            const sectionText = section?.title?.[lang] || section?.title?.en || '';
            const qMwa = q.classification?.mwa || '';
            const qTask = q.classification?.task || '';
            const mwaText = CODEBOOK.mwa[qMwa]?.[lang] || CODEBOOK.mwa[qMwa]?.en || '';
            const taskText = CODEBOOK.tasks[qTask]?.[lang] || CODEBOOK.tasks[qTask]?.en || '';
            const modesAttempted = Array.from(stats.modes).filter(mode => mode !== 'assessment').map(mode => `<span class="mode-tag mode-${mode}">${mode}</span>`).join(' ');

            const lastAnswer = getLastAnswer(q.uid);
            
            // Generate English choices HTML
            const enChoicesHtml = q.choices.map((choice, index) => {
                const isCorrect = index === q.correctAnswerIndex;
                const isSelected = index === lastAnswer;
                
                let choiceClass = 'review-choice-item p-3 rounded-lg border text-sm';
                if (isCorrect) {
                    // Correct answer
                    choiceClass += ' border-green-500 bg-green-50 dark:bg-green-900/50 font-semibold';
                } else if (isSelected) {
                    // User's incorrect selection
                    choiceClass += ' border-red-500 bg-red-50 dark:bg-red-900/50 opacity-70 line-through';
                } else {
                    // Other incorrect/unselected answers
                    choiceClass += ' border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 opacity-60';
                }

                return `<li class="${choiceClass}">
                            ${String.fromCharCode(65 + index)}. ${highlightTermsInText(choice.en, 'en')}
                        </li>`;
            }).join('');
            
            // Generate Arabic choices HTML
            const arChoicesHtml = q.choices.map((choice, index) => {
                const isCorrect = index === q.correctAnswerIndex;
                const isSelected = index === lastAnswer;

                let choiceClass = 'review-choice-item p-3 rounded-lg border text-sm';
                if (isCorrect) {
                    // Correct answer
                    choiceClass += ' border-green-500 bg-green-50 dark:bg-green-900/50 font-semibold';
                } else if (isSelected) {
                    // User's incorrect selection
                    choiceClass += ' border-red-500 bg-red-50 dark:bg-red-900/50 opacity-70 line-through';
                } else {
                    // Other incorrect/unselected answers
                    choiceClass += ' border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 opacity-60';
                }
                
                return `<li class="${choiceClass}">
                            (${['أ', 'ب', 'ج', 'د'][index]}) ${highlightTermsInText(choice.ar, 'ar')}
                        </li>`;
            }).join('');
            
            // MODIFICATION: Add classes for flagged state
            const headerClasses = "p-3 bg-slate-50 dark:bg-slate-800 border-b border-[var(--border-color)] flex justify-between items-start gap-4";
            const flaggedClass = isFlagged ? ' bg-amber-50 dark:bg-amber-900/50 border-amber-300 dark:border-amber-700' : '';
            const flagIconColor = isFlagged ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600';


            // Return the full question card
            return `
                <div class="review-question-card border border-[var(--border-color)] rounded-lg overflow-hidden mb-4 ${isFlagged ? 'border-amber-300 dark:border-amber-700' : ''}">
                    <!-- Header: Info, Stats, Flag -->
                    <div class="${headerClasses} ${flaggedClass}">
                        <div class="flex-grow">
                            <p class="text-xs text-slate-500"><strong>Book:</strong> ${bookText} &bull; <strong>Subject:</strong> ${sectionText}</p>
                            <p class="text-xs text-slate-500"><strong>Category:</strong> ${qMwa} - ${mwaText}</p>
                            <p class="text-xs text-slate-500 mt-1"><strong>UID:</strong> ${q.uid}</p>
                        </div>
                        <div class="text-right flex-shrink-0">
                            <div class="flex items-center justify-end gap-3">
                                <span class="text-xs">${stats.correct}C / ${stats.incorrect}I</span>
                                <span class="text-xl" title="Performance">${statusIcon}</span>
                                ${isFlagged ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" class="${flagIconColor} inline-block" title="Flagged"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>` : ''}
                            </div>
                            <div class="text-xs truncate mt-1">${modesAttempted}</div>
                        </div>
                    </div>

                    <!-- Body: Question, Choices -->
                    <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <!-- English Column -->
                        <div class="ltr">
                            <p class="font-semibold mb-3">${highlightTermsInText(q.question.en, 'en')}</p>
                            <ul class="space-y-2">
                                ${enChoicesHtml}
                            </ul>
                        </div>

                        <!-- Arabic Column -->
                        <div class="rtl text-right">
                            <p class="font-semibold mb-3">${highlightTermsInText(q.question.ar, 'ar')}</p>
                            <ul class="space-y-2">
                                ${arChoicesHtml}
                            </ul>
                        </div>
                    </div>

                    <!-- Footer: Explanation Icons -->
                    <div class="p-3 border-t border-[var(--border-color)] bg-slate-50 dark:bg-slate-800 flex items-center gap-4">
                        <h4 class="font-semibold text-sm">Explanation:</h4>
                        <!-- MODIFICATION: Replaced icons with Globe (EN) and Languages (AR) -->
                        <button class="review-explanation-btn p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700" data-lang="en" data-uid="${q.uid}" title="Show English Explanation">
                             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-600 dark:text-slate-300">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="2" y1="12" x2="22" y2="12"></line>
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                            </svg>
                        </button>
                        <button class="review-explanation-btn p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700" data-lang="ar" data-uid="${q.uid}" title="Show Arabic Explanation">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-600 dark:text-slate-300">
                                <path d="m5 8 6 6"></path>
                                <path d="m4 14 6-6 2-3"></path>
                                <path d="M2 5h12"></path>
                                <path d="M7 2h1"></path>
                                <path d="m22 22-5-10-5 10"></path>
                                <path d="M14 18h6"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('') : `<p class="text-slate-500 text-center p-4">No questions match your current filters.</p>`;
    
        // Add event listener for explanation buttons using event delegation
        reviewList.querySelectorAll('.review-explanation-btn').forEach(btn => {
            const el = btn as HTMLElement;
            btn.addEventListener('click', () => showReviewExplanation(el.dataset.uid!, el.dataset.lang!));
        });
    }

    /**
     * Shows a popup with the explanation for a given question and language.
     * Re-uses the glossary modal.
     */
    function showReviewExplanation(uid: string, lang: string) {
        const allQuestions = ALL_BOOKS_DATA.flatMap(b => b.sections.flatMap(s => s.questions));
        const question = allQuestions.find(q => q.uid === uid);
        if (!question) return;

        // Get the rich text HTML for the explanation
        const { html, direction } = resolveLocalizedRichText(question.explanation, lang);
        
        // Hijack the glossary modal to show the explanation
        const glossaryModalTitle = glossaryModal.querySelector('h2');
        if (glossaryModalTitle) {
            glossaryModalTitle.textContent = `Explanation (${lang.toUpperCase()})`;
        }
        glossarySearchInput.style.display = 'none';
        glossaryAlphabetFilter.style.display = 'none';
        
        if (html) {
            glossaryList.innerHTML = `<div class="rich-text p-4"${direction ? ` dir="${direction}"` : ''}>${html}</div>`;
        } else {
            glossaryList.innerHTML = `<p class="text-center text-slate-500 p-4">No explanation available for this language.</p>`;
        }
        
        glossaryList.scrollTop = 0; // Scroll to top
        glossaryModal.classList.remove('hidden');
    }

    function renderReportsPage() {
        renderOverallReports();
        renderAssessmentReports();
    }
    
    function renderOverallReports() {
        if (!Chart) return;
    
        const bookFilter = reportBookFilter.value;
        const modeFilter = reportModeFilter.value === 'assessment' ? 'all' : reportModeFilter.value;
    
        const allQuestionsInDB = ALL_BOOKS_DATA.flatMap(b => b.sections.flatMap(s => s.questions));
        const allQuestionsInFilter = (bookFilter === 'all') 
            ? allQuestionsInDB 
            : ALL_BOOKS_DATA.find(b => b.id === bookFilter)?.sections.flatMap(s => s.questions) || [];
        const totalQuestions = allQuestionsInFilter.length;
        
        const filteredProgressEntries = Object.entries(state.progress).filter(([uid, prog]) => {
            const hasNonAssessmentMode = Object.keys(prog.modes || {}).some(m => m !== 'assessment');
            if (!hasNonAssessmentMode) return false;
    
            const question = allQuestionsInDB.find(q => q.uid === uid);
            if (!question) return false;
            
            const bookForQ = getBookForQuestion(uid);
            const bookMatch = (bookFilter === 'all') || (bookForQ?.id === bookFilter);
            
            const modeMatch = (modeFilter === 'all') || (prog.modes && prog.modes[modeFilter]);
    
            return bookMatch && modeMatch;
        });
        
        const attemptedQuestionsCount = new Set(filteredProgressEntries.map(([uid]) => uid)).size;
        
        overallProgressStats.innerHTML = `
            <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${totalQuestions}</div><div class="text-sm text-slate-500">Total Questions</div></div>
            <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${attemptedQuestionsCount}</div><div class="text-sm text-slate-500">Attempted</div></div>
            <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${totalQuestions - attemptedQuestionsCount}</div><div class="text-sm text-slate-500">Unseen</div></div>
            <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${totalQuestions > 0 ? Math.round((attemptedQuestionsCount / totalQuestions) * 100) : 0}%</div><div class="text-sm text-slate-500">Coverage</div></div>`;
    
        let totalCorrect = 0, totalIncorrect = 0;
        filteredProgressEntries.forEach(([uid, prog]) => {
            const modesToConsider = (modeFilter === 'all') ? ['study', 'quiz'] : [modeFilter];
            modesToConsider.forEach(mode => {
                if (prog.modes?.[mode]) {
                    totalCorrect += prog.modes[mode].correct;
                    totalIncorrect += prog.modes[mode].incorrect;
                }
            });
        });
        const overallScore = (totalCorrect + totalIncorrect > 0) ? Math.round((totalCorrect / (totalCorrect + totalIncorrect)) * 100) : 0;
        
        overallScoreStats.innerHTML = `
            <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${overallScore}%</div><div class="text-sm text-slate-500">Overall Score</div></div>
            <div class="card p-4 rounded-lg"><div class="text-2xl font-bold text-green-500">${totalCorrect}</div><div class="text-sm text-slate-500">Correct</div></div>
            <div class="card p-4 rounded-lg"><div class="text-2xl font-bold text-red-500">${totalIncorrect}</div><div class="text-sm text-slate-500">Incorrect</div></div>
            <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${attemptedQuestionsCount}</div><div class="text-sm text-slate-500">Answered</div></div>`;
        
        if (attemptedQuestionsCount === 0) {
            reportsPlaceholder.style.display = 'block';
            reportsContent.classList.add('hidden');
            return;
        }
        reportsPlaceholder.style.display = 'none';
        reportsContent.classList.remove('hidden');
        
        const modeStats = { study: {c:0, i:0, t:0}, quiz: {c:0, i:0, t:0} };
        filteredProgressEntries.forEach(([uid, prog]) => {
            for(const mode in prog.modes) {
                if(mode !== 'assessment' && (modeFilter === 'all' || mode === modeFilter)) {
                    if (modeStats[mode]) {
                        modeStats[mode].c += prog.modes[mode].correct;
                        modeStats[mode].i += prog.modes[mode].incorrect;
                        modeStats[mode].t += prog.modes[mode].totalTime;
                    }
                }
            }
        });
    
        const formatTime = (ms) => {
            if (!ms) return '0s';
            const seconds = Math.round((ms / 1000) % 60);
            const minutes = Math.floor((ms / (1000 * 60)) % 60);
            const hours = Math.floor((ms / (1000 * 60 * 60)));
            return `${hours > 0 ? hours+'h ' : ''}${minutes > 0 ? minutes+'m ' : ''}${seconds}s`;
        };
        
        modePerformanceBreakdown.innerHTML = Object.keys(modeStats).map(mode => {
            const {c, i, t} = modeStats[mode];
            const total = c + i;
            if (total === 0) return '';
            const score = Math.round((c/total) * 100);
            return `<div class="card p-4 rounded-lg text-center">
                        <div class="text-lg font-bold capitalize">${mode}</div>
                        <div class="text-3xl font-bold my-2">${score}%</div>
                        <div class="text-sm text-slate-500">${c} Correct / ${i} Incorrect</div>
                        <div class="text-sm text-slate-500 mt-1">Total Time: ${formatTime(t)}</div>
                    </div>`;
        }).join('');
        
        const getStatsByCategory = (key) => {
            const data = {};
            filteredProgressEntries.forEach(([uid, prog]) => {
                const q = allQuestionsInDB.find(q => q.uid === uid);
                if(!q) return;
                let categoryId;
                if (key === 'book') {
                    const bk = getBookForQuestion(uid);
                    categoryId = bk?.id;
                } else if (key === 'subject') {
                    const bk = getBookForQuestion(uid);
                    if (!bk) return;
                    const section = bk.sections.find((s: any) => s.questions.some((qu: any) => qu.uid === q.uid));
                    categoryId = section?.id;
                }
                else if (key === 'mwa') categoryId = q.classification?.mwa || 'Uncategorized';
                else if (key === 'task') categoryId = q.classification?.task || 'Uncategorized';

                if (!categoryId) return;
                data[categoryId] = data[categoryId] || { c: 0, i: 0 };

                const modesToConsider = (modeFilter === 'all') ? ['study', 'quiz'] : [modeFilter];
                modesToConsider.forEach(mode => {
                    if (prog.modes?.[mode]) {
                        data[categoryId].c += prog.modes[mode].correct;
                        data[categoryId].i += prog.modes[mode].incorrect;
                    }
                });
            });
            return data;
        };
    
        const createBlockHTML = (title, data, nameMap) => {
            let html = `<div class="card p-4 rounded-lg"><h4 class="font-bold text-lg mb-4">${title}</h4><ul class="text-sm space-y-4 max-h-60 overflow-y-auto pr-2">`;
            const sortedKeys = Object.keys(data).sort();
            sortedKeys.forEach(key => {
                const {c, i} = data[key];
                const total = c + i;
                if (total === 0) return;
                const score = Math.round((c/total) * 100);
                const name = nameMap(key);
                html += `
                    <li class="performance-item">
                        <div class="flex justify-between items-center mb-1">
                            <span class="font-semibold truncate">${name}</span>
                            <span class="font-bold text-slate-600 dark:text-slate-300 text-xs">${score}% (${c}/${total})</span>
                        </div>
                        <div class="stats-bar">
                            <div class="stats-bar-fill" style="width: ${score}%; background-image: linear-gradient(to right, ${score >= 70 ? '#22c55e' : (score >= 40 ? '#f97316' : '#ef4444')}, ${score >= 70 ? '#4ade80' : (score >= 40 ? '#fb923c' : '#f87171')});"></div>
                        </div>
                    </li>`;
            });
            return html + `</ul></div>`;
        };
    
        const bookData = getStatsByCategory('book');
        const subjectData = getStatsByCategory('subject');
        const mwaChartData = getStatsByCategory('mwa');
        const taskData = getStatsByCategory('task');
    
        const bookNameMap = (id) => ALL_BOOKS_DATA.find(b => b.id === id)?.title[state.settings.language] || id;
        const subjectNameMap = (id) => ALL_BOOKS_DATA.flatMap(b => b.sections).find(s => s.id === id)?.title[state.settings.language] || id;
        const mwaNameMap = (id) => `${id}: ${CODEBOOK.mwa[id]?.[state.settings.language] || ''}`;
        const taskNameMap = (id) => `${id}: ${CODEBOOK.tasks[id]?.[state.settings.language] || ''}`;
    
        performanceBlocks.innerHTML = `
            ${createBlockHTML('By Book', bookData, bookNameMap)}
            ${createBlockHTML('By Subject', subjectData, subjectNameMap)}
            ${createBlockHTML('By Category (MWA)', mwaChartData, mwaNameMap)}
            ${createBlockHTML('By Task', taskData, taskNameMap)}
        `;
    
        const mwaLabels = Object.keys(CODEBOOK.mwa).sort();
        const mwaChartCtx = (document.getElementById('mwa-chart') as HTMLCanvasElement).getContext('2d')!;
        if (window.mwaChart) window.mwaChart.destroy();
        window.mwaChart = new Chart(mwaChartCtx, {
            type: 'bar', data: {
                labels: mwaLabels.map(l => `${l}: ${CODEBOOK.mwa[l][state.settings.language] || CODEBOOK.mwa[l].en}`),
                datasets: [
                    { label: 'Correct', data: mwaLabels.map(l => mwaChartData[l]?.c || 0), backgroundColor: '#22c55e' },
                    { label: 'Incorrect', data: mwaLabels.map(l => mwaChartData[l]?.i || 0), backgroundColor: '#ef4444' }
                ]
            }, options: { 
                indexAxis: 'y', 
                scales: { x: { stacked: true }, y: { stacked: true, ticks:{font: {size: 10}} } }, 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const value = context.raw as number;
                                const total = context.chart.data.datasets.reduce((acc: number, dataset) => acc + ((dataset.data[context.dataIndex] as number) || 0), 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
        
        const changeData = { ccft: 0, iift: 0, c2i: 0, i2c: 0, i2i: 0 };
        filteredProgressEntries.forEach(([uid, prog]) => {
            const changes = prog.answerChanges || {};
            changeData.ccft += changes.ccft || 0;
            changeData.iift += changes.iift || 0;
            changeData.c2i += changes.c2i || 0;
            changeData.i2c += changes.i2c || 0;
            changeData.i2i += changes.i2i || 0;
        });
        
        const changeChartCtx = (document.getElementById('change-chart') as HTMLCanvasElement).getContext('2d')!;
        if(window.changeChart) window.changeChart.destroy();
        window.changeChart = new Chart(changeChartCtx, {
            type: 'doughnut', data: {
                labels: ['Correct (1st Time)', 'Incorrect (1st Time)', 'Correct to Incorrect', 'Incorrect to Correct', 'Incorrect to Incorrect'],
                datasets: [{ 
                    data: [changeData.ccft, changeData.iift, changeData.c2i, changeData.i2c, changeData.i2i], 
                    backgroundColor: ['#22c55e', '#fde047', '#f97316', '#84cc16', '#ef4444'] 
                }]
            }, options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw as number;
                                const total = context.chart.data.datasets[0].data.reduce((acc: number, val) => acc + (val as number), 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    function renderAssessmentReports() {
        const currentSelection = assessmentSelectFilter.value;
        assessmentSelectFilter.innerHTML = '<option value="">Select an Assessment</option>';
        const completedAssessments = state.assessmentLogs.filter(log => log.status === 'completed').reverse();

        if (completedAssessments.length === 0) {
            assessmentSelectFilter.innerHTML = '';
            assessmentReportsPlaceholder.style.display = 'block';
            assessmentReportsContent.classList.add('hidden');
            return;
        }
        
        completedAssessments.forEach(log => {
            const option = document.createElement('option');
            option.value = log.id;
            option.textContent = `Assessment from ${new Date(log.startDate).toLocaleString()}`;
            assessmentSelectFilter.appendChild(option);
        });

        const selectedId = currentSelection && completedAssessments.some(a => a.id === currentSelection) 
            ? currentSelection 
            : completedAssessments[0]?.id;
        
        if (selectedId) {
            assessmentSelectFilter.value = selectedId;
        }

        if (!assessmentSelectFilter.value) {
            assessmentReportsPlaceholder.style.display = 'block';
            assessmentReportsContent.classList.add('hidden');
            return;
        }

        const log = completedAssessments.find(l => l.id === assessmentSelectFilter.value);
        if (!log) {
             assessmentReportsPlaceholder.style.display = 'block';
            assessmentReportsContent.classList.add('hidden');
            return;
        };

        assessmentReportsPlaceholder.style.display = 'none';
        assessmentReportsContent.classList.remove('hidden');

        const totalCorrect = log.sessionLog.filter(item => item.isCorrect).length;
        const totalIncorrect = log.sessionLog.length - totalCorrect;
        const score = log.sessionLog.length > 0 ? Math.round((totalCorrect / log.sessionLog.length) * 100) : 0;

        assessmentOverallStats.innerHTML = `
            <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${score}%</div><div class="text-sm text-slate-500">Score</div></div>
            <div class="card p-4 rounded-lg"><div class="text-2xl font-bold text-green-500">${totalCorrect}</div><div class="text-sm text-slate-500">Correct</div></div>
            <div class="card p-4 rounded-lg"><div class="text-2xl font-bold text-red-500">${totalIncorrect}</div><div class="text-sm text-slate-500">Incorrect</div></div>
            <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${log.sessionLog.length}</div><div class="text-sm text-slate-500">Answered</div></div>`;
        
        const allQuestionsInDB = ALL_BOOKS_DATA.flatMap(b => b.sections.flatMap(s => s.questions));
        
        const getStatsByCategory = (key) => {
            const data = {};
            log.sessionLog.forEach(item => {
                const q = allQuestionsInDB.find(q => q.uid === item.qId);
                if(!q) return;

                let categoryId;
                if (key === 'book') {
                    const bk = getBookForQuestion(q.uid);
                    categoryId = bk?.id;
                } else if (key === 'subject') {
                    const bk = getBookForQuestion(q.uid);
                    if (!bk) return;
                    const section = bk.sections.find((s: any) => s.questions.some((qu: any) => qu.uid === q.uid));
                    categoryId = section?.id;
                }
                else if (key === 'mwa') categoryId = q.classification?.mwa || 'Uncategorized';
                else if (key === 'task') categoryId = q.classification?.task || 'Uncategorized';

                if (!categoryId) return;
                data[categoryId] = data[categoryId] || { c: 0, i: 0 };
                if (item.isCorrect) data[categoryId].c++;
                else data[categoryId].i++;
            });
            return data;
        };
        
        const createBlockHTML = (title, data, nameMap) => {
            let html = `<div class="card p-4 rounded-lg"><h4 class="font-bold text-lg mb-4">${title}</h4><ul class="text-sm space-y-4 max-h-60 overflow-y-auto pr-2">`;
            const sortedKeys = Object.keys(data).sort();
            sortedKeys.forEach(key => {
                const {c, i} = data[key];
                const total = c + i;
                if (total === 0) return;
                const score = Math.round((c/total) * 100);
                const name = nameMap(key);
                html += `
                    <li class="performance-item">
                        <div class="flex justify-between items-center mb-1">
                            <span class="font-semibold truncate">${name}</span>
                            <span class="font-bold text-slate-600 dark:text-slate-300 text-xs">${score}% (${c}/${total})</span>
                        </div>
                        <div class="stats-bar">
                            <div class="stats-bar-fill" style="width: ${score}%; background-image: linear-gradient(to right, ${score >= 70 ? '#22c55e' : (score >= 40 ? '#f97316' : '#ef4444')}, ${score >= 70 ? '#4ade80' : (score >= 40 ? '#fb923c' : '#f87171')});"></div>
                        </div>
                    </li>`;
            });
            return html + `</ul></div>`;
        };

        const bookData = getStatsByCategory('book');
        const subjectData = getStatsByCategory('subject');
        const mwaChartData = getStatsByCategory('mwa');
        const taskData = getStatsByCategory('task');

        const bookNameMap = (id) => ALL_BOOKS_DATA.find(b => b.id === id)?.title[state.settings.language] || id;
        const subjectNameMap = (id) => ALL_BOOKS_DATA.flatMap(b => b.sections).find(s => s.id === id)?.title[state.settings.language] || id;
        const mwaNameMap = (id) => `${id}: ${CODEBOOK.mwa[id]?.[state.settings.language] || ''}`;
        const taskNameMap = (id) => `${id}: ${CODEBOOK.tasks[id]?.[state.settings.language] || ''}`;

        assessmentPerformanceBlocks.innerHTML = `
            ${createBlockHTML('By Book', bookData, bookNameMap)}
            ${createBlockHTML('By Subject', subjectData, subjectNameMap)}
            ${createBlockHTML('By Category (MWA)', mwaChartData, mwaNameMap)}
            ${createBlockHTML('By Task', taskData, taskNameMap)}
        `;

        const mwaLabels = Object.keys(CODEBOOK.mwa).sort();
        const assessmentMwaChartCtx = (document.getElementById('assessment-mwa-chart') as HTMLCanvasElement).getContext('2d')!;
        if (window.assessmentMwaChart) window.assessmentMwaChart.destroy();
        window.assessmentMwaChart = new Chart(assessmentMwaChartCtx, {
            type: 'bar', data: {
                labels: mwaLabels.map(l => `${l}: ${CODEBOOK.mwa[l][state.settings.language] || CODEBOOK.mwa[l].en}`),
                datasets: [
                    { label: 'Correct', data: mwaLabels.map(l => mwaChartData[l]?.c || 0), backgroundColor: '#22c55e' },
                    { label: 'Incorrect', data: mwaLabels.map(l => mwaChartData[l]?.i || 0), backgroundColor: '#ef4444' }
                ]
            }, options: { 
                indexAxis: 'y', 
                scales: { x: { stacked: true }, y: { stacked: true, ticks:{font: {size: 10}} } }, 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const value = context.raw as number;
                                const total = context.chart.data.datasets.reduce((acc: number, dataset) => acc + ((dataset.data[context.dataIndex] as number) || 0), 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });

        const changeData = { ccft: 0, iift: 0, c2i: 0, i2c: 0, i2i: 0 };
        log.sessionLog.forEach(item => {
            const initialWasCorrect = item.initial === item.correctAnswer;
            if (item.initial === item.final) {
                if (item.isCorrect) changeData.ccft++;
                else changeData.iift++;
            } else if (item.initial !== null) {
                if (initialWasCorrect && !item.isCorrect) changeData.c2i++;
                else if (!initialWasCorrect && item.isCorrect) changeData.i2c++;
                else if (!initialWasCorrect && !item.isCorrect) changeData.i2i++;
            }
        });

        const assessmentChangeChartCtx = (document.getElementById('assessment-change-chart') as HTMLCanvasElement).getContext('2d')!;
        if(window.assessmentChangeChart) window.assessmentChangeChart.destroy();
        window.assessmentChangeChart = new Chart(assessmentChangeChartCtx, {
            type: 'doughnut', data: {
                labels: ['Correct (1st Time)', 'Incorrect (1st Time)', 'Correct to Incorrect', 'Incorrect to Correct', 'Incorrect to Incorrect'],
                datasets: [{ 
                    data: [changeData.ccft, changeData.iift, changeData.c2i, changeData.i2c, changeData.i2i], 
                    backgroundColor: ['#22c55e', '#fde047', '#f97316', '#84cc16', '#ef4444'] 
                }]
            }, options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw as number;
                                const total = context.chart.data.datasets[0].data.reduce((acc: number, val) => acc + (val as number), 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    function renderDashboard() {
        const allProgress = Object.values(state.progress);
        const studyQuizProgress = allProgress.filter(p => p.modes && (p.modes.study || p.modes.quiz));
    
        const attemptedQuestionsCount = studyQuizProgress.length;
        const totalQuestions = ALL_BOOKS_DATA.reduce((acc, book) => acc + book.sections.reduce((sAcc, sec) => sAcc + sec.questions.length, 0), 0);
        
        let totalCorrect = 0, totalIncorrect = 0;
        studyQuizProgress.forEach(prog => {
            totalCorrect += (prog.modes.study?.correct || 0) + (prog.modes.quiz?.correct || 0);
            totalIncorrect += (prog.modes.study?.incorrect || 0) + (prog.modes.quiz?.incorrect || 0);
        });
        const overallScore = (totalCorrect + totalIncorrect > 0) ? Math.round((totalCorrect / (totalCorrect + totalIncorrect)) * 100) : 0;
        const completedAssessments = state.assessmentLogs.filter(log => log.status === 'completed').length;
        
        overallProgressDashboard.innerHTML = `
            <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${attemptedQuestionsCount} / ${totalQuestions}</div><div class="text-sm text-slate-500">Questions Answered</div></div>
            <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${overallScore}%</div><div class="text-sm text-slate-500">Overall Score</div></div>
            <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${completedAssessments}</div><div class="text-sm text-slate-500">Assessments Completed</div></div>
             <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${state.flaggedQuestions.length}</div><div class="text-sm text-slate-500">Flagged for Review</div></div>
        `;

        quickAccessContent.innerHTML = `
            <button data-page="study" class="nav-btn w-full btn-secondary">Start a Study Session</button>
            <button data-page="quiz-setup" class="nav-btn w-full btn-secondary">Start a Quiz</button>
            <button data-page="self-assessment" class="nav-btn w-full btn-primary">New Self-Assessment</button>
        `;
        document.querySelectorAll('#quick-access-content .nav-btn').forEach(b => b.addEventListener('click', () => navigateTo((b as HTMLElement).dataset.page!)));

        const tips = ["Review flagged questions regularly.", "Focus on your weakest categories in the reports.", "Take a full self-assessment to simulate exam conditions."];
        studyTip.textContent = tips[Math.floor(Math.random() * tips.length)];

        const assessmentActivities = state.assessmentLogs.map(log => ({
            type: 'assessment',
            date: new Date(log.startDate),
            status: log.status,
            id: log.id,
            isResumable: log.status !== 'completed',
            data: log
        }));

        const sessionActivities = (state.sessionHistory || []).map(session => ({
            type: session.mode, 
            date: new Date(session.endTime),
            status: 'completed',
            id: `${session.bookId}_${session.contextId}`,
            isResumable: false,
            data: session
        }));

        const allActivities = [...assessmentActivities, ...sessionActivities];
        allActivities.sort((a, b) => b.date.getTime() - a.date.getTime());

        if (allActivities.length === 0) {
            recentActivityLog.innerHTML = `<p class="text-slate-500 text-center text-sm">No recent activity to show.</p>`;
        } else {
            recentActivityLog.innerHTML = allActivities.slice(0, 10).map(activity => {
                let title = '';
                let detailsHTML = '';
                let actionHTML = '';
                
                let dataAttributes = '';
                if (activity.type === 'assessment') {
                    title = `Assessment`;
                    detailsHTML = `<p class="text-xs text-slate-500">${new Date(activity.date).toLocaleString()}</p>`;
                    if (activity.isResumable) {
                        dataAttributes = `data-resume-assessment-id="${activity.id}"`;
                        actionHTML = `<div class="text-right"><span class="font-semibold text-amber-500">In Progress</span><p class="text-xs text-slate-500">${activity.data.sessionLog.length} / ${activity.data.questions.length} answered</p></div>`;
                    } else {
                        dataAttributes = `data-review-assessment-id="${activity.id}"`;
                        const { sessionLog } = activity.data;
                        const correct = sessionLog.filter(i => i.isCorrect).length;
                        const total = sessionLog.length;
                        const score = total > 0 ? Math.round((correct / total) * 100) : 0;
                        const passed = score >= 70;
                        const duration = new Date(activity.data.endDate).getTime() - new Date(activity.data.startDate).getTime();
                        const minutes = Math.floor((duration / (1000 * 60)) % 60);
                        const hours = Math.floor(duration / (1000 * 60 * 60));

                        actionHTML = `
                            <div class="text-right">
                                <p class="font-semibold text-lg ${passed ? 'text-green-500' : 'text-red-500'}">${score}% (${passed ? 'Pass' : 'Fail'})</p>
                                <p class="text-xs text-slate-500">Time: ${hours > 0 ? hours+'h ' : ''}${minutes}m</p>
                            </div>`;
                    }
                } else { 
                    const { bookId, contextId, sessionLog, startTime, endTime } = activity.data;
                    const book = ALL_BOOKS_DATA.find(b => b.id === bookId);
                    const section = book?.sections.find(s => s.id === contextId);
                    title = section ? (section.title[state.settings.language] || section.title.en) : 'Session';
                    
                    dataAttributes = `data-review-session-id="${startTime}"`;
                    
                    const correct = sessionLog.filter(i => i.isCorrect).length;
                    const total = sessionLog.length;
                    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
                    const passed = score >= 70;
                    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
                    const minutes = Math.floor((duration / (1000 * 60)) % 60);
                    const hours = Math.floor(duration / (1000 * 60 * 60));

                    detailsHTML = `<div class="flex items-center gap-2"><span class="mode-tag mode-${activity.type}">${activity.type}</span><p class="text-xs text-slate-500">${new Date(activity.date).toLocaleString()}</p></div>`;
                    actionHTML = `
                        <div class="text-right">
                             <p class="font-semibold text-lg ${passed ? 'text-green-500' : 'text-red-500'}">${score}% (${passed ? 'Pass' : 'Fail'})</p>
                             <p class="text-xs text-slate-500">Time: ${hours > 0 ? hours+'h ' : ''}${minutes}m</p>
                        </div>`;
                }

                return `
                    <div class="recent-activity-item card p-3 rounded-lg flex justify-between items-center" ${dataAttributes}>
                        <div>
                            <p class="font-semibold">${title}</p>
                            ${detailsHTML}
                        </div>
                        ${actionHTML}
                    </div>`;
            }).join('');
        }

        document.querySelectorAll('.recent-activity-item').forEach(el => {
            const item = el as HTMLElement;
            if (item.dataset.resumeAssessmentId) {
                item.addEventListener('click', () => resumeAssessment(item.dataset.resumeAssessmentId!));
            } else if (item.dataset.reviewAssessmentId) {
                item.addEventListener('click', () => reviewCompletedAssessment(item.dataset.reviewAssessmentId!));
            } else if (item.dataset.reviewSessionId) {
                item.addEventListener('click', () => {
                    const session = state.sessionHistory.find(s => s.startTime === item.dataset.reviewSessionId);
                    if (session) showSessionSummary(session.sessionLog, session.mode);
                });
            }
        });
        
        const mwaData: Record<string, { c: number; i: number }> = {};
        const allQuestionsInDB = ALL_BOOKS_DATA.flatMap(b => b.sections.flatMap(s => s.questions));
        
        Object.entries(state.progress).forEach(([uid, prog]) => {
            const hasNonAssessmentMode = Object.keys(prog.modes || {}).some(m => m !== 'assessment');
            if (!hasNonAssessmentMode) return;
        
            const q = allQuestionsInDB.find(q => q.uid === uid);
            if (q) {
                const mwa = q.classification?.mwa || '';
                mwaData[mwa] = mwaData[mwa] || {c: 0, i: 0};
                mwaData[mwa].c += (prog.modes.study?.correct || 0) + (prog.modes.quiz?.correct || 0);
                mwaData[mwa].i += (prog.modes.study?.incorrect || 0) + (prog.modes.quiz?.incorrect || 0);
            }
        });
        
        const mwaLabels = Object.keys(CODEBOOK.mwa).sort();
        const dashboardMwaChartCtx = (document.getElementById('dashboard-mwa-chart') as HTMLCanvasElement).getContext('2d')!;
        if (window.dashboardMwaChart) window.dashboardMwaChart.destroy();
        window.dashboardMwaChart = new Chart(dashboardMwaChartCtx, {
            type: 'radar',
            data: {
                labels: mwaLabels.map(l => `${l}: ${CODEBOOK.mwa[l][state.settings.language]}`),
                datasets: [{
                    label: 'Score %',
                    data: mwaLabels.map(l => {
                        const {c=0, i=0} = mwaData[l] || {};
                        return (c+i > 0) ? Math.round((c / (c+i)) * 100) : 0;
                    }),
                    fill: true,
                    backgroundColor: 'rgba(79, 70, 229, 0.2)',
                    borderColor: 'rgb(79, 70, 229)',
                    pointBackgroundColor: 'rgb(79, 70, 229)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgb(79, 70, 229)'
                }]
            },
            options: {
                 responsive: true,
                 maintainAspectRatio: false,
                 scales: { r: { angleLines: { color: 'rgba(100, 116, 139, 0.3)' }, suggestedMin: 0, suggestedMax: 100, pointLabels: { font: { size: 10 } } } }
            }
        });
    }

    function openWizard() {
        wizardState = { currentStep: 1, newBookData: null, newBookFileName: null };
        (newBookFileInput as HTMLInputElement).value = '';
        updateWizardUI(1);
        addBookModal.classList.remove('hidden');
    }

    function closeWizard() {
        addBookModal.classList.add('hidden');
    }

    function updateWizardUI(step) {
        wizardState.currentStep = step;
        wizardNextBtn.disabled = true;

        wizardStepIndicators.forEach((indicator, index) => {
            const span = indicator.querySelector('span');
            indicator.classList.remove('active');
            span?.classList.remove('bg-indigo-100', 'dark:bg-indigo-800');
            span?.classList.add('bg-gray-100', 'dark:bg-gray-700');
            if ((index + 1) < step) {
                indicator.classList.add('active');
            } else if ((index + 1) === step) {
                span?.classList.remove('bg-gray-100', 'dark:bg-gray-700');
                span?.classList.add('bg-indigo-100', 'dark:bg-indigo-800');
            }
        });

        wizardStepContents.forEach(content => {
            content.classList.toggle('hidden', parseInt(content.id.split('-')[2]) !== step);
        });

        if (step === 1 && wizardState.newBookData) wizardNextBtn.disabled = false;
        if (step === 2) wizardNextBtn.textContent = 'Next Step';
        if (step === 3) wizardNextBtn.classList.add('hidden');
        else wizardNextBtn.classList.remove('hidden');
    }

    function handleFileUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        wizardState.newBookFileName = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                wizardState.newBookData = JSON.parse((e.target as FileReader).result as string);
                wizardNextBtn.disabled = false;
            } catch (err: any) {
                alert(`Error parsing JSON file: ${err?.message}`);
                wizardState.newBookData = null;
                wizardNextBtn.disabled = true;
            }
        };
        reader.readAsText(file);
    }

    function advanceWizard() {
        if (wizardState.currentStep === 1) {
            updateWizardUI(2);
            validateNewBook();
        } else if (wizardState.currentStep === 2) {
            updateWizardUI(3);
        }
    }

    function validateNewBook() {
        const data = wizardState.newBookData;
        let errors: string[] = [], warnings: string[] = [];
        
        const ok = (msg) => `<div class="text-green-600 dark:text-green-400 text-sm p-1">✅ ${msg}</div>`;
        const err = (msg) => { errors.push(msg); return `<div class="text-red-600 dark:text-red-400 text-sm p-1">❌ ${msg}</div>`; };
        const warn = (msg) => { warnings.push(msg); return `<div class="text-amber-600 dark:text-amber-400 text-sm p-1">⚠️ ${msg}</div>`; };

        let resultsHTML = '';
        
        if (data && typeof data === 'object') {
            resultsHTML += ok('File is a valid JSON object.');
            if (data.id) resultsHTML += ok(`Book ID found: ${data.id}`); else resultsHTML += err('Book "id" is missing.');
            if (CURRENT_MANIFEST.bookFiles.includes(wizardState.newBookFileName)) resultsHTML += warn(`A file named "${wizardState.newBookFileName}" is already in data.json.`);
            if (data.title && data.title.en && data.title.ar) resultsHTML += ok('Book title found.'); else resultsHTML += err('Book "title" with "en" and "ar" is missing.');
            if (Array.isArray(data.sections)) resultsHTML += ok('Book "sections" array found.'); else resultsHTML += err('Book "sections" is not an array.');
        } else {
            resultsHTML += err('Uploaded file is not a valid JSON object.');
            wizardValidationResults.innerHTML = resultsHTML; return;
        }

        let totalQuestions = 0;
        if (Array.isArray(data.sections)) {
            data.sections.forEach((section, sIdx) => {
                if (!section.id) resultsHTML += err(`Section ${sIdx + 1} is missing an "id".`);
                if (!section.title?.en || !section.title?.ar) resultsHTML += err(`Section ${sIdx + 1} is missing a title.`);
                if (!Array.isArray(section.questions)) resultsHTML += err(`Section ${sIdx + 1} is missing a "questions" array.`);
                else {
                    section.questions.forEach((q, qIdx) => {
                        totalQuestions++;
                        if (!q.uid) resultsHTML += err(`Question ${qIdx + 1} in Section ${sIdx + 1} is missing a "uid".`);
                        if (!q.classification?.mwa || !q.classification?.task) resultsHTML += err(`Question ${q.uid} is missing MWA/Task classification.`);
                    });
                }
            });
            resultsHTML += ok(`Checked ${data.sections.length} sections and ${totalQuestions} questions.`);
        }

        let summary = `<div class="p-2 border-b border-[var(--border-color)] mb-2">`;
        if (errors.length === 0) {
            summary += `<p class="font-bold text-green-600 dark:text-green-400">Validation Passed!</p>`;
            wizardNextBtn.disabled = false;
        } else {
            summary += `<p class="font-bold text-red-600 dark:text-red-400">Validation Failed with ${errors.length} error(s).</p>`;
        }
        summary += `<p class="text-xs text-slate-500">${warnings.length} warning(s) found.</p></div>`;
        
        wizardValidationResults.innerHTML = summary + resultsHTML;
    }

    function generateNewManifest() {
        const newManifest = { ...CURRENT_MANIFEST };
        if (!newManifest.bookFiles.includes(wizardState.newBookFileName)) {
            newManifest.bookFiles.push(wizardState.newBookFileName);
        }
        
        const manifestString = JSON.stringify(newManifest, null, 2);
        const blob = new Blob([manifestString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url; a.download = 'data.json';
        a.textContent = 'Download updated data.json';
        a.className = 'btn-secondary w-full text-center block';
        
        const downloadArea = document.getElementById('wizard-download-area')!;
        downloadArea.innerHTML = '';
        downloadArea.appendChild(a);
        a.click();
        
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    
    function prepareGlossary() {
        if (!GLOSSARY_TERMS || GLOSSARY_TERMS.length === 0) return;
        const sortedTerms = [...GLOSSARY_TERMS].sort((a, b) => (b.norm_en.length - a.norm_en.length));
        const allTermPatterns = sortedTerms.map(term => {
            const escapeRegex = (str) => str ? str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
            const enPattern = escapeRegex(term.norm_en);
            const arPattern = escapeRegex(term.norm_ar);
            const enRegex = enPattern ? `\\b${enPattern}\\b` : '';
            const arRegex = arPattern ? `(?<=\\s|^)${arPattern}(?=\\s|$)` : '';
            if (enRegex && arRegex) return `${enRegex}|${arRegex}`;
            return enRegex || arRegex;
        }).filter(Boolean).join('|');
        if (allTermPatterns) {
            glossaryTermRegex = new RegExp(`(${allTermPatterns})`, 'gi');
        }
    }
    
    function renderGlossary(filter: string = '', type: string = 'search') {
        let filteredTerms = GLOSSARY_TERMS;
        if (type === 'letter') {
            filteredTerms = GLOSSARY_TERMS.filter(term => term.letter.toUpperCase() === filter.toUpperCase());
        } else if (filter) {
            const lowerCaseFilter = filter.toLowerCase();
            filteredTerms = GLOSSARY_TERMS.filter(term => 
                term.norm_en.toLowerCase().includes(lowerCaseFilter) ||
                term.norm_ar.toLowerCase().includes(lowerCaseFilter) ||
                term.definition_en.toLowerCase().includes(lowerCaseFilter) ||
                term.definition_ar.toLowerCase().includes(lowerCaseFilter)
            );
        }
        glossaryList.innerHTML = filteredTerms.length > 0 ? filteredTerms.map(term => `
            <div class="p-4 rounded-lg border border-[var(--border-color)]">
                <div class="flex justify-between items-start gap-4">
                    <div class="ltr flex-1">
                        <h4 class="font-bold text-lg text-indigo-600 dark:text-indigo-400">${term.term_en}</h4>
                        <p class="text-sm mt-1">${term.definition_en}</p>
                    </div>
                    <div class="rtl text-right flex-1">
                        <h4 class="font-bold text-lg text-indigo-600 dark:text-indigo-400">${term.term_ar}</h4>
                        <p class="text-sm mt-1">${term.definition_ar}</p>
                    </div>
                </div>
            </div>`).join('') : '<p class="text-center text-slate-500">No terms found.</p>';
    }
    
    function renderPopupContent(displayLang: string) {
        if (!currentPopupTermData) return;
        const otherLang = displayLang === 'en' ? 'ar' : 'en';
        const term = currentPopupTermData[`term_${displayLang}`];
        const definition = currentPopupTermData[`definition_${displayLang}`];
        const otherLangName = otherLang === 'en' ? 'English' : 'العربية';
        
        termPopup.innerHTML = `
            <h4 class="font-bold text-lg text-indigo-600 dark:text-indigo-400 mb-2 ${displayLang === 'ar' ? 'rtl' : ''}">${term}</h4>
            <p class="text-sm ${displayLang === 'ar' ? 'rtl' : ''}">${definition}</p>
            <button class="toggle-def-lang text-xs text-slate-500 hover:text-indigo-600 mt-2 underline" data-lang="${otherLang}">Show in ${otherLangName}</button>
        `;
    }

    function showTermPopup(event: Event) {
        const evtTarget = event.target as HTMLElement;
        const target = evtTarget.closest('.glossary-term-highlight') as HTMLElement | null;
        if (!target) {
            if (!termPopup.contains(evtTarget)) {
                 termPopup.classList.add('hidden');
                 currentPopupTermData = null;
            }
            return;
        }
        const clickedText = target.textContent;
        const termSlug = target.dataset.termSlug;
        const termData = GLOSSARY_TERMS.find(t => t.slug_en === termSlug);
        
        if (!termData) return;
        currentPopupTermData = termData;

        const isArabic = /[\u0600-\u06FF]/.test(clickedText);
        
        const initialDisplayLang = isArabic ? 'en' : 'ar';
        
        renderPopupContent(initialDisplayLang);

        const rect = target.getBoundingClientRect();
        termPopup.style.top = `${window.scrollY + rect.bottom + 5}px`;
        let leftPosition = window.scrollX + rect.left;
        if (leftPosition + 350 > window.innerWidth) {
            leftPosition = window.scrollX + rect.right - 350;
        }
        termPopup.style.left = `${leftPosition}px`;
        termPopup.classList.remove('hidden');
    }


    navButtons.forEach(button => button.addEventListener('click', () => {
        const el = button as HTMLElement;
        if (el.dataset.page) {
            navigateTo(el.dataset.page);
        }
    }));
    usernameInput.addEventListener('change', () => { state.settings.username = usernameInput.value; saveState(); applySettings(); });
    languageSelect.addEventListener('change', () => { state.settings.language = languageSelect.value; saveState(); applySettings(); populateBookSelector(); renderReviewPage(); });
    themeToggle.addEventListener('change', () => { state.settings.theme = themeToggle.checked ? 'dark' : 'light'; saveState(); applySettings(); });
    resetProgressBtn.addEventListener('click', () => {
        if (confirm("Are you sure? This will erase all study and assessment history.")) {
            state.progress = {}; state.assessmentLogs = []; state.flaggedQuestions = []; state.completedSections = []; state.sessionHistory = [];
            saveState();
            renderReportsPage(); populateBookSelector(); navigateTo('dashboard'); alert("Progress has been reset.");
        }
    });

    bookSelectStudy.addEventListener('change', populateSectionSelector);
    bookSelectQuiz.addEventListener('change', populateQuizSelector);
    startStudyBtn.addEventListener('click', () => {
        const bookId = bookSelectStudy.value;
        const sectionId = sectionSelect.value;
        const book = ALL_BOOKS_DATA.find(b => b.id === bookId);
        const section = book?.sections.find(s => s.id === sectionId);
        if (section?.questions?.length > 0) startQuiz(section.questions, 'study', bookId, sectionId); 
        else alert('This section has no questions yet.');
    });
    startQuizBtn.addEventListener('click', () => {
        const bookId = bookSelectQuiz.value;
        const sectionId = quizSelect.value;
        const book = ALL_BOOKS_DATA.find(b => b.id === bookId);
        const quiz = book?.sections.find(s => s.id === sectionId);
        if (quiz?.questions?.length > 0) startQuiz(quiz.questions, 'quiz', bookId, sectionId);
        else alert('This quiz has no questions yet.');
    });
    generateNewAssessmentBtn.addEventListener('click', generateAssessment);
    submitAnswerBtn.addEventListener('click', () => {
        if(state.quiz.currentAnswerLog.final === null) { alert("Please select an answer."); return; }
        lockAndGradeAnswer();
    });
    nextQuestionBtn.addEventListener('click', advanceQuiz);
	const skipQuestionBtn = document.getElementById('skip-question-btn');
skipQuestionBtn?.addEventListener('click', () => {
    // For assessment mode only:
    if (state.quiz.mode === 'assessment') {
        // Record skipped question
        const skippedQ = state.quiz.questions[state.quiz.currentQuestionIndex];
        state.quiz.sessionLog.push({
            qId: skippedQ.uid,
            skipped: true,
            answer: null,
            isCorrect: false,
            mwa: skippedQ.classification?.mwa || '',
            timeSpent: Date.now() - state.quiz.questionStartTime
        });

        // Move forward
        advanceQuiz();
    } else {
        alert("Skipping is only allowed in Self-Assessment mode.");
    }
});
    // Event delegation for choice hover/click (set up once, not per question)
    const questionContainer = document.getElementById('question-container');
    questionContainer?.addEventListener('mouseover', (e: Event) => {
        const target = (e.target as HTMLElement).closest('.choice') as HTMLElement | null;
        if (!target) return;
        document.querySelectorAll(`.choice[data-index="${target.dataset.index}"]`).forEach(c => c.classList.add('highlight'));
    });
    questionContainer?.addEventListener('mouseout', (e: Event) => {
        const target = (e.target as HTMLElement).closest('.choice') as HTMLElement | null;
        if (!target) return;
        document.querySelectorAll(`.choice[data-index="${target.dataset.index}"]`).forEach(c => c.classList.remove('highlight'));
    });
    questionContainer?.addEventListener('click', (e: Event) => {
        const target = (e.target as HTMLElement).closest('.choice') as HTMLElement | null;
        if (target) handleChoiceSelection(target);
    });

    endSessionBtn.addEventListener('click', () => {
        if(confirm("Are you sure you want to end this session?")) { stopQuizTimer(); navigateTo('dashboard'); }
    });
    flagQuestionBtn.addEventListener('click', toggleFlagQuestion);
    
    toggleTranslationBtn.addEventListener('click', () => {
        const isHidden = arabicCol.classList.contains('hidden');
        if (isHidden) {
            arabicCol.classList.remove('hidden');
            englishCol.classList.remove('md:col-span-2');
            englishCol.classList.add('md:col-span-1');
            toggleTranslationBtn.innerHTML = `<span class="text-sm">English</span> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>`;
        } else {
            arabicCol.classList.add('hidden');
            englishCol.classList.add('md:col-span-2');
            englishCol.classList.remove('md:col-span-1');
            toggleTranslationBtn.innerHTML = `<span class="text-sm">ترجمة</span> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>`;
        }
    });

    summaryCloseBtn.addEventListener('click', () => sessionSummaryModal.classList.add('hidden'));
    summaryReportsBtn.addEventListener('click', () => {
        sessionSummaryModal.classList.add('hidden');
        navigateTo('reports');
    });

    reportBookFilter.addEventListener('change', renderOverallReports);
    reportModeFilter.addEventListener('change', renderOverallReports);
    assessmentSelectFilter.addEventListener('change', renderAssessmentReports);
    
    // MODIFICATION: Replaced forEach with individual listeners for clarity
    reviewSearch.addEventListener('input', renderReviewPage);
    reviewFlaggedOnly.addEventListener('change', renderReviewPage);
    reviewFilterStatus.addEventListener('change', renderReviewPage);
    reviewFilterBook.addEventListener('change', () => {
        populateSubjectFilter(); // Repopulate subjects when book changes
        renderReviewPage();
    });
    reviewFilterSubject.addEventListener('change', renderReviewPage); // Add listener for new filter
    reviewFilterMwa.addEventListener('change', renderReviewPage);
    
    resetFiltersBtn.addEventListener('click', () => {
        reviewSearch.value = ''; reviewFlaggedOnly.checked = false; reviewFilterStatus.value = 'all'; reviewFilterBook.value = 'all'; reviewFilterMwa.value = 'all';
        reviewFilterSubject.value = 'all'; // Reset new filter
        populateSubjectFilter(); // Repopulate subjects for 'all books'
        renderReviewPage();
    });
    
    reportTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = (tab as HTMLElement).dataset.tab;
            reportTabs.forEach(t => t.classList.remove('active', 'border-indigo-500', 'text-indigo-600'));
            reportTabs.forEach(t => t.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300'));
            tab.classList.add('active', 'border-indigo-500', 'text-indigo-600');
            tab.classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
            
            reportTabContents.forEach(content => {
                content.classList.toggle('hidden', content.id !== `report-tab-${tabName}`);
            });
            if (tabName === 'assessment') renderAssessmentReports();
            else renderOverallReports();
        });
    });

    addBookWizardBtn.addEventListener('click', openWizard);
    closeWizardBtn.addEventListener('click', closeWizard);
    newBookFileInput.addEventListener('change', handleFileUpload);
    wizardNextBtn.addEventListener('click', advanceWizard);
    generateManifestBtn.addEventListener('click', generateNewManifest);
    
    // MODIFICATION: Update glossary button to reset modal state
    glossaryNavBtn.addEventListener('click', () => {
        const glossaryModalTitle = glossaryModal.querySelector('h2');
        if (glossaryModalTitle) {
            glossaryModalTitle.textContent = 'Glossary of Auto Body Terms';
        }
        glossarySearchInput.style.display = 'block';
        glossaryAlphabetFilter.style.display = 'flex';
        renderGlossary();
        glossaryModal.classList.remove('hidden');
    });
    glossaryCloseBtn.addEventListener('click', () => glossaryModal.classList.add('hidden'));
    glossarySearchInput.addEventListener('input', () => renderGlossary(glossarySearchInput.value, 'search'));

    function init() {
        if (!ALL_BOOKS_DATA || ALL_BOOKS_DATA.length === 0) {
            document.body.textContent = '';
            const errDiv = document.createElement('div');
            errDiv.className = 'p-8 text-center bg-red-100 text-red-800 rounded-lg';
            errDiv.innerHTML = '<strong>Error:</strong> No book data found.';
            document.body.appendChild(errDiv);
            return;
        }
        loadState();
        applySettings();
        populateBookSelector();
        prepareGlossary();
        const firstTab = document.querySelector('.report-tab');
        firstTab?.classList.add('active', 'border-indigo-500', 'text-indigo-600');
        firstTab?.classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
        reportTabContents[0].classList.remove('hidden');

        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        alphabet.forEach(letter => {
            const button = document.createElement('button');
            button.textContent = letter;
            button.className = "p-1 px-3 rounded-md border border-[var(--border-color)] hover:bg-indigo-200 dark:hover:bg-indigo-700";
            button.addEventListener('click', (e: Event) => {
                 document.querySelectorAll('#glossary-alphabet-filter button').forEach(b => b.classList.remove('active'));
                 (e.currentTarget as HTMLElement).classList.add('active');
                 renderGlossary(letter, 'letter');
            });
            glossaryAlphabetFilter.appendChild(button);
        });

        document.addEventListener('click', showTermPopup);
        termPopup.addEventListener('click', (e: Event) => {
            const tgt = e.target as HTMLElement;
            if (tgt.matches('.toggle-def-lang')) {
                const newLang = (tgt as HTMLElement).dataset.lang;
                if (currentPopupTermData && newLang) {
                    renderPopupContent(newLang);
                }
            }
        });
        
        navigateTo('dashboard');
    }

    init();
}

main();

/* --- Added for Review Subtabs --- */
function setupReviewSubtabs() {
    const tabButtons = document.querySelectorAll(".review-tab");
    const tabPanels = document.querySelectorAll(".review-tab-panel");

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const target = (btn as HTMLElement).dataset.target;

            tabButtons.forEach(b => b.classList.remove("border-indigo-500","text-indigo-600"));
            btn.classList.add("border-indigo-500","text-indigo-600");

            tabPanels.forEach(panel => panel.classList.add("hidden"));
            if (target) document.getElementById(target)?.classList.remove("hidden");
        });
    });
}

function renderSelfAssessmentReview(assessments) {
    const container = document.getElementById("self-assessment-review-list");
    if (!container) return;
    container.innerHTML = "";
    assessments.forEach(item => {
        const div = document.createElement("div");
        div.className="card p-4 rounded-xl";
        div.innerHTML = `<div class='text-sm text-gray-400 mb-2'>UID: ${item.uid}</div>
        <p class='font-semibold text-lg mb-3'>${item.question?.en||''}</p>`;
        container.appendChild(div);
    });
}
