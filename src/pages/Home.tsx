import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchWordLists, fetchAnnouncements, fetchQna,
  fetchAttendanceByDate, fetchStudents,
  getAutoAbsentSms, sendAligoBulkSms, autoMarkAbsent,
  fetchAllClassNotices, addClassNotice,
  fetchParentMessages, markParentMessageRead, deleteParentMessage,
  NOTICE_SUBJECTS, sortClasses,
  type Announcement, type QnaItem, type AttendanceRecord, type Student, type ClassNotice, type ParentMessage,
} from '../lib/db';
import type { WordList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, Pin, MessageCircle, CheckCircle, Clock, XCircle, ArrowRight, Loader, Users, Send, Bell, MessageSquare, Trash2 } from 'lucide-react';

function isWeekend() { const d = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay(); return d === 0 || d === 6; }

export default function Home() {
  const { isTeacher } = useAuth();
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [qna, setQna] = useState<QnaItem[]>([]);
  const [todayAtt, setTodayAtt] = useState<AttendanceRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [noticeText, setNoticeText] = useState('');
  const [noticeSending, setNoticeSending] = useState(false);

  // 알림장
  const [notices, setNotices] = useState<ClassNotice[]>([]);
  const [noticeClasses, setNoticeClasses] = useState<Set<string>>(new Set());
  const [noticeContents, setNoticeContents] = useState<Record<string, string>>({});
  const [noticeSavingHome, setNoticeSavingHome] = useState(false);

  // 학부모 메시지
  const [parentMsgs, setParentMsgs] = useState<ParentMessage[]>([]);


  const fetchAll = () => {
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    Promise.all([
      fetchWordLists(),
      fetchAnnouncements(),
      fetchQna(),
      fetchAttendanceByDate(today),
      fetchStudents(),
      fetchAllClassNotices(),
      fetchParentMessages(),
    ]).then(([wl, ann, q, att, stu, nts, msgs]) => {
      setWordLists(wl);
      setAnnouncements(ann.slice(0, 3));
      setQna(q);
      setTodayAtt(att);
      setStudents(stu as Student[]);
      setNotices(nts as ClassNotice[]);
      setParentMsgs(msgs as ParentMessage[]);
      sortClasses([...new Set((stu as Student[]).map(s => s.className).filter(Boolean))]);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchAll();
    const onVisible = () => { if (document.visibilityState === 'visible') fetchAll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // 자동 결석 처리 + 문자 (페이지 로드 시 + 1분마다)
  useEffect(() => {
    if (!isTeacher) return;
    const run = async () => {
      const enabled = await getAutoAbsentSms();
      await autoMarkAbsent(enabled);
      if (enabled) fetchAll(); // 결석 처리 후 화면 갱신
    };
    run();
    const interval = setInterval(run, 60_000);
    return () => clearInterval(interval);
  }, [isTeacher]);

  if (loading) return <div className="flex justify-center py-24"><Loader size={28} className="animate-spin text-indigo-400" /></div>;

  const unansweredQna = qna.filter(q => !q.answeredAt).length;
  const pinned = announcements.filter(a => a.pinned);
  const recent = announcements.filter(a => !a.pinned);

  const present = todayAtt.filter(r => r.status === 'present').length;
  const late    = todayAtt.filter(r => r.status === 'late').length;
  const absent  = todayAtt.filter(r => r.status === 'absent').length;

  const handleSendNotice = async () => {
    if (!noticeText.trim()) return;
    if (isWeekend()) { alert('주말에는 문자를 발송할 수 없습니다.'); return; }
    if (!confirm(`전체 학부모에게 문자를 발송하시겠습니까?\n\n${noticeText}`)) return;
    setNoticeSending(true);
    const { sent, failed } = await sendAligoBulkSms(`[최강학원] ${noticeText}`);
    setNoticeSending(false);
    setNoticeText('');
    alert(`발송 완료: ${sent}명 성공${failed > 0 ? `, ${failed}명 실패` : ''}`);
  };

  // 반별 결석·지각자 그룹
  const classes = sortClasses([...new Set(students.map(s => s.className).filter(Boolean))]);
  const absentByClass = classes.map(cls => {
    const classStudents = students.filter(s => s.className === cls);
    const absentNames = classStudents
      .filter(s => todayAtt.find(a => a.studentName === s.name && a.status === 'absent'))
      .map(s => s.name);
    const lateNames = classStudents
      .filter(s => todayAtt.find(a => a.studentName === s.name && a.status === 'late'))
      .map(s => s.name);
    return { cls, absentNames, lateNames };
  }).filter(g => g.absentNames.length > 0 || g.lateNames.length > 0);

  return (
    <div className="space-y-5">
      {/* 선생님 출결 요약 카드 */}
      {isTeacher && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/attendance" className="bg-green-50 border border-green-200 rounded-xl p-4 text-center hover:bg-green-100 transition-colors">
            <CheckCircle size={20} className="mx-auto text-green-600 mb-1" />
            <p className="text-2xl font-bold text-green-600">{present}</p>
            <p className="text-xs text-green-600">오늘 출석</p>
          </Link>
          <Link to="/attendance" className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center hover:bg-yellow-100 transition-colors">
            <Clock size={20} className="mx-auto text-yellow-600 mb-1" />
            <p className="text-2xl font-bold text-yellow-600">{late}</p>
            <p className="text-xs text-yellow-600">오늘 지각</p>
          </Link>
          <Link to="/attendance" className="bg-red-50 border border-red-200 rounded-xl p-4 text-center hover:bg-red-100 transition-colors">
            <XCircle size={20} className="mx-auto text-red-500 mb-1" />
            <p className="text-2xl font-bold text-red-500">{absent}</p>
            <p className="text-xs text-red-500">오늘 결석</p>
          </Link>
          <Link to="/students" className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center hover:bg-indigo-100 transition-colors">
            <Users size={20} className="mx-auto text-indigo-600 mb-1" />
            <p className="text-2xl font-bold text-indigo-600">{students.length}</p>
            <p className="text-xs text-indigo-600">전체 원생</p>
          </Link>
        </div>
      )}

      {/* 당일 결석/지각 현황 — 전체 공개 */}
      {absentByClass.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-red-100">
            <XCircle size={16} className="text-red-500" />
            <h2 className="font-semibold text-slate-700">오늘 결석·지각 현황</h2>
            <span className="text-xs text-slate-400 ml-1">
              {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {absentByClass.map(({ cls, absentNames, lateNames }) => (
              <div key={cls} className="px-5 py-3">
                <p className="text-xs font-semibold text-slate-500 mb-2">{cls}</p>
                <div className="flex flex-wrap gap-2">
                  {absentNames.map(name => (
                    <div key={name} className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                      <XCircle size={11} className="text-red-500" />
                      <span className="text-xs font-medium text-red-600">{name}</span>
                    </div>
                  ))}
                  {lateNames.map(name => (
                    <div key={name} className="inline-flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 px-2.5 py-1 rounded-full">
                      <Clock size={11} className="text-yellow-500" />
                      <span className="text-xs font-medium text-yellow-600">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 알림장 */}
      {isTeacher && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
            <Bell size={16} className="text-amber-500" />
            <h2 className="font-semibold text-slate-700">알림장</h2>
            <span className="text-xs text-slate-400 ml-auto">
              {new Date(Date.now() + 9 * 60 * 60 * 1000).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' })}
            </span>
          </div>
          <div className="px-5 py-4 space-y-3">
            {/* 반 선택 (다중) */}
            <div className="flex flex-wrap gap-1.5">
              {classes.map(c => {
                const on = noticeClasses.has(c);
                return (
                  <button key={c} type="button" onClick={() => setNoticeClasses(prev => {
                    const next = new Set(prev); on ? next.delete(c) : next.add(c); return next;
                  })} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}>
                    {on && '✓ '}{c}
                  </button>
                );
              })}
            </div>
            {/* 과목별 입력 */}
            <div className="space-y-1.5">
              {([
                ['국어/역사', 'text-blue-700 bg-blue-50 border-blue-200', 'focus:ring-blue-300 border-blue-200'],
                ['수학',      'text-green-700 bg-green-50 border-green-200', 'focus:ring-green-300 border-green-200'],
                ['영어',      'text-violet-700 bg-violet-50 border-violet-200', 'focus:ring-violet-300 border-violet-200'],
                ['과학/사회', 'text-orange-700 bg-orange-50 border-orange-200', 'focus:ring-orange-300 border-orange-200'],
              ] as const).map(([s, badge, ring]) => (
                <div key={s} className="flex gap-2 items-center">
                  <span className={`w-[72px] shrink-0 text-xs font-bold border px-1.5 py-1.5 rounded-lg text-center leading-tight ${badge}`}>{s}</span>
                  <input
                    type="text"
                    value={noticeContents[s] ?? ''}
                    onChange={e => setNoticeContents(prev => ({ ...prev, [s]: e.target.value }))}
                    placeholder="숙제·시험 안내"
                    className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-white ${ring}`}
                  />
                </div>
              ))}
            </div>
            <button
              disabled={noticeClasses.size === 0 || NOTICE_SUBJECTS.every(s => !noticeContents[s]?.trim()) || noticeSavingHome}
              onClick={async () => {
                const entries = NOTICE_SUBJECTS.filter(s => noticeContents[s]?.trim());
                const selectedClasses = [...noticeClasses];
                if (selectedClasses.length === 0 || entries.length === 0) return;
                setNoticeSavingHome(true);
                try {
                  await Promise.all(selectedClasses.flatMap(cls => entries.map(s => addClassNotice(cls, noticeContents[s].trim(), s))));
                  setNoticeContents({});
                  setNotices(await fetchAllClassNotices());
                } catch { alert('등록에 실패했습니다.'); }
                finally { setNoticeSavingHome(false); }
              }}
              className="w-full py-2 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              {noticeSavingHome ? <Loader size={14} className="animate-spin" /> : <Bell size={14} />}
              {noticeSavingHome ? '등록중...' : '알림 등록'}
            </button>
            {/* 최근 알림 3개 */}
            {notices.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-slate-100">
                {notices.slice(0, 3).map(n => (
                  <div key={n.id} className="flex items-start gap-2 py-1.5">
                    <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full shrink-0">{n.className}</span>
                    {n.subject && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${{
                        '국어/역사': 'text-blue-700 bg-blue-100',
                        '수학': 'text-green-700 bg-green-100',
                        '영어': 'text-violet-700 bg-violet-100',
                        '과학/사회': 'text-orange-700 bg-orange-100',
                      }[n.subject] ?? 'text-amber-700 bg-amber-100'}`}>{n.subject}</span>}
                    <p className="text-xs text-slate-600 truncate flex-1">{n.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 학부모 한마디 */}
      {isTeacher && parentMsgs.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
            <MessageSquare size={16} className="text-indigo-500" />
            <h2 className="font-semibold text-slate-700">학부모 전달사항</h2>
            {parentMsgs.filter(m => !m.isRead).length > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                {parentMsgs.filter(m => !m.isRead).length}
              </span>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {parentMsgs.map(msg => (
              <div key={msg.id} className={`px-5 py-3 flex gap-3 items-start ${msg.isRead ? 'opacity-60' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-indigo-600">{msg.studentName}</span>
                    {msg.className && <span className="text-xs text-slate-400">{msg.className}</span>}
                    <span className="text-xs text-slate-300 ml-auto">
                      {new Date(msg.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.message}</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!msg.isRead && (
                    <button onClick={async () => {
                      await markParentMessageRead(msg.id);
                      setParentMsgs(prev => prev.map(m => m.id === msg.id ? { ...m, isRead: true } : m));
                    }} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap">
                      확인
                    </button>
                  )}
                  <button onClick={async () => {
                    await deleteParentMessage(msg.id);
                    setParentMsgs(prev => prev.filter(m => m.id !== msg.id));
                  }} className="text-slate-300 hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 공지 문자 발송 */}
      {isTeacher && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
            <Send size={16} className="text-indigo-500" />
            <h2 className="font-semibold text-slate-700">전체 학부모 문자 발송</h2>
          </div>
          <div className="px-5 py-4 flex gap-3">
            <textarea
              value={noticeText}
              onChange={e => setNoticeText(e.target.value)}
              placeholder="내용을 입력하세요. 앞에 [최강학원]이 자동으로 붙습니다."
              rows={3}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button onClick={handleSendNotice} disabled={noticeSending || !noticeText.trim()}
              className="flex-shrink-0 flex flex-col items-center justify-center gap-1 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              {noticeSending ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
              <span className="text-xs">{noticeSending ? '발송중' : '전송'}</span>
            </button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {/* 공지사항 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-700">공지사항</h2>
            <Link to="/announcements" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
              전체보기 <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {announcements.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">공지사항이 없습니다</p>
            ) : (
              [...pinned, ...recent].map(a => (
                <Link key={a.id} to="/announcements" className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                  {a.pinned && <Pin size={13} className="text-indigo-400 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium text-slate-700 truncate ${a.pinned ? '' : 'ml-4'}`}>{a.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{a.content}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* 단어장 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-700">단어장</h2>
            <Link to="/wordlists" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
              전체보기 <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {wordLists.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">단어장이 없습니다</p>
            ) : (
              wordLists.slice(0, 4).map(wl => (
                <Link key={wl.id} to={`/wordlists/${wl.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2">
                    <BookOpen size={15} className="text-indigo-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">{wl.title}</p>
                      <p className="text-xs text-slate-400">{wl.words.length}개 단어</p>
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-slate-300" />
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Q&A */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm md:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-slate-700">Q&A</h2>
              {isTeacher && unansweredQna > 0 && (
                <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">{unansweredQna}</span>
              )}
            </div>
            <Link to="/qna" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
              전체보기 <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {qna.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-2">
                <MessageCircle size={28} className="text-slate-300" />
                <p className="text-slate-400 text-sm">아직 질문이 없습니다</p>
                {!isTeacher && (
                  <Link to="/qna" className="text-xs text-indigo-600 hover:underline">질문하러 가기</Link>
                )}
              </div>
            ) : (
              qna.slice(0, 4).map(item => (
                <Link key={item.id} to="/qna" className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-indigo-600">{item.studentName}</span>
                      {item.answeredAt
                        ? <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">답변완료</span>
                        : <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">미답변</span>}
                    </div>
                    <p className="text-sm text-slate-600 truncate mt-0.5">{item.question}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
