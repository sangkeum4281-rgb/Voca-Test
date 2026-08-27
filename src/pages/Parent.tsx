import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchStudents, fetchAttendanceByMonth, fetchClassNoticesByMonth, getNoticeOrder, addParentMessage, type ClassNotice } from '../lib/db';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Loader, CalendarDays, Bell, History, MessageSquarePlus } from 'lucide-react';

function dayOfKST(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const SUBJECT_COLORS: Record<string, string> = {
  '국어/역사': 'text-blue-700 bg-blue-100',
  '수학': 'text-green-700 bg-green-100',
  '영어': 'text-violet-700 bg-violet-100',
  '과학/사회': 'text-orange-700 bg-orange-100',
};

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
  const [noticeOrder, setNoticeOrder] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  const [msgSent, setMsgSent] = useState(false);

  const loadData = async (name: string, y: number, m: number) => {
    setLoading(true);
    setNotFound(false);
    try {
      const students = await fetchStudents();
      const student = students.find(s => s.name === name.trim());
      if (!student) { setNotFound(true); setLoading(false); return; }

      setClassName(student.className ?? '');
      const [att, nts, order] = await Promise.all([
        fetchAttendanceByMonth(y, m),
        student.className ? fetchClassNoticesByMonth(student.className, y, m) : Promise.resolve([]),
        getNoticeOrder(),
      ]);

      const map: Record<number, Status> = {};
      for (const r of att.filter(r => r.studentName === name.trim())) {
        map[parseInt(r.date.slice(8, 10))] = r.status as Status;
      }
      setAttMap(map);
      setNotices(nts);
      setNoticeOrder(order);
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

  const todayStr = dayOfKST(new Date().toISOString());
  const todayNotices = notices.filter(n => dayOfKST(n.createdAt) === todayStr);
  if (noticeOrder.length > 0) {
    todayNotices.sort((a, b) => {
      const ai = noticeOrder.indexOf(a.id);
      const bi = noticeOrder.indexOf(b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }
  const pastByDate = notices
    .filter(n => dayOfKST(n.createdAt) !== todayStr)
    .reduce<Record<string, ClassNotice[]>>((acc, n) => {
      const day = dayOfKST(n.createdAt);
      (acc[day] ??= []).push(n);
      return acc;
    }, {});

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
            {todayNotices.length > 0 && (
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
                {todayNotices.map(n => (
                  <div key={n.id} className="bg-white rounded-lg border border-amber-100 px-3 py-2.5">
                    {n.subject && (
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-1.5 ${SUBJECT_COLORS[n.subject] ?? 'text-amber-700 bg-amber-100'}`}>{n.subject}</span>
                    )}
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── 지난 알림장 (이번에 조회 중인 달) ── */}
            {Object.keys(pastByDate).length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                <button type="button" onClick={() => setHistoryOpen(v => !v)}
                  className="w-full flex items-center justify-between text-sm font-semibold text-slate-600">
                  <span className="flex items-center gap-1.5"><History size={14} className="text-slate-400" /> {year}년 {month}월 지난 알림장</span>
                  {historyOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {historyOpen && (
                  <div className="space-y-3 pt-1">
                    {Object.entries(pastByDate).sort((a, b) => b[0].localeCompare(a[0])).map(([day, items]) => (
                      <div key={day} className="space-y-1.5">
                        <p className="text-xs font-bold text-slate-400">
                          {new Date(day + 'T00:00:00+09:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                        </p>
                        {items.map(n => (
                          <div key={n.id} className="bg-slate-50 rounded-lg border border-slate-100 px-3 py-2.5">
                            {n.subject && (
                              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-1 ${SUBJECT_COLORS[n.subject] ?? 'text-amber-700 bg-amber-100'}`}>{n.subject}</span>
                            )}
                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.content}</p>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-slate-400 pt-1">다른 달은 아래 월 이동으로 조회하세요</p>
              </div>
            )}

            {/* ── 선생님께 한마디 ── */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquarePlus size={15} className="text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-700">선생님께 한마디</h2>
              </div>
              {msgSent ? (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 text-center">
                  전달되었습니다 ✓
                </div>
              ) : (
                <>
                  <textarea
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    placeholder="선생님께 전달하고 싶은 내용을 자유롭게 적어주세요"
                    rows={3}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    disabled={!msgText.trim() || msgSending}
                    onClick={async () => {
                      if (!msgText.trim()) return;
                      setMsgSending(true);
                      try {
                        await addParentMessage(nameInput.trim(), className, msgText.trim());
                        setMsgText('');
                        setMsgSent(true);
                        setTimeout(() => setMsgSent(false), 4000);
                      } finally { setMsgSending(false); }
                    }}
                    className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {msgSending ? <Loader size={14} className="animate-spin" /> : '전달하기'}
                  </button>
                </>
              )}
            </div>

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
