import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  type Anchor,
  type AnchorEvidence,
  type AnchorPriority,
  type AnchorProgress,
  type AnchorStatus,
  type AnchorStep,
  type AnchorStoreState,
  type StepStatus,
  type TodoTaskItem,
  type TouchMatchResult,
  QUIET_AFTER_DAYS,
  MS_PER_DAY
} from './types.ts';
import {
  materializeSteps,
  syncProgressFromItems,
  validateAnchorDependencies,
  validateStepDependencies
} from './graph.ts';
import { convertTodoTasksToSteps } from './bridge.ts';

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

/**
 * Render ultra-compact Turn-1 sticky note context for the AI.
 * Turn 2+ consumes 0 tokens.
 */
export function renderColdStartAnchorsContext(
  store: AnchorStore,
  cwdOrNow?: string | number,
  nowArg?: number
): string {
  let cwd: string | undefined;
  let now = Date.now();
  if (typeof cwdOrNow === 'number') now = cwdOrNow;
  else if (typeof cwdOrNow === 'string') cwd = cwdOrNow;
  if (typeof nowArg === 'number') now = nowArg;

  sweepQuietNotes(store, now);

  const activeNotes = store.list({ status: 'active', cwd });
  if (activeNotes.length === 0) return '';

  const lines = activeNotes.map(a => {
    const num = a.id.replace(/^anc-/, '');
    const tag = a.source === 'todo-sync' ? `[Todo Checkpoint · ${a.project}]` : `[${a.project}]`;
    const files = a.files.length > 0 ? ` (${a.files.slice(0, 2).join(', ')})` : '';
    const nextStep = a.progress?.steps && a.progress.steps[a.progress.done] && a.progress.steps[a.progress.done] !== a.title
      ? ` · current/next: ${a.progress.steps[a.progress.done]}`
      : '';
    const prog = a.progress
      ? ` [${a.progress.done}/${a.progress.total}${nextStep}]`
      : '';
    const desc = a.description ? ` — ${a.description}` : '';
    return `• #${num} ${tag} ${a.title}${prog}${files}${desc}`;
  });

  return [
    `<sticky-notes count="${activeNotes.length}">`,
    `Pinned notes from previous sessions:`,
    lines.join('\n'),
    `When a note is completed, call anchor(action="settle", id="...") to tear it off.`,
    `</sticky-notes>`
  ].join('\n');
}

export const renderActiveAnchorsContext = renderColdStartAnchorsContext;

/**
 * Transition notes untouched for >7 days to 'sleeping' (quiet mode) so they don't burn Turn-1 tokens
 * in unrelated sessions, while NEVER deleting them.
 */
export function sweepQuietNotes(store: AnchorStore, now: number = Date.now()): { quieted: string[] } {
  return store.withLock(() => {
    const state = store.loadState();
    const quieted: string[] = [];
    for (const a of state.anchors) {
      if (a.status === 'active' && (now - a.lastTouchedAt) > QUIET_AFTER_DAYS * MS_PER_DAY) {
        a.status = 'sleeping';
        a.updatedAt = now;
        quieted.push(a.id);
      }
    }
    if (quieted.length > 0) {
      state.lastSweepAt = now;
      store.saveState(state);
    }
    return { quieted };
  });
}

export function getDefaultStorageDir(): string {
  if (process.env.ANCHOR_DIR) return path.resolve(process.env.ANCHOR_DIR);
  return path.join(os.homedir(), '.anchor');
}

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err.code === 'EPERM';
  }
}

