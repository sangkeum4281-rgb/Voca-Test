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
}

const isHighSchool = (cls: string) => /고등|고교|고\s*\d*\s*학년/.test(cls);

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
  })));
}

export async function addStudent(name: string, className: string, parentPhone = ''): Promise<Student> {
  const { data, error } = await supabase
    .from('students')
    .insert({ name, class_name: className, parent_phone: parentPhone })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, className: data.class_name ?? '', parentPhone: data.parent_phone ?? '', createdAt: data.created_at };
}

export async function updateStudentPhone(id: string, parentPhone: string): Promise<void> {
  const { error } = await supabase.from('students').update({ parent_phone: parentPhone }).eq('id', id);
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

export async function sendAttendanceSms(studentName: string, status: 'late' | 'absent' | 'present', date: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 학부모 전화번호 조회
    const { data: student } = await supabase
      .from('students')
      .select('parent_phone')
      .eq('name', studentName)
      .single();

    if (!student?.parent_phone) {
      return { success: false, error: '학부모 전화번호가 등록되지 않았습니다' };
    }

    const apiKey    = import.meta.env.VITE_SOLAPI_API_KEY as string;
    const apiSecret = import.meta.env.VITE_SOLAPI_API_SECRET as string;
    const senderRaw = import.meta.env.VITE_SENDER_PHONE as string;

    if (!apiKey || !apiSecret || !senderRaw) {
      return { success: false, error: 'Vercel 환경변수(VITE_SOLAPI_API_KEY 등)가 설정되지 않았습니다' };
    }

    const from = senderRaw.replace(/[^0-9]/g, '');

    const dateStr = new Date(date + 'T00:00:00+09:00')
      .toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    const text = status === 'present'
      ? `[최강학원] ${studentName} 학생이 오늘(${dateStr}) 학원에 도착했습니다.`
      : `[최강학원] ${studentName} 학생이 오늘(${dateStr}) 수업에 ${status === 'late' ? '지각' : '결석'}했습니다.`;

    const res = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': await solapiSign(apiKey, apiSecret),
      },
      body: JSON.stringify({
        message: {
          to: student.parent_phone.replace(/[^0-9]/g, ''),
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

// 학년별 기본 시간 (DB 로드 실패 시 폴백)
const GRADE_DEFAULTS: Record<string, string> = {
  '1학년': '16:30',
  '2학년': '18:30',
  '3학년': '16:30',
};

// 학생의 반에서 학년 추출 후 수업 시작 시간 반환
export function getStartTime(className: string, schedules: ClassSchedule[]): string {
  const gradeMatch = className.match(/(\d+학년)/);
  if (!gradeMatch) return '16:30';
  const grade = gradeMatch[1];
  const schedule = schedules.find(s => s.gradeKey === grade);
  return schedule?.startTime ?? GRADE_DEFAULTS[grade] ?? '16:30';
}

// 현재 시각(KST)이 수업 시작 시간보다 늦으면 지각
export function checkIfLate(startTime: string): boolean {
  // UTC + 9시간 = KST, 기기 타임존 무관하게 동작
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const nowMinutes = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes();
  const [h, m] = startTime.split(':').map(Number);
  return nowMinutes > h * 60 + m;
}
