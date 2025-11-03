// src/modules/dashboard.ts
// @ts-nocheck - We are using a global Chart object from the CDN

import { stateManager } from './state';
import { navigation } from './navigation';
import { quizManager } from './quiz';
import { uiManager } from './ui';
import type { AssessmentLog, SessionLogItem, SessionHistoryItem } from './types';

// Inform TypeScript that Chart.js is loaded globally via CDN
declare const Chart: any;

export const dashboardManager = (() => {
  // --- CACHED DOM ELEMENTS ---
  let overallProgressDashboard: HTMLElement | null = null;
  let quickAccessContent: HTMLElement | null = null;
  let studyTip: HTMLElement | null = null;
  let recentActivityLog: HTMLElement | null = null;
  let dashboardMwaChartCanvas: HTMLCanvasElement | null = null;

  // --- MODULE STATE ---
  let dashboardMwaChart: any | null = null; // To store the Chart.js instance

  /**
   * Caches all DOM elements needed for the dashboard.
   */
  function cacheElements() {
    overallProgressDashboard = document.getElementById('overall-progress-dashboard');
    quickAccessContent = document.getElementById('quick-access-content');
    studyTip = document.getElementById('study-tip');
    recentActivityLog = document.getElementById('recent-activity-log');
    dashboardMwaChartCanvas = document.getElementById('dashboard-mwa-chart') as HTMLCanvasElement | null;
  }

  /**
   * Attaches event listeners for dashboard interactive elements.
   */
  function attachListeners() {
    // Listen for clicks on dynamically added buttons
    quickAccessContent?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>('.nav-btn');
      if (button && button.dataset.page) {
        navigation.showPage(button.dataset.page);
      }
    });

    recentActivityLog?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest<HTMLElement>('.recent-activity-item');
      if (!item) return;

      const { resumeAssessmentId, reviewAssessmentId, reviewSessionId } = item.dataset;

      if (resumeAssessmentId) {
        quizManager.resumeAssessment(resumeAssessmentId);
      } else if (reviewAssessmentId) {
        const { assessmentLogs } = stateManager.getState();
        const log = assessmentLogs.find(a => a.id === reviewAssessmentId);
        if (log) uiManager.showSessionSummary(log.sessionLog, 'assessment');
      } else if (reviewSessionId) {
        const { sessionHistory } = stateManager.getState();
        const session = sessionHistory.find(s => s.startTime === reviewSessionId);
        if (session) uiManager.showSessionSummary(session.sessionLog, session.mode);
      }
    });
  }

  /**
   * Renders all content on the dashboard page.
   * This is called by the navigation manager when the page is shown.
   */
  function renderDashboard() {
    const { progress, assessmentLogs, flaggedQuestions, sessionHistory, APP_DATA } = stateManager.getState();
    const { books: ALL_BOOKS_DATA, codebook: CODEBOOK } = APP_DATA;
    
    if (!overallProgressDashboard || !CODEBOOK) return; // Ensure elements and data are ready

    const allProgress = Object.values(progress);
    const studyQuizProgress = allProgress.filter(p => p.modes && (p.modes.study || p.modes.quiz));

    const attemptedQuestionsCount = studyQuizProgress.length;
    const totalQuestions = ALL_BOOKS_DATA.reduce((acc, book) => 
      acc + book.sections.reduce((sAcc, sec) => sAcc + sec.questions.length, 0), 0);
    
    let totalCorrect = 0, totalIncorrect = 0;
    studyQuizProgress.forEach(prog => {
      totalCorrect += (prog.modes.study?.correct || 0) + (prog.modes.quiz?.correct || 0);
      totalIncorrect += (prog.modes.study?.incorrect || 0) + (prog.modes.quiz?.incorrect || 0);
    });
    
    const overallScore = (totalCorrect + totalIncorrect > 0) ? Math.round((totalCorrect / (totalCorrect + totalIncorrect)) * 100) : 0;
    const completedAssessments = assessmentLogs.filter(log => log.status === 'completed').length;
    
    // --- 1. Render Overall Progress Stats ---
    overallProgressDashboard.innerHTML = `
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${attemptedQuestionsCount} / ${totalQuestions}</div><div class="text-sm text-gray-500">Questions Answered</div></div>
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${overallScore}%</div><div class="text-sm text-gray-500">Overall Score</div></div>
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${completedAssessments}</div><div class="text-sm text-gray-500">Assessments Completed</div></div>
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${flaggedQuestions.length}</div><div class="text-sm text-gray-500">Flagged for Review</div></div>
    `;

    // --- 2. Render Quick Access Buttons ---
    if (quickAccessContent) {
      quickAccessContent.innerHTML = `
        <button data-page="study" class="nav-btn w-full btn-secondary">Start a Study Session</button>
        <button data-page="quiz-setup" class="nav-btn w-full btn-secondary">Start a Quiz</button>
        <button data-page="self-assessment" class="nav-btn w-full btn-primary">New Self-Assessment</button>
      `;
    }

    // --- 3. Render Study Tip ---
    if (studyTip) {
      const tips = [
        "Review flagged questions regularly.", 
        "Focus on your weakest categories in the reports.", 
        "Take a full self-assessment to simulate exam conditions."
      ];
      studyTip.textContent = tips[Math.floor(Math.random() * tips.length)];
    }

    // --- 4. Render Recent Activity Log ---
    if (recentActivityLog) {
      const assessmentActivities = assessmentLogs.map(log => ({
        type: 'assessment',
        date: new Date(log.startDate),
        status: log.status,
        id: log.id,
        isResumable: log.status !== 'completed',
        data: log
      }));

      const sessionActivities = (sessionHistory || []).map(session => ({
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
        recentActivityLog.innerHTML = `<p class="text-gray-500 text-center text-sm">No recent activity to show.</p>`;
      } else {
        recentActivityLog.innerHTML = allActivities.slice(0, 10).map(activity => {
          let title = '';
          let detailsHTML = '';
          let actionHTML = '';
          let dataAttributes = '';

          if (activity.type === 'assessment') {
            const log = activity.data as AssessmentLog;
            title = `Assessment`;
            detailsHTML = `<p class="text-xs text-gray-500">${new Date(log.startDate).toLocaleString()}</p>`;
            if (activity.isResumable) {
              dataAttributes = `data-resume-assessment-id="${log.id}"`;
              actionHTML = `<div class="text-right"><span class="font-semibold text-amber-500">In Progress</span><p class="text-xs text-gray-500">${log.sessionLog.length} / ${log.questions.length} answered</p></div>`;
            } else {
              dataAttributes = `data-review-assessment-id="${log.id}"`;
              const { sessionLog } = log;
              const correct = sessionLog.filter(i => i.isCorrect).length;
              const total = sessionLog.length;
              const score = total > 0 ? Math.round((correct / total) * 100) : 0;
              const passed = score >= 70;
              const duration = new Date(log.endDate!).getTime() - new Date(log.startDate).getTime();
              const minutes = Math.floor((duration / (1000 * 60)) % 60);
              const hours = Math.floor(duration / (1000 * 60 * 60));

              actionHTML = `
                <div class="text-right">
                  <p class="font-semibold text-lg ${passed ? 'text-green-500' : 'text-red-500'}">${score}% (${passed ? 'Pass' : 'Fail'})</p>
                  <p class="text-xs text-gray-500">Time: ${hours > 0 ? hours+'h ' : ''}${minutes}m</p>
                </div>`;
            }
          } else { // Study or Quiz
            const session = activity.data as SessionHistoryItem;
            const { bookId, contextId, sessionLog, startTime, endTime, mode } = session;
            const book = ALL_BOOKS_DATA.find(b => b.id === bookId);
            const section = book?.sections.find(s => s.id === contextId);
            title = section ? (section.title.en) : 'Session';
            
            dataAttributes = `data-review-session-id="${startTime}"`;
            
            const correct = sessionLog.filter(i => i.isCorrect).length;
            const total = sessionLog.length;
            const score = total > 0 ? Math.round((correct / total) * 100) : 0;
            const passed = score >= 70;
            const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
            const minutes = Math.floor((duration / (1000 * 60)) % 60);
            const hours = Math.floor(duration / (1000 * 60 * 60));

            detailsHTML = `<div class="flex items-center gap-2"><span class="mode-tag mode-${mode}">${mode}</span><p class="text-xs text-gray-500">${new Date(activity.date).toLocaleString()}</p></div>`;
            actionHTML = `
              <div class="text-right">
                <p class="font-semibold text-lg ${passed ? 'text-green-500' : 'text-red-500'}">${score}% (${passed ? 'Pass' : 'Fail'})</p>
                <p class="text-xs text-gray-500">Time: ${hours > 0 ? hours+'h ' : ''}${minutes}m</p>
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
    }

    // --- 5. Render MWA Radar Chart ---
    if (dashboardMwaChartCanvas) {
      const mwaData: { [key: string]: { c: number, i: number } } = {};
      const allQuestionsInDB = ALL_BOOKS_DATA.flatMap(b => b.sections.flatMap(s => s.questions));
      
      Object.entries(progress).forEach(([uid, prog]) => {
        const hasNonAssessmentMode = Object.keys(prog.modes || {}).some(m => m !== 'assessment');
        if (!hasNonAssessmentMode) return;
      
        const q = allQuestionsInDB.find(q => q.uid === uid);
        if (q && q.classification) {
          const mwa = q.classification.mwa;
          mwaData[mwa] = mwaData[mwa] || { c: 0, i: 0 };
          mwaData[mwa].c += (prog.modes.study?.correct || 0) + (prog.modes.quiz?.correct || 0);
          mwaData[mwa].i += (prog.modes.study?.incorrect || 0) + (prog.modes.quiz?.incorrect || 0);
        }
      });
      
      const mwaLabels = Object.keys(CODEBOOK.mwa).sort();
      const chartData = mwaLabels.map(l => {
        const { c = 0, i = 0 } = mwaData[l] || {};
        return (c + i > 0) ? Math.round((c / (c + i)) * 100) : 0;
      });

      if (dashboardMwaChart) {
        dashboardMwaChart.destroy();
      }
      
      dashboardMwaChart = new Chart(dashboardMwaChartCanvas, {
        type: 'radar',
        data: {
          labels: mwaLabels.map(l => `${l}: ${CODEBOOK.mwa[l].en}`),
          datasets: [{
            label: 'Score %',
            data: chartData,
            fill: true,
            backgroundColor: 'rgba(199, 21, 31, 0.2)', // Red Seal color transparent
            borderColor: 'rgb(193, 18, 31)', // Red Seal color
            pointBackgroundColor: 'rgb(193, 18, 31)',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: 'rgb(193, 18, 31)'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            r: {
              angleLines: { color: 'rgba(100, 116, 139, 0.3)' },
              suggestedMin: 0,
              suggestedMax: 100,
              pointLabels: { font: { size: 10 } }
            }
          }
        }
      });
    }
  }

  // --- PUBLIC API ---
  return {
    initialize() {
      cacheElements();
      attachListeners();
      console.log('Dashboard Manager initialized');
    },
    renderDashboard
  };
})();