export function acquireSyncLock(lockPath: string, maxWaitMs = 1500, staleTimeoutMs = 5000): (() => void) | null {
  const start = Date.now();
  let attempt = 0;
  const lockToken = Math.random().toString(36).slice(2) + Date.now().toString(36);

  while (Date.now() - start < maxWaitMs) {
    attempt++;
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now(), token: lockToken }), 'utf-8');
      fs.closeSync(fd);
      return () => {
        try {
          if (fs.existsSync(lockPath)) {
            const raw = fs.readFileSync(lockPath, 'utf-8');
            if (raw) {
              const meta = JSON.parse(raw);
              if (meta.token === lockToken) {
                fs.unlinkSync(lockPath);
              }
            } else {
              fs.unlinkSync(lockPath);
            }
          }
        } catch {}
      };
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        try {
          const stat = fs.statSync(lockPath);
          if (stat.size === 0 && (Date.now() - stat.mtimeMs) > staleTimeoutMs) {
            try { fs.unlinkSync(lockPath); continue; } catch {}
          }
          const raw = fs.readFileSync(lockPath, 'utf-8');
          if (raw) {
            const meta = JSON.parse(raw);
            const isStale = (Date.now() - meta.createdAt) > staleTimeoutMs;
            const isDead = meta.pid && !isProcessAlive(meta.pid);
            if (isStale || isDead) {
              try { fs.unlinkSync(lockPath); continue; } catch {}
            }
          }
        } catch {}
        sleepSync(Math.min(40, Math.floor(attempt * 4 + Math.random() * 8)));
        continue;
      }
      break;
    }
  }
  return null;
}

export function atomicRenameWithRetry(tempPath: string, targetPath: string, maxRetries = 5): void {
  let lastErr: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.renameSync(tempPath, targetPath);
      return;
    } catch (err: any) {
      lastErr = err;
      if (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY') {
        sleepSync(15 * (i + 1));
        continue;
      }
      break;
    }
  }
  try {
    fs.copyFileSync(tempPath, targetPath);
    fs.unlinkSync(tempPath);
  } catch {
    throw lastErr;
  }
}

export class AnchorStore {
  public readonly storageDir: string;
  public readonly statePath: string;
  public readonly lockPath: string;
  public readonly archivePath: string;

  constructor(storageDir?: string) {
    this.storageDir = storageDir ? path.resolve(storageDir) : getDefaultStorageDir();
    this.statePath = path.join(this.storageDir, 'state.json');
    this.lockPath = path.join(this.storageDir, 'state.lock');
    this.archivePath = path.join(this.storageDir, 'archive.jsonl');
  }

