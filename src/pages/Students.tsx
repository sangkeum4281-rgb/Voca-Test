import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TestType } from '../types';
import {
  fetchStudents, addStudent, deleteStudent,
  fetchWordLists, fetchAllWeeklyResults,
  type Student,
} from '../lib/db';
import type { WordList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Loader, CheckCircle, XCircle, Clock, Users, BarChart2 } from 'lucide-react';

type Tab = 'roster' | 'weekly';

const REQUIRED: TestType[] = ['multiple-choice-en', 'multiple-choice-kr', 'fill-blank', 'spelling'];
const REQUIRED_LABELS: Record<string, string> = {
  'multiple-choice-en': '객관식(영→뜻)',
  'multiple-choice-kr': '객관식(뜻→영)',
  'fill-blank': '단답형',
  'spelling': '철자쓰기',
};

interface StudentStatus {
  name: string;
  scores: Record<string, number | null>;
  allPassed: boolean;
  notAttempted: number;
}

export default function Students() {
  const { isTeacher } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('roster');
  const [students, setStudents] = useState<Student[]>([]);
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [statusList, setStatusList] = useState<StudentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!isTeacher) { navigate('/'); return; }
    Promise.all([fetchStudents(), fetchWordLists()]).then(([s, wl]) => {
      setStudents(s);
      setWordLists(wl);
      if (wl.length > 0) setSelectedListId(wl[0].id);
      setLoading(false);
    });
  }, [isTeacher, navigate]);

  const handleAdd = async () => {
    if (!nameInput.trim() || adding) return;
    setAdding(true);
    try {
      const s = await addStudent(nameInput.trim());
      setStudents(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)));
      setNameInput('');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`'${name}' 학생을 삭제하시겠습니까?`)) return;
    await deleteStudent(id);
    setStudents(prev => prev.filter(s => s.id !== id));
  };

  const loadWeeklyStatus = async (listId: string) => {
    if (!listId) return;
    setWeeklyLoading(true);
    const results = await fetchAllWeeklyResults(listId);

    // 등록된 학생 + 이번 주에 시험 친 학생 모두 포함
    const names = new Set([
      ...students.map(s => s.name),
      ...results.map(r => r.studentName),
    ]);

    const map: Record<string, Record<string, number | null>> = {};
    for (const name of names) map[name] = { 'multiple-choice-en': null, 'multiple-choice-kr': null, 'fill-blank': null, 'spelling': null };

    for (const r of results) {
      if (!REQUIRED.includes(r.testType as TestType)) continue;
      const pct = Math.round((r.score / r.total) * 100);
      const cur = map[r.studentName]?.[r.testType];
      if (map[r.studentName]) {
        map[r.studentName][r.testType] = cur == null ? pct : Math.max(cur, pct);
      }
    }

    const statusArr: StudentStatus[] = Array.from(names).map(name => {
      const scores = map[name];
      const allPassed = REQUIRED.every(t => (scores[t] ?? 0) >= 80);
      const notAttempted = REQUIRED.filter(t => scores[t] == null).length;
      return { name, scores, allPassed, notAttempted };
    }).sort((a, b) => {
      if (a.allPassed !== b.allPassed) return a.allPassed ? 1 : -1;
      if (a.notAttempted !== b.notAttempted) return b.notAttempted - a.notAttempted;
      return a.name.localeCompare(b.name);
    });

    setStatusList(statusArr);
    setWeeklyLoading(false);
  };

  useEffect(() => {
    if (tab === 'weekly' && selectedListId) loadWeeklyStatus(selectedListId);
  }, [tab, selectedListId]);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader size={28} className="animate-spin text-indigo-400" /></div>;
  }

  const passedCount = statusList.filter(s => s.allPassed).length;
  const failedCount = statusList.filter(s => !s.allPassed && s.notAttempted < 4).length;
  const notStartedCount = statusList.filter(s => s.notAttempted === 4).length;

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
      </div>

      {/* 학생 목록 탭 */}
      {tab === 'roster' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="학생 이름 추가"
              autoFocus
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
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {students.map(s => (
                <div key={s.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="font-medium text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-400">등록일: {new Date(s.createdAt).toLocaleDateString('ko-KR')}</p>
                  </div>
                  <button onClick={() => handleDelete(s.id, s.name)}
                    className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-400 text-center">총 {students.length}명 등록</p>
        </div>
      )}

      {/* 주간 현황 탭 */}
      {tab === 'weekly' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={selectedListId}
              onChange={e => setSelectedListId(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {wordLists.map(wl => <option key={wl.id} value={wl.id}>{wl.title}</option>)}
            </select>
            <button onClick={() => loadWeeklyStatus(selectedListId)} disabled={weeklyLoading}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-40">
              {weeklyLoading ? <Loader size={14} className="animate-spin" /> : '새로고침'}
            </button>
          </div>

          {/* 요약 카드 */}
          {statusList.length > 0 && (
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
          ) : statusList.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <p className="text-slate-400 text-sm">이번 주 응시 기록이 없습니다</p>
            </div>
          ) : (
            <>
              {/* 모바일: 카드 목록 */}
              <div className="md:hidden space-y-3">
                {statusList.map(({ name, scores, allPassed }) => (
                  <div key={name} className={`bg-white rounded-xl border p-4 ${allPassed ? 'border-green-200' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-semibold text-slate-800">{name}</p>
                      {allPassed
                        ? <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">✓ 완료</span>
                        : <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded-full">미완료</span>}
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
                      <th className="text-center px-3 py-3 font-semibold text-slate-600">완료</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {statusList.map(({ name, scores, allPassed }) => (
                      <tr key={name} className={allPassed ? 'bg-green-50/40' : ''}>
                        <td className="px-4 py-3 font-medium text-slate-800">{name}</td>
                        {REQUIRED.map(t => {
                          const score = scores[t];
                          const passed = score !== null && score >= 80;
                          return (
                            <td key={t} className="text-center px-3 py-3">
                              {score == null ? (
                                <Clock size={16} className="mx-auto text-slate-300" />
                              ) : passed ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
                                  <CheckCircle size={14} /> {score}%
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500">
                                  <XCircle size={14} /> {score}%
                                </span>
                              )}
                            </td>
                          );
                        })}
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
    </div>
  );
}
