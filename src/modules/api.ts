// src/modules/api.ts
import type { AppData, Book, GlossaryItem, Question } from './types';

/**
 * Merges two AppData objects with simple de-duplication:
 * - books deduped by book.id
 * - questions deduped by question.uid
 * - glossary deduped by term (case-insensitive)
 */
function mergeAppData(into: AppData, from: Partial<AppData>): AppData {
  // Merge books (by id), and dedupe questions (by uid)
  const bookMap = new Map<string, Book>();
  for (const b of into.books) bookMap.set(b.id, structuredClone(b));
  for (const b of from.books ?? []) {
    if (!bookMap.has(b.id)) {
      bookMap.set(b.id, structuredClone(b));
    } else {
      // merge sections/questions into existing book
      const existing = bookMap.get(b.id)!;
      const sectionMap = new Map(existing.sections.map(s => [s.id, structuredClone(s)]));
      for (const s of b.sections) {
        if (!sectionMap.has(s.id)) {
          sectionMap.set(s.id, structuredClone(s));
        } else {
          const ex = sectionMap.get(s.id)!;
          const seen = new Set<string>(ex.questions.map(q => q.uid));
          for (const q of s.questions) {
            if (!seen.has(q.uid)) {
              ex.questions.push(q);
              seen.add(q.uid);
            }
          }
          sectionMap.set(s.id, ex);
        }
      }
      existing.sections = Array.from(sectionMap.values());
      bookMap.set(b.id, existing);
    }
  }

  // Merge codebook shallowly
  const codebook = { ...into.codebook, ...(from.codebook ?? {}) };

  // Merge manifest shallowly
  const manifest = { ...into.manifest, ...(from.manifest ?? {}) };

  // Merge glossary (dedupe by term, case-insensitive)
  const glossary: GlossaryItem[] = [];
  const seenTerms = new Set<string>();
  const pushGlossary = (items?: GlossaryItem[]) => {
    if (!items) return; // Add guard for undefined items
    for (const g of items) {
      if (g && g.term) { // Add guard for invalid glossary items
        const key = g.term.trim().toLowerCase();
        if (!seenTerms.has(key)) {
          glossary.push(g);
          seenTerms.add(key);
        }
      }
    }
  };
  pushGlossary(into.glossary);
  pushGlossary(from.glossary);

  return {
    books: Array.from(bookMap.values()),
    codebook,
    manifest,
    glossary
  };
}

/**
 * Fetches JSON data from a URL.
 */
async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      console.error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
      return null;
    }
    // Try to parse JSON, but catch errors
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch (parseErr) {
      console.error(`Failed to parse JSON from ${url}:`, parseErr, `\nResponse text: ${text.substring(0, 100)}...`);
      return null;
    }
  } catch (err) {
    console.error(`Exception while fetching ${url}:`, err);
    return null;
  }
}

/**
 * Type definition for the /public/data/index.json manifest file.
 */
type PublicIndex = { files: string[] };

/**
 * Runtime loader:
 * 1) Fetches /data/index.json (which maps to /public/data/index.json).
 * 2) Fetches all files listed in index.json from the /public/data/ directory.
 * 3) Merges all fetched data into a single AppData object.
 */
export const api = {
  async loadAppData(): Promise<AppData> {
    // Base accumulator
    let merged: AppData = {
      books: [],
      codebook: {},
      manifest: {},
      glossary: []
    };

    // 1) Fetch the manifest file /data/index.json
    const runtimeIndex = await fetchJSON<PublicIndex>('/data/index.json');

    if (!runtimeIndex || !Array.isArray(runtimeIndex.files)) {
      throw new Error(
        'Could not load /data/index.json. Make sure /public/data/index.json exists and is correctly formatted.'
      );
    }

    // 2) Fetch all files listed in the manifest
    for (const name of runtimeIndex.files) {
      // Fetch as unknown first to inspect its structure
      const data = await fetchJSON<unknown>(`/data/${name}`);

      if (!data) {
        console.warn(`Could not load or parse data from /data/${name}.`);
        continue;
      }

      let partialData: Partial<AppData> = {};

      if (Array.isArray(data)) {
        // Case 1: The file is a direct array (assume glossary.json)
        partialData = { glossary: data as GlossaryItem[] };
      } else if (typeof data === 'object' && data !== null && 'id' in data && 'sections' in data) {
        // Case 2: The file is a single Book object (e.g., old_book-1.json)
        partialData = { books: [data as Book] };
      } else if (typeof data === 'object' && data !== null && ('books' in data || 'glossary' in data || 'codebook' in data)) {
        // Case 3: The file is a full AppData object (has root keys)
        partialData = data as Partial<AppData>;
      } else {
        console.warn(`File /data/${name} has an unrecognized format and was skipped.`);
        continue;
      }

      // Merge the identified data
      merged = mergeAppData(merged, partialData);
    }

    // 3) Allow a base file (e.g., for codebook)
    const base = await fetchJSON<Partial<AppData>>('/data/base.json');
    if (base) merged = mergeAppData(merged, base);

    // 4) Check if we actually loaded anything
    if (merged.books.length === 0 && merged.glossary.length === 0) {
      throw new Error(
        'Data load complete, but no books or glossary terms were found. Check your JSON data files in /public/data/.'
      );
    }

    return merged;
  }
};

