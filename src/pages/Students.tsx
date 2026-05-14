import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TestType } from '../types';
import {
  fetchStudents, addStudent, deleteStudent, updateStudentPhone,
  fetchWordLists, fetchAllWeeklyResults, fetchAttendanceByWeek,
  fetchClassSchedules, upsertClassSchedule, setSchoolLocation, getSchoolLocation,
  type Student, type AttendanceRecord, type ClassSchedule,
} from '../lib/db';
import type { WordList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Loader, CheckCircle, XCircle, Clock, Users, BarChart2, ChevronDown, ChevronUp, Phone, Pencil, AlarmClock } from 'lucide-react';

type Tab = 'roster' | 'weekly' | 'schedule';

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
  const [_schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [scheduleEdits, setScheduleEdits] = useState<Record<string, string>>({});
  const [schoolPos, setSchoolPos] = useState<{ lat: number; lng: number } | null>(null);
  const [savingPos, setSavingPos] = useState(false);

  const toggleClass = (cls: string) => {
    setCollapsedClasses(prev => {
      const next = new Set(prev);
      next.has(cls) ? next.delete(cls) : next.add(cls);
      return next;
    });
  };

  useEffect(() => {
    if (!isTeacher) { navigate('/'); return; }
    Promise.all([fetchStudents(), fetchWordLists(), fetchClassSchedules(), getSchoolLocation()]).then(([s, wl, sch, loc]) => {
      setStudents(s);
      setWordLists(wl);
      setSchedules(sch);
      if (loc) setSchoolPos(loc);
      const edits: Record<string, string> = {};
      sch.forEach(sc => { edits[sc.gradeKey] = sc.startTime; });
      setScheduleEdits(edits);
      if (wl.length > 0) setSelectedListId(wl[0].id);
      const classes = [...new Set(s.map(x => x.className).filter(Boolean))].sort();
      if (classes.length > 0) setSelectedWeeklyClass(classes[0]);
      setLoading(false);
    });
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
              <p className="font-semibold text-indigo-700 mb-1">학생 출석 체크인 QR</p>
              <p className="text-xs text-slate-500">학원 200m 이내에서만 체크인 가능</p>
              <p className="text-xs text-slate-400 mt-0.5">인쇄하거나 화면에 띄워두세요</p>
              <a href="/checkin" target="_blank"
                className="inline-block mt-2 text-xs text-indigo-600 hover:underline">
                {window.location.origin}/checkin
              </a>
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
                    <button onClick={() => toggleClass(cls)}
                      className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-700">{cls || '반 미지정'}</p>
                        <span className="text-xs text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">{inClass.length}명</span>
                      </div>
                      {collapsed ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronUp size={16} className="text-slate-400" />}
                    </button>
                    {!collapsed && (
                      <div className="divide-y divide-slate-100">
                        {inClass.map(s => (
                          <div key={s.id} className="flex items-center justify-between px-5 py-3 gap-3">
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
            <p className="text-xs text-slate-500">QR 체크인 시 시작 시간 이후 도착하면 자동 지각 처리됩니다</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {['1학년', '2학년', '3학년'].map(grade => (
              <div key={grade} className="flex items-center justify-between px-5 py-4">
                <span className="font-semibold text-slate-700 text-sm">{grade}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={scheduleEdits[grade] ?? '16:30'}
                    onChange={e => setScheduleEdits(prev => ({ ...prev, [grade]: e.target.value }))}
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    onClick={async () => {
                      await upsertClassSchedule(grade, scheduleEdits[grade] ?? '16:30');
                      setSchedules(prev => {
                        const exists = prev.find(s => s.gradeKey === grade);
                        const t = scheduleEdits[grade] ?? '16:30';
                        if (exists) return prev.map(s => s.gradeKey === grade ? { ...s, startTime: t } : s);
                        return [...prev, { gradeKey: grade, startTime: t }];
                      });
                      alert(`${grade} 수업 시간이 저장되었습니다.`);
                    }}
                    className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700"
                  >
                    저장
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 text-center">모든 학교의 동일 학년에 동일하게 적용됩니다</p>

          {/* 학원 위치 설정 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">학원 위치 설정</p>
            <p className="text-xs text-slate-400">학원에서 이 버튼을 누르면 현재 위치가 학원으로 등록됩니다.<br />학생들은 반경 200m 이내에서만 체크인 가능합니다.</p>
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
    </div>
  );
}
