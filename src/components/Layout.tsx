import { Link, useLocation } from 'react-router-dom';
import { BookOpen, LayoutDashboard, ClipboardList, History, LogIn, LogOut, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const publicNav = [
  { path: '/', label: '대시보드', icon: LayoutDashboard },
  { path: '/wordlists', label: '단어장', icon: BookOpen },
  { path: '/results', label: '결과 기록', icon: History },
];
const teacherNav = [
  { path: '/students', label: '학생 관리', icon: Users },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { isTeacher, signOut } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-indigo-700 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight hover:opacity-90">
            <ClipboardList size={24} />
            최강학원
          </Link>
          <div className="flex items-center gap-1">
            <nav className="flex gap-1">
              {[...publicNav, ...(isTeacher ? teacherNav : [])].map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    pathname === path
                      ? 'bg-white text-indigo-700'
                      : 'text-indigo-100 hover:bg-indigo-600'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              ))}
            </nav>
            <div className="ml-3 pl-3 border-l border-indigo-500">
              {isTeacher ? (
                <button
                  onClick={signOut}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-indigo-200 hover:bg-indigo-600 transition-colors"
                >
                  <LogOut size={15} /> 로그아웃
                </button>
              ) : (
                <Link
                  to="/teacher"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-indigo-200 hover:bg-indigo-600 transition-colors"
                >
                  <LogIn size={15} /> 선생님
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {children}
      </main>
      <footer className="text-center py-4 text-sm text-slate-400 border-t border-slate-200">
        최강학원 — 고등부 영단어 학습 플랫폼
      </footer>
    </div>
  );
}
