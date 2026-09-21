-- 요일별 수업 시작 시간 (기존 class_schedules 는 건드리지 않음)
-- grade_key: '중등부 2학년' 같은 학년 키 또는 반 이름 (class_schedules 와 동일 규칙)
-- weekday  : 0=일, 1=월, … 6=토
create table if not exists class_weekday_schedules (
  grade_key  text        not null,
  weekday    smallint    not null check (weekday between 0 and 6),
  start_time text        not null,
  updated_at timestamptz not null default now(),
  primary key (grade_key, weekday)
);

-- class_schedules 에 RLS 를 켜뒀다면 같은 정책을 여기에도 추가해야 합니다.
