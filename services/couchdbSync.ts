
import { SyncData } from './syncService';

const COUCHDB_USERNAME = 'admin';
const COUCHDB_PASSWORD = 'P@55w0rd!';
const COUCHDB_DB_NAME = 'flowcards_sync';

/**
 * Get the base URL for CouchDB (defaults to localhost if not configured)
 */
function getCouchDBUrl(): string {
  // Try to get from localStorage or use default
  const storedUrl = localStorage.getItem('couchdb_url');
  if (storedUrl) {
    return storedUrl;
  }

  // In development, try to use Vite proxy if available
  if (import.meta.env.DEV) {
    const useProxy = localStorage.getItem('couchdb_use_proxy') === 'true';
    if (useProxy) {
      return '/couchdb';
    }
  }

  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.protocol === 'http:') {
    return `http://${window.location.hostname}:5984`;
  }

  return 'http://localhost:5984';
}

/**
 * Get authentication headers for CouchDB
 */
function getAuthHeaders(): HeadersInit {
  const credentials = btoa(`${COUCHDB_USERNAME}:${COUCHDB_PASSWORD}`);
  return {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${credentials}`
  };
}

/**
 * Check if database exists, create if it doesn't
 */
export async function ensureDatabaseExists(): Promise<void> {
  const url = getCouchDBUrl();
  const dbUrl = `${url}/${COUCHDB_DB_NAME}`;

  try {
    // Check if database exists
    const checkResponse = await fetch(dbUrl, {
      method: 'HEAD',
      headers: getAuthHeaders()
    });

    if (checkResponse.status === 404) {
      // Database doesn't exist, create it
      const createResponse = await fetch(dbUrl, {
        method: 'PUT',
        headers: getAuthHeaders()
      });

      if (!createResponse.ok) {
        const error = await createResponse.json().catch(() => ({ reason: 'Unknown error' }));
        throw new Error(`Failed to create database: ${error.reason || createResponse.statusText}`);
      }
    } else if (!checkResponse.ok && checkResponse.status !== 200) {
      throw new Error(`Database check failed: ${checkResponse.statusText}`);
    }
  } catch (error: any) {
    if (error.message.includes('fetch') || error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      // Check for Mixed Content (HTTPS -> HTTP)
      if (window.location.protocol === 'https:' && url.startsWith('http:')) {
        throw new Error('Secure Context Error: Cannot connect to insecure CouchDB (HTTP) from GitHub Pages (HTTPS). Please use ngrok to create an HTTPS tunnel or use a secure CouchDB provider.');
      }

      // Check if it's a CORS error
      const isCorsError = error.message.includes('CORS') ||
        error.message.includes('Access-Control') ||
        (error.message.includes('fetch') && !error.message.includes('ECONNREFUSED'));

      if (isCorsError) {
        throw new Error('CORS Error: CouchDB is not configured to allow requests from this origin. Please configure CORS in CouchDB or use a proxy.');
      }
      throw new Error('Cannot connect to CouchDB. Please check if CouchDB is running and the URL is correct.');
    }
    throw error;
  }
}

/**
 * Upload sync data to CouchDB
 */
/**
 * Helper to upload a single document
 */
async function uploadDocument(docId: string, data: any): Promise<void> {
  const url = getCouchDBUrl();
  const docUrl = `${url}/${COUCHDB_DB_NAME}/${docId}`;

  const uploadFn = async () => {
    // Get existing rev and hash
    let rev: string | undefined;
    let existingHash: string | undefined;

    try {
      const getResponse = await fetch(docUrl, {
        method: 'GET',
        headers: getAuthHeaders()
      });
      if (getResponse.ok) {
        const existing = await getResponse.json();
        rev = existing._rev;
        existingHash = existing.contentHash;
      }
    } catch (e) { /* ignore */ }

    // Optimization: Skip upload if content hash matches
    if (existingHash && data.contentHash && existingHash === data.contentHash) {
      console.log(`Skipping unchanged document: ${docId}`);
      return;
    }

    const document = { ...data, _id: docId, _rev: rev };

    // Validate payload size before attempting upload
    const payload = JSON.stringify(document);
    // If payload is significantly larger than TARGET_CHUNK_SIZE, warn
    if (payload.length > TARGET_CHUNK_SIZE * 1.5) {
      console.warn(`Document ${docId} is ${Math.round(payload.length / 1024)}KB, which might exceed server limits.`);
    }

    const response = await fetch(docUrl, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: payload
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Upload failed for ${docId}:`, response.status, response.statusText, errorText);

      // Don't retry on 413 or 400 (client error)
      if (response.status === 413 || response.status === 400) {
        throw new Error(`Upload failed for ${docId}: ${response.statusText} (Permanent Failure)`);
      }

      let errorReason = response.statusText;
      try {
        const errorJson = JSON.parse(errorText);
        errorReason = errorJson.reason || errorJson.error || response.statusText;
      } catch (e) {
        // ignore JSON parse error
      }
      throw new Error(`Upload failed for ${docId}: ${errorReason} (Status: ${response.status})`);
    }
  };

  await withRetry(uploadFn);
}

