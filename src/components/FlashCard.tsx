import { useState } from 'react';
import type { Word } from '../types';
import { getMasteryColor, getMasteryLabel, getMasteryLevel, speak } from '../utils';
import { Volume2, RotateCcw } from 'lucide-react';

interface Props {
  word: Word;
  showKorean?: boolean;
}

export default function FlashCard({ word, showKorean = false }: Props) {
  const [flipped, setFlipped] = useState(showKorean);
  const mastery = getMasteryLevel(word);

  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation();
    speak(word.english);
  };

  return (
    <div className="flashcard-container w-full h-56 md:h-64 cursor-pointer" onClick={() => setFlipped(f => !f)}>
      <div className={`flashcard-inner ${flipped ? 'flipped' : ''}`}>
        {/* Front */}
        <div className="flashcard-front rounded-2xl bg-white border-2 border-indigo-200 shadow-md flex flex-col items-center justify-center p-8 select-none">
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full mb-4 ${getMasteryColor(mastery)}`}>
            {getMasteryLabel(mastery)}
          </span>
          <p className="text-4xl font-bold text-indigo-700 mb-2">{word.english}</p>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            word.difficulty === 'easy' ? 'bg-green-100 text-green-600'
            : word.difficulty === 'hard' ? 'bg-red-100 text-red-600'
            : 'bg-yellow-100 text-yellow-600'
          }`}>
            {word.difficulty === 'easy' ? '쉬움' : word.difficulty === 'hard' ? '어려움' : '보통'}
          </span>
          <div className="absolute top-4 right-4 flex gap-2">
            <button onClick={handleSpeak} className="p-1.5 rounded-full hover:bg-indigo-50 text-indigo-400">
              <Volume2 size={18} />
            </button>
          </div>
          <p className="absolute bottom-4 text-xs text-slate-400">클릭하여 뒤집기</p>
        </div>

        {/* Back */}
        <div className="flashcard-back rounded-2xl bg-indigo-700 text-white shadow-md flex flex-col items-center justify-center p-8 select-none">
          <p className="text-3xl font-bold mb-3">{word.korean}</p>
          {word.example && (
            <p className="text-sm text-indigo-200 italic text-center mb-3">"{word.example}"</p>
          )}
          <div className="flex flex-wrap gap-2 justify-center">
            {word.synonyms.length > 0 && (
              <div className="bg-blue-500/40 rounded-lg px-3 py-1.5 text-xs">
                <span className="font-semibold">동의어: </span>{word.synonyms.join(', ')}
              </div>
            )}
            {word.antonyms.length > 0 && (
              <div className="bg-rose-500/40 rounded-lg px-3 py-1.5 text-xs">
                <span className="font-semibold">반의어: </span>{word.antonyms.join(', ')}
              </div>
            )}
          </div>
          <button onClick={e => { e.stopPropagation(); setFlipped(false); }} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/20 text-white/70">
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
