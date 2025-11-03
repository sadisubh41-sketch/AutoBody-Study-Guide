async function fetchData() {
    try {
        const manifestResponse = await fetch('data.json');
        if (!manifestResponse.ok) throw new Error(`Could not fetch data.json. Status: ${manifestResponse.status}`);
        const manifest = await manifestResponse.json();
        const { codebook, bookFiles, glossaryFile } = manifest;
        if (!bookFiles || bookFiles.length === 0) throw new Error("No book files listed in data.json manifest.");

        const bookPromises = bookFiles.map(async (filename) => {
            const bookResponse = await fetch(`data/${filename}`);
            if (!bookResponse.ok) throw new Error(`Could not fetch data/${filename}. Status: ${bookResponse.status}`);
            return bookResponse.json();
        });

        let glossaryData = [];
        if (glossaryFile) {
            const glossaryResponse = await fetch(`data/${glossaryFile}`);
            if (!glossaryResponse.ok) throw new Error(`Could not fetch data/${glossaryFile}. Status: ${glossaryResponse.status}`);
            glossaryData = await glossaryResponse.json();
        }

        const loadedBooks = await Promise.all(bookPromises);
        return { codebook, books: loadedBooks, manifest, glossary: glossaryData };
    } catch (error) {
        console.error("Could not load app data:", error);
        document.body.innerHTML = `<div class="p-8 text-center bg-red-100 text-red-800 rounded-lg"><strong>Error:</strong> ${error.message}. Please ensure 'data.json' is in the root directory, and all other .json files are inside a 'data/' folder.</div>`;
        return null;
    }
}


