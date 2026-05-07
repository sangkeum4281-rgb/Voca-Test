import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { WordList, TestType, TestAnswer, Word } from '../types';
import { fetchWordList, saveTestResult, incrementWordCount } from '../lib/db';
import { shuffle, speak } from '../utils';
import { ChevronLeft, CheckCircle, XCircle, ArrowRight, RotateCcw, Loader, Volume2 } from 'lucide-react';

type Phase = 'setup' | 'testing' | 'done';

interface Question {
  word: Word;
  type: TestType;
  prompt: string;
  options?: string[];
  correctAnswer: string;
}

export const TEST_TYPE_LABELS: Record<TestType, string> = {
  'multiple-choice-en': '객관식 (영어 → 뜻)',
  'multiple-choice-kr': '객관식 (뜻 → 영어)',
  'fill-blank': '단답형 (뜻 보고 영어 쓰기)',
  'spelling': '철자 받아쓰기',
  'synonym-match': '동의어 찾기',
  'antonym-match': '반의어 찾기',
  'definition': '영영풀이',
};

const WEEKLY_REQUIRED: TestType[] = ['multiple-choice-en', 'multiple-choice-kr', 'fill-blank', 'spelling'];

export { WEEKLY_REQUIRED };

const STUDENT_NAME_KEY = 'vocab-student-name';

