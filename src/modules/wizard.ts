// src/modules/wizard.ts
import { stateManager } from './state';
import { uiManager } from './ui';
import type { AppData, Book } from './types';

export const wizardManager = (() => {
  // --- MODULE STATE ---
  let wizardState = {
    currentStep: 1,
    newBookData: null as Book | null,
    newBookFileName: null as string | null,
  };

  // --- CACHED DOM ELEMENTS ---
  let openWizardBtn: HTMLButtonElement | null = null;
  let addBookModal: HTMLElement | null = null;
  let closeWizardBtn: HTMLButtonElement | null = null;
  let wizardStepIndicators: NodeListOf<HTMLElement>;
  let wizardStepContents: NodeListOf<HTMLElement>;
  let newBookFileInput: HTMLInputElement | null = null;
  let wizardValidationResults: HTMLElement | null = null;
  let generateManifestBtn: HTMLButtonElement | null = null;
  let wizardNextBtn: HTMLButtonElement | null = null;

  /**
   * Caches all DOM elements for the wizard modal.
   */
  function cacheElements() {
    openWizardBtn = document.getElementById('add-book-wizard-btn') as HTMLButtonElement | null;
    addBookModal = document.getElementById('add-book-modal');
    closeWizardBtn = document.getElementById('close-wizard-btn') as HTMLButtonElement | null;
    wizardStepIndicators = document.querySelectorAll('.wizard-step-indicator');
    wizardStepContents = document.querySelectorAll('.wizard-step-content');
    newBookFileInput = document.getElementById('new-book-file-input') as HTMLInputElement | null;
    wizardValidationResults = document.getElementById('wizard-validation-results');
    generateManifestBtn = document.getElementById('generate-manifest-btn') as HTMLButtonElement | null;
    wizardNextBtn = document.getElementById('wizard-next-btn') as HTMLButtonElement | null;
  }

  /**
   * Opens and resets the wizard modal.
   */
  function openWizard() {
    wizardState = { currentStep: 1, newBookData: null, newBookFileName: null };
    if (newBookFileInput) newBookFileInput.value = '';
    updateWizardUI(1);
    addBookModal?.classList.remove('hidden');
  }

  /**
   * Closes the wizard modal.
   */
  function closeWizard() {
    addBookModal?.classList.add('hidden');
  }

  /**
   * Updates the UI to show the correct step.
   */
  function updateWizardUI(step: number) {
    wizardState.currentStep = step;
    if (wizardNextBtn) wizardNextBtn.disabled = true;

    wizardStepIndicators.forEach((indicator, index) => {
      const span = indicator.querySelector('span');
      if (!span) return;
      indicator.classList.remove('active');
      span.classList.remove('bg-red-seal', 'text-white');
      span.classList.add('bg-gray-100', 'dark:bg-gray-700');
      if ((index + 1) < step) {
        indicator.classList.add('active'); // Completed step
      } else if ((index + 1) === step) {
        span.classList.remove('bg-gray-100', 'dark:bg-gray-700');
        span.classList.add('bg-red-seal', 'text-white'); // Active step
      }
    });

    wizardStepContents.forEach(content => {
      content.classList.toggle('hidden', parseInt(content.id.split('-')[2]) !== step);
    });

    if (step === 1 && wizardState.newBookData && wizardNextBtn) {
      wizardNextBtn.disabled = false;
    }
    if (step === 2 && wizardNextBtn) wizardNextBtn.textContent = 'Next Step';
    if (step === 3) wizardNextBtn?.classList.add('hidden');
    else wizardNextBtn?.classList.remove('hidden');
  }

  /**
   * Handles the file upload event.
   */
  function handleFileUpload(event: Event) {
    const file = (event.target as HTMLInputElement)?.files?.[0];
    if (!file) return;

    wizardState.newBookFileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        wizardState.newBookData = JSON.parse(e.target?.result as string) as Book;
        if (wizardNextBtn) wizardNextBtn.disabled = false;
      } catch (err) {
        uiManager.showAlert(`Error parsing JSON file: ${(err as Error).message}`);
        wizardState.newBookData = null;
        if (wizardNextBtn) wizardNextBtn.disabled = true;
      }
    };
    reader.readAsText(file);
  }

  /**
   * Validates the structure of the uploaded book file.
   */
  function validateNewBook() {
    const { APP_DATA } = stateManager.getState();
    const data = wizardState.newBookData;
    let errors: string[] = [], warnings: string[] = [];

    const ok = (msg: string) => `<div class="text-green-600 dark:text-green-400 text-sm p-1">✅ ${msg}</div>`;
    const err = (msg: string) => { errors.push(msg); return `<div class="text-red-600 dark:text-red-400 text-sm p-1">❌ ${msg}</div>`; };
    const warn = (msg: string) => { warnings.push(msg); return `<div class="text-amber-600 dark:text-amber-400 text-sm p-1">⚠️ ${msg}</div>`; };

    let resultsHTML = '';

    if (data && typeof data === 'object') {
      resultsHTML += ok('File is a valid JSON object.');
      if (data.id) resultsHTML += ok(`Book ID found: ${data.id}`); else resultsHTML += err('Book "id" is missing.');
      
      // Check for file name conflict in manifest
      const fileInManifest = APP_DATA.manifest.files.includes(wizardState.newBookFileName || '');
      if (fileInManifest) {
        resultsHTML += warn(`A file named "${wizardState.newBookFileName}" is already in the manifest.`);
      }

      if (data.title && data.title.en) resultsHTML += ok('Book title found.'); else resultsHTML += err('Book "title" with "en" is missing.');
      if (Array.isArray(data.sections)) resultsHTML += ok('Book "sections" array found.'); else resultsHTML += err('Book "sections" is not an array.');
    
    } else {
      resultsHTML += err('Uploaded file is not a valid JSON object.');
      if (wizardValidationResults) wizardValidationResults.innerHTML = resultsHTML;
      return;
    }

    let totalQuestions = 0;
    if (Array.isArray(data.sections)) {
      data.sections.forEach((section, sIdx) => {
        if (!section.id) resultsHTML += err(`Section ${sIdx + 1} is missing an "id".`);
        if (!section.title?.en) resultsHTML += err(`Section ${sIdx + 1} is missing a title.`);
        if (!Array.isArray(section.questions)) resultsHTML += err(`Section ${sIdx + 1} is missing a "questions" array.`);
        else {
          section.questions.forEach((q, qIdx) => {
            totalQuestions++;
            if (!q.uid) resultsHTML += err(`Question ${qIdx + 1} in Section ${sIdx + 1} is missing a "uid".`);
          });
        }
      });
      resultsHTML += ok(`Checked ${data.sections.length} sections and ${totalQuestions} questions.`);
    }

    let summary = `<div class="p-2 border-b border-gray-200 dark:border-gray-700 mb-2">`;
    if (errors.length === 0) {
      summary += `<p class="font-bold text-green-600 dark:text-green-400">Validation Passed!</p>`;
      if (wizardNextBtn) wizardNextBtn.disabled = false;
    } else {
      summary += `<p class="font-bold text-red-600 dark:text-red-400">Validation Failed with ${errors.length} error(s).</p>`;
    }
    summary += `<p class="text-xs text-gray-500">${warnings.length} warning(s) found.</p></div>`;
    
    if (wizardValidationResults) wizardValidationResults.innerHTML = summary + resultsHTML;
  }

  /**
   * Generates and downloads an updated data.json manifest.
   */
  function generateNewManifest() {
    const { manifest } = stateManager.getState().APP_DATA;
    const newManifest = structuredClone(manifest);
    
    if (wizardState.newBookFileName && !newManifest.files.includes(wizardState.newBookFileName)) {
      newManifest.files.push(wizardState.newBookFileName);
    }
    
    const manifestString = JSON.stringify(newManifest, null, 2);
    const blob = new Blob([manifestString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.json'; // The file from /public/data/index.json
    a.textContent = 'Download updated index.json';
    a.className = 'btn-secondary w-full text-center block';
    
    const downloadArea = document.getElementById('wizard-download-area');
    if (downloadArea) {
      downloadArea.innerHTML = '';
      downloadArea.appendChild(a);
    }
    
    a.click(); // Start download
    
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Advances the wizard to the next step.
   */
  function advanceWizard() {
    if (wizardState.currentStep === 1) {
      updateWizardUI(2);
      validateNewBook();
    } else if (wizardState.currentStep === 2) {
      updateWizardUI(3);
    }
  }

  /**
   * Attaches all event listeners.
   */
  function attachListeners() {
    openWizardBtn?.addEventListener('click', openWizard);
    closeWizardBtn?.addEventListener('click', closeWizard);
    newBookFileInput?.addEventListener('change', handleFileUpload);
    wizardNextBtn?.addEventListener('click', advanceWizard);
    generateManifestBtn?.addEventListener('click', generateNewManifest);
  }

  // --- PUBLIC API ---
  return {
    initialize() {
      const { user } = stateManager.getState();
      // Only initialize for admin users
      if (user.role !== 'admin') {
        openWizardBtn = document.getElementById('add-book-wizard-btn') as HTMLButtonElement | null;
        if(openWizardBtn) openWizardBtn.classList.add('hidden'); // Hide button if not admin
        return;
      }
      
      cacheElements();
      attachListeners();
      console.log('Wizard Manager initialized (admin only)');
    }
  };
})();
