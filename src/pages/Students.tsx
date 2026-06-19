import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TestType } from '../types';
import {
  fetchStudents, addStudent, deleteStudent, updateStudentPhone, updateStudentGpsExempt, sendSmsToStudents,
  fetchWordLists, fetchAllWeeklyResults, fetchAttendanceByWeek,
  fetchClassSchedules, upsertClassSchedule, deleteClassSchedule, getStartTime, setSchoolLocation, getSchoolLocation,
  getGpsBypassUntil, setGpsBypassUntil, getAutoAbsentSms, setAutoAbsentSms,
  getSmsTestPhone, setSmsTestPhone, getSpecialDates, setSpecialDates,
  getCheckinTimeBypassed, setCheckinTimeBypassUntil,
  fetchAllClassNotices, addClassNotice, deleteClassNotice, NOTICE_SUBJECTS,
  type Student, type AttendanceRecord, type ClassSchedule, type ClassNotice,
} from '../lib/db';
import type { WordList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Loader, CheckCircle, XCircle, Clock, Users, BarChart2, ChevronDown, ChevronUp, Phone, Pencil, AlarmClock, Bell } from 'lucide-react';

type Tab = 'roster' | 'weekly' | 'schedule' | 'notices';

const REQUIRED: TestType[] = ['multiple-choice-en', 'multiple-choice-kr', 'fill-blank', 'spelling'];
const REQUIRED_LABELS: Record<string, string> = {
  'multiple-choice-en': '객관식(영→뜻)',
  'multiple-choice-kr': '객관식(뜻→영)',
  'fill-blank': '단답형',
  'spelling': '철자쓰기',
};

interface StudentStatus {
  name: string;
  className: string;
  scores: Record<string, number | null>;
  allPassed: boolean;
  notAttempted: number;
  attPresent: number;
  attLate: number;
  attAbsent: number;
}