  private ensureDirs(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  public withLock<T>(fn: () => T): T {
    this.ensureDirs();
    const release = acquireSyncLock(this.lockPath);
    if (!release) {
      throw new Error('AnchorStore: Unable to acquire state.lock within timeout');
    }
    try {
      return fn();
    } finally {
      release();
    }
  }

  public loadState(): AnchorStoreState {
    this.ensureDirs();
    if (!fs.existsSync(this.statePath)) {
      return { version: 1, anchors: [], lastSweepAt: Date.now(), nextId: 1 };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));
      if (!parsed || !Array.isArray(parsed.anchors)) {
        return { version: 1, anchors: [], lastSweepAt: Date.now(), nextId: 1 };
      }
      return parsed;
    } catch {
      try {
        fs.copyFileSync(this.statePath, path.join(this.storageDir, `state.corrupt.${Date.now()}.json`));
      } catch {}
      return { version: 1, anchors: [], lastSweepAt: Date.now(), nextId: 1 };
    }
  }

  public saveState(state: AnchorStoreState): void {
    this.ensureDirs();
    const tempPath = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    atomicRenameWithRetry(tempPath, this.statePath);
  }

  private generateId(state: AnchorStoreState): string {
    const numbers = state.anchors
      .map(a => {
        const m = a.id.match(/^anc-(\d+)$/);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter(n => n > 0);
    const maxExisting = numbers.length > 0 ? Math.max(...numbers) : 0;
    const nextNum = Math.max(maxExisting + 1, state.nextId || 1);
    state.nextId = nextNum + 1;
    return `anc-${nextNum}`;
  }

  /**
   * Pin a new sticky note
   */
  public create(input: {
    title: string;
    description?: string;
    priority?: AnchorPriority;
    source?: 'manual' | 'todo-sync';
    cwd?: string;
    project?: string;
    files?: string[];
    tags?: string[];
    blockedBy?: string[];
    activeForm?: string;
    sessionFile?: string;
    progress?: AnchorProgress;
  }): Anchor {
    return this.withLock(() => {
      const state = this.loadState();
      const now = Date.now();
      const id = this.generateId(state);

      if (input.blockedBy && input.blockedBy.length > 0) {
        const check = validateAnchorDependencies(state.anchors, id, input.blockedBy);
        if (!check.valid) throw new Error(check.error);
      }

      const { cleanTitle, progress: parsedProgress } = extractProgressFromText(input.title);
      const explicitFiles = (input.files || []).map(f => normalizePath(f)).filter(Boolean);
      const inferredFiles = explicitFiles.length > 0
        ? explicitFiles
        : extractPathsFromText(`${cleanTitle} ${input.description || ''}`);

      let cwd = input.cwd ? normalizePath(input.cwd) : '';
      if (input.project && (/^[a-zA-Z]:[\\/]/.test(input.project.trim()) || input.project.trim().startsWith('/'))) {
        cwd = normalizePath(input.project.trim());
      } else if (inferredFiles.length > 0 && (/^[a-zA-Z]:\//.test(inferredFiles[0]) || inferredFiles[0].startsWith('/'))) {
        const firstDir = path.dirname(inferredFiles[0]);
        if (firstDir && firstDir !== '.') cwd = normalizePath(firstDir);
      }

      const projectName = input.project
        ? input.project.trim()
        : (cwd ? path.basename(cwd) : 'global');

      const normBlockedBy = input.blockedBy
        ? input.blockedBy.map(b => {
            const c = b.trim().replace(/^#/, '');
            return /^\d+$/.test(c) ? `anc-${parseInt(c, 10)}` : c;
          })
        : undefined;

      const anchor: Anchor = {
        id,
        title: cleanTitle,
        description: input.description?.trim(),
        priority: input.priority || 'p1',
        status: 'active',
        ...(input.source ? { source: input.source } : {}),
        project: projectName,
        cwd,
        createdAt: now,
        updatedAt: now,
        lastTouchedAt: now,
        files: inferredFiles,
        tags: (input.tags || []).map(t => t.trim()).filter(Boolean),
        ...(input.activeForm ? { activeForm: input.activeForm.trim() } : {}),
        ...(normBlockedBy && normBlockedBy.length > 0 ? { blockedBy: normBlockedBy } : {}),
        ...(input.sessionFile ? { sessionFile: normalizePath(input.sessionFile) } : {}),
        ...(input.progress || parsedProgress ? { progress: input.progress || parsedProgress } : {})
      };

      state.anchors.push(anchor);
      this.saveState(state);
      return anchor;
    });
  }

  private findAnchorIndex(anchors: Anchor[], id: string): number {
    const clean = id.trim().replace(/^#/, '');
    return anchors.findIndex(a =>
      a.id === clean ||
      a.id === `anc-${clean}` ||
      (/^\d+$/.test(clean) ? a.id === `anc-${parseInt(clean, 10)}` : false)
    );
  }

  public get(id: string): Anchor | undefined {
    const state = this.loadState();
    const idx = this.findAnchorIndex(state.anchors, id);
    return idx === -1 ? undefined : state.anchors[idx];
  }

  public list(filter?: {
    status?: AnchorStatus;
    cwd?: string;
    all?: boolean;
  }): Anchor[] {
    const state = this.loadState();
    const targetCwd = filter?.cwd ? normalizePath(filter.cwd) : null;

    return state.anchors.filter(a => {
      if (filter?.status && a.status !== filter.status) return false;
      if (!filter?.all && targetCwd) {
        if (a.files.length > 0 && (a.cwd || a.project) && !isAnchorTargetingWorkspace(a, targetCwd)) {
          return false;
        }
      }
      return true;
    });
  }

  public update(id: string, patch: Partial<Omit<Anchor, 'id' | 'createdAt'>>): Anchor {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);

      const updated: Anchor = {
        ...state.anchors[idx],
        ...patch,
        updatedAt: Date.now()
      };
      if (patch.files) {
        updated.files = patch.files.map(f => normalizePath(f)).filter(Boolean);
      }
      state.anchors[idx] = updated;
      this.saveState(state);
      return updated;
    });
  }

  public touch(id: string, timestamp: number = Date.now(), sessionFile?: string): Anchor {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);

      const current = state.anchors[idx];
      current.lastTouchedAt = timestamp;
      current.updatedAt = timestamp;
      if (current.status === 'sleeping') {
        current.status = 'active';
      }
      if (sessionFile) {
        current.sessionFile = normalizePath(sessionFile);
      }
      state.anchors[idx] = current;
      this.saveState(state);
      return current;
    });
  }

  /**
   * Advance (or set) progress on a sticky note:
   * - If delta is provided (default +1), increments `done` up to `total`.
   * - If note had no progress yet, initializes a 4-step bar (`1/4`).
   */
  public step(id: string, delta = 1, explicitTotal?: number): { anchor: Anchor; completed: boolean } {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);

      const current = state.anchors[idx];
      const now = Date.now();
      const safeDelta = Number.isFinite(delta) ? delta : 1;
      const total = explicitTotal && Number.isFinite(explicitTotal) && explicitTotal >= 1
        ? explicitTotal
        : (current.progress?.total || 4);
      const prevDone = current.progress?.done || 0;
      const nextDone = Math.max(0, Math.min(total, prevDone + safeDelta));

      const existingItems = materializeSteps(current.progress);
      let updatedItems: AnchorStep[] | undefined;
      if (existingItems.length > 0) {
        updatedItems = existingItems.map((item, idx) => {
          let status: StepStatus = 'pending';
          if (idx < nextDone) status = 'completed';
          else if (idx === nextDone) status = 'in_progress';
          return { ...item, status };
        });
      }

      current.progress = {
        ...(current.progress || {}),
        done: nextDone,
        total,
        ...(updatedItems ? { items: updatedItems, steps: updatedItems.map(i => i.subject) } : {})
      };
      current.lastTouchedAt = now;
      current.updatedAt = now;
      if (current.status === 'sleeping') {
        current.status = 'active';
      }

      state.anchors[idx] = current;
      this.saveState(state);
      return { anchor: current, completed: nextDone >= total };
    });
  }

  /**
   * Add a structured sub-step to an anchor (with DAG dependency validation)
   */
  public addStep(
    id: string,
    subject: string,
    options: { blockedBy?: number[]; activeForm?: string; status?: StepStatus } = {}
  ): Anchor {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);

      const current = state.anchors[idx];
      const items = materializeSteps(current.progress);
      const nextStepId = items.length > 0 ? Math.max(...items.map(s => s.id)) + 1 : 1;

      if (options.blockedBy && options.blockedBy.length > 0) {
        const check = validateStepDependencies(items, nextStepId, options.blockedBy);
        if (!check.valid) throw new Error(check.error);
      }

      const newStep: AnchorStep = {
        id: nextStepId,
        subject: subject.trim(),
        status: options.status || (items.some(s => s.status === 'in_progress') ? 'pending' : 'in_progress'),
        ...(options.activeForm ? { activeForm: options.activeForm.trim() } : {}),
        ...(options.blockedBy && options.blockedBy.length > 0 ? { blockedBy: [...options.blockedBy] } : {})
      };

      const nextItems = [...items, newStep];
      current.progress = syncProgressFromItems(nextItems, current.progress);
      current.updatedAt = Date.now();
      current.lastTouchedAt = Date.now();
      state.anchors[idx] = current;
      this.saveState(state);
      return current;
    });
  }

  /**
   * Update a specific sub-step within an anchor (status, subject, activeForm, or blockedBy DAG edges)
   */
  public updateStep(
    id: string,
    stepId: number,
    patch: {
      status?: StepStatus;
      subject?: string;
      activeForm?: string;
      addBlockedBy?: number[];
      removeBlockedBy?: number[];
    }
  ): Anchor {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);

      const current = state.anchors[idx];
      const items = materializeSteps(current.progress);
      const stepIdx = items.findIndex(s => s.id === stepId);
      if (stepIdx === -1) throw new Error(`Step #${stepId} not found in #${current.id}`);

      if (patch.addBlockedBy && patch.addBlockedBy.length > 0) {
        const check = validateStepDependencies(items, stepId, patch.addBlockedBy);
        if (!check.valid) throw new Error(check.error);
      }

      const target = { ...items[stepIdx] };
      if (patch.status) target.status = patch.status;
      if (patch.subject) target.subject = patch.subject.trim();
      if (patch.activeForm !== undefined) {
        if (patch.activeForm) target.activeForm = patch.activeForm.trim();
        else delete target.activeForm;
      }

      if (patch.addBlockedBy || patch.removeBlockedBy) {
        const set = new Set<number>(target.blockedBy ?? []);
        for (const addId of patch.addBlockedBy ?? []) set.add(addId);
        for (const rmId of patch.removeBlockedBy ?? []) set.delete(rmId);
        if (set.size > 0) target.blockedBy = [...set];
        else delete target.blockedBy;
      }

      items[stepIdx] = target;
      current.progress = syncProgressFromItems(items, current.progress);
      current.updatedAt = Date.now();
      current.lastTouchedAt = Date.now();
      state.anchors[idx] = current;
      this.saveState(state);
      return current;
    });
  }

  /**
   * Read recent settled/archived notes from `archive.jsonl` (newest first)
   */
  public listArchive(limit = 20): Anchor[] {
    if (!fs.existsSync(this.archivePath)) return [];
    try {
      const lines = fs.readFileSync(this.archivePath, 'utf-8').split(/\r?\n/).filter(Boolean);
      const parsed: Anchor[] = [];
      for (let i = lines.length - 1; i >= 0 && parsed.length < limit; i--) {
        try {
          const item = JSON.parse(lines[i]);
          if (item && typeof item.id === 'string' && typeof item.title === 'string') {
            parsed.push(item);
          }
        } catch {}
      }
      return parsed;
    } catch {
      return [];
    }
  }

  /**
   * Clever Touch 4 (Todo-Bridge): Automatically mirror intra-session `todo` tool lists
   * into a cross-session checkpoint!
   * - While tasks are in_progress/pending: updates the live `[■■□□ done/total]` checkpoint on disk;
   * - When all tasks in the todo list reach `completed`: automatically tears off the checkpoint!
   */
  public syncFromTodoTool(
    tasks: TodoTaskItem[],
    options: { cwd?: string; sessionFile?: string; recentFiles?: string[] } = {}
  ): { status: 'synced' | 'completed' | 'noop'; anchor?: Anchor } {
    if (!Array.isArray(tasks)) return { status: 'noop' };

    const visible = tasks.filter(t => t && typeof t.subject === 'string' && t.status !== 'deleted');
    const normCwd = options.cwd ? normalizePath(options.cwd) : '';
    const normSession = options.sessionFile ? normalizePath(options.sessionFile) : undefined;

    return this.withLock(() => {
      const state = this.loadState();
      const existingIdx = state.anchors.findIndex(a =>
        a.source === 'todo-sync' &&
        ((normSession && a.sessionFile === normSession) || (normCwd && isSameOrSubPath(a.cwd, normCwd)))
      );

      // 1. If todo list was cleared or 100% completed, auto-tear off the synced checkpoint
      const completedTasks = visible.filter(t => t.status === 'completed');
      const unfinishedTasks = visible.filter(t => t.status !== 'completed');

      if (visible.length === 0 || unfinishedTasks.length === 0) {
        if (existingIdx !== -1) {
          const [settled] = state.anchors.splice(existingIdx, 1);
          settled.status = 'settled';
          settled.updatedAt = Date.now();
          settled.evidence = {
            settledAt: Date.now(),
            settledBy: 'todo-complete',
            summary: `All ${completedTasks.length} session todo(s) completed`
          };
          this.ensureDirs();
          fs.appendFileSync(this.archivePath, JSON.stringify(settled) + '\n', 'utf-8');
          this.saveState(state);
          return { status: 'completed', anchor: settled };
        }
        return { status: 'noop' };
      }

      // 2. Active unfinished todos exist: build live progress & structured step tree
      const inProgress = unfinishedTasks.find(t => t.status === 'in_progress') || unfinishedTasks[0];
      const structuredItems = convertTodoTasksToSteps(visible);
      const orderedSteps = [
        ...completedTasks.map(t => t.subject.trim()),
        ...unfinishedTasks.filter(t => t.status === 'in_progress').map(t => t.subject.trim()),
        ...unfinishedTasks.filter(t => t.status === 'pending').map(t => t.subject.trim())
      ];
      const progress: AnchorProgress = {
        done: completedTasks.length,
        total: visible.length,
        steps: orderedSteps,
        items: structuredItems
      };

      const remainingSummary = unfinishedTasks
        .slice(0, 3)
        .map(t => t.subject.trim())
        .join(' → ');
      const headline = inProgress.subject.trim();
      const now = Date.now();

      if (existingIdx !== -1) {
        const current = state.anchors[existingIdx];
        current.title = headline;
        current.description = `Remaining (${unfinishedTasks.length}/${visible.length}): ${remainingSummary}`;
        current.progress = progress;
        current.status = 'active';
        current.updatedAt = now;
        current.lastTouchedAt = now;
        if (normSession) current.sessionFile = normSession;
        if (options.recentFiles && options.recentFiles.length > 0) {
          const merged = Array.from(new Set([...options.recentFiles.map(f => normalizePath(f)), ...current.files])).slice(0, 5);
          current.files = merged;
        }
        state.anchors[existingIdx] = current;
        this.saveState(state);
        return { status: 'synced', anchor: current };
      }

      // Create new todo-synced checkpoint
      const id = this.generateId(state);
      const inferredFiles = (options.recentFiles && options.recentFiles.length > 0)
        ? options.recentFiles.map(f => normalizePath(f)).filter(Boolean)
        : extractPathsFromText(orderedSteps.join(' '));
      const projectName = normCwd ? path.basename(normCwd) : 'global';

      const created: Anchor = {
        id,
        title: headline,
        description: `Remaining (${unfinishedTasks.length}/${visible.length}): ${remainingSummary}`,
        priority: 'p1',
        status: 'active',
        source: 'todo-sync',
        project: projectName,
        cwd: normCwd,
        createdAt: now,
        updatedAt: now,
        lastTouchedAt: now,
        files: inferredFiles,
        tags: ['todo-sync'],
        ...(normSession ? { sessionFile: normSession } : {}),
        progress
      };

      state.anchors.push(created);
      this.saveState(state);
      return { status: 'synced', anchor: created };
    });
  }

  /**
   * Tear off (settle) a completed sticky note and archive it to archive.jsonl
   */
  public settle(id: string, evidence: AnchorEvidence = {}, now: number = Date.now()): Anchor {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);

      const [settled] = state.anchors.splice(idx, 1);
      settled.status = 'settled';
      settled.updatedAt = now;
      settled.evidence = {
        ...evidence,
        settledAt: now,
        settledBy: evidence.settledBy || 'manual'
      };

      this.ensureDirs();
      fs.appendFileSync(this.archivePath, JSON.stringify(settled) + '\n', 'utf-8');
      this.saveState(state);
      return settled;
    });
  }

  /**
   * Put back (undo) the last torn-off sticky note
   */
  public undoSettle(): Anchor {
    return this.withLock(() => {
      if (!fs.existsSync(this.archivePath)) {
        throw new Error('No archived notes to restore');
      }
      const raw = fs.readFileSync(this.archivePath, 'utf-8');
      const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let anchor: Anchor | null = null;
      while (lines.length > 0 && !anchor) {
        const candidate = lines.pop()!;
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed.id === 'string' && typeof parsed.title === 'string') {
            anchor = parsed;
          }
        } catch {}
      }
      if (!anchor) throw new Error('Archive is empty, nothing to undo');

      fs.writeFileSync(this.archivePath, lines.length > 0 ? lines.join('\n') + '\n' : '', 'utf-8');

      anchor.status = 'active';
      anchor.updatedAt = Date.now();
      anchor.lastTouchedAt = Date.now();
      delete anchor.evidence;

      const state = this.loadState();
      const existingIdx = state.anchors.findIndex(a => a.id === anchor!.id);
      if (existingIdx !== -1) {
        if (state.anchors[existingIdx].title === anchor.title) {
          state.anchors[existingIdx] = anchor;
        } else {
          anchor.id = this.generateId(state);
          state.anchors.push(anchor);
        }
      } else {
        const m = anchor.id.match(/^anc-(\d+)$/);
        if (m) state.nextId = Math.max(state.nextId || 1, parseInt(m[1], 10) + 1);
        state.anchors.push(anchor);
      }
      this.saveState(state);
      return anchor;
    });
  }
}