export default function Test() {
  const { id } = useParams<{ id: string }>();
  const [wl, setWl] = useState<WordList | null>(null);
  const [loading, setLoading] = useState(true);

  const [phase, setPhase] = useState<Phase>('setup');
  const [studentName, setStudentName] = useState(() => localStorage.getItem(STUDENT_NAME_KEY) ?? '');
  const [testType, setTestType] = useState<TestType>('multiple-choice-en');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<TestAnswer[]>([]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchWordList(id).then(data => { setWl(data); setLoading(false); });
  }, [id]);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader size={28} className="animate-spin text-indigo-400" /></div>;
  }
  if (!wl) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">단어장을 찾을 수 없습니다.</p>
        <Link to="/wordlists" className="text-indigo-600 hover:underline text-sm mt-2 inline-block">← 단어장 목록으로</Link>
      </div>
    );
  }

  const availableTypes = (Object.keys(TEST_TYPE_LABELS) as TestType[]).filter(t => {
    if (t === 'synonym-match') return wl.words.some(w => w.synonyms.length > 0);
    if (t === 'antonym-match') return wl.words.some(w => w.antonyms.length > 0);
    if (t === 'definition') return wl.words.some(w => w.definition);
    return true;
  });

  const buildQuestions = (): Question[] => {
    const allEnglish = wl.words.map(w => w.english);
    const allKorean = wl.words.map(w => w.korean);

    let pool = shuffle(wl.words);

    if (testType === 'synonym-match') pool = pool.filter(w => w.synonyms.length > 0);
    if (testType === 'antonym-match') pool = pool.filter(w => w.antonyms.length > 0);
    if (testType === 'definition') pool = pool.filter(w => w.definition);

    // 전체 단어 출제

    return pool.map(word => {
      if (testType === 'multiple-choice-en') {
        const wrong = shuffle(allKorean.filter(k => k !== word.korean)).slice(0, 3);
        return { word, type: testType, prompt: word.english, options: shuffle([word.korean, ...wrong]), correctAnswer: word.korean };
      }
      if (testType === 'multiple-choice-kr') {
        const wrong = shuffle(allEnglish.filter(e => e !== word.english)).slice(0, 3);
        return { word, type: testType, prompt: word.korean, options: shuffle([word.english, ...wrong]), correctAnswer: word.english };
      }
      if (testType === 'synonym-match') {
        const correct = word.synonyms[Math.floor(Math.random() * word.synonyms.length)];
        const allSyns = wl.words.flatMap(w => w.synonyms).filter(s => !word.synonyms.includes(s));
        const wrong = shuffle([...allSyns, ...allEnglish.filter(e => !word.synonyms.includes(e) && e !== word.english)]).slice(0, 3);
        return { word, type: testType, prompt: word.english, options: shuffle([correct, ...wrong]), correctAnswer: correct };
      }
      if (testType === 'antonym-match') {
        const correct = word.antonyms[Math.floor(Math.random() * word.antonyms.length)];
        const allAnts = wl.words.flatMap(w => w.antonyms).filter(a => !word.antonyms.includes(a));
        const wrong = shuffle([...allAnts, ...allEnglish.filter(e => !word.antonyms.includes(e) && e !== word.english)]).slice(0, 3);
        return { word, type: testType, prompt: word.english, options: shuffle([correct, ...wrong]), correctAnswer: correct };
      }
      if (testType === 'definition') {
        const wrong = shuffle(allEnglish.filter(e => e !== word.english)).slice(0, 3);
        return { word, type: testType, prompt: word.definition, options: shuffle([word.english, ...wrong]), correctAnswer: word.english };
      }
      // fill-blank / spelling
      return { word, type: testType, prompt: word.korean, correctAnswer: word.english.toLowerCase() };
    });
  };

  const startTest = () => {
    if (!studentName.trim()) return;
    localStorage.setItem(STUDENT_NAME_KEY, studentName.trim());
    const isMultipleType = ['multiple-choice-en', 'multiple-choice-kr', 'synonym-match', 'antonym-match', 'definition'].includes(testType);
    const pool = testType === 'synonym-match' ? wl.words.filter(w => w.synonyms.length > 0)
      : testType === 'antonym-match' ? wl.words.filter(w => w.antonyms.length > 0)
      : testType === 'definition' ? wl.words.filter(w => w.definition)
      : wl.words;
    if (pool.length < 4 && isMultipleType) {
      alert('이 시험 유형은 최소 4개 이상의 해당 단어가 필요합니다.');
      return;
    }
    setQuestions(buildQuestions());
    setCurrentIdx(0); setAnswers([]); setSubmitted(false);
    setUserInput(''); setSelected(null); setPhase('testing');
  };

  const submitAnswer = async () => {
    const q = questions[currentIdx];
    const ans = selected ?? userInput.trim().toLowerCase();
    const correct = ans === q.correctAnswer.toLowerCase();

    const newAnswer: TestAnswer = {
      wordId: q.word.id,
      english: q.word.english,
      korean: q.word.korean,
      userAnswer: selected ?? userInput.trim(),
      correct,
    };

    await incrementWordCount(q.word.id, correct);
    const newAnswers = [...answers, newAnswer];
    setAnswers(newAnswers);
    setSubmitted(true);

    setTimeout(async () => {
      if (currentIdx + 1 >= questions.length) {
        const score = newAnswers.filter(a => a.correct).length;
        await saveTestResult({
          wordListId: wl.id,
          wordListTitle: wl.title,
          studentName: studentName.trim(),
          testType,
          score,
          total: newAnswers.length,
          answers: newAnswers,
          completedAt: new Date().toISOString(),
        });
        setPhase('done');
      } else {
        setCurrentIdx(i => i + 1);
        setUserInput(''); setSelected(null); setSubmitted(false);
      }
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !submitted) submitAnswer();
  };

  const currentQ = questions[currentIdx];
  const score = answers.filter(a => a.correct).length;

  // ── Setup ──
  if (phase === 'setup') {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-2">
          <Link to={`/wordlists/${wl.id}`} className="text-slate-400 hover:text-slate-600"><ChevronLeft size={20} /></Link>
          <h1 className="text-xl font-bold text-slate-800">테스트 설정</h1>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-0.5">{wl.title}</p>
            <p className="text-xs text-slate-400">{wl.words.length}개 단어</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1.5">이름</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={studentName}
              onChange={e => setStudentName(e.target.value)}
              placeholder="이름을 입력하세요"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1.5">시험 유형</label>
            <div className="space-y-2">
              {availableTypes.map(t => (
                <label key={t} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  testType === t ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
                }`}>
                  <input type="radio" name="testType" value={t} checked={testType === t}
                    onChange={() => setTestType(t)} className="text-indigo-600" />
                  <span className="text-sm text-slate-700">{TEST_TYPE_LABELS[t]}</span>
                  {!WEEKLY_REQUIRED.includes(t) && (
                    <span className="ml-auto text-xs bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full">추가</span>
                  )}
                </label>
              ))}
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm text-slate-600">
            총 <span className="font-bold text-indigo-600">{wl.words.length}개</span> 단어 전체 출제
          </div>
          <button onClick={startTest} disabled={!studentName.trim()}
            className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            테스트 시작
          </button>
        </div>
      </div>
    );
  }

  // ── Done ──
  if (phase === 'done') {
    const finalScore = answers.filter(a => a.correct).length;
    const finalPct = Math.round((finalScore / answers.length) * 100);
    const passed = finalPct >= 80;
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <h1 className="text-xl font-bold text-slate-800">테스트 완료</h1>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="text-center mb-6">
            <p className="text-slate-500 text-sm mb-1">{studentName}님의 점수</p>
            <p className={`text-5xl font-bold mb-1 ${passed ? 'text-green-600' : 'text-red-600'}`}>{finalPct}%</p>
            <p className="text-slate-400 text-sm">{finalScore} / {answers.length} 정답</p>
            <p className={`text-sm font-semibold mt-2 ${passed ? 'text-green-600' : 'text-red-500'}`}>
              {passed ? '✓ 통과 (80% 이상)' : '✗ 미통과 (80% 미만)'}
            </p>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {answers.map((a, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-lg text-sm ${a.correct ? 'bg-green-50' : 'bg-red-50'}`}>
                {a.correct ? <CheckCircle size={18} className="text-green-500 flex-shrink-0" /> : <XCircle size={18} className="text-red-500 flex-shrink-0" />}
                <div className="flex-1">
                  <span className="font-semibold text-slate-700">{a.english}</span>
                  <span className="text-slate-400 mx-2">→</span>
                  <span className="text-slate-600">{a.korean}</span>
                </div>
                {!a.correct && <span className="text-xs text-red-500">입력: {a.userAnswer}</span>}
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setPhase('setup')}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
              <RotateCcw size={14} /> 다시 테스트
            </button>
            <Link to={`/wordlists/${wl.id}?tab=checklist`}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
              주간 체크리스트 <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Testing ──
  const isMultiple = ['multiple-choice-en', 'multiple-choice-kr', 'synonym-match', 'antonym-match', 'definition'].includes(currentQ.type);
  const isText = currentQ.type === 'fill-blank' || currentQ.type === 'spelling';

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 font-medium">{studentName}님 · {TEST_TYPE_LABELS[testType]}</p>
        <p className="text-sm text-indigo-600 font-semibold">{currentIdx + 1} / {questions.length}</p>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="text-center py-4">
          {currentQ.type === 'multiple-choice-en' && (
            <>
              <p className="text-xs text-slate-400 mb-2">다음 단어의 뜻을 고르세요</p>
              <div className="flex items-center justify-center gap-2">
                <p className="text-4xl font-bold text-indigo-700">{currentQ.word.english}</p>
                <button onClick={() => speak(currentQ.word.english)} className="p-1.5 text-indigo-300 hover:text-indigo-500">
                  <Volume2 size={20} />
                </button>
              </div>
              {currentQ.word.example && <p className="text-sm text-slate-400 italic mt-2">"{currentQ.word.example}"</p>}
            </>
          )}
          {currentQ.type === 'multiple-choice-kr' && (
            <>
              <p className="text-xs text-slate-400 mb-2">다음 뜻의 영어 단어를 고르세요</p>
              <p className="text-3xl font-bold text-slate-800">{currentQ.word.korean}</p>
            </>
          )}
          {currentQ.type === 'synonym-match' && (
            <>
              <p className="text-xs text-slate-400 mb-2">다음 단어의 동의어를 고르세요</p>
              <div className="flex items-center justify-center gap-2">
                <p className="text-4xl font-bold text-indigo-700">{currentQ.word.english}</p>
                <button onClick={() => speak(currentQ.word.english)} className="p-1.5 text-indigo-300 hover:text-indigo-500">
                  <Volume2 size={20} />
                </button>
              </div>
              <p className="text-sm text-slate-400 mt-1">{currentQ.word.korean}</p>
            </>
          )}
          {currentQ.type === 'antonym-match' && (
            <>
              <p className="text-xs text-slate-400 mb-2">다음 단어의 반의어를 고르세요</p>
              <div className="flex items-center justify-center gap-2">
                <p className="text-4xl font-bold text-indigo-700">{currentQ.word.english}</p>
                <button onClick={() => speak(currentQ.word.english)} className="p-1.5 text-indigo-300 hover:text-indigo-500">
                  <Volume2 size={20} />
                </button>
              </div>
              <p className="text-sm text-slate-400 mt-1">{currentQ.word.korean}</p>
            </>
          )}
          {currentQ.type === 'definition' && (
            <>
              <p className="text-xs text-slate-400 mb-2">다음 영영풀이에 해당하는 단어를 고르세요</p>
              <p className="text-xl font-medium text-slate-700 italic">"{currentQ.word.definition}"</p>
            </>
          )}
          {currentQ.type === 'fill-blank' && (
            <>
              <p className="text-xs text-slate-400 mb-2">다음 뜻에 해당하는 영어 단어를 쓰세요</p>
              <p className="text-3xl font-bold text-slate-800">{currentQ.word.korean}</p>
              {currentQ.word.synonyms.length > 0 && <p className="text-xs text-blue-500 mt-2">동의어: {currentQ.word.synonyms.join(', ')}</p>}
            </>
          )}
          {currentQ.type === 'spelling' && (
            <>
              <p className="text-xs text-slate-400 mb-2">다음 뜻에 해당하는 영어 단어의 철자를 쓰세요</p>
              <p className="text-3xl font-bold text-slate-800">{currentQ.word.korean}</p>
              {currentQ.word.example && (
                <p className="text-sm text-slate-400 italic mt-2">힌트: {currentQ.word.example.replace(new RegExp(currentQ.word.english, 'gi'), '___')}</p>
              )}
            </>
          )}
        </div>

        {isMultiple && currentQ.options && (
          <div className="grid grid-cols-2 gap-2">
            {currentQ.options.map((opt, i) => {
              let cls = 'border border-slate-200 rounded-lg px-4 py-3 text-sm text-left hover:bg-slate-50 transition-colors cursor-pointer';
              if (submitted) {
                if (opt === currentQ.correctAnswer) cls += ' border-green-400 bg-green-50 text-green-700 font-semibold';
                else if (opt === selected) cls += ' border-red-400 bg-red-50 text-red-700';
              } else if (selected === opt) {
                cls = 'border-2 border-indigo-400 bg-indigo-50 rounded-lg px-4 py-3 text-sm text-left font-semibold text-indigo-700';
              }
              return (
                <button key={i} onClick={() => !submitted && setSelected(opt)} className={cls} disabled={submitted}>
                  <span className="text-slate-400 mr-2 text-xs">{String.fromCharCode(65 + i)}.</span>
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {isText && (
          <div>
            <input
              className={`w-full border-2 rounded-lg px-4 py-3 text-sm focus:outline-none transition-colors ${
                submitted
                  ? answers[answers.length - 1]?.correct ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'
                  : 'border-slate-300 focus:border-indigo-400'
              }`}
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="영어 단어 입력..."
              disabled={submitted}
              autoFocus
            />
            {submitted && !answers[answers.length - 1]?.correct && (
              <p className="text-sm text-green-600 mt-1.5 font-medium">정답: {currentQ.word.english}</p>
            )}
          </div>
        )}

        <button
          onClick={submitAnswer}
          disabled={submitted || (!selected && !userInput.trim())}
          className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
        >
          {submitted
            ? currentIdx + 1 < questions.length ? <>다음 문제 <ArrowRight size={16} /></> : '결과 확인'
            : '제출'}
        </button>
      </div>

      <div className="flex justify-between text-xs text-slate-400 px-1">
        <span>✅ {score}개 정답</span>
        <span>❌ {answers.length - score}개 오답</span>
      </div>
    </div>
  );
}