export default function Students() {
  const { isTeacher } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('roster');
  const [students, setStudents] = useState<Student[]>([]);
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [selectedWeeklyClass, setSelectedWeeklyClass] = useState('');
  const [statusList, setStatusList] = useState<StudentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [classInput, setClassInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [collapsedClasses, setCollapsedClasses] = useState<Set<string>>(new Set());
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [editingPhoneVal, setEditingPhoneVal] = useState('');
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [scheduleEdits, setScheduleEdits] = useState<Record<string, string>>({});
  const [schoolPos, setSchoolPos] = useState<{ lat: number; lng: number } | null>(null);
  const [savingPos, setSavingPos] = useState(false);
  const [gpsBypass, setGpsBypass] = useState(false);
  const [timeBypass, setTimeBypass] = useState(false);
  const [autoAbsentSms, setAutoAbsentSmsState] = useState(false);
  const [smsMode, setSmsMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [smsText, setSmsText] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsTestPhone, setSmsTestPhoneState] = useState('');
  const [smsTestInput, setSmsTestInput] = useState('');
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [openDates, setOpenDates] = useState<import('../lib/db').OpenDate[]>([]);
  const [specialDateInput, setSpecialDateInput] = useState('');
  const [specialTimeInput, setSpecialTimeInput] = useState('');
  const [specialClassesInput, setSpecialClassesInput] = useState<Set<string>>(new Set());
  const [notices, setNotices] = useState<ClassNotice[]>([]);
  const [noticeClass, setNoticeClass] = useState('');
  const [noticeContents, setNoticeContents] = useState<Record<string, string>>({});
  const [noticeSaving, setNoticeSaving] = useState(false);

  const downloadQR = async () => {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(window.location.origin + '/checkin')}`;
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '최강학원_체크인QR.png';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const toggleClass = (cls: string) => {
    setCollapsedClasses(prev => {
      const next = new Set(prev);
      next.has(cls) ? next.delete(cls) : next.add(cls);
      return next;
    });
  };

  useEffect(() => {
    if (!isTeacher) { navigate('/'); return; }
    Promise.all([fetchStudents(), fetchWordLists(), fetchClassSchedules(), getSchoolLocation(), getGpsBypassUntil(), getAutoAbsentSms(), getSmsTestPhone(), getSpecialDates(), getCheckinTimeBypassed()]).then(([s, wl, sch, loc, bypassUntil, autoSms, testPhone, special, timeBp]) => {
      setStudents(s);
      setWordLists(wl);
      setSchedules(sch);
      if (loc) setSchoolPos(loc);
      if (bypassUntil !== null && Date.now() < bypassUntil) setGpsBypass(true);
      setTimeBypass(timeBp);
      setAutoAbsentSmsState(autoSms);
      setSmsTestPhoneState(testPhone);
      setSmsTestInput(testPhone);
      setClosedDates(special.closed);
      setOpenDates(special.open);
      const edits: Record<string, string> = {};
      sch.forEach(sc => { edits[sc.gradeKey] = sc.startTime; });
      setScheduleEdits(edits);
      if (wl.length > 0) setSelectedListId(wl[0].id);
      const classes = [...new Set(s.map(x => x.className).filter(Boolean))].sort();
      if (classes.length > 0) { setSelectedWeeklyClass(classes[0]); setNoticeClass(classes[0]); }
      setLoading(false);
    });
    fetchAllClassNotices().then(setNotices);
  }, [isTeacher, navigate]);

  const handleAdd = async () => {
    if (!nameInput.trim() || adding) return;
    setAdding(true);
    try {
      const s = await addStudent(nameInput.trim(), classInput.trim(), phoneInput.trim());
      setStudents(prev => sortStudents([...prev, s]));
      setNameInput('');
      setPhoneInput('');
    } finally {
      setAdding(false);
    }
  };

  const handleSavePhone = async (id: string) => {
    try {
      await updateStudentPhone(id, editingPhoneVal.trim());
      setStudents(prev => prev.map(s => s.id === id ? { ...s, parentPhone: editingPhoneVal.trim() } : s));
      setEditingPhoneId(null);
    } catch (e) {
      alert(`저장 실패: ${String(e)}`);
    }
  };

  // sortStudents를 컴포넌트 내에서도 쓸 수 있도록
  const sortStudents = (list: Student[]) => {
    const isHigh = (cls: string) => /고등|고교|고\s*\d*\s*학년/.test(cls);
    return [...list].sort((a, b) => {
      const ld = (isHigh(a.className) ? 1 : 0) - (isHigh(b.className) ? 1 : 0);
      if (ld !== 0) return ld;
      const ga = parseInt(a.className.match(/(\d)\s*학년/)?.[1] ?? '9');
      const gb = parseInt(b.className.match(/(\d)\s*학년/)?.[1] ?? '9');
      const sa = a.className.replace(/\s*\d+\s*학년.*$/, '').trim();
      const sb = b.className.replace(/\s*\d+\s*학년.*$/, '').trim();
      return sa.localeCompare(sb, 'ko') || ga - gb;
    });
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`'${name}' 학생을 삭제하시겠습니까?`)) return;
    await deleteStudent(id);
    setStudents(prev => prev.filter(s => s.id !== id));
  };

  const loadWeeklyStatus = async (listId: string) => {
    if (!listId) return;
    setWeeklyLoading(true);

    const [results, attRecords] = await Promise.all([
      fetchAllWeeklyResults(listId),
      fetchAttendanceByWeek(),
    ]);

    // 등록된 학생 기준으로만 표시 (className 포함)
    const map: Record<string, Record<string, number | null>> = {};
    const attMap: Record<string, AttendanceRecord[]> = {};

    for (const s of students) {
      map[s.name] = { 'multiple-choice-en': null, 'multiple-choice-kr': null, 'fill-blank': null, 'spelling': null };
      attMap[s.name] = [];
    }

    for (const r of results) {
      if (!REQUIRED.includes(r.testType as TestType) || !map[r.studentName]) continue;
      const pct = Math.round((r.score / r.total) * 100);
      const cur = map[r.studentName][r.testType];
      map[r.studentName][r.testType] = cur == null ? pct : Math.max(cur, pct);
    }

    for (const r of attRecords) {
      if (attMap[r.studentName]) attMap[r.studentName].push(r);
    }

    const statusArr: StudentStatus[] = students.map(s => {
      const scores = map[s.name];
      const allPassed = REQUIRED.every(t => (scores[t] ?? 0) >= 80);
      const notAttempted = REQUIRED.filter(t => scores[t] == null).length;
      const att = attMap[s.name] ?? [];
      return {
        name: s.name,
        className: s.className,
        scores,
        allPassed,
        notAttempted,
        attPresent: att.filter(a => a.status === 'present').length,
        attLate:    att.filter(a => a.status === 'late').length,
        attAbsent:  att.filter(a => a.status === 'absent').length,
      };
    }).sort((a, b) => {
      if (a.allPassed !== b.allPassed) return a.allPassed ? 1 : -1;
      if (a.notAttempted !== b.notAttempted) return b.notAttempted - a.notAttempted;
      return a.name.localeCompare(b.name);
    });

    setStatusList(statusArr);
    setWeeklyLoading(false);
  };

  useEffect(() => {
    if (tab === 'weekly' && selectedListId && students.length > 0) loadWeeklyStatus(selectedListId);
  }, [tab, selectedListId, students]);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader size={28} className="animate-spin text-indigo-400" /></div>;
  }

  const classes = [...new Set(students.map(s => s.className).filter(Boolean))].sort();

  // 선택된 반으로 필터
  const filteredStatus = selectedWeeklyClass
    ? statusList.filter(s => s.className === selectedWeeklyClass)
    : statusList;

  const passedCount    = filteredStatus.filter(s => s.allPassed).length;
  const failedCount    = filteredStatus.filter(s => !s.allPassed && s.notAttempted < 4).length;
  const notStartedCount = filteredStatus.filter(s => s.notAttempted === 4).length;

  return (
    <>
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">학생 관리</h1>
        <p className="text-slate-500 text-sm mt-0.5">학생 목록 관리 및 주간 과제 현황</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button onClick={() => setTab('roster')}
          className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'roster' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          <Users size={15} /> 학생 목록
        </button>
        <button onClick={() => setTab('weekly')}
          className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'weekly' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          <BarChart2 size={15} /> 주간 현황
        </button>
        <button onClick={() => setTab('schedule')}
          className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'schedule' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          <AlarmClock size={15} /> 수업 시간
        </button>
        <button onClick={() => setTab('notices')}
          className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'notices' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          <Bell size={15} /> 알림장
        </button>
      </div>

      {/* 학생 목록 탭 */}
      {tab === 'roster' && (
        <div className="space-y-4">
          {/* 체크인 QR */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center gap-5">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(window.location.origin + '/checkin')}`}
              alt="체크인 QR"
              className="w-24 h-24 rounded-lg border border-indigo-200"
            />
            <div>
              <p className="font-semibold text-indigo-700 mb-1">학생 출석 QR</p>
              <p className="text-xs text-slate-500">학원 50m 이내에서만 출석 가능</p>
              <p className="text-xs text-slate-400 mt-0.5">인쇄하거나 화면에 띄워두세요</p>
              <div className="flex items-center gap-3 mt-2">
                <a href="/checkin" target="_blank"
                  className="text-xs text-indigo-600 hover:underline">
                  {window.location.origin}/checkin
                </a>
                <button onClick={downloadQR}
                  className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-md hover:bg-indigo-700 active:scale-95 transition-all">
                  다운로드
                </button>
                <button onClick={() => {
                  const key = `checkin-${new Date().toISOString().slice(0, 10)}`;
                  localStorage.removeItem(key);
                  alert('체크인 기록 초기화됨');
                }}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors">
                  초기화
                </button>
                <button onClick={async () => {
                  if (gpsBypass) {
                    await setGpsBypassUntil(null);
                    setGpsBypass(false);
                  } else {
                    await setGpsBypassUntil(Date.now() + 2 * 60 * 60 * 1000);
                    setGpsBypass(true);
                  }
                }}
                  className={`text-xs px-2 py-1 rounded-md transition-colors ${gpsBypass ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-orange-500'}`}>
                  {gpsBypass ? 'GPS 우회 ON' : 'GPS 우회'}
                </button>
                <button onClick={async () => {
                  if (timeBypass) {
                    await setCheckinTimeBypassUntil(null);
                    setTimeBypass(false);
                  } else {
                    await setCheckinTimeBypassUntil(Date.now() + 2 * 60 * 60 * 1000);
                    setTimeBypass(true);
                  }
                }}
                  className={`text-xs px-2 py-1 rounded-md transition-colors ${timeBypass ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-blue-500'}`}>
                  {timeBypass ? '시간제한 해제 ON' : '시간제한 해제'}
                </button>
                <button onClick={async () => {
                  const next = !autoAbsentSms;
                  if (next && !confirm('수업 시작 10분 후 미체크인 학생 학부모에게 자동 문자를 발송합니다. 활성화하시겠습니까?')) return;
                  await setAutoAbsentSms(next);
                  setAutoAbsentSmsState(next);
                }}
                  className={`text-xs px-2 py-1 rounded-md transition-colors ${autoAbsentSms ? 'bg-red-500 text-white' : 'text-slate-400 hover:text-red-500'}`}>
                  {autoAbsentSms ? '자동문자 ON' : '자동문자'}
                </button>
              </div>
            </div>
          </div>

          {/* SMS 테스트 모드 */}
          <div className={`rounded-xl border p-3 ${smsTestPhone ? 'bg-orange-50 border-orange-300' : 'bg-slate-50 border-slate-200'}`}>
            <p className="text-xs font-semibold text-slate-600 mb-2">
              📱 SMS 테스트 모드 {smsTestPhone && <span className="text-orange-600">— 모든 문자가 {smsTestPhone}로만 발송됩니다</span>}
            </p>
            <div className="flex gap-2">
              <input
                type="tel"
                value={smsTestInput}
                onChange={e => setSmsTestInput(e.target.value)}
                placeholder="테스트 받을 번호 (예: 01012345678)"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <button onClick={async () => {
                await setSmsTestPhone(smsTestInput);
                setSmsTestPhoneState(smsTestInput.replace(/[^0-9]/g, ''));
              }} className="px-3 py-1.5 bg-orange-500 text-white text-xs rounded-lg hover:bg-orange-600">
                설정
              </button>
              {smsTestPhone && (
                <button onClick={async () => {
                  await setSmsTestPhone('');
                  setSmsTestPhoneState('');
                  setSmsTestInput('');
                }} className="px-3 py-1.5 bg-slate-400 text-white text-xs rounded-lg hover:bg-slate-500">
                  해제
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <input
              className="flex-1 min-w-[120px] border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={classInput}
              onChange={e => setClassInput(e.target.value)}
              placeholder="반 (예: 동부중 3학년)"
            />
            <input
              className="flex-1 min-w-[80px] border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="학생 이름"
            />
            <input
              className="flex-1 min-w-[110px] border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value)}
              placeholder="학부모 전화번호"
            />
            <button onClick={handleAdd} disabled={!nameInput.trim() || adding}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40">
              <Plus size={15} /> 추가
            </button>
          </div>

          {/* 문자 보내기 모드 토글 */}
          <div className="flex items-center justify-between">
            <button onClick={() => { setSmsMode(v => !v); setSelectedIds(new Set()); setSmsText(''); }}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${smsMode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {smsMode ? '문자 모드 취소' : '문자 보내기'}
            </button>
            {smsMode && selectedIds.size > 0 && (
              <span className="text-xs text-indigo-600 font-medium">{selectedIds.size}명 선택됨</span>
            )}
          </div>

          {students.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <Users size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-400 text-sm">등록된 학생이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...new Set(students.map(s => s.className))].sort().map(cls => {
                const inClass = students.filter(s => s.className === cls);
                const collapsed = collapsedClasses.has(cls);
                return (
                  <div key={cls} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center px-5 py-3 bg-slate-50">
                      <button onClick={() => toggleClass(cls)} className="flex-1 flex items-center gap-2 text-left">
                        <p className="text-sm font-semibold text-slate-700">{cls || '반 미지정'}</p>
                        <span className="text-xs text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">{inClass.length}명</span>
                      </button>
                      {smsMode && (
                        <button onClick={() => {
                          const allSelected = inClass.every(s => selectedIds.has(s.id));
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            inClass.forEach(s => allSelected ? next.delete(s.id) : next.add(s.id));
                            return next;
                          });
                        }} className="text-xs text-indigo-600 hover:text-indigo-800 mr-3 whitespace-nowrap">
                          {inClass.every(s => selectedIds.has(s.id)) ? '전체 해제' : '전체 선택'}
                        </button>
                      )}
                      <button onClick={() => toggleClass(cls)}>
                        {collapsed ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronUp size={16} className="text-slate-400" />}
                      </button>
                    </div>
                    {!collapsed && (
                      <div className="divide-y divide-slate-100">
                        {inClass.map(s => (
                          <div key={s.id} className="flex items-center justify-between px-5 py-3 gap-3">
                            {smsMode && (
                              <input type="checkbox" checked={selectedIds.has(s.id)}
                                onChange={() => setSelectedIds(prev => {
                                  const next = new Set(prev);
                                  next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                                  return next;
                                })}
                                className="w-4 h-4 accent-indigo-600 flex-shrink-0 cursor-pointer"
                              />
                            )}
                            <p className="font-medium text-slate-800 text-sm w-20 flex-shrink-0">{s.name}</p>
                            {editingPhoneId === s.id ? (
                              <div className="flex flex-1 gap-1.5">
                                <input
                                  className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                  value={editingPhoneVal}
                                  onChange={e => setEditingPhoneVal(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && handleSavePhone(s.id)}
                                  placeholder="010-0000-0000"
                                  autoFocus
                                />
                                <button onClick={() => handleSavePhone(s.id)}
                                  className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700">저장</button>
                                <button onClick={() => setEditingPhoneId(null)}
                                  className="px-2 py-1.5 border border-slate-300 rounded-lg text-xs hover:bg-slate-50">취소</button>
                              </div>
                            ) : (
                              <div className="flex flex-1 items-center gap-1.5">
                                {s.parentPhone ? (
                                  <span className="flex items-center gap-1 text-xs text-slate-500">
                                    <Phone size={11} className="text-green-500" /> {s.parentPhone}
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-300">전화번호 없음</span>
                                )}
                                <button onClick={() => { setEditingPhoneId(s.id); setEditingPhoneVal(s.parentPhone); }}
                                  className="p-1 rounded hover:bg-slate-100 text-slate-300 hover:text-indigo-500 ml-auto">
                                  <Pencil size={13} />
                                </button>
                              </div>
                            )}
                            <button onClick={async () => {
                                const next = !s.gpsExempt;
                                await updateStudentGpsExempt(s.id, next);
                                setStudents(prev => prev.map(x => x.id === s.id ? { ...x, gpsExempt: next } : x));
                              }}
                              className={`text-xs px-1.5 py-0.5 rounded transition-colors flex-shrink-0 ${s.gpsExempt ? 'bg-orange-100 text-orange-600' : 'text-slate-300 hover:text-orange-400'}`}>
                              GPS예외
                            </button>
                            <button onClick={() => handleDelete(s.id, s.name)}
                              className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-slate-400 text-center">총 {students.length}명 등록</p>
        </div>
      )}

      {/* 주간 현황 탭 */}
      {tab === 'weekly' && (
        <div className="space-y-4">
          {/* 반 선택 */}
          <div className="flex flex-wrap gap-2">
            {classes.map(c => (
              <button key={c} onClick={() => setSelectedWeeklyClass(c)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  selectedWeeklyClass === c
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}>
                {c}
              </button>
            ))}
          </div>

          {/* 단어장 선택 */}
          <div className="flex items-center gap-3">
            <select value={selectedListId} onChange={e => setSelectedListId(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              {wordLists.map(wl => <option key={wl.id} value={wl.id}>{wl.title}</option>)}
            </select>
            <button onClick={() => loadWeeklyStatus(selectedListId)} disabled={weeklyLoading}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-40">
              {weeklyLoading ? <Loader size={14} className="animate-spin" /> : '새로고침'}
            </button>
          </div>

          {/* 요약 카드 */}
          {filteredStatus.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{passedCount}</p>
                <p className="text-xs text-green-600 mt-0.5">과제 완료</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-red-500">{failedCount}</p>
                <p className="text-xs text-red-500 mt-0.5">미통과</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-slate-500">{notStartedCount}</p>
                <p className="text-xs text-slate-500 mt-0.5">미응시</p>
              </div>
            </div>
          )}

          {weeklyLoading ? (
            <div className="flex justify-center py-12"><Loader size={24} className="animate-spin text-indigo-400" /></div>
          ) : filteredStatus.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <p className="text-slate-400 text-sm">이번 주 데이터가 없습니다</p>
            </div>
          ) : (
            <>
              {/* 모바일: 카드 */}
              <div className="md:hidden space-y-3">
                {filteredStatus.map(({ name, scores, allPassed, attPresent, attLate, attAbsent }) => (
                  <div key={name} className={`bg-white rounded-xl border p-4 ${allPassed ? 'border-green-200' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-semibold text-slate-800">{name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">
                          출{attPresent} 지{attLate} 결{attAbsent}
                        </span>
                        {allPassed
                          ? <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">✓ 완료</span>
                          : <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded-full">미완료</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {REQUIRED.map(t => {
                        const score = scores[t];
                        const passed = score !== null && score >= 80;
                        return (
                          <div key={t} className={`rounded-lg px-3 py-2 text-xs ${
                            score == null ? 'bg-slate-50 text-slate-400'
                            : passed ? 'bg-green-50 text-green-600'
                            : 'bg-red-50 text-red-500'
                          }`}>
                            <p className="font-medium">{REQUIRED_LABELS[t]}</p>
                            <p className="font-bold mt-0.5">
                              {score == null ? '미응시' : `${score}% ${passed ? '✓' : '✗'}`}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* 데스크탑: 테이블 */}
              <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">학생</th>
                      {REQUIRED.map(t => (
                        <th key={t} className="text-center px-3 py-3 font-semibold text-slate-600 text-xs">
                          {REQUIRED_LABELS[t]}
                        </th>
                      ))}
                      <th className="text-center px-3 py-3 font-semibold text-green-600 text-xs">출석</th>
                      <th className="text-center px-3 py-3 font-semibold text-yellow-600 text-xs">지각</th>
                      <th className="text-center px-3 py-3 font-semibold text-red-500 text-xs">결석</th>
                      <th className="text-center px-3 py-3 font-semibold text-slate-600 text-xs">완료</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStatus.map(({ name, scores, allPassed, attPresent, attLate, attAbsent }) => (
                      <tr key={name} className={allPassed ? 'bg-green-50/40' : ''}>
                        <td className="px-4 py-3 font-medium text-slate-800">{name}</td>
                        {REQUIRED.map(t => {
                          const score = scores[t];
                          const passed = score !== null && score >= 80;
                          return (
                            <td key={t} className="text-center px-3 py-3">
                              {score == null ? (
                                <Clock size={14} className="mx-auto text-slate-300" />
                              ) : passed ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
                                  <CheckCircle size={13} /> {score}%
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500">
                                  <XCircle size={13} /> {score}%
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="text-center px-3 py-3 text-sm font-semibold text-green-600">{attPresent || '-'}</td>
                        <td className="text-center px-3 py-3 text-sm font-semibold text-yellow-600">{attLate || '-'}</td>
                        <td className="text-center px-3 py-3 text-sm font-semibold text-red-500">{attAbsent || '-'}</td>
                        <td className="text-center px-3 py-3">
                          {allPassed
                            ? <span className="text-xs font-bold text-green-600">✓ 완료</span>
                            : <span className="text-xs text-red-400">미완료</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* 수업 시간 탭 */}
      {tab === 'schedule' && (
        <div className="space-y-4 max-w-sm">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-indigo-700 mb-1">수업 시작 시간 설정</p>
            <p className="text-xs text-slate-500">QR 출석 시 시작 시간 이후 도착하면 자동 지각 처리됩니다</p>
          </div>
          {(['중등부', '고등부'] as const).map(division => (
            <div key={division}>
              <p className="text-xs font-semibold text-slate-500 px-1 mb-1">{division}</p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {['1학년', '2학년', '3학년'].map(grade => {
                  const key = `${division} ${grade}`;
                  return (
                    <div key={key} className="flex items-center justify-between px-5 py-4">
                      <span className="font-semibold text-slate-700 text-sm">{grade}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={scheduleEdits[key] ?? '16:30'}
                          onChange={e => setScheduleEdits(prev => ({ ...prev, [key]: e.target.value }))}
                          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        <button
                          onClick={async () => {
                            await upsertClassSchedule(key, scheduleEdits[key] ?? '16:30');
                            setSchedules(prev => {
                              const exists = prev.find(s => s.gradeKey === key);
                              const t = scheduleEdits[key] ?? '16:30';
                              if (exists) return prev.map(s => s.gradeKey === key ? { ...s, startTime: t } : s);
                              return [...prev, { gradeKey: key, startTime: t }];
                            });
                            alert(`${key} 수업 시간이 저장되었습니다.`);
                          }}
                          className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700"
                        >
                          저장
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* 반별 시간 설정 (같은 학년이라도 시간대가 다른 반) */}
          {classes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 px-1 mb-1">반별 시간 (학년 기본값과 다를 때만 입력)</p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {classes.map(cls => {
                  const override = schedules.find(s => s.gradeKey === cls);
                  const defaultTime = getStartTime(cls, schedules.filter(s => s.gradeKey !== cls));
                  return (
                    <div key={cls} className="flex items-center justify-between px-5 py-4 gap-2">
                      <span className="font-semibold text-slate-700 text-sm truncate">{cls}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="time"
                          value={scheduleEdits[cls] ?? override?.startTime ?? ''}
                          placeholder={defaultTime}
                          onChange={e => setScheduleEdits(prev => ({ ...prev, [cls]: e.target.value }))}
                          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        <button
                          onClick={async () => {
                            const t = scheduleEdits[cls];
                            if (!t) return;
                            await upsertClassSchedule(cls, t);
                            setSchedules(prev => {
                              const exists = prev.find(s => s.gradeKey === cls);
                              if (exists) return prev.map(s => s.gradeKey === cls ? { ...s, startTime: t } : s);
                              return [...prev, { gradeKey: cls, startTime: t }];
                            });
                            alert(`${cls} 수업 시간이 저장되었습니다.`);
                          }}
                          className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700"
                        >
                          저장
                        </button>
                        {override && (
                          <button
                            onClick={async () => {
                              await deleteClassSchedule(cls);
                              setSchedules(prev => prev.filter(s => s.gradeKey !== cls));
                              setScheduleEdits(prev => {
                                const next = { ...prev };
                                delete next[cls];
                                return next;
                              });
                            }}
                            className="px-2 py-1.5 text-xs text-slate-400 hover:text-red-500"
                          >
                            초기화
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 휴원일 / 보강일 설정 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
            <p className="text-sm font-semibold text-slate-700">휴원일 / 보강일 설정</p>
            <div className="flex gap-2">
              <input type="date" value={specialDateInput} onChange={e => setSpecialDateInput(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <button onClick={async () => {
                if (!specialDateInput || closedDates.includes(specialDateInput)) return;
                const next = [...closedDates, specialDateInput].sort();
                await setSpecialDates(next, openDates);
                setClosedDates(next); setSpecialDateInput('');
              }} className="px-3 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 whitespace-nowrap">휴원일</button>
            </div>
            <div className="flex gap-2 items-center">
              <input type="time" value={specialTimeInput} onChange={e => setSpecialTimeInput(e.target.value)}
                placeholder="보강 시간 (선택)" className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <p className="text-xs text-slate-400">시간 미입력 시 기본 수업 시간 적용</p>
              <button onClick={async () => {
                if (!specialDateInput || openDates.find(o => o.date === specialDateInput)) return;
                const next = [...openDates, {
                  date: specialDateInput,
                  time: specialTimeInput || undefined,
                  classes: specialClassesInput.size > 0 ? [...specialClassesInput] : undefined,
                }].sort((a,b) => a.date.localeCompare(b.date));
                await setSpecialDates(closedDates, next);
                setOpenDates(next); setSpecialDateInput(''); setSpecialTimeInput(''); setSpecialClassesInput(new Set());
              }} className="ml-auto px-3 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 whitespace-nowrap">보강일 추가</button>
            </div>
            {classes.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-1.5">대상 반 (선택 안 하면 전체 반 적용)</p>
                <div className="flex flex-wrap gap-1.5">
                  {classes.map(c => {
                    const selected = specialClassesInput.has(c);
                    return (
                      <button key={c} type="button" onClick={() => {
                        setSpecialClassesInput(prev => {
                          const next = new Set(prev);
                          next.has(c) ? next.delete(c) : next.add(c);
                          return next;
                        });
                      }}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          selected ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'
                        }`}>
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {closedDates.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-500 mb-1">휴원일</p>
                <div className="flex flex-wrap gap-1.5">
                  {closedDates.map(d => (
                    <span key={d} className="flex items-center gap-1 bg-red-50 border border-red-200 text-red-600 text-xs px-2 py-1 rounded-full">
                      {d}
                      <button onClick={async () => {
                        const next = closedDates.filter(x => x !== d);
                        await setSpecialDates(next, openDates); setClosedDates(next);
                      }} className="text-red-400 hover:text-red-600 font-bold">×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {openDates.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-blue-500 mb-1">보강일 (주말 수업)</p>
                <div className="flex flex-wrap gap-1.5">
                  {openDates.map(o => (
                    <span key={o.date} className="flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-600 text-xs px-2 py-1 rounded-full">
                      {o.date}{o.time ? ` ${o.time}` : ''}{o.classes?.length ? ` · ${o.classes.join(', ')}` : ''}
                      <button onClick={async () => {
                        const next = openDates.filter(x => x.date !== o.date);
                        await setSpecialDates(closedDates, next); setOpenDates(next);
                      }} className="text-blue-400 hover:text-blue-600 font-bold">×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 학원 위치 설정 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">학원 위치 설정</p>
            <p className="text-xs text-slate-400">학원에서 이 버튼을 누르면 현재 위치가 학원으로 등록됩니다.<br />학생들은 반경 50m 이내에서만 출석 가능합니다.</p>
            {schoolPos && (
              <p className="text-xs text-green-600 font-medium">✓ 위치 등록됨 ({schoolPos.lat.toFixed(5)}, {schoolPos.lng.toFixed(5)})</p>
            )}
            <button
              disabled={savingPos}
              onClick={async () => {
                setSavingPos(true);
                navigator.geolocation.getCurrentPosition(
                  async (pos) => {
                    const { latitude, longitude } = pos.coords;
                    await setSchoolLocation(latitude, longitude);
                    setSchoolPos({ lat: latitude, lng: longitude });
                    setSavingPos(false);
                    alert('학원 위치가 저장되었습니다!');
                  },
                  () => { setSavingPos(false); alert('위치 권한을 허용해주세요.'); }
                );
              }}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingPos ? '위치 확인 중...' : '📍 현재 위치를 학원으로 설정'}
            </button>
          </div>
        </div>
      )}
      {/* ── 알림장 탭 ── */}
      {tab === 'notices' && (
        <div className="space-y-4 max-w-lg">
          {/* 새 알림 작성 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">알림 작성</p>
            <div className="flex flex-wrap gap-2">
              {classes.map(c => (
                <button key={c} onClick={() => setNoticeClass(c)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    noticeClass === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {([
                ['국어/역사', 'text-blue-700 bg-blue-50 border-blue-200', 'focus:ring-blue-400'],
                ['수학',     'text-green-700 bg-green-50 border-green-200', 'focus:ring-green-400'],
                ['영어',     'text-violet-700 bg-violet-50 border-violet-200', 'focus:ring-violet-400'],
                ['과학/사회','text-orange-700 bg-orange-50 border-orange-200', 'focus:ring-orange-400'],
              ] as const).map(([s, badge, ring]) => (
                <div key={s} className="flex gap-2 items-start">
                  <span className={`w-20 shrink-0 text-xs font-semibold border px-2 py-2 rounded-lg text-center ${badge}`}>{s}</span>
                  <textarea
                    value={noticeContents[s] ?? ''}
                    onChange={e => setNoticeContents(prev => ({ ...prev, [s]: e.target.value }))}
                    placeholder={`${s} 숙제·시험 안내`}
                    rows={2}
                    className={`flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 ${ring}`}
                  />
                </div>
              ))}
            </div>
            <button
              disabled={!noticeClass || NOTICE_SUBJECTS.every(s => !noticeContents[s]?.trim()) || noticeSaving}
              onClick={async () => {
                const entries = NOTICE_SUBJECTS.filter(s => noticeContents[s]?.trim());
                if (!noticeClass || entries.length === 0) return;
                setNoticeSaving(true);
                try {
                  await Promise.all(entries.map(s => addClassNotice(noticeClass, noticeContents[s].trim(), s)));
                  setNoticeContents({});
                  setNotices(await fetchAllClassNotices());
                } finally { setNoticeSaving(false); }
              }}
              className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {noticeSaving ? <Loader size={14} className="animate-spin" /> : <Bell size={14} />}
              알림 등록
            </button>
          </div>

          {/* 오늘 등록된 알림 목록 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">
              {new Date(Date.now() + 9 * 60 * 60 * 1000).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' })}
            </span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          {notices.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-6">오늘 등록된 알림이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {notices.map(n => {
                const SUBJECT_COLORS: Record<string, string> = {
                  '국어/역사': 'text-blue-700 bg-blue-100',
                  '수학': 'text-green-700 bg-green-100',
                  '영어': 'text-violet-700 bg-violet-100',
                  '과학/사회': 'text-orange-700 bg-orange-100',
                };
                return (
                  <div key={n.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{n.className}</span>
                        {n.subject && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SUBJECT_COLORS[n.subject] ?? 'text-amber-700 bg-amber-100'}`}>{n.subject}</span>}
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.content}</p>
                    </div>
                    <button onClick={async () => {
                      await deleteClassNotice(n.id);
                      setNotices(prev => prev.filter(x => x.id !== n.id));
                    }} className="shrink-0 text-slate-300 hover:text-red-400 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
      {smsMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-lg z-50">
          <div className="max-w-lg mx-auto">
            <div className="flex gap-2">
              <input
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="메시지 입력 ([최강학원] 자동 추가)"
                value={smsText}
                onChange={e => setSmsText(e.target.value)}
              />
              <button
                disabled={selectedIds.size === 0 || !smsText.trim() || smsSending}
                onClick={async () => {
                  if (!confirm(`${selectedIds.size}명에게 문자를 보낼까요?`)) return;
                  setSmsSending(true);
                  const { sent, failed } = await sendSmsToStudents([...selectedIds], `[최강학원] ${smsText.trim()}`);
                  setSmsSending(false);
                  alert(`발송 완료: ${sent}명 성공, ${failed}명 실패`);
                  setSmsMode(false);
                  setSelectedIds(new Set());
                  setSmsText('');
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 whitespace-nowrap"
              >
                {smsSending ? '발송 중...' : `${selectedIds.size}명 발송`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
