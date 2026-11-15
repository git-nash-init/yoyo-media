// Small fuzzy-matching helpers behind the search page's "Did you mean …" suggestion.
// Pure functions: no prisma / server-only imports, so they are unit-testable.

/** Lower-case, strip accents and punctuation, collapse whitespace. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Classic Levenshtein edit distance (two-row dynamic programme). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

function trigrams(s: string): Map<string, number> {
  const padded = `  ${s} `;
  const out = new Map<string, number>();
  for (let i = 0; i < padded.length - 2; i++) {
    const g = padded.slice(i, i + 3);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Dice coefficient over character trigrams, 0 (nothing shared) … 1 (identical). */
export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let shared = 0;
  let sizeA = 0;
  let sizeB = 0;
  for (const n of ta.values()) sizeA += n;
  for (const n of tb.values()) sizeB += n;
  for (const [g, n] of ta) shared += Math.min(n, tb.get(g) ?? 0);
  return (2 * shared) / (sizeA + sizeB);
}

/** Combined similarity of two already-normalised strings: the better of edit-distance ratio and trigram overlap. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const edit = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return Math.max(edit, trigramSimilarity(a, b));
}

/** How many typos we forgive in a single word of the given length. */
function maxWordDistance(len: number): number {
  if (len <= 2) return 0;
  if (len <= 4) return 1;
  if (len <= 8) return 2;
  return 3;
}

const PHRASE_THRESHOLD = 0.55;
const EDGE_PUNCT = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * Suggest a corrected search for a query that returned nothing.
 *
 * 1. Whole phrase: the known title/name most similar to the query, if it is close enough.
 * 2. Word by word: replace each misspelt word with the nearest word used in any known
 *    title/name, so a query can be repaired even when no single title matches it.
 *
 * Returns the suggestion in its original casing, or null when nothing is close
 * (or the only match is the query itself).
 */
export function didYouMean(query: string, candidates: readonly string[]): string | null {
  const q = normalize(query);
  if (q.length < 2) return null;

  let best: string | null = null;
  let bestScore = 0;
  const seen = new Set<string>();
  const vocab = new Map<string, string>(); // normalised word → original word

  for (const original of candidates) {
    const c = normalize(original);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    for (const w of original.trim().split(/\s+/)) {
      const nw = normalize(w);
      if (nw && !nw.includes(" ") && !vocab.has(nw)) vocab.set(nw, w.replace(EDGE_PUNCT, ""));
    }
    if (c === q) continue;
    const score = similarity(q, c);
    if (score > bestScore) {
      bestScore = score;
      best = original.trim();
    }
  }
  if (best && bestScore >= PHRASE_THRESHOLD) return best;

  // Word-by-word correction
  let changed = false;
  const fixed: string[] = [];
  for (const w of q.split(" ")) {
    const exact = vocab.get(w);
    if (exact) {
      fixed.push(exact);
      continue;
    }
    const limit = maxWordDistance(w.length);
    let bestWord: string | null = null;
    let bestDist = limit + 1;
    for (const [nw, orig] of vocab) {
      if (Math.abs(nw.length - w.length) > limit) continue;
      const d = levenshtein(w, nw);
      if (d < bestDist) {
        bestDist = d;
        bestWord = orig;
      }
    }
    if (!bestWord) return null; // a word we cannot place: no honest suggestion
    fixed.push(bestWord);
    changed = true;
  }
  if (!changed) return null;
  const suggestion = fixed.join(" ");
  return normalize(suggestion) === q ? null : suggestion;
}
