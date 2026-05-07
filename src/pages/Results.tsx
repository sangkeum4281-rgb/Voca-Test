import { useEffect, useState } from 'react';
import type { TestResult, TestType } from '../types';
import { fetchTestResults, deleteTestResult } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { Trash2, ChevronDown, ChevronUp, Trophy, Target, Calendar, Loader } from 'lucide-react';

const TYPE_LABELS: Record<TestType, string> = {
  'multiple-choice-en': '객관식 (영→뜻)',
  'multiple-choice-kr': '객관식 (뜻→영)',
  'fill-blank': '단답형',
  'spelling': '철자 쓰기',
  'synonym-match': '동의어 찾기',
  'antonym-match': '반의어 찾기',
  'definition': '영영풀이',
};

export default function Results() {
  const { isTeacher } = useAuth();
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterName, setFilterName] = useState('');
  const [filterList, setFilterList] = useState('');

  useEffect(() => {
    fetchTestResults().then(data => { setResults(data); setLoading(false); });
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('이 결과를 삭제하시겠습니까?')) return;
    await deleteTestResult(id);
    setResults(prev => prev.filter(r => r.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader size={28} className="animate-spin text-indigo-400" />
      </div>
    );
  }

  const uniqueNames = [...new Set(results.map(r => r.studentName))].sort();
  const uniqueLists = [...new Set(results.map(r => r.wordListTitle))].sort();
  const filtered = results
    .filter(r => !filterName || r.studentName === filterName)
    .filter(r => !filterList || r.wordListTitle === filterList);

  const avgScore = results.length
    ? Math.round(results.reduce((a, r) => a + (r.score / r.total) * 100, 0) / results.length)
    : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">테스트 결과 기록</h1>
        <p className="text-slate-500 text-sm mt-0.5">총 {results.length}회 테스트</p>
      </div>

      {results.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center shadow-sm">
            <Trophy size={20} className="mx-auto text-yellow-500 mb-1" />
            <p className="text-2xl font-bold text-slate-800">{avgScore}%</p>
            <p className="text-xs text-slate-500">전체 평균</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center shadow-sm">
            <Target size={20} className="mx-auto text-indigo-500 mb-1" />
            <p className="text-2xl font-bold text-slate-800">{results.length}</p>
            <p className="text-xs text-slate-500">총 테스트</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center shadow-sm">
            <Calendar size={20} className="mx-auto text-green-500 mb-1" />
            <p className="text-2xl font-bold text-slate-800">{uniqueNames.length}</p>
            <p className="text-xs text-slate-500">참여 학생</p>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <select value={filterName} onChange={e => setFilterName(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="">전체 학생</option>
            {uniqueNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={filterList} onChange={e => setFilterList(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="">전체 단어장</option>
            {uniqueLists.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {(filterName || filterList) && (
            <button onClick={() => { setFilterName(''); setFilterList(''); }}
              className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2">
              필터 초기화
            </button>
          )}
        </div>
      )}

      {results.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <Trophy size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 text-sm">아직 테스트 기록이 없습니다</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">검색 결과가 없습니다</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const pct = Math.round((r.score / r.total) * 100);
            const isExpanded = expanded === r.id;
            return (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                    pct >= 80 ? 'bg-green-100 text-green-700' : pct >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {pct}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800">{r.studentName}</span>
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{TYPE_LABELS[r.testType]}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {r.wordListTitle} · {r.score}/{r.total}개 정답 · {new Date(r.completedAt).toLocaleString('ko-KR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setExpanded(isExpanded ? null : r.id)}
                      className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {isTeacher && (
                      <button onClick={() => handleDelete(r.id)}
                        className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-4">
                    <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                      {r.answers.map((a, i) => (
                        <div key={i} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${a.correct ? 'bg-green-50' : 'bg-red-50'}`}>
                          <span className={`font-bold ${a.correct ? 'text-green-500' : 'text-red-500'}`}>{a.correct ? '✓' : '✗'}</span>
                          <div>
                            <span className="font-semibold text-slate-700">{a.english}</span>
                            <span className="text-slate-400 mx-1">→</span>
                            <span className="text-slate-600">{a.korean}</span>
                            {!a.correct && <span className="text-red-400 ml-1">(입력: {a.userAnswer})</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
