/**
 * Text search of the pickers. A query matches when every word of it appears in the text; when
 * nothing matches that way, words that start a word of the text with a typo or two also match
 * ("ploriferacion" finds "Proliferación", "lanzallmas" finds "Lanzallamas").
 */

export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, '');
}

export interface SearchIndexEntry<T> {
  item: T;
  /** Normalized text (see `normalizeSearch`). */
  text: string;
}

export function indexForSearch<T>(items: T[], text: (item: T) => string): SearchIndexEntry<T>[] {
  return items.map((item) => ({ item, text: normalizeSearch(text(item)) }));
}

/** Exact matches in their order; if there are none, typo matches from the closest. */
export function searchIndex<T>(index: SearchIndexEntry<T>[], query: string): T[] {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return index.map(({ item }) => item);
  const exact = index.filter(({ text }) => words.every((word) => text.includes(word)));
  if (exact.length > 0) return exact.map(({ item }) => item);
  return index
    .flatMap(({ item, text }) => {
      const tokens = text.split(' ').filter(Boolean);
      let total = 0;
      for (const word of words) {
        const distance = typoDistance(word, tokens);
        if (distance === null) return [];
        total += distance;
      }
      return [{ item, total }];
    })
    .sort((a, b) => a.total - b.total)
    .map(({ item }) => item);
}

/** Typos a word may carry: none if short, one from 4 letters, two from 7. */
function allowedTypos(length: number): number {
  if (length < 4) return 0;
  return length < 7 ? 1 : 2;
}

/**
 * Fewest typos (substitution, insertion, deletion or swap of two adjacent letters) that turn the
 * word into the start of one of the tokens, or null when every token needs more than allowed.
 */
function typoDistance(word: string, tokens: string[]): number | null {
  const allowed = allowedTypos(word.length);
  let best: number | null = null;
  for (const token of tokens) {
    const distance = prefixDistance(word, token);
    if (distance <= allowed && (best === null || distance < best)) best = distance;
  }
  return best;
}

/** Edit distance (with adjacent swaps) between `word` and the closest prefix of `token`. */
function prefixDistance(word: string, token: string): number {
  const n = word.length;
  const m = token.length;
  // row[j]: distance between the word's first i letters and the token's first j.
  let beforePrevious: number[] = [];
  let previous = Array.from({ length: m + 1 }, (_, j) => j);
  const at = (row: number[], j: number) => row[j] ?? Number.POSITIVE_INFINITY;
  for (let i = 1; i <= n; i++) {
    const current = [i];
    for (let j = 1; j <= m; j++) {
      const cost = word[i - 1] === token[j - 1] ? 0 : 1;
      let distance = Math.min(
        at(previous, j) + 1,
        at(current, j - 1) + 1,
        at(previous, j - 1) + cost,
      );
      if (i > 1 && j > 1 && word[i - 1] === token[j - 2] && word[i - 2] === token[j - 1]) {
        distance = Math.min(distance, at(beforePrevious, j - 2) + 1);
      }
      current.push(distance);
    }
    beforePrevious = previous;
    previous = current;
  }
  return Math.min(...previous);
}
