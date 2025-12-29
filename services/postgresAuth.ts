
import { AISettings, AnkiDeck } from '../types';

export interface PostgresConfig {
  user: string;
  pass: string;
  host: string;
  port: string;
  database: string;
}

export class PostgresAuthService {
  static parseConnectionString(connectionString: string): PostgresConfig | null {
    try {
      const trimmed = connectionString.trim();
      const uriRegex = /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/;
      const uriMatch = trimmed.match(uriRegex);
      if (uriMatch) {
        return { user: uriMatch[1], pass: uriMatch[2], host: uriMatch[3], port: uriMatch[4], database: uriMatch[5] };
      }
      if (trimmed.includes(';') && trimmed.includes('=')) {
        const pairs = trimmed.split(';').reduce((acc: any, curr) => {
          const parts = curr.split('=');
          if (parts.length === 2) acc[parts[0].trim().toLowerCase()] = parts[1].trim();
          return acc;
        }, {});
        if (pairs.host && (pairs.username || pairs.user) && (pairs.password || pairs.pass)) {
          return { host: pairs.host, user: pairs.username || pairs.user, pass: pairs.password || pairs.pass, port: pairs.port || '5432', database: pairs.database || pairs.db || 'postgres' };
        }
      }
      return null;
    } catch (e) { return null; }
  }

  // Use optional chaining for dbConfig to prevent "does not exist" errors
  private static getHeaders(settings: AISettings) {
    return {
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      'Authorization': `Basic ${btoa(`${settings.dbConfig?.user || ''}:${settings.dbConfig?.pass || ''}`)}`
    };
  }

  static async testConnection(settings: AISettings): Promise<{ ok: boolean; error?: string; isDirectPort?: boolean }> {
    const url = settings.dbConfig?.url?.trim();
    if (!url) return { ok: false, error: "Bridge URL is required." };
    if (url.includes(':5432')) return { ok: false, error: "Direct Port 5432 detected. Use REST Bridge (Port 3000).", isDirectPort: true };
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${url.replace(/\/$/, '')}/users?limit=1`, {
        method: 'GET',
        headers: this.getHeaders(settings),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) return { ok: false, error: `Bridge error ${response.status}` };
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: "Network Error: Bridge unreachable." };
    }
  }

  static async signup(username: string, pass: string, fullName: string, settings: AISettings): Promise<void> {
    if (!settings.dbConfig?.url) throw new Error("Bridge URL is required.");
    const response = await fetch(`${settings.dbConfig.url}/users`, {
      method: 'POST',
      headers: this.getHeaders(settings),
      body: JSON.stringify({ username, password: pass, full_name: fullName })
    });
    if (!response.ok) throw new Error("Registration failed.");
  }

  static async login(username: string, pass: string, settings: AISettings): Promise<boolean> {
    if (!settings.dbConfig?.url) return false;
    const response = await fetch(`${settings.dbConfig.url}/users?username=eq.${username}&password=eq.${pass}`, {
      method: 'GET',
      headers: this.getHeaders(settings)
    });
    if (!response.ok) return false;
    const users = await response.json();
    return users.length > 0;
  }

  // Decks Synchronization
  static async loadDecks(username: string, settings: AISettings): Promise<AnkiDeck[]> {
    if (!settings.dbConfig?.url) return [];
    const response = await fetch(`${settings.dbConfig.url}/decks?username=eq.${username}`, {
      method: 'GET',
      headers: this.getHeaders(settings)
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.map((d: any) => ({ id: d.id, name: d.name, cards: d.cards }));
  }

  static async saveDecks(username: string, decks: AnkiDeck[], settings: AISettings): Promise<void> {
    if (!settings.dbConfig?.url) return;
    // PostgREST upsert logic
    for (const deck of decks) {
      await fetch(`${settings.dbConfig.url}/decks`, {
        method: 'POST',
        headers: { ...this.getHeaders(settings), 'Resolution': 'merge-duplicates' },
        body: JSON.stringify({ id: deck.id, username, name: deck.name, cards: deck.cards })
      });
    }
  }

  static async deleteDeck(username: string, deckId: number, settings: AISettings): Promise<void> {
    if (!settings.dbConfig?.url) return;
    await fetch(`${settings.dbConfig.url}/decks?username=eq.${username}&id=eq.${deckId}`, {
      method: 'DELETE',
      headers: this.getHeaders(settings)
    });
  }

  // Settings Synchronization
  static async loadAppSettings(username: string, settings: AISettings): Promise<Partial<AISettings> | null> {
    if (!settings.dbConfig?.url) return null;
    const response = await fetch(`${settings.dbConfig.url}/settings?username=eq.${username}`, {
      method: 'GET',
      headers: this.getHeaders(settings)
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.length > 0 ? data[0].config : null;
  }

  static async saveAppSettings(username: string, config: any, settings: AISettings): Promise<void> {
    if (!settings.dbConfig?.url) return;
    await fetch(`${settings.dbConfig.url}/settings`, {
      method: 'POST',
      headers: { ...this.getHeaders(settings), 'Resolution': 'merge-duplicates' },
      body: JSON.stringify({ username, config })
    });
  }
}