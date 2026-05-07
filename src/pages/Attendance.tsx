import { useEffect, useState } from 'react';
import {
  fetchStudents, fetchAttendanceByDate, fetchAttendanceByStudent,
  upsertAttendance, deleteAttendance,
  type Student, type AttendanceRecord,
} from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { Loader, ChevronLeft, ChevronRight, CheckCircle, Clock, XCircle, RotateCcw } from 'lucide-react';

const STATUS_CONFIG = {
  present: { label: '출석', color: 'bg-green-100 text-green-700 border-green-300', icon: CheckCircle },
  late:    { label: '지각', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: Clock },
  absent:  { label: '결석', color: 'bg-red-100 text-red-700 border-red-300', icon: XCircle },
} as const;

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

const STUDENT_NAME_KEY = 'vocab-student-name';

export default function Attendance() {
  const { isTeacher } = useAuth();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(toDateStr(new Date()));
  const [records, setRecords] = useState<Record<string, AttendanceRecord['status'] | null>>({});
  const [saving, setSaving] = useState<string | null>(null);

  // 학생용
  const [myName, setMyName] = useState(() => localStorage.getItem(STUDENT_NAME_KEY) ?? '');
  const [myRecords, setMyRecords] = useState<AttendanceRecord[]>([]);
  const [myLoading, setMyLoading] = useState(false);

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
    if (!isTeacher || !selectedClass) return;
    loadAttendance();
  }, [date, selectedClass]);

  const loadAttendance = async () => {
    const data = await fetchAttendanceByDate(date);
    const map: Record<string, AttendanceRecord['status'] | null> = {};
    for (const r of data) map[r.studentName] = r.status;
    setRecords(map);
  };

  const mark = async (studentName: string, status: AttendanceRecord['status']) => {
    setSaving(studentName);
    const cur = records[studentName];
    if (cur === status) {
      await deleteAttendance(studentName, date);
      setRecords(prev => ({ ...prev, [studentName]: null }));
    } else {
      await upsertAttendance({ studentName, date, status, note: '' });
      setRecords(prev => ({ ...prev, [studentName]: status }));
    }
    setSaving(null);
  };

  const loadMyRecords = async () => {
    if (!myName.trim()) return;
    localStorage.setItem(STUDENT_NAME_KEY, myName.trim());
    setMyLoading(true);
    const data = await fetchAttendanceByStudent(myName.trim());
    setMyRecords(data);
    setMyLoading(false);
  };

  const shiftDate = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(toDateStr(d));
  };

  const classes = [...new Set(students.map(s => s.className).filter(Boolean))].sort();
  const filtered = students.filter(s => s.className === selectedClass);
  const presentCount = filtered.filter(s => records[s.name] === 'present').length;
  const lateCount = filtered.filter(s => records[s.name] === 'late').length;
  const absentCount = filtered.filter(s => records[s.name] === 'absent').length;
  const unchecked = filtered.filter(s => !records[s.name]).length;

  if (loading) return <div className="flex justify-center py-24"><Loader size={28} className="animate-spin text-indigo-400" /></div>;

  // ── 학생 뷰 ──
  if (!isTeacher) {
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
          <button onClick={loadMyRecords} disabled={!myName.trim() || myLoading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40">
            {myLoading ? <Loader size={14} className="animate-spin" /> : '조회'}
          </button>
        </div>

        {myRecords.length > 0 && (
          <>
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
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {myRecords.map(r => {
                const cfg = STATUS_CONFIG[r.status];
                const Icon = cfg.icon;
                return (
                  <div key={r.id} className="flex items-center justify-between px-4 py-3">
                    <p className="text-sm text-slate-700">{new Date(r.date).toLocaleDateString('ko-KR', { month:'long', day:'numeric', weekday:'short' })}</p>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.color}`}>
                      <Icon size={12} /> {cfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── 선생님 뷰 ──
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">출결 관리</h1>

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

        {/* 날짜 */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => shiftDate(-1)} className="p-2 rounded-lg hover:bg-slate-100"><ChevronLeft size={16} /></button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <button onClick={() => shiftDate(1)} className="p-2 rounded-lg hover:bg-slate-100"><ChevronRight size={16} /></button>
          <button onClick={() => setDate(toDateStr(new Date()))} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* 요약 */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: '출석', value: presentCount, color: 'text-green-600 bg-green-50 border-green-200' },
            { label: '지각', value: lateCount, color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
            { label: '결석', value: absentCount, color: 'text-red-500 bg-red-50 border-red-200' },
            { label: '미체크', value: unchecked, color: 'text-slate-500 bg-slate-50 border-slate-200' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`rounded-xl border p-3 text-center ${color}`}>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* 학생 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-400 text-sm">이 반에 등록된 학생이 없습니다</p>
          <p className="text-xs text-slate-300 mt-1">학생 관리 탭에서 먼저 학생을 추가해주세요</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {filtered.map(student => {
            const cur = records[student.name] ?? null;
            const isSaving = saving === student.name;
            return (
              <div key={student.id} className="flex items-center gap-3 px-4 py-3">
                <p className="flex-1 font-medium text-slate-800 text-sm">{student.name}</p>
                {isSaving && <Loader size={14} className="animate-spin text-slate-400" />}
                <div className="flex gap-1.5">
                  {(['present','late','absent'] as const).map(s => {
                    const cfg = STATUS_CONFIG[s];
                    const active = cur === s;
                    return (
                      <button key={s} onClick={() => mark(student.name, s)} disabled={isSaving}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          active ? cfg.color : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
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
  );
}
