import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchStudents, upsertAttendance, fetchAttendanceByDate, sendAttendanceSms,
  fetchClassSchedules, getStartTime, checkIfLate,
  type Student, type ClassSchedule,
} from '../lib/db';
import { isValidToken } from '../lib/checkin-token';
import { CheckCircle, Loader, ScanLine } from 'lucide-react';

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

export default function Checkin() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState('');
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ name: string; isLate: boolean } | null>(null);

  const today = toDateStr(new Date());
  const deviceKey = `checkin-${today}`;
  const alreadyDoneByDevice = localStorage.getItem(deviceKey);

  useEffect(() => {
    isValidToken(token).then(valid => {
      setTokenValid(valid);
      if (!valid) { setLoading(false); return; }
    });
  }, [token]);

  useEffect(() => {
    if (tokenValid === false || tokenValid === null) return;
    if (alreadyDoneByDevice) { setLoading(false); return; }
    Promise.all([
      fetchStudents(),
      fetchAttendanceByDate(today),
      fetchClassSchedules().catch(() => []),
    ]).then(([stu, att, sch]) => {
        setStudents(stu);
        setSchedules(sch);
        const classes = [...new Set(stu.map(s => s.className).filter(Boolean))];
        if (classes.length > 0) setSelectedClass(classes[0]);
        const alreadyIn = new Set(
          att.filter(a => a.status === 'present' || a.status === 'late').map(a => a.studentName)
        );
        setCheckedIn(alreadyIn);
        setLoading(false);
      });
  }, []);

  const handleCheckin = async (student: Student) => {
    if (checkedIn.has(student.name) || processing) return;
    setProcessing(student.name);
    try {
      const startTime = getStartTime(student.className, schedules);
      const isLate = checkIfLate(startTime);
      const status = isLate ? 'late' : 'present';

      await upsertAttendance({ studentName: student.name, date: today, status, note: '' });
      localStorage.setItem(deviceKey, student.name);
      setCheckedIn(prev => new Set([...prev, student.name]));
      setSuccess({ name: student.name, isLate });
      if (student.parentPhone) {
        sendAttendanceSms(student.name, status, today);
      }
      setTimeout(() => setSuccess(null), 4000);
    } finally {
      setProcessing(null);
    }
  };

  const classes = [...new Set(students.map(s => s.className).filter(Boolean))];
  const filtered = students.filter(s => s.className === selectedClass);

  if (loading || tokenValid === null) {
    return (
      <div className="min-h-screen bg-indigo-700 flex items-center justify-center">
        <Loader size={36} className="animate-spin text-white" />
      </div>
    );
  }

  // 토큰 만료 또는 없음
  if (!tokenValid) {
    return (
      <div className="min-h-screen bg-slate-800 flex flex-col items-center justify-center gap-5 p-8 text-white text-center">
        <ScanLine size={64} className="text-slate-400" />
        <h1 className="text-2xl font-bold">QR이 만료되었습니다</h1>
        <p className="text-slate-300">입구의 QR 화면에서 새 QR을 다시 스캔해주세요</p>
        <p className="text-slate-500 text-sm">QR은 30초마다 자동으로 갱신됩니다</p>
      </div>
    );
  }

  // 오늘 이미 체크인한 기기
  if (alreadyDoneByDevice) {
    return (
      <div className="min-h-screen bg-green-600 flex flex-col items-center justify-center gap-5 p-8 text-white text-center">
        <CheckCircle size={72} className="text-white" />
        <h1 className="text-3xl font-bold">오늘 이미 체크인 완료!</h1>
        <p className="text-xl text-green-100">{alreadyDoneByDevice} 학생</p>
        <p className="text-green-200 text-sm">
          {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
        <p className="text-green-200 text-xs mt-4">이 기기에서는 하루에 한 번만 체크인할 수 있어요</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-indigo-700 flex flex-col">
      {/* 헤더 */}
      <div className="text-center pt-8 pb-4 px-4">
        <h1 className="text-3xl font-bold text-white">최강학원</h1>
        <p className="text-indigo-200 text-sm mt-1">
          {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
        <p className="text-indigo-100 text-lg mt-2 font-medium">본인 이름을 눌러주세요</p>
      </div>

      {/* 성공 메시지 */}
      {success && (
        <div className={`mx-4 mb-4 rounded-2xl p-4 flex items-center gap-3 shadow-lg ${
          success.isLate ? 'bg-yellow-400 text-white' : 'bg-green-400 text-white'
        }`}>
          <CheckCircle size={28} />
          <div>
            <p className="font-bold text-lg">
              {success.name}님 {success.isLate ? '지각 처리되었습니다' : '체크인 완료!'}
            </p>
            <p className="text-sm opacity-90">
              {success.isLate ? '수업 시작 후 도착했습니다' : '학부모님께 알림을 보냈습니다'}
            </p>
          </div>
        </div>
      )}

      {/* 반 선택 탭 */}
      {classes.length > 1 && (
        <div className="flex gap-2 px-4 mb-4 overflow-x-auto pb-1">
          {classes.map(cls => (
            <button key={cls} onClick={() => setSelectedClass(cls)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                selectedClass === cls
                  ? 'bg-white text-indigo-700'
                  : 'bg-indigo-600 text-indigo-100 border border-indigo-400'
              }`}>
              {cls}
            </button>
          ))}
        </div>
      )}

      {/* 학생 버튼 그리드 */}
      <div className="flex-1 px-4 pb-8 grid grid-cols-3 gap-3 content-start">
        {filtered.map(student => {
          const done = checkedIn.has(student.name);
          const isProcessing = processing === student.name;
          return (
            <button
              key={student.id}
              onClick={() => handleCheckin(student)}
              disabled={done || !!processing}
              className={`rounded-2xl py-6 px-3 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 shadow-md ${
                done
                  ? 'bg-green-400 text-white opacity-80'
                  : 'bg-white text-indigo-700 hover:bg-indigo-50'
              }`}
            >
              {isProcessing ? (
                <Loader size={24} className="animate-spin text-indigo-400" />
              ) : done ? (
                <CheckCircle size={24} className="text-white" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-lg font-bold text-indigo-600">
                  {student.name[0]}
                </div>
              )}
              <span className="font-bold text-base leading-tight text-center">{student.name}</span>
              {done && <span className="text-xs text-white opacity-80">완료</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
