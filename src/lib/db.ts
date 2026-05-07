import { supabase } from './supabase';
import type { Word, WordList, TestResult, TestAnswer } from '../types';

// ── helpers ──────────────────────────────────────────────

function mapWord(row: Record<string, unknown>): Word {
  return {
    id: row.id as string,
    english: row.english as string,
    korean: (row.korean as string) ?? '',
    definition: (row.definition as string) ?? '',
    synonyms: (row.synonyms as string[]) ?? [],
    antonyms: (row.antonyms as string[]) ?? [],
    example: (row.example as string) ?? '',
    difficulty: 'medium',
    correctCount: (row.correct_count as number) ?? 0,
    incorrectCount: (row.incorrect_count as number) ?? 0,
  };
}

function mapList(row: Record<string, unknown>): WordList {
  const words = ((row.words as Record<string, unknown>[]) ?? [])
    .map(mapWord)
    .sort((a, b) => {
      const at = (row as Record<string, Record<string, unknown>[]>)
        .words?.find((w) => w.id === a.id)?.created_at as string ?? '';
      const bt = (row as Record<string, Record<string, unknown>[]>)
        .words?.find((w) => w.id === b.id)?.created_at as string ?? '';
      return at < bt ? -1 : 1;
    });
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? '',
    tags: (row.tags as string[]) ?? [],
    createdAt: row.created_at as string,
    words,
  };
}

// ── word lists ────────────────────────────────────────────

export async function fetchWordLists(): Promise<WordList[]> {
  const { data, error } = await supabase
    .from('word_lists')
    .select('*, words(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapList);
}

export async function fetchWordList(id: string): Promise<WordList | null> {
  const { data, error } = await supabase
    .from('word_lists')
    .select('*, words(*)')
    .eq('id', id)
    .single();
  if (error) return null;
  return mapList(data);
}

export async function createWordList(payload: { title: string; description: string }): Promise<WordList> {
  const { data, error } = await supabase
    .from('word_lists')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return mapList({ ...data, words: [] });
}

export async function updateWordList(id: string, payload: { title: string; description: string }): Promise<void> {
  const { error } = await supabase.from('word_lists').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteWordList(id: string): Promise<void> {
  const { error } = await supabase.from('word_lists').delete().eq('id', id);
  if (error) throw error;
}

// ── words ─────────────────────────────────────────────────

export async function upsertWord(wordListId: string, word: Word): Promise<Word> {
  const payload = {
    id: word.id,
    word_list_id: wordListId,
    english: word.english,
    korean: word.korean,
    definition: word.definition,
    synonyms: word.synonyms,
    antonyms: word.antonyms,
    example: word.example,
    correct_count: word.correctCount,
    incorrect_count: word.incorrectCount,
  };
  const { data, error } = await supabase
    .from('words')
    .upsert(payload)
    .select()
    .single();
  if (error) throw error;
  return mapWord(data);
}

export async function deleteWord(wordId: string): Promise<void> {
  const { error } = await supabase.from('words').delete().eq('id', wordId);
  if (error) throw error;
}

export async function incrementWordCount(wordId: string, correct: boolean): Promise<void> {
  const fn = correct ? 'increment_correct_count' : 'increment_incorrect_count';
  await supabase.rpc(fn, { word_id: wordId });
}

// ── test results ──────────────────────────────────────────

export async function saveTestResult(result: Omit<TestResult, 'id'>): Promise<void> {
  const { error } = await supabase.from('test_results').insert({
    word_list_id: result.wordListId,
    word_list_title: result.wordListTitle,
    student_name: result.studentName,
    test_type: result.testType,
    score: result.score,
    total: result.total,
    answers: result.answers,
  });
  if (error) throw error;
}

export async function fetchTestResults(): Promise<TestResult[]> {
  const { data, error } = await supabase
    .from('test_results')
    .select('*')
    .order('completed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id,
    wordListId: row.word_list_id,
    wordListTitle: row.word_list_title,
    studentName: row.student_name,
    testType: row.test_type,
    score: row.score,
    total: row.total,
    answers: row.answers as TestAnswer[],
    completedAt: row.completed_at,
  }));
}

export async function deleteTestResult(id: string): Promise<void> {
  const { error } = await supabase.from('test_results').delete().eq('id', id);
  if (error) throw error;
}

function mapResult(row: Record<string, unknown>): TestResult {
  return {
    id: row.id as string,
    wordListId: row.word_list_id as string,
    wordListTitle: row.word_list_title as string,
    studentName: row.student_name as string,
    testType: row.test_type as TestResult['testType'],
    score: row.score as number,
    total: row.total as number,
    answers: row.answers as TestResult['answers'],
    completedAt: row.completed_at as string,
  };
}

function getWeekStart(): Date {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function fetchWeeklyResults(wordListId: string, studentName: string): Promise<TestResult[]> {
  const { data, error } = await supabase
    .from('test_results')
    .select('*')
    .eq('word_list_id', wordListId)
    .eq('student_name', studentName)
    .gte('completed_at', getWeekStart().toISOString());
  if (error) throw error;
  return (data ?? []).map(mapResult);
}

export async function fetchAllWeeklyResults(wordListId: string): Promise<TestResult[]> {
  const { data, error } = await supabase
    .from('test_results')
    .select('*')
    .eq('word_list_id', wordListId)
    .gte('completed_at', getWeekStart().toISOString());
  if (error) throw error;
  return (data ?? []).map(mapResult);
}

// ── students ──────────────────────────────────────────────

export interface Student {
  id: string;
  name: string;
  createdAt: string;
}

export async function fetchStudents(): Promise<Student[]> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
  }));
}

export async function addStudent(name: string): Promise<Student> {
  const { data, error } = await supabase
    .from('students')
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, createdAt: data.created_at };
}

export async function deleteStudent(id: string): Promise<void> {
  const { error } = await supabase.from('students').delete().eq('id', id);
  if (error) throw error;
}
