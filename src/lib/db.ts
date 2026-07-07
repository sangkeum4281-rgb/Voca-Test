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

function sortWordLists(lists: WordList[]): WordList[] {
  // 고등학교 판별: "고등", "고교", "XX고 N학년" 패턴 모두 포함
  const schoolLevel = (title: string) => /고등|고교|고\s*\d*\s*학년/.test(title) ? 0 : 1;
  return [...lists].sort((a, b) => {
    const levelDiff = schoolLevel(a.title) - schoolLevel(b.title);
    if (levelDiff !== 0) return levelDiff;
    const gradeA = parseInt(a.title.match(/(\d)\s*학년/)?.[1] ?? '9');
    const gradeB = parseInt(b.title.match(/(\d)\s*학년/)?.[1] ?? '9');
    const schoolA = a.title.replace(/\s*\d+\s*학년.*$/, '').trim();
    const schoolB = b.title.replace(/\s*\d+\s*학년.*$/, '').trim();
    const schoolCmp = schoolA.localeCompare(schoolB, 'ko');
    if (schoolCmp !== 0) return schoolCmp;
    return gradeA - gradeB;
  });
}

export async function fetchWordLists(): Promise<WordList[]> {
  const { data, error } = await supabase
    .from('word_lists')
    .select('*, words(*)')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return sortWordLists((data ?? []).map(mapList));
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
  parentPhone: string;
  createdAt: string;
  gpsExempt: boolean;
}

const isHighSchool = (cls: string) => /고등|고교|고\s*\d*\s*학년/.test(cls);

export function sortClasses(classes: string[]): string[] {
  return [...classes].sort((a, b) => {
    const levelDiff = (isHighSchool(a) ? 1 : 0) - (isHighSchool(b) ? 1 : 0);
    if (levelDiff !== 0) return levelDiff;
    const ga = parseInt(a.match(/(\d+)학년/)?.[1] ?? '9');
    const gb = parseInt(b.match(/(\d+)학년/)?.[1] ?? '9');
    return ga - gb;
  });
}

function sortStudents(students: Student[]): Student[] {
  return [...students].sort((a, b) => {
    // 중학교 먼저, 고등학교 아래
    const levelDiff = (isHighSchool(a.className) ? 1 : 0) - (isHighSchool(b.className) ? 1 : 0);
    if (levelDiff !== 0) return levelDiff;
    const gradeA = parseInt(a.className.match(/(\d)\s*학년/)?.[1] ?? '9');
    const gradeB = parseInt(b.className.match(/(\d)\s*학년/)?.[1] ?? '9');
    const schoolA = a.className.replace(/\s*\d+\s*학년.*$/, '').trim();
    const schoolB = b.className.replace(/\s*\d+\s*학년.*$/, '').trim();
    const schoolCmp = schoolA.localeCompare(schoolB, 'ko');
    if (schoolCmp !== 0) return schoolCmp;
    return gradeA - gradeB;
  });
}

export async function fetchStudents(): Promise<Student[]> {
  const { data, error } = await supabase
    .from('students')
    .select('*');
  if (error) throw error;
  return sortStudents((data ?? []).map(row => ({
    id: row.id as string,
    name: row.name as string,
    className: (row.class_name as string) ?? '',
    parentPhone: (row.parent_phone as string) ?? '',
    createdAt: row.created_at as string,
    gpsExempt: (row.gps_exempt as boolean) ?? false,
  })));
}

export async function addStudent(name: string, className: string, parentPhone = ''): Promise<Student> {
  const { data, error } = await supabase
    .from('students')
    .insert({ name, class_name: className, parent_phone: parentPhone })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, className: data.class_name ?? '', parentPhone: data.parent_phone ?? '', createdAt: data.created_at, gpsExempt: false };
}

export async function updateStudentPhone(id: string, parentPhone: string): Promise<void> {
  const { error } = await supabase.from('students').update({ parent_phone: parentPhone }).eq('id', id);
  if (error) throw error;
}

export async function updateStudentGpsExempt(id: string, gpsExempt: boolean): Promise<void> {
  const { error } = await supabase.from('students').update({ gps_exempt: gpsExempt }).eq('id', id);
  if (error) throw error;
}

