// src/modules/review.ts
import { stateManager } from './state';
import { glossaryManager } from './glossary';
import type { Question } from './types';

export const reviewManager = (() => {
  // --- CACHED DOM ELEMENTS ---
  let reviewSearch: HTMLInputElement | null = null;
  let reviewFlaggedOnly: HTMLInputElement | null = null;
  let reviewList: HTMLElement | null = null;
  let reviewFilterStatus: HTMLSelectElement | null = null;
  let reviewFilterBook: HTMLSelectElement | null = null;
  let reviewFilterMwa: HTMLSelectElement | null = null;
  let resetFiltersBtn: HTMLButtonElement | null = null;

  /**
   * Caches all DOM elements for the review page.
   */
  function cacheElements() {
    reviewSearch = document.getElementById('review-search') as HTMLInputElement;
    reviewFlaggedOnly = document.getElementById('review-flagged-only') as HTMLInputElement;
    reviewList = document.getElementById('review-list');
    reviewFilterStatus = document.getElementById('review-filter-status') as HTMLSelectElement;
    reviewFilterBook = document.getElementById('review-filter-book') as HTMLSelectElement;
    reviewFilterMwa = document.getElementById('review-filter-mwa') as HTMLSelectElement;
    resetFiltersBtn = document.getElementById('reset-filters-btn') as HTMLButtonElement;
  }

  /**
   * Populates the filter dropdowns with books and MWA categories.
   */
  function populateFilters() {
    const { settings, APP_DATA } = stateManager.getState();
    const { books: ALL_BOOKS_DATA, codebook: CODEBOOK } = APP_DATA;

    // Populate Books
    if (reviewFilterBook) { // <-- ADDED NULL CHECK
      reviewFilterBook.innerHTML = '<option value="all">All Books</option>';
      ALL_BOOKS_DATA.forEach(book => {
        const option = document.createElement('option');
        option.value = book.id;
        option.textContent = book.title[settings.language] || book.title.en;
        reviewFilterBook.appendChild(option);
      });
    }

    // Populate MWA
    if (reviewFilterMwa) { // <-- ADDED NULL CHECK
      reviewFilterMwa.innerHTML = '<option value="all">All Categories</option>';
      Object.entries(CODEBOOK.mwa).forEach(([key, value]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `${key}: ${(value as any)[settings.language] || (value as any).en}`;
        reviewFilterMwa.appendChild(option);
      });
    }
  }

  /**
   * Renders the list of reviewable questions based on current filters.
   */
  function renderReviewPage() {
    const { settings, progress, flaggedQuestions, APP_DATA } = stateManager.getState();
    const { books: ALL_BOOKS_DATA, codebook: CODEBOOK } = APP_DATA;
    const lang = settings.language;

    // ADDED NULL CHECKS for all filter elements
    const searchTerm = reviewSearch?.value.toLowerCase() || '';
    const flaggedOnly = reviewFlaggedOnly?.checked || false;
    const statusFilter = reviewFilterStatus?.value || 'all';
    const bookFilter = reviewFilterBook?.value || 'all';
    const mwaFilter = reviewFilterMwa?.value || 'all';

    const attemptedUIDs = Object.keys(progress).filter(uid => {
      const modes = Object.keys(progress[uid].modes || {});
      return modes.some(m => m !== 'assessment');
    });

    const allQuestions = ALL_BOOKS_DATA.flatMap(b => b.sections.flatMap(s => s.questions));

    const questionsToReview = allQuestions
      .filter(q => attemptedUIDs.includes(q.uid))
      .filter(q => !flaggedOnly || flaggedQuestions.includes(q.uid))
      .filter(q => 
        !searchTerm || 
        q.question.en.toLowerCase().includes(searchTerm) || 
        (q.question.ar && q.question.ar.includes(searchTerm)) || 
        q.uid.toLowerCase().includes(searchTerm)
      )
      .filter(q => {
        if (statusFilter === 'all') return true;
        const prog = progress[q.uid];
        const correct = (prog.modes.study?.correct || 0) + (prog.modes.quiz?.correct || 0);
        const incorrect = (prog.modes.study?.incorrect || 0) + (prog.modes.quiz?.incorrect || 0);
        return statusFilter === 'correct' ? correct > incorrect : incorrect >= correct;
      })
      .filter(q => {
        if (bookFilter === 'all') return true;
        const book = ALL_BOOKS_DATA.find(b => q.uid.startsWith(`B${b.id.replace('book','')}`));
        return book?.id === bookFilter;
      })
      .filter(q => mwaFilter === 'all' || q.classification.mwa === mwaFilter);

    if (questionsToReview.length > 0) {
      if (!reviewList) return; // <-- ADDED NULL CHECK
      reviewList.innerHTML = questionsToReview.map(q => {
        const prog = progress[q.uid];
        const correct = (prog.modes.study?.correct || 0) + (prog.modes.quiz?.correct || 0);
        const incorrect = (prog.modes.study?.incorrect || 0) + (prog.modes.quiz?.incorrect || 0);
        const isCorrect = correct > incorrect;
        const statusIcon = isCorrect ? '✅' : '❌';
        const isFlagged = flaggedQuestions.includes(q.uid);
        
        const book = ALL_BOOKS_DATA.find(b => q.uid.startsWith(`B${b.id.replace('book','')}`));
        const section = book?.sections.find(s => s.questions.some(qu => qu.uid === q.uid));
        const bookText = book?.title[lang] || book?.title.en;
        const sectionText = section?.title[lang] || section?.title.en;
        const mwaText = CODEBOOK.mwa[q.classification.mwa]?.[lang] || CODEBOOK.mwa[q.classification.mwa]?.en || '';
        const taskText = CODEBOOK.tasks[q.classification.task]?.[lang] || CODEBOOK.tasks[q.classification.task]?.en || '';
        const modesAttempted = Object.keys(prog.modes || {}).filter(m => m !== 'assessment').map(m => `<span class="mode-tag mode-${m}">${m}</span>`).join(' ');

        return `
          <details class="border-b border-[var(--border-color)]">
            <summary class="p-4 cursor-pointer grid grid-cols-12 gap-4 items-center">
              <div class="col-span-1 text-center">${isFlagged ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" class="text-red-seal inline-block"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>' : ''}</div>
              <div class="col-span-8">
                <p class="font-semibold text-sm truncate">${glossaryManager.highlightTerms(q.question[lang] || q.question.en, lang)}</p>
                <div class="text-xs text-gray-500 mt-1 space-y-0.5">
                  <div><strong>Book:</strong> ${bookText} &bull; <strong>Subject:</strong> ${sectionText}</div>
                  <div><strong>Category:</strong> ${q.classification.mwa} - ${mwaText}</div>
                  <div><strong>Task:</strong> ${q.classification.task} - ${taskText}</div>
                </div>
              </div>
              <div class="col-span-2 text-xs truncate">${modesAttempted}</div>
              <div class="col-span-1 text-xl text-right">${statusIcon}</div>
            </summary>
            <div class="p-4 bg-gray-50 dark:bg-slate-800 border-t border-[var(--border-color)]">
              <p class="text-xs text-gray-500 mb-4"><strong>UID:</strong> ${q.uid}</p>
              <p class="font-bold mb-2">Correct Answer:</p>
              <p class="mb-4">${String.fromCharCode(65 + q.correctAnswerIndex)}. ${glossaryManager.highlightTerms(q.choices[q.correctAnswerIndex].en, 'en')}</p>
              <p class="rtl font-bold mb-2">:الإجابة الصحيحة</p>
              <p class="rtl mb-4">${glossaryManager.highlightTerms(q.choices[q.correctAnswerIndex].ar, 'ar')}</p>
              <hr class="my-4 border-[var(--border-color)]">
              <p class="font-bold mb-2">Explanation:</p>
              <p>${glossaryManager.highlightTerms(q.explanation.en, 'en')}</p>
              <p class="rtl font-bold mt-4 mb-2">:الشرح</p>
              <p class="rtl">${glossaryManager.highlightTerms(q.explanation.ar, 'ar')}</p>
            </div>
          </details>`;
      }).join('');
    } else {
      if (!reviewList) return; // <-- ADDED NULL CHECK
      reviewList.innerHTML = `<p class="text-gray-500 text-center p-4">No questions match your current filters.</p>`;
    }
  }

  /**
   * Resets all filters to their default values and re-renders the list.
   */
  function resetFilters() {
    if (reviewSearch) reviewSearch.value = ''; // <-- ADDED NULL CHECK
    if (reviewFlaggedOnly) reviewFlaggedOnly.checked = false; // <-- ADDED NULL CHECK
    if (reviewFilterStatus) reviewFilterStatus.value = 'all'; // <-- ADDED NULL CHECK
    if (reviewFilterBook) reviewFilterBook.value = 'all'; // <-- ADDED NULL CHECK
    if (reviewFilterMwa) reviewFilterMwa.value = 'all'; // <-- ADDED NULL CHECK
    renderReviewPage();
  }

  // --- PUBLIC API ---
  return {
    initialize() {
      cacheElements();
      populateFilters();
      
      // Attach listeners
      [reviewSearch, reviewFlaggedOnly, reviewFilterStatus, reviewFilterBook, reviewFilterMwa].forEach(el => {
        el?.addEventListener('input', renderReviewPage);
      });
      resetFiltersBtn?.addEventListener('click', resetFilters);
      
      console.log('Review Manager initialized');
    },
    /**
     * Public method to render the review page, called by navigation.ts.
     */
    renderReviewPage,
  };
})();

