
import { AnkiDeck, AnkiCard } from '../types';

declare const JSZip: any;
declare const initSqlJs: any;

const SQLITE_MAGIC = "SQLite format 3";

async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function parseAnkiFile(file: File): Promise<AnkiDeck[]> {
  try {
    const zip = await JSZip.loadAsync(file);
    let dbData: Uint8Array | null = null;
    let foundFileName = "";

    const fileNames = Object.keys(zip.files);
    const sortedNames = [...fileNames].sort((a, b) => {
      const aIsCol = a.toLowerCase().includes('collection');
      const bIsCol = b.toLowerCase().includes('collection');
      if (aIsCol && !bIsCol) return -1;
      if (!aIsCol && bIsCol) return 1;
      return 0;
    });

    for (const name of sortedNames) {
      const zipEntry = zip.files[name];
      if (zipEntry.dir) continue;
      const content = await zipEntry.async('uint8array');
      const header = new TextDecoder().decode(content.slice(0, 15));
      if (header === SQLITE_MAGIC) {
        dbData = content;
        foundFileName = name;
        break; 
      }
    }

    if (!dbData) {
      throw new Error('Could not find a valid SQLite database inside the package.');
    }

    const mediaMap = new Map<string, string>();
    const mediaFile = zip.file("media");
    if (mediaFile) {
      const mediaJson = JSON.parse(await mediaFile.async("string"));
      for (const [zipName, realName] of Object.entries(mediaJson)) {
        const imageFile = zip.file(zipName);
        if (imageFile) {
          const content = await imageFile.async("blob");
          const dataUrl = await blobToDataURL(content);
          mediaMap.set(realName as string, dataUrl);
        }
      }
    }

    const SQL = await initSqlJs({
      locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
    });
    
    const db = new SQL.Database(dbData);
    const colResult = db.exec("SELECT decks FROM col");
    if (colResult.length === 0) {
      db.close();
      throw new Error('Database "col" table is missing.');
    }
    
    const decksJson = JSON.parse(colResult[0].values[0][0] as string);
    const deckList: AnkiDeck[] = [];

    const processHtml = (html: string) => {
      return html.replace(/src=["'](.*?)["']/g, (match, filename) => {
        const dataUrl = mediaMap.get(filename);
        return dataUrl ? `src="${dataUrl}"` : match;
      });
    };

    for (const deckIdStr in decksJson) {
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

        deckList.push({
          id: deckId,
          name: deck.name,
          cards: cards,
        });
      }
    }

    db.close();
    return deckList;
  } catch (error) {
    console.error('Anki Parsing Error:', error);
    throw error;
  }
}
