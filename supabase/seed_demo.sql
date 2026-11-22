-- 포트폴리오 데모용 가짜 데이터 (실존 인물·학교 아님)
-- 전화번호는 010-0000-XXXX: 실제 사용되지 않는 번호대. 그래도 문자 키는 꼭 비워둔 상태에서 실행할 것.

-- 1. 학생 12명 (3개 반)
insert into students (name, class_name, parent_phone) values
('김하늘','새봄중 3학년','010-0000-0001'),('이도윤','새봄중 3학년','010-0000-0002'),
('박서연','새봄중 3학년','010-0000-0003'),('최지호','새봄중 3학년','010-0000-0004'),
('정예린','한빛고 1학년','010-0000-0005'),('강민준','한빛고 1학년','010-0000-0006'),
('조수아','한빛고 1학년','010-0000-0007'),('윤시우','한빛고 1학년','010-0000-0008'),
('장하은','한빛고 2학년','010-0000-0009'),('임준서','한빛고 2학년','010-0000-0010'),
('한지아','한빛고 2학년','010-0000-0011'),('오태윤','한빛고 2학년','010-0000-0012');

-- 2. 최근 3주 평일 출결 (대부분 출석, 일부 지각·결석)
insert into attendance (student_name, date, status, note)
select s.name, d::date,
  case when (abs(hashtext(s.name || d::text)) % 20) = 0 then 'absent'
       when (abs(hashtext(s.name || d::text)) % 20) < 3 then 'late'
       else 'present' end,
  case when (abs(hashtext(s.name || d::text)) % 20) between 1 and 2 then '10분 지각' else '' end
from students s,
     generate_series(current_date - 21, current_date - 1, interval '1 day') d
where extract(isodow from d) < 6
on conflict (student_name, date) do nothing;

-- 3. 성적 (중간·기말 두 번, 영어)
insert into exam_scores (student_name, class_name, exam_name, subject, score, max_score)
select s.name, s.class_name, e.exam_name, '영어',
  least(100, 65 + (abs(hashtext(s.name || e.exam_name)) % 30) + e.bonus), 100
from students s,
     (values ('2학기 중간고사', 0), ('2학기 기말고사', 6)) as e(exam_name, bonus)
on conflict (student_name, exam_name, subject) do nothing;

-- 4. 알림장
insert into class_notices (class_name, content, subject) values
('한빛고 2학년','모의고사 34번 지문 복습, 단어장 Day 12 시험 대비','영어'),
('한빛고 1학년','교과서 3과 본문 해석 노트 작성','영어'),
('새봄중 3학년','문법 워크북 p.40~45','영어');

-- 5. 공지
insert into announcements (title, content, pinned) values
('기말고사 대비 보강 안내','시험 2주 전부터 토요일 보강을 진행합니다.', true);
