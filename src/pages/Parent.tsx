import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchStudents, fetchAttendanceByMonth, fetchClassNotices, type ClassNotice } from '../lib/db';
import { ChevronLeft, ChevronRight, Loader, CalendarDays, Bell } from 'lucide-react';

const STATUS_CONFIG = {
  present: { label: '출석', short: '출', cell: 'bg-green-100 text-green-700' },
  late:    { label: '지각', short: '지', cell: 'bg-yellow-100 text-yellow-700' },
  absent:  { label: '결석', short: '결', cell: 'bg-red-100 text-red-700' },
} as const;

type Status = keyof typeof STATUS_CONFIG;

function todayKST() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export default function Parent() {
  const [params] = useSearchParams();
  const [nameInput, setNameInput] = useState(params.get('name') ?? '');
  const [searched, setSearched] = useState(!!params.get('name'));

  const now = todayKST();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);

  const [className, setClassName] = useState('');
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [attMap, setAttMap] = useState<Record<number, Status>>({});
  const [notices, setNotices] = useState<ClassNotice[]>([]);

  const loadData = async (name: string, y: number, m: number) => {
    setLoading(true);
    setNotFound(false);
    try {
      const students = await fetchStudents();
      const student = students.find(s => s.name === name.trim());
      if (!student) { setNotFound(true); setLoading(false); return; }

      setClassName(student.className ?? '');
      const [att, nts] = await Promise.all([
        fetchAttendanceByMonth(y, m),
        student.className ? fetchClassNotices(student.className) : Promise.resolve([]),
      ]);

      const map: Record<number, Status> = {};
      for (const r of att.filter(r => r.studentName === name.trim())) {
        map[parseInt(r.date.slice(8, 10))] = r.status as Status;
      }
      setAttMap(map);
      setNotices(nts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searched && nameInput.trim()) loadData(nameInput, year, month);
  }, [year, month]);

  const handleSearch = () => {
    if (!nameInput.trim()) return;
    setSearched(true);
    loadData(nameInput, year, month);
  };

  const shiftMonth = (delta: number) => {
    let y = year, m = month + delta;
    if (m > 12) { m = 1; y++; }
    if (m < 1)  { m = 12; y--; }
    setYear(y); setMonth(m);
  };

  const lastDay = new Date(year, month, 0).getDate();
  const days = Array.from({ length: lastDay }, (_, i) => i + 1);
  const presentCnt = Object.values(attMap).filter(v => v === 'present').length;
  const lateCnt    = Object.values(attMap).filter(v => v === 'late').length;
  const absentCnt  = Object.values(attMap).filter(v => v === 'absent').length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 헤더 */}
      <div className="bg-indigo-700 text-white px-4 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold">최강학원 학부모 페이지</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* 이름 검색 — URL에 이름 있으면 숨김 */}
        {!params.get('name') && (
          <div className="flex gap-2">
            <input
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="학생 이름 입력"
            />
            <button onClick={handleSearch} disabled={!nameInput.trim() || loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
              {loading ? <Loader size={14} className="animate-spin" /> : '조회'}
            </button>
          </div>
        )}

        {notFound && (
          <p className="text-center text-slate-400 text-sm py-4">등록된 학생 이름이 아닙니다.</p>
        )}

        {searched && !notFound && !loading && className && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-2">
              <span className="font-semibold text-slate-800">{nameInput.trim()}</span>
              <span className="text-xs text-slate-400">{className}</span>
            </div>

            {/* ── 알림장 ── */}
            {notices.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Bell size={15} className="text-amber-600" />
                  <div>
                    <h2 className="font-semibold text-amber-800 text-sm leading-tight">오늘 알림장</h2>
                    <p className="text-xs text-amber-600 mt-0.5">
                      {new Date(Date.now() + 9 * 60 * 60 * 1000).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Seoul' })}
                    </p>
                  </div>
                </div>
                {notices.map(n => {
                  const SUBJECT_COLORS: Record<string, string> = {
                    '국어/역사': 'text-blue-700 bg-blue-100',
                    '수학': 'text-green-700 bg-green-100',
                    '영어': 'text-violet-700 bg-violet-100',
                    '과학/사회': 'text-orange-700 bg-orange-100',
                  };
                  return (
                    <div key={n.id} className="bg-white rounded-lg border border-amber-100 px-3 py-2.5">
                      {n.subject && (
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-1.5 ${SUBJECT_COLORS[n.subject] ?? 'text-amber-700 bg-amber-100'}`}>{n.subject}</span>
                      )}
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.content}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── 월별 출결 ── */}
            <div className="space-y-3">
              {/* 월 이동 */}
              <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3">
                <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded hover:bg-slate-100">
                  <ChevronLeft size={16} />
                </button>
                <div className="flex items-center gap-2">
                  <CalendarDays size={15} className="text-indigo-500" />
                  <span className="font-semibold text-slate-700">{year}년 {month}월</span>
                </div>
                <button onClick={() => shiftMonth(1)} className="p-1.5 rounded hover:bg-slate-100">
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* 통계 */}
              <div className="grid grid-cols-3 gap-3">
                {([['present', presentCnt], ['late', lateCnt], ['absent', absentCnt]] as const).map(([s, cnt]) => {
                  const cfg = STATUS_CONFIG[s];
                  return (
                    <div key={s} className={`rounded-xl border p-3 text-center ${cfg.cell} border-current border-opacity-30`}>
                      <p className="text-2xl font-bold">{cnt}</p>
                      <p className="text-xs mt-0.5">{cfg.label}</p>
                    </div>
                  );
                })}
              </div>

              {/* 달력 */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                  {['일','월','화','수','목','금','토'].map(d => (
                    <p key={d} className="text-xs text-slate-400 font-medium">{d}</p>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: new Date(year, month - 1, 1).getDay() }, (_, i) => (
                    <div key={`e-${i}`} />
                  ))}
                  {days.map(day => {
                    const status = attMap[day];
                    const cfg = status ? STATUS_CONFIG[status] : null;
                    return (
                      <div key={day} className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs ${cfg ? cfg.cell : 'bg-slate-50 text-slate-400'}`}>
                        <p className="font-medium">{day}</p>
                        {cfg && <p className="text-[10px] leading-none">{cfg.short}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
