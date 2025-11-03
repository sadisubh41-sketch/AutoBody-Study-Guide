// src/modules/state.ts
import type {
  RootState,
  AppData,
  Settings,
  User,
  QuestionProgress,
  AssessmentLog,
  SessionHistoryEntry,
  QuizSession
} from './types';

const DEFAULT_STATE: RootState = {
  APP_DATA: { books: [], codebook: {}, manifest: {}, glossary: [] },
  user: { username: null, role: 'user', token: null },
  quiz: {
    isActive: false,
    mode: 'study',
    questions: [],
    currentQuestionIndex: 0,
    // ADDED: Default empty values for new session fields
    sessionLog: [],
    sessionInfo: {
      bookId: null,
      contextId: null,
      startTime: ''
    }
  },
  ui: { currentPage: 'dashboard', isLoading: true },
  settings: { username: '', language: 'en', theme: 'light' },
  // ADDED: Default empty values for progress tracking
  progress: {},
  assessmentLogs: [],
  flaggedQuestions: [],
  completedSections: [],
  sessionHistory: []
};

let state: RootState = structuredClone(DEFAULT_STATE);

/** Load UI settings and progress from localStorage */
function loadLocalData(): void {
  try {
    const savedSettings = localStorage.getItem('redSealAppSettings');
    if (savedSettings) {
      state.settings = JSON.parse(savedSettings);
    }

    // ADDED: Load all progress data from old project's key
    const savedProgress = localStorage.getItem('redSealAppProgress');
    if (savedProgress) {
      const progressData = JSON.parse(savedProgress);
      state.progress = progressData.progress || {};
      state.assessmentLogs = progressData.assessmentLogs || [];
      state.flaggedQuestions = progressData.flaggedQuestions || [];
      state.completedSections = progressData.completedSections || [];
      state.sessionHistory = progressData.sessionHistory || [];
    }
  } catch (e) {
    console.warn('Could not load local data:', e);
  }
}

/** Save UI settings and progress to localStorage */
function saveLocalData(): void {
  try {
    // Save settings
    localStorage.setItem('redSealAppSettings', JSON.stringify(state.settings));

    // ADDED: Save all progress data
    localStorage.setItem('redSealAppProgress', JSON.stringify({
      progress: state.progress,
      assessmentLogs: state.assessmentLogs,
      flaggedQuestions: state.flaggedQuestions,
      completedSections: state.completedSections,
      sessionHistory: state.sessionHistory
    }));
  } catch (e) {
    console.warn('Could not save local data:', e);
  }
}

export const stateManager = {
  /** Initializes the state manager with app data */
  initialize(appData: AppData): void {
    if (!appData) throw new Error('No app data provided to stateManager.');
    state.APP_DATA = appData;
    loadLocalData(); // UPDATED: from loadLocalSettings
    console.log('State manager initialized');
  },

  /** Returns a deep copy of the current app state */
  getState(): RootState {
    return structuredClone(state);
  },

  /** Updates part of the state safely */
  update<K extends keyof RootState>(key: K, newValue: Partial<RootState[K]>): void {
    // This is a shallow merge. For deep objects like 'quiz', it's better to update the whole object.
    (state[key] as any) = { ...state[key], ...newValue };
  },

  /**
   * Replaces the entire value for a given state key.
   * This is safer for complex objects like 'quiz' or 'user'.
   */
  set<K extends keyof RootState>(key: K, newValue: RootState[K]): void {
    state[key] = newValue;
  },

  /** Updates settings and saves to localStorage */
  updateSettings(newSettings: Partial<Settings>): void {
    state.settings = { ...state.settings, ...newSettings };
    saveLocalData(); // UPDATED: from saveLocalSettings
  },

  // ADDED: Specific function to save only progress data
  /** Saves all user progress to localStorage */
  saveProgress(): void {
    saveLocalData();
  },

  /** Sets user session info after login */
  setUser(user: User): void {
    state.user = user;
    if (!state.settings.username) {
      state.settings.username = user.username || '';
      saveLocalData(); // UPDATED: from saveLocalSettings
    }
  },

  /** Resets user session and clears progress */
  reset(): void {
    const appData = state.APP_DATA;
    const settings = state.settings;
    // Reset state to default
    state = structuredClone(DEFAULT_STATE);
    // Restore persistent data
    state.APP_DATA = appData;
    state.settings = settings;
    // Save the cleared progress
    saveLocalData();
  }
};
