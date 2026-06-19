import { useEffect, useState } from 'react';
import {
  fetchStudents, upsertAttendance, fetchAttendanceByDate, sendAligoAttendanceSms,
  fetchClassSchedules, getStartTime, checkIfLate, calcMinutesLate, getSchoolLocation, calcDistance, getGpsBypassUntil, getCheckinTimeBypassed,
  getSpecialDates, type OpenDate,
  type Student, type ClassSchedule,
} from '../lib/db';
import { CheckCircle, Loader, AlertCircle } from 'lucide-react';

const RADIUS_M = 100;
const STUDENT_NAME_KEY = 'vocab-student-name';

type GeoState = 'checking' | 'ok' | 'denied' | 'out_of_range' | 'no_school_set';

export default function Checkin() {
  const [students, setStudents] = useState<Student[]>([]);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [geoState, setGeoState] = useState<GeoState>('checking');
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState<{ name: string; isLate: boolean } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [nameInput, setNameInput] = useState(() => localStorage.getItem(STUDENT_NAME_KEY) ?? '');
  const [error, setError] = useState('');
  const [timeBypassed, setTimeBypassed] = useState(false);
  const [openEntry, setOpenEntry] = useState<OpenDate | null>(null);

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const deviceKey = `checkin-${today}`;
  const alreadyDoneByDevice = localStorage.getItem(deviceKey);

  useEffect(() => {
    if (alreadyDoneByDevice) {
      const t = setTimeout(() => { window.location.href = '/'; }, 2000);
      return () => clearTimeout(t);
    }
  }, [alreadyDoneByDevice]);

  useEffect(() => {
    const loadData = async () => {
      const [stu, att, sch, timeBp, special] = await Promise.all([
        fetchStudents(),
        fetchAttendanceByDate(today),
        fetchClassSchedules().catch(() => []),
        getCheckinTimeBypassed(),
        getSpecialDates().catch(() => ({ closed: [], open: [] })),
      ]);
      setTimeBypassed(timeBp);
      setOpenEntry(special.open.find(o => o.date === today) ?? null);
      setStudents(stu);
      setSchedules(sch);
      setCheckedIn(new Set(
        att.filter(a => a.status === 'present' || a.status === 'late').map(a => a.studentName)
      ));
    };

    if (!navigator.geolocation) {
      setGeoState('denied');
      loadData().finally(() => setLoading(false));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const school = await getSchoolLocation();
        if (!school) {
          setGeoState('no_school_set');
        } else {
          const bypassUntil = await getGpsBypassUntil();
          const bypassed = bypassUntil !== null && Date.now() < bypassUntil;
          const dist = calcDistance(latitude, longitude, school.lat, school.lng);
          setDistance(Math.round(dist));
          setGeoState(bypassed || dist <= RADIUS_M ? 'ok' : 'out_of_range');
        }
        await loadData();
        setLoading(false);
      },
      async () => {
        setGeoState('denied');
        await loadData();
        setLoading(false);
      },
      { timeout: 15000, maximumAge: 0, enableHighAccuracy: true }
    );
  }, []);

  const handleCheckin = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setError('');

    const student = students.find(s => s.name === trimmed);
    if (!student) {
      setError('등록된 학생 이름이 아닙니다. 다시 확인해주세요.');
      return;
    }
    if (checkedIn.has(student.name)) {
      setError(`${student.name} 학생은 이미 출석했습니다.`);
      return;
    }
    if ((geoState === 'out_of_range' || geoState === 'denied' || geoState === 'no_school_set') && !student.gpsExempt) {
      setError(
        geoState === 'denied' ? '위치 권한을 허용해주세요.' :
        geoState === 'no_school_set' ? '학원 위치가 설정되지 않았습니다. 선생님께 문의하세요.' :
        '학원 근처가 아닙니다. 위치를 확인해주세요.'
      );
      return;
    }

    setProcessing(true);
    try {
      const appliesToday = !openEntry?.classes?.length || openEntry.classes.includes(student.className);
      const startTime = (appliesToday && openEntry?.time) || getStartTime(student.className, schedules);
      const isLate = checkIfLate(startTime);
      const minutesLate = isLate ? calcMinutesLate(startTime) : 0;
      const status = isLate ? 'late' : 'present';
      const note = isLate ? `${minutesLate}분` : '';
      await upsertAttendance({ studentName: student.name, date: today, status, note });
      localStorage.setItem(deviceKey, student.name);
      localStorage.setItem(STUDENT_NAME_KEY, student.name);
      setCheckedIn(prev => new Set([...prev, student.name]));
      setSuccess({ name: student.name, isLate });
      setNameInput('');
      sendAligoAttendanceSms(student.name, status, today, minutesLate || undefined);
      setTimeout(() => { window.location.href = '/'; }, 2000);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-indigo-700 flex flex-col items-center justify-center gap-4 text-white">
        <Loader size={36} className="animate-spin" />
        <p className="text-indigo-200">위치 확인 중...</p>
      </div>
    );
  }

  if (alreadyDoneByDevice) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-white text-center"
        style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 50%, #166534 100%)' }}>
        <CheckCircle size={96} className="text-white mb-4" />
        <h1 className="text-4xl font-extrabold tracking-tight mb-2">출석 완료</h1>
        <p className="text-2xl font-semibold text-green-100 mb-1">{alreadyDoneByDevice}</p>
        <p className="text-green-200 text-sm">
          {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
        <div className="mt-8 px-5 py-2.5 rounded-full bg-white/10 border border-white/20 text-green-100 text-xs">
          오늘 출석이 확인되었습니다
        </div>
      </div>
    );
  }



  const kstHour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();
  if (kstHour < 16 && !timeBypassed && !openEntry) {
    return (
      <div className="min-h-screen bg-indigo-700 flex flex-col items-center justify-center gap-5 p-8 text-white text-center">
        <AlertCircle size={64} className="text-yellow-300" />
        <h1 className="text-2xl font-bold">아직 출석 시간이 아닙니다</h1>
        <p className="text-indigo-200">출석은 오후 4시부터 가능합니다</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-indigo-700 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">최강학원</h1>
          <p className="text-indigo-200 text-sm mt-1">
            {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
          {geoState === 'no_school_set' && (
            <p className="text-yellow-300 text-xs mt-1">⚠ 학원 위치 미설정 (선생님: 학생 관리에서 설정)</p>
          )}
          {geoState === 'ok' && distance !== null && (
            <p className="text-green-300 text-xs mt-1">✓ 학원에서 {distance}m</p>
          )}
        </div>

        {success && (
          <div className={`mb-6 rounded-2xl p-4 flex items-center gap-3 shadow-lg ${
            success.isLate ? 'bg-yellow-400' : 'bg-green-400'
          } text-white`}>
            <CheckCircle size={28} className="flex-shrink-0" />
            <div>
              <p className="font-bold text-lg">
                {success.name}님 {success.isLate ? '지각 처리되었습니다' : '출석 완료!'}
              </p>
              <p className="text-sm opacity-90">
                {success.isLate ? '수업 시작 후 도착했습니다' : '학부모님께 알림을 보냈습니다'}
              </p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl p-6 shadow-xl">
          <p className="text-slate-500 text-sm text-center mb-4">본인 이름을 입력해주세요</p>
          <input
            type="text"
            value={nameInput}
            onChange={e => { setNameInput(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleCheckin(); }}
            placeholder="이름 입력"
            autoComplete="off"
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-center text-2xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-3"
          />
          {error && (
            <p className="text-red-500 text-sm text-center mb-3">{error}</p>
          )}
          <button
            onClick={handleCheckin}
            disabled={processing || !nameInput.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-lg py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {processing ? <Loader size={20} className="animate-spin" /> : <CheckCircle size={20} />}
            {processing ? '처리 중...' : '출석'}
          </button>
        </div>
      </div>
    </div>
  );
}
