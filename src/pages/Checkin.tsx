import { useEffect, useState } from 'react';
import {
  fetchStudents, upsertAttendance, fetchAttendanceByDate, sendAttendanceSms,
  fetchClassSchedules, getStartTime, checkIfLate, calcMinutesLate, getSchoolLocation, calcDistance, getGpsBypassUntil,
  type Student, type ClassSchedule,
} from '../lib/db';
import { CheckCircle, Loader, MapPin, AlertCircle } from 'lucide-react';

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

const RADIUS_M = 100; // 허용 반경 (미터)

type GeoState = 'checking' | 'ok' | 'denied' | 'out_of_range' | 'no_school_set';

export default function Checkin() {
  const [students, setStudents] = useState<Student[]>([]);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [geoState, setGeoState] = useState<GeoState>('checking');
  const [selectedClass, setSelectedClass] = useState('');
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ name: string; isLate: boolean } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  const today = toDateStr(new Date());
  const deviceKey = `checkin-${today}`;
  const alreadyDoneByDevice = localStorage.getItem(deviceKey);

  useEffect(() => {
    // 위치 확인
    if (!navigator.geolocation) {
      setGeoState('denied');
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const school = await getSchoolLocation();
        if (!school) {
          // 학원 위치 미설정 → 일단 허용 (선생님이 아직 안 설정한 경우)
          setGeoState('no_school_set');
        } else {
          const bypassUntil = await getGpsBypassUntil();
          const bypassed = bypassUntil !== null && Date.now() < bypassUntil;
          const dist = calcDistance(latitude, longitude, school.lat, school.lng);
          setDistance(Math.round(dist));
          setGeoState(bypassed || dist <= RADIUS_M ? 'ok' : 'out_of_range');
        }
        // 학생 데이터 로드
        const [stu, att, sch] = await Promise.all([
          fetchStudents(),
          fetchAttendanceByDate(today),
          fetchClassSchedules().catch(() => []),
        ]);
        setStudents(stu);
        setSchedules(sch);
        const classes = [...new Set(stu.map(s => s.className).filter(Boolean))];
        if (classes.length > 0) setSelectedClass(classes[0]);
        const alreadyIn = new Set(
          att.filter(a => a.status === 'present' || a.status === 'late').map(a => a.studentName)
        );
        setCheckedIn(alreadyIn);
        setLoading(false);
      },
      () => {
        setGeoState('denied');
        setLoading(false);
      },
      { timeout: 15000, maximumAge: 0, enableHighAccuracy: true }
    );
  }, []);

  const handleCheckin = async (student: Student) => {
    if (checkedIn.has(student.name) || processing) return;
    setProcessing(student.name);
    try {
      const startTime = getStartTime(student.className, schedules);
      const isLate = checkIfLate(startTime);
      const status = isLate ? 'late' : 'present';
      const note = isLate ? `${calcMinutesLate(startTime)}분` : '';
      await upsertAttendance({ studentName: student.name, date: today, status, note });
      localStorage.setItem(deviceKey, student.name);
      setCheckedIn(prev => new Set([...prev, student.name]));
      setSuccess({ name: student.name, isLate });
      if (student.parentPhone) sendAttendanceSms(student.name, status, today);
      setTimeout(() => setSuccess(null), 4000);
    } finally {
      setProcessing(null);
    }
  };

  const classes = [...new Set(students.map(s => s.className).filter(Boolean))];
  const filtered = students.filter(s => s.className === selectedClass);

  // 로딩
  if (loading) {
    return (
      <div className="min-h-screen bg-indigo-700 flex flex-col items-center justify-center gap-4 text-white">
        <Loader size={36} className="animate-spin" />
        <p className="text-indigo-200">위치 확인 중...</p>
      </div>
    );
  }

  // 이미 체크인한 기기
  if (alreadyDoneByDevice) {
    return (
      <div className="min-h-screen bg-green-600 flex flex-col items-center justify-center gap-5 p-8 text-white text-center">
        <CheckCircle size={72} />
        <h1 className="text-3xl font-bold">오늘 이미 체크인 완료!</h1>
        <p className="text-xl text-green-100">{alreadyDoneByDevice} 학생</p>
        <p className="text-green-200 text-xs mt-4">이 기기에서는 하루에 한 번만 체크인할 수 있어요</p>
      </div>
    );
  }

  // 위치 권한 거부
  if (geoState === 'denied') {
    return (
      <div className="min-h-screen bg-slate-800 flex flex-col items-center justify-center gap-5 p-8 text-white text-center">
        <AlertCircle size={64} className="text-red-400" />
        <h1 className="text-2xl font-bold">위치 권한을 허용해주세요</h1>
        <p className="text-slate-300 text-sm">출석 체크는 학원 위치 확인이 필요합니다<br />브라우저 설정에서 위치 권한을 허용한 후 다시 시도해주세요</p>
      </div>
    );
  }

  // 학원 밖
  if (geoState === 'out_of_range') {
    return (
      <div className="min-h-screen bg-slate-800 flex flex-col items-center justify-center gap-5 p-8 text-white text-center">
        <MapPin size={64} className="text-red-400" />
        <h1 className="text-2xl font-bold">학원 근처가 아닙니다</h1>
        <p className="text-slate-300">현재 위치: 학원에서 약 {distance}m</p>
      </div>
    );
  }

  // 체크인 화면
  return (
    <div className="min-h-screen bg-indigo-700 flex flex-col">
      <div className="text-center pt-8 pb-4 px-4">
        <h1 className="text-3xl font-bold text-white">최강학원</h1>
        <p className="text-indigo-200 text-sm mt-1">
          {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
        {geoState === 'no_school_set' && (
          <p className="text-yellow-300 text-xs mt-1">⚠ 학원 위치 미설정 (선생님: 학생 관리에서 설정)</p>
        )}
        {distance !== null && (
          <p className="text-green-300 text-xs mt-1">✓ 학원에서 {distance}m</p>
        )}
        <p className="text-indigo-100 text-lg mt-2 font-medium">본인 이름을 눌러주세요</p>
      </div>

      {success && (
        <div className={`mx-4 mb-4 rounded-2xl p-4 flex items-center gap-3 shadow-lg ${
          success.isLate ? 'bg-yellow-400' : 'bg-green-400'
        } text-white`}>
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

      {classes.length > 1 && (
        <div className="flex gap-2 px-4 mb-4 overflow-x-auto pb-1">
          {classes.map(cls => (
            <button key={cls} onClick={() => setSelectedClass(cls)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                selectedClass === cls ? 'bg-white text-indigo-700' : 'bg-indigo-600 text-indigo-100 border border-indigo-400'
              }`}>
              {cls}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 px-4 pb-8 grid grid-cols-3 gap-3 content-start">
        {filtered.map(student => {
          const done = checkedIn.has(student.name);
          const isProc = processing === student.name;
          return (
            <button key={student.id} onClick={() => handleCheckin(student)}
              disabled={done || !!processing}
              className={`rounded-2xl py-6 px-3 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 shadow-md ${
                done ? 'bg-green-400 text-white opacity-80' : 'bg-white text-indigo-700 hover:bg-indigo-50'
              }`}>
              {isProc ? <Loader size={24} className="animate-spin text-indigo-400" />
                : done ? <CheckCircle size={24} className="text-white" />
                : <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-lg font-bold text-indigo-600">{student.name[0]}</div>}
              <span className="font-bold text-base leading-tight text-center">{student.name}</span>
              {done && <span className="text-xs text-white opacity-80">완료</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