async function solapiSign(apiKey: string, apiSecret: string): Promise<string> {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, '');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(date + salt));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `HMAC-SHA256 ApiKey=${apiKey}, Date=${date}, Salt=${salt}, Signature=${hex}`;
}

export async function sendAttendanceSms(studentName: string, status: 'late' | 'absent' | 'present', date: string, minutesLate?: number): Promise<{ success: boolean; error?: string }> {
  try {
    // 학부모 전화번호 조회
    const { data: student } = await supabase
      .from('students')
      .select('parent_phone')
      .eq('name', studentName)
      .single();

    const apiKey    = import.meta.env.VITE_SOLAPI_API_KEY as string;
    const apiSecret = import.meta.env.VITE_SOLAPI_API_SECRET as string;
    const senderRaw = import.meta.env.VITE_SENDER_PHONE as string;

    if (!apiKey || !apiSecret || !senderRaw) {
      return { success: false, error: 'Vercel 환경변수(VITE_SOLAPI_API_KEY 등)가 설정되지 않았습니다' };
    }

    const from = senderRaw.replace(/[^0-9]/g, '');
    const testPhone = await getSmsTestPhone();
    const parentPhone = student?.parent_phone?.replace(/[^0-9]/g, '') ?? '';
    const to = testPhone || parentPhone;
    if (!to) return { success: false, error: '학부모 전화번호가 등록되지 않았습니다' };

    const dateStr = new Date(date + 'T00:00:00+09:00')
      .toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });
    const lateStr = (() => {
      if (status !== 'late' || !minutesLate) return '지각';
      if (minutesLate < 60) return `${minutesLate}분 지각`;
      const h = Math.floor(minutesLate / 60), m = minutesLate % 60;
      return m > 0 ? `${h}시간 ${m}분 지각` : `${h}시간 지각`;
    })();
    const text = status === 'present'
      ? `[최강학원] ${studentName} 학생이 오늘(${dateStr}) 학원에 도착했습니다.`
      : `[최강학원] ${studentName} 학생이 오늘(${dateStr}) 수업에 ${status === 'late' ? lateStr : '결석'}했습니다.`;

    const res = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': await solapiSign(apiKey, apiSecret),
      },
      body: JSON.stringify({
        message: {
          to,
          from,
          text,
        },
      }),
    });

    const result = await res.json();
    if (!res.ok) return { success: false, error: result.errorMessage ?? JSON.stringify(result) };
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Aligo SMS ─────────────────────────────────────────────

