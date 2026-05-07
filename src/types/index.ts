export interface Word {
  id: string;
  english: string;
  korean: string;
  definition: string;
  synonyms: string[];
  antonyms: string[];
  example: string;
  difficulty: 'easy' | 'medium' | 'hard';
  correctCount: number;
  incorrectCount: number;
}

export interface WordList {
  id: string;
  title: string;
  description: string;
  words: Word[];
  createdAt: string;
  tags: string[];
}

export type TestType =
  | 'multiple-choice-en'
  | 'multiple-choice-kr'
  | 'fill-blank'
  | 'spelling'
  | 'synonym-match'
  | 'antonym-match'
  | 'definition';

export interface TestAnswer {
  wordId: string;
  english: string;
  korean: string;
  userAnswer: string;
  correct: boolean;
}

export interface TestResult {
  id: string;
  wordListId: string;
  wordListTitle: string;
  studentName: string;
  testType: TestType;
  score: number;
  total: number;
  answers: TestAnswer[];
  completedAt: string;
}
