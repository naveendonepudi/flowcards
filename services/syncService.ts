
import * as dbService from './db';
import { AnkiDeck, AISettings, StudyLog, CardStatus, BookmarkFolder, Bookmark } from '../types';

export interface SyncData {
  decks: AnkiDeck[];
  settings: AISettings | null;
  studyLogs: StudyLog[];
  cardStatuses: CardStatus[];
  bookmarkFolders: BookmarkFolder[];
  bookmarks: Bookmark[];
  syncTimestamp: number;
  username: string;
}

/**
 * Export all user data from IndexedDB to a syncable format
 */
export async function exportUserData(username: string): Promise<SyncData> {
  const [decks, settings, studyLogs, cardStatuses, folders, bookmarks] = await Promise.all([
    dbService.loadDecks(username),
    dbService.loadSettings(username),
    dbService.getStudyLogs(username),
    getAllCardStatuses(username),
    dbService.getFolders(username),
    dbService.getBookmarks(username)
  ]);

  console.log(`Exporting: ${decks.length} decks, ${cardStatuses.length} card statuses`);

  return {
    decks,
    settings,
    studyLogs,
    cardStatuses,
    bookmarkFolders: folders,
    bookmarks,
    syncTimestamp: Date.now(),
    username
  };
}

/**
 * Get all card statuses for a user
 */
async function getAllCardStatuses(username: string): Promise<CardStatus[]> {
  const db = await dbService.initDB();
  const tx = db.transaction('card_status', 'readonly');
  const store = tx.objectStore('card_status');
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const all = request.result as CardStatus[];
      resolve(all.filter(s => s.username === username));
    };
    request.onerror = () => reject(request.error);
  });
}

// Re-export initDB for use in this module
const initDB = dbService.initDB;

/**
 * Import user data and merge with existing data intelligently
 */
export async function importUserData(syncData: SyncData, mergeStrategy: 'replace' | 'merge' = 'merge'): Promise<void> {
  const username = syncData.username;

  if (mergeStrategy === 'replace') {
    // Replace all data
    await dbService.saveDecks(username, syncData.decks);
    if (syncData.settings) {
      await dbService.saveSettings(username, syncData.settings);
    }
    await replaceStudyLogs(username, syncData.studyLogs);
    await replaceCardStatuses(username, syncData.cardStatuses);
    await replaceBookmarkFolders(syncData.bookmarkFolders);
    await replaceBookmarks(syncData.bookmarks);
  } else {
    // Merge strategy: keep latest timestamps and merge data
    const existingDecks = await dbService.loadDecks(username);
    const mergedDecks = mergeDecks(existingDecks, syncData.decks);
    await dbService.saveDecks(username, mergedDecks);

    if (syncData.settings) {
      const existingSettings = await dbService.loadSettings(username);
      const mergedSettings = existingSettings
        ? { ...existingSettings, ...syncData.settings }
        : syncData.settings;
      await dbService.saveSettings(username, mergedSettings);
    }

    await mergeStudyLogs(username, syncData.studyLogs);
    await mergeCardStatuses(username, syncData.cardStatuses);
    await mergeBookmarkFolders(syncData.bookmarkFolders);
    await mergeBookmarks(syncData.bookmarks);
  }
}

/**
 * Merge decks: combine cards from both sources, prefer newer data
 */
function mergeDecks(existing: AnkiDeck[], incoming: AnkiDeck[]): AnkiDeck[] {
  const deckMap = new Map<number, AnkiDeck>();

  // Add existing decks
  existing.forEach(deck => {
    deckMap.set(deck.id, { ...deck });
  });

  // Merge incoming decks
  incoming.forEach(incomingDeck => {
    const existingDeck = deckMap.get(incomingDeck.id);
    if (existingDeck) {
      // Merge cards: combine unique cards by ID
      const cardMap = new Map<number, typeof incomingDeck.cards[0]>();
      existingDeck.cards.forEach(card => cardMap.set(card.id, card));
      incomingDeck.cards.forEach(card => cardMap.set(card.id, card));
      existingDeck.cards = Array.from(cardMap.values());
      // Update name if different (prefer incoming)
      if (incomingDeck.name !== existingDeck.name) {
        existingDeck.name = incomingDeck.name;
      }
    } else {
      deckMap.set(incomingDeck.id, { ...incomingDeck });
    }
  });

  return Array.from(deckMap.values());
}

/**
 * Replace study logs
 */
