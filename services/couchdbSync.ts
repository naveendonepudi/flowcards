
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
export async function uploadSyncData(syncData: SyncData): Promise<void> {
  await ensureDatabaseExists();
  
  const url = getCouchDBUrl();
  // Sanitize email/username for document ID
  const sanitizedId = syncData.username.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const docId = `user_${sanitizedId}`;
  const docUrl = `${url}/${COUCHDB_DB_NAME}/${docId}`;
  
  try {
    // First, try to get existing document to get _rev if it exists
    let rev: string | undefined;
    try {
      const getResponse = await fetch(docUrl, {
        method: 'GET',
        headers: getAuthHeaders()
      });
      
      if (getResponse.ok) {
        const existing = await getResponse.json();
        rev = existing._rev;
      }
    } catch (e) {
      // Document doesn't exist yet, that's fine
    }

    // Prepare document with _rev if updating
    const document: any = {
      _id: docId,
      username: syncData.username,
      syncData: syncData,
      lastSynced: new Date().toISOString()
    };
    
    if (rev) {
      document._rev = rev;
    }

    const response = await fetch(docUrl, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(document)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ reason: response.statusText }));
      throw new Error(`Upload failed: ${error.reason || response.statusText}`);
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
    throw error;
  }
}

/**
 * Download sync data from CouchDB
 */
export async function downloadSyncData(username: string): Promise<SyncData | null> {
  await ensureDatabaseExists();
  
  const url = getCouchDBUrl();
  // Sanitize email/username for document ID
  const sanitizedId = username.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const docId = `user_${sanitizedId}`;
  const docUrl = `${url}/${COUCHDB_DB_NAME}/${docId}`;
  
  try {
    const response = await fetch(docUrl, {
      method: 'GET',
      headers: getAuthHeaders()
    });

    if (response.status === 404) {
      return null; // No data found
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ reason: response.statusText }));
      throw new Error(`Download failed: ${error.reason || response.statusText}`);
    }

    const document = await response.json();
    return document.syncData as SyncData;
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
      const isCorsError = error.message.includes('CORS') || 
                         error.message.includes('Access-Control') ||
                         (error.message.includes('fetch') && !error.message.includes('ECONNREFUSED'));
      
      if (isCorsError) {
        errorMessage = 'CORS Error: CouchDB is not configured to allow requests from this origin. Please configure CORS in CouchDB or use a proxy.';
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
