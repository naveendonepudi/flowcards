
import React, { useEffect, useRef } from 'react';
import { AnkiCard } from '../types';
import * as dbService from '../services/db';

interface CardDisplayProps {
  card: AnkiCard;
  isFlipped: boolean;
  onFlip: () => void;
}

export const CardDisplay: React.FC<CardDisplayProps> = ({ card, isFlipped, onFlip }) => {
  // Logic for Cloze Deletions
  const processClozeForQuestion = (html: string) => {
    return html.replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '<span class="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-lg mx-1 font-black shadow-sm">[...]</span>');
  };

  const processClozeForAnswer = (html: string) => {
    return html.replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '<b class="text-indigo-600 ring-2 ring-indigo-50 px-1 rounded-md">$1</b>');
  };

  const isCloze = card.front.includes('{{c');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const createdObjectUrls = useRef<string[]>([]);

  // Replace flowcards-media:// tokens with object URLs fetched from the media store
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const user = localStorage.getItem('flowcards_session') || '';
    const imgs = el.querySelectorAll('img');
    imgs.forEach(async (img) => {
      const src = img.getAttribute('src') || '';
      if (src.startsWith('flowcards-media://')) {
        const encoded = src.replace('flowcards-media://', '');
        const filename = decodeURIComponent(encoded);
        try {
          const blob = await dbService.getMedia(user, filename);
          if (blob) {
            const url = URL.createObjectURL(blob);
            createdObjectUrls.current.push(url);
            img.setAttribute('src', url);
          }
        } catch (e) {
          console.warn('Failed to resolve media blob', e);
        }
      }
    });

    return () => {
      // Revoke object URLs created for this mount
      createdObjectUrls.current.forEach(u => URL.revokeObjectURL(u));
      createdObjectUrls.current = [];
    };
  }, [card.front, card.back]);

  return (
    <div 
      onClick={onFlip}
      className="perspective-container w-full h-[65vh] md:h-[75vh] min-h-[450px] cursor-pointer group select-none relative"
    >
      <div className={`card-inner relative w-full h-full transition-transform duration-700 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] transform-style-3d ${isFlipped ? 'flipped' : ''}`}>
        
        {/* Front Side */}
        <div className="absolute inset-0 backface-hidden bg-white rounded-[40px] shadow-card border border-slate-100 flex flex-col overflow-hidden">
          <div className="w-full flex justify-center py-8 flex-shrink-0 bg-white/50 backdrop-blur-sm z-10">
            <span className="px-5 py-2 bg-indigo-50 text-indigo-600 text-[11px] font-black uppercase tracking-[0.3em] rounded-full shadow-sm">
              Question
            </span>
          </div>
          
          <div className="flex-1 w-full overflow-y-auto custom-scrollbar flex items-center justify-center px-8 md:px-16">
            <div 
              className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-slate-800 leading-relaxed anki-content-render w-full text-center"
              dangerouslySetInnerHTML={{ __html: isCloze ? processClozeForQuestion(card.front) : card.front }}
            />
          </div>

          <div className="w-full flex flex-col items-center gap-3 py-8 flex-shrink-0 bg-white/50 backdrop-blur-sm z-10 pointer-events-none">
             <div className="w-12 h-1 bg-slate-100 rounded-full" />
             <div className="text-slate-300 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">
                Tap to reveal answer
             </div>
          </div>
        </div>

        {/* Back Side */}
        <div className="absolute inset-0 backface-hidden bg-white rounded-[40px] shadow-card-flipped border-2 border-indigo-50 flex flex-col card-back-rotate overflow-hidden">
          <div className="w-full flex justify-center py-8 flex-shrink-0 bg-white/50 backdrop-blur-sm z-10">
            <span className="px-5 py-2 bg-green-50 text-green-600 text-[11px] font-black uppercase tracking-[0.3em] rounded-full shadow-sm">
              Explanation
            </span>
          </div>

          <div className="flex-1 w-full overflow-y-auto custom-scrollbar px-8 md:px-16">
            <div className="min-h-full flex flex-col items-center justify-center py-10">
              {/* If Cloze, show revealed question context first */}
              {isCloze && (
                <div 
                  className="text-xl md:text-2xl lg:text-3xl font-extrabold text-slate-800 leading-relaxed anki-content-render w-full text-center mb-10 pb-10 border-b-2 border-slate-50"
                  dangerouslySetInnerHTML={{ __html: processClozeForAnswer(card.front) }}
                />
              )}
              
              <div 
                className="text-lg md:text-xl lg:text-2xl font-bold text-slate-600 leading-snug anki-content-render w-full text-center"
                dangerouslySetInnerHTML={{ __html: card.back }}
              />
            </div>
          </div>

          <div className="w-full flex flex-col items-center gap-3 py-8 flex-shrink-0 bg-white/50 backdrop-blur-sm z-10 pointer-events-none">
             <div className="w-12 h-1 bg-indigo-50 rounded-full" />
             <div className="text-slate-300 text-[10px] font-black uppercase tracking-[0.2em]">
                Tap to hide answer
             </div>
          </div>
        </div>
      </div>
      
      <style>{`
        .perspective-container {
          perspective: 2500px;
        }
        
        .transform-style-3d {
          transform-style: preserve-3d;
        }
        
        .backface-hidden {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }

        .card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
        }

        .card-inner.flipped {
          transform: rotateY(180deg) scale(1.02);
        }

        .card-inner:not(.flipped):hover {
          transform: translateY(-4px) scale(1.01);
        }

        .card-back-rotate {
          transform: rotateY(180deg);
        }

        .shadow-card {
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.08), 0 10px 20px -5px rgba(0, 0, 0, 0.04);
          transition: box-shadow 0.7s ease;
        }

        .shadow-card-flipped {
          box-shadow: 0 -25px 50px -12px rgba(79, 70, 229, 0.1), 0 10px 20px -5px rgba(0, 0, 0, 0.04);
        }

        .flipped .shadow-card {
           box-shadow: none;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #f1f5f9;
          border-radius: 10px;
        }
        .anki-content-render b, .anki-content-render strong {
          color: #4f46e5;
          font-weight: 900;
        }
        .anki-content-render img {
          max-width: 100%;
          max-height: 45vh;
          object-fit: contain;
          margin: 1.5rem auto;
          border-radius: 24px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.06);
          display: block;
        }

        /* Improved interaction feedback */
        .card-inner:active {
          transform: scale(0.98);
          transition: transform 0.1s ease;
        }
        .card-inner.flipped:active {
          transform: rotateY(180deg) scale(0.98);
        }
      `}</style>
    </div>
  );
};
