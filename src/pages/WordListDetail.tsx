import { useState, useRef, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import type { WordList, Word, TestType } from '../types';
import { fetchWordList, upsertWord, deleteWord, fetchWeeklyResults } from '../lib/db';
import { generateId, getMasteryColor, getMasteryLabel, getMasteryLevel, parseWords, shuffle, speak } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import WordEditor from '../components/WordEditor';
import FlashCard from '../components/FlashCard';
import {
  Plus, Upload, Pencil, Trash2, BookOpen, Play,
  ChevronLeft, ChevronRight, FileText, Printer, RotateCcw, Volume2, Loader,
  CheckCircle, XCircle, Clock
} from 'lucide-react';

type Tab = 'words' | 'study' | 'synonyms' | 'checklist';

const WEEKLY_REQUIRED: { type: TestType; label: string }[] = [
  { type: 'multiple-choice-en', label: '객관식 (영→뜻)' },
  { type: 'multiple-choice-kr', label: '객관식 (뜻→영)' },
  { type: 'fill-blank', label: '단답형' },
  { type: 'spelling', label: '철자쓰기' },
];

const STUDENT_NAME_KEY = 'vocab-student-name';

export default function WordListDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { isTeacher } = useAuth();

  const [wl, setWl] = useState<WordList | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(() =>
    searchParams.get('tab') === 'checklist' ? 'checklist' : 'words'
  );
  const [showEditor, setShowEditor] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | undefined>();
  const [studyIdx, setStudyIdx] = useState(0);
  const [studyWords, setStudyWords] = useState<Word[]>([]);
  const [reviewMode, setReviewMode] = useState(false);
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // 주간 체크리스트
  const [studentName, setStudentName] = useState(() => localStorage.getItem(STUDENT_NAME_KEY) ?? '');
  const [weeklyResults, setWeeklyResults] = useState<Record<TestType, number | null>>({
    'multiple-choice-en': null, 'multiple-choice-kr': null,
    'fill-blank': null, 'spelling': null,
    'synonym-match': null, 'antonym-match': null, 'definition': null,
  });
  const [checklistLoading, setChecklistLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchWordList(id).then(data => { setWl(data); setLoading(false); });
  }, [id]);

  const loadChecklist = async (name: string) => {
    if (!id || !name.trim()) return;
    setChecklistLoading(true);
    const results = await fetchWeeklyResults(id, name.trim());
    const best: Record<string, number | null> = {};
    for (const r of results) {
      const pct = Math.round((r.score / r.total) * 100);
      if (best[r.testType] == null || pct > best[r.testType]!) best[r.testType] = pct;
    }
    setWeeklyResults(prev => ({ ...prev, ...best }));
    setChecklistLoading(false);
  };

  const handleChecklistName = (name: string) => {
    setStudentName(name);
    localStorage.setItem(STUDENT_NAME_KEY, name);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader size={28} className="animate-spin text-indigo-400" />
      </div>
    );
  }

  if (!wl) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">단어장을 찾을 수 없습니다.</p>
        <Link to="/wordlists" className="text-indigo-600 hover:underline text-sm mt-2 inline-block">← 단어장 목록으로</Link>
      </div>
    );
  }

  const updateWords = (words: Word[]) => setWl(prev => prev ? { ...prev, words } : prev);

  const handleSaveWord = async (word: Word) => {
    const saved = await upsertWord(wl.id, word);
    const existing = wl.words.find(w => w.id === saved.id);
    updateWords(existing
      ? wl.words.map(w => w.id === saved.id ? saved : w)
      : [...wl.words, saved]
    );
    setShowEditor(false);
    setEditingWord(undefined);
  };

  const handleDeleteWord = async (wordId: string) => {
    if (!confirm('이 단어를 삭제하시겠습니까?')) return;
    await deleteWord(wordId);
    updateWords(wl.words.filter(w => w.id !== wordId));
  };

  const importWords = async (text: string): Promise<number> => {
    const parsed = parseWords(text);
    const newWords: Word[] = parsed.map(p => ({
      id: generateId(),
      english: p.english ?? '',
      korean: p.korean ?? '',
      definition: '',
      synonyms: p.synonyms ?? [],
      antonyms: p.antonyms ?? [],
      example: p.example ?? '',
      difficulty: 'medium',
      correctCount: 0,
      incorrectCount: 0,
    }));
    const saved = await Promise.all(newWords.map(w => upsertWord(wl.id, w)));
    updateWords([...wl.words, ...saved]);
    return saved.length;
  };

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => importWords(ev.target?.result as string);
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleBulkPaste = async () => {
    if (!bulkText.trim()) return;
    const count = await importWords(bulkText);
    setBulkText(''); setShowBulkPaste(false);
    alert(`${count}개 단어가 추가되었습니다.`);
  };

  const startStudy = (review = false) => {
    const words = review
      ? wl.words.filter(w => w.incorrectCount > 0 || getMasteryLevel(w) < 2)
      : wl.words;
    setStudyWords(shuffle(words));
    setStudyIdx(0);
    setReviewMode(review);
    setTab('study');
  };

  const printWordList = () => {
    const html = `
      <html><head><title>${wl.title}</title>
      <style>body{font-family:sans-serif;padding:20px} table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ddd;padding:8px;text-align:left} th{background:#f5f5f5}
      h1{font-size:20px}</style></head>
      <body><h1>${wl.title}</h1>
      ${wl.description ? `<p style="color:#666;margin-bottom:16px">${wl.description}</p>` : ''}
      <table><thead><tr><th>#</th><th>영어</th><th>뜻</th><th>동의어</th><th>반의어</th><th>예문</th></tr></thead>
      <tbody>${wl.words.map((w, i) => `
        <tr><td>${i + 1}</td><td><strong>${w.english}</strong></td><td>${w.korean}</td>
        <td>${w.synonyms.join(', ')}</td><td>${w.antonyms.join(', ')}</td><td>${w.example}</td></tr>
      `).join('')}</tbody></table></body></html>
    `;
    const win = window.open('', '_blank');
    win?.document.write(html);
    win?.document.close();
    win?.print();
  };

  const tabs = [
    { id: 'words' as Tab, label: '단어 목록' },
    { id: 'study' as Tab, label: '플래시카드' },
    { id: 'synonyms' as Tab, label: '동의어/반의어' },
    { id: 'checklist' as Tab, label: '주간 과제' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/wordlists" className="text-slate-400 hover:text-slate-600">
            <ChevronLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{wl.title}</h1>
            {wl.description && <p className="text-sm text-slate-400">{wl.description}</p>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => startStudy(false)} disabled={wl.words.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40">
            <Play size={14} /> 학습 시작
          </button>
          <button onClick={() => startStudy(true)} disabled={wl.words.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 disabled:opacity-40">
            <RotateCcw size={14} /> 복습
          </button>
          <Link to={`/test/${wl.id}`}
            className={`flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 ${wl.words.length === 0 ? 'pointer-events-none opacity-40' : ''}`}>
            <FileText size={14} /> 테스트
          </Link>
          {isTeacher && (
            <button onClick={printWordList} disabled={wl.words.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-40">
              <Printer size={14} /> 인쇄
            </button>
          )}
        </div>
      </div>

      <div className="flex border-b border-slate-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Words tab */}
      {tab === 'words' && (
        <div className="space-y-3">
          {isTeacher && (
            <>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => { setShowEditor(true); setEditingWord(undefined); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                  <Plus size={14} /> 단어 추가
                </button>
                <button onClick={() => setShowBulkPaste(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-indigo-300 text-indigo-600 rounded-lg text-sm hover:bg-indigo-50">
                  <Upload size={14} /> 텍스트로 입력
                </button>
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
                  <Upload size={14} /> 파일 가져오기
                </button>
                <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSV} />
              </div>

              {showBulkPaste && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-indigo-700 mb-1">단어 목록 붙여넣기</p>
                    <p className="text-xs text-slate-500">한 줄에 단어 하나씩 — 쉼표, 탭, 스페이스 구분 모두 OK</p>
                    <p className="text-xs text-slate-400 mt-0.5">예) <span className="font-mono">abundant 풍부한</span> &nbsp;또는&nbsp; <span className="font-mono">abundant,풍부한,plentiful,scarce</span></p>
                  </div>
                  <textarea
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono h-40 resize-y"
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                    placeholder={"abundant 풍부한\naccelerate 가속하다\naccomplish 성취하다"}
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setShowBulkPaste(false); setBulkText(''); }}
                      className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">취소</button>
                    <button onClick={handleBulkPaste} disabled={!bulkText.trim()}
                      className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">
                      추가하기
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {showEditor && isTeacher && (
            <WordEditor
              word={editingWord}
              onSave={handleSaveWord}
              onCancel={() => { setShowEditor(false); setEditingWord(undefined); }}
            />
          )}

          {wl.words.length === 0 && !showEditor && (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <BookOpen size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-400 text-sm">
                {isTeacher ? '단어가 없습니다. 위 버튼으로 추가하세요.' : '아직 단어가 없습니다.'}
              </p>
            </div>
          )}

          <div className="space-y-2">
            {wl.words.map((word, i) => {
              const mastery = getMasteryLevel(word);
              return (
                <div key={word.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-start gap-4 shadow-sm">
                  <span className="text-slate-300 text-sm font-mono w-6 flex-shrink-0 mt-1">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-indigo-700">{word.english}</span>
                      <span className="text-slate-400 text-sm">{word.korean}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getMasteryColor(mastery)}`}>
                        {getMasteryLabel(mastery)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        word.difficulty === 'easy' ? 'bg-green-50 text-green-600'
                        : word.difficulty === 'hard' ? 'bg-red-50 text-red-600'
                        : 'bg-yellow-50 text-yellow-600'
                      }`}>
                        {word.difficulty === 'easy' ? '쉬움' : word.difficulty === 'hard' ? '어려움' : '보통'}
                      </span>
                    </div>
                    {(word.synonyms.length > 0 || word.antonyms.length > 0) && (
                      <div className="flex gap-3 mt-1 flex-wrap">
                        {word.synonyms.length > 0 && <span className="text-xs text-blue-600">↔ {word.synonyms.join(', ')}</span>}
                        {word.antonyms.length > 0 && <span className="text-xs text-rose-600">⟷ {word.antonyms.join(', ')}</span>}
                      </div>
                    )}
                    {word.example && <p className="text-xs text-slate-400 italic mt-0.5">"{word.example}"</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => speak(word.english)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                      <Volume2 size={14} />
                    </button>
                    {isTeacher && (
                      <>
                        <button onClick={() => { setEditingWord(word); setShowEditor(true); }} className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDeleteWord(word.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Study (flashcard) tab */}
      {tab === 'study' && (
        <div className="space-y-4">
          {studyWords.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-slate-500">학습할 단어를 선택하세요</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => startStudy(false)} disabled={wl.words.length === 0}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-2">
                  <Play size={14} /> 전체 학습 ({wl.words.length}개)
                </button>
                <button onClick={() => startStudy(true)}
                  disabled={wl.words.filter(w => getMasteryLevel(w) < 2).length === 0}
                  className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 disabled:opacity-40 flex items-center gap-2">
                  <RotateCcw size={14} /> 복습 모드
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  {reviewMode ? '🔄 복습 모드' : '📖 전체 학습'} — {studyIdx + 1} / {studyWords.length}
                </p>
                <button onClick={() => setStudyWords(s => shuffle([...s]))} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                  <RotateCcw size={12} /> 섞기
                </button>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mb-4">
                <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${((studyIdx + 1) / studyWords.length) * 100}%` }} />
              </div>
              <FlashCard word={studyWords[studyIdx]} />
              <div className="flex items-center justify-center gap-4 mt-4">
                <button onClick={() => setStudyIdx(i => Math.max(0, i - 1))} disabled={studyIdx === 0}
                  className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-30 text-sm">
                  <ChevronLeft size={16} /> 이전
                </button>
                <span className="text-sm text-slate-500">{studyIdx + 1} / {studyWords.length}</span>
                <button onClick={() => setStudyIdx(i => Math.min(studyWords.length - 1, i + 1))} disabled={studyIdx === studyWords.length - 1}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-30 text-sm">
                  다음 <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Synonyms/Antonyms tab */}
      {tab === 'synonyms' && (
        <div className="space-y-3">
          {wl.words.filter(w => w.synonyms.length > 0 || w.antonyms.length > 0).length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">동의어/반의어가 입력된 단어가 없습니다</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {wl.words.filter(w => w.synonyms.length > 0 || w.antonyms.length > 0).map(word => (
                <div key={word.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-bold text-indigo-700 text-lg">{word.english}</span>
                    <span className="text-slate-400 text-sm">{word.korean}</span>
                    <button onClick={() => speak(word.english)} className="p-1 rounded hover:bg-slate-100 text-slate-400 ml-auto" type="button">
                      <Volume2 size={14} />
                    </button>
                  </div>
                  {word.synonyms.length > 0 && (
                    <div className="mb-2">
                      <span className="text-xs font-semibold text-blue-600 mb-1 block">동의어</span>
                      <div className="flex flex-wrap gap-1.5">
                        {word.synonyms.map((s, i) => <span key={i} className="bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full font-medium">{s}</span>)}
                      </div>
                    </div>
                  )}
                  {word.antonyms.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-rose-600 mb-1 block">반의어</span>
                      <div className="flex flex-wrap gap-1.5">
                        {word.antonyms.map((s, i) => <span key={i} className="bg-rose-50 text-rose-700 text-xs px-2.5 py-1 rounded-full font-medium">{s}</span>)}
                      </div>
                    </div>
                  )}
                  {word.example && <p className="text-xs text-slate-400 italic mt-2 border-t border-slate-100 pt-2">"{word.example}"</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 주간 과제 체크리스트 tab */}
      {tab === 'checklist' && (
        <div className="space-y-5 max-w-lg">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-indigo-700 mb-1">주간 과제 체크리스트</p>
            <p className="text-xs text-slate-500">4가지 시험 모두 80% 이상 통과해야 합니다</p>
          </div>

          <div className="flex gap-2">
            <input
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={studentName}
              onChange={e => handleChecklistName(e.target.value)}
              placeholder="이름 입력"
            />
            <button
              onClick={() => loadChecklist(studentName)}
              disabled={!studentName.trim() || checklistLoading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40"
            >
              {checklistLoading ? <Loader size={14} className="animate-spin" /> : '조회'}
            </button>
          </div>

          <div className="space-y-2">
            {WEEKLY_REQUIRED.map(({ type, label }) => {
              const score = weeklyResults[type];
              const passed = score !== null && score >= 80;
              const attempted = score !== null;
              return (
                <div key={type} className={`flex items-center gap-4 p-4 rounded-xl border ${
                  passed ? 'border-green-200 bg-green-50'
                  : attempted ? 'border-red-200 bg-red-50'
                  : 'border-slate-200 bg-white'
                }`}>
                  <div className="flex-shrink-0">
                    {passed ? <CheckCircle size={22} className="text-green-500" />
                    : attempted ? <XCircle size={22} className="text-red-400" />
                    : <Clock size={22} className="text-slate-300" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700">{label}</p>
                    {attempted && (
                      <p className={`text-xs font-semibold mt-0.5 ${passed ? 'text-green-600' : 'text-red-500'}`}>
                        {score}% {passed ? '✓ 통과' : '✗ 미통과 (재시험 필요)'}
                      </p>
                    )}
                    {!attempted && <p className="text-xs text-slate-400 mt-0.5">미응시</p>}
                  </div>
                  <Link
                    to={`/test/${wl.id}`}
                    state={{ testType: type, studentName }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 whitespace-nowrap"
                  >
                    {attempted && !passed ? '재시험' : attempted ? '다시보기' : '시험 보기'}
                  </Link>
                </div>
              );
            })}
          </div>

          {Object.values(weeklyResults).slice(0, 4).every(s => s !== null && s >= 80) && (
            <div className="text-center py-4 bg-green-100 rounded-xl border border-green-300">
              <p className="text-green-700 font-bold text-lg">🎉 이번 주 과제 완료!</p>
              <p className="text-green-600 text-sm mt-1">4가지 시험 모두 통과했습니다</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
