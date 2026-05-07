import { useEffect, useState } from 'react';
import { fetchQna, postQuestion, answerQuestion, deleteQna, type QnaItem } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { Send, Trash2, Loader, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react';

const STUDENT_NAME_KEY = 'vocab-student-name';

export default function QnA() {
  const { isTeacher } = useAuth();
  const [items, setItems] = useState<QnaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const [myName, setMyName] = useState(() => localStorage.getItem(STUDENT_NAME_KEY) ?? '');
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchQna().then(data => { setItems(data); setLoading(false); });
  }, []);

  const handlePost = async () => {
    if (!myName.trim() || !question.trim() || sending) return;
    localStorage.setItem(STUDENT_NAME_KEY, myName.trim());
    setSending(true);
    await postQuestion(myName.trim(), question.trim());
    const refreshed = await fetchQna();
    setItems(refreshed);
    setQuestion('');
    setSending(false);
  };

  const handleAnswer = async (id: string) => {
    const ans = answerInputs[id]?.trim();
    if (!ans) return;
    setSavingId(id);
    await answerQuestion(id, ans);
    setItems(prev => prev.map(i => i.id === id ? { ...i, answer: ans, answeredAt: new Date().toISOString() } : i));
    setSavingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await deleteQna(id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const myItems = isTeacher ? items : items.filter(i => i.studentName === myName.trim());
  const unanswered = items.filter(i => !i.answeredAt);

  if (loading) return <div className="flex justify-center py-24"><Loader size={28} className="animate-spin text-indigo-400" /></div>;

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Q&A</h1>
        {isTeacher && unanswered.length > 0 && (
          <span className="bg-red-100 text-red-600 text-xs font-bold px-3 py-1 rounded-full">
            미답변 {unanswered.length}건
          </span>
        )}
      </div>

      {/* 질문 작성 (학생) */}
      {!isTeacher && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
          <p className="text-sm font-semibold text-slate-700">질문하기</p>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={myName}
            onChange={e => setMyName(e.target.value)}
            placeholder="이름"
          />
          <textarea
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 min-h-[80px] resize-none"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="궁금한 점을 입력하세요..."
          />
          <button onClick={handlePost} disabled={!myName.trim() || !question.trim() || sending}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-2">
            <Send size={14} /> {sending ? '전송 중...' : '질문 보내기'}
          </button>
        </div>
      )}

      {/* Q&A 목록 */}
      {(isTeacher ? items : myItems).length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <MessageCircle size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 text-sm">{isTeacher ? '아직 질문이 없습니다' : '내 질문이 없습니다'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(isTeacher ? items : myItems).map(item => {
            const isOpen = expanded === item.id;
            const answered = !!item.answeredAt;
            return (
              <div key={item.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${!answered && isTeacher ? 'border-orange-200' : 'border-slate-200'}`}>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpanded(isOpen ? null : item.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-indigo-600">{item.studentName}</span>
                      {answered
                        ? <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">답변완료</span>
                        : <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">미답변</span>}
                      <span className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleDateString('ko-KR')}</span>
                    </div>
                    <p className="text-sm text-slate-700 mt-0.5 truncate">{item.question}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {isTeacher && (
                      <button onClick={e => { e.stopPropagation(); handleDelete(item.id); }}
                        className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    )}
                    {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-4 space-y-3">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.question}</p>

                    {answered && (
                      <div className="bg-indigo-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-indigo-600 mb-1">선생님 답변</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.answer}</p>
                      </div>
                    )}

                    {isTeacher && (
                      <div className="space-y-2">
                        <textarea
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 min-h-[80px] resize-none"
                          value={answerInputs[item.id] ?? item.answer}
                          onChange={e => setAnswerInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="답변을 입력하세요..."
                        />
                        <button onClick={() => handleAnswer(item.id)} disabled={savingId === item.id}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-1.5">
                          <Send size={13} /> {savingId === item.id ? '저장 중...' : answered ? '수정' : '답변 등록'}
                        </button>
                      </div>
                    )}
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
