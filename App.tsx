
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, BookMarked, ChevronLeft, ChevronRight, Search, FileUp, GraduationCap, 
  Layers, Trash2, RotateCcw, Activity, LogOut, Database, AlertCircle, UserCircle,
  BarChart2, Bookmark, BookmarkPlus, Clock, CalendarCheck, Zap, ListFilter, Play,
  LayoutGrid, ClipboardList, CheckCircle, PartyPopper, CheckCircle2, Check, ArrowLeft,
  FastForward, ShieldCheck, Stars
} from 'lucide-react';
import { AnkiDeck, AppState, AnkiCard, AIProvider, AISettings, CardStatus } from './types';
import { parseAnkiFile } from './services/ankiParser';
import { CardDisplay } from './components/CardDisplay';
import { SmartTutor } from './components/SmartTutor';
import { LoginModal } from './components/LoginModal';
import { AnalyticsView } from './components/AnalyticsView';
import { DeckDetailView } from './components/DeckDetailView';
import { BookmarkModal } from './components/BookmarkModal';
import { BookmarksView } from './components/BookmarksView';
import * as dbService from './services/db';

const App: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [loginModalState, setLoginModalState] = useState<{ isOpen: boolean; provider: AIProvider | null }>({ isOpen: false, provider: null });
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  
  const [username, setUsername] = useState('');
  const [authError, setAuthError] = useState('');
  const [isProcessingAuth, setIsProcessingAuth] = useState(false);

  const [isDeckModalOpen, setIsDeckModalOpen] = useState(false);
  const [deckNameInput, setDeckNameInput] = useState('');

  const [dueCards, setDueCards] = useState<{ card: AnkiCard, deckName: string }[]>([]);

  const [state, setState] = useState<AppState>({
    decks: [],
    selectedDeck: null,
    studiedCardIds: new Set(),
    cardStatuses: {},
    sessionReviewedCardIds: [],
    currentCardIndex: 0,
    isFlipped: false,
    isLoading: true,
    error: null,
    view: 'login',
    settings: {
      provider: 'gemini',
      model: 'gemini-3-flash-preview',
      apiKeys: {}
    }
  });

  useEffect(() => {
    const checkSession = async () => {
      const session = localStorage.getItem('ankiflow_session');
      if (session) {
        setUsername(session);
        await syncAllData(session);
        setState(prev => ({ ...prev, view: 'library' }));
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };
    checkSession();
  }, []);

  const refreshDueCards = async (user: string, decks: AnkiDeck[]) => {
    const due = await dbService.getDueCards(user, decks);
    setDueCards(due);
    return due;
  };

  const syncAllData = async (user: string) => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const [decks, savedSettings] = await Promise.all([
        dbService.loadDecks(user),
        dbService.loadSettings(user)
      ]);
      
      setState(prev => ({
        ...prev,
        decks,
        settings: savedSettings ? { ...prev.settings, ...savedSettings } : prev.settings,
        isLoading: false
      }));

      await refreshDueCards(user, decks);
    } catch (err) {
      console.error("Local load error:", err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setAuthError('Please enter a profile name');
      return;
    }
    
    setIsProcessingAuth(true);
    setAuthError('');

    try {
      localStorage.setItem('ankiflow_session', username.trim());
      await syncAllData(username.trim());
      setState(prev => ({ ...prev, view: 'library' }));
    } catch (err: any) {
      setAuthError("Failed to initialize local profile.");
    } finally {
      setIsProcessingAuth(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('ankiflow_session');
    setState(prev => ({ ...prev, view: 'login', decks: [], selectedDeck: null, studiedCardIds: new Set(), cardStatuses: {}, sessionReviewedCardIds: [] }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const user = localStorage.getItem('ankiflow_session');
    if (!file || !user) return;
    
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const parsedDecks = await parseAnkiFile(file);
      await dbService.saveDecks(user, parsedDecks);
      const updatedDecks = await dbService.loadDecks(user);
      setState(prev => ({ ...prev, decks: updatedDecks, isLoading: false }));
      await refreshDueCards(user, updatedDecks);
    } catch (err: any) {
      console.error(err);
      setState(prev => ({ ...prev, isLoading: false, error: 'Import failed. File might be corrupted.' }));
    }
  };

  const deleteDeck = useCallback(async (deckId: number) => {
    const user = localStorage.getItem('ankiflow_session');
    if (!user) return;
    if (!window.confirm("Delete permanently from this device? This will also clear study history for this deck.")) return;
    try {
      await dbService.deleteDeck(user, deckId);
      const remainingDecks = state.decks.filter(d => d.id !== deckId);
      setState(prev => ({ ...prev, decks: remainingDecks }));
      await refreshDueCards(user, remainingDecks);
    } catch (err) {
      console.error("Deletion failed:", err);
      alert("Failed to delete deck from database.");
    }
  }, [state.decks]);

  const markCurrentAsRead = useCallback(async () => {
    const user = localStorage.getItem('ankiflow_session');
    const deck = state.selectedDeck;
    const card = deck?.cards[state.currentCardIndex];
    
    if (user && deck && card) {
      await dbService.logStudy(user, card.id);
      await dbService.markCardAsRead(user, deck.id, card.id);
      
      const statuses = await dbService.getCardStatusesForDeck(user, deck.id);

      setState(prev => {
        const newSessionIds = [...prev.sessionReviewedCardIds];
        if (!newSessionIds.includes(card.id)) newSessionIds.push(card.id);
        return { 
          ...prev, 
          cardStatuses: statuses,
          sessionReviewedCardIds: newSessionIds 
        };
      });
    }
  }, [state.selectedDeck, state.currentCardIndex]);

  const scheduleNextReview = async (intervalDays: number) => {
    const user = localStorage.getItem('ankiflow_session');
    const deck = state.selectedDeck;
    const card = deck?.cards[state.currentCardIndex];
    
    if (user && deck && card) {
      await dbService.scheduleReview(user, card.deckId, card.id, intervalDays);
      const statuses = await dbService.getCardStatusesForDeck(user, deck.id);
      await refreshDueCards(user, state.decks);
      setState(prev => ({ ...prev, cardStatuses: statuses }));
      nextCard();
    }
  };

  const handleCardFlip = useCallback(() => {
    if (!state.isFlipped) {
      markCurrentAsRead();
    }
    setState(prev => ({ ...prev, isFlipped: !prev.isFlipped }));
  }, [state.isFlipped, markCurrentAsRead]);

  const nextCard = useCallback(() => {
    setState(prev => {
      if (!prev.selectedDeck) return prev;
      if (prev.currentCardIndex >= prev.selectedDeck.cards.length - 1) {
        return { ...prev, view: 'library', selectedDeck: null, isFlipped: false, sessionReviewedCardIds: [] };
      }
      const nextIdx = prev.currentCardIndex + 1;
      return { ...prev, isFlipped: false, currentCardIndex: nextIdx };
    });
  }, []);

  const prevCard = useCallback(() => {
    setState(prev => {
      if (!prev.selectedDeck) return prev;
      const prevIdx = Math.max(0, prev.currentCardIndex - 1);
      return { ...prev, isFlipped: false, currentCardIndex: prevIdx };
    });
  }, []);

  const openDeckDetail = async (deck: AnkiDeck) => {
    const user = localStorage.getItem('ankiflow_session');
    if (user) {
      const statuses = await dbService.getCardStatusesForDeck(user, deck.id);
      setState(prev => ({ 
        ...prev, 
        view: 'deck-detail', 
        selectedDeck: deck, 
        cardStatuses: statuses,
        sessionReviewedCardIds: [],
        currentCardIndex: 0 
      }));
    }
  };

  const startReviewSession = () => {
    if (dueCards.length === 0) return;
    const reviewDeck: AnkiDeck = {
      id: -999,
      name: 'Today\'s Smart Review',
      cards: dueCards.map(d => d.card)
    };
    setState(prev => ({
      ...prev,
      view: 'study',
      selectedDeck: reviewDeck,
      currentCardIndex: 0,
      isFlipped: false,
      sessionReviewedCardIds: []
    }));
  };

  const dueCountsPerDeck = useMemo(() => {
    const counts: Record<number, number> = {};
    dueCards.forEach(d => {
      counts[d.card.deckId] = (counts[d.card.deckId] || 0) + 1;
    });
    return counts;
  }, [dueCards]);

  const currentUserInitial = useMemo(() => (localStorage.getItem('ankiflow_session') || '?').charAt(0).toUpperCase(), [state.view]);
  const filteredDecks = state.decks.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const currentCard = state.selectedDeck?.cards[state.currentCardIndex];

  const isReviewMode = state.selectedDeck?.id === -999;

  if (state.isLoading && state.view !== 'login') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Activity className="w-12 h-12 text-slate-950 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {state.view === 'login' && (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_center,rgba(79,70,229,0.05),transparent)]">
           <form onSubmit={handleAuth} className="w-full max-w-md bg-white rounded-[40px] shadow-2xl p-10 space-y-8 border border-slate-100 animate-in fade-in zoom-in-95 duration-500 relative z-10">
              <div className="text-center space-y-2">
                 <div className="w-20 h-20 bg-slate-950 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-slate-200 mb-6">
                    <GraduationCap className="w-12 h-12 text-white" />
                 </div>
                 <h1 className="text-3xl font-black tracking-tight text-slate-900">AnkiFlow</h1>
                 <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px]">On-Device Medical Study</p>
              </div>

              {authError && (
                <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100 flex items-center gap-3 animate-shake">
                  <AlertCircle className="w-4 h-4" />
                  {authError}
                </div>
              )}

              <div className="space-y-4">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Profile Name</label>
                    <div className="relative group">
                       <UserCircle className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-slate-950 transition-colors" />
                       <input 
                         type="text" 
                         value={username} 
                         onChange={e => setUsername(e.target.value)} 
                         placeholder="e.g. Dr. Jane" 
                         className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 pl-14 pr-6 focus:border-slate-950 outline-none transition-all font-bold" 
                       />
                    </div>
                 </div>
              </div>

              <div className="flex flex-col gap-3">
                <button disabled={isProcessingAuth} className="w-full bg-slate-950 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all disabled:opacity-50 relative overflow-hidden">
                   {isProcessingAuth ? (
                     <div className="flex items-center justify-center gap-3">
                        <Activity className="w-5 h-5 animate-medical-heartbeat" />
                        <span>Initializing...</span>
                     </div>
                   ) : 'Enter Library'}
                </button>
              </div>

              <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100">
                 <div className="flex items-center gap-3 text-[10px] font-black text-slate-950 uppercase tracking-widest mb-2">
                    <Database className="w-4 h-4" /> Local Storage Active
                 </div>
                 <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                    All decks and study data stay on this device.
                 </p>
              </div>
           </form>
        </div>
      )}

      {(state.view !== 'login') && (
        <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-10 pb-32">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-slate-950 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200 cursor-pointer" onClick={() => setState(prev => ({...prev, view: 'library'}))}>
                    <Layers className="w-6 h-6 text-white" />
                 </div>
                 <h2 className="text-2xl font-black tracking-tight hidden sm:block">Repository</h2>
              </div>
              <div className="flex items-center gap-4">
                 <button onClick={() => setState(prev => ({ ...prev, view: 'bookmarks' }))} className={`p-3 rounded-2xl transition-all ${state.view === 'bookmarks' ? 'bg-amber-500 text-white shadow-lg' : 'bg-white text-slate-400 hover:text-amber-600 border border-slate-200 shadow-sm'}`}><Bookmark className="w-6 h-6" /></button>
                 <button onClick={() => setState(prev => ({ ...prev, view: 'analytics' }))} className={`p-3 rounded-2xl transition-all ${state.view === 'analytics' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-400 hover:text-indigo-600 border border-slate-200 shadow-sm'}`}><BarChart2 className="w-6 h-6" /></button>
                 <div className="relative" ref={profileRef}>
                    <button onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)} className="w-12 h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center font-black text-slate-950 shadow-sm transition-all hover:bg-slate-50 active:scale-90">{currentUserInitial}</button>
                    {isProfileMenuOpen && (
                       <div className="absolute right-0 mt-3 w-56 bg-white rounded-3xl shadow-2xl border border-slate-100 p-3 z-50 animate-in slide-in-from-top-2">
                          <button onClick={handleLogout} className="w-full flex items-center gap-3 p-4 text-red-600 font-bold text-sm hover:bg-red-50 rounded-2xl transition-all"><LogOut className="w-5 h-5" /> Switch Profile</button>
                       </div>
                    )}
                 </div>
              </div>
           </div>

           {state.view === 'library' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                 {dueCards.length > 0 && (
                   <div className="bg-slate-950 rounded-[40px] p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl shadow-slate-200/20 border border-slate-800 relative overflow-hidden group">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent)] pointer-events-none" />
                      <div className="flex items-center gap-6 z-10">
                        <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center border border-white/10 group-hover:bg-white/10 transition-all"><Clock className="w-8 h-8 text-white animate-pulse" /></div>
                        <div>
                           <h3 className="text-xl font-black text-white">Today's Review Session</h3>
                           <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">{dueCards.length} ITEMS AWAITING REVIEW</p>
                        </div>
                      </div>
                      <button onClick={startReviewSession} className="w-full md:w-auto px-10 py-5 bg-white text-slate-950 rounded-[24px] font-black uppercase tracking-widest text-xs shadow-xl flex items-center justify-center gap-3 hover:bg-slate-50 hover:scale-105 active:scale-95 transition-all z-10"><Zap className="w-4 h-4 fill-current" /> Review Now</button>
                   </div>
                 )}
                 <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1 relative group">
                       <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-950 transition-colors" />
                       <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search medical decks..." className="w-full h-16 pl-16 pr-6 bg-white rounded-3xl border border-slate-200 shadow-sm outline-none focus:ring-4 focus:ring-slate-100 transition-all font-bold" />
                    </div>
                    <label className="h-16 px-8 bg-slate-950 text-white rounded-3xl flex items-center justify-center gap-3 font-black cursor-pointer shadow-xl hover:bg-slate-800 active:scale-95 transition-all">
                       <FileUp className="w-5 h-5" /> <span>Import</span>
                       <input type="file" className="hidden" accept=".apkg" onChange={handleFileUpload} />
                    </label>
                 </div>

                 <div className="animate-in fade-in duration-300">
                   {state.decks.length === 0 ? (
                     <div className="py-24 flex flex-col items-center text-center space-y-6 bg-white rounded-[40px] border border-slate-100 border-dashed border-2">
                        <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200"><BookMarked className="w-10 h-10" /></div>
                        <div className="space-y-2">
                           <h3 className="text-xl font-black text-slate-800">No Decks Loaded</h3>
                           <p className="text-slate-400 text-sm max-w-xs mx-auto font-medium">Import your study files to begin your local session.</p>
                        </div>
                     </div>
                   ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredDecks.map(deck => {
                          const dueInDeck = dueCountsPerDeck[deck.id] || 0;
                          return (
                           <div key={deck.id} className="group relative bg-white rounded-[40px] p-8 border border-slate-100 shadow-xl shadow-slate-200/40 hover:shadow-slate-300 transition-all duration-500 overflow-hidden">
                              <div className="relative z-10 space-y-6">
                                 <div className="flex justify-between items-start">
                                    <div className="p-3 bg-slate-50 rounded-2xl text-slate-950"><BookMarked className="w-6 h-6" /></div>
                                    <button onClick={(e) => { e.stopPropagation(); deleteDeck(deck.id); }} className="p-4 -mr-4 -mt-4 text-slate-300 hover:text-red-500 lg:opacity-0 group-hover:opacity-100 transition-all active:scale-90" title="Delete Deck"><Trash2 className="w-6 h-6" /></button>
                                 </div>
                                 <div>
                                    <h3 className="text-xl font-black text-slate-900 line-clamp-2 leading-tight">{deck.name}</h3>
                                    <div className="flex items-center gap-3 mt-4">
                                       <span className="px-3 py-1 bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-full">{deck.cards.length} Cards</span>
                                       {dueInDeck > 0 && <span className="px-3 py-1 bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-full ring-1 ring-red-100">{dueInDeck} Due</span>}
                                    </div>
                                 </div>
                                 <button onClick={() => openDeckDetail(deck)} className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-lg">Study Now <ChevronRight className="w-4 h-4" /></button>
                              </div>
                              <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full blur-3xl -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                           </div>
                          )
                        })}
                        <button onClick={() => setIsDeckModalOpen(true)} className="group border-4 border-dashed border-slate-100 rounded-[40px] p-8 flex flex-col items-center justify-center gap-4 text-slate-300 hover:border-slate-200 hover:text-slate-400 transition-all min-h-[280px]">
                           <div className="p-4 bg-slate-50 rounded-full group-hover:bg-slate-100 transition-colors"><Plus className="w-10 h-10" /></div>
                           <span className="font-black uppercase tracking-widest text-xs">New Collection</span>
                        </button>
                     </div>
                   )}
                 </div>
              </div>
           )}

           {state.view === 'deck-detail' && state.selectedDeck && (
              <DeckDetailView deck={state.selectedDeck} cardStatuses={state.cardStatuses} onBack={() => setState(prev => ({ ...prev, view: 'library', selectedDeck: null }))} onStudyCard={(index) => setState(prev => ({ ...prev, view: 'study', currentCardIndex: index, isFlipped: false, sessionReviewedCardIds: [] }))} />
           )}

           {state.view === 'study' && state.selectedDeck && (
              <div className="max-w-4xl mx-auto space-y-10 animate-in slide-in-from-right-8 duration-700 pb-20">
                 <div className="flex items-center justify-between">
                    <button onClick={() => setState(prev => ({ ...prev, view: 'library', selectedDeck: null }))} className="flex items-center gap-3 text-slate-400 font-bold hover:text-slate-950 transition-colors"><ChevronLeft className="w-5 h-5" /> Back to Library</button>
                    <div className="flex items-center gap-4">
                       <button onClick={() => setIsBookmarkModalOpen(true)} className="p-3 bg-white text-amber-500 rounded-2xl border-2 border-amber-50 shadow-sm hover:bg-amber-50 active:scale-90 transition-all"><BookmarkPlus className="w-5 h-5" /></button>
                       <div className="px-5 py-2 bg-slate-100 text-slate-950 text-xs font-black rounded-full shadow-inner border border-slate-200/50">{state.currentCardIndex + 1} / {state.selectedDeck.cards.length}</div>
                    </div>
                 </div>
                 {currentCard ? (
                   <>
                    <CardDisplay card={currentCard} isFlipped={state.isFlipped} onFlip={handleCardFlip} />
                    {state.isFlipped && (
                      <div className="space-y-6">
                        <SmartTutor front={currentCard.front} back={currentCard.back} settings={state.settings} />
                        <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-xl shadow-slate-200/40 animate-in slide-in-from-bottom-4 duration-500">
                          <div className="flex flex-col items-center gap-8">
                            <div className="flex items-center gap-3 text-slate-300">
                               <Clock className="w-4 h-4" />
                               <span className="text-[10px] font-black uppercase tracking-[0.3em]">Evaluation</span>
                            </div>
                            
                            <div className={`grid ${isReviewMode ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'} gap-4 w-full`}>
                               {/* Try Again */}
                               <button 
                                onClick={() => scheduleNextReview(0)} 
                                className="group flex flex-col items-center gap-3 p-6 bg-slate-50 rounded-[28px] border-2 border-transparent hover:bg-rose-50 hover:border-rose-100 hover:shadow-lg hover:shadow-rose-100/50 hover:-translate-y-1 transition-all duration-300 active:scale-95 active:translate-y-0"
                               >
                                  <div className="p-2 bg-white rounded-xl shadow-sm group-hover:bg-rose-100 transition-colors">
                                     <RotateCcw className="w-5 h-5 text-rose-500" />
                                  </div>
                                  <span className="text-sm font-black text-slate-900 group-hover:text-rose-700">Try Again</span>
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Now</span>
                               </button>

                               {/* Hard */}
                               <button 
                                onClick={() => scheduleNextReview(1)} 
                                className="group flex flex-col items-center gap-3 p-6 bg-slate-50 rounded-[28px] border-2 border-transparent hover:bg-orange-50 hover:border-orange-100 hover:shadow-lg hover:shadow-orange-100/50 hover:-translate-y-1 transition-all duration-300 active:scale-95 active:translate-y-0"
                               >
                                  <div className="p-2 bg-white rounded-xl shadow-sm group-hover:bg-orange-100 transition-colors">
                                     <AlertCircle className="w-5 h-5 text-orange-500" />
                                  </div>
                                  <span className="text-sm font-black text-slate-900 group-hover:text-orange-700">Hard</span>
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">1 Day</span>
                               </button>

                               {/* Good */}
                               <button 
                                onClick={() => scheduleNextReview(7)} 
                                className="group flex flex-col items-center gap-3 p-6 bg-slate-50 rounded-[28px] border-2 border-transparent hover:bg-indigo-50 hover:border-indigo-100 hover:shadow-lg hover:shadow-indigo-100/50 hover:-translate-y-1 transition-all duration-300 active:scale-95 active:translate-y-0"
                               >
                                  <div className="p-2 bg-white rounded-xl shadow-sm group-hover:bg-indigo-100 transition-colors">
                                     <Check className="w-5 h-5 text-indigo-500" />
                                  </div>
                                  <span className="text-sm font-black text-slate-900 group-hover:text-indigo-700">Good</span>
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">1 Week</span>
                               </button>

                               {/* Easy */}
                               <button 
                                onClick={() => scheduleNextReview(30)} 
                                className="group flex flex-col items-center gap-3 p-6 bg-slate-50 rounded-[28px] border-2 border-transparent hover:bg-emerald-50 hover:border-emerald-100 hover:shadow-lg hover:shadow-emerald-100/50 hover:-translate-y-1 transition-all duration-300 active:scale-95 active:translate-y-0"
                               >
                                  <div className="p-2 bg-white rounded-xl shadow-sm group-hover:bg-emerald-100 transition-colors">
                                     <Zap className="w-5 h-5 text-emerald-500" />
                                  </div>
                                  <span className="text-sm font-black text-slate-900 group-hover:text-emerald-700">Easy</span>
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">1 Month</span>
                               </button>

                               {isReviewMode && (
                                 <button 
                                  onClick={() => scheduleNextReview(-1)} 
                                  className="group flex flex-col items-center gap-3 p-6 bg-slate-900 rounded-[28px] border-2 border-transparent hover:bg-slate-950 hover:shadow-2xl transition-all duration-300 active:scale-95"
                                 >
                                    <div className="p-2 bg-white/10 rounded-xl shadow-sm">
                                       <Stars className="w-5 h-5 text-amber-400 fill-amber-400" />
                                    </div>
                                    <span className="text-sm font-black text-white">Done</span>
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Mastered</span>
                                 </button>
                               )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-6">
                       <button onClick={prevCard} className="w-16 h-16 bg-white rounded-3xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-950 active:scale-90 transition-all"><ChevronLeft className="w-8 h-8" /></button>
                       <button onClick={nextCard} className="w-16 h-16 bg-white rounded-3xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-950 active:scale-90 transition-all"><ChevronRight className="w-8 h-8" /></button>
                    </div>
                   </>
                 ) : (
                   <div className="text-center py-20 bg-white rounded-[40px] border border-slate-100 shadow-xl"><RotateCcw className="w-12 h-12 text-slate-200 mx-auto mb-6" /><h3 className="text-2xl font-black text-slate-800">Empty Deck</h3><p className="text-slate-400 font-bold mt-2 mb-8">No cards found in this collection.</p><button onClick={() => setState(prev => ({ ...prev, view: 'library' }))} className="px-8 py-4 bg-slate-950 text-white rounded-2xl font-black uppercase tracking-widest text-xs">Return Home</button></div>
                 )}
              </div>
           )}

           {state.view === 'analytics' && <AnalyticsView username={localStorage.getItem('ankiflow_session') || ''} decks={state.decks} onBack={() => setState(prev => ({ ...prev, view: 'library' }))} />}
           {state.view === 'bookmarks' && <BookmarksView username={localStorage.getItem('ankiflow_session') || ''} onBack={() => setState(prev => ({ ...prev, view: 'library' }))} onStudyCard={(card) => setState(prev => ({ ...prev, view: 'study', selectedDeck: { id: -1, name: 'Saved Preview', cards: [card] }, currentCardIndex: 0, isFlipped: false, sessionReviewedCardIds: [] }))} />}
        </div>
      )}

      {isDeckModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl p-10 animate-in zoom-in-95 duration-500">
              <h2 className="text-2xl font-black text-slate-900 mb-6">New Collection</h2>
              <input value={deckNameInput} onChange={e => setDeckNameInput(e.target.value)} placeholder="e.g. Pathology: Renal" className="w-full h-16 px-6 bg-slate-50 border-2 border-slate-100 rounded-3xl mb-8 outline-none focus:border-slate-950 font-bold" autoFocus />
              <div className="flex gap-4">
                 <button onClick={() => setIsDeckModalOpen(false)} className="flex-1 py-5 rounded-2xl font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-colors">Cancel</button>
                 <button onClick={async () => {
                    const user = localStorage.getItem('ankiflow_session');
                    if (deckNameInput.trim() && user) {
                      const newDeck = { id: Date.now(), name: deckNameInput.trim(), cards: [] };
                      await dbService.saveDecks(user, [newDeck]);
                      setState(prev => ({ ...prev, decks: [...prev.decks, newDeck] }));
                      setDeckNameInput('');
                      setIsDeckModalOpen(false);
                    }
                 }} className="flex-1 py-5 bg-slate-950 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">Create</button>
              </div>
           </div>
        </div>
      )}

      {currentCard && (
        <BookmarkModal 
           isOpen={isBookmarkModalOpen}
           username={localStorage.getItem('ankiflow_session') || ''}
           card={currentCard}
           deckName={state.selectedDeck?.name || 'Unknown Deck'}
           onClose={() => setIsBookmarkModalOpen(false)}
        />
      )}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
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
      `}</style>
    </div>
  );
};

export default App;
