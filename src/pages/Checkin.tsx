import { useEffect, useState } from 'react';
import { fetchStudents, upsertAttendance, fetchAttendanceByDate, sendAttendanceSms, type Student } from '../lib/db';
import { CheckCircle, Loader } from 'lucide-react';

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

export default function Checkin() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState('');
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const today = toDateStr(new Date());

  useEffect(() => {
    Promise.all([fetchStudents(), fetchAttendanceByDate(today)]).then(([stu, att]) => {
      setStudents(stu);
      const classes = [...new Set(stu.map(s => s.className).filter(Boolean))];
      if (classes.length > 0) setSelectedClass(classes[0]);
      const alreadyIn = new Set(att.filter(a => a.status === 'present').map(a => a.studentName));
      setCheckedIn(alreadyIn);
      setLoading(false);
    });
  }, []);

  const handleCheckin = async (student: Student) => {
    if (checkedIn.has(student.name) || processing) return;
    setProcessing(student.name);
    try {
      await upsertAttendance({ studentName: student.name, date: today, status: 'present', note: '' });
      setCheckedIn(prev => new Set([...prev, student.name]));
      setSuccess(student.name);
      if (student.parentPhone) {
        sendAttendanceSms(student.name, 'present', today);
      }
      setTimeout(() => setSuccess(null), 3000);
    } finally {
      setProcessing(null);
    }
  };

  const classes = [...new Set(students.map(s => s.className).filter(Boolean))];
  const filtered = students.filter(s => s.className === selectedClass);

  if (loading) {
    return (
      <div className="min-h-screen bg-indigo-700 flex items-center justify-center">
        <Loader size={36} className="animate-spin text-white" />
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
        <div className="mx-4 mb-4 bg-green-400 text-white rounded-2xl p-4 flex items-center gap-3 shadow-lg animate-pulse">
          <CheckCircle size={28} />
          <div>
            <p className="font-bold text-lg">{success}님 체크인 완료!</p>
            <p className="text-sm opacity-90">학부모님께 알림을 보냈습니다</p>
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
