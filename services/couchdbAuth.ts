
const COUCHDB_USERNAME = 'admin';
const COUCHDB_PASSWORD = 'P@55w0rd!';
const COUCHDB_DB_NAME = 'flowcards_users';

/**
 * Get the base URL for CouchDB
 */
function getCouchDBUrl(): string {
  const storedUrl = localStorage.getItem('couchdb_url');
  if (storedUrl) {
    return storedUrl;
  }

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
 * Hash password (simple hash for demo - in production use proper hashing)
 */
function hashPassword(password: string): string {
  // Simple hash function - in production, use bcrypt or similar
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Ensure users database exists
 */
async function ensureUsersDatabaseExists(): Promise<void> {
  const url = getCouchDBUrl();
  const dbUrl = `${url}/${COUCHDB_DB_NAME}`;

  try {
    const checkResponse = await fetch(dbUrl, {
      method: 'HEAD',
      headers: getAuthHeaders()
    });

    if (checkResponse.status === 404) {
      const createResponse = await fetch(dbUrl, {
        method: 'PUT',
        headers: getAuthHeaders()
      });

      if (!createResponse.ok) {
        const error = await createResponse.json().catch(() => ({ reason: 'Unknown error' }));
        throw new Error(`Failed to create users database: ${error.reason || createResponse.statusText}`);
      }
    } else if (!checkResponse.ok && checkResponse.status !== 200) {
      throw new Error(`Database check failed: ${checkResponse.statusText}`);
    }
  } catch (error: any) {
    if (error.message.includes('fetch') || error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      const isCorsError = error.message.includes('CORS') ||
        error.message.includes('Access-Control') ||
        (error.message.includes('fetch') && !error.message.includes('ECONNREFUSED'));

      if (isCorsError) {
        throw new Error('CORS Error: CouchDB is not configured to allow requests. Please configure CORS or use the proxy.');
      }
      throw new Error('Cannot connect to CouchDB. Please check if CouchDB is running and the URL is correct.');
    }
    throw error;
  }
}

/**
 * Register a new user
 */
export async function registerUser(email: string, password: string, fullname: string): Promise<void> {
  await ensureUsersDatabaseExists();

  const url = getCouchDBUrl();
  const emailLower = email.toLowerCase().trim();
  const docId = `user_${emailLower.replace(/[^a-z0-9]/g, '_')}`;
  const docUrl = `${url}/${COUCHDB_DB_NAME}/${docId}`;

  // Check if user already exists
  try {
    const checkResponse = await fetch(docUrl, {
      method: 'GET',
      headers: getAuthHeaders()
    });

    if (checkResponse.ok) {
      throw new Error('User with this email already exists');
    }
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      throw error;
    }
    // User doesn't exist, continue with registration
  }

  const hashedPassword = hashPassword(password);
  const document = {
    _id: docId,
    email: emailLower,
    fullname: fullname.trim(),
    passwordHash: hashedPassword,
    createdAt: new Date().toISOString()
  };

  const response = await fetch(docUrl, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(document)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ reason: response.statusText }));
    throw new Error(`Registration failed: ${error.reason || response.statusText}`);
  }
}

/**
 * Login user
 */
export async function loginUser(email: string, password: string): Promise<{ email: string }> {
  await ensureUsersDatabaseExists();

  const url = getCouchDBUrl();
  const emailLower = email.toLowerCase().trim();
  const docId = `user_${emailLower.replace(/[^a-z0-9]/g, '_')}`;
  const docUrl = `${url}/${COUCHDB_DB_NAME}/${docId}`;

  try {
    const response = await fetch(docUrl, {
      method: 'GET',
      headers: getAuthHeaders()
    });

    if (response.status === 404) {
      throw new Error('Invalid email or password');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ reason: response.statusText }));
      throw new Error(`Login failed: ${error.reason || response.statusText}`);
    }

    const user = await response.json();
    const hashedPassword = hashPassword(password);

    if (user.passwordHash !== hashedPassword) {
      throw new Error('Invalid email or password');
    }

    return { email: user.email };
  } catch (error: any) {
    if (error.message.includes('fetch') || error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      const isCorsError = error.message.includes('CORS') ||
        error.message.includes('Access-Control') ||
        (error.message.includes('fetch') && !error.message.includes('ECONNREFUSED'));

      if (isCorsError) {
        throw new Error('CORS Error: CouchDB is not configured to allow requests. Please configure CORS or use the proxy.');
      }
      throw new Error('Cannot connect to CouchDB. Please check if CouchDB is running.');
    }
    throw error;
  }
}

/**
 * Test CouchDB connection for auth
 */
export async function testAuthConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    await ensureUsersDatabaseExists();
    return { ok: true };
  } catch (error: any) {
    return {
      ok: false,
      error: error.message || 'Cannot connect to CouchDB'
    };
  }
}

