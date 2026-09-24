import path from 'node:path';
import type { Anchor, TouchMatchResult } from './types.ts';

/**
 * Convert simple glob pattern (e.g. *.ts, src/**\/*.ts, src/auth/*.ts) to RegExp
 */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\/\*\*\//g, '___GLOB_DIR_SLASH___')
    .replace(/\*\*/g, '___GLOB_STAR_STAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___GLOB_DIR_SLASH___/g, '(?:/|/.+/)')
    .replace(/___GLOB_STAR_STAR___/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * Normalize path separators to POSIX forward slashes and optionally relative to baseCwd
 */
export function normalizePath(filePath: string, baseCwd?: string): string {
  if (typeof filePath !== 'string') return '';
  let norm = filePath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (baseCwd && (path.isAbsolute(filePath) || norm.startsWith('/'))) {
    const normBase = baseCwd.trim().replace(/\\/g, '/');
    if (norm.toLowerCase().startsWith(normBase.toLowerCase())) {
      norm = norm.slice(normBase.length).replace(/^\/+/, '');
    }
  }
  return norm;
}

/**
 * Match touched files against an anchor's registered physical patterns
 * Only anchors with explicit files/globs/prefixes are matched against file touches.
 * Anchors with files: [] (pure mental notes or macro tasks) NEVER trigger on file operations.
 */
export function matchAnchorAgainstTouchedFiles(
  anchor: Anchor,
  touchedFiles: string[]
): TouchMatchResult | null {
  if (!anchor.files || anchor.files.length === 0) return null;

  const normTouched = touchedFiles.map(f => normalizePath(f, anchor.cwd)).filter(Boolean);
  if (normTouched.length === 0) return null;

  const matchedExact: string[] = [];
  const matchedPrefix: string[] = [];

  for (const touched of normTouched) {
    // Exact match or configured glob match
    for (const pattern of anchor.files) {
      const normPattern = normalizePath(pattern, anchor.cwd);
      if (normPattern === touched) {
        matchedExact.push(touched);
        break;
      }

      // Glob pattern matching
      if (normPattern.includes('*')) {
        const regex = globToRegExp(normPattern);
        if (regex.test(touched)) {
          matchedExact.push(touched);
          break;
        }
      }

      // Directory prefix match, e.g. "src/auth/" matches "src/auth/login.ts"
      const dirPrefix = normPattern.endsWith('/') ? normPattern : normPattern + '/';
      if (touched.startsWith(dirPrefix)) {
        matchedPrefix.push(touched);
        break;
      }
    }
  }

  if (matchedExact.length > 0) {
    return {
      anchor,
      score: 1.0,
      matchedFiles: Array.from(new Set(matchedExact)),
      reason: 'exact-file'
    };
  }

  if (matchedPrefix.length > 0) {
    return {
      anchor,
      score: 0.85,
      matchedFiles: Array.from(new Set(matchedPrefix)),
      reason: 'dir-prefix'
    };
  }

  return null;
}

/**
 * Filter and sort anchors that match a set of touched files
 * Prioritizes high confidence (exact > prefix > keyword) and priority (P0 > P1 > P2).
 */
export function findMatchedAnchors(
  anchors: Anchor[],
  touchedFiles: string[]
): TouchMatchResult[] {
  const priorityWeight: Record<string, number> = { p0: 3, p1: 2, p2: 1 };
  const results: TouchMatchResult[] = [];

  for (const anchor of anchors) {
    const match = matchAnchorAgainstTouchedFiles(anchor, touchedFiles);
    if (match) {
      results.push(match);
    }
  }

  return results.sort((a, b) => {
    // 1. Match score confidence desc
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // 2. Anchor priority desc
    const weightA = priorityWeight[a.anchor.priority] || 0;
    const weightB = priorityWeight[b.anchor.priority] || 0;
    if (weightB !== weightA) {
      return weightB - weightA;
    }
    // 3. Recency desc
    return b.anchor.lastTouchedAt - a.anchor.lastTouchedAt;
  });
}
