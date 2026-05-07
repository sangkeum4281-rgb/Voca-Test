import { useState } from 'react';
import type { Word } from '../types';
import { getMasteryColor, getMasteryLabel, getMasteryLevel, speak } from '../utils';
import { Volume2, RotateCcw } from 'lucide-react';

interface Props {
  word: Word;
  direction?: 'en-kr' | 'kr-en';
}

export default function FlashCard({ word, direction = 'en-kr' }: Props) {
  const [flipped, setFlipped] = useState(false);
  const mastery = getMasteryLevel(word);

  // direction이 바뀌면 카드 초기화
  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation();
    speak(word.english);
  };

  const isEnKr = direction === 'en-kr';

  return (
    <div className="flashcard-container w-full h-40 md:h-48 cursor-pointer" onClick={() => setFlipped(f => !f)}>
      <div className={`flashcard-inner ${flipped ? 'flipped' : ''}`}>
        {/* Front */}
        <div className="flashcard-front rounded-xl bg-white border-2 border-indigo-200 shadow-md flex flex-col items-center justify-center p-5 select-none">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${getMasteryColor(mastery)}`}>
            {getMasteryLabel(mastery)}
          </span>
          {isEnKr ? (
            <p className="text-3xl md:text-4xl font-bold text-indigo-700">{word.english}</p>
          ) : (
            <p className="text-2xl md:text-3xl font-bold text-slate-800">{word.korean}</p>
          )}
          <div className="absolute top-3 right-3 flex gap-1">
            {isEnKr && (
              <button onClick={handleSpeak} className="p-1.5 rounded-full hover:bg-indigo-50 text-indigo-400">
                <Volume2 size={16} />
              </button>
            )}
          </div>
          <p className="absolute bottom-2 text-xs text-slate-300">탭하여 뒤집기</p>
        </div>

        {/* Back */}
        <div className="flashcard-back rounded-xl bg-indigo-700 text-white shadow-md flex flex-col items-center justify-center p-5 select-none">
          {isEnKr ? (
            <>
              <p className="text-2xl md:text-3xl font-bold mb-2">{word.korean}</p>
              {word.example && (
                <p className="text-xs text-indigo-200 italic text-center mb-2 line-clamp-2">"{word.example}"</p>
              )}
              <div className="flex flex-wrap gap-1.5 justify-center">
                {word.synonyms.length > 0 && (
                  <div className="bg-blue-500/40 rounded-lg px-2.5 py-1 text-xs">
                    <span className="font-semibold">동의어: </span>{word.synonyms.slice(0, 3).join(', ')}
                  </div>
                )}
                {word.antonyms.length > 0 && (
                  <div className="bg-rose-500/40 rounded-lg px-2.5 py-1 text-xs">
                    <span className="font-semibold">반의어: </span>{word.antonyms.slice(0, 3).join(', ')}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-3xl md:text-4xl font-bold">{word.english}</p>
                <button onClick={handleSpeak} className="p-1.5 rounded-full hover:bg-white/20 text-white/70">
                  <Volume2 size={16} />
                </button>
              </div>
              {word.example && (
                <p className="text-xs text-indigo-200 italic text-center line-clamp-2">"{word.example}"</p>
              )}
            </>
          )}
          <button onClick={e => { e.stopPropagation(); setFlipped(false); }} className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/20 text-white/70">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
