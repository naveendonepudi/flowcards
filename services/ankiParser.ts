
import { AnkiDeck, AnkiCard } from '../types';
import { BlobReader, ZipReader, BlobWriter, Uint8ArrayWriter, TextWriter } from '@zip.js/zip.js';
import initSqlJs from 'sql.js';

const SQLITE_MAGIC = "SQLite format 3";

async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function parseAnkiFile(file: File, onProgress?: (stage: string, percent: number, detail?: string) => void, onDeck?: (deck: AnkiDeck) => void | Promise<void>): Promise<AnkiDeck[] | void> {
  let zipReader: any = null;
  try {
    // Prevent out-of-memory crashes by rejecting extremely large packages early
    const MAX_FILE_SIZE = 600 * 1024 * 1024; // 600 MB (supports large exports up to ~500MB)
    if (file.size > MAX_FILE_SIZE) {
      const sizeMb = (file.size / 1024 / 1024).toFixed(1);
      const maxMb = (MAX_FILE_SIZE / 1024 / 1024).toString();
      const msg = `File too large (${sizeMb} MB). Maximum supported import size is ${maxMb} MB. Try splitting your deck in Anki or using a smaller export.`;
      onProgress?.('error', 100, msg);
      throw new Error(msg);
    }

    onProgress?.('parsing', 5, 'Opening archive (streaming)...');

    // Use streaming ZipReader to avoid loading the full archive into memory
    let zipReader: any = null;
    zipReader = new ZipReader(new BlobReader(file));
    let entries = [] as any[];
    try {
      entries = await zipReader.getEntries();
    } catch (e) {
      const msg = `Failed to read ZIP entries: ${(e as Error).message || e}`;
      console.error(msg, e);
      onProgress?.('error', 100, msg);
      try { await zipReader.close(); } catch (_) {}
      throw new Error(msg);
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      const msg = 'ZIP archive contained no entries or could not be listed.';
      console.error(msg);
      onProgress?.('error', 100, msg);
      try { await zipReader.close(); } catch (_) {}
      throw new Error(msg);
    }

    let dbData: Uint8Array | null = null;
    let foundFileName = "";

    // Sort so entries that look like the collection SQLite are first
    const sorted = [...entries].sort((a, b) => {
      const aName = (a.filename || '').toLowerCase();
      const bName = (b.filename || '').toLowerCase();
      const aIsCol = aName.includes('collection');
      const bIsCol = bName.includes('collection');
      if (aIsCol && !bIsCol) return -1;
      if (!aIsCol && bIsCol) return 1;
      return 0;
    });

    // Find the SQLite db entry by name heuristic (collection) and validate header
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      const name = entry.filename || '';
      if (name.endsWith('/')) continue; // directory
      const pct = 5 + Math.round((i / sorted.length) * 20); // 5-25%
      onProgress?.('parsing', pct, `Scanning archive: ${name}`);

      try {
        // Heuristic: prefer entries named like 'collection' (Anki exports typically use 'collection.anki2')
        if (!name.toLowerCase().includes('collection')) continue;

        // Read the entry as a Uint8Array (only for the candidate DB file)
        if (typeof (entry as any).getData !== 'function') {
          console.warn(`Skipping entry ${name}: getData not available.`);
          continue;
        }

        const content = await (entry as any).getData(new Uint8ArrayWriter());
        const header = new TextDecoder().decode(content.slice(0, 15));
        if (header === SQLITE_MAGIC) {
          dbData = content;
          foundFileName = name;
          break;
        }
      } catch (e) {
        // If reading a specific entry fails, skip it and continue scanning
        console.warn(`Failed to read entry ${name}:`, e);
        continue;
      }
    }

    if (!dbData) {
      throw new Error('Could not find a valid SQLite database inside the package.');
    }

    // Map media files (if present), report progress
    onProgress?.('parsing', 50, 'Extracting media...');
    const mediaMap = new Map<string, Blob>();

    // Find "media" mapping entry (text file) in the zip entries
    const mediaEntry = entries.find(e => (e.filename || '') === 'media');
    if (mediaEntry) {
      try {
        const mediaText = await (mediaEntry as any).getData(new TextWriter());
        const mediaJson = JSON.parse(mediaText);
        const entriesArr = Object.entries(mediaJson);
        for (let i = 0; i < entriesArr.length; i++) {
          const [zipName, realName] = entriesArr[i];
          const imageEntry = entries.find(e => (e.filename || '') === zipName);
          if (imageEntry) {
            try {
              if (typeof (imageEntry as any).getData !== 'function') {
                console.warn(`Skipping media entry ${zipName}: getData not available.`);
              } else {
                const blob = await (imageEntry as any).getData(new BlobWriter());
                mediaMap.set(realName as string, blob as Blob);
              }
            } catch (e) {
              console.warn(`Failed to extract media entry ${zipName}:`, e);
            }
          }
          const pct = 50 + Math.round(((i + 1) / entriesArr.length) * 20); // 50-70%
          onProgress?.('parsing', pct, `Processing media (${i + 1}/${entriesArr.length})`);
        }
      } catch (e) {
        console.warn('Failed to parse media map:', e);
      }
    }

    onProgress?.('parsing', 70, 'Initializing SQL engine...');
    // Create a robust locateFile that works with subpaths (GitHub Pages) and local dev
    const locateFile = (file: string) => {
      if (typeof window !== 'undefined' && window.location) {
        try {
          // Use the current document base so both root and subpath deployments resolve correctly
          const base = new URL('.', window.location.href).toString();
          return new URL('sql-wasm.wasm', base).toString();
        } catch (e) {
          // Fallback to absolute origin root
          return `${window.location.origin}/sql-wasm.wasm`;
        }
      }
      return '/sql-wasm.wasm';
    };

    let SQL: any;
    try {
      // Fetch the wasm ourselves so we can (1) validate it's actually a wasm file and (2) pass
      // the binary to initSqlJs which avoids a second fetch that might return HTML.
      const tried: { url: string; ok: boolean; magic?: string; hint?: string }[] = [];
      const candidates = [locateFile('sql-wasm.wasm'), `${window.location.origin}/sql-wasm.wasm`];
      let wasmBuf: ArrayBuffer | null = null;
      const expected = '00 61 73 6d';

      for (const candidate of candidates) {
        try {
          onProgress?.('parsing', 71, `Fetching SQL WASM: ${candidate}`);
          const resp = await fetch(candidate, { method: 'GET' });
          if (!resp.ok) {
            tried.push({ url: candidate, ok: false, hint: `HTTP ${resp.status} ${resp.statusText}` });
            continue;
          }

          const buf = await resp.arrayBuffer();
          const magic = new Uint8Array(buf.slice(0, 4));
          const magicHex = Array.from(magic).map(b => b.toString(16).padStart(2, '0')).join(' ');

          if (magicHex === expected) {
            wasmBuf = buf;
            tried.push({ url: candidate, ok: true, magic: magicHex });
            break;
          } else {
            const bodyText = new TextDecoder().decode(new Uint8Array(buf).slice(0, 120));
            tried.push({ url: candidate, ok: false, magic: magicHex, hint: bodyText.slice(0, 120) });
            // try next candidate
            continue;
          }
        } catch (e: any) {
          tried.push({ url: candidate, ok: false, hint: e.message || String(e) });
          continue;
        }
      }

      if (!wasmBuf) {
        const summary = tried.map(t => `${t.url} -> ${t.ok ? 'OK' : `FAILED (${t.magic || t.hint})`}`).join('; ');
        const firstFail = tried.find(t => !t.ok);
        const msg = `WASM validation failed for all candidates. Tried: ${summary}` + (firstFail && firstFail.magic ? `. First bytes: ${firstFail.magic}. Snippet: ${firstFail.hint}` : '');
        console.error(msg);
        onProgress?.('error', 100, msg);
        throw new Error(msg);
      }

      onProgress?.('parsing', 75, `Initializing SQL engine (wasm OK)`);
      SQL = await initSqlJs({ wasmBinary: new Uint8Array(wasmBuf) });
    } catch (err) {
      console.error('Failed to initialize SQL.js:', err);
      onProgress?.('error', 100, `Failed to initialize SQL.js: ${(err as Error).message || err}`);
      throw err;
    }
    
    const db = new SQL.Database(dbData);
    const colResult = db.exec("SELECT decks FROM col");
    if (colResult.length === 0) {
      db.close();
      throw new Error('Database "col" table is missing.');
    }
    
    const decksJson = JSON.parse(colResult[0].values[0][0] as string);

    const processHtml = (html: string) => {
      return html.replace(/src=["'](.*?)["']/g, (match, filename) => {
        // Replace with a stable token that will later be resolved to a blob URL when rendering
        if (mediaMap.has(filename)) {
          return `src="flowcards-media://${encodeURIComponent(filename)}"`;
        }
        return match;
      });
    };

    const deckKeys = Object.keys(decksJson);
    const deckList: AnkiDeck[] = [];
    for (let i = 0; i < deckKeys.length; i++) {
      const deckIdStr = deckKeys[i];
      const deck = decksJson[deckIdStr];
      const deckId = parseInt(deckIdStr);
      
      const cardsResult = db.exec(`
        SELECT c.id, c.nid, n.flds 
        FROM cards c 
        JOIN notes n ON c.nid = n.id 
        WHERE c.did = ${deckId}
      `);

      if (cardsResult.length > 0) {
        const cards: AnkiCard[] = cardsResult[0].values.map((row: any) => {
          const rawFields = (row[2] as string).split('\x1f'); 
          // Join all fields after the first one as 'back' content
          // Medical decks often have [Front, Back, Extra, First Aid, Sketchy, etc.]
          const front = processHtml(rawFields[0] || '');
          const backParts = rawFields.slice(1).filter(f => f.trim().length > 0);
          const back = processHtml(backParts.join('<div class="my-6 border-t border-slate-50 pt-6"></div>'));
          
          return {
            id: row[0],
            noteId: row[1],
            deckId: deckId,
            ord: 0,
            front,
            back,
          };
        });

        const builtDeck: AnkiDeck = { id: deckId, name: deck.name, cards, ...(mediaMap.size ? { mediaBlobs: Object.fromEntries(mediaMap) } : {}) };
        // If caller provided an onDeck handler, stream the deck out as soon as it's parsed
        if (onDeck) {
          const res = onDeck(builtDeck);
          if (res && typeof (res as Promise<void>).then === 'function') {
            await (res as Promise<void>);
          }
        } else {
          deckList.push(builtDeck);
        }
      }

      const pct = 70 + Math.round(((i + 1) / deckKeys.length) * 25); // 70-95%
      onProgress?.('parsing', pct, `Processing deck ${i + 1}/${deckKeys.length}`);
    }

    db.close();

    onProgress?.('parsing', 100, 'Parsing complete');
    return onDeck ? undefined : deckList;
  } catch (error) {
    console.error('Anki Parsing Error:', error);
    onProgress?.('error', 100, (error as Error).message || 'Parsing error');
    throw error;
  } finally {
    // Ensure the zip reader is closed even on error to free resources
    try { if (zipReader) await zipReader.close(); } catch (e) { /* ignore */ }
  }
}
