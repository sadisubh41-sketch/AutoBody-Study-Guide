// src/modules/quiz.ts
import { stateManager } from './state';
import { glossaryManager } from './glossary';
import { uiManager } from './ui';
import { navigation } from './navigation';
import type { Question, QuizMode, QuizSession } from './types';

export const quizManager = (() => {
  // --- CACHED DOM ELEMENTS ---
  // Setup Buttons
  let startStudyBtn: HTMLButtonElement | null = null;
  let startQuizBtn: HTMLButtonElement | null = null;

  // Session Page Elements
  let questionContainer: HTMLElement | null = null;
  let optionsContainer: HTMLElement | null = null;
  let feedbackArea: HTMLElement | null = null;
  let nextBtn: HTMLButtonElement | null = null;
  let submitBtn: HTMLButtonElement | null = null;
  let endSessionBtn: HTMLButtonElement | null = null;
  let flagQuestionBtn: HTMLButtonElement | null = null;
  let toggleTranslationBtn: HTMLButtonElement | null = null;

  let quizBreadcrumbs: HTMLElement | null = null;
  let quizTimer: HTMLElement | null = null;
  let questionEN: HTMLElement | null = null;
  let questionAR: HTMLElement | null = null;
  let choicesEN: HTMLElement | null = null;
  let choicesAR: HTMLElement | null = null;
  let explanationBox: HTMLElement | null = null;
  let explanationEN: HTMLElement | null = null;
  let explanationAR: HTMLElement | null = null;
  let questionInfoFooter: HTMLElement | null = null;
  let englishCol: HTMLElement | null = null;
  let arabicCol: HTMLElement | null = null;
  let flagIcon: HTMLElement | null = null;

  // --- SESSION STATE ---
  let timerInterval: number | null = null;

  /**
   * Caches all DOM elements needed for all quiz/study modes.
   */
  function cacheElements() {
    // Setup buttons
    startStudyBtn = document.getElementById('start-study-btn') as HTMLButtonElement;
    startQuizBtn = document.getElementById('start-quiz-btn') as HTMLButtonElement;

    // Session Page Elements
    questionContainer = document.getElementById('question-container');
    optionsContainer = document.getElementById('quiz-options-container'); // Note: This ID is not in index.html, using choices containers instead.
    feedbackArea = document.getElementById('quiz-feedback-area'); // Note: This ID is not in index.html, using explanationBox instead.
    nextBtn = document.getElementById('session-next-btn') as HTMLButtonElement;
    submitBtn = document.getElementById('session-submit-btn') as HTMLButtonElement;
    endSessionBtn = document.getElementById('session-end-btn') as HTMLButtonElement;
    flagQuestionBtn = document.getElementById('flag-question-btn') as HTMLButtonElement;
    toggleTranslationBtn = document.getElementById('toggle-translation-btn') as HTMLButtonElement;

    quizBreadcrumbs = document.getElementById('quiz-breadcrumbs');
    quizTimer = document.getElementById('quiz-timer');
    questionEN = document.getElementById('question-en');
    questionAR = document.getElementById('question-ar');
    choicesEN = document.getElementById('choices-en');
    choicesAR = document.getElementById('choices-ar');
    explanationBox = document.getElementById('explanation-box');
    explanationEN = document.getElementById('explanation-en');
    explanationAR = document.getElementById('explanation-ar');
    questionInfoFooter = document.getElementById('question-info-footer');
    englishCol = document.getElementById('english-col');
    arabicCol = document.getElementById('arabic-col');
    flagIcon = document.getElementById('flag-icon');
  }

  /**
   * Starts a new session (Study, Quiz, or Assessment).
   */
  function startSession(questions: Question[], mode: QuizMode, bookId: string, contextId: string) {
    let questionsToAttempt = questions;

    // In study/quiz mode, filter out questions already answered *in that mode*.
    if (mode !== 'assessment') {
      const { progress } = stateManager.getState();
      questionsToAttempt = questions.filter(q => !progress[q.uid]?.modes?.[mode]);
    }

    if (questionsToAttempt.length === 0 && mode !== 'assessment') {
      uiManager.showAlert(
        'All Done!',
        'You have already attempted all questions in this section. Reset your progress from the Settings page to try again.'
      );
      return;
    }

    // Shuffle the questions
    const shuffledQuestions = [...questionsToAttempt].sort(() => 0.5 - Math.random());

    const newSession: QuizSession = {
      isActive: true,
      mode,
      questions: shuffledQuestions,
      currentQuestionIndex: 0,
      timer: 0,
      questionStartTime: 0,
      sessionLog: [],
      currentQuestionAnswered: false,
      currentAnswerLog: { initial: null, final: null },
      sessionInfo: { bookId, contextId, startTime: new Date().toISOString() }
    };

    stateManager.update('quiz', newSession);
    renderQuestion();
    navigation.showPage('session');
    startQuizTimer();
  }

  /**
   * Renders the current question based on the state.
   */
  function renderQuestion() {
    const { quiz, settings, flaggedQuestions, APP_DATA } = stateManager.getState();
    const q = quiz.questions[quiz.currentQuestionIndex];

    if (!q || !questionEN || !choicesEN || !quizBreadcrumbs || !questionInfoFooter || !submitBtn || !nextBtn || !explanationBox) {
      console.error('Quiz UI elements not found. Cannot render question.');
      return;
    }

    // Reset UI
    stateManager.update('quiz', {
      currentQuestionAnswered: false,
      currentAnswerLog: { initial: null, final: null }
    });
    explanationBox.classList.add('hidden');
    choicesEN.innerHTML = '';
    choicesAR.innerHTML = '';
    submitBtn.classList.remove('hidden');
    nextBtn.classList.add('hidden');
    submitBtn.disabled = true; // Disabled until an option is selected

    // --- Render Question Info ---
    const book = APP_DATA.books.find(b => q.uid.startsWith(`B${b.id.replace('book','')}`));
    const { mwa, task } = q.classification;
    // Add optional chaining to prevent crashes if codebook is not loaded
    const mwaText = APP_DATA.codebook?.mwa?.[mwa]?.[settings.language] || mwa || '';
    const taskText = APP_DATA.codebook?.tasks?.[task]?.[settings.language] || task || '';
    const bookText = book?.title[settings.language] || book?.title.en || '';
    const section = book?.sections.find(sec => sec.questions.some(ques => ques.uid === q.uid));
    const sectionText = section?.title[settings.language] || section?.title.en || '';

    questionInfoFooter.innerHTML = `
      <div class="flex justify-between w-full flex-wrap gap-x-4">
        <div>
          <div><strong>Book/Subject:</strong> ${bookText} &bull; ${sectionText}</div>
          <div><strong>Category/Task:</strong> ${mwa} - ${mwaText} &bull; ${taskText}</div>
        </div>
        <div class="text-right"><strong>UID:</strong> ${q.uid}</div>
      </div>`;

    quizBreadcrumbs.textContent = `Question ${quiz.currentQuestionIndex + 1} of ${quiz.questions.length}`;

    // --- Render Question & Choices ---
    questionEN.innerHTML = glossaryManager.highlightTerms(q.question.en, 'en');
    questionAR.innerHTML = glossaryManager.highlightTerms(q.question.ar || q.question.en, 'ar');

    q.choices.forEach((choice, index) => {
      const choiceEN = document.createElement('li');
      choiceEN.className = 'choice p-3 rounded-lg';
      choiceEN.dataset.index = index.toString();
      choiceEN.innerHTML = `${String.fromCharCode(65 + index)}. ${glossaryManager.highlightTerms(choice.en, 'en')}`;
      choicesEN.appendChild(choiceEN);

      const choiceAR = document.createElement('li');
      choiceAR.className = 'choice p-3 rounded-lg rtl';
      choiceAR.dataset.index = index.toString();
      choiceAR.innerHTML = `(${['أ', 'ب', 'ج', 'د'][index]}) ${glossaryManager.highlightTerms(choice.ar || choice.en, 'ar')}`;
      choicesAR.appendChild(choiceAR);
    });

    attachChoiceListeners();
    toggleTranslation(settings.language === 'ar'); // Show/hide Arabic based on settings
    updateFlagButton();

    nextBtn.textContent = (quiz.currentQuestionIndex === quiz.questions.length - 1) ? 'Finish Session' : 'Next Question';
    stateManager.update('quiz', { questionStartTime: Date.now() });
  }

  /**
   * Attaches click listeners to all choice buttons.
   */
  function attachChoiceListeners() {
    document.querySelectorAll('.choice').forEach(choice => {
      choice.addEventListener('click', (e) => handleChoiceSelection(e.currentTarget as HTMLElement));
      choice.addEventListener('mouseover', () => {
        document.querySelectorAll(`.choice[data-index="${(choice as HTMLElement).dataset.index}"]`).forEach(c => c.classList.add('highlight'));
      });
      choice.addEventListener('mouseout', () => {
        document.querySelectorAll(`.choice[data-index="${(choice as HTMLElement).dataset.index}"]`).forEach(c => c.classList.remove('highlight'));
      });
    });
  }

  function handleChoiceSelection(target: HTMLElement) {
    const { quiz } = stateManager.getState();
    if (!target || quiz.currentQuestionAnswered) return;

    const selectedIndex = parseInt(target.dataset.index || '-1');
    const { currentAnswerLog } = quiz;

    if (currentAnswerLog.initial === null) {
      currentAnswerLog.initial = selectedIndex;
    }
    currentAnswerLog.final = selectedIndex;
    stateManager.update('quiz', { currentAnswerLog });

    document.querySelectorAll('.choice').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll(`.choice[data-index='${selectedIndex}']`).forEach(el => el.classList.add('selected'));
    
    if (submitBtn) submitBtn.disabled = false;
  }

  /**
   * Locks in the answer, grades it, and provides feedback.
   */
  function handleSubmitAnswer() {
    const { quiz } = stateManager.getState();
    if (quiz.currentAnswerLog.final === null || quiz.currentQuestionAnswered) return;

    stopQuizTimer(false); // Stop timer for this question
    stateManager.update('quiz', { currentQuestionAnswered: true });

    const q = quiz.questions[quiz.currentQuestionIndex];
    const { initial, final } = quiz.currentAnswerLog;
    const isCorrect = final === q.correctAnswerIndex;
    const timeSpent = Date.now() - quiz.questionStartTime;

    // Log progress
    const { progress } = stateManager.getState();
    const prog = progress[q.uid] || { correct: 0, incorrect: 0, attempts: 0, totalTime: 0, answerChanges: { ccft: 0, iift: 0, c2i: 0, i2c: 0, i2i: 0 }, modes: {} };
    prog.attempts++;
    prog.totalTime += timeSpent;
    if(isCorrect) prog.correct++; else prog.incorrect++;

    prog.modes[quiz.mode] = prog.modes[quiz.mode] || {correct: 0, incorrect: 0, totalTime: 0, attempts: 0};
    prog.modes[quiz.mode].correct += isCorrect ? 1 : 0;
    prog.modes[quiz.mode].incorrect += isCorrect ? 0 : 1;
    prog.modes[quiz.mode].totalTime += timeSpent;
    prog.modes[quiz.mode].attempts++;
    
    const initialWasCorrect = initial === q.correctAnswerIndex;
    if (initial === final) {
        if (isCorrect) prog.answerChanges.ccft++;
        else prog.answerChanges.iift++;
    } else if (initial !== null) {
        if (initialWasCorrect && !isCorrect) prog.answerChanges.c2i++;
        else if (!initialWasCorrect && isCorrect) prog.answerChanges.i2c++;
        else if (!initialWasCorrect && !isCorrect) prog.answerChanges.i2i++;
    }
    stateManager.update('progress', { [q.uid]: prog });

    // Log session info
    quiz.sessionLog.push({ qId: q.uid, isCorrect, mwa: q.classification.mwa, time: timeSpent, initial, final, correctAnswer: q.correctAnswerIndex});
    stateManager.update('quiz', { sessionLog: quiz.sessionLog });
    
    stateManager.saveState(); // Save after every answer

    // Show feedback for study/quiz modes
    if (quiz.mode !== 'assessment') {
      document.querySelectorAll('.choice').forEach(item => {
        const itemIndex = parseInt((item as HTMLElement).dataset.index || '-1');
        if (itemIndex === q.correctAnswerIndex) item.classList.add('correct');
        else if (itemIndex === final) item.classList.add('incorrect');
        (item as HTMLElement).style.pointerEvents = 'none';
      });

      if (explanationEN && explanationAR && explanationBox) {
        explanationEN.innerHTML = glossaryManager.highlightTerms(q.explanation.en, 'en');
        explanationAR.innerHTML = glossaryManager.highlightTerms(q.explanation.ar || q.explanation.en, 'ar');
        explanationBox.classList.remove('hidden');
      }

      if (nextBtn) nextBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.add('hidden');
    } else {
      // For assessments, just move to the next question automatically
      handleNextQuestion();
    }
  }

  /**
   * Moves to the next question or ends the quiz.
   */
  function handleNextQuestion() {
    const { quiz } = stateManager.getState();
    if (quiz.currentQuestionIndex < quiz.questions.length - 1) {
      stateManager.update('quiz', { currentQuestionIndex: quiz.currentQuestionIndex + 1 });
      renderQuestion();
      startQuizTimer(); // Start timer for the new question
    } else {
      endSession();
    }
  }

  /**
   * Ends the current session, logs the results, and shows the summary.
   */
  function endSession() {
    stopQuizTimer(true); // Stop session timer
    const { quiz, assessmentLogs, sessionHistory, APP_DATA, completedSections } = stateManager.getState();
    
    if (!quiz.isActive) return;
    stateManager.update('quiz', { isActive: false });

    const { bookId, contextId, startTime } = quiz.sessionInfo;

    const sessionSummaryData = {
      mode: quiz.mode,
      contextId,
      bookId,
      startTime,
      endTime: new Date().toISOString(),
      sessionLog: quiz.sessionLog
    };

    if (quiz.mode === 'assessment') {
      const assessmentLog = assessmentLogs.find(log => log.id === contextId);
      if (assessmentLog) {
        assessmentLog.sessionLog = quiz.sessionLog;
        assessmentLog.status = 'completed';
        assessmentLog.endDate = sessionSummaryData.endTime;
        stateManager.update('assessmentLogs', assessmentLogs);
      }
    } else {
      sessionHistory.push(sessionSummaryData);
      if (sessionHistory.length > 20) sessionHistory.shift();
      stateManager.update('sessionHistory', sessionHistory);

      // Check for section completion
      if (bookId && contextId) {
        const book = APP_DATA.books.find(b => b.id === bookId);
        const section = book?.sections.find(s => s.id === contextId);
        if (section) {
          const allAttemptedInMode = section.questions.every(q => stateManager.getState().progress[q.uid]?.modes?.[quiz.mode]);
          const sectionIdentifier = `${bookId}_${contextId}`;
          if (allAttemptedInMode && !completedSections.includes(sectionIdentifier)) {
            completedSections.push(sectionIdentifier);
            stateManager.update('completedSections', completedSections);
          }
        }
      }
    }
    stateManager.saveState();
    uiManager.showSessionSummary(quiz.sessionLog, quiz.mode);
    navigation.showPage('dashboard');
  }

  /**
   * Starts or stops the session timer.
   */
  function startQuizTimer() {
    stopQuizTimer(false); // Clear any existing question timer
    if (quizTimer) quizTimer.textContent = '00:00';
    
    timerInterval = window.setInterval(() => {
      const { quiz } = stateManager.getState();
      const newTime = quiz.timer + 1;
      stateManager.update('quiz', { timer: newTime });
      
      const minutes = Math.floor(newTime / 60).toString().padStart(2, '0');
      const seconds = (newTime % 60).toString().padStart(2, '0');
      if (quizTimer) quizTimer.textContent = `${minutes}:${seconds}`;
    }, 1000);
  }

  function stopQuizTimer(isSessionEnd: boolean) {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (isSessionEnd) {
      stateManager.update('quiz', { timer: 0 });
    }
  }

  /**
   * Toggles the translation columns.
   */
  function toggleTranslation(showArabic: boolean) {
    if (!arabicCol || !englishCol || !toggleTranslationBtn) return;

    if (showArabic) {
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
  }

  /**
   * Toggles the flagged status of the current question.
   */
  function toggleFlagQuestion() {
    const { quiz, flaggedQuestions } = stateManager.getState();
    const q = quiz.questions[quiz.currentQuestionIndex];
    if (!q) return;

    const uid = q.uid;
    const flagIndex = flaggedQuestions.indexOf(uid);

    if (flagIndex > -1) {
      flaggedQuestions.splice(flagIndex, 1);
    } else {
      flaggedQuestions.push(uid);
    }
    
    stateManager.update('flaggedQuestions', flaggedQuestions);
    stateManager.saveState();
    updateFlagButton();
  }

  function updateFlagButton() {
    const { quiz, flaggedQuestions } = stateManager.getState();
    const q = quiz.questions[quiz.currentQuestionIndex];
    const isFlagged = q && flaggedQuestions.includes(q.uid);

    if (flagIcon) {
      flagIcon.style.fill = isFlagged ? 'var(--red-seal-color)' : 'none';
      flagIcon.classList.toggle('text-red-seal', isFlagged);
      flagIcon.classList.toggle('text-gray-500', !isFlagged);
    }
  }

  // --- PUBLIC API ---
  return {
    initialize() {
      cacheElements();
      
      // Attach listeners to setup buttons
      startStudyBtn?.addEventListener('click', () => navigation.handleStartStudy());
      startQuizBtn?.addEventListener('click', () => navigation.handleStartQuiz());

      // Attach listeners to session buttons
      submitBtn?.addEventListener('click', handleSubmitAnswer);
      nextBtn?.addEventListener('click', handleNextQuestion);
      endSessionBtn?.addEventListener('click', () => {
        uiManager.showConfirmation(
          'End Session?',
          'Are you sure you want to end this session? Your progress so far will be saved.',
          (confirmed) => {
            if (confirmed) {
              endSession();
            }
          }
        );
      });
      flagQuestionBtn?.addEventListener('click', toggleFlagQuestion);
      toggleTranslationBtn?.addEventListener('click', () => {
        const { settings } = stateManager.getState();
        // Toggle based on current state, not settings
        const isArabicVisible = !arabicCol?.classList.contains('hidden');
        toggleTranslation(!isArabicVisible);
      });

      console.log('Quiz Manager initialized');
    },

    /**
     * Public method to start a session.
     */
    startSession
  };
})();

