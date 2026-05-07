import { useEffect, useState } from 'react';
import {
  fetchAnnouncements, saveAnnouncement, updateAnnouncement, deleteAnnouncement,
  type Announcement,
} from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Pencil, Trash2, Pin, Loader, X, Save } from 'lucide-react';

export default function Announcements() {
  const { isTeacher } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAnnouncements().then(data => { setItems(data); setLoading(false); });
  }, []);

  const openNew = () => {
    setEditTarget(null);
    setTitle(''); setContent(''); setPinned(false);
    setShowForm(true);
  };

  const openEdit = (item: Announcement) => {
    setEditTarget(item);
    setTitle(item.title); setContent(item.content); setPinned(item.pinned);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    if (editTarget) {
      await updateAnnouncement(editTarget.id, { title: title.trim(), content: content.trim(), pinned });
      setItems(prev => prev.map(i => i.id === editTarget.id ? { ...i, title: title.trim(), content: content.trim(), pinned } : i)
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)));
    } else {
      const n = await saveAnnouncement({ title: title.trim(), content: content.trim(), pinned });
      setItems(prev => [n, ...prev].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)));
    }
    setShowForm(false);
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('공지를 삭제하시겠습니까?')) return;
    await deleteAnnouncement(id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  if (loading) return <div className="flex justify-center py-24"><Loader size={28} className="animate-spin text-indigo-400" /></div>;

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">공지사항</h1>
        {isTeacher && (
          <button onClick={openNew}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus size={15} /> 공지 작성
          </button>
        )}
      </div>

      {/* 작성/수정 폼 */}
      {showForm && isTeacher && (
        <div className="bg-white border border-indigo-200 rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-slate-700">{editTarget ? '공지 수정' : '새 공지 작성'}</h2>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="제목"
            autoFocus
          />
          <textarea
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 min-h-[120px] resize-y"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="내용을 입력하세요..."
          />
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="accent-indigo-600" />
            상단 고정
          </label>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5">
              <X size={14} /> 취소
            </button>
            <button onClick={handleSave} disabled={!title.trim() || !content.trim() || saving}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-1.5">
              <Save size={14} /> {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-400 text-sm">공지사항이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${item.pinned ? 'border-indigo-300' : 'border-slate-200'}`}>
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {item.pinned && <Pin size={14} className="text-indigo-500 flex-shrink-0" />}
                    <h3 className="font-semibold text-slate-800 truncate">{item.title}</h3>
                  </div>
                  {isTeacher && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(item)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{item.content}</p>
                <p className="text-xs text-slate-400 mt-3">{new Date(item.createdAt).toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' })}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
