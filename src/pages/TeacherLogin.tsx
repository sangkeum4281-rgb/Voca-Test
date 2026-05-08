import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn } from 'lucide-react';

const DOMAIN = '@choegang.kr';

export default function TeacherLogin() {
  const { signIn, isTeacher } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isTeacher) {
    navigate('/');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const email = username.trim() + DOMAIN;
    const err = await signIn(email, password);
    if (err) {
      setError('아이디 또는 비밀번호가 올바르지 않습니다.');
    } else {
      navigate('/');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-sm mx-auto mt-16">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <LogIn size={22} className="text-indigo-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">선생님 로그인</h1>
          <p className="text-sm text-slate-400 mt-1">선생님 전용 관리 화면</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="아이디"
            required
            autoFocus
            autoComplete="username"
          />
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="비밀번호"
            required
            autoComplete="current-password"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
