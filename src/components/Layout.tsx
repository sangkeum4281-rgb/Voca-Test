import { Link, useLocation } from 'react-router-dom';
import { BookOpen, LayoutDashboard, History, LogIn, LogOut, Users, CalendarCheck, Megaphone, MessageCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const publicNav = [
  { path: '/', label: '홈', icon: LayoutDashboard },
  { path: '/wordlists', label: '단어장', icon: BookOpen },
  { path: '/attendance', label: '출결', icon: CalendarCheck },
  { path: '/announcements', label: '공지', icon: Megaphone },
  { path: '/qna', label: 'Q&A', icon: MessageCircle },
];
const teacherExtra = [
  { path: '/students', label: '학생', icon: Users },
  { path: '/results', label: '결과', icon: History },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { isTeacher, signOut } = useAuth();
  const bottomNav = publicNav;
  const desktopNav = [...publicNav, ...(isTeacher ? teacherExtra : [])];

  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-indigo-700 text-white shadow-lg sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-bold tracking-tight hover:opacity-90">
            최강학원
          </Link>

          {/* 데스크탑 nav */}
          <div className="hidden md:flex items-center gap-1">
            <nav className="flex gap-1">
              {desktopNav.map(({ path, label, icon: Icon }) => (
                <Link key={path} to={path}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive(path) ? 'bg-white text-indigo-700' : 'text-indigo-100 hover:bg-indigo-600'
                  }`}>
                  <Icon size={15} />{label}
                </Link>
              ))}
            </nav>
            <div className="ml-3 pl-3 border-l border-indigo-500">
              {isTeacher ? (
                <button onClick={signOut} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-indigo-200 hover:bg-indigo-600 transition-colors">
                  <LogOut size={15} /> 로그아웃
                </button>
              ) : (
                <Link to="/teacher" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-indigo-200 hover:bg-indigo-600 transition-colors">
                  <LogIn size={15} /> 선생님
                </Link>
              )}
            </div>
          </div>

          {/* 모바일 우측 */}
          <div className="md:hidden flex items-center gap-1">
            {isTeacher && (
              <Link to="/students" className={`p-2 rounded-md ${isActive('/students') ? 'bg-white text-indigo-700' : 'text-indigo-200 hover:bg-indigo-600'}`}>
                <Users size={18} />
              </Link>
            )}
            {isTeacher ? (
              <button onClick={signOut} className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-indigo-200 hover:bg-indigo-600">
                <LogOut size={14} />
              </button>
            ) : (
              <Link to="/teacher" className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-indigo-200 hover:bg-indigo-600">
                <LogIn size={14} /> 선생님
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-5 pb-24 md:pb-6">
        {children}
      </main>

      {/* 모바일 하단 탭바 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 flex">
        {bottomNav.map(({ path, label, icon: Icon }) => {
          const active = isActive(path);
          return (
            <Link key={path} to={path}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 text-xs font-medium transition-colors ${
                active ? 'text-indigo-600' : 'text-slate-400'
              }`}>
              <Icon size={21} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      <footer className="hidden md:block text-center py-4 text-sm text-slate-400 border-t border-slate-200">
        최강학원
      </footer>
    </div>
  );
}
