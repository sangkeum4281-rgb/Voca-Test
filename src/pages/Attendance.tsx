import { useEffect, useState } from 'react';
import {
  fetchStudents, fetchAttendanceByDate,
  fetchAttendanceByMonth, fetchAttendanceByWeek,
  upsertAttendance, deleteAttendance, autoMarkAbsent, getAutoAbsentSms,
  type Student, type AttendanceRecord,
} from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { Loader, ChevronLeft, ChevronRight, RotateCcw, CalendarDays, CalendarCheck, CalendarRange, Printer } from 'lucide-react';

const STATUS_CONFIG = {
  present: { label: '출석', short: '출', color: 'bg-green-100 text-green-700 border-green-300', cell: 'bg-green-100 text-green-700' },
  late:    { label: '지각', short: '지', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', cell: 'bg-yellow-100 text-yellow-700' },
  absent:  { label: '결석', short: '결', color: 'bg-red-100 text-red-700 border-red-300', cell: 'bg-red-100 text-red-700' },
} as const;

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

type TeacherTab = 'daily' | 'weekly' | 'monthly';

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }
function todayKST() { return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10); }

const STUDENT_NAME_KEY = 'vocab-student-name';

export default function Attendance() {
  const { isTeacher } = useAuth();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [teacherTab, setTeacherTab] = useState<TeacherTab>('daily');

  // 일별
  const [date, setDate] = useState(todayKST());
  const [records, setRecords] = useState<Record<string, AttendanceRecord['status'] | null>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  // 주별
  const [weekRecords, setWeekRecords] = useState<AttendanceRecord[]>([]);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0); // 0=이번주, -1=지난주 ...

  // 월별
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthlyRecords, setMonthlyRecords] = useState<AttendanceRecord[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  // 학생용
  const [myName, setMyName] = useState(() => localStorage.getItem(STUDENT_NAME_KEY) ?? '');
  const [myRecords, setMyRecords] = useState<AttendanceRecord[]>([]);
  const [myLoading, setMyLoading] = useState(false);
  const [myYear, setMyYear] = useState(now.getFullYear());
  const [myMonth, setMyMonth] = useState(now.getMonth() + 1);

  useEffect(() => {
    if (isTeacher) {
      fetchStudents().then(s => {
        setStudents(s);
        const classes = [...new Set(s.map(x => x.className).filter(Boolean))];
        if (classes.length > 0) setSelectedClass(classes[0]);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [isTeacher]);

  useEffect(() => {
    if (!isTeacher || !selectedClass || teacherTab !== 'daily') return;
    loadDaily();
  }, [date, selectedClass, teacherTab]);

  useEffect(() => {
    if (!isTeacher || teacherTab !== 'weekly') return;
    loadWeekly();
  }, [teacherTab, weekOffset]);

  useEffect(() => {
    if (!isTeacher || teacherTab !== 'monthly') return;
    loadMonthly();
  }, [year, month, teacherTab]);

  const loadDaily = async () => {
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const today = kstNow.toISOString().slice(0, 10);
    if (isTeacher && date === today) {
      const smsEnabled = await getAutoAbsentSms();
      await autoMarkAbsent(smsEnabled);
    }
    const data = await fetchAttendanceByDate(date);
    const map: Record<string, AttendanceRecord['status'] | null> = {};
    const noteMap: Record<string, string> = {};
    for (const r of data) { map[r.studentName] = r.status; noteMap[r.studentName] = r.note; }
    setRecords(map);
    setNotes(noteMap);
  };

  const getWeekDates = (offset: number): Date[] => {
    const monday = new Date();
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return d;
    });
  };

  const loadWeekly = async () => {
    setWeekLoading(true);
    // fetchAttendanceByWeek는 이번 주 고정이라, offset 있으면 월별로 대체
    if (weekOffset === 0) {
      const data = await fetchAttendanceByWeek();
      setWeekRecords(data);
    } else {
      const dates = getWeekDates(weekOffset);
      const y = dates[0].getFullYear();
      const m = dates[0].getMonth() + 1;
      const data = await fetchAttendanceByMonth(y, m);
      // 해당 주 날짜만 필터
      const dateStrs = new Set(dates.map(d => toDateStr(d)));
      setWeekRecords(data.filter(r => dateStrs.has(r.date)));
    }
    setWeekLoading(false);
  };

  const loadMonthly = async () => {
    setMonthlyLoading(true);
    const data = await fetchAttendanceByMonth(year, month);
    setMonthlyRecords(data);
    setMonthlyLoading(false);
  };

  const mark = async (studentName: string, status: AttendanceRecord['status']) => {
    setSaving(studentName);
    try {
      if (records[studentName] === status) {
        await deleteAttendance(studentName, date);
        setRecords(p => ({ ...p, [studentName]: null }));
      } else {
        await upsertAttendance({ studentName, date, status, note: '' });
        setRecords(p => ({ ...p, [studentName]: status }));
      }
    } catch (e) {
      alert(`저장 실패: ${String(e)}`);
    }
    setSaving(null);
  };

  const loadMyRecords = async (y = myYear, m = myMonth) => {
    if (!myName.trim()) return;
    localStorage.setItem(STUDENT_NAME_KEY, myName.trim());
    setMyLoading(true);
    const data = await fetchAttendanceByMonth(y, m);
    setMyRecords(data.filter(r => r.studentName === myName.trim()));
    setMyLoading(false);
  };

  const shiftDate = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(toDateStr(d));
  };

  const shiftMonth = (delta: number, forStudent = false) => {
    let y = forStudent ? myYear : year;
    let m = (forStudent ? myMonth : month) + delta;
    if (m > 12) { m = 1; y++; }
    if (m < 1)  { m = 12; y--; }
    if (forStudent) { setMyYear(y); setMyMonth(m); loadMyRecords(y, m); }
    else { setYear(y); setMonth(m); }
  };

  const classes = [...new Set(students.map(s => s.className).filter(Boolean))];
  const filtered = students.filter(s => s.className === selectedClass);

  // 월별 테이블 계산
  const lastDay = new Date(year, month, 0).getDate();
  const days = Array.from({ length: lastDay }, (_, i) => i + 1);
  const monthlyByStudent: Record<string, Record<number, AttendanceRecord['status']>> = {};
  for (const r of monthlyRecords) {
    const day = parseInt(r.date.slice(8, 10));
    if (!monthlyByStudent[r.studentName]) monthlyByStudent[r.studentName] = {};
    monthlyByStudent[r.studentName][day] = r.status;
  }

  const printMonthly = () => {
    const lastDay = new Date(year, month, 0).getDate();
    const days = Array.from({ length: lastDay }, (_, i) => i + 1);
    const byClass: Record<string, Record<string, Record<number, AttendanceRecord['status']>>> = {};
    for (const s of students) {
      if (!s.className) continue;
      if (!byClass[s.className]) byClass[s.className] = {};
      byClass[s.className][s.name] = monthlyByStudent[s.name] ?? {};
    }
    const statusColor: Record<string, string> = {
      present: '#dcfce7', late: '#fef9c3', absent: '#fee2e2',
    };
    const statusText: Record<string, string> = { present: '출', late: '지', absent: '결' };

    const classHtml = Object.entries(byClass).map(([cls, stuMap]) => {
      const rows = Object.entries(stuMap).map(([name, sMap]) => {
        const pCnt = Object.values(sMap).filter(v => v === 'present').length;
        const lCnt = Object.values(sMap).filter(v => v === 'late').length;
        const aCnt = Object.values(sMap).filter(v => v === 'absent').length;
        const cells = days.map(d => {
          const st = sMap[d];
          return `<td style="text-align:center;font-size:10px;width:22px;padding:2px;">${st ? `<span style="background:${statusColor[st]};padding:1px 3px;border-radius:3px;font-weight:bold;">${statusText[st]}</span>` : ''}</td>`;
        }).join('');
        return `<tr><td style="padding:3px 6px;font-weight:500;white-space:nowrap;">${name}</td>${cells}<td style="text-align:center;color:#16a34a;font-weight:bold;">${pCnt || ''}</td><td style="text-align:center;color:#ca8a04;font-weight:bold;">${lCnt || ''}</td><td style="text-align:center;color:#dc2626;font-weight:bold;">${aCnt || ''}</td></tr>`;
      }).join('');
      const headers = days.map(d => {
        const dow = new Date(year, month - 1, d).getDay();
        const color = dow === 0 ? '#ef4444' : dow === 6 ? '#3b82f6' : '#64748b';
        return `<th style="width:22px;text-align:center;font-size:9px;color:${color};padding:2px;">${d}</th>`;
      }).join('');
      return `
        <div style="page-break-after:always;padding:16px;">
          <h2 style="font-size:16px;font-weight:bold;margin-bottom:4px;">최강학원 ${year}년 ${month}월 출결 현황</h2>
          <h3 style="font-size:13px;color:#4338ca;margin-bottom:8px;">${cls}</h3>
          <table style="border-collapse:collapse;font-size:11px;width:100%;">
            <thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
              <th style="text-align:left;padding:4px 6px;min-width:70px;">이름</th>${headers}
              <th style="text-align:center;color:#16a34a;padding:4px;">출</th>
              <th style="text-align:center;color:#ca8a04;padding:4px;">지</th>
              <th style="text-align:center;color:#dc2626;padding:4px;">결</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join('');

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${year}년 ${month}월 출결</title>
      <style>body{font-family:sans-serif;margin:0;}@media print{@page{margin:12mm;}}</style>
      </head><body>${classHtml}<script>window.onload=()=>window.print();</script></body></html>`);
    win.document.close();
  };

  if (loading) return <div className="flex justify-center py-24"><Loader size={28} className="animate-spin text-indigo-400" /></div>;

  // ── 학생 뷰 ──
  if (!isTeacher) {
    const lastDayMy = new Date(myYear, myMonth, 0).getDate();
    const myDays = Array.from({ length: lastDayMy }, (_, i) => i + 1);
    const myMap: Record<number, AttendanceRecord['status']> = {};
    for (const r of myRecords) myMap[parseInt(r.date.slice(8, 10))] = r.status;

    return (
      <div className="space-y-5 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-slate-800">내 출결 확인</h1>
        <div className="flex gap-2">
          <input
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={myName}
            onChange={e => setMyName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadMyRecords()}
            placeholder="이름 입력"
          />
          <button onClick={() => loadMyRecords()} disabled={!myName.trim() || myLoading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40">
            {myLoading ? <Loader size={14} className="animate-spin" /> : '조회'}
          </button>
        </div>

        {myRecords.length > 0 && (
          <>
            {/* 월 이동 */}
            <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3">
              <button onClick={() => shiftMonth(-1, true)} className="p-1.5 rounded hover:bg-slate-100"><ChevronLeft size={16} /></button>
              <p className="font-semibold text-slate-700">{myYear}년 {myMonth}월</p>
              <button onClick={() => shiftMonth(1, true)} className="p-1.5 rounded hover:bg-slate-100"><ChevronRight size={16} /></button>
            </div>

            {/* 요약 */}
            <div className="grid grid-cols-3 gap-3">
              {(['present','late','absent'] as const).map(s => {
                const count = myRecords.filter(r => r.status === s).length;
                const cfg = STATUS_CONFIG[s];
                return (
                  <div key={s} className={`rounded-xl border p-3 text-center ${cfg.color}`}>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs mt-0.5">{cfg.label}</p>
                  </div>
                );
              })}
            </div>

            {/* 월별 달력 */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {['일','월','화','수','목','금','토'].map(d => (
                  <p key={d} className="text-xs text-slate-400 font-medium">{d}</p>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {/* 첫째 날 요일 맞춤 */}
                {Array.from({ length: new Date(myYear, myMonth - 1, 1).getDay() }, (_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {myDays.map(day => {
                  const status = myMap[day];
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
          </>
        )}
      </div>
    );
  }

  // ── 선생님 뷰 ──
  const presentCount = filtered.filter(s => records[s.name] === 'present').length;
  const lateCount    = filtered.filter(s => records[s.name] === 'late').length;
  const absentCount  = filtered.filter(s => records[s.name] === 'absent').length;
  const unchecked    = filtered.filter(s => !records[s.name]).length;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">출결 관리</h1>

      {/* 탭 */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        <button onClick={() => setTeacherTab('daily')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            teacherTab === 'daily' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          <CalendarCheck size={15} /> 일별 출결
        </button>
        <button onClick={() => setTeacherTab('weekly')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            teacherTab === 'weekly' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          <CalendarRange size={15} /> 주별 현황
        </button>
        <button onClick={() => setTeacherTab('monthly')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            teacherTab === 'monthly' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          <CalendarDays size={15} /> 월별 현황
        </button>
      </div>

      {/* ── 일별 탭 ── */}
      {teacherTab === 'daily' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex flex-wrap gap-2">
              {classes.map(c => (
                <button key={c} onClick={() => setSelectedClass(c)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    selectedClass === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <button onClick={() => shiftDate(-1)} className="p-2 rounded-lg hover:bg-slate-100"><ChevronLeft size={16} /></button>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <button onClick={() => shiftDate(1)} className="p-2 rounded-lg hover:bg-slate-100"><ChevronRight size={16} /></button>
              <button onClick={() => setDate(todayKST())} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                <RotateCcw size={14} />
              </button>
            </div>
          </div>

          {filtered.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: '출석', value: presentCount, color: 'text-green-600 bg-green-50 border-green-200' },
                { label: '지각', value: lateCount,    color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
                { label: '결석', value: absentCount,  color: 'text-red-500 bg-red-50 border-red-200' },
                { label: '미체크', value: unchecked,  color: 'text-slate-500 bg-slate-50 border-slate-200' },
              ].map(({ label, value, color }) => (
                <div key={label} className={`rounded-xl border p-3 text-center ${color}`}>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <p className="text-slate-400 text-sm">이 반에 등록된 학생이 없습니다</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {filtered.map(student => {
                const cur = records[student.name] ?? null;
                const isSaving = saving === student.name;
                return (
                  <div key={student.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 flex items-center gap-2">
                      <p className="font-medium text-slate-800 text-sm">{student.name}</p>
                      {cur === 'late' && notes[student.name] && (
                        <span className="text-xs text-yellow-600 font-medium">{notes[student.name]} 지각</span>
                      )}
                    </div>
                    {isSaving && <Loader size={14} className="animate-spin text-slate-400" />}
                    <div className="flex gap-1.5">
                      {(['present','late','absent'] as const).map(s => {
                        const cfg = STATUS_CONFIG[s];
                        return (
                          <button key={s} onClick={() => mark(student.name, s)} disabled={isSaving}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                              cur === s ? cfg.color : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                            }`}>
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 주별 탭 ── */}
      {teacherTab === 'weekly' && (() => {
        const weekDates = getWeekDates(weekOffset);
        const weekStart = weekDates[0];
        const weekEnd   = weekDates[6];
        const weekLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()} ~ ${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;
        const weekDateStrs = weekDates.map(d => toDateStr(d));

        const weeklyByStudent: Record<string, Record<string, AttendanceRecord['status']>> = {};
        for (const r of weekRecords) {
          if (!weeklyByStudent[r.studentName]) weeklyByStudent[r.studentName] = {};
          weeklyByStudent[r.studentName][r.date] = r.status;
        }

        return (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex flex-wrap gap-2">
                {classes.map(c => (
                  <button key={c} onClick={() => setSelectedClass(c)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      selectedClass === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}>
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 ml-auto">
                <button onClick={() => setWeekOffset(o => o - 1)} className="p-2 rounded-lg hover:bg-slate-100"><ChevronLeft size={16} /></button>
                <p className="px-3 font-semibold text-slate-700 min-w-[130px] text-center text-sm">{weekLabel}</p>
                <button onClick={() => setWeekOffset(o => Math.min(0, o + 1))} disabled={weekOffset === 0}
                  className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={16} /></button>
                <button onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}
                  className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 text-slate-400"><RotateCcw size={14} /></button>
              </div>
            </div>

            {/* 범례 */}
            <div className="flex gap-3 text-xs">
              {(['present','late','absent'] as const).map(s => (
                <span key={s} className={`px-2 py-1 rounded font-semibold ${STATUS_CONFIG[s].cell}`}>
                  {STATUS_CONFIG[s].short} = {STATUS_CONFIG[s].label}
                </span>
              ))}
            </div>

            {weekLoading ? (
              <div className="flex justify-center py-12"><Loader size={24} className="animate-spin text-indigo-400" /></div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="text-sm border-collapse" style={{ minWidth: '520px' }}>
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="sticky left-0 bg-slate-50 text-left px-4 py-3 font-semibold text-slate-600 border-r border-slate-200 min-w-[90px]">이름</th>
                      {weekDates.map((d, i) => {
                        const isToday = toDateStr(d) === todayKST();
                        return (
                          <th key={i} className={`text-center px-3 py-3 font-semibold text-xs ${
                            d.getDay() === 0 ? 'text-red-400' : d.getDay() === 6 ? 'text-blue-400' : isToday ? 'text-indigo-600' : 'text-slate-500'
                          }`}>
                            <div>{WEEKDAYS[i]}</div>
                            <div className={`text-[11px] ${isToday ? 'font-bold text-indigo-600' : 'font-normal'}`}>{d.getDate()}</div>
                          </th>
                        );
                      })}
                      <th className="px-3 py-3 font-semibold text-green-600 text-xs text-center">출</th>
                      <th className="px-3 py-3 font-semibold text-yellow-600 text-xs text-center">지</th>
                      <th className="px-3 py-3 font-semibold text-red-500 text-xs text-center">결</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(student => {
                      const sMap = weeklyByStudent[student.name] ?? {};
                      const pCnt = Object.values(sMap).filter(v => v === 'present').length;
                      const lCnt = Object.values(sMap).filter(v => v === 'late').length;
                      const aCnt = Object.values(sMap).filter(v => v === 'absent').length;
                      return (
                        <tr key={student.id} className="hover:bg-slate-50">
                          <td className="sticky left-0 bg-white hover:bg-slate-50 px-4 py-2.5 font-medium text-slate-800 border-r border-slate-100 text-sm">{student.name}</td>
                          {weekDateStrs.map(dateStr => {
                            const status = sMap[dateStr];
                            const cfg = status ? STATUS_CONFIG[status] : null;
                            return (
                              <td key={dateStr} className="text-center px-1 py-2.5">
                                {cfg && (
                                  <span className={`inline-block w-7 h-7 rounded-lg text-xs font-bold leading-7 ${cfg.cell}`}>
                                    {cfg.short}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2.5 text-center font-bold text-green-600 text-sm">{pCnt || '-'}</td>
                          <td className="px-3 py-2.5 text-center font-bold text-yellow-600 text-sm">{lCnt || '-'}</td>
                          <td className="px-3 py-2.5 text-center font-bold text-red-500 text-sm">{aCnt || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 월별 탭 ── */}
      {teacherTab === 'monthly' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            {/* 반 선택 */}
            <div className="flex flex-wrap gap-2">
              {classes.map(c => (
                <button key={c} onClick={() => setSelectedClass(c)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    selectedClass === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
            {/* 월 이동 + PDF */}
            <div className="flex items-center gap-1 ml-auto">
              <button onClick={() => shiftMonth(-1)} className="p-2 rounded-lg hover:bg-slate-100"><ChevronLeft size={16} /></button>
              <p className="px-3 font-semibold text-slate-700 min-w-[90px] text-center">{year}년 {month}월</p>
              <button onClick={() => shiftMonth(1)} className="p-2 rounded-lg hover:bg-slate-100"><ChevronRight size={16} /></button>
              <button onClick={printMonthly}
                className="ml-2 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700">
                <Printer size={13} /> PDF
              </button>
            </div>
          </div>

          {monthlyLoading ? (
            <div className="flex justify-center py-12"><Loader size={24} className="animate-spin text-indigo-400" /></div>
          ) : (
            <>
              {/* 범례 */}
              <div className="flex gap-3 text-xs">
                {(['present','late','absent'] as const).map(s => (
                  <span key={s} className={`px-2 py-1 rounded font-semibold ${STATUS_CONFIG[s].cell}`}>
                    {STATUS_CONFIG[s].short} = {STATUS_CONFIG[s].label}
                  </span>
                ))}
              </div>

              {/* 테이블 */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="text-xs border-collapse" style={{ minWidth: `${120 + lastDay * 32}px` }}>
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="sticky left-0 bg-slate-50 text-left px-4 py-2.5 font-semibold text-slate-600 border-r border-slate-200 min-w-[100px]">이름</th>
                      {days.map(d => {
                        const dow = new Date(year, month - 1, d).getDay();
                        return (
                          <th key={d} className={`w-8 py-2.5 font-semibold text-center ${dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-slate-500'}`}>
                            {d}
                          </th>
                        );
                      })}
                      <th className="px-3 py-2.5 font-semibold text-green-600 text-center">출</th>
                      <th className="px-3 py-2.5 font-semibold text-yellow-600 text-center">지</th>
                      <th className="px-3 py-2.5 font-semibold text-red-500 text-center">결</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(student => {
                      const sMap = monthlyByStudent[student.name] ?? {};
                      const pCnt = Object.values(sMap).filter(v => v === 'present').length;
                      const lCnt = Object.values(sMap).filter(v => v === 'late').length;
                      const aCnt = Object.values(sMap).filter(v => v === 'absent').length;
                      return (
                        <tr key={student.id} className="hover:bg-slate-50">
                          <td className="sticky left-0 bg-white hover:bg-slate-50 px-4 py-2 font-medium text-slate-800 border-r border-slate-100">{student.name}</td>
                          {days.map(d => {
                            const status = sMap[d];
                            const cfg = status ? STATUS_CONFIG[status] : null;
                            return (
                              <td key={d} className="w-8 py-2 text-center">
                                {cfg && (
                                  <span className={`inline-block w-6 h-6 rounded text-[10px] font-bold leading-6 ${cfg.cell}`}>
                                    {cfg.short}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-center font-bold text-green-600">{pCnt || ''}</td>
                          <td className="px-3 py-2 text-center font-bold text-yellow-600">{lCnt || ''}</td>
                          <td className="px-3 py-2 text-center font-bold text-red-500">{aCnt || ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
