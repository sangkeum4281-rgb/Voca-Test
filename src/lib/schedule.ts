// 수업 시작 시간 계산 (순수 함수 — 프론트(db.ts)와 서버(api/auto-absent.ts)가 공유)
// 여기서 supabase/브라우저 API를 import 하지 말 것.

export interface ClassSchedule {
  gradeKey: string;  // '중등부 1학년' 같은 학년 키, 또는 반 이름
  startTime: string; // 'HH:MM'
}

export interface WeekdaySchedule {
  gradeKey: string;  // 학년 키 또는 반 이름
  weekday: number;   // 0=일 … 6=토
  startTime: string;
}

export interface OpenDate {
  date: string;        // 'YYYY-MM-DD'
  time?: string;       // 그날 시작 시간 (없으면 평소 시간)
  classes?: string[];  // 대상 반 (없으면 전체)
  off?: boolean;       // true면 대상 반은 그날 수업 없음 (휴강)
}

export interface SpecialDates {
  closed: string[];
  open: OpenDate[];
}

export const DEFAULT_START_TIME = '16:30';

export const GRADE_DEFAULTS: Record<string, string> = {
  '중등부 1학년': '16:30',
  '중등부 2학년': '18:30',
  '중등부 3학년': '16:30',
  '고등부 1학년': '16:30',
  '고등부 2학년': '16:30',
  '고등부 3학년': '16:30',
};

export function classToGradeKey(className: string): string | null {
  const gradeMatch = className.match(/(\d+)학년/);
  if (!gradeMatch) return null;
  const grade = `${gradeMatch[1]}학년`;
  const isHigh = /고등|고교/.test(className);
  return `${isHigh ? '고등부' : '중등부'} ${grade}`;
}

/** 'YYYY-MM-DD'(KST 날짜 문자열)의 요일. 0=일 … 6=토 */
export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/**
 * 날짜 예외를 뺀 "평소" 시작 시간.
 * 우선순위: 반(요일) > 반(전체) > 학년(요일) > 학년(전체) > 구형식 학년 > 기본값
 * 같은 대상 안에서는 요일별 설정이 전체 설정보다 우선.
 */
export function getStartTime(
  className: string,
  schedules: ClassSchedule[],
  weekday?: number,
  weekdaySchedules: WeekdaySchedule[] = [],
): string {
  const gradeKey = classToGradeKey(className);
  const gradeMatch = className.match(/(\d+)학년/);
  // 구 형식 호환 ('1학년') — DB 마이그레이션 전까지 폴백
  const oldKey = gradeMatch ? `${gradeMatch[1]}학년` : null;

  for (const key of [className, gradeKey, oldKey]) {
    if (!key) continue;
    if (weekday !== undefined) {
      const byDay = weekdaySchedules.find(s => s.gradeKey === key && s.weekday === weekday);
      if (byDay) return byDay.startTime;
    }
    const base = schedules.find(s => s.gradeKey === key);
    if (base) return base.startTime;
  }
  return (gradeKey && GRADE_DEFAULTS[gradeKey]) ?? DEFAULT_START_TIME;
}

// 같은 날짜에 항목이 여러 개일 수 있음: 해당 반을 명시한 항목 > 전체 반 항목
function pickOpenEntry(open: OpenDate[], date: string, className: string): OpenDate | undefined {
  const sameDay = open.filter(o => o.date === date);
  return sameDay.find(o => o.classes?.includes(className))
    ?? sameDay.find(o => !o.classes?.length);
}

/**
 * 그 반의 해당 날짜 수업 시작 시간. 수업이 없는 날이면 null.
 * 적용 순서: 휴원일/휴강 → (주말은 보강 등록 필요) → 날짜별 시간 → 요일별/반/학년 시간
 */
export function resolveStartTime(
  className: string,
  dateStr: string,
  ctx: { schedules: ClassSchedule[]; weekdaySchedules?: WeekdaySchedule[]; special: SpecialDates },
): string | null {
  if (ctx.special.closed.includes(dateStr)) return null;

  const entry = pickOpenEntry(ctx.special.open, dateStr, className);
  if (entry?.off) return null;

  const weekday = weekdayOf(dateStr);
  const isWeekend = weekday === 0 || weekday === 6;
  if (isWeekend && !entry) return null;

  if (entry?.time) return entry.time;
  return getStartTime(className, ctx.schedules, weekday, ctx.weekdaySchedules);
}