/**
 * Helper: Compute simple hash for content comparison
 */
function computeHash(str: string): string {
  let hash = 0;
  if (str.length === 0) return hash.toString();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

/**
 * Upload sync data to CouchDB (Split into multiple documents)
 */
// Target size for a single document (200KB for safety)
const TARGET_CHUNK_SIZE = 200 * 1024;
// Absolute Hard Limit (1.5MB) - Cards bigger than this are skipped logic
const HARD_LIMIT_SIZE = 1.5 * 1024 * 1024;

/**
 * Helper: Retry logic
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  let lastError: any;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`Retry ${i + 1}/${retries} failed:`, error);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // Exponential backoff
      }
    }
  }

  throw lastError;
}

/**
 * Helper: Run tasks concurrently with a limit
 */
async function runConcurrent<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const results = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = fn(item);
    results.push(p);
    executing.push(p);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }

    // Remove completed promises
    executing.forEach((p, index) => {
      p.then(() => executing.splice(index, 1), () => executing.splice(index, 1));
    });

    // Simple cleanup: array is mutated in place, but Promise.race might not return the executed promise directly easily
    // So usually a cleaner way is:
  }
  return Promise.all(results).then(() => { });
}

// Easier concurrent implementation
async function runConcurrentSimple<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const chunks = [];
  for (let i = 0; i < items.length; i += limit) {
    chunks.push(items.slice(i, i + limit));
  }

  for (const chunk of chunks) {
    await Promise.all(chunk.map(fn));
  }
}



/**
 * Upload sync data to CouchDB (Split into multiple documents)
 */