async function main() {
    const APP_DATA = await fetchData();
    if (!APP_DATA) return;

    const state = { 
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

    let wizardState = {
        currentStep: 1,
        newBookData: null,
        newBookFileName: null,
    };
    
    let glossaryTermRegex = null;
    let currentPopupTermData = null;

    const pages = document.querySelectorAll('.page');
    const navButtons = document.querySelectorAll('.nav-btn');
    const welcomeMessage = document.getElementById('welcome-message');
    const usernameInput = document.getElementById('username');
    const languageSelect = document.getElementById('language-select');
    const themeToggle = document.getElementById('theme-toggle');
    const resetProgressBtn = document.getElementById('reset-progress-btn');
    const bookSelectStudy = document.getElementById('book-select-study');
    const sectionSelect = document.getElementById('section-select');
    const startStudyBtn = document.getElementById('start-study-btn');
    const bookSelectQuiz = document.getElementById('book-select-quiz');
    const quizSelect = document.getElementById('quiz-select');
    const startQuizBtn = document.getElementById('start-quiz-btn');
    const generateNewAssessmentBtn = document.getElementById('generate-new-assessment-btn');
    const quizBreadcrumbs = document.getElementById('quiz-breadcrumbs');
    const quizTimer = document.getElementById('quiz-timer');
    const questionEN = document.getElementById('question-en');
    const questionAR = document.getElementById('question-ar');
    const choicesEN = document.getElementById('choices-en');
    const choicesAR = document.getElementById('choices-ar');
    const explanationBox = document.getElementById('explanation-box');
    const explanationEN = document.getElementById('explanation-en');
    const explanationAR = document.getElementById('explanation-ar');
    const nextQuestionBtn = document.getElementById('next-question-btn');
    const submitAnswerBtn = document.getElementById('submit-answer-btn');
    const endSessionBtn = document.getElementById('end-session-btn');
    const questionInfoFooter = document.getElementById('question-info-footer');
    const englishCol = document.getElementById('english-col');
    const arabicCol = document.getElementById('arabic-col');
    const toggleTranslationBtn = document.getElementById('toggle-translation-btn');
    const reportBookFilter = document.getElementById('report-book-filter');
    const reportModeFilter = document.getElementById('report-mode-filter');
    const reviewSearch = document.getElementById('review-search');
    const reviewFlaggedOnly = document.getElementById('review-flagged-only');
    const reviewList = document.getElementById('review-list');
    const flagQuestionBtn = document.getElementById('flag-question-btn');
    const flagIcon = document.getElementById('flag-icon');
    const reviewFilterStatus = document.getElementById('review-filter-status');
    const reviewFilterBook = document.getElementById('review-filter-book');
    const reviewFilterMwa = document.getElementById('review-filter-mwa');
    const resetFiltersBtn = document.getElementById('reset-filters-btn');
    const sessionSummaryModal = document.getElementById('session-summary-modal');
    const summaryTitle = document.getElementById('summary-title');
    const summaryScore = document.getElementById('summary-score');
    const summaryCorrect = document.getElementById('summary-correct');
    const summaryIncorrect = document.getElementById('summary-incorrect');
    const summaryBreakdown = document.getElementById('summary-breakdown');
    const summaryQuestionList = document.getElementById('summary-question-list');
    const summaryCloseBtn = document.getElementById('summary-close-btn');
    const summaryReportsBtn = document.getElementById('summary-reports-btn');
    const reportTabs = document.querySelectorAll('.report-tab');
    const reportTabContents = document.querySelectorAll('.report-tab-content');
    const reportsPlaceholder = document.getElementById('reports-placeholder');
    const reportsContent = document.getElementById('reports-content');
    const overallProgressStats = document.getElementById('overall-progress-stats');
    const overallScoreStats = document.getElementById('overall-score-stats');
    const modePerformanceBreakdown = document.getElementById('mode-performance-breakdown');
    const performanceBlocks = document.getElementById('performance-blocks');
    const assessmentSelectFilter = document.getElementById('assessment-select-filter');
    const assessmentReportsPlaceholder = document.getElementById('assessment-reports-placeholder');
    const assessmentReportsContent = document.getElementById('assessment-reports-content');
    const assessmentOverallStats = document.getElementById('assessment-overall-stats');
    const assessmentPerformanceBlocks = document.getElementById('assessment-performance-blocks');
    const addBookWizardBtn = document.getElementById('add-book-wizard-btn');
    const addBookModal = document.getElementById('add-book-modal');
    const closeWizardBtn = document.getElementById('close-wizard-btn');
    const wizardStepIndicators = document.querySelectorAll('.wizard-step-indicator');
    const wizardStepContents = document.querySelectorAll('.wizard-step-content');
    const newBookFileInput = document.getElementById('new-book-file-input');
    const wizardValidationResults = document.getElementById('wizard-validation-results');
    const generateManifestBtn = document.getElementById('generate-manifest-btn');
    const wizardNextBtn = document.getElementById('wizard-next-btn');
    const overallProgressDashboard = document.getElementById('overall-progress-dashboard');
    const quickAccessContent = document.getElementById('quick-access-content');
    const studyTip = document.getElementById('study-tip');
    const recentActivityLog = document.getElementById('recent-activity-log');
    const glossaryNavBtn = document.getElementById('glossary-nav-btn');
    const glossaryModal = document.getElementById('glossary-modal');
    const glossaryCloseBtn = document.getElementById('glossary-close-btn');
    const glossarySearchInput = document.getElementById('glossary-search-input');
    const glossaryAlphabetFilter = document.getElementById('glossary-alphabet-filter');
    const glossaryList = document.getElementById('glossary-list');
    const termPopup = document.getElementById('term-popup');


    function loadState() {
        const savedSettings = JSON.parse(localStorage.getItem('redSealAppSettings'));
        const savedProgress = JSON.parse(localStorage.getItem('redSealAppProgress'));
        if (savedSettings) state.settings = savedSettings;
        if (savedProgress) {
            state.progress = savedProgress.progress || {};
            state.assessmentLogs = savedProgress.assessmentLogs || [];
            state.flaggedQuestions = savedProgress.flaggedQuestions || [];
            state.completedSections = savedProgress.completedSections || [];
            state.sessionHistory = savedProgress.sessionHistory || [];
        }
    }

    function saveState() {
        localStorage.setItem('redSealAppSettings', JSON.stringify(state.settings));
        localStorage.setItem('redSealAppProgress', JSON.stringify({ 
            progress: state.progress, 
            assessmentLogs: state.assessmentLogs, 
            flaggedQuestions: state.flaggedQuestions,
            completedSections: state.completedSections,
            sessionHistory: state.sessionHistory
        }));
    }

    function navigateTo(pageId) {
        state.currentPage = pageId;
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById(`${pageId}-page`).classList.add('active');
        navButtons.forEach(b => {
            let isActive = b.dataset.page === pageId;
            if (pageId === 'quiz') {
                if (state.quiz.mode === 'study' && b.dataset.page === 'study') isActive = true;
                if (state.quiz.mode === 'quiz' && b.dataset.page === 'quiz-setup') isActive = true;
                if (state.quiz.mode === 'assessment' && b.dataset.page === 'self-assessment') isActive = true;
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
        Object.entries(CODEBOOK.mwa).forEach(([key, value]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `${key}: ${value[state.settings.language] || value.en}`;
            reviewFilterMwa.appendChild(option);
        });
    }
    
    function highlightTermsInText(text, lang) {
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
                return `<span class="glossary-term-highlight" data-term-slug="${termData.slug_en}">${match}</span>`;
            }
            return match;
        });
    }

    function startQuiz(questions, mode, bookId, contextId) {
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
            questions: [...questionsToAttempt].sort(() => 0.5 - Math.random()), 
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
        
        const book = ALL_BOOKS_DATA.find(b => q.uid.startsWith(`B${b.id.replace('book','')}`));
        if (book && CODEBOOK) {
            const { mwa, task } = q.classification;
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
        
        document.querySelectorAll('.choice').forEach(choice => {
            choice.addEventListener('mouseover', () => document.querySelectorAll(`.choice[data-index="${choice.dataset.index}"]`).forEach(c => c.classList.add('highlight')));
            choice.addEventListener('mouseout', () => document.querySelectorAll(`.choice[data-index="${choice.dataset.index}"]`).forEach(c => c.classList.remove('highlight')));
        });

        choicesEN.addEventListener('click', (e) => handleChoiceSelection(e.target.closest('.choice')));
        choicesAR.addEventListener('click', (e) => handleChoiceSelection(e.target.closest('.choice')));
        
        updateFlagButton();
        nextQuestionBtn.textContent = (state.quiz.currentQuestionIndex === state.quiz.questions.length - 1) ? "Finish Session" : "Next Question";
        state.quiz.questionStartTime = Date.now();
        startQuizTimer();
    }

    function handleChoiceSelection(target) {
        if (!target || state.quiz.currentQuestionAnswered) return;
        const selectedIndex = parseInt(target.dataset.index);
        
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
            const prog = state.progress[q.uid] = state.progress[q.uid] || { correct: 0, incorrect: 0, attempts: 0, totalTime: 0, answerChanges: { ccft: 0, iift: 0, c2i: 0, i2c: 0, i2i: 0 }, modes: {} };
            prog.attempts++;
            prog.totalTime += timeSpent;
            if(isCorrect) prog.correct++; else prog.incorrect++;
    
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
        
        state.quiz.sessionLog.push({ qId: q.uid, isCorrect, mwa: q.classification.mwa, time: timeSpent, initial, final, correctAnswer: q.correctAnswerIndex});
        saveState();

        if (state.quiz.mode !== 'assessment') {
            document.querySelectorAll('.choice').forEach(item => {
                const itemIndex = parseInt(item.dataset.index);
                if (itemIndex === q.correctAnswerIndex) item.classList.add('correct');
                else if (itemIndex === final) item.classList.add('incorrect');
                item.style.pointerEvents = 'none';
            });
    
            explanationEN.innerHTML = highlightTermsInText(q.explanation.en, 'en');
            explanationAR.innerHTML = highlightTermsInText(q.explanation.ar, 'ar');
            explanationBox.classList.remove('hidden');
    
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

    function showSessionSummary(sessionLog, mode) {
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
        summaryCorrect.textContent = correct;
        summaryIncorrect.textContent = incorrect;

        const mwaCounts = {};
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

                return `
                <details class="border-b border-[var(--border-color)]">
                    <summary class="p-2 cursor-pointer flex justify-between items-center text-sm">
                       <span class="truncate"><strong>${index+1}.</strong> ${highlightTermsInText(questionData.question[state.settings.language], state.settings.language)}</span>
                       <span class="font-bold text-lg ml-2 flex items-center">${statusIcon}${flagIconHTML}</span>
                    </summary>
                    <div class="p-4 bg-slate-50 dark:bg-slate-800 border-t border-[var(--border-color)] text-sm">
                        <p>You answered: <strong>${userChoice}</strong>. The correct answer was: <strong>${correctChoice}</strong>.</p>
                        <hr class="my-2 border-[var(--border-color)]">
                        <p class="font-bold mb-1">Explanation:</p>
                        <p>${highlightTermsInText(questionData.explanation.en, 'en')}</p>
                        <p class="rtl font-bold mt-2 mb-1">:الشرح</p>
                        <p class="rtl">${highlightTermsInText(questionData.explanation.ar, 'ar')}</p>
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
        const MWA_COUNTS = { A: 15, B: 28, C: 24, D: 13, E: 12, F: 22, G: 6 };
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

        let assessmentQuestions = [];
        let usedUidsInCurrentGeneration = new Set();

        for (const mwa in MWA_COUNTS) {
            const count = MWA_COUNTS[mwa];
            const mwaQuestions = availableQuestions.filter(q => q.classification.mwa === mwa && !usedUidsInCurrentGeneration.has(q.uid));
            const picked = mwaQuestions.sort(() => 0.5 - Math.random()).slice(0, count);
            assessmentQuestions.push(...picked);
            picked.forEach(q => usedUidsInCurrentGeneration.add(q.uid));
        }

        const remainingNeeded = targetSize - assessmentQuestions.length;
        if (remainingNeeded > 0) {
            const remainingPool = availableQuestions.filter(q => !usedUidsInCurrentGeneration.has(q.uid));
            const topUp = remainingPool.sort(() => 0.5 - Math.random()).slice(0, remainingNeeded);
            assessmentQuestions.push(...topUp);
        }
        
        assessmentQuestions.sort(() => 0.5 - Math.random());
        
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
    
    function resumeAssessment(assessmentId) {
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
            questions: [...remainingQuestions].sort(() => 0.5 - Math.random()), 
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

    function reviewCompletedAssessment(assessmentId) {
        const assessmentLog = state.assessmentLogs.find(l => l.id === assessmentId);
        if (assessmentLog && assessmentLog.status === 'completed') {
            showSessionSummary(assessmentLog.sessionLog, 'assessment');
        }
    }

    function deleteAssessment(assessmentId) {
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
        const assessmentList = document.getElementById('assessment-list');
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
                    const duration = new Date(log.endDate) - new Date(log.startDate);
                    const minutes = Math.floor((duration / (1000 * 60)) % 60);
                    const hours = Math.floor(duration / (1000 * 60 * 60));
                    timeSpentText = `<p class="text-xs text-slate-500 mt-1">Time: ${hours > 0 ? hours+'h ' : ''}${minutes}m</p>`;
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
        
        document.querySelectorAll('.resume-assessment-btn').forEach(btn => btn.addEventListener('click', (e) => resumeAssessment(e.currentTarget.dataset.id)));
        document.querySelectorAll('.review-assessment-btn').forEach(btn => btn.addEventListener('click', (e) => reviewCompletedAssessment(e.currentTarget.dataset.id)));
        document.querySelectorAll('.delete-assessment-btn').forEach(btn => btn.addEventListener('click', (e) => deleteAssessment(e.currentTarget.dataset.id)));
    }

    function renderReviewPage() {
        const lang = state.settings.language;
        const searchTerm = reviewSearch.value.toLowerCase();
        const flaggedOnly = reviewFlaggedOnly.checked;
        const statusFilter = reviewFilterStatus.value;
        const bookFilter = reviewFilterBook.value;
        const mwaFilter = reviewFilterMwa.value;

        const attemptedUIDs = Object.keys(state.progress).filter(uid => {
            const modes = Object.keys(state.progress[uid].modes || {});
            return modes.some(m => m !== 'assessment');
        });

        const allQuestions = ALL_BOOKS_DATA.flatMap(b => b.sections.flatMap(s => s.questions));

        let questionsToReview = allQuestions
            .filter(q => attemptedUIDs.includes(q.uid))
            .filter(q => !flaggedOnly || state.flaggedQuestions.includes(q.uid))
            .filter(q => !searchTerm || q.question.en.toLowerCase().includes(searchTerm) || q.question.ar.includes(searchTerm) || q.uid.toLowerCase().includes(searchTerm))
            .filter(q => {
                if (statusFilter === 'all') return true;
                const prog = state.progress[q.uid];
                const correct = (prog.modes.study?.correct || 0) + (prog.modes.quiz?.correct || 0);
                const incorrect = (prog.modes.study?.incorrect || 0) + (prog.modes.quiz?.incorrect || 0);
                return statusFilter === 'correct' ? correct > incorrect : incorrect >= correct;
            })
            .filter(q => bookFilter === 'all' || q.uid.startsWith(`B${bookFilter.replace('book','')}`))
            .filter(q => mwaFilter === 'all' || q.classification.mwa === mwaFilter);

        reviewList.innerHTML = questionsToReview.length > 0 ? questionsToReview.map(q => {
            const prog = state.progress[q.uid];
            const correct = (prog.modes.study?.correct || 0) + (prog.modes.quiz?.correct || 0);
            const incorrect = (prog.modes.study?.incorrect || 0) + (prog.modes.quiz?.incorrect || 0);
            const isCorrect = correct > incorrect;
            const statusIcon = isCorrect ? '✅' : '❌';
            const isFlagged = state.flaggedQuestions.includes(q.uid);
            const book = ALL_BOOKS_DATA.find(b => q.uid.startsWith(`B${b.id.replace('book','')}`));
            const section = book.sections.find(s => s.questions.some(qu => qu.uid === q.uid));
            const bookText = book.title[lang];
            const sectionText = section.title[lang];
            const mwaText = CODEBOOK.mwa[q.classification.mwa]?.[lang] || '';
            const taskText = CODEBOOK.tasks[q.classification.task]?.[lang] || '';
            const modesAttempted = Object.keys(prog.modes || {}).filter(m => m !== 'assessment').map(m => `<span class="mode-tag mode-${m}">${m}</span>`).join(' ');

            return `
                <details class="border-b border-[var(--border-color)]">
                    <summary class="p-4 cursor-pointer grid grid-cols-12 gap-4 items-center">
                        <div class="col-span-1 text-center">${isFlagged ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" class="text-indigo-600 inline-block"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>' : ''}</div>
                        <div class="col-span-8">
                            <p class="font-semibold text-sm truncate">${highlightTermsInText(q.question[lang], lang)}</p>
                            <div class="text-xs text-slate-500 mt-1 space-y-0.5">
                                <div><strong>Book:</strong> ${bookText} &bull; <strong>Subject:</strong> ${sectionText}</div>
                                <div><strong>Category:</strong> ${q.classification.mwa} - ${mwaText}</div>
                                <div><strong>Task:</strong> ${q.classification.task} - ${taskText}</div>
                            </div>
                        </div>
                        <div class="col-span-2 text-xs truncate">${modesAttempted}</div>
                        <div class="col-span-1 text-xl text-right">${statusIcon}</div>
                    </summary>
                    <div class="p-4 bg-slate-50 dark:bg-slate-800 border-t border-[var(--border-color)]">
                         <p class="text-xs text-slate-500 mb-4"><strong>UID:</strong> ${q.uid}</p>
                        <p class="font-bold mb-2">Correct Answer:</p>
                        <p class="mb-4">${String.fromCharCode(65 + q.correctAnswerIndex)}. ${highlightTermsInText(q.choices[q.correctAnswerIndex].en, 'en')}</p>
                        <p class="rtl font-bold mb-2">:الإجابة الصحيحة</p>
                        <p class="rtl mb-4">${highlightTermsInText(q.choices[q.correctAnswerIndex].ar, 'ar')}</p>
                        <hr class="my-4 border-[var(--border-color)]">
                        <p class="font-bold mb-2">Explanation:</p>
                        <p>${highlightTermsInText(q.explanation.en, 'en')}</p>
                        <p class="rtl font-bold mt-4 mb-2">:الشرح</p>
                        <p class="rtl">${highlightTermsInText(q.explanation.ar, 'ar')}</p>
                    </div>
                </details>`;
        }).join('') : `<p class="text-slate-500 text-center p-4">No questions match your current filters.</p>`;
    }

    function renderReportsPage() {
        renderOverallReports();
        renderAssessmentReports();
    }
    
    function renderOverallReports() {
        if (typeof Chart === 'undefined') return;
    
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
            
            const bookIdForQuestion = `book${uid.charAt(1)}`; 
            const bookMatch = (bookFilter === 'all') || (bookIdForQuestion === bookFilter);
            
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
                if (key === 'book') categoryId = `book${uid.charAt(1)}`;
                else if (key === 'subject') {
                    const book = ALL_BOOKS_DATA.find(b => b.id === `book${uid.charAt(1)}`);
                    const section = book.sections.find(s => s.questions.some(qu => qu.uid === q.uid));
                    categoryId = section?.id;
                }
                else if (key === 'mwa') categoryId = q.classification.mwa;
                else if (key === 'task') categoryId = q.classification.task;
                
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
        const mwaChartCtx = document.getElementById('mwa-chart').getContext('2d');
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
                                const value = context.raw;
                                const total = context.chart.data.datasets.reduce((acc, dataset) => acc + (dataset.data[context.dataIndex] || 0), 0);
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
        
        const changeChartCtx = document.getElementById('change-chart').getContext('2d');
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
                                const value = context.raw;
                                const total = context.chart.data.datasets[0].data.reduce((acc, val) => acc + val, 0);
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
                if (key === 'book') categoryId = `book${q.uid.charAt(1)}`;
                else if (key === 'subject') {
                    const book = ALL_BOOKS_DATA.find(b => b.id === `book${q.uid.charAt(1)}`);
                    const section = book.sections.find(s => s.questions.some(qu => qu.uid === q.uid));
                    categoryId = section?.id;
                }
                else if (key === 'mwa') categoryId = q.classification.mwa;
                else if (key === 'task') categoryId = q.classification.task;
                
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
        const assessmentMwaChartCtx = document.getElementById('assessment-mwa-chart').getContext('2d');
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
                                const value = context.raw;
                                const total = context.chart.data.datasets.reduce((acc, dataset) => acc + (dataset.data[context.dataIndex] || 0), 0);
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

        const assessmentChangeChartCtx = document.getElementById('assessment-change-chart').getContext('2d');
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
                                const value = context.raw;
                                const total = context.chart.data.datasets[0].data.reduce((acc, val) => acc + val, 0);
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
        document.querySelectorAll('#quick-access-content .nav-btn').forEach(b => b.addEventListener('click', () => navigateTo(b.dataset.page)));

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
        allActivities.sort((a, b) => b.date - a.date);

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
                        const duration = new Date(activity.data.endDate) - new Date(activity.data.startDate);
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
                    const duration = new Date(endTime) - new Date(startTime);
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

        document.querySelectorAll('.recent-activity-item').forEach(item => {
            if (item.dataset.resumeAssessmentId) {
                item.addEventListener('click', () => resumeAssessment(item.dataset.resumeAssessmentId));
            } else if (item.dataset.reviewAssessmentId) {
                item.addEventListener('click', () => reviewCompletedAssessment(item.dataset.reviewAssessmentId));
            } else if (item.dataset.reviewSessionId) {
                item.addEventListener('click', () => {
                    const session = state.sessionHistory.find(s => s.startTime === item.dataset.reviewSessionId);
                    if (session) showSessionSummary(session.sessionLog, session.mode);
                });
            }
        });
        
        const mwaData = {};
        const allQuestionsInDB = ALL_BOOKS_DATA.flatMap(b => b.sections.flatMap(s => s.questions));
        
        Object.entries(state.progress).forEach(([uid, prog]) => {
            const hasNonAssessmentMode = Object.keys(prog.modes || {}).some(m => m !== 'assessment');
            if (!hasNonAssessmentMode) return;
        
            const q = allQuestionsInDB.find(q => q.uid === uid);
            if (q) {
                const mwa = q.classification.mwa;
                mwaData[mwa] = mwaData[mwa] || {c: 0, i: 0};
                mwaData[mwa].c += (prog.modes.study?.correct || 0) + (prog.modes.quiz?.correct || 0);
                mwaData[mwa].i += (prog.modes.study?.incorrect || 0) + (prog.modes.quiz?.incorrect || 0);
            }
        });
        
        const mwaLabels = Object.keys(CODEBOOK.mwa).sort();
        const dashboardMwaChartCtx = document.getElementById('dashboard-mwa-chart').getContext('2d');
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
        newBookFileInput.value = '';
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
            span.classList.remove('bg-indigo-100', 'dark:bg-indigo-800');
            span.classList.add('bg-gray-100', 'dark:bg-gray-700');
            if ((index + 1) < step) {
                indicator.classList.add('active');
            } else if ((index + 1) === step) {
                span.classList.remove('bg-gray-100', 'dark:bg-gray-700');
                span.classList.add('bg-indigo-100', 'dark:bg-indigo-800');
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

    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        wizardState.newBookFileName = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                wizardState.newBookData = JSON.parse(e.target.result);
                wizardNextBtn.disabled = false;
            } catch (err) {
                alert(`Error parsing JSON file: ${err.message}`);
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
        let errors = [], warnings = [];
        
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
        
        const downloadArea = document.getElementById('wizard-download-area');
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
    
    function renderGlossary(filter = '', type = 'search') {
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
    
    function renderPopupContent(displayLang) {
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

    function showTermPopup(event) {
        const target = event.target.closest('.glossary-term-highlight');
        if (!target) {
            if (!termPopup.contains(event.target)) {
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
        if (button.dataset.page) {
            navigateTo(button.dataset.page);
        }
    }));
    usernameInput.addEventListener('change', e => { state.settings.username = e.target.value; saveState(); applySettings(); });
    languageSelect.addEventListener('change', e => { state.settings.language = e.target.value; saveState(); applySettings(); populateBookSelector(); renderReviewPage(); });
    themeToggle.addEventListener('change', e => { state.settings.theme = e.target.checked ? 'dark' : 'light'; saveState(); applySettings(); });
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
    [reviewSearch, reviewFlaggedOnly, reviewFilterStatus, reviewFilterBook, reviewFilterMwa].forEach(el => el.addEventListener('input', renderReviewPage));
    resetFiltersBtn.addEventListener('click', () => {
        reviewSearch.value = ''; reviewFlaggedOnly.checked = false; reviewFilterStatus.value = 'all'; reviewFilterBook.value = 'all'; reviewFilterMwa.value = 'all';
        renderReviewPage();
    });
    
    reportTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
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
    
    glossaryNavBtn.addEventListener('click', () => {
        renderGlossary();
        glossaryModal.classList.remove('hidden');
    });
    glossaryCloseBtn.addEventListener('click', () => glossaryModal.classList.add('hidden'));
    glossarySearchInput.addEventListener('input', (e) => renderGlossary(e.target.value, 'search'));

    function init() {
        if (!ALL_BOOKS_DATA || ALL_BOOKS_DATA.length === 0) {
             document.body.innerHTML = `<div class="p-8 text-center bg-red-100 text-red-800 rounded-lg"><strong>Error:</strong> No book data found.</div>`;
            return;
        }
        loadState();
        applySettings();
        populateBookSelector();
        prepareGlossary();
        const firstTab = document.querySelector('.report-tab');
        firstTab.classList.add('active', 'border-indigo-500', 'text-indigo-600');
        firstTab.classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
        reportTabContents[0].classList.remove('hidden');

        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        alphabet.forEach(letter => {
            const button = document.createElement('button');
            button.textContent = letter;
            button.className = "p-1 px-3 rounded-md border border-[var(--border-color)] hover:bg-indigo-200 dark:hover:bg-indigo-700";
            button.addEventListener('click', (e) => {
                 document.querySelectorAll('#glossary-alphabet-filter button').forEach(b => b.classList.remove('active'));
                 e.currentTarget.classList.add('active');
                 renderGlossary(letter, 'letter');
            });
            glossaryAlphabetFilter.appendChild(button);
        });

        document.addEventListener('click', showTermPopup);
        termPopup.addEventListener('click', (e) => {
            if (e.target.matches('.toggle-def-lang')) {
                const newLang = e.target.dataset.lang;
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

