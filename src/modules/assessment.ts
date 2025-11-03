// src/modules/assessment.ts
import { stateManager } from './state';
import { quizManager } from './quiz';
import { uiManager } from './ui';
import type { AssessmentLog } from './types';

export const assessmentManager = (() => {
  // --- CACHED DOM ELEMENTS ---
  let generateNewAssessmentBtn: HTMLButtonElement | null = null;
  let assessmentList: HTMLElement | null = null;

  /**
   * Caches all DOM elements for the assessment page.
   */
  function cacheElements() {
    generateNewAssessmentBtn = document.getElementById('generate-new-assessment-btn') as HTMLButtonElement | null;
    assessmentList = document.getElementById('assessment-list');
  }

  /**
   * Renders the list of past and in-progress assessments.
   * This is called by the navigation manager when the page is shown.
   */
  function renderSelfAssessmentPage() {
    if (!assessmentList) return;

    const { assessmentLogs } = stateManager.getState();
    
    if (assessmentLogs.length === 0) {
      assessmentList.innerHTML = `<p class="text-gray-500 text-center p-4">You have not generated any self-assessments yet.</p>`;
      return;
    }

    // Show newest first
    assessmentList.innerHTML = [...assessmentLogs].reverse().map(log => {
      const isCompleted = log.status === 'completed';
      let statsHTML = '', resultText = '', timeSpentText = '', actionButtonHTML = '';
      let cardClass = 'card p-4 rounded-lg flex flex-wrap justify-between items-center gap-y-2';

      if (isCompleted) {
        const correct = log.sessionLog.filter(i => i.isCorrect).length;
        const total = log.sessionLog.length;
        const score = total > 0 ? Math.round((correct / total) * 100) : 0;
        const passed = score >= 70;
        
        cardClass += passed ? ' bg-green-50 dark:bg-green-900/50' : ' bg-red-50 dark:bg-red-900/50';
        statsHTML = `<div class="font-semibold text-lg ${passed ? 'text-green-600' : 'text-red-600'}">${score}%</div><div class="text-xs">${correct} Correct / ${total - correct} Incorrect</div>`;
        resultText = `<div class="font-bold text-sm ${passed ? 'text-green-600' : 'text-red-600'}">${passed ? 'Pass' : 'Fail'}</div>`;

        if (log.startDate && log.endDate) {
          const duration = new Date(log.endDate).getTime() - new Date(log.startDate).getTime();
          const minutes = Math.floor((duration / (1000 * 60)) % 60);
          const hours = Math.floor(duration / (1000 * 60 * 60));
          timeSpentText = `<p class="text-xs text-gray-500 mt-1">Time: ${hours > 0 ? hours+'h ' : ''}${minutes}m</p>`;
        }
        actionButtonHTML = `<button data-id="${log.id}" class="review-assessment-btn btn-secondary w-24">Review</button>`;
      
      } else { // In Progress
        statsHTML = `<div class="text-sm font-semibold text-amber-600">In Progress</div>`;
        resultText = `<div class="text-sm font-semibold text-amber-600">${log.sessionLog.length} / ${log.questions.length} answered</div>`;
        actionButtonHTML = `<button data-id="${log.id}" class="resume-assessment-btn btn-primary w-24">Resume</button>`;
      }
      
      return `
        <div class="${cardClass}">
          <div class="flex-grow">
            <p class="font-bold">Assessment from ${new Date(log.startDate).toLocaleString()}</p>
            <div class="flex items-center gap-4">
              <p class="text-xs text-gray-500">${log.questions.length} questions</p>${timeSpentText}
            </div>
          </div>
          <div class="text-center w-32 px-2">${resultText}</div>
          <div class="text-right w-32">${statsHTML}</div>
          <div class="flex items-center gap-2 pl-4">
            ${actionButtonHTML}
            <button data-id="${log.id}" class="delete-assessment-btn p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900 text-gray-400 hover:text-red-600" title="Delete Assessment">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        </div>`;
    }).join('');
  }

  /**
   * Handles a click on the "Delete" button.
   */
  async function handleDeleteAssessment(assessmentId: string) {
    const confirmed = await uiManager.showConfirm("Are you sure you want to delete this assessment? This action cannot be undone.");
    if (confirmed) {
      const { assessmentLogs } = stateManager.getState();
      const newLogs = assessmentLogs.filter(log => log.id !== assessmentId);
      stateManager.update('assessmentLogs', newLogs);
      renderSelfAssessmentPage(); // Re-render the list
    }
  }

  /**
   * Attaches all event listeners for the assessment page.
   */
  function attachListeners() {
    generateNewAssessmentBtn?.addEventListener('click', () => {
      quizManager.startNewAssessment();
    });

    // Use event delegation for the dynamic list
    assessmentList?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      const reviewBtn = target.closest<HTMLButtonElement>('.review-assessment-btn');
      if (reviewBtn) {
        const { assessmentLogs } = stateManager.getState();
        const log = assessmentLogs.find(a => a.id === reviewBtn.dataset.id);
        if (log) uiManager.showSessionSummary(log.sessionLog, 'assessment');
        return;
      }

      const resumeBtn = target.closest<HTMLButtonElement>('.resume-assessment-btn');
      if (resumeBtn) {
        quizManager.resumeAssessment(resumeBtn.dataset.id as string);
        return;
      }

      const deleteBtn = target.closest<HTMLButtonElement>('.delete-assessment-btn');
      if (deleteBtn) {
        handleDeleteAssessment(deleteBtn.dataset.id as string);
        return;
      }
    });
  }

  // --- PUBLIC API ---
  return {
    initialize() {
      cacheElements();
      attachListeners();
      console.log('Assessment Manager initialized');
    },
    /**
     * Renders the list of assessments.
     * This is called by navigation.ts when the page is shown.
     */
    renderSelfAssessmentPage
  };
})();