export async function uploadSyncData(syncData: SyncData): Promise<void> {
  await ensureDatabaseExists();

  const sanitizedUsername = syncData.username.toLowerCase().replace(/[^a-z0-9]/g, '_');

  // 1. Upload each deck as a separate document (or chunks if too large)
  const deckIds: number[] = [];

  // Process decks concurrently (limit 5) to speed up upload
  // deckIds must be collected in a thread-safe way (push is sync in JS)
  await runConcurrentSimple(syncData.decks, 5, async (deck) => {
    deckIds.push(deck.id);
    const deckDocId = `deck_${sanitizedUsername}_${deck.id}`;

    // Check size estimation
    const deckJson = JSON.stringify(deck);

    if (deckJson.length < TARGET_CHUNK_SIZE) {
      // Small enough, upload as single document
      await uploadDocument(deckDocId, {
        username: syncData.username,
        type: 'deck',
        deck: deck,
        updatedAt: new Date().toISOString(),
        contentHash: computeHash(deckJson)
      });
    } else {
      // Too large, split into chunks using greedy size-aware logic
      console.log(`Deck ${deck.id} is too large (${(deckJson.length / 1024 / 1024).toFixed(2)}MB). Splitting...`);

      const chunkIds: string[] = [];
      let currentChunkCards: any[] = [];
      let currentChunkSize = 0;
      let chunkIndex = 0;

      const uploadChunk = async () => {
        if (currentChunkCards.length === 0) return;

        const chunkId = `deck_chunk_${sanitizedUsername}_${deck.id}_${chunkIndex}`;
        chunkIds.push(chunkId);

        await uploadDocument(chunkId, {
          username: syncData.username,
          type: 'deck_chunk',
          cards: currentChunkCards,
          index: chunkIndex,
          deckId: deck.id,
          contentHash: computeHash(JSON.stringify(currentChunkCards))
        });

        chunkIndex++;
        currentChunkCards = [];
        currentChunkSize = 0;
      };

      for (const card of deck.cards) {
        // Precise byte measurement
        const cardString = JSON.stringify(card);
        const cardSize = new TextEncoder().encode(cardString).length + 2; // +2 for comma/space overhead

        // 1. HARD LIMIT CHECK: If card allows is bigger than what we can ever upload, skip it
        if (cardSize > HARD_LIMIT_SIZE) {
          console.warn(`Skipping massive card ${card.id} (${(cardSize / 1024 / 1024).toFixed(2)}MB). Exceeds server hard limit.`);
          continue;
        }

        // 2. CHUNK LIMIT CHECK: If adding this card exceeds the max size, upload current chunk first
        // Reserve 10KB safely for document wrapper overhead
        if (currentChunkSize + cardSize > TARGET_CHUNK_SIZE && currentChunkCards.length > 0) {
          await uploadChunk();
        }

        currentChunkCards.push(card);
        currentChunkSize += cardSize;
      }

      // Upload remaining cards
      if (currentChunkCards.length > 0) {
        await uploadChunk();
      }

      // Upload master deck document with empty cards array but referencing chunks
      await uploadDocument(deckDocId, {
        username: syncData.username,
        type: 'deck',
        deck: { ...deck, cards: [] }, // Empty cards
        chunkIds: chunkIds,
        isChunked: true,
        totalCards: deck.cards.length,
        updatedAt: new Date().toISOString(),
        contentHash: computeHash(JSON.stringify({ chunkIds, deckId: deck.id }))
      });
    }
  });

  // 2. Upload manifest document with the rest of the data
  const manifestId = `user_${sanitizedUsername}`;
  const manifestData = {
    username: syncData.username,
    type: 'manifest',
    version: 2,
    syncTimestamp: syncData.syncTimestamp,
    settings: syncData.settings,
    studyLogs: syncData.studyLogs,
    cardStatuses: syncData.cardStatuses,
    bookmarkFolders: syncData.bookmarkFolders,
    bookmarks: syncData.bookmarks,
    deckIds: deckIds,
    lastSynced: new Date().toISOString()
  };

  // Hash the manifest content (excluding volatile fields if any)
  const manifestHash = computeHash(JSON.stringify(manifestData));

  await uploadDocument(manifestId, {
    ...manifestData,
    contentHash: manifestHash
  });
}

/**
 * Download sync data from CouchDB
 */
/**
 * Helper to download a single document
 */
async function downloadDocument(docId: string): Promise<any> {
  const url = getCouchDBUrl();
  const docUrl = `${url}/${COUCHDB_DB_NAME}/${docId}`;

  const response = await fetch(docUrl, {
    method: 'GET',
    headers: getAuthHeaders()
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ reason: response.statusText }));
    throw new Error(`Download failed for ${docId}: ${error.reason || response.statusText}`);
  }

  return await response.json();
}

/**
 * Download sync data from CouchDB
 */
