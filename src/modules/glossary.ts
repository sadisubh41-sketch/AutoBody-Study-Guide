// src/modules/glossary.ts
import { stateManager } from './state';
import type { GlossaryItem } from './types';

export const glossaryManager = (() => {
  // --- MODULE STATE ---
  let glossaryTermRegex: RegExp | null = null;
  let currentPopupTermData: GlossaryItem | null = null;

  // --- CACHED DOM ELEMENTS ---
  let glossaryNavBtn: HTMLButtonElement | null = null;
  let glossaryModal: HTMLElement | null = null;
  let glossaryCloseBtn: HTMLButtonElement | null = null;
  let searchInput: HTMLInputElement | null = null;
  let alphabetFilter: HTMLElement | null = null;
  let glossaryList: HTMLElement | null = null;
  let termPopup: HTMLElement | null = null;

  /**
   * Caches all DOM elements needed for the glossary.
   */
  function cacheElements() {
    glossaryNavBtn = document.getElementById('glossary-nav-btn') as HTMLButtonElement | null;
    glossaryModal = document.getElementById('glossary-modal');
    glossaryCloseBtn = document.getElementById('glossary-close-btn') as HTMLButtonElement | null;
    searchInput = document.getElementById('glossary-search-input') as HTMLInputElement | null;
    alphabetFilter = document.getElementById('glossary-alphabet-filter');
    glossaryList = document.getElementById('glossary-list-modal');
    termPopup = document.getElementById('term-popup');
  }

  /**
   * Opens the glossary modal.
   */
  function openModal() {
    renderGlossary(); // Render with default (all)
    if (glossaryModal) glossaryModal.classList.remove('hidden');
  }

  /**
   * Closes the glossary modal.
   */
  function closeModal() {
    if (glossaryModal) glossaryModal.classList.add('hidden');
  }

  /**
   * Renders the list of glossary terms based on a filter.
   */
  function renderGlossary(filter = '', type: 'search' | 'letter' = 'search') {
    const { APP_DATA, settings } = stateManager.getState();
    const { glossary: GLOSSARY_TERMS } = APP_DATA;
    if (!glossaryList || !GLOSSARY_TERMS) return;
    
    const lang = settings.language;
    let filteredTerms: GlossaryItem[] = [];

    if (type === 'letter') {
      filteredTerms = GLOSSARY_TERMS.filter(term => 
        (term.term.charAt(0) || '').toUpperCase() === filter.toUpperCase()
      );
    } else if (filter) {
      const lowerCaseFilter = filter.toLowerCase();
      filteredTerms = GLOSSARY_TERMS.filter(term => 
        term.term.toLowerCase().includes(lowerCaseFilter) ||
        term.definition.toLowerCase().includes(lowerCaseFilter)
      );
    } else {
      filteredTerms = GLOSSARY_TERMS;
    }

    // Sort terms alphabetically
    filteredTerms.sort((a, b) => a.term.localeCompare(b.term));

    glossaryList.innerHTML = filteredTerms.length > 0
      ? filteredTerms.map(term => `
          <div class="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <h4 class="font-bold text-lg text-red-seal">${term.term}</h4>
            <p class="text-sm mt-1">${term.definition}</p>
          </div>`).join('')
      : '<p class="text-center text-gray-500">No terms found.</p>';
  }

  /**
   * Generates the A-Z filter buttons.
   */
  function renderAlphabetFilter() {
    if (!alphabetFilter) return;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    alphabet.forEach(letter => {
      const button = document.createElement('button');
      button.textContent = letter;
      button.className = "p-1 px-3 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700";
      button.addEventListener('click', (e) => {
        document.querySelectorAll('#glossary-alphabet-filter button').forEach(b => b.classList.remove('active', 'bg-red-seal', 'text-white'));
        (e.currentTarget as HTMLElement).classList.add('active', 'bg-red-seal', 'text-white');
        renderGlossary(letter, 'letter');
      });
      alphabetFilter.appendChild(button);
    });
  }

  /**
   * Creates a regex from all glossary terms for highlighting.
   */
  function prepareGlossaryHighlighter() {
    const { glossary: GLOSSARY_TERMS } = stateManager.getState().APP_DATA;
    if (!GLOSSARY_TERMS || GLOSSARY_TERMS.length === 0) return;

    // Sort by length DESC to match longest terms first (e.g., "Air Bag" before "Air")
    const sortedTerms = [...GLOSSARY_TERMS].sort((a, b) => b.term.length - a.term.length);
    
    const allTermPatterns = sortedTerms.map(term => {
      // Escape special regex characters
      return term.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).filter(Boolean);

    if (allTermPatterns.length > 0) {
      glossaryTermRegex = new RegExp(`\\b(${allTermPatterns.join('|')})\\b`, 'gi');
    }
  }

  /**
   * Wraps matching terms in text with a span for highlighting.
   * This is called by quiz.ts.
   */
  function highlightTermsInText(text: string): string {
    if (!glossaryTermRegex || !text) return text;

    const { glossary: GLOSSARY_TERMS } = stateManager.getState().APP_DATA;
    const termMap = GLOSSARY_TERMS.reduce((acc, term) => {
      acc[term.term.toLowerCase()] = term;
      return acc;
    }, {} as Record<string, GlossaryItem>);

    return text.replace(glossaryTermRegex, (match) => {
      const termData = termMap[match.toLowerCase()];
      if (termData) {
        return `<span class="glossary-term-highlight" data-term="${termData.term}">${match}</span>`;
      }
      return match;
    });
  }

  /**
   * Renders the content for the term pop-up.
   */
  function renderPopupContent(term: string) {
    const { glossary: GLOSSARY_TERMS } = stateManager.getState().APP_DATA;
    currentPopupTermData = GLOSSARY_TERMS.find(t => t.term === term) || null;
    
    if (!termPopup || !currentPopupTermData) return;

    termPopup.innerHTML = `
      <h4 class="font-bold text-lg text-red-seal mb-2">${currentPopupTermData.term}</h4>
      <p class="text-sm">${currentPopupTermData.definition}</p>
    `;
  }

  /**
   * Shows the term pop-up when a highlighted term is clicked.
   */
  function showTermPopup(event: MouseEvent) {
    const target = (event.target as HTMLElement).closest('.glossary-term-highlight');

    if (!target || !termPopup) {
      // If clicking outside the popup, hide it
      if (termPopup && !termPopup.contains(event.target as Node)) {
        termPopup.classList.add('hidden');
        currentPopupTermData = null;
      }
      return;
    }

    const term = (target as HTMLElement).dataset.term;
    if (!term) return;

    renderPopupContent(term);

    const rect = target.getBoundingClientRect();
    termPopup.style.top = `${window.scrollY + rect.bottom + 5}px`;
    let leftPosition = window.scrollX + rect.left;
    if (leftPosition + 350 > window.innerWidth) { // 350px is popup width
      leftPosition = window.scrollX + rect.right - 350;
    }
    termPopup.style.left = `${Math.max(0, leftPosition)}px`;
    termPopup.classList.remove('hidden');
  }

  /**
   * Attaches all event listeners.
   */
  function attachListeners() {
    glossaryNavBtn?.addEventListener('click', openModal);
    glossaryCloseBtn?.addEventListener('click', closeModal);
    searchInput?.addEventListener('input', (e) => {
      renderGlossary((e.target as HTMLInputElement).value, 'search');
    });

    // Listen for clicks globally to show the term popup
    document.addEventListener('click', showTermPopup);
  }

  // --- PUBLIC API ---
  return {
    initialize() {
      cacheElements();
      attachListeners();
      renderAlphabetFilter();
      prepareGlossaryHighlighter();
      console.log('Glossary Manager initialized');
    },
    // Expose this function for the quizManager to use
    highlightTermsInText
  };
})();
