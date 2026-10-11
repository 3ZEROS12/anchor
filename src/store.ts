import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  type Anchor,
  type AnchorEvidence,
  type AnchorPriority,
  type AnchorStatus,
  type AnchorStoreState,
  type TouchMatchResult,
  QUIET_AFTER_DAYS,
  MS_PER_DAY
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
 * Check if a sticky note belongs to or targets the given workspace directory
 */
export function isAnchorTargetingWorkspace(anchor: Anchor, targetCwd?: string): boolean {
  if (!targetCwd) return true;
  const normTarget = targetCwd.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const targetBase = path.basename(normTarget).toLowerCase();

  if (anchor.project && anchor.project !== 'global') {
    const normProj = anchor.project.trim().replace(/\\/g, '/').replace(/\/+$/, '');
    if (isSameOrSubPath(normProj, normTarget)) return true;
    if (path.basename(normProj).toLowerCase() === targetBase) return true;
  }

  if (anchor.files && anchor.files.length > 0) {
    for (const f of anchor.files) {
      if (isSameOrSubPath(f, normTarget)) return true;
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
        .filter((t: string) => t.length >= 2);
    } catch {
      titleTokens = title.split(/[\s,._\-\/]+/).filter(t => t.length >= 2);
    }
  } else {
    titleTokens = title.split(/[\s,._\-\/]+/).filter(t => t.length >= 2);
  }

  for (const msg of commitMessages) {
    const msgLower = msg.toLowerCase();
    if (msgLower.includes(idLower) || msgLower.includes(numId)) {
      return { matched: true, message: msg };
    }
    if (titleTokens.length > 0) {
      const hits = titleTokens.filter(tok => msgLower.includes(tok)).length;
      if (hits >= Math.min(2, titleTokens.length)) {
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
    const files = a.files.length > 0 ? ` (${a.files.slice(0, 2).join(', ')})` : '';
    const desc = a.description ? ` — ${a.description}` : '';
    return `• #${num} [${a.project}] ${a.title}${files}${desc}`;
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

export function acquireSyncLock(lockPath: string, maxWaitMs = 1500, staleTimeoutMs = 5000): () => void {
  const start = Date.now();
  let attempt = 0;

  while (Date.now() - start < maxWaitMs) {
    attempt++;
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }), 'utf-8');
      fs.closeSync(fd);
      return () => {
        try {
          if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        } catch {}
      };
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        try {
          const meta = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
          const isStale = (Date.now() - meta.createdAt) > staleTimeoutMs;
          const isDead = meta.pid && !isProcessAlive(meta.pid);
          if (isStale || isDead) {
            try { fs.unlinkSync(lockPath); continue; } catch {}
          }
        } catch {}
        sleepSync(Math.min(40, Math.floor(attempt * 4 + Math.random() * 8)));
        continue;
      }
      break;
    }
  }
  return () => {};
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
    cwd?: string;
    project?: string;
    files?: string[];
    tags?: string[];
  }): Anchor {
    return this.withLock(() => {
      const state = this.loadState();
      const now = Date.now();
      const id = this.generateId(state);

      const explicitFiles = (input.files || []).map(f => normalizePath(f)).filter(Boolean);
      const inferredFiles = explicitFiles.length > 0
        ? explicitFiles
        : extractPathsFromText(`${input.title} ${input.description || ''}`);

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

      const anchor: Anchor = {
        id,
        title: input.title.trim(),
        description: input.description?.trim(),
        priority: input.priority || 'p1',
        status: 'active',
        project: projectName,
        cwd,
        createdAt: now,
        updatedAt: now,
        lastTouchedAt: now,
        files: inferredFiles,
        tags: (input.tags || []).map(t => t.trim()).filter(Boolean)
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

  public touch(id: string, timestamp: number = Date.now()): Anchor {
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
      state.anchors[idx] = current;
      this.saveState(state);
      return current;
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