export async function downloadSyncData(username: string): Promise<SyncData | null> {
  await ensureDatabaseExists();

  const sanitizedId = username.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const manifestId = `user_${sanitizedId}`;

  try {
    const manifest = await downloadDocument(manifestId);

    if (!manifest) {
      return null;
    }

    // Check if new format (v2) or old format (v1)
    if (manifest.version === 2 && manifest.type === 'manifest') {
      // New format: download linked decks
      const deckIds = manifest.deckIds || [];
      const deckPromises = deckIds.map((id: number) =>
        downloadDocument(`deck_${sanitizedId}_${id}`)
      );

      const deckDocs = await Promise.all(deckPromises);
      const decks = deckDocs.filter(d => d && d.type === 'deck').map(d => d.deck);

      return {
        username: manifest.username,
        decks: await Promise.all(deckDocs.map(async d => {
          if (!d) return null;
          if (d.type === 'deck') {
            if (d.isChunked && d.chunkIds) {
              // It's a chunked deck, download parts
              const chunks = await Promise.all(d.chunkIds.map((cid: string) => downloadDocument(cid)));
              const allCards = chunks.flatMap(c => c.cards);
              return { ...d.deck, cards: allCards };
            } else {
              return d.deck;
            }
          }
          return null;
        })).then(decks => decks.filter(d => d !== null)),
        settings: manifest.settings,
        studyLogs: manifest.studyLogs,
        cardStatuses: manifest.cardStatuses,
        bookmarkFolders: manifest.bookmarkFolders,
        bookmarks: manifest.bookmarks,
        syncTimestamp: manifest.syncTimestamp
      } as SyncData;
    } else {
      // Old format: contains syncData directly
      return manifest.syncData as SyncData;
    }
  } catch (error: any) {
    if (error.message.includes('fetch') || error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      const isCorsError = error.message.includes('CORS') ||
        error.message.includes('Access-Control') ||
        (error.message.includes('fetch') && !error.message.includes('ECONNREFUSED'));

      if (isCorsError) {
        throw new Error('CORS Error: CouchDB is not configured to allow requests from this origin. Please configure CORS in CouchDB or use a proxy.');
      }
      throw new Error('Cannot connect to CouchDB. Please check if CouchDB is running.');
    }
    if (error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

/**
 * Test CouchDB connection
 */
export async function testConnection(couchdbUrl?: string): Promise<{ ok: boolean; error?: string }> {
  const url = couchdbUrl || getCouchDBUrl();

  try {
    const response = await fetch(`${url}/_up`, {
      method: 'GET',
      headers: getAuthHeaders()
    });

    if (response.ok) {
      return { ok: true };
    } else {
      return { ok: false, error: `CouchDB returned status ${response.status}` };
    }
  } catch (error: any) {
    let errorMessage = error.message || 'Cannot connect to CouchDB. Please check if CouchDB is running and the URL is correct.';

    // Detect CORS errors
    if (error.message.includes('fetch') || error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      // Check for Mixed Content (HTTPS -> HTTP)
      if (window.location.protocol === 'https:' && url.startsWith('http:')) {
        errorMessage = 'Secure Context Error: Cannot connect to insecure CouchDB (HTTP) from GitHub Pages (HTTPS). Please use ngrok to create an HTTPS tunnel or use a secure CouchDB provider.';
      } else {
        const isCorsError = error.message.includes('CORS') ||
          error.message.includes('Access-Control') ||
          (error.message.includes('fetch') && !error.message.includes('ECONNREFUSED'));

        if (isCorsError) {
          errorMessage = 'CORS Error: CouchDB is not configured to allow requests from this origin. Please configure CORS in CouchDB or use a proxy.';
        }
      }
    }

    return {
      ok: false,
      error: errorMessage
    };
  }
}

/**
 * Set CouchDB URL (store in localStorage)
 */
export function setCouchDBUrl(url: string): void {
  localStorage.setItem('couchdb_url', url);
}

/**
 * Get CouchDB URL
 */
export function getCouchDBUrlFromStorage(): string {
  return localStorage.getItem('couchdb_url') || 'http://localhost:5984';
}
