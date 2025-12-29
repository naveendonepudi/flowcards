
export interface AnkiNote {
  id: number;
  fields: string[];
  tags: string[];
}

export interface AnkiCard {
  id: number;
  noteId: number;
  deckId: number;
  ord: number;
  front: string;
  back: string;
}

export interface AnkiDeck {
  id: number;
  name: string;
  cards: AnkiCard[];
}

export interface StudyLog {
  username: string;
  date: string; // YYYY-MM-DD
  cardIds: number[]; // Track unique cards to avoid double counting
}

export interface CardStatus {
  username: string;
  deckId: number;
  cardId: number;
  status: 'new' | 'completed';
  nextReviewAt?: number; // Timestamp for spaced repetition
}

export interface BookmarkFolder {
  id: string;
  name: string;
  username: string;
}

export interface Bookmark {
  id: string;
  username: string;
  folderId: string;
  card: AnkiCard;
  deckName: string;
  createdAt: number;
}

export type AIProvider = 'gemini' | 'openai' | 'perplexity' | 'custom';

export interface AISettings {
  provider: AIProvider;
  model: string;
  apiKeys: {
    openai?: string;
    perplexity?: string;
    custom?: string;
  };
  customEndpoint?: string;
  customModel?: string;
  dbConfig?: {
    url?: string;
    user?: string;
    pass?: string;
  };
}

export interface AppState {
  decks: AnkiDeck[];
  selectedDeck: AnkiDeck | null;
  studiedCardIds: Set<number>; 
  cardStatuses: Record<number, CardStatus>; 
  sessionReviewedCardIds: number[]; 
  currentCardIndex: number;
  isFlipped: boolean;
  isLoading: boolean;
  error: string | null;
  view: 'login' | 'library' | 'study' | 'analytics' | 'deck-detail' | 'bookmarks';
  settings: AISettings;
}
