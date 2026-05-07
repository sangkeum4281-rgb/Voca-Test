import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { WordList } from '../types';
import { fetchWordLists, createWordList, updateWordList, deleteWordList } from '../lib/db';
import { getMasteryLevel } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { Plus, BookOpen, Pencil, Trash2, ChevronRight, Loader } from 'lucide-react';

export default function WordLists() {
  const { isTeacher } = useAuth();
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchWordLists().then(data => { setWordLists(data); setLoading(false); });
  }, []);

  const handleCreate = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    const newList = await createWordList({ title: title.trim(), description: description.trim() });
    setWordLists(prev => [newList, ...prev]);
    setTitle(''); setDescription(''); setCreating(false);
    setSaving(false);
  };

  const handleUpdate = async () => {
    if (!title.trim() || !editingId || saving) return;
    setSaving(true);
    await updateWordList(editingId, { title: title.trim(), description: description.trim() });
    setWordLists(prev => prev.map(wl =>
      wl.id === editingId ? { ...wl, title: title.trim(), description: description.trim() } : wl
    ));
    setTitle(''); setDescription(''); setEditingId(null); setCreating(false);
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('단어장을 삭제하시겠습니까? 모든 단어가 함께 삭제됩니다.')) return;
    await deleteWordList(id);
    setWordLists(prev => prev.filter(wl => wl.id !== id));
  };

  const startEdit = (wl: WordList) => {
    setTitle(wl.title); setDescription(wl.description);
    setEditingId(wl.id); setCreating(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader size={28} className="animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">단어장</h1>
          <p className="text-slate-500 text-sm mt-0.5">{wordLists.length}개의 단어장</p>
        </div>
        {isTeacher && (
          <button
            onClick={() => { setCreating(true); setEditingId(null); setTitle(''); setDescription(''); }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            <Plus size={16} /> 새 단어장
          </button>
        )}
      </div>

      {creating && isTeacher && (
        <div className="bg-white border border-indigo-200 rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-slate-700">{editingId ? '단어장 수정' : '새 단어장 만들기'}</h2>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="단어장 제목 (예: 수능 필수 어휘 1)"
            autoFocus
          />
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="설명 (선택사항)"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setCreating(false); setEditingId(null); }} className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
              취소
            </button>
            <button onClick={editingId ? handleUpdate : handleCreate} disabled={saving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? '저장 중...' : editingId ? '수정 완료' : '만들기'}
            </button>
          </div>
        </div>
      )}

      {wordLists.length === 0 && !creating && (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <BookOpen size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">단어장이 없습니다</p>
          {isTeacher && <p className="text-slate-400 text-sm mb-4">새 단어장을 만들어 단어를 추가해보세요</p>}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {wordLists.map(wl => {
          const mastered = wl.words.filter(w => getMasteryLevel(w) === 3).length;
          const pct = wl.words.length ? Math.round((mastered / wl.words.length) * 100) : 0;
          return (
            <div key={wl.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-colors">
              <Link to={`/wordlists/${wl.id}`} className="block p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <BookOpen size={18} className="text-indigo-500 flex-shrink-0 mt-0.5" />
                    <h3 className="font-semibold text-slate-800">{wl.title}</h3>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
                </div>
                {wl.description && <p className="text-xs text-slate-400 ml-6 mb-2">{wl.description}</p>}
                <div className="ml-6">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>{wl.words.length}개 단어</span>
                    <span className="text-green-600 font-medium">{mastered}/{wl.words.length} 습득 ({pct}%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
              {isTeacher && (
                <div className="border-t border-slate-100 px-5 py-2 flex justify-end gap-2">
                  <button onClick={() => startEdit(wl)} className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-50">
                    <Pencil size={13} /> 수정
                  </button>
                  <button onClick={() => handleDelete(wl.id)} className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50">
                    <Trash2 size={13} /> 삭제
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
