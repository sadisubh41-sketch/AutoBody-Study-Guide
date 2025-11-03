// src/modules/ui.ts
import { stateManager } from './state';
import { navigation } from './navigation'; // Import for modal button
import type { QuizMode, SessionLogEntry } from './types';

export const uiManager = (() => {
  // --- CACHED DOM ELEMENTS ---
  let welcomeMessage: HTMLElement | null = null;

  // Settings
  let themeToggle: HTMLInputElement | null = null;
  let themeLabel: HTMLElement | null = null;
  let usernameInput: HTMLInputElement | null = null;
  let languageSelect: HTMLSelectElement | null;

  // Custom Alert Modal
  let alertModal: HTMLElement | null = null;
  let alertMessage: HTMLElement | null = null;
  let alertCloseBtn: HTMLButtonElement | null = null;

  // Session Summary Modal
  let sessionSummaryModal: HTMLElement | null = null;
  let summaryTitle: HTMLElement | null = null;
  let summaryScore: HTMLElement | null = null;
  let summaryCorrect: HTMLElement | null = null;
  let summaryIncorrect: HTMLElement | null = null;
  let summaryBreakdown: HTMLElement | null = null;
  let summaryQuestionList: HTMLElement | null = null;
  let summaryCloseBtn: HTMLButtonElement | null = null;
  let summaryReportsBtn: HTMLButtonElement | null = null;

  /**
   * Caches all frequently accessed DOM elements.
   */
  function cacheElements(): void {
    welcomeMessage = document.getElementById('welcome-message');
    
    // Settings
    themeToggle = document.getElementById('theme-toggle') as HTMLInputElement | null;
    themeLabel = document.getElementById('theme-label');
    usernameInput = document.getElementById('username-input') as HTMLInputElement | null;
    languageSelect = document.getElementById('language-select') as HTMLSelectElement | null;

    // Alert Modal
    alertModal = document.getElementById('alert-modal');
    alertMessage = document.getElementById('alert-message');
    alertCloseBtn = document.getElementById('alert-close-btn') as HTMLButtonElement | null;

    // Summary Modal
    sessionSummaryModal = document.getElementById('session-summary-modal');
    summaryTitle = document.getElementById('summary-title');
    summaryScore = document.getElementById('summary-score');
    summaryCorrect = document.getElementById('summary-correct');
    summaryIncorrect = document.getElementById('summary-incorrect');
    summaryBreakdown = document.getElementById('summary-breakdown');
    summaryQuestionList = document.getElementById('summary-question-list');
    summaryCloseBtn = document.getElementById('summary-close-btn') as HTMLButtonElement | null;
    summaryReportsBtn = document.getElementById('summary-reports-btn') as HTMLButtonElement | null;
  }

  /**
   * Applies the current theme from settings.
   */
  function applyTheme(): void {
    const { settings } = stateManager.getState();
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
    if (themeToggle) themeToggle.checked = settings.theme === 'dark';
    if (themeLabel) themeLabel.textContent = settings.theme === 'dark' ? 'Dark Mode' : 'Light Mode';
  }

  /**
   * Shows the greeting message based on username.
   */
  function renderWelcome(): void {
    const { settings } = stateManager.getState();
    if (welcomeMessage) {
      welcomeMessage.textContent = settings.username
        ? `Welcome back, ${settings.username}!`
        : 'Welcome! Set your name in Settings.';
    }
  }

  /**
   * Populates the settings page with current state.
   */
  function renderSettings(): void {
    const { settings } = stateManager.getState();
    if (usernameInput) {
      usernameInput.value = settings.username;
    }
    if (languageSelect) {
      languageSelect.value = settings.language;
    }
  }

  /**
   * Displays a custom alert modal.
   */
  function showAlert(message: string): void {
    if (alertModal && alertMessage) {
      alertMessage.textContent = message;
      alertModal.classList.remove('hidden');
    }
  }

  /**
   * Displays the session summary modal.
   */
  function showSessionSummary(sessionLog: SessionLogEntry[], mode: QuizMode): void {
    const { APP_DATA, settings } = stateManager.getState();
    const lang = settings.language;

    const total = sessionLog.length;
    if (total === 0) return; // Should not happen if called from endSession

    const correct = sessionLog.filter(l => l.isCorrect).length;
    const incorrect = total - correct;
    const score = Math.round((correct / total) * 100);

    if (summaryTitle) summaryTitle.textContent = `${mode.charAt(0).toUpperCase() + mode.slice(1)} Session Summary`;
    if (summaryScore) summaryScore.textContent = `${score}%`;
    if (summaryCorrect) summaryCorrect.textContent = String(correct);
    if (summaryIncorrect) summaryIncorrect.textContent = String(incorrect);

    // MWA Breakdown
    const mwaCounts: { [key: string]: { c: number, t: number } } = {};
    sessionLog.forEach(item => {
      const mwa = item.mwa;
      mwaCounts[mwa] = mwaCounts[mwa] || { c: 0, t: 0 };
      mwaCounts[mwa].t++;
      if (item.isCorrect) mwaCounts[mwa].c++;
    });

    if (summaryBreakdown) {
      summaryBreakdown.innerHTML = `<h3 class="font-semibold mb-2">Performance by MWA</h3>` +
        Object.keys(mwaCounts).sort().map(mwa => {
          const { c, t } = mwaCounts[mwa];
          const mwaScore = Math.round((c / t) * 100);
          const mwaName = APP_DATA.codebook.mwa[mwa]?.[lang] || APP_DATA.codebook.mwa[mwa]?.en || mwa;
          const scoreClass = mwaScore >= 70 ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900';
          return `
            <div class="text-sm p-2 rounded ${scoreClass}">
              <strong>${mwaName}</strong>: ${c}/${t} correct (${mwaScore}%)
            </div>`;
        }).join('');
    }

    // Question List (only for assessment)
    if (summaryQuestionList) {
      if (mode === 'assessment') {
        const allQuestions = APP_DATA.books.flatMap(b => b.sections.flatMap(s => s.questions));
        summaryQuestionList.innerHTML = `<h3 class="font-semibold mt-4 mb-2">Question Review</h3>` +
          sessionLog.map((item, index) => {
            const q = allQuestions.find(q => q.uid === item.qId);
            if (!q) return '';
            const statusIcon = item.isCorrect ? '✅' : '❌';
            const userChoice = String.fromCharCode(65 + (item.final ?? 0));
            const correctChoice = String.fromCharCode(65 + item.correctAnswer);
            return `
              <details class="border-b border-gray-200 dark:border-gray-700">
                <summary class="p-2 cursor-pointer flex justify-between items-center text-sm">
                  <span classG="truncate"><strong>${index + 1}.</strong> ${q.question[lang]}</span>
                  <span class="font-bold text-lg ml-2">${statusIcon}</span>
                </summary>
                <div class="p-4 bg-gray-50 dark:bg-gray-800 text-sm">
                  <p>You answered: <strong>${userChoice}</strong>. Correct answer: <strong>${correctChoice}</strong>.</p>
                  <hr class="my-2">
                  <p class="font-bold mb-1">Explanation:</p>
                  <p>${q.explanation?.en || 'N/A'}</p>
                  <p class="rtl font-bold mt-2 mb-1">:الشرح</p>
                  <p class="rtl">${q.explanation?.ar || 'N/A'}</p>
                </div>
              </details>`;
          }).join('');
      } else {
        summaryQuestionList.innerHTML = '';
      }
    }
    
    // Show/hide reports button
    if (summaryReportsBtn) {
      summaryReportsBtn.style.display = mode === 'assessment' ? 'none' : 'inline-flex';
    }

    if (sessionSummaryModal) {
      sessionSummaryModal.classList.remove('hidden');
    }
  }

  /**
   * Attaches all global UI event listeners.
   */
  function attachListeners(): void {
    // Theme Toggle
    themeToggle?.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const theme = target.checked ? 'dark' : 'light';
      stateManager.updateSettings({ theme });
      applyTheme();
    });

    // Settings Inputs
    usernameInput?.addEventListener('change', (e) => {
      stateManager.updateSettings({ username: (e.target as HTMLInputElement).value });
    });

    languageSelect?.addEventListener('change', (e) => {
      const lang = (e.target as HTMLSelectElement).value as 'en' | 'ar';
      stateManager.updateSettings({ language: lang });
      // Full refresh needed to apply language everywhere
      refresh();
      navigation.populateBookSelectors(); // Repopulate dropdowns with new lang
    });

    // Alert Modal
    alertCloseBtn?.addEventListener('click', () => {
      alertModal?.classList.add('hidden');
    });

    // Summary Modal
    summaryCloseBtn?.addEventListener('click', () => {
      sessionSummaryModal?.classList.add('hidden');
      navigation.showPage('dashboard'); // Go to dashboard after closing
    });

    summaryReportsBtn?.addEventListener('click', () => {
      sessionSummaryModal?.classList.add('hidden');
      navigation.showPage('reports'); // Go to reports page
    });
  }

  /**
   * Refreshes UI elements that depend on state (e.g., after login).
   */
  function refresh(): void {
    applyTheme();
    renderWelcome();
    renderSettings();
  }

  // --- PUBLIC API ---
  return {
    initialize(): void {
      cacheElements();
      attachListeners();
      refresh(); // Run all render functions on init
      console.log('UI Manager initialized');
    },
    refresh,
    showAlert,
    showSessionSummary
  };
})();
