
import { AnkiDeck, AISettings, StudyLog, CardStatus, BookmarkFolder, Bookmark, AnkiCard } from '../types';

const DB_NAME = 'FlowCardsLocalDB';
const DECKS_STORE = 'decks';
const SETTINGS_STORE = 'settings';
const LOGS_STORE = 'study_logs';
const STATUS_STORE = 'card_status';
const FOLDERS_STORE = 'bookmark_folders';
const BOOKMARKS_STORE = 'bookmarks';
const DELETED_ITEMS_STORE = 'deleted_items';
const DB_VERSION = 8;

export async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event: any) => {
      const db = request.result;

      if (!db.objectStoreNames.contains(DECKS_STORE)) {
        db.createObjectStore(DECKS_STORE, { keyPath: ['username', 'id'] });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'username' });
      }
      if (!db.objectStoreNames.contains(LOGS_STORE)) {
        db.createObjectStore(LOGS_STORE, { keyPath: ['username', 'date'] });
      }
      if (!db.objectStoreNames.contains(STATUS_STORE)) {
        db.createObjectStore(STATUS_STORE, { keyPath: ['username', 'deckId', 'cardId'] });
      }
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(BOOKMARKS_STORE)) {
        db.createObjectStore(BOOKMARKS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DELETED_ITEMS_STORE)) {
        db.createObjectStore(DELETED_ITEMS_STORE, { keyPath: ['username', 'type', 'id'] });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function scheduleReview(username: string, deckId: number, cardId: number, intervalDays: number): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(STATUS_STORE, 'readwrite');
  const store = tx.objectStore(STATUS_STORE);

  let nextReviewAt: number | undefined;

  if (intervalDays !== -1) {
    const offset = intervalDays === 0 ? 0 : (intervalDays * 24 * 60 * 60 * 1000);
    nextReviewAt = Date.now() + offset;
  }

  store.put({
    username,
    deckId,
    cardId,
    status: intervalDays === -1 ? 'completed' : 'new',
    nextReviewAt
  });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDueCards(username: string, allDecks: AnkiDeck[]): Promise<{ card: AnkiCard, deckName: string }[]> {
  const db = await initDB();
  const tx = db.transaction(STATUS_STORE, 'readonly');
  const store = tx.objectStore(STATUS_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const allStatus = request.result as CardStatus[];
      const now = Date.now();

      const dueStatus = allStatus.filter(s =>
        s.username === username &&
        s.nextReviewAt !== undefined &&
        s.nextReviewAt !== null &&
        s.nextReviewAt <= now
      );

      const dueCards: { card: AnkiCard, deckName: string }[] = [];

      dueStatus.forEach(status => {
        const deck = allDecks.find(d => d.id === status.deckId);
        if (deck) {
          const card = deck.cards.find(c => c.id === status.cardId);
          if (card) {
            dueCards.push({ card, deckName: deck.name });
          }
        }
      });

      resolve(dueCards);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getCardStatusesForDeck(username: string, deckId: number): Promise<Record<number, CardStatus>> {
  const db = await initDB();
  const tx = db.transaction(STATUS_STORE, 'readonly');
  const store = tx.objectStore(STATUS_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const all = request.result as CardStatus[];
      const deckStatuses: Record<number, CardStatus> = {};
      all.filter(s => s.username === username && s.deckId === deckId).forEach(s => {
        deckStatuses[s.cardId] = s;
      });
      resolve(deckStatuses);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function logStudy(username: string, cardId: number): Promise<void> {
  const db = await initDB();
  const date = new Date().toISOString().split('T')[0];
  const tx = db.transaction(LOGS_STORE, 'readwrite');
  const store = tx.objectStore(LOGS_STORE);

  const request = store.get([username, date]);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const existing = request.result as StudyLog | undefined;
      const cardIds = existing ? [...existing.cardIds] : [];

      if (!cardIds.includes(cardId)) {
        cardIds.push(cardId);
        store.put({ username, date, cardIds });
      }
      tx.oncomplete = () => resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStudyLogs(username: string): Promise<StudyLog[]> {
  const db = await initDB();
  const tx = db.transaction(LOGS_STORE, 'readonly');
  const store = tx.objectStore(LOGS_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const all = request.result as StudyLog[];
      resolve(all.filter(l => l.username === username).sort((a, b) => b.date.localeCompare(a.date)));
    };
    request.onerror = () => reject(request.error);
  });
}

// ... other db functions remain same (loadDecks, saveDecks, etc.)
export async function markCardAsRead(username: string, deckId: number, cardId: number): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(STATUS_STORE, 'readwrite');
  const store = tx.objectStore(STATUS_STORE);
  const getReq = store.get([username, deckId, cardId]);
  return new Promise((resolve, reject) => {
    getReq.onsuccess = () => {
      const existing = getReq.result;
      store.put({
        username,
        deckId,
        cardId,
        status: existing?.status || 'new',
        nextReviewAt: existing?.nextReviewAt
      });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStudiedCardIds(username: string, deckId: number): Promise<number[]> {
  const db = await initDB();
  const tx = db.transaction(STATUS_STORE, 'readonly');
  const store = tx.objectStore(STATUS_STORE);
  const request = store.getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const all = request.result as CardStatus[];
      resolve(all.filter(s => s.username === username && s.deckId === deckId).map(s => s.cardId));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveDecks(username: string, decks: AnkiDeck[]): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(DECKS_STORE, 'readwrite');
  const store = tx.objectStore(DECKS_STORE);
  for (const deck of decks) { store.put({ ...deck, username }); }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDecks(username: string): Promise<AnkiDeck[]> {
  const db = await initDB();
  const tx = db.transaction(DECKS_STORE, 'readonly');
  const store = tx.objectStore(DECKS_STORE);
  const request = store.getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const all = request.result as (AnkiDeck & { username: string })[];
      resolve(all.filter(d => d.username === username));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteDeck(username: string, deckId: number): Promise<void> {
  const db = await initDB();
  const tx = db.transaction([DECKS_STORE, STATUS_STORE, DELETED_ITEMS_STORE], 'readwrite');

  // 1. Delete the deck
  tx.objectStore(DECKS_STORE).delete([username, deckId]);

  // 2. Delete associated statuses
  const statusStore = tx.objectStore(STATUS_STORE);
  const request = statusStore.getAll();
  request.onsuccess = () => {
    const statuses = request.result as CardStatus[];
    statuses.forEach(s => {
      if (s.username === username && s.deckId === deckId) {
        statusStore.delete([username, deckId, s.cardId]);
      }
    });
  };

  // 3. Record tombstone
  tx.objectStore(DELETED_ITEMS_STORE).put({ username, type: 'deck', id: deckId, deletedAt: Date.now() });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}


export async function deleteCard(username: string, deckId: number, cardId: number): Promise<void> {
  const db = await initDB();
  const tx = db.transaction([DECKS_STORE, STATUS_STORE, DELETED_ITEMS_STORE], 'readwrite');

  // 1. Load the deck and remove the card
  const deckStore = tx.objectStore(DECKS_STORE);
  const getDeckRequest = deckStore.get([username, deckId]);

  getDeckRequest.onsuccess = () => {
    const deck = getDeckRequest.result as AnkiDeck;
    if (deck) {
      deck.cards = deck.cards.filter(c => c.id !== cardId);
      deckStore.put({ ...deck, username });
    }
  };

  // 2. Delete the specific status
  tx.objectStore(STATUS_STORE).delete([username, deckId, cardId]);

  // 3. Record tombstone
  tx.objectStore(DELETED_ITEMS_STORE).put({ username, type: 'card', id: cardId, deletedAt: Date.now() });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}


export async function saveSettings(username: string, settings: AISettings): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(SETTINGS_STORE, 'readwrite');
  const store = tx.objectStore(SETTINGS_STORE);
  store.put({ ...settings, username });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSettings(username: string): Promise<AISettings | null> {
  const db = await initDB();
  const tx = db.transaction(SETTINGS_STORE, 'readonly');
  const store = tx.objectStore(SETTINGS_STORE);
  const request = store.get(username);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getFolders(username: string): Promise<BookmarkFolder[]> {
  const db = await initDB();
  const tx = db.transaction(FOLDERS_STORE, 'readonly');
  const store = tx.objectStore(FOLDERS_STORE);
  const request = store.getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const all = request.result as BookmarkFolder[];
      resolve(all.filter(f => f.username === username));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveFolder(folder: BookmarkFolder): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(FOLDERS_STORE, 'readwrite');
  const store = tx.objectStore(FOLDERS_STORE);
  store.put(folder);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteFolder(username: string, folderId: string): Promise<void> {
  const db = await initDB();
  const tx = db.transaction([FOLDERS_STORE, BOOKMARKS_STORE, DELETED_ITEMS_STORE], 'readwrite');

  // 1. Delete folder
  tx.objectStore(FOLDERS_STORE).delete(folderId);

  // 2. Record tombstone
  tx.objectStore(DELETED_ITEMS_STORE).put({ username, type: 'bookmark', id: folderId, deletedAt: Date.now() });

  // 3. Delete child bookmarks
  const bookmarkStore = tx.objectStore(BOOKMARKS_STORE);
  const bookmarksRequest = bookmarkStore.getAll();
  bookmarksRequest.onsuccess = () => {
    const bookmarks = bookmarksRequest.result as Bookmark[];
    bookmarks.filter(b => b.folderId === folderId && b.username === username).forEach(b => {
      bookmarkStore.delete(b.id);
    });
  };

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBookmarks(username: string, folderId?: string): Promise<Bookmark[]> {
  const db = await initDB();
  const tx = db.transaction(BOOKMARKS_STORE, 'readonly');
  const store = tx.objectStore(BOOKMARKS_STORE);
  const request = store.getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const all = request.result as Bookmark[];
      const filtered = all.filter(b => b.username === username && (!folderId || b.folderId === folderId));
      resolve(filtered.sort((a, b) => b.createdAt - a.createdAt));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveBookmark(bookmark: Bookmark): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(BOOKMARKS_STORE, 'readwrite');
  const store = tx.objectStore(BOOKMARKS_STORE);
  store.put(bookmark);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteBookmark(username: string, bookmarkId: string): Promise<void> {
  const db = await initDB();
  const tx = db.transaction([BOOKMARKS_STORE, DELETED_ITEMS_STORE], 'readwrite');

  // 1. Delete bookmark
  tx.objectStore(BOOKMARKS_STORE).delete(bookmarkId);

  // 2. Record tombstone
  tx.objectStore(DELETED_ITEMS_STORE).put({ username, type: 'bookmark', id: bookmarkId, deletedAt: Date.now() });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function markAsDeleted(username: string, type: 'deck' | 'card' | 'bookmark', id: string | number): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(DELETED_ITEMS_STORE, 'readwrite');
  const store = tx.objectStore(DELETED_ITEMS_STORE);
  store.put({ username, type, id, deletedAt: Date.now() });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDeletedItems(username: string): Promise<{ type: string, id: string | number, deletedAt: number }[]> {
  const db = await initDB();
  const tx = db.transaction(DELETED_ITEMS_STORE, 'readonly');
  const store = tx.objectStore(DELETED_ITEMS_STORE);
  const request = store.getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const all = request.result as any[];
      resolve(all.filter(item => item.username === username));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function clearDeletedItems(username: string): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(DELETED_ITEMS_STORE, 'readwrite');
  const store = tx.objectStore(DELETED_ITEMS_STORE);
  const request = store.getAll();
  request.onsuccess = () => {
    const all = request.result as any[];
    all.filter(item => item.username === username).forEach(item => {
      store.delete([username, item.type, item.id]);
    });
  };
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function pruneDeletedItems(username: string, maxAgeDays: number = 30): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(DELETED_ITEMS_STORE, 'readwrite');
  const store = tx.objectStore(DELETED_ITEMS_STORE);
  const request = store.getAll();
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  request.onsuccess = () => {
    const all = request.result as any[];
    all.filter(item => item.username === username && (now - item.deletedAt) > maxAgeMs).forEach(item => {
      store.delete([username, item.type, item.id]);
    });
  };
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

