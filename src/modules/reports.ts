// src/modules/reports.ts
// @ts-nocheck - We are using a global Chart object from the CDN

import { stateManager } from './state';
import type { QuestionProgress } from './types';

// Inform TypeScript that Chart.js is loaded globally via CDN
declare const Chart: any;

export const reportsManager = (() => {
  // --- CACHED DOM ELEMENTS ---
  let reportTabs: NodeListOf<HTMLButtonElement> | null = null;
  let reportTabContents: NodeListOf<HTMLElement> | null = null;
  let reportsPlaceholder: HTMLElement | null = null;
  let reportsContent: HTMLElement | null = null;
  let overallProgressStats: HTMLElement | null = null;
  let overallScoreStats: HTMLElement | null = null;
  let modePerformanceBreakdown: HTMLElement | null = null;
  let performanceBlocks: HTMLElement | null = null;
  let mwaChartCanvas: HTMLCanvasElement | null = null;
  let changeChartCanvas: HTMLCanvasElement | null = null;
  let assessmentReportsPlaceholder: HTMLElement | null = null;
  let assessmentReportsContent: HTMLElement | null = null;
  let assessmentSelectFilter: HTMLSelectElement | null = null;
  let assessmentOverallStats: HTMLElement | null = null;
  let assessmentPerformanceBlocks: HTMLElement | null = null;
  let assessmentMwaChartCanvas: HTMLCanvasElement | null = null;
  let assessmentChangeChartCanvas: HTMLCanvasElement | null = null;

  // --- CHART INSTANCES ---
  let mwaChart: any = null;
  let changeChart: any = null;
  let assessmentMwaChart: any = null;
  let assessmentChangeChart: any = null;

  /**
   * Caches all DOM elements for the reports page.
   */
  function cacheElements() {
    reportTabs = document.querySelectorAll('.report-tab');
    reportTabContents = document.querySelectorAll('.report-tab-content');
    reportsPlaceholder = document.getElementById('reports-placeholder');
    reportsContent = document.getElementById('reports-content');
    overallProgressStats = document.getElementById('overall-progress-stats');
    overallScoreStats = document.getElementById('overall-score-stats');
    modePerformanceBreakdown = document.getElementById('mode-performance-breakdown');
    performanceBlocks = document.getElementById('performance-blocks');
    mwaChartCanvas = document.getElementById('mwa-chart') as HTMLCanvasElement;
    changeChartCanvas = document.getElementById('change-chart') as HTMLCanvasElement;
    assessmentReportsPlaceholder = document.getElementById('assessment-reports-placeholder');
    assessmentReportsContent = document.getElementById('assessment-reports-content');
    assessmentSelectFilter = document.getElementById('assessment-select-filter') as HTMLSelectElement;
    assessmentOverallStats = document.getElementById('assessment-overall-stats');
    assessmentPerformanceBlocks = document.getElementById('assessment-performance-blocks');
    assessmentMwaChartCanvas = document.getElementById('assessment-mwa-chart') as HTMLCanvasElement;
    assessmentChangeChartCanvas = document.getElementById('assessment-change-chart') as HTMLCanvasElement;
  }

  /**
   * Renders the "Overall Reports" tab.
   */
  function renderOverallReports() {
    if (typeof Chart === 'undefined') return;

    const { settings, progress, APP_DATA } = stateManager.getState();
    const { books: ALL_BOOKS_DATA, codebook: CODEBOOK } = APP_DATA;

    const bookFilter = (document.getElementById('report-book-filter') as HTMLSelectElement).value;
    const modeFilter = (document.getElementById('report-mode-filter') as HTMLSelectElement).value;

    const allQuestionsInDB = ALL_BOOKS_DATA.flatMap(b => b.sections.flatMap(s => s.questions));
    const allQuestionsInFilter = (bookFilter === 'all')
      ? allQuestionsInDB
      : ALL_BOOKS_DATA.find(b => b.id === bookFilter)?.sections.flatMap(s => s.questions) || [];
    const totalQuestions = allQuestionsInFilter.length;
    
    const filteredProgressEntries = Object.entries(progress).filter(([uid, prog]) => {
      const hasNonAssessmentMode = Object.keys(prog.modes || {}).some(m => m !== 'assessment');
      if (!hasNonAssessmentMode) return false;

      const question = allQuestionsInDB.find(q => q.uid === uid);
      if (!question) return false;
      
      const bookIdForQuestion = ALL_BOOKS_DATA.find(b => q.uid.startsWith(`B${b.id.replace('book','')}`))?.id;
      const bookMatch = (bookFilter === 'all') || (bookIdForQuestion === bookFilter);
      const modeMatch = (modeFilter === 'all') || (prog.modes && prog.modes[modeFilter]);

      return bookMatch && modeMatch;
    });
    
    const attemptedQuestionsCount = new Set(filteredProgressEntries.map(([uid]) => uid)).size;
    
    overallProgressStats.innerHTML = `
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${totalQuestions}</div><div class="text-sm text-gray-500">Total Questions</div></div>
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${attemptedQuestionsCount}</div><div class="text-sm text-gray-500">Attempted</div></div>
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${totalQuestions - attemptedQuestionsCount}</div><div class="text-sm text-gray-500">Unseen</div></div>
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${totalQuestions > 0 ? Math.round((attemptedQuestionsCount / totalQuestions) * 100) : 0}%</div><div class="text-sm text-gray-500">Coverage</div></div>`;

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
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${overallScore}%</div><div class="text-sm text-gray-500">Overall Score</div></div>
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold text-green-500">${totalCorrect}</div><div class="text-sm text-gray-500">Correct</div></div>
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold text-red-500">${totalIncorrect}</div><div class="text-sm text-gray-500">Incorrect</div></div>
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${totalCorrect + totalIncorrect}</div><div class="text-sm text-gray-500">Total Answers</div></div>`;
    
    if (attemptedQuestionsCount === 0) {
      reportsPlaceholder.style.display = 'block';
      reportsContent.classList.add('hidden');
      return;
    }
    reportsPlaceholder.style.display = 'none';
    reportsContent.classList.remove('hidden');
    
    const modeStats = { study: { c: 0, i: 0, t: 0 }, quiz: { c: 0, i: 0, t: 0 } };
    filteredProgressEntries.forEach(([uid, prog]) => {
      for (const mode in prog.modes) {
        if (mode !== 'assessment' && (modeFilter === 'all' || mode === modeFilter)) {
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
      return `${hours > 0 ? hours + 'h ' : ''}${minutes > 0 ? minutes + 'm ' : ''}${seconds}s`;
    };
    
    modePerformanceBreakdown.innerHTML = Object.keys(modeStats).map(mode => {
      const { c, i, t } = modeStats[mode];
      const total = c + i;
      if (total === 0) return '';
      const score = Math.round((c / total) * 100);
      return `<div class="card p-4 rounded-lg text-center">
                <div class="text-lg font-bold capitalize">${mode}</div>
                <div class="text-3xl font-bold my-2">${score}%</div>
                <div class="text-sm text-gray-500">${c} Correct / ${i} Incorrect</div>
                <div class="text-sm text-gray-500 mt-1">Total Time: ${formatTime(t)}</div>
              </div>`;
    }).join('');
    
    const getStatsByCategory = (key: 'book' | 'subject' | 'mwa' | 'task') => {
      const data: { [key: string]: { c: number, i: number } } = {};
      filteredProgressEntries.forEach(([uid, prog]) => {
        const q = allQuestionsInDB.find(q => q.uid === uid);
        if (!q || !q.classification) return;
        let categoryId: string | undefined;

        if (key === 'book') {
          categoryId = ALL_BOOKS_DATA.find(b => q.uid.startsWith(`B${b.id.replace('book','')}`))?.id;
        } else if (key === 'subject') {
          const book = ALL_BOOKS_DATA.find(b => q.uid.startsWith(`B${b.id.replace('book','')}`));
          categoryId = book?.sections.find(s => s.questions.some(qu => qu.uid === q.uid))?.id;
        } else if (key === 'mwa') {
          categoryId = q.classification.mwa;
        } else if (key === 'task') {
          categoryId = q.classification.task;
        }
        
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
      const sortedKeys = Object.keys(data).sort((a, b) => {
        const scoreA = (data[a].c / (data[a].c + data[a].i)) || 0;
        const scoreB = (data[b].c / (data[b].c + data[b].i)) || 0;
        return scoreA - scoreB; // Sort by score ascending (worst first)
      });
      
      if (sortedKeys.length === 0) {
        html += `<li class="text-gray-500">No data for this category.</li>`;
      }

      sortedKeys.forEach(key => {
        const { c, i } = data[key];
        const total = c + i;
        if (total === 0) return;
        const score = Math.round((c / total) * 100);
        const name = nameMap(key);
        html += `
          <li class="performance-item">
            <div class="flex justify-between items-center mb-1">
              <span class="font-semibold truncate">${name}</span>
              <span class="font-bold text-gray-600 dark:text-gray-300 text-xs">${score}% (${c}/${total})</span>
            </div>
            <div class="stats-bar">
              <div class="stats-bar-fill" style="width: ${score}%; background-color: ${score >= 70 ? '#22c55e' : (score >= 40 ? '#f97316' : '#ef4444')};"></div>
            </div>
          </li>`;
      });
      return html + `</ul></div>`;
    };

    const bookNameMap = (id) => ALL_BOOKS_DATA.find(b => b.id === id)?.title[settings.language] || ALL_BOOKS_DATA.find(b => b.id === id)?.title.en || id;
    const subjectNameMap = (id) => ALL_BOOKS_DATA.flatMap(b => b.sections).find(s => s.id === id)?.title[settings.language] || ALL_BOOKS_DATA.flatMap(b => b.sections).find(s => s.id === id)?.title.en || id;
    const mwaNameMap = (id) => `${id}: ${CODEBOOK.mwa[id]?.[settings.language] || CODEBOOK.mwa[id]?.en || ''}`;
    const taskNameMap = (id) => `${id}: ${CODEBOOK.tasks[id]?.[settings.language] || CODEBOOK.tasks[id]?.en || ''}`;

    performanceBlocks.innerHTML = `
      ${createBlockHTML('By Book', getStatsByCategory('book'), bookNameMap)}
      ${createBlockHTML('By Subject', getStatsByCategory('subject'), subjectNameMap)}
      ${createBlockHTML('By Category (MWA)', getStatsByCategory('mwa'), mwaNameMap)}
      ${createBlockHTML('By Task', getStatsByCategory('task'), taskNameMap)}
    `;

    // MWA Bar Chart
    const mwaChartData = getStatsByCategory('mwa');
    const mwaLabels = Object.keys(CODEBOOK.mwa).sort();
    if (mwaChart) mwaChart.destroy();
    mwaChart = new Chart(mwaChartCanvas, {
      type: 'bar',
      data: {
        labels: mwaLabels.map(l => `${l}: ${CODEBOOK.mwa[l][settings.language] || CODEBOOK.mwa[l].en}`),
        datasets: [
          { label: 'Correct', data: mwaLabels.map(l => mwaChartData[l]?.c || 0), backgroundColor: '#22c55e' },
          { label: 'Incorrect', data: mwaLabels.map(l => mwaChartData[l]?.i || 0), backgroundColor: '#ef4444' }
        ]
      },
      options: {
        indexAxis: 'y',
        scales: { x: { stacked: true }, y: { stacked: true, ticks: { font: { size: 10 } } } },
        responsive: true,
        maintainAspectRatio: false,
      }
    });

    // Answer Change Doughnut Chart
    const changeData = { ccft: 0, iift: 0, c2i: 0, i2c: 0, i2i: 0 }; // Correct 1st, Incorrect 1st, C->I, I->C, I->I
    filteredProgressEntries.forEach(([uid, prog]) => {
      const changes = prog.answerChanges || {};
      changeData.ccft += changes.ccft || 0;
      changeData.iift += changes.iift || 0;
      changeData.c2i += changes.c2i || 0;
      changeData.i2c += changes.i2c || 0;
      changeData.i2i += changes.i2i || 0;
    });
    if (changeChart) changeChart.destroy();
    changeChart = new Chart(changeChartCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Correct (1st Time)', 'Incorrect (1st Time)', 'Correct to Incorrect', 'Incorrect to Correct', 'Incorrect to Incorrect'],
        datasets: [{
          data: [changeData.ccft, changeData.iift, changeData.c2i, changeData.i2c, changeData.i2i],
          backgroundColor: ['#22c55e', '#fde047', '#f97316', '#84cc16', '#ef4444']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  /**
   * Renders the "Self-Assessment Reports" tab.
   */
  function renderAssessmentReports() {
    const { settings, assessmentLogs, APP_DATA } = stateManager.getState();
    const { books: ALL_BOOKS_DATA, codebook: CODEBOOK } = APP_DATA;

    const currentSelection = assessmentSelectFilter.value;
    assessmentSelectFilter.innerHTML = '<option value="">Select an Assessment</option>';
    const completedAssessments = assessmentLogs.filter(log => log.status === 'completed').reverse();

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
    }

    assessmentReportsPlaceholder.style.display = 'none';
    assessmentReportsContent.classList.remove('hidden');

    const totalCorrect = log.sessionLog.filter(item => item.isCorrect).length;
    const totalIncorrect = log.sessionLog.length - totalCorrect;
    const score = log.sessionLog.length > 0 ? Math.round((totalCorrect / log.sessionLog.length) * 100) : 0;

    assessmentOverallStats.innerHTML = `
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${score}%</div><div class="text-sm text-gray-500">Score</div></div>
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold text-green-500">${totalCorrect}</div><div class="text-sm text-gray-500">Correct</div></div>
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold text-red-500">${totalIncorrect}</div><div class="text-sm text-gray-500">Incorrect</div></div>
      <div class="card p-4 rounded-lg"><div class="text-2xl font-bold">${log.sessionLog.length}</div><div class="text-sm text-gray-500">Answered</div></div>`;
    
    const allQuestionsInDB = ALL_BOOKS_DATA.flatMap(b => b.sections.flatMap(s => s.questions));
    
    const getStatsByCategory = (key: 'book' | 'subject' | 'mwa' | 'task') => {
      const data: { [key: string]: { c: number, i: number } } = {};
      log.sessionLog.forEach(item => {
        const q = allQuestionsInDB.find(q => q.uid === item.qId);
        if (!q || !q.classification) return;

        let categoryId: string | undefined;
        if (key === 'book') {
          categoryId = ALL_BOOKS_DATA.find(b => q.uid.startsWith(`B${b.id.replace('book','')}`))?.id;
        } else if (key === 'subject') {
          const book = ALL_BOOKS_DATA.find(b => q.uid.startsWith(`B${b.id.replace('book','')}`));
          categoryId = book?.sections.find(s => s.questions.some(qu => qu.uid === q.uid))?.id;
        } else if (key === 'mwa') {
          categoryId = q.classification.mwa;
        } else if (key === 'task') {
          categoryId = q.classification.task;
        }
        
        if (!categoryId) return;
        data[categoryId] = data[categoryId] || { c: 0, i: 0 };
        if (item.isCorrect) data[categoryId].c++;
        else data[categoryId].i++;
      });
      return data;
    };
    
    const createBlockHTML = (title, data, nameMap) => {
      let html = `<div class="card p-4 rounded-lg"><h4 class="font-bold text-lg mb-4">${title}</h4><ul class="text-sm space-y-4 max-h-60 overflow-y-auto pr-2">`;
      const sortedKeys = Object.keys(data).sort((a, b) => {
        const scoreA = (data[a].c / (data[a].c + data[a].i)) || 0;
        const scoreB = (data[b].c / (data[b].c + data[b].i)) || 0;
        return scoreA - scoreB; // Sort by score ascending (worst first)
      });
      
      if (sortedKeys.length === 0) {
        html += `<li class="text-gray-500">No data for this category.</li>`;
      }
      
      sortedKeys.forEach(key => {
        const { c, i } = data[key];
        const total = c + i;
        if (total === 0) return;
        const score = Math.round((c / total) * 100);
        const name = nameMap(key);
        html += `
          <li class="performance-item">
            <div class="flex justify-between items-center mb-1">
              <span class="font-semibold truncate">${name}</span>
              <span class="font-bold text-gray-600 dark:text-gray-300 text-xs">${score}% (${c}/${total})</span>
            </div>
            <div class="stats-bar">
              <div class="stats-bar-fill" style="width: ${score}%; background-color: ${score >= 70 ? '#22c55e' : (score >= 40 ? '#f97316' : '#ef4444')};"></div>
            </div>
          </li>`;
      });
      return html + `</ul></div>`;
    };

    const bookNameMap = (id) => ALL_BOOKS_DATA.find(b => b.id === id)?.title[settings.language] || ALL_BOOKS_DATA.find(b => b.id === id)?.title.en || id;
    const subjectNameMap = (id) => ALL_BOOKS_DATA.flatMap(b => b.sections).find(s => s.id === id)?.title[settings.language] || ALL_BOOKS_DATA.flatMap(b => b.sections).find(s => s.id === id)?.title.en || id;
    const mwaNameMap = (id) => `${id}: ${CODEBOOK.mwa[id]?.[settings.language] || CODEBOOK.mwa[id]?.en || ''}`;
    const taskNameMap = (id) => `${id}: ${CODEBOOK.tasks[id]?.[settings.language] || CODEBOOK.tasks[id]?.en || ''}`;

    assessmentPerformanceBlocks.innerHTML = `
      ${createBlockHTML('By Book', getStatsByCategory('book'), bookNameMap)}
      ${createBlockHTML('By Subject', getStatsByCategory('subject'), subjectNameMap)}
      ${createBlockHTML('By Category (MWA)', getStatsByCategory('mwa'), mwaNameMap)}
      ${createBlockHTML('By Task', getStatsByCategory('task'), taskNameMap)}
    `;

    // Assessment MWA Bar Chart
    const mwaChartData = getStatsByCategory('mwa');
    const mwaLabels = Object.keys(CODEBOOK.mwa).sort();
    if (assessmentMwaChart) assessmentMwaChart.destroy();
    assessmentMwaChart = new Chart(assessmentMwaChartCanvas, {
      type: 'bar',
      data: {
        labels: mwaLabels.map(l => `${l}: ${CODEBOOK.mwa[l][settings.language] || CODEBOOK.mwa[l].en}`),
        datasets: [
          { label: 'Correct', data: mwaLabels.map(l => mwaChartData[l]?.c || 0), backgroundColor: '#22c55e' },
          { label: 'Incorrect', data: mwaLabels.map(l => mwaChartData[l]?.i || 0), backgroundColor: '#ef4444' }
        ]
      },
      options: {
        indexAxis: 'y',
        scales: { x: { stacked: true }, y: { stacked: true, ticks: { font: { size: 10 } } } },
        responsive: true,
        maintainAspectRatio: false
      }
    });

    // Assessment Answer Change Doughnut Chart
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
    if (assessmentChangeChart) assessmentChangeChart.destroy();
    assessmentChangeChart = new Chart(assessmentChangeChartCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Correct (1st Time)', 'Incorrect (1st Time)', 'Correct to Incorrect', 'Incorrect to Correct', 'Incorrect to Incorrect'],
        datasets: [{
          data: [changeData.ccft, changeData.iift, changeData.c2i, changeData.i2c, changeData.i2i],
          backgroundColor: ['#22c55e', '#fde047', '#f97316', '#84cc16', '#ef4444']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  /**
   * Attaches event listeners for the report tabs and filters.
   */
  function attachListeners() {
    reportTabs?.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        
        reportTabs.forEach(t => t.classList.remove('active', 'border-red-seal', 'text-red-seal'));
        tab.classList.add('active', 'border-red-seal', 'text-red-seal');
        
        reportTabContents?.forEach(content => {
          content.classList.toggle('hidden', content.id !== `report-tab-${tabName}`);
        });
        
        if (tabName === 'assessment') {
          renderAssessmentReports();
        } else {
          renderOverallReports();
        }
      });
    });

    // Add listeners for overall report filters
    (document.getElementById('report-book-filter') as HTMLSelectElement)?.addEventListener('change', renderOverallReports);
    (document.getElementById('report-mode-filter') as HTMLSelectElement)?.addEventListener('change', renderOverallReports);
    
    // Add listener for assessment report filter
    assessmentSelectFilter?.addEventListener('change', renderAssessmentReports);
  }

  // --- PUBLIC API ---
  return {
    initialize() {
      cacheElements();
      attachListeners();
      // Set the first tab as active by default
      reportTabs?.[0]?.classList.add('active', 'border-red-seal', 'text-red-seal');
      reportTabContents?.[0]?.classList.remove('hidden');
      console.log('Reports Manager initialized');
    },
    /**
     * Renders the content of the currently active report tab.
     * This is called by navigation.ts when the page is shown.
     */
    renderReportsPage() {
      const activeTab = document.querySelector('.report-tab.active') as HTMLButtonElement;
      if (!activeTab || activeTab.dataset.tab === 'overall') {
        renderOverallReports();
      } else {
        renderAssessmentReports();
      }
    }
  };
})();
