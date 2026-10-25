import path from 'node:path';
import {
  type Anchor,
  type AnchorProgress,
  type AnchorStep,
  type TouchMatchResult
} from './types.ts';

/**
 * Normalize path separators to forward slashes and strip baseCwd prefix when inside baseCwd
 */
export function normalizePath(filePath: string, baseCwd?: string): string {
  if (typeof filePath !== 'string') return '';
  let norm = filePath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (baseCwd && (path.isAbsolute(filePath) || norm.startsWith('/') || /^[a-zA-Z]:\//.test(norm))) {
    const normBase = baseCwd.trim().replace(/\\/g, '/').replace(/\/+$/, '');
    const lowerNorm = norm.toLowerCase();
    const lowerBase = normBase.toLowerCase();
    if (lowerNorm === lowerBase) {
      norm = '';
    } else if (lowerNorm.startsWith(lowerBase + '/')) {
      norm = norm.slice(normBase.length + 1).replace(/^\/+/, '');
    }
  }
  return norm;
}

/**
 * Safe boundary-aware directory comparison (case-insensitive on Windows)
 */
export function isSameOrSubPath(dirA?: string, dirB?: string): boolean {
  if (!dirA || !dirB) return false;
  const normA = dirA.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const normB = dirB.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const isWin = process.platform === 'win32' || /^[a-zA-Z]:\//.test(normA) || /^[a-zA-Z]:\//.test(normB);
  const a = isWin ? normA.toLowerCase() : normA;
  const b = isWin ? normB.toLowerCase() : normB;
  return a === b || b.startsWith(a + '/') || a.startsWith(b + '/');
}

/**
 * Convert simple glob pattern (*.ts, src/**\/*.ts) to safe RegExp
 */
export function globToRegExp(pattern: string): RegExp {
  const collapsed = pattern
    .slice(0, 512)
    .replace(/\/+(\*\*\/+)+/g, '/**/')
    .replace(/\*{3,}/g, '**');
  const escaped = collapsed
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\/\*\*\//g, '___GLOB_DIR_SLASH___')
    .replace(/\*\*/g, '___GLOB_STAR_STAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___GLOB_DIR_SLASH___/g, '(?:/|/(?:[^/]+/)+)')
    .replace(/___GLOB_STAR_STAR___/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * Clever Touch 1: Automatically spot file or directory paths mentioned inside a sticky note
 * (e.g. "src/auth.ts", "D:/College/优化/notes.md") so the user never has to fill out forms.
 */
export function extractPathsFromText(text?: string): string[] {
  if (!text) return [];
  const results = new Set<string>();
  const regex = /(?:[a-zA-Z]:[\\/][^\s"'`，。；！？、,;)>\]]+|(?:\b(?:src|lib|dist|tests|test|docs|scripts|packages|extensions|bin|assets)[\\/][^\s"'`，。；！？、,;)>\]]+)|(?:\b[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|c|cpp|h|cs|md|json|yaml|yml|toml|html|css|sql|sh)\b))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const cleaned = normalizePath(match[0].replace(/[.:;,'")\]}>]+$/, ''));
    if (cleaned && cleaned.length >= 3) {
      results.add(cleaned);
    }
  }
  return Array.from(results);
}

/**
 * Automatically extract lightweight progress metadata from note text if present:
 * - Explicit ratio: `[2/5]`, `(3/10)`, or standalone `5/30` (where 0 <= done <= total and 2 <= total <= 500)
 * - Numbered inline steps: `1. 抽出接口 2. 替换Cookie 3. 补单测`
 */
export function extractProgressFromText(rawTitle: string): { cleanTitle: string; progress?: AnchorProgress } {
  if (!rawTitle) return { cleanTitle: '' };

  // 1. Check numbered inline steps: "重构登录: 1. 抽出接口 2. 替换Cookie 3. 补单测"
  // Use non-greedy match bounded by the next `\d+\.` delimiter, allowing digits inside step text (e.g. OAuth2, Node22)
  const stepParts = Array.from(rawTitle.matchAll(/(?:^|\s)(\d+)\.\s*(.+?)(?=\s+\d+\.\s*|$)/g));
  if (stepParts.length >= 2) {
    const steps = stepParts.map(m => m[2].trim().replace(/[;；,，]+$/, '')).filter(Boolean);
    const items: AnchorStep[] = steps.map((subject, idx) => ({
      id: idx + 1,
      subject,
      status: idx === 0 ? 'in_progress' : 'pending'
    }));
    const firstMatchIdx = rawTitle.indexOf(stepParts[0][0]);
    const prefix = rawTitle.slice(0, firstMatchIdx).replace(/[:：\-—\s]+$/, '').trim();
    return {
      cleanTitle: prefix || steps.join(' → '),
      progress: { done: 0, total: steps.length, steps, items }
    };
  }

  // 2. Check explicit bracketed ratio tag: "[2/5]" or "(0/4)" (requires brackets so dates like 10/12 are never hijacked)
  const ratioMatch = rawTitle.match(/(?:\[(\d{1,3})\/(\d{1,3})\]|\((\d{1,3})\/(\d{1,3})\))/);
  if (ratioMatch) {
    const done = parseInt(ratioMatch[1] ?? ratioMatch[3], 10);
    const total = parseInt(ratioMatch[2] ?? ratioMatch[4], 10);
    if (!isNaN(done) && !isNaN(total) && total >= 2 && total <= 500 && done >= 0 && done <= total) {
      const stripped = rawTitle
        .replace(ratioMatch[0], ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        cleanTitle: stripped || rawTitle.trim(),
        progress: { done, total }
      };
    }
  }

  return { cleanTitle: rawTitle.trim() };
}

/**
 * Check if a sticky note belongs to or targets the given workspace directory
 */
export function isAnchorTargetingWorkspace(anchor: Anchor, targetCwd?: string): boolean {
  if (!targetCwd) return true;
  const normTarget = targetCwd.trim().replace(/\\/g, '/').replace(/\/+$/, '');

  if (anchor.project && anchor.project !== 'global') {
    const normProj = anchor.project.trim().replace(/\\/g, '/').replace(/\/+$/, '');
    if (isSameOrSubPath(normProj, normTarget)) return true;
    if (anchor.cwd && isSameOrSubPath(anchor.cwd, normTarget)) return true;
  }

  if (anchor.files && anchor.files.length > 0) {
    for (const f of anchor.files) {
      const resolvedFile = (!path.isAbsolute(f) && !/^[a-zA-Z]:\//.test(f) && anchor.cwd)
        ? `${anchor.cwd.replace(/\\/g, '/').replace(/\/+$/, '')}/${f.replace(/^\/+/, '')}`
        : f;
      if (isSameOrSubPath(resolvedFile, normTarget)) return true;
    }
  }

  if (anchor.cwd && isSameOrSubPath(anchor.cwd, normTarget)) {
    return true;
  }

  return false;
}

/**
 * Match touched files against an anchor's file patterns
 */
export function matchAnchorAgainstTouchedFiles(anchor: Anchor, touchedFiles: string[]): TouchMatchResult | null {
  if (!anchor.files || anchor.files.length === 0) return null;
  const normTouched = touchedFiles.map(f => normalizePath(f, anchor.cwd)).filter(Boolean);
  if (normTouched.length === 0) return null;

  const matchedExact: string[] = [];
  const matchedPrefix: string[] = [];

  for (const touched of normTouched) {
    for (const pattern of anchor.files) {
      const normPattern = normalizePath(pattern, anchor.cwd);
      if (normPattern === touched) {
        matchedExact.push(touched);
        break;
      }
      if (normPattern.includes('*') && globToRegExp(normPattern).test(touched)) {
        matchedExact.push(touched);
        break;
      }
      const dirPrefix = normPattern.endsWith('/') ? normPattern : normPattern + '/';
      if (touched.startsWith(dirPrefix)) {
        matchedPrefix.push(touched);
        break;
      }
    }
  }

  if (matchedExact.length > 0) {
    return { anchor, score: 1.0, matchedFiles: Array.from(new Set(matchedExact)), reason: 'exact-file' };
  }
  if (matchedPrefix.length > 0) {
    return { anchor, score: 0.85, matchedFiles: Array.from(new Set(matchedPrefix)), reason: 'dir-prefix' };
  }
  return null;
}

export function findMatchedAnchors(anchors: Anchor[], touchedFiles: string[]): TouchMatchResult[] {
  const results: TouchMatchResult[] = [];
  for (const anchor of anchors) {
    const m = matchAnchorAgainstTouchedFiles(anchor, touchedFiles);
    if (m) results.push(m);
  }
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Clever Touch 2: Syntax-safe 1-line comment whisper when the AI reads/edits a matching file.
 * Strictly skips JSON, ENV, lockfiles, and binaries so parsers are never broken.
 */
export const COMMENT_FORMATS: Record<string, (msg: string) => string> = {
  '.ts': m => `// ${m}`, '.tsx': m => `// ${m}`, '.js': m => `// ${m}`, '.jsx': m => `// ${m}`,
  '.mjs': m => `// ${m}`, '.cjs': m => `// ${m}`, '.go': m => `// ${m}`, '.rs': m => `// ${m}`,
  '.c': m => `// ${m}`, '.cpp': m => `// ${m}`, '.h': m => `// ${m}`, '.cs': m => `// ${m}`,
  '.java': m => `// ${m}`, '.kt': m => `// ${m}`, '.swift': m => `// ${m}`, '.dart': m => `// ${m}`,
  '.py': m => `# ${m}`, '.rb': m => `# ${m}`, '.sh': m => `# ${m}`, '.bash': m => `# ${m}`,
  '.yaml': m => `# ${m}`, '.yml': m => `# ${m}`, '.toml': m => `# ${m}`, '.ps1': m => `# ${m}`,
  '.html': m => `<!-- ${m} -->`, '.xml': m => `<!-- ${m} -->`, '.svg': m => `<!-- ${m} -->`,
  '.vue': m => `<!-- ${m} -->`, '.svelte': m => `<!-- ${m} -->`,
  '.css': m => `/* ${m} */`, '.scss': m => `/* ${m} */`,
  '.sql': m => `-- ${m}`, '.lua': m => `-- ${m}`
};

export function makeSafeTaskAnnotation(filePath: string, anchor: Anchor): string | null {
  const ext = path.extname(filePath).toLowerCase();
  const fmt = COMMENT_FORMATS[ext];
  if (!fmt) return null;
  const num = anchor.id.replace(/^anc-/, '');
  return '\n\n' + fmt(`⌖ Note #${num}: ${anchor.title}`);
}

const COMMIT_STOP_WORDS = new Set([
  'fix', 'feat', 'chore', 'docs', 'test', 'tests', 'refactor', 'style', 'perf', 'build', 'ci',
  'bug', 'issue', 'update', 'add', 'remove', 'todo', 'note', 'task', 'the', 'and', 'for', 'with',
  '修复', '优化', '更新', '添加', '修改', '完成', '问题', '任务', '模块', '功能'
]);

/**
 * Clever Touch 3: Match a `git commit -m "..."` message against a sticky note (supports CJK & English)
 */
export function matchesCommitMessage(anchor: Anchor, commitMessages: string[]): { matched: boolean; message?: string } {
  const idLower = anchor.id.toLowerCase();
  const numId = `#${anchor.id.replace(/^anc-/, '')}`;
  const title = anchor.title.toLowerCase();

  let titleTokens: string[] = [];
  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
    try {
      const seg = new (Intl as any).Segmenter('und', { granularity: 'word' });
      titleTokens = Array.from(seg.segment(title))
        .filter((s: any) => s.isWordLike)
        .map((s: any) => s.segment.trim().toLowerCase())
        .filter((t: string) => t.length >= 2 && !COMMIT_STOP_WORDS.has(t));
    } catch {
      titleTokens = title.split(/[\s,._\-\/]+/).filter(t => t.length >= 2 && !COMMIT_STOP_WORDS.has(t));
    }
  } else {
    titleTokens = title.split(/[\s,._\-\/]+/).filter(t => t.length >= 2 && !COMMIT_STOP_WORDS.has(t));
  }

  for (const msg of commitMessages) {
    const msgLower = msg.toLowerCase();
    if (msgLower.includes(idLower) || new RegExp(`(?:^|\\s|\\()${numId}(?:\\b|\\)|$)`).test(msgLower)) {
      return { matched: true, message: msg };
    }
    if (titleTokens.length > 0) {
      const hits = titleTokens.filter(tok => msgLower.includes(tok)).length;
      const requiredHits = titleTokens.length === 1 ? 1 : 2;
      if (hits >= requiredHits) {
        return { matched: true, message: msg };
      }
    }
  }
  return { matched: false };
}