async function aligoPost(to: string, text: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, text }),
    });
    return await res.json();
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function sendAligoAttendanceSms(
  studentName: string,
  status: 'late' | 'absent' | 'present',
  date: string,
  minutesLate?: number
): Promise<{ success: boolean; error?: string }> {
  const { data: student } = await supabase.from('students').select('parent_phone').eq('name', studentName).single();
  const testPhone = await getSmsTestPhone();
  const parentPhone = (student?.parent_phone ?? '').replace(/[^0-9]/g, '');
  const to = testPhone || parentPhone;
  if (!to) return { success: false, error: '학부모 전화번호가 등록되지 않았습니다' };

  const dateStr = new Date(date + 'T00:00:00+09:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });
  const lateStr = (() => {
    if (status !== 'late' || !minutesLate) return '지각';
    if (minutesLate < 60) return `${minutesLate}분 지각`;
    const h = Math.floor(minutesLate / 60), m = minutesLate % 60;
    return m > 0 ? `${h}시간 ${m}분 지각` : `${h}시간 지각`;
  })();
  const text = status === 'present'
    ? `[최강학원] ${studentName} 학생이 오늘(${dateStr}) 학원에 도착했습니다.`
    : `[최강학원] ${studentName} 학생이 오늘(${dateStr}) 수업에 ${status === 'late' ? lateStr : '결석'}했습니다.`;
  return aligoPost(to, text);
}

export async function sendSmsToStudents(studentIds: string[], text: string): Promise<{ sent: number; failed: number }> {
  const testPhone = await getSmsTestPhone();
  const { data } = await supabase.from('students').select('parent_phone').in('id', studentIds).not('parent_phone', 'is', null).neq('parent_phone', '');
  const phones = testPhone ? [testPhone] : [...new Set((data ?? []).map((r: { parent_phone: string }) => r.parent_phone.replace(/[^0-9]/g, '')).filter(Boolean))];
  let sent = 0, failed = 0;
  for (const to of phones) {
    const r = await aligoPost(to, text);
    r.success ? sent++ : failed++;
  }
  return { sent, failed };
}

export async function sendAligoBulkSms(text: string): Promise<{ sent: number; failed: number }> {
  const testPhone = await getSmsTestPhone();
  const { data } = await supabase.from('students').select('parent_phone').not('parent_phone', 'is', null).neq('parent_phone', '');
  const allPhones = [...new Set((data ?? []).map((r: { parent_phone: string }) => r.parent_phone.replace(/[^0-9]/g, '')).filter(Boolean))];
  const phones = testPhone ? [testPhone] : allPhones;
  let sent = 0, failed = 0;
  for (const to of phones) {
    const r = await aligoPost(to, text);
    r.success ? sent++ : failed++;
  }
  return { sent, failed };
}

export async function sendTestSms(to: string, text: string): Promise<{ success: boolean; error?: string }> {
  try {
    const apiKey    = import.meta.env.VITE_SOLAPI_API_KEY as string;
    const apiSecret = import.meta.env.VITE_SOLAPI_API_SECRET as string;
    const from      = (import.meta.env.VITE_SENDER_PHONE as string).replace(/[^0-9]/g, '');
    const res = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': await solapiSign(apiKey, apiSecret) },
      body: JSON.stringify({ message: { to: to.replace(/[^0-9]/g, ''), from, text } }),
    });
    const result = await res.json();
    if (!res.ok) return { success: false, error: result.errorMessage ?? JSON.stringify(result) };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function sendBulkSms(text: string): Promise<{ sent: number; failed: number }> {
  const apiKey    = import.meta.env.VITE_SOLAPI_API_KEY as string;
  const apiSecret = import.meta.env.VITE_SOLAPI_API_SECRET as string;
  const from      = (import.meta.env.VITE_SENDER_PHONE as string).replace(/[^0-9]/g, '');

  const testPhone = await getSmsTestPhone();
  const { data } = await supabase.from('students').select('parent_phone').not('parent_phone', 'is', null).neq('parent_phone', '');
  const allPhones = [...new Set((data ?? []).map((r: { parent_phone: string }) => r.parent_phone.replace(/[^0-9]/g, '')).filter(Boolean))];
  const phones = testPhone ? [testPhone] : allPhones;

  let sent = 0, failed = 0;
  for (const to of phones) {
    try {
      const res = await fetch('https://api.solapi.com/messages/v4/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': await solapiSign(apiKey, apiSecret) },
        body: JSON.stringify({ message: { to, from, text } }),
      });
      res.ok ? sent++ : failed++;
    } catch { failed++; }
  }
  return { sent, failed };
}

export async function deleteStudent(id: string): Promise<void> {
  // 학생 이름 먼저 조회
  const { data: student } = await supabase.from('students').select('name').eq('id', id).single();
  const { error } = await supabase.from('students').delete().eq('id', id);
  if (error) throw error;
  // 오늘 출결 기록도 삭제
  if (student?.name) {
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from('attendance').delete()
      .eq('student_name', student.name)
      .eq('date', today);
  }
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

export async function fetchAttendanceByWeek(): Promise<AttendanceRecord[]> {
  const weekStart = getWeekStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .gte('date', weekStart.toISOString().slice(0, 10))
    .lte('date', weekEnd.toISOString().slice(0, 10));
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id as string,
    studentName: row.student_name as string,
    date: row.date as string,
    status: row.status as AttendanceRecord['status'],
    note: (row.note as string) ?? '',
  }));
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

// ── exam scores (학교 시험 성적) ────────────────────────────

export const EXAM_SUBJECTS = ['국어', '영어', '수학', '사회', '과학', '역사'] as const;

export interface ExamScore {
  id: string;
  studentName: string;
  className: string;
  examName: string;
  subject: string;
  score: number;
  maxScore: number;
  createdAt: string;
}

function mapExamScore(row: Record<string, unknown>): ExamScore {
  return {
    id: row.id as string,
    studentName: row.student_name as string,
    className: (row.class_name as string) ?? '',
    examName: row.exam_name as string,
    subject: row.subject as string,
    score: row.score as number,
    maxScore: (row.max_score as number) ?? 100,
    createdAt: row.created_at as string,
  };
}

