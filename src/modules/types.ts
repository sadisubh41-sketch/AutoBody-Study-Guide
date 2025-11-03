// src/modules/types.ts

/** Represents a single user session */
export interface User {
  username: string | null;
  role: 'user' | 'admin';
  token: string | null;
}

/** Persistent settings stored locally */
export interface Settings {
  username: string;
  language: 'en' | 'ar';
  theme: 'light' | 'dark';
}

/** Static data loaded from data.json */
export interface AppData {
  books: Book[];
  codebook: Record<string, any>;
  manifest: Record<string, any>;
  glossary: GlossaryItem[];
}

/** Represents a study or quiz book */
export interface Book {
  id: string;
  title: { en: string; ar?: string };
  sections: Section[];
}

/** Section within a book */
export interface Section {
  id: string;
  title: { en: string; ar?: string };
  questions: Question[];
}

/** Single question */
export interface Question {
  uid: string;
  question: { en: string; ar?: string };
  options: string[]; // This will be the English options
  optionsAr?: string[]; // Add Arabic options
  correctIndex: number;
  explanation?: { en?: string; ar?: string };
  // Add classification from old project
  classification: {
    mwa: string;
    task: string;
  };
}

/** Glossary entry */
export interface GlossaryItem {
  term: string;
  definition: string;
  // Add multilingual fields from old project
  term_en: string;
  definition_en: string;
  term_ar: string;
  definition_ar: string;
  norm_en: string;
  norm_ar: string;
  slug_en: string;
  letter: string;
  category?: string;
}

// ADDED: Reusable type for session mode
export type QuizMode = 'study' | 'quiz' | 'assessment';

/** Quiz/Study session info */
export interface QuizSession {
  isActive: boolean;
  mode: QuizMode;
  questions: Question[];
  currentQuestionIndex: number;
  // ADDED: Fields to track session details
  sessionLog: AnswerLog[];
  sessionInfo: {
    bookId: string | null;
    contextId: string | null; // e.g., sectionId or assessmentId
    startTime: string;
  };
}

/** App UI state */
export interface UIState {
  currentPage: string;
  isLoading: boolean;
}

// --- ADDED: Types for Progress Tracking (from old project) ---

/** Log for a single answer in a session */
export interface AnswerLog {
  qId: string;
  isCorrect: boolean;
  mwa: string;
  time: number;
  initial: number | null;
  final: number | null;
  correctAnswer: number;
}

/** Progress for a single question */
export interface QuestionProgress {
  correct: number;
  incorrect: number;
  attempts: number;
  totalTime: number;
  answerChanges: {
    ccft: number; // Correct, Correct (First Time)
    iift: number; // Incorrect, Incorrect (First Time)
    c2i: number; // Correct to Incorrect
    i2c: number; // Incorrect to Correct
    i2i: number; // Incorrect to Incorrect
  };
  modes: {
    [key in QuizMode]?: {
      correct: number;
      incorrect: number;
      totalTime: number;
      attempts: number;
    };
  };
}

/** Log for a completed self-assessment */
export interface AssessmentLog {
  id: string;
  startDate: string;
  endDate?: string;
  questions: string[]; // Array of question UIDs
  sessionLog: AnswerLog[];
  status: 'in-progress' | 'completed';
}

/** Log for a completed study/quiz session */
export interface SessionHistoryEntry {
  mode: QuizMode;
  contextId: string | null;
  bookId: string | null;
  startTime: string;
  endTime: string;
  sessionLog: AnswerLog[];
}

// --- UPDATED: RootState ---

/** Root state type for the entire app */
export interface RootState {
  APP_DATA: AppData;
  user: User;
  quiz: QuizSession;
  ui: UIState;
  settings: Settings;
  // ADDED: State for progress tracking
  progress: Record<string, QuestionProgress>; // Key is Question UID
  assessmentLogs: AssessmentLog[];
  flaggedQuestions: string[]; // Array of Question UIDs
  completedSections: string[]; // Array of 'bookId_sectionId'
  sessionHistory: SessionHistoryEntry[];
}
