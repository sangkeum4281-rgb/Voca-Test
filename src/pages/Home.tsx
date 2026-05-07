import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { WordList, TestResult } from '../types';
import { fetchWordLists } from '../lib/db';
import { fetchTestResults } from '../lib/db';
import { getMasteryLevel } from '../utils';
import { BookOpen, Trophy, Target, TrendingUp, ArrowRight, Plus, Loader } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Home() {
  const { isTeacher } = useAuth();
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchWordLists(), fetchTestResults()])
      .then(([wl, r]) => { setWordLists(wl); setResults(r); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader size={28} className="animate-spin text-indigo-400" />
      </div>
    );
  }

  const totalWords = wordLists.reduce((a, wl) => a + wl.words.length, 0);
  const masteredWords = wordLists.flatMap(wl => wl.words).filter(w => getMasteryLevel(w) === 3).length;
  const avgScore = results.length
    ? Math.round(results.reduce((a, r) => a + (r.score / r.total) * 100, 0) / results.length)
    : 0;
  const recentResults = results.slice(0, 5);

  const stats = [
    { label: '단어장', value: wordLists.length, icon: BookOpen, color: 'text-indigo-600 bg-indigo-50' },
    { label: '전체 단어', value: totalWords, icon: Target, color: 'text-blue-600 bg-blue-50' },
    { label: '완전습득', value: masteredWords, icon: Trophy, color: 'text-green-600 bg-green-50' },
    { label: '평균 점수', value: `${avgScore}%`, icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">대시보드</h1>
          <p className="text-slate-500 text-sm mt-1">
            {isTeacher ? '선생님 모드 — 단어장 관리 중' : '공부할 단어장을 선택하세요'}
          </p>
        </div>
        {isTeacher && (
          <Link
            to="/wordlists"
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            <Plus size={16} /> 단어장 관리
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
            <div className={`rounded-lg p-2.5 ${color}`}>
              <Icon size={20} />
            </div>
            <div>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-2xl font-bold text-slate-800">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-700">단어장 목록</h2>
            <Link to="/wordlists" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
              전체보기 <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {wordLists.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-slate-400 text-sm mb-3">단어장이 없습니다</p>
                {isTeacher && (
                  <Link to="/wordlists" className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                    <Plus size={14} /> 단어장 만들기
                  </Link>
                )}
              </div>
            ) : (
              wordLists.slice(0, 4).map(wl => {
                const mastered = wl.words.filter(w => getMasteryLevel(w) === 3).length;
                const pct = wl.words.length ? Math.round((mastered / wl.words.length) * 100) : 0;
                return (
                  <Link key={wl.id} to={`/wordlists/${wl.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="font-medium text-sm text-slate-700">{wl.title}</p>
                      <p className="text-xs text-slate-400">{wl.words.length}개 단어</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-green-600">{pct}% 습득</p>
                      <div className="w-20 h-1.5 bg-slate-100 rounded-full mt-1">
                        <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-700">최근 테스트 결과</h2>
            <Link to="/results" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
              전체보기 <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentResults.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">아직 테스트 기록이 없습니다</div>
            ) : (
              recentResults.map(r => {
                const pct = Math.round((r.score / r.total) * 100);
                return (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="font-medium text-sm text-slate-700">{r.studentName}</p>
                      <p className="text-xs text-slate-400">{r.wordListTitle}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {r.score}/{r.total} ({pct}%)
                      </p>
                      <p className="text-xs text-slate-400">{new Date(r.completedAt).toLocaleDateString('ko-KR')}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