export async function fetchExamScores(): Promise<ExamScore[]> {
  const { data, error } = await supabase
    .from('exam_scores')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapExamScore);
}

export async function upsertExamScore(payload: {
  studentName: string; className: string; examName: string; subject: string; score: number; maxScore: number;
}): Promise<ExamScore> {
  const { data, error } = await supabase
    .from('exam_scores')
    .upsert({
      student_name: payload.studentName,
      class_name: payload.className,
      exam_name: payload.examName,
      subject: payload.subject,
      score: payload.score,
      max_score: payload.maxScore,
    }, { onConflict: 'student_name,exam_name,subject' })
    .select()
    .single();
  if (error) throw error;
  return mapExamScore(data);
}

export async function deleteExamScore(id: string): Promise<void> {
  const { error } = await supabase.from('exam_scores').delete().eq('id', id);
  if (error) throw error;
}

// ── class notices (알림장) ─────────────────────────────────

export const NOTICE_SUBJECTS = ['국어/역사', '수학', '영어', '과학/사회'] as const;
export type NoticeSubject = typeof NOTICE_SUBJECTS[number];

export interface ClassNotice {
  id: string;
  className: string;
  content: string;
  subject?: string;
  createdAt: string;
}

function kstTodayRange() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    start: new Date(d + 'T00:00:00+09:00').toISOString(),
    end:   new Date(d + 'T23:59:59+09:00').toISOString(),
  };
}

function mapNotice(r: Record<string, unknown>): ClassNotice {
  return {
    id: r.id as string,
    className: r.class_name as string,
    content: r.content as string,
    subject: (r.subject as string) || undefined,
    createdAt: r.created_at as string,
  };
}

export async function fetchClassNotices(className: string): Promise<ClassNotice[]> {
  const { start, end } = kstTodayRange();
  const { data, error } = await supabase
    .from('class_notices')
    .select('*')
    .eq('class_name', className)
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapNotice);
}

export async function fetchAllClassNotices(): Promise<ClassNotice[]> {
  const { start, end } = kstTodayRange();
  const { data, error } = await supabase
    .from('class_notices')
    .select('*')
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapNotice);
}

export async function addClassNotice(className: string, content: string, subject?: string): Promise<void> {
  const { error } = await supabase
    .from('class_notices')
    .insert({ class_name: className, content, subject: subject ?? null });
  if (error) throw error;
}

export async function deleteClassNotice(id: string): Promise<void> {
  const { error } = await supabase
    .from('class_notices')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function getNoticeOrder(): Promise<string[]> {
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase.from('school_settings').select('value').eq('key', `notice_order_${today}`).single();
  try { return data?.value ? JSON.parse(data.value) : []; } catch { return []; }
}

export async function setNoticeOrder(ids: string[]): Promise<void> {
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await supabase.from('school_settings').upsert(
    { key: `notice_order_${today}`, value: JSON.stringify(ids) },
    { onConflict: 'key' }
  );
}

// ── parent messages (선생님께 한마디) ──────────────────────

export interface ParentMessage {
  id: string;
  studentName: string;
  className: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export async function addParentMessage(studentName: string, className: string, message: string): Promise<void> {
  const { error } = await supabase
    .from('parent_messages')
    .insert({ student_name: studentName, class_name: className, message });
  if (error) throw error;
}

export async function fetchParentMessages(): Promise<ParentMessage[]> {
  const { data, error } = await supabase
    .from('parent_messages')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id as string,
    studentName: r.student_name as string,
    className: (r.class_name as string) ?? '',
    message: r.message as string,
    isRead: r.is_read as boolean,
    createdAt: r.created_at as string,
  }));
}

export async function markParentMessageRead(id: string): Promise<void> {
  await supabase.from('parent_messages').update({ is_read: true }).eq('id', id);
}

