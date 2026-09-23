import path from 'node:path';
import type { Anchor, TouchMatchResult } from './types.ts';

/**
 * Normalize path separators to POSIX forward slashes
 */
export function normalizePath(filePath: string): string {
  if (typeof filePath !== 'string') return '';
  return filePath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Match touched files against an anchor's registered patterns and tags
 */
export function matchAnchorAgainstTouchedFiles(
  anchor: Anchor,
  touchedFiles: string[]
): TouchMatchResult | null {
  const normTouched = touchedFiles.map(normalizePath).filter(Boolean);
  if (normTouched.length === 0) return null;

  const matchedExact: string[] = [];
  const matchedPrefix: string[] = [];
  const matchedKeyword: string[] = [];

  for (const touched of normTouched) {
    // 1. Exact match or configured glob match
    for (const pattern of anchor.files) {
      const normPattern = normalizePath(pattern);
      if (normPattern === touched) {
        matchedExact.push(touched);
        break;
      }

      // Directory prefix match, e.g. "src/auth/" matches "src/auth/login.ts"
      const dirPrefix = normPattern.endsWith('/') ? normPattern : normPattern + '/';
      if (touched.startsWith(dirPrefix)) {
        matchedPrefix.push(touched);
        break;
      }
    }

    // 2. Tag / Domain keyword match across file path parts
    const touchedLower = touched.toLowerCase();
    for (const tag of anchor.tags) {
      const tagLower = tag.toLowerCase();
      if (touchedLower.includes(tagLower)) {
        matchedKeyword.push(touched);
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

  if (matchedKeyword.length > 0) {
    return {
      anchor,
      score: 0.5,
      matchedFiles: Array.from(new Set(matchedKeyword)),
      reason: 'tag-keyword'
    };
  }

  return null;
}

/**
 * Given a collection of anchors and touched files, returns prioritized matches
 */
export function findMatchedAnchors(
  anchors: Anchor[],
  touchedFiles: string[]
): TouchMatchResult[] {
  const results: TouchMatchResult[] = [];

  for (const anchor of anchors) {
    const match = matchAnchorAgainstTouchedFiles(anchor, touchedFiles);
    if (match) {
      results.push(match);
    }
  }

  // Sort by score descending, then by priority (p0 > p1 > p2)
  const priorityWeight: Record<string, number> = { p0: 3, p1: 2, p2: 1 };
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (priorityWeight[b.anchor.priority] || 0) - (priorityWeight[a.anchor.priority] || 0);
  });

  return results;
}
