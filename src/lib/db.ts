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
  className: string;
  createdAt: string;
}

export async function fetchStudents(): Promise<Student[]> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('class_name')
    .order('name');
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id as string,
    name: row.name as string,
    className: (row.class_name as string) ?? '',
    createdAt: row.created_at as string,
  }));
}

export async function addStudent(name: string, className: string): Promise<Student> {
  const { data, error } = await supabase
    .from('students')
    .insert({ name, class_name: className })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, className: data.class_name ?? '', createdAt: data.created_at };
}

export async function deleteStudent(id: string): Promise<void> {
  const { error } = await supabase.from('students').delete().eq('id', id);
  if (error) throw error;
}

// ── announcements ─────────────────────────────────────────

export interface Announcement {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id as string,
    title: row.title as string,
    content: row.content as string,
    pinned: row.pinned as boolean,
    createdAt: row.created_at as string,
  }));
}

export async function saveAnnouncement(payload: { title: string; content: string; pinned: boolean }): Promise<Announcement> {
  const { data, error } = await supabase.from('announcements').insert(payload).select().single();
  if (error) throw error;
  return { id: data.id, title: data.title, content: data.content, pinned: data.pinned, createdAt: data.created_at };
}

export async function updateAnnouncement(id: string, payload: { title: string; content: string; pinned: boolean }): Promise<void> {
  const { error } = await supabase.from('announcements').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw error;
}

// ── attendance ────────────────────────────────────────────

export interface AttendanceRecord {
  id: string;
  studentName: string;
  date: string;
  status: 'present' | 'late' | 'absent';
  note: string;
}

export async function fetchAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('date', date);
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id as string,
    studentName: row.student_name as string,
    date: row.date as string,
    status: row.status as AttendanceRecord['status'],
    note: (row.note as string) ?? '',
  }));
}

export async function fetchAttendanceByStudent(studentName: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('student_name', studentName)
    .order('date', { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id as string,
    studentName: row.student_name as string,
    date: row.date as string,
    status: row.status as AttendanceRecord['status'],
    note: (row.note as string) ?? '',
  }));
}

export async function upsertAttendance(record: Omit<AttendanceRecord, 'id'>): Promise<void> {
  const { error } = await supabase.from('attendance').upsert({
    student_name: record.studentName,
    date: record.date,
    status: record.status,
    note: record.note,
  }, { onConflict: 'student_name,date' });
  if (error) throw error;
}

export async function deleteAttendance(studentName: string, date: string): Promise<void> {
  const { error } = await supabase.from('attendance').delete()
    .eq('student_name', studentName).eq('date', date);
  if (error) throw error;
}

export async function fetchAttendanceByMonth(year: number, month: number): Promise<AttendanceRecord[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .gte('date', start)
    .lte('date', end);
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id as string,
    studentName: row.student_name as string,
    date: row.date as string,
    status: row.status as AttendanceRecord['status'],
    note: (row.note as string) ?? '',
  }));
}

// ── Q&A ──────────────────────────────────────────────────

export interface QnaItem {
  id: string;
  studentName: string;
  question: string;
  answer: string;
  answeredAt: string | null;
  createdAt: string;
}

export async function fetchQna(): Promise<QnaItem[]> {
  const { data, error } = await supabase
    .from('qna')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id as string,
    studentName: row.student_name as string,
    question: row.question as string,
    answer: (row.answer as string) ?? '',
    answeredAt: row.answered_at as string | null,
    createdAt: row.created_at as string,
  }));
}

export async function postQuestion(studentName: string, question: string): Promise<void> {
  const { error } = await supabase.from('qna').insert({ student_name: studentName, question });
  if (error) throw error;
}

export async function answerQuestion(id: string, answer: string): Promise<void> {
  const { error } = await supabase.from('qna').update({
    answer,
    answered_at: answer ? new Date().toISOString() : null,
  }).eq('id', id);
  if (error) throw error;
}

export async function deleteQna(id: string): Promise<void> {
  const { error } = await supabase.from('qna').delete().eq('id', id);
  if (error) throw error;
}
