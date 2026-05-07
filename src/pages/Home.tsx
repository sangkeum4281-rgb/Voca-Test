import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchWordLists, fetchAnnouncements, fetchQna, fetchAttendanceByDate, fetchStudents, type Announcement, type QnaItem } from '../lib/db';
import type { WordList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, Pin, MessageCircle, CheckCircle, Clock, XCircle, ArrowRight, Loader, Users } from 'lucide-react';

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

export default function Home() {
  const { isTeacher } = useAuth();
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [qna, setQna] = useState<QnaItem[]>([]);
  const [todayStats, setTodayStats] = useState({ present: 0, late: 0, absent: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = toDateStr(new Date());
    Promise.all([
      fetchWordLists(),
      fetchAnnouncements(),
      fetchQna(),
      isTeacher ? fetchAttendanceByDate(today) : Promise.resolve([]),
      isTeacher ? fetchStudents() : Promise.resolve([]),
    ]).then(([wl, ann, q, att, stu]) => {
      setWordLists(wl);
      setAnnouncements(ann.slice(0, 3));
      setQna(q);
      if (isTeacher) {
        const attArr = att as Awaited<ReturnType<typeof fetchAttendanceByDate>>;
        const stuArr = stu as Awaited<ReturnType<typeof fetchStudents>>;
        setTodayStats({
          present: attArr.filter(r => r.status === 'present').length,
          late: attArr.filter(r => r.status === 'late').length,
          absent: attArr.filter(r => r.status === 'absent').length,
          total: stuArr.length,
        });
      }
      setLoading(false);
    });
  }, [isTeacher]);

  if (loading) return <div className="flex justify-center py-24"><Loader size={28} className="animate-spin text-indigo-400" /></div>;

  const unansweredQna = qna.filter(q => !q.answeredAt).length;
  const pinned = announcements.filter(a => a.pinned);
  const recent = announcements.filter(a => !a.pinned);

  return (
    <div className="space-y-5">
      {/* 선생님 오늘 현황 */}
      {isTeacher && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/attendance" className="bg-green-50 border border-green-200 rounded-xl p-4 text-center hover:bg-green-100 transition-colors">
            <CheckCircle size={20} className="mx-auto text-green-600 mb-1" />
            <p className="text-2xl font-bold text-green-600">{todayStats.present}</p>
            <p className="text-xs text-green-600">오늘 출석</p>
          </Link>
          <Link to="/attendance" className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center hover:bg-yellow-100 transition-colors">
            <Clock size={20} className="mx-auto text-yellow-600 mb-1" />
            <p className="text-2xl font-bold text-yellow-600">{todayStats.late}</p>
            <p className="text-xs text-yellow-600">오늘 지각</p>
          </Link>
          <Link to="/attendance" className="bg-red-50 border border-red-200 rounded-xl p-4 text-center hover:bg-red-100 transition-colors">
            <XCircle size={20} className="mx-auto text-red-500 mb-1" />
            <p className="text-2xl font-bold text-red-500">{todayStats.absent}</p>
            <p className="text-xs text-red-500">오늘 결석</p>
          </Link>
          <Link to="/students" className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center hover:bg-indigo-100 transition-colors">
            <Users size={20} className="mx-auto text-indigo-600 mb-1" />
            <p className="text-2xl font-bold text-indigo-600">{todayStats.total}</p>
            <p className="text-xs text-indigo-600">전체 원생</p>
          </Link>
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