async function replaceStudyLogs(username: string, logs: StudyLog[]): Promise<void> {
  const db = await dbService.initDB();
  const tx = db.transaction('study_logs', 'readwrite');
  const store = tx.objectStore('study_logs');

  // Delete existing logs for this user
  const getAllRequest = store.getAll();
  await new Promise<void>((resolve, reject) => {
    getAllRequest.onsuccess = () => {
      const all = getAllRequest.result as StudyLog[];
      all.filter(l => l.username === username).forEach(log => {
        store.delete([log.username, log.date]);
      });
      resolve();
    };
    getAllRequest.onerror = () => reject(getAllRequest.error);
  });

  // Add new logs
  logs.forEach(log => store.put(log));

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Merge study logs: combine cardIds arrays
 */
async function mergeStudyLogs(username: string, logs: StudyLog[]): Promise<void> {
  const existingLogs = await dbService.getStudyLogs(username);
  const logMap = new Map<string, StudyLog>();

  existingLogs.forEach(log => logMap.set(log.date, log));

  logs.forEach(log => {
    const existing = logMap.get(log.date);
    if (existing) {
      // Merge cardIds
      const combinedIds = [...new Set([...existing.cardIds, ...log.cardIds])];
      logMap.set(log.date, { ...existing, cardIds: combinedIds });
    } else {
      logMap.set(log.date, log);
    }
  });

  await replaceStudyLogs(username, Array.from(logMap.values()));
}

/**
 * Replace card statuses
 */
async function replaceCardStatuses(username: string, statuses: CardStatus[]): Promise<void> {
  const db = await dbService.initDB();
  const tx = db.transaction('card_status', 'readwrite');
  const store = tx.objectStore('card_status');

  // Delete existing statuses for this user
  const getAllRequest = store.getAll();
  await new Promise<void>((resolve, reject) => {
    getAllRequest.onsuccess = () => {
      const all = getAllRequest.result as CardStatus[];
      all.filter(s => s.username === username).forEach(status => {
        store.delete([status.username, status.deckId, status.cardId]);
      });
      resolve();
    };
    getAllRequest.onerror = () => reject(getAllRequest.error);
  });

  // Add new statuses
  statuses.forEach(status => store.put(status));

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Merge card statuses: prefer status with later nextReviewAt
 */
async function mergeCardStatuses(username: string, statuses: CardStatus[]): Promise<void> {
  const existingStatuses = await getAllCardStatuses(username);
  const statusMap = new Map<string, CardStatus>();

  existingStatuses.forEach(status => {
    const key = `${status.deckId}-${status.cardId}`;
    statusMap.set(key, status);
  });

  statuses.forEach(status => {
    const key = `${status.deckId}-${status.cardId}`;
    const existing = statusMap.get(key);
    if (existing) {
      // Prefer status with later nextReviewAt, or if both are undefined, keep existing
      if (status.nextReviewAt !== undefined && existing.nextReviewAt !== undefined) {
        statusMap.set(key, status.nextReviewAt > existing.nextReviewAt ? status : existing);
      } else if (status.nextReviewAt !== undefined) {
        statusMap.set(key, status);
      } else if (existing.nextReviewAt !== undefined) {
        statusMap.set(key, existing);
      } else {
        // Both undefined, prefer 'completed' over 'new'
        statusMap.set(key, status.status === 'completed' ? status : existing);
      }
    } else {
      statusMap.set(key, status);
    }
  });

  await replaceCardStatuses(username, Array.from(statusMap.values()));
}

/**
 * Replace bookmark folders
 */
async function replaceBookmarkFolders(folders: BookmarkFolder[]): Promise<void> {
  if (folders.length === 0) return;
  const username = folders[0].username;
  const db = await dbService.initDB();
  const tx = db.transaction('bookmark_folders', 'readwrite');
  const store = tx.objectStore('bookmark_folders');

  // Delete existing folders for this user only
  const existingFolders = await dbService.getFolders(username);
  existingFolders.forEach(folder => store.delete(folder.id));

  // Add new folders
  folders.forEach(folder => store.put(folder));

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Merge bookmark folders
 */
async function mergeBookmarkFolders(folders: BookmarkFolder[]): Promise<void> {
  if (folders.length === 0) return;
  const username = folders[0].username;
  const existingFolders = await dbService.getFolders(username);
  const folderMap = new Map<string, BookmarkFolder>();

  existingFolders.forEach(folder => folderMap.set(folder.id, folder));
  folders.forEach(folder => folderMap.set(folder.id, folder));

  await replaceBookmarkFolders(Array.from(folderMap.values()));
}

/**
 * Replace bookmarks
 */
async function replaceBookmarks(bookmarks: Bookmark[]): Promise<void> {
  if (bookmarks.length === 0) return;
  const username = bookmarks[0].username;
  const db = await dbService.initDB();
  const tx = db.transaction('bookmarks', 'readwrite');
  const store = tx.objectStore('bookmarks');

  // Delete existing bookmarks for this user only
  const existingBookmarks = await dbService.getBookmarks(username);
  existingBookmarks.forEach(bookmark => store.delete(bookmark.id));

  // Add new bookmarks
  bookmarks.forEach(bookmark => store.put(bookmark));

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Merge bookmarks: prefer newer bookmarks by createdAt
 */
async function mergeBookmarks(bookmarks: Bookmark[]): Promise<void> {
  if (bookmarks.length === 0) return;
  const username = bookmarks[0].username;
  const existingBookmarks = await dbService.getBookmarks(username);
  const bookmarkMap = new Map<string, Bookmark>();

  existingBookmarks.forEach(bookmark => bookmarkMap.set(bookmark.id, bookmark));

  bookmarks.forEach(bookmark => {
    const existing = bookmarkMap.get(bookmark.id);
    if (existing) {
      // Prefer newer bookmark
      bookmarkMap.set(bookmark.id, bookmark.createdAt > existing.createdAt ? bookmark : existing);
    } else {
      bookmarkMap.set(bookmark.id, bookmark);
    }
  });

  await replaceBookmarks(Array.from(bookmarkMap.values()));
}

/**
 * Upload sync data to cloud storage (CouchDB)
 */
export async function uploadToCloud(syncData: SyncData, cloudUrl?: string): Promise<void> {
  // Import CouchDB sync functions
  const { uploadSyncData } = await import('./couchdbSync');
  await uploadSyncData(syncData);
}

/**
 * Download sync data from cloud storage (CouchDB)
 */
export async function downloadFromCloud(username: string, cloudUrl?: string): Promise<SyncData | null> {
  // Import CouchDB sync functions
  const { downloadSyncData } = await import('./couchdbSync');
  return await downloadSyncData(username);
}

/**
 * Export data as JSON file for manual backup/transfer
 */
export function exportToFile(syncData: SyncData): void {
  const json = JSON.stringify(syncData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flowcards-sync-${syncData.username}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import data from JSON file
 */
export function importFromFile(file: File): Promise<SyncData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as SyncData;
        resolve(data);
      } catch (err) {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

