export * from './matcher.ts';
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
import {
  extractPathsFromText,
  extractProgressFromText,
  isAnchorTargetingWorkspace,
  isSameOrSubPath,
  normalizePath
} from './matcher.ts';



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
  if (process.env.PI_ANCHOR_DIR) return path.resolve(process.env.PI_ANCHOR_DIR);
  return path.join(os.homedir(), '.anchor');
}

const SLEEP_SAB = typeof SharedArrayBuffer !== 'undefined' ? new Int32Array(new SharedArrayBuffer(4)) : null;

function sleepSync(ms: number): void {
  if (ms <= 0) return;
  if (SLEEP_SAB) {
    try {
      Atomics.wait(SLEEP_SAB, 0, 0, Math.floor(ms));
      return;
    } catch {}
  }
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

/**
 * Coerces a persisted anchor into the current schema.
 * Older or hand-edited state files omit `files`/`tags`/timestamps, and every reader
 * (`list`, cold-start context, dock, mission receipts) dereferences those fields, so a
 * single partial entry used to throw on load and blank the whole dock.
 * Returns null for entries that cannot be attributed to a note at all.
 */
export function normalizeAnchor(raw: unknown): Anchor | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const id = typeof r.id === 'string' ? r.id.trim() : '';
  if (!id) return null;

  const now = Date.now();
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const text = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const numbers = (v: unknown): number[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : undefined;

  const status: AnchorStatus = r.status === 'sleeping' || r.status === 'settled' ? r.status : 'active';
  const createdAt = num(r.createdAt, now);

  let progress: AnchorProgress | undefined;
  if (r.progress && typeof r.progress === 'object') {
    const p = r.progress as Record<string, any>;
    const steps = Array.isArray(p.steps) ? strings(p.steps) : undefined;
    const total = num(p.total, steps?.length ?? 0);
    progress = {
      done: Math.max(0, Math.min(num(p.done, 0), total)),
      total,
      ...(steps ? { steps } : {}),
      ...(Array.isArray(p.items)
        ? {
            items: p.items
              .filter((item: any) => item && typeof item === 'object')
              .map((item: any, index: number) => ({
                id: num(item.id, index + 1),
                subject: text(item.subject, text(item.title, `Step ${index + 1}`)),
                status: (['pending', 'in_progress', 'completed', 'deleted'] as StepStatus[]).includes(item.status)
                  ? (item.status as StepStatus)
                  : 'pending',
                ...(typeof item.activeForm === 'string' ? { activeForm: item.activeForm } : {}),
                ...(numbers(item.blockedBy) ? { blockedBy: numbers(item.blockedBy) } : {}),
              })),
          }
        : {}),
    };
  }

  return {
    id,
    title: text(r.title, id),
    ...(typeof r.description === 'string' ? { description: r.description } : {}),
    status,
    ...(r.source === 'todo-sync' || r.source === 'manual' ? { source: r.source } : {}),
    project: text(r.project, 'global'),
    cwd: text(r.cwd),
    createdAt,
    updatedAt: num(r.updatedAt, createdAt),
    lastTouchedAt: num(r.lastTouchedAt, createdAt),
    files: strings(r.files),
    tags: strings(r.tags),
    ...(typeof r.activeForm === 'string' ? { activeForm: r.activeForm } : {}),
    ...(typeof r.liveStartedAt === 'number' ? { liveStartedAt: r.liveStartedAt } : {}),
    ...(typeof r.driftWarning === 'string' ? { driftWarning: r.driftWarning } : {}),
    ...(typeof r.steerGuidance === 'string' ? { steerGuidance: r.steerGuidance } : {}),
    ...(strings(r.blockedBy).length > 0 ? { blockedBy: strings(r.blockedBy) } : {}),
    ...(typeof r.sessionFile === 'string' ? { sessionFile: r.sessionFile } : {}),
    ...(progress ? { progress } : {}),
    ...(typeof r.targetDate === 'string' ? { targetDate: r.targetDate } : {}),
    ...(r.priority === 'p0' || r.priority === 'p1' || r.priority === 'p2' ? { priority: r.priority } : {}),
    ...(typeof r.verifyCommand === 'string' ? { verifyCommand: r.verifyCommand } : {}),
    ...(r.evidence && typeof r.evidence === 'object' ? { evidence: r.evidence as AnchorEvidence } : {}),
  };
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
      const anchors = parsed.anchors
        .map((raw: unknown) => normalizeAnchor(raw))
        .filter((a: Anchor | null): a is Anchor => a !== null);
      return {
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        anchors,
        lastSweepAt: typeof parsed.lastSweepAt === 'number' ? parsed.lastSweepAt : Date.now(),
        nextId: typeof parsed.nextId === 'number' ? parsed.nextId : undefined,
      };
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
    verifyCommand?: string;
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
        ...(input.verifyCommand ? { verifyCommand: input.verifyCommand.trim() } : {}),
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
   * Search anchors across active, sleeping, and archived tasks.
   * Matches tokens case-insensitively across id, title, description, project, files, tags, steerGuidance, and progress steps.
   */
  public search(query: string, options: { includeArchive?: boolean; limit?: number } = {}): Anchor[] {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      return this.list({ all: true });
    }

    const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return this.list({ all: true });
    }

    const candidates: Anchor[] = [];
    const seenIds = new Set<string>();

    const matchesAnchor = (a: Anchor): boolean => {
      const numId = `#${a.id.replace(/^anc-/, '')}`;
      const stepTexts = [
        ...(a.progress?.steps || []),
        ...(a.progress?.items ? a.progress.items.map(i => i.subject) : [])
      ].join(' ');

      const haystack = [
        a.id,
        numId,
        a.title,
        a.description || '',
        a.project || '',
        (a.files || []).join(' '),
        (a.tags || []).join(' '),
        a.steerGuidance || '',
        stepTexts
      ].join(' ').toLowerCase();

      return tokens.every(tok => haystack.includes(tok));
    };

    const activeSleeping = this.loadState().anchors;
    const activeSleepingIds = new Set(activeSleeping.map(a => a.id));

    for (const a of activeSleeping) {
      if (matchesAnchor(a)) {
        candidates.push(a);
        seenIds.add(a.id);
      }
    }

    if (options.includeArchive !== false) {
      const archived = this.listArchive(100);
      for (const a of archived) {
        if (!seenIds.has(a.id) && !activeSleepingIds.has(a.id)) {
          if (matchesAnchor(a)) {
            candidates.push(a);
            seenIds.add(a.id);
          }
        }
      }
    }

    const limit = options.limit || 20;
    return candidates.slice(0, limit);
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

      const tmpArchive = `${this.archivePath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpArchive, lines.length > 0 ? lines.join('\n') + '\n' : '', 'utf-8');
      atomicRenameWithRetry(tmpArchive, this.archivePath);

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
