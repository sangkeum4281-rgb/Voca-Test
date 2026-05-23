import { useEffect, useState } from 'react';
import {
  fetchStudents, upsertAttendance, fetchAttendanceByDate, sendAligoAttendanceSms,
  fetchClassSchedules, getStartTime, checkIfLate, calcMinutesLate, getSchoolLocation, calcDistance, getGpsBypassUntil, getCheckinTimeBypassed,
  type Student, type ClassSchedule,
} from '../lib/db';
import { CheckCircle, Loader, MapPin, AlertCircle } from 'lucide-react';

const RADIUS_M = 100;

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
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState('');
  const [timeBypassed, setTimeBypassed] = useState(false);

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
          setGeoState('no_school_set');
        } else {
          const bypassUntil = await getGpsBypassUntil();
          const bypassed = bypassUntil !== null && Date.now() < bypassUntil;
          const dist = calcDistance(latitude, longitude, school.lat, school.lng);
          setDistance(Math.round(dist));
          setGeoState(bypassed || dist <= RADIUS_M ? 'ok' : 'out_of_range');
        }
        const [stu, att, sch, timeBp] = await Promise.all([
          fetchStudents(),
          fetchAttendanceByDate(today),
          fetchClassSchedules().catch(() => []),
          getCheckinTimeBypassed(),
        ]);
        setTimeBypassed(timeBp);
        setStudents(stu);
        setSchedules(sch);
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
      setError(`${student.name} 학생은 이미 체크인했습니다.`);
      return;
    }

    setProcessing(true);
    try {
      const startTime = getStartTime(student.className, schedules);
      const isLate = checkIfLate(startTime);
      const minutesLate = isLate ? calcMinutesLate(startTime) : 0;
      const status = isLate ? 'late' : 'present';
      const note = isLate ? `${minutesLate}분` : '';
      await upsertAttendance({ studentName: student.name, date: today, status, note });
      localStorage.setItem(deviceKey, student.name);
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
      <div className="min-h-screen bg-green-600 flex flex-col items-center justify-center gap-5 p-8 text-white text-center">
        <CheckCircle size={72} />
        <h1 className="text-3xl font-bold">체크인 완료!</h1>
        <p className="text-xl text-green-100">{alreadyDoneByDevice} 학생</p>
        <p className="text-green-200 text-xs mt-4">이 기기에서는 하루에 한 번만 체크인할 수 있어요</p>
      </div>
    );
  }

  if (geoState === 'denied') {
    return (
      <div className="min-h-screen bg-slate-800 flex flex-col items-center justify-center gap-5 p-8 text-white text-center">
        <AlertCircle size={64} className="text-red-400" />
        <h1 className="text-2xl font-bold">위치 권한을 허용해주세요</h1>
        <div className="bg-slate-700 rounded-xl p-4 text-left text-sm text-slate-200 space-y-3 max-w-xs w-full">
          <p className="font-semibold text-white">📱 아이폰 설정 방법</p>
          <div>
            <p className="text-slate-400 text-xs mb-1">방법 1</p>
            <p>설정 → 개인 정보 보호 및 보안 → 위치 서비스 → Safari 웹사이트 → <span className="text-green-300">앱을 사용하는 동안</span></p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">방법 2</p>
            <p>설정 → Safari → 위치 → <span className="text-green-300">허용</span></p>
          </div>
          <p className="text-slate-400 text-xs">설정 변경 후 Safari에서 페이지를 새로 고침해주세요</p>
        </div>
        <div className="bg-slate-700 rounded-xl p-4 text-left text-sm text-slate-200 space-y-3 max-w-xs w-full">
          <p className="font-semibold text-white">🤖 안드로이드 설정 방법</p>
          <div>
            <p className="text-slate-400 text-xs mb-1">Chrome 사용 시</p>
            <p>주소창 왼쪽 자물쇠 아이콘 → 권한 → 위치 → <span className="text-green-300">허용</span></p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">그래도 안 될 때</p>
            <p>설정 → 앱 → Chrome → 권한 → 위치 → <span className="text-green-300">앱 사용 중에만 허용</span></p>
          </div>
          <p className="text-slate-400 text-xs">설정 변경 후 페이지를 새로 고침해주세요</p>
        </div>
        <button onClick={() => window.location.reload()}
          className="px-6 py-2 bg-indigo-500 hover:bg-indigo-400 rounded-xl text-sm font-semibold transition-colors">
          새로 고침
        </button>
      </div>
    );
  }

  if (geoState === 'out_of_range') {
    return (
      <div className="min-h-screen bg-slate-800 flex flex-col items-center justify-center gap-5 p-8 text-white text-center">
        <MapPin size={64} className="text-red-400" />
        <h1 className="text-2xl font-bold">학원 근처가 아닙니다</h1>
        <p className="text-slate-300">현재 위치: 학원에서 약 {distance}m</p>
      </div>
    );
  }

  const kstHour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();
  if (kstHour < 16 && !timeBypassed) {
    return (
      <div className="min-h-screen bg-indigo-700 flex flex-col items-center justify-center gap-5 p-8 text-white text-center">
        <AlertCircle size={64} className="text-yellow-300" />
        <h1 className="text-2xl font-bold">아직 체크인 시간이 아닙니다</h1>
        <p className="text-indigo-200">체크인은 오후 4시부터 가능합니다</p>
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
          {distance !== null && (
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
                {success.name}님 {success.isLate ? '지각 처리되었습니다' : '체크인 완료!'}
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
            {processing ? '처리 중...' : '체크인'}
          </button>
        </div>
      </div>
    </div>
  );
}
