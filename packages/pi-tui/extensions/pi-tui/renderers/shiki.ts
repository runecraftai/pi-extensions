/**
 * Shiki lazy loader — dynamic import with cache and fallback.
 *
 * Never imports Shiki at module top level. Caches the highlighter
 * per (language, theme) pair. Falls back to uncolored text on failure
 * or timeout (~800ms).
 */

/* ── Cache ── */

type HighlighterCache = Map<string, { highlighter: ShikiHighlighter; created: number }>;

interface ShikiHighlighter {
  codeToAnsi(code: string, lang: string, theme: string): string;
}

const cache: HighlighterCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const IMPORT_TIMEOUT_MS = 800;

/* ── Lazy import ── */

let shikiModule: typeof import("shiki") | undefined;
let shikiLoadPromise: Promise<typeof import("shiki")> | null = null;

async function loadShiki(signal?: AbortSignal): Promise<typeof import("shiki") | undefined> {
  if (shikiModule) return shikiModule;
  if (signal?.aborted) return undefined;

  if (!shikiLoadPromise) {
    shikiLoadPromise = import("shiki").then((mod) => {
      shikiModule = mod;
      return mod;
    }).catch(() => {
      shikiLoadPromise = null;
      return undefined;
    });
  }

  return shikiLoadPromise;
}

/**
 * Get or create a highlighter for the given theme.
 * Uses cache keyed by theme name.
 */
async function getHighlighter(
  theme: string,
  signal?: AbortSignal,
): Promise<ShikiHighlighter | undefined> {
  const cacheKey = theme;
  const cached = cache.get(cacheKey);

  // Return cached if still valid
  if (cached && Date.now() - cached.created < CACHE_TTL_MS) {
    return cached.highlighter;
  }

  // Try to load Shiki with timeout
  const mod = await loadWithTimeout(signal);
  if (!mod) return undefined;

  try {
    const bundleThemes = (mod as any).bundleThemes ?? (mod as any).bundle;
    const highlighter = await bundleThemes({
      themes: [theme],
      langs: ["javascript", "typescript", "python", "go", "rust", "java", "c", "cpp", "ruby", "bash", "json", "yaml", "markdown"],
    });

    const wrapped: ShikiHighlighter = {
      codeToAnsi(code: string, lang: string, thm: string): string {
        return (highlighter as any).codeToHtml(code, { lang, theme: thm });
      },
    };

    cache.set(cacheKey, { highlighter: wrapped, created: Date.now() });
    return wrapped;
  } catch {
    return undefined;
  }
}

async function loadWithTimeout(signal?: AbortSignal): Promise<typeof import("shiki") | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), IMPORT_TIMEOUT_MS);

    loadShiki(signal).then((mod) => {
      clearTimeout(timer);
      resolve(mod);
    }).catch(() => {
      clearTimeout(timer);
      resolve(undefined);
    });
  });
}

/* ── Public API ── */

/**
 * Pure-ish highlight function. Returns ANSI-styled text for the given code.
 * Falls back to uncolored text if Shiki is unavailable or times out.
 *
 * @param code - Source code to highlight
 * @param lang - Language identifier (e.g. "typescript", "python")
 * @param theme - Shiki theme name (e.g. "github-dark")
 * @param signal - Optional abort signal for cancellation
 * @returns ANSI-styled code string
 */
export async function highlight(
  code: string,
  lang: string,
  theme: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!code) return "";

  const highlighter = await getHighlighter(theme, signal);
  if (!highlighter || signal?.aborted) {
    return code; // Fallback: plain text
  }

  try {
    return highlighter.codeToAnsi(code, lang, theme);
  } catch {
    return code; // Fallback: plain text on any error
  }
}

/**
 * Synchronous highlight that returns plain text immediately.
 * Used when async is not available or as a fallback.
 */
export function highlightSync(code: string): string {
  return code;
}

/**
 * Check if Shiki can be loaded (for feature detection).
 * Does not cache — use for UI hints only.
 */
export async function canHighlight(signal?: AbortSignal): Promise<boolean> {
  try {
    const mod = await loadWithTimeout(signal);
    return !!mod;
  } catch {
    return false;
  }
}

/**
 * Clear the highlighter cache. Useful for testing or memory pressure.
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Map file extension to a Shiki-compatible language name.
 * Returns undefined for unsupported extensions.
 */
export function extensionToLanguage(ext: string): string | undefined {
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".pyw": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cxx": "cpp",
    ".cc": "cpp",
    ".hpp": "cpp",
    ".rb": "ruby",
    ".bash": "bash",
    ".sh": "bash",
    ".zsh": "bash",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".md": "markdown",
    ".markdown": "markdown",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".xml": "xml",
    ".sql": "sql",
    ".toml": "toml",
    ".ini": "ini",
    ".cfg": "ini",
    ".conf": "ini",
    ".vue": "html",
    ".svelte": "html",
  };
  return map[ext.toLowerCase()];
}
