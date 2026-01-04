
import React, { useState } from 'react';
import { ChevronLeft, Search, CheckCircle2, PlayCircle, BookOpen, Clock, Calendar, Plus, Trash2 } from 'lucide-react';
import { AnkiDeck, AnkiCard, CardStatus } from '../types';
import { CreateCardModal } from './CreateCardModal';

interface DeckDetailViewProps {
  deck: AnkiDeck;
  cardStatuses: Record<number, CardStatus>;
  onBack: () => void;
  onStudyCard: (index: number) => void;
  onAddCard: (card: Omit<AnkiCard, 'id' | 'noteId' | 'deckId' | 'ord'>) => Promise<void>;
  onDeleteCard: (deckId: number, cardId: number) => Promise<void>;
}

export const DeckDetailView: React.FC<DeckDetailViewProps> = ({ deck, cardStatuses, onBack, onStudyCard, onAddCard, onDeleteCard }) => {
  const [search, setSearch] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const filteredCards = deck.cards.filter(card => {
    const cleanText = card.front.replace(/<[^>]*>?/gm, '').toLowerCase();
    return cleanText.includes(search.toLowerCase());
  });

  const getStatusInfo = (cardId: number) => {
    const status = cardStatuses[cardId];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayTimestamp = now.getTime();

    if (!status) return { label: 'New', color: 'text-slate-400', bg: 'bg-slate-100', icon: PlayCircle };

    // Mastered / Cleared from queue manually via Done
    if (status.status === 'completed' && !status.nextReviewAt) {
      return { label: 'Done', color: 'text-emerald-600', bg: 'bg-emerald-100', icon: CheckCircle2 };
    }

    if (status.nextReviewAt) {
      if (status.nextReviewAt <= Date.now()) {
        return { label: 'Today', color: 'text-rose-600', bg: 'bg-rose-100', icon: Clock };
      } else {
        const dateStr = new Date(status.nextReviewAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return { label: dateStr, color: 'text-indigo-600', bg: 'bg-indigo-50', icon: Calendar };
      }
    }

    return { label: 'Done', color: 'text-emerald-500', bg: 'bg-emerald-50', icon: CheckCircle2 };
  };

  const studiedCount = Object.values(cardStatuses).length;
  const progress = Math.round((studiedCount / deck.cards.length) * 100) || 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <button onClick={onBack} className="flex items-center gap-3 text-slate-400 font-bold hover:text-slate-950 transition-colors w-fit">
          <ChevronLeft className="w-5 h-5" /> Back to Library
        </button>
        <div className="flex items-center gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Deck Progress</span>
            <span className="text-sm font-black text-slate-900">{studiedCount} / {deck.cards.length} Cards</span>
          </div>
          <div className="w-24 h-2.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-black text-emerald-600">{progress}%</span>
        </div>
      </div>

      <div className="bg-white rounded-[40px] p-8 md:p-10 border border-slate-100 shadow-xl shadow-slate-200/40 space-y-8">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-slate-900 leading-tight">{deck.name}</h2>
            <p className="text-slate-400 font-bold text-sm">Select a specific card or search the collection.</p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="p-4 bg-slate-950 text-white rounded-2xl shadow-lg hover:bg-slate-800 active:scale-95 transition-all"
            title="Add New Card"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        <div className="relative group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-950 transition-colors" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search within this deck..."
            className="w-full h-16 pl-16 pr-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-slate-950 transition-all font-bold"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
          {filteredCards.length === 0 ? (
            <div className="text-center py-10 text-slate-400 font-bold">No cards found matching your search.</div>
          ) : (
            filteredCards.map((card) => {
              const statusInfo = getStatusInfo(card.id);
              const originalIdx = deck.cards.findIndex(c => c.id === card.id);

              return (
                <div
                  key={card.id}
                  className={`group w-full flex items-center justify-between p-6 rounded-[28px] border-2 transition-all text-left hover:border-slate-200 hover:shadow-md
                    ${statusInfo.label === 'Done' ? 'bg-emerald-50/20' : 'bg-white border-slate-50'}
                  `}
                >
                  <button
                    onClick={() => onStudyCard(originalIdx)}
                    className="flex-1 flex items-center gap-5 overflow-hidden text-left"
                  >
                    <div className={`p-3 rounded-2xl shrink-0 ${statusInfo.bg} ${statusInfo.color}`}>
                      <statusInfo.icon className="w-5 h-5" />
                    </div>
                    <div className="overflow-hidden">
                      <div
                        className="font-bold text-slate-800 line-clamp-1 text-sm md:text-base"
                        dangerouslySetInnerHTML={{ __html: card.front.replace(/<[^>]*>?/gm, '').substring(0, 100) }}
                      />
                      <span className={`text-[9px] font-black uppercase tracking-widest mt-1 block ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  </button>

                  <div className="shrink-0 flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCard(deck.id, card.id);
                      }}
                      className="p-3 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                      title="Delete Card"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <BookOpen className="w-4 h-4 text-slate-200 group-hover:text-slate-950" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <CreateCardModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSave={onAddCard}
      />
    </div>
  );
};
