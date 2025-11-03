// src/main.ts
import './style.css';
import { api } from './modules/api';
import { stateManager } from './modules/state';
import { navigation } from './modules/navigation';
import { uiManager } from './modules/ui';
import { authManager } from './modules/auth';
import { quizManager } from './modules/quiz';
import { glossaryManager } from './modules/glossary';
import { wizardManager } from './modules/wizard';
import { dashboardManager } from './modules/dashboard';
import { assessmentManager } from './modules/assessment';
import { reviewManager } from './modules/review';
import { reportsManager } from './modules/reports';

/**
 * Initializes the entire application.
 * Loads data, then initializes all modules.
 */
async function initializeApp() {
  try {
    // 1. Load application data (books, glossary, etc.)
    const appData = await api.loadAppData();
    
    // 2. Initialize the state manager with the loaded data
    stateManager.initialize(appData);

    // 3. Initialize all individual modules
    // Note: Order can matter here. Init UI and Nav before others.
    navigation.initialize();
    uiManager.initialize();
    authManager.initialize();
    quizManager.initialize();
    glossaryManager.initialize();
    wizardManager.initialize();
    dashboardManager.initialize();
    assessmentManager.initialize();
    reviewManager.initialize();
    reportsManager.initialize();

    console.log('✅ Full app initialized successfully');
  } catch (err) {
    // Fallback error display if initialization fails
    document.body.innerHTML = `<div class="text-center text-red-600 mt-20 p-8 bg-red-100 rounded-lg">
      <h2 class="text-2xl font-bold mb-4">Application Error</h2>
      <p>Could not initialize the application.</p>
      <p class="font-mono mt-4 text-sm bg-red-200 p-4 rounded">${(err as Error).message}</p>
    </div>`;
  }
}

// Start the application
initializeApp();