export async function deleteParentMessage(id: string): Promise<void> {
  await supabase.from('parent_messages').delete().eq('id', id);
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

// ── school location ───────────────────────────────────────

export interface SchoolLocation { lat: number; lng: number }

export async function getSchoolLocation(): Promise<SchoolLocation | null> {
  const { data, error } = await supabase
    .from('school_settings')
    .select('value')
    .eq('key', 'school_location')
    .single();
  if (error || !data) return null;
  try { return JSON.parse(data.value); } catch { return null; }
}

export async function setSchoolLocation(lat: number, lng: number): Promise<void> {
  const { error } = await supabase.from('school_settings').upsert(
    { key: 'school_location', value: JSON.stringify({ lat, lng }) },
    { onConflict: 'key' }
  );
  if (error) throw error;
}

export async function getSmsTestPhone(): Promise<string> {
  const { data } = await supabase.from('school_settings').select('value').eq('key', 'sms_test_phone').single();
  return data?.value ?? '';
}

export async function setSmsTestPhone(phone: string): Promise<void> {
  await supabase.from('school_settings').upsert(
    { key: 'sms_test_phone', value: phone.replace(/[^0-9]/g, '') },
    { onConflict: 'key' }
  );
}

export interface OpenDate { date: string; time?: string; classes?: string[]; }

export async function getSpecialDates(): Promise<{ closed: string[]; open: OpenDate[] }> {
  const { data } = await supabase.from('school_settings').select('key,value').in('key', ['closed_dates', 'open_dates']);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  const closed = map['closed_dates'] ? map['closed_dates'].split(',').filter(Boolean) : [];
  let open: OpenDate[] = [];
  try { open = map['open_dates'] ? JSON.parse(map['open_dates']) : []; } catch { open = []; }
  return { closed, open };
}

export async function setSpecialDates(closed: string[], open: OpenDate[]): Promise<void> {
  await supabase.from('school_settings').upsert([
    { key: 'closed_dates', value: closed.join(',') },
    { key: 'open_dates', value: JSON.stringify(open) },
  ], { onConflict: 'key' });
}

export async function getAutoAbsentSms(): Promise<boolean> {
  const { data } = await supabase.from('school_settings').select('value').eq('key', 'auto_absent_sms').single();
  return data?.value === 'true';
}

export async function setAutoAbsentSms(enabled: boolean): Promise<void> {
  await supabase.from('school_settings').upsert(
    { key: 'auto_absent_sms', value: String(enabled) },
    { onConflict: 'key' }
  );
}

export async function getGpsBypassUntil(): Promise<number | null> {
  const { data } = await supabase.from('school_settings').select('value').eq('key', 'gps_bypass_until').single();
  if (!data) return null;
  return Number(data.value);
}

export async function setGpsBypassUntil(until: number | null): Promise<void> {
  if (until === null) {
    await supabase.from('school_settings').delete().eq('key', 'gps_bypass_until');
  } else {
    await supabase.from('school_settings').upsert(
      { key: 'gps_bypass_until', value: String(until) },
      { onConflict: 'key' }
    );
  }
}

export async function getCheckinTimeBypassed(): Promise<boolean> {
  const { data } = await supabase.from('school_settings').select('value').eq('key', 'checkin_time_bypass_until').single();
  if (!data) return false;
  return Date.now() < Number(data.value);
}

export async function setCheckinTimeBypassUntil(until: number | null): Promise<void> {
  if (until === null) {
    await supabase.from('school_settings').delete().eq('key', 'checkin_time_bypass_until');
  } else {
    await supabase.from('school_settings').upsert(
      { key: 'checkin_time_bypass_until', value: String(until) },
      { onConflict: 'key' }
    );
  }
}

// Haversine 거리 계산 (미터)
export function calcDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── class schedules ───────────────────────────────────────

export interface ClassSchedule {
  gradeKey: string;  // '1학년', '2학년', '3학년'
  startTime: string; // 'HH:MM'
}

export async function fetchClassSchedules(): Promise<ClassSchedule[]> {
  const { data, error } = await supabase
    .from('class_schedules')
    .select('*')
    .order('grade_key');
  if (error) throw error;
  return (data ?? []).map(row => ({
    gradeKey: row.grade_key as string,
    startTime: row.start_time as string,
  }));
}

export async function upsertClassSchedule(gradeKey: string, startTime: string): Promise<void> {
  const { error } = await supabase
    .from('class_schedules')
    .upsert({ grade_key: gradeKey, start_time: startTime, updated_at: new Date().toISOString() },
      { onConflict: 'grade_key' });
  if (error) throw error;
}

export async function deleteClassSchedule(gradeKey: string): Promise<void> {
  const { error } = await supabase
    .from('class_schedules')
    .delete()
    .eq('grade_key', gradeKey);
  if (error) throw error;
}

const GRADE_DEFAULTS: Record<string, string> = {
  '중등부 1학년': '16:30',
  '중등부 2학년': '18:30',
  '중등부 3학년': '16:30',
  '고등부 1학년': '16:30',
  '고등부 2학년': '16:30',
  '고등부 3학년': '16:30',
};

function classToGradeKey(className: string): string | null {
  const gradeMatch = className.match(/(\d+)학년/);
  if (!gradeMatch) return null;
  const grade = `${gradeMatch[1]}학년`;
  const isHigh = /고등|고교/.test(className);
  return `${isHigh ? '고등부' : '중등부'} ${grade}`;
}

export function getStartTime(className: string, schedules: ClassSchedule[]): string {
  // 반별 개별 설정 우선 (같은 학년이라도 시간대가 다른 반 대응)
  const exact = schedules.find(s => s.gradeKey === className);
  if (exact) return exact.startTime;

  const key = classToGradeKey(className);
  if (!key) return '16:30';
  // 신 형식 먼저 ('중등부 1학년')
  const schedule = schedules.find(s => s.gradeKey === key);
  if (schedule) return schedule.startTime;
  // 구 형식 호환 ('1학년') — DB 마이그레이션 전까지 폴백
  const gradeMatch = className.match(/(\d+)학년/);
  if (gradeMatch) {
    const old = schedules.find(s => s.gradeKey === `${gradeMatch[1]}학년`);
    if (old) return old.startTime;
  }
  return GRADE_DEFAULTS[key] ?? '16:30';
}

// 현재 시각(KST)이 수업 시작 시간보다 늦으면 지각
const LATE_GRACE_MIN = 3;

export function checkIfLate(startTime: string): boolean {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const nowMinutes = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes();
  const [h, m] = startTime.split(':').map(Number);
  return nowMinutes > h * 60 + m + LATE_GRACE_MIN;
}

export function calcMinutesLate(startTime: string): number {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const nowMinutes = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes();
  const [h, m] = startTime.split(':').map(Number);
  return Math.max(0, nowMinutes - (h * 60 + m));
}

// 수업 시작 10분 후 미체크인 중등부 학생 자동 결석 처리
export async function autoMarkAbsent(sendSms = false): Promise<void> {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = kstNow.toISOString().slice(0, 10);
  const nowMin = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes();
  const AUTO_DELAY_MIN = 10;
  const isWeekend = kstNow.getUTCDay() === 0 || kstNow.getUTCDay() === 6;

  const { closed, open } = await getSpecialDates();
  if (closed.includes(today)) return; // 휴원일
  const openEntry = open.find(o => o.date === today);
  if (isWeekend && !openEntry) return; // 주말인데 보강 등록 안 됨

  const [att, stu, sch] = await Promise.all([
    fetchAttendanceByDate(today),
    fetchStudents(),
    fetchClassSchedules(),
  ]);

  for (const student of stu) {
    if (!student.className) continue;
    if (/고등|고교/.test(student.className)) continue;

    // 보강일에 반이 지정된 경우, 해당 반이 아니면 오늘 수업 없음
    const appliesToday = !openEntry?.classes?.length || openEntry.classes.includes(student.className);
    if (isWeekend && !appliesToday) continue;

    const startTime = (appliesToday && openEntry?.time) || getStartTime(student.className, sch);
    const [h, m] = startTime.split(':').map(Number);
    if (nowMin < h * 60 + m + AUTO_DELAY_MIN) continue;
    if (att.find(a => a.studentName === student.name)) continue;

    await upsertAttendance({ studentName: student.name, date: today, status: 'absent', note: '' });

    if (sendSms && student.parentPhone) {
      const key = `${student.name}-absent`;
      const stored = JSON.parse(localStorage.getItem(`sms-sent-${today}`) ?? '{}');
      if (!stored[key]) {
        const result = await sendAligoAttendanceSms(student.name, 'absent', today);
        if (result.success) {
          stored[key] = true;
          localStorage.setItem(`sms-sent-${today}`, JSON.stringify(stored));
        }
      }
    }
  }
}
