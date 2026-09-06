/**
 * Syntax highlighting wrapper.
 *
 * Uses the built-in highlightCode from pi-coding-agent which handles
 * shiki lazy-loading internally. Falls back to plain text if unavailable.
 */

import { highlightCode, getLanguageFromPath } from "@earendil-works/pi-coding-agent";

const cache = new Map<string, string[]>();
const CACHE_MAX = 256;

function cacheKey(code: string, lang: string): string {
  return `${lang}\0${code.length}\0${code.slice(0, 100)}`;
}

/**
 * Highlight code lines. Returns an array of highlighted lines.
 * Uses pi-coding-agent's built-in highlighter with caching.
 */
export function highlightLines(code: string, lang?: string): string[] {
  const key = cacheKey(code, lang ?? "");
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const lines = highlightCode(code, lang);

    // Manage cache size
    if (cache.size >= CACHE_MAX) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    cache.set(key, lines);

    return lines;
  } catch {
    return code.split("\n");
  }
}

/**
 * Get language from file path.
 */
export { getLanguageFromPath };

/** Clear the highlighter cache. */
export function clearHighlightCache(): void {
  cache.clear();
}
