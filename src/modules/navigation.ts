// src/modules/navigation.ts
import { stateManager } from './state';
import type { Book, Section } from './types';

export const navigation = (() => {
  // --- CACHE DOM ELEMENTS ---
  let pages: NodeListOf<HTMLElement>;
  let navButtons: NodeListOf<HTMLButtonElement>;
  
  // Dashboard
  let dashboardStartStudyBtn: HTMLButtonElement | null;

  // Study Setup
  let bookSelectStudy: HTMLSelectElement | null;
  let sectionSelectStudy: HTMLSelectElement | null;

  // Quiz Setup
  let bookSelectQuiz: HTMLSelectElement | null;
  let sectionSelectQuiz: HTMLSelectElement | null;

  /**
   * Caches all required DOM elements.
   */
  function cacheElements() {
    pages = document.querySelectorAll('.page');
    navButtons = document.querySelectorAll('.nav-btn');
    
    dashboardStartStudyBtn = document.getElementById('dashboard-start-study-btn') as HTMLButtonElement | null;

    bookSelectStudy = document.getElementById('book-select-study') as HTMLSelectElement | null;
    sectionSelectStudy = document.getElementById('section-select-study') as HTMLSelectElement | null;
    
    bookSelectQuiz = document.getElementById('book-select-quiz') as HTMLSelectElement | null;
    sectionSelectQuiz = document.getElementById('section-select-quiz') as HTMLSelectElement | null;
  }

  /**
   * Updates the active state of nav buttons based on the current page.
   * This is smarter to handle session pages.
   */
  function updateNavButtons(pageId: string) {
    const { quiz } = stateManager.getState();
    let activePage = pageId;

    // If we're on the session page, highlight the button for the mode we're in
    if (pageId === 'session') {
      if (quiz.mode === 'study') activePage = 'study';
      if (quiz.mode === 'quiz') activePage = 'quiz-setup';
      if (quiz.mode === 'assessment') activePage = 'self-assessment';
    }

    navButtons.forEach((btn) => {
      const isTarget = btn.dataset.page === activePage;
      btn.classList.toggle('border-red-seal', isTarget); // Active state
      btn.classList.toggle('border-transparent', !isTarget); // Inactive state
    });
  }

  /**
   * Shows a specific page by ID and hides all others.
   */
  function showPage(pageId: string): void {
    pages.forEach((p) => {
      p.classList.toggle('hidden', p.id !== `${pageId}-page`);
    });
    updateNavButtons(pageId);
    stateManager.update('ui', { currentPage: pageId });
  }

  /**
   * Populates all book selector dropdowns.
   */
  function populateBookSelectors(): void {
    const { APP_DATA, settings } = stateManager.getState();
    const lang = settings.language;
    const selectors = [bookSelectStudy, bookSelectQuiz];

    selectors.forEach(selector => {
      if (!selector) return;
      selector.innerHTML = ''; // Clear existing options
      APP_DATA.books.forEach(book => {
        const option = document.createElement('option');
        option.value = book.id;
        option.textContent = book.title[lang] || book.title.en;
        selector.appendChild(option);
      });
    });
    // After populating books, populate the sections for the default selected book
    populateSectionSelector('study');
    populateSectionSelector('quiz');
  }

  /**
   * Populates the section selector for a specific mode (study or quiz).
   */
  function populateSectionSelector(mode: 'study' | 'quiz'): void {
    const { APP_DATA, settings, completedSections } = stateManager.getState();
    const lang = settings.language;
    
    let bookSelector: HTMLSelectElement | null;
    let sectionSelector: HTMLSelectElement | null;
    let sectionFilter: (s: Section) => boolean;

    if (mode === 'study') {
      bookSelector = bookSelectStudy;
      sectionSelector = sectionSelectStudy;
      // Study sections DO NOT start with 'qz'
      sectionFilter = (s: Section) => !s.id.startsWith('qz');
    } else { // 'quiz'
      bookSelector = bookSelectQuiz;
      sectionSelector = sectionSelectQuiz;
      // Quiz sections DO start with 'qz'
      sectionFilter = (s: Section) => s.id.startsWith('qz');
    }

    if (!bookSelector || !sectionSelector) return;

    const bookId = bookSelector.value;
    const book = APP_DATA.books.find(b => b.id === bookId);
    
    sectionSelector.innerHTML = ''; // Clear existing options
    if (!book?.sections) return;

    book.sections.filter(sectionFilter).forEach(section => {
      const option = document.createElement('option');
      option.value = section.id;
      const isCompleted = completedSections.includes(`${bookId}_${section.id}`);
      option.textContent = (section.title[lang] || section.title.en) + (isCompleted ? ' ✅' : '');
      if (isCompleted) {
        option.classList.add('font-bold', 'text-green-600');
      }
      sectionSelector.appendChild(option);
    });
  }

  /**
   * Attaches all event listeners for navigation.
   */
  function attachListeners() {
    // Main nav buttons
    navButtons.forEach((button) => {
      const target = button.dataset.page;
      if (target) {
        button.addEventListener('click', () => showPage(target));
      }
    });

    // Dashboard button
    if (dashboardStartStudyBtn) {
      dashboardStartStudyBtn.addEventListener('click', () => showPage('study'));
    }

    // Book selectors update section selectors
    if (bookSelectStudy) {
      bookSelectStudy.addEventListener('change', () => populateSectionSelector('study'));
    }
    if (bookSelectQuiz) {
      bookSelectQuiz.addEventListener('change', () => populateSectionSelector('quiz'));
    }
  }

  return {
    initialize(): void {
      cacheElements();
      attachListeners();
      populateBookSelectors();
      
      // Show the initial page
      const current = stateManager.getState().ui.currentPage || 'dashboard';
      showPage(current);

      console.log('Navigation manager initialized.');
    },
    showPage,
    // Expose this so other modules (like quizManager) can refresh lists
    populateBookSelectors,
    populateSectionSelector,
  };
})();
