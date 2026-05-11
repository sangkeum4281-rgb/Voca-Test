import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchWordLists, fetchAnnouncements, fetchQna,
  fetchAttendanceByDate, fetchStudents, sendAttendanceSms,
  type Announcement, type QnaItem, type AttendanceRecord, type Student,
} from '../lib/db';
import type { WordList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, Pin, MessageCircle, CheckCircle, Clock, XCircle, ArrowRight, Loader, Users, Send } from 'lucide-react';

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

export default function Home() {
  const { isTeacher } = useAuth();
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [qna, setQna] = useState<QnaItem[]>([]);
  const [todayAtt, setTodayAtt] = useState<AttendanceRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingMap, setSendingMap] = useState<Record<string, boolean>>({});
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const today = toDateStr(new Date());
    Promise.all([
      fetchWordLists(),
      fetchAnnouncements(),
      fetchQna(),
      fetchAttendanceByDate(today),
      fetchStudents(),
    ]).then(([wl, ann, q, att, stu]) => {
      setWordLists(wl);
      setAnnouncements(ann.slice(0, 3));
      setQna(q);
      setTodayAtt(att);
      setStudents(stu);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex justify-center py-24"><Loader size={28} className="animate-spin text-indigo-400" /></div>;

  const unansweredQna = qna.filter(q => !q.answeredAt).length;
  const pinned = announcements.filter(a => a.pinned);
  const recent = announcements.filter(a => !a.pinned);

  const present = todayAtt.filter(r => r.status === 'present').length;
  const late    = todayAtt.filter(r => r.status === 'late').length;
  const absent  = todayAtt.filter(r => r.status === 'absent').length;

  const today = toDateStr(new Date());

  const handleSendSms = async (studentName: string, status: 'absent' | 'late') => {
    const key = `${studentName}-${status}`;
    setSendingMap(p => ({ ...p, [key]: true }));
    await sendAttendanceSms(studentName, status, today);
    setSendingMap(p => ({ ...p, [key]: false }));
    setSentMap(p => ({ ...p, [key]: true }));
  };

  // 반별 결석·지각자 그룹
  const classes = [...new Set(students.map(s => s.className).filter(Boolean))].sort();
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
            <span className="text-xs text-slate-400 ml-auto">
              {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {absentByClass.map(({ cls, absentNames, lateNames }) => (
              <div key={cls} className="px-5 py-3">
                <p className="text-xs font-semibold text-slate-500 mb-2">{cls}</p>
                <div className="flex flex-wrap gap-2">
                  {absentNames.map(name => {
                    const key = `${name}-absent`;
                    const sending = sendingMap[key];
                    const sent = sentMap[key];
                    const hasPhone = students.find(s => s.name === name)?.parentPhone;
                    return (
                      <div key={name} className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                        <XCircle size={11} className="text-red-500" />
                        <span className="text-xs font-medium text-red-600">{name}</span>
                        {isTeacher && hasPhone && (
                          <button onClick={() => handleSendSms(name, 'absent')} disabled={sending || sent}
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full transition-colors ${sent ? 'bg-green-100 text-green-600' : 'bg-red-200 text-red-700 hover:bg-red-300'}`}>
                            {sending ? '…' : sent ? '발송됨' : <Send size={9} />}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {lateNames.map(name => {
                    const key = `${name}-late`;
                    const sending = sendingMap[key];
                    const sent = sentMap[key];
                    const hasPhone = students.find(s => s.name === name)?.parentPhone;
                    return (
                      <div key={name} className="inline-flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 px-2.5 py-1 rounded-full">
                        <Clock size={11} className="text-yellow-500" />
                        <span className="text-xs font-medium text-yellow-600">{name}</span>
                        {isTeacher && hasPhone && (
                          <button onClick={() => handleSendSms(name, 'late')} disabled={sending || sent}
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full transition-colors ${sent ? 'bg-green-100 text-green-600' : 'bg-yellow-200 text-yellow-700 hover:bg-yellow-300'}`}>
                            {sending ? '…' : sent ? '발송됨' : <Send size={9} />}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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
