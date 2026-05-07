import { useState } from 'react';
import type { Word } from '../types';
import { generateId } from '../utils';
import { Plus, X, Save, Sparkles, Loader } from 'lucide-react';

interface Props {
  word?: Word;
  onSave: (word: Word) => void;
  onCancel: () => void;
}

const emptyWord = (): Word => ({
  id: generateId(),
  english: '',
  korean: '',
  definition: '',
  synonyms: [],
  antonyms: [],
  example: '',
  difficulty: 'medium',
  correctCount: 0,
  incorrectCount: 0,
});

export default function WordEditor({ word, onSave, onCancel }: Props) {
  const [form, setForm] = useState<Word>(word ?? emptyWord());
  const [synInput, setSynInput] = useState('');
  const [antInput, setAntInput] = useState('');
  const [autoLoading, setAutoLoading] = useState(false);

  const fetchWordData = async () => {
    const eng = form.english.trim();
    if (!eng) return;
    setAutoLoading(true);
    try {
      const [synRes, antRes, defRes] = await Promise.all([
        fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(eng)}&max=5`),
        fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(eng)}&max=5`),
        fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(eng)}&md=d&max=1`),
      ]);
      const syns: { word: string }[] = await synRes.json();
      const ants: { word: string }[] = await antRes.json();
      const defs: { word: string; defs?: string[] }[] = await defRes.json();
      const definition = defs[0]?.defs?.[0]?.replace(/^\w+\t/, '') ?? '';
      setForm(f => ({
        ...f,
        synonyms: syns.map(w => w.word),
        antonyms: ants.map(w => w.word),
        definition: definition || f.definition,
      }));
    } catch {
      // 네트워크 오류 무시
    } finally {
      setAutoLoading(false);
    }
  };

  const addTag = (field: 'synonyms' | 'antonyms', input: string, setInput: (v: string) => void) => {
    const val = input.trim();
    if (!val) return;
    setForm(f => ({ ...f, [field]: [...f[field], val] }));
    setInput('');
  };

  const removeTag = (field: 'synonyms' | 'antonyms', idx: number) => {
    setForm(f => ({ ...f, [field]: f[field].filter((_, i) => i !== idx) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.english.trim() || !form.korean.trim()) return;
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">영어 단어 *</label>
          <div className="flex gap-1.5">
            <input
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={form.english}
              onChange={e => setForm(f => ({ ...f, english: e.target.value }))}
              placeholder="e.g. abundant"
              required
            />
            <button
              type="button"
              onClick={fetchWordData}
              disabled={autoLoading || !form.english.trim()}
              title="동의어/반의어/영영풀이 자동완성"
              className="flex items-center gap-1 px-3 py-2 bg-violet-100 text-violet-700 rounded-lg text-xs font-medium hover:bg-violet-200 disabled:opacity-40 whitespace-nowrap"
            >
              {autoLoading ? <Loader size={13} className="animate-spin" /> : <Sparkles size={13} />}
              자동완성
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">한국어 뜻 *</label>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.korean}
            onChange={e => setForm(f => ({ ...f, korean: e.target.value }))}
            placeholder="e.g. 풍부한"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">영영풀이 (definition)</label>
        <input
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={form.definition}
          onChange={e => setForm(f => ({ ...f, definition: e.target.value }))}
          placeholder="e.g. existing in large quantities"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TagInput
          label="동의어"
          tags={form.synonyms}
          input={synInput}
          setInput={setSynInput}
          onAdd={() => addTag('synonyms', synInput, setSynInput)}
          onRemove={idx => removeTag('synonyms', idx)}
          color="blue"
          placeholder="e.g. plentiful"
        />
        <TagInput
          label="반의어"
          tags={form.antonyms}
          input={antInput}
          setInput={setAntInput}
          onAdd={() => addTag('antonyms', antInput, setAntInput)}
          onRemove={idx => removeTag('antonyms', idx)}
          color="rose"
          placeholder="e.g. scarce"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">예문</label>
        <input
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={form.example}
          onChange={e => setForm(f => ({ ...f, example: e.target.value }))}
          placeholder="e.g. The forest was abundant with wildlife."
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 flex items-center gap-1.5">
          <X size={14} /> 취소
        </button>
        <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1.5">
          <Save size={14} /> 저장
        </button>
      </div>
    </form>
  );
}

function TagInput({
  label, tags, input, setInput, onAdd, onRemove, color, placeholder,
}: {
  label: string;
  tags: string[];
  input: string;
  setInput: (v: string) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  color: 'blue' | 'rose';
  placeholder: string;
}) {
  const tagClass = color === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700';
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <div className="flex gap-1 mb-1.5 flex-wrap min-h-[28px]">
        {tags.map((t, i) => (
          <span key={i} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${tagClass}`}>
            {t}
            <button type="button" onClick={() => onRemove(i)}><X size={11} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
          placeholder={placeholder}
        />
        <button type="button" onClick={onAdd} className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg">
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
