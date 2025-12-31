
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Plus, BookMarked, ChevronLeft, ChevronRight, Search, FileUp, GraduationCap,
  Layers, Trash2, RotateCcw, Activity, LogOut, Database, AlertCircle, UserCircle,
  BarChart2, Bookmark, BookmarkPlus, Clock, CalendarCheck, Zap, ListFilter, Play,
  LayoutGrid, ClipboardList, CheckCircle, PartyPopper, CheckCircle2, Check, ArrowLeft,
  FastForward, ShieldCheck, Stars, RefreshCw, Cloud, CloudUpload, CloudDownload, Download, Upload,
  Mail, Lock, Eye, EyeOff
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
import * as syncService from './services/syncService';

const App: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [loginModalState, setLoginModalState] = useState<{ isOpen: boolean; provider: AIProvider | null }>({ isOpen: false, provider: null });
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncSuccess, setSyncSuccess] = useState('');
  const [couchdbUrl, setCouchdbUrl] = useState(() => {
    const stored = localStorage.getItem('couchdb_url');
    if (stored) return stored;
    // In development, suggest using proxy
    try {
      // @ts-ignore - Vite env variable
      if (import.meta.env?.DEV) {
        const useProxy = localStorage.getItem('couchdb_use_proxy') === 'true';
        if (useProxy) return '/couchdb';
      }
    } catch (e) {
      // Ignore if import.meta is not available
    }
    return 'http://localhost:5984';
  });
  const [useProxy, setUseProxy] = useState(() => {
    return localStorage.getItem('couchdb_use_proxy') === 'true';
  });
  const profileRef = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullname, setFullname] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);
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
      const session = localStorage.getItem('flowcards_session');
      if (session) {
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
    if (!email.trim() || !password.trim()) {
      setAuthError(isLoginMode ? 'Please enter email and password' : 'Please enter email and password to register');
      return;
    }

    if (!isLoginMode && !fullname.trim()) {
      setAuthError('Please enter your full name');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setAuthError('Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters long');
      return;
    }

    setIsProcessingAuth(true);
    setAuthError('');

    try {
      const { loginUser, registerUser } = await import('./services/couchdbAuth');
      
      if (isLoginMode) {
        const user = await loginUser(email.trim(), password);
        localStorage.setItem('flowcards_session', user.email);
        await syncAllData(user.email);
        setState(prev => ({ ...prev, view: 'library' }));
      } else {
        await registerUser(email.trim(), password, fullname.trim());
        // After registration, automatically log in
        const user = await loginUser(email.trim(), password);
        localStorage.setItem('flowcards_session', user.email);
        await syncAllData(user.email);
        setState(prev => ({ ...prev, view: 'library' }));
      }
    } catch (err: any) {
      setAuthError(err.message || (isLoginMode ? 'Login failed. Please try again.' : 'Registration failed. Please try again.'));
    } finally {
      setIsProcessingAuth(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('flowcards_session');
    setEmail('');
    setPassword('');
    setFullname('');
    setState(prev => ({ ...prev, view: 'login', decks: [], selectedDeck: null, studiedCardIds: new Set(), cardStatuses: {}, sessionReviewedCardIds: [] }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const user = localStorage.getItem('flowcards_session');
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
    const user = localStorage.getItem('flowcards_session');
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
    const user = localStorage.getItem('flowcards_session');
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
    const user = localStorage.getItem('flowcards_session');
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
    const user = localStorage.getItem('flowcards_session');
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

  const currentUserEmail = useMemo(() => localStorage.getItem('flowcards_session') || '', [state.view]);
  const currentUserInitial = useMemo(() => {
    const email = currentUserEmail;
    if (email) {
      return email.charAt(0).toUpperCase();
    }
    return '?';
  }, [currentUserEmail]);
  const filteredDecks = state.decks.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const currentCard = state.selectedDeck?.cards[state.currentCardIndex];

  const isReviewMode = state.selectedDeck?.id === -999;

  const handleAddCard = async (cardData: Omit<AnkiCard, 'id' | 'noteId' | 'deckId' | 'ord'>) => {
    const user = localStorage.getItem('flowcards_session');
    const currentDeck = state.selectedDeck;

    if (!user || !currentDeck) return;

    const newCard: AnkiCard = {
      id: Date.now(),
      noteId: Date.now(),
      deckId: currentDeck.id,
      ord: currentDeck.cards.length,
      ...cardData
    };

    const updatedDeck = {
      ...currentDeck,
      cards: [...currentDeck.cards, newCard]
    };

    try {
      // Update local state
      setState(prev => ({
        ...prev,
        selectedDeck: updatedDeck,
        decks: prev.decks.map(d => d.id === updatedDeck.id ? updatedDeck : d)
      }));

      // Persist to DB
      // We need to save the specific deck. dbService.saveDecks takes an array.
      // We can just save this one deck to update it.
      await dbService.saveDecks(user, [updatedDeck]);

      // Also refresh due cards just in case, though new cards aren't due immediately unless we set them so.
      // But we might want to ensure consistency.
    } catch (err) {
      console.error("Failed to save new card:", err);
      alert("Failed to save card. Please try again.");
    }
  };

  const handleSyncUpload = async () => {
    const user = localStorage.getItem('flowcards_session');
    if (!user) return;

    setIsSyncing(true);
    setSyncError('');
    setSyncSuccess('');

    try {
      const syncData = await syncService.exportUserData(user);
      await syncService.uploadToCloud(syncData);
        setSyncSuccess('Progress synced to cloud successfully!');
      
      setTimeout(() => {
        setSyncSuccess('');
        setIsSyncModalOpen(false);
      }, 2000);
    } catch (err: any) {
      setSyncError(err.message || 'Failed to sync. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncDownload = async () => {
    const user = localStorage.getItem('flowcards_session');
    if (!user) return;

    setIsSyncing(true);
    setSyncError('');
    setSyncSuccess('');

    try {
      const syncData = await syncService.downloadFromCloud(user);
      if (!syncData) {
        setSyncError('No sync data found in cloud.');
        setIsSyncing(false);
        return;
      }

      await syncService.importUserData(syncData, 'merge');
      await syncAllData(user);
      setSyncSuccess('Progress synced from cloud successfully!');
      setTimeout(() => {
        setSyncSuccess('');
        setIsSyncModalOpen(false);
      }, 2000);
    } catch (err: any) {
      setSyncError(err.message || 'Failed to sync. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportFile = async () => {
    const user = localStorage.getItem('flowcards_session');
    if (!user) return;

    try {
      const syncData = await syncService.exportUserData(user);
      syncService.exportToFile(syncData);
      setSyncSuccess('Progress exported to file!');
      setTimeout(() => {
        setSyncSuccess('');
        setIsSyncModalOpen(false);
      }, 2000);
    } catch (err: any) {
      setSyncError(err.message || 'Failed to export. Please try again.');
    }
  };

  const handleImportFile = async () => {
    const user = localStorage.getItem('flowcards_session');
    if (!user) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        setIsSyncing(true);
        setSyncError('');
        setSyncSuccess('');
        try {
          const syncData = await syncService.importFromFile(file);
          await syncService.importUserData(syncData, 'merge');
          await syncAllData(user);
          setSyncSuccess('Progress imported successfully!');
          setTimeout(() => {
            setSyncSuccess('');
            setIsSyncModalOpen(false);
          }, 2000);
        } catch (err: any) {
          setSyncError(err.message || 'Failed to import file.');
        } finally {
          setIsSyncing(false);
        }
      }
    };
    input.click();
  };

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
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Flow Cards</h1>
              <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px]"></p>
            </div>

            {authError && (
              <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100 flex items-center gap-3 animate-shake">
                <AlertCircle className="w-4 h-4" />
                {authError}
              </div>
            )}

            <div className="space-y-4">
              {!isLoginMode && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Full Name</label>
                  <div className="relative group">
                    <UserCircle className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-slate-950 transition-colors" />
                    <input
                      type="text"
                      value={fullname}
                      onChange={e => setFullname(e.target.value)}
                      placeholder="Enter your full name"
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 pl-14 pr-6 focus:border-slate-950 outline-none transition-all font-bold"
                      autoComplete="name"
                    />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Email</label>
                <div className="relative group">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-slate-950 transition-colors" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 pl-14 pr-6 focus:border-slate-950 outline-none transition-all font-bold"
                    autoComplete="email"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Password</label>
                <div className="relative group">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-slate-950 transition-colors" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 pl-14 pr-14 focus:border-slate-950 outline-none transition-all font-bold"
                    autoComplete={isLoginMode ? "current-password" : "new-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-950 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button disabled={isProcessingAuth} type="submit" className="w-full bg-slate-950 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all disabled:opacity-50 relative overflow-hidden">
                {isProcessingAuth ? (
                  <div className="flex items-center justify-center gap-3">
                    <Activity className="w-5 h-5 animate-medical-heartbeat" />
                    <span>{isLoginMode ? 'Logging in...' : 'Registering...'}</span>
                  </div>
                ) : (isLoginMode ? 'Login' : 'Register')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLoginMode(!isLoginMode);
                  setAuthError('');
                  setPassword('');
                  setFullname('');
                }}
                className="w-full text-slate-400 hover:text-slate-950 py-3 rounded-2xl font-bold text-sm transition-colors"
              >
                {isLoginMode ? "Don't have an account? Register" : "Already have an account? Login"}
              </button>
            </div>
          </form>
        </div>
      )}

      {(state.view !== 'login') && (
        <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-10 pb-32">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-950 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200 cursor-pointer" onClick={() => setState(prev => ({ ...prev, view: 'library' }))}>
                <Layers className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-black tracking-tight hidden sm:block">Repository</h2>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsSyncModalOpen(true)} 
                className={`p-3 rounded-2xl transition-all ${isSyncModalOpen ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-400 hover:text-indigo-600 border border-slate-200 shadow-sm'}`}
                title="Sync Progress"
              >
                <RefreshCw className="w-6 h-6" />
              </button>
              <button onClick={() => setState(prev => ({ ...prev, view: 'bookmarks' }))} className={`p-3 rounded-2xl transition-all ${state.view === 'bookmarks' ? 'bg-amber-500 text-white shadow-lg' : 'bg-white text-slate-400 hover:text-amber-600 border border-slate-200 shadow-sm'}`}><Bookmark className="w-6 h-6" /></button>
              <button onClick={() => setState(prev => ({ ...prev, view: 'analytics' }))} className={`p-3 rounded-2xl transition-all ${state.view === 'analytics' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-400 hover:text-indigo-600 border border-slate-200 shadow-sm'}`}><BarChart2 className="w-6 h-6" /></button>
              <div className="relative" ref={profileRef}>
                <button onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)} className="w-12 h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center font-black text-slate-950 shadow-sm transition-all hover:bg-slate-50 active:scale-90">{currentUserInitial}</button>
                {isProfileMenuOpen && (
                  <div className="absolute right-0 mt-3 w-56 bg-white rounded-3xl shadow-2xl border border-slate-100 p-3 z-50 animate-in slide-in-from-top-2">
                    <div className="px-4 py-2 text-xs text-slate-600 font-bold border-b border-slate-100 mb-2">
                      {currentUserEmail}
                    </div>
                    <button onClick={handleLogout} className="w-full flex items-center gap-3 p-4 text-red-600 font-bold text-sm hover:bg-red-50 rounded-2xl transition-all"><LogOut className="w-5 h-5" /> Logout</button>
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
                      <button onClick={() => setIsDeckModalOpen(true)} className="mt-6 px-8 py-3 bg-slate-100 text-slate-950 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all flex items-center gap-2 mx-auto">
                        <Plus className="w-4 h-4" /> Create New Deck
                      </button>
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
            <DeckDetailView
              deck={state.selectedDeck}
              cardStatuses={state.cardStatuses}
              onBack={() => setState(prev => ({ ...prev, view: 'library', selectedDeck: null }))}
              onStudyCard={(index) => setState(prev => ({ ...prev, view: 'study', currentCardIndex: index, isFlipped: false, sessionReviewedCardIds: [] }))}
              onAddCard={handleAddCard}
            />
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

          {state.view === 'analytics' && <AnalyticsView username={localStorage.getItem('flowcards_session') || ''} decks={state.decks} onBack={() => setState(prev => ({ ...prev, view: 'library' }))} />}
          {state.view === 'bookmarks' && <BookmarksView username={localStorage.getItem('flowcards_session') || ''} onBack={() => setState(prev => ({ ...prev, view: 'library' }))} onStudyCard={(card) => setState(prev => ({ ...prev, view: 'study', selectedDeck: { id: -1, name: 'Saved Preview', cards: [card] }, currentCardIndex: 0, isFlipped: false, sessionReviewedCardIds: [] }))} />}
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
                const user = localStorage.getItem('flowcards_session');
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
          username={localStorage.getItem('flowcards_session') || ''}
          card={currentCard}
          deckName={state.selectedDeck?.name || 'Unknown Deck'}
          onClose={() => setIsBookmarkModalOpen(false)}
        />
      )}

      {isSyncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl p-10 animate-in zoom-in-95 duration-500">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-black text-slate-900">Sync Progress</h2>
              <button onClick={() => { setIsSyncModalOpen(false); setSyncError(''); setSyncSuccess(''); }} className="p-2 text-slate-400 hover:text-slate-950 transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>

            <p className="text-slate-600 text-sm mb-4 font-medium">
              Sync your study progress across devices. Your data will be synced automatically.
            </p>

            <div className="mb-4 space-y-3">
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-2xl border border-blue-200">
                <input
                  type="checkbox"
                  id="useProxy"
                  checked={useProxy}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setUseProxy(checked);
                    localStorage.setItem('couchdb_use_proxy', checked.toString());
                    if (checked) {
                      setCouchdbUrl('/couchdb');
                      localStorage.setItem('couchdb_url', '/couchdb');
                    }
                  }}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <label htmlFor="useProxy" className="text-xs text-blue-700 font-bold cursor-pointer flex-1">
                  Use Vite Proxy (recommended for development - bypasses CORS)
                </label>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Server URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couchdbUrl}
                    onChange={(e) => {
                      setCouchdbUrl(e.target.value);
                      localStorage.setItem('couchdb_url', e.target.value);
                      if (e.target.value !== '/couchdb') {
                        setUseProxy(false);
                        localStorage.setItem('couchdb_use_proxy', 'false');
                      }
                    }}
                    placeholder={useProxy ? "/couchdb" : "http://localhost:5984"}
                    disabled={useProxy}
                    className="flex-1 h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-slate-950 transition-all font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <button
                    onClick={async () => {
                      setIsSyncing(true);
                      setSyncError('');
                      try {
                      const { testConnection, setCouchDBUrl } = await import('./services/couchdbSync');
                      setCouchDBUrl(couchdbUrl);
                      const result = await testConnection(couchdbUrl);
                      if (result.ok) {
                        setSyncSuccess('Connection successful!');
                        setTimeout(() => setSyncSuccess(''), 2000);
                      } else {
                        setSyncError(result.error || 'Connection failed');
                      }
                    } catch (err: any) {
                      setSyncError(err.message || 'Connection test failed');
                    } finally {
                      setIsSyncing(false);
                    }
                  }}
                    disabled={isSyncing}
                    className="px-4 h-12 bg-slate-100 text-slate-950 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-50"
                  >
                    Test
                  </button>
                </div>
                {useProxy && (
                  <p className="text-[10px] text-slate-500 font-medium">
                    Using Vite proxy at /couchdb → http://localhost:5984 (bypasses CORS)
                  </p>
                )}
              </div>
            </div>

            {syncError && (
              <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100 flex items-center gap-3">
                <AlertCircle className="w-4 h-4" />
                {syncError}
              </div>
            )}

            {syncSuccess && (
              <div className="mb-4 p-4 bg-emerald-50 text-emerald-600 rounded-2xl text-xs font-bold border border-emerald-100 flex items-center gap-3">
                <CheckCircle className="w-4 h-4" />
                {syncSuccess}
              </div>
            )}

            <div className="space-y-3">
              <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-200 mb-4">
                <p className="text-xs text-indigo-700 font-bold mb-1">Cloud Sync</p>
                <p className="text-xs text-indigo-600">Sync your progress across all devices</p>
              </div>
              <button
                onClick={handleSyncUpload}
                disabled={isSyncing}
                className="w-full flex items-center justify-center gap-3 p-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncing ? (
                  <>
                    <Activity className="w-5 h-5 animate-spin" />
                    Syncing...
                  </>
                    ) : (
                      <>
                        <CloudUpload className="w-5 h-5" />
                        Upload to Cloud
                      </>
                    )}
              </button>
              <button
                onClick={handleSyncDownload}
                disabled={isSyncing}
                className="w-full flex items-center justify-center gap-3 p-5 bg-slate-100 text-slate-950 rounded-2xl font-black uppercase tracking-widest text-xs shadow-sm hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncing ? (
                  <>
                    <Activity className="w-5 h-5 animate-spin" />
                    Syncing...
                  </>
                    ) : (
                      <>
                        <CloudDownload className="w-5 h-5" />
                        Download from Cloud
                      </>
                    )}
              </button>

              <div className="border-t border-slate-200 pt-4 mt-4">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-3 text-center">File Transfer</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleExportFile}
                    disabled={isSyncing}
                    className="flex items-center justify-center gap-2 p-4 bg-white border-2 border-slate-200 text-slate-950 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </button>
                  <button
                    onClick={handleImportFile}
                    disabled={isSyncing}
                    className="flex items-center justify-center gap-2 p-4 bg-white border-2 border-slate-200 text-slate-950 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload className="w-4 h-4" />
                    Import
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
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
