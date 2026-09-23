import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  Anchor,
  AnchorDurability,
  AnchorEvidence,
  AnchorPriority,
  AnchorStatus,
  AnchorStoreState
} from './types.ts';
import { DEFAULT_DECAY_POLICY, DURABLE_DECAY_POLICY, EPHEMERAL_DECAY_POLICY } from './types.ts';
import { normalizePath } from './matcher.ts';

/**
 * Detect whether a task is a short-term ephemeral reminder or a long-term architectural vision
 */
export function detectDurability(title: string): AnchorDurability {
  const temporalKeywords = [
    '晚上', '今晚', '明天', '稍后', '待会', '下午', '临时', '一会儿', '等等',
    'tonight', 'tomorrow', 'later', 'temp', 'today', 'soon'
  ];
  const lower = title.toLowerCase();
  for (const kw of temporalKeywords) {
    if (lower.includes(kw)) {
      return 'ephemeral';
    }
  }
  return 'durable';
}

export class AnchorStore {
  public readonly storageDir: string;
  public readonly statePath: string;
  public readonly archivePath: string;
  public readonly graveyardPath: string;

  constructor(customStorageDir?: string) {
    if (customStorageDir) {
      this.storageDir = path.resolve(customStorageDir);
    } else {
      this.storageDir = path.join(os.homedir(), '.pi', 'agent', 'anchors');
    }
    this.statePath = path.join(this.storageDir, 'state.json');
    this.archivePath = path.join(this.storageDir, 'archive.jsonl');
    this.graveyardPath = path.join(this.storageDir, 'graveyard.jsonl');
    this.ensureDirs();
  }

  private ensureDirs(): void {
    if (!fs.existsSync(this.storageDir)) {
      try {
        fs.mkdirSync(this.storageDir, { recursive: true });
      } catch {}
    }
  }

  /**
   * Load store state. If corrupt or missing, returns safe default.
   */
  public loadState(): AnchorStoreState {
    this.ensureDirs();
    if (!fs.existsSync(this.statePath)) {
      return {
        version: 1,
        anchors: [],
        lastSweepAt: Date.now()
      };
    }

    try {
      const raw = fs.readFileSync(this.statePath, 'utf-8');
      const data = JSON.parse(raw);
      if (!Array.isArray(data.anchors)) {
        throw new Error('Invalid state: anchors must be array');
      }
      return data as AnchorStoreState;
    } catch {
      const backupPath = path.join(this.storageDir, `state.corrupt.${Date.now()}.json`);
      try {
        fs.renameSync(this.statePath, backupPath);
      } catch {}
      return {
        version: 1,
        anchors: [],
        lastSweepAt: Date.now()
      };
    }
  }

  /**
   * Atomically save store state via temp file + atomic rename
   */
  public saveState(state: AnchorStoreState): void {
    this.ensureDirs();
    const tempPath = path.join(this.storageDir, `state.tmp.${process.pid}.${Date.now()}`);
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tempPath, this.statePath);
  }

  private generateId(existingAnchors: Anchor[]): string {
    const numbers = existingAnchors
      .map(a => {
        const match = a.id.match(/^anc-(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => n > 0);
    const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    return `anc-${nextNum}`;
  }

  /**
   * Create a new Anchor with automatic project and cwd tagging
   */
  public create(input: {
    title: string;
    description?: string;
    priority?: AnchorPriority;
    durability?: AnchorDurability;
    cwd?: string;
    project?: string;
    files?: string[];
    tags?: string[];
    verifyCommand?: string;
  }): Anchor {
    const state = this.loadState();
    const now = Date.now();
    const id = this.generateId(state.anchors);

    const cwd = input.cwd ? normalizePath(input.cwd) : '';
    const projectName = input.project
      ? input.project.trim()
      : (cwd ? path.basename(cwd) : 'global');

    const durability = input.durability || detectDurability(input.title);
    const decayPolicy = durability === 'ephemeral' ? EPHEMERAL_DECAY_POLICY : DEFAULT_DECAY_POLICY;

    const anchor: Anchor = {
      id,
      title: input.title.trim(),
      description: input.description?.trim(),
      priority: input.priority || 'p1',
      status: 'active',
      durability,
      project: projectName,
      cwd,
      createdAt: now,
      updatedAt: now,
      lastTouchedAt: now,
      files: (input.files || []).map(f => normalizePath(f)).filter(Boolean),
      tags: (input.tags || []).map(t => t.trim()).filter(Boolean),
      verifyCommand: input.verifyCommand?.trim() || undefined,
      decay: { ...decayPolicy }
    };

    state.anchors.push(anchor);
    this.saveState(state);
    return anchor;
  }

  /**
   * Get an anchor by ID
   */
  public get(id: string): Anchor | undefined {
    const state = this.loadState();
    return state.anchors.find(a => a.id === id);
  }

  /**
   * List anchors. By default, if cwd is provided, only returns anchors
   * belonging to this cwd or marked as global (''). Pass all: true for global view.
   */
  public list(filter?: {
    status?: AnchorStatus;
    priority?: AnchorPriority;
    cwd?: string;
    all?: boolean;
  }): Anchor[] {
    const state = this.loadState();
    const targetCwd = filter?.cwd ? normalizePath(filter.cwd) : null;

    return state.anchors.filter(a => {
      if (filter?.status && a.status !== filter.status) return false;
      if (filter?.priority && a.priority !== filter.priority) return false;

      // Project context filtering:
      // If an anchor has specific code files attached, scope it to that cwd.
      // If an anchor has NO code files attached (habits, general tasks, study), it is universal and visible everywhere!
      if (!filter?.all && targetCwd) {
        if (a.files.length > 0 && a.cwd && a.cwd !== targetCwd) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Update an existing anchor
   */
  public update(id: string, patch: Partial<Omit<Anchor, 'id' | 'createdAt'>>): Anchor {
    const state = this.loadState();
    const idx = state.anchors.findIndex(a => a.id === id);
    if (idx === -1) {
      throw new Error(`Anchor not found: ${id}`);
    }

    const current = state.anchors[idx];
    const updated: Anchor = {
      ...current,
      ...patch,
      updatedAt: Date.now()
    };

    if (patch.files) {
      updated.files = patch.files.map(f => normalizePath(f)).filter(Boolean);
    }

    state.anchors[idx] = updated;
    this.saveState(state);
    return updated;
  }

  /**
   * Touch an anchor to refresh its decay window and reactivate sleeping state
   */
  public touch(id: string, timestamp: number = Date.now()): Anchor {
    const state = this.loadState();
    const idx = state.anchors.findIndex(a => a.id === id);
    if (idx === -1) {
      throw new Error(`Anchor not found: ${id}`);
    }

    const current = state.anchors[idx];
    current.lastTouchedAt = timestamp;
    current.updatedAt = timestamp;
    if (current.status === 'sleeping') {
      current.status = 'active';
    }

    state.anchors[idx] = current;
    this.saveState(state);
    return current;
  }

  /**
   * Settle and archive an anchor
   */
  public settle(id: string, evidence: AnchorEvidence = {}): Anchor {
    const state = this.loadState();
    const idx = state.anchors.findIndex(a => a.id === id);
    if (idx === -1) {
      throw new Error(`Anchor not found: ${id}`);
    }

    const [anchor] = state.anchors.splice(idx, 1);
    anchor.status = 'settled';
    anchor.updatedAt = Date.now();
    anchor.evidence = {
      ...evidence,
      settledAt: Date.now(),
      settledBy: evidence.settledBy || 'manual-command'
    };

    this.ensureDirs();
    fs.appendFileSync(this.archivePath, JSON.stringify(anchor) + '\n', 'utf-8');
    this.saveState(state);
    return anchor;
  }

  /**
   * Reverse/undo the last settled anchor, popping it from archive.jsonl back into state.json
   */
  public undoSettle(): Anchor {
    if (!fs.existsSync(this.archivePath)) {
      throw new Error('No archived anchors to undo');
    }

    const raw = fs.readFileSync(this.archivePath, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    if (lines.length === 0) {
      throw new Error('Archive is empty, nothing to undo');
    }

    const lastLine = lines.pop()!;
    const anchor: Anchor = JSON.parse(lastLine);

    // 1. Re-write archive without the last line
    fs.writeFileSync(this.archivePath, lines.length > 0 ? lines.join('\n') + '\n' : '', 'utf-8');

    // 2. Restore to active state
    anchor.status = 'active';
    anchor.updatedAt = Date.now();
    delete anchor.evidence;

    const state = this.loadState();
    state.anchors.push(anchor);
    this.saveState(state);

    return anchor;
  }

  /**
   * Evict anchor to graveyard.jsonl upon total decay expiry
   */
  public dropToGraveyard(id: string, reason: string): Anchor {
    const state = this.loadState();
    const idx = state.anchors.findIndex(a => a.id === id);
    if (idx === -1) {
      throw new Error(`Anchor not found: ${id}`);
    }

    const [anchor] = state.anchors.splice(idx, 1);
    anchor.status = 'graveyard';
    anchor.updatedAt = Date.now();
    anchor.evidence = {
      summary: reason,
      settledAt: Date.now()
    };

    this.ensureDirs();
    fs.appendFileSync(this.graveyardPath, JSON.stringify(anchor) + '\n', 'utf-8');
    this.saveState(state);
    return anchor;
  }

  public getArchive(filter?: { cwd?: string; all?: boolean }): Anchor[] {
    if (!fs.existsSync(this.archivePath)) return [];
    try {
      const raw = fs.readFileSync(this.archivePath, 'utf-8');
      const all: Anchor[] = raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
      if (filter?.all || !filter?.cwd) return all;
      const targetCwd = normalizePath(filter.cwd);
      return all.filter(a => !a.cwd || a.cwd === targetCwd);
    } catch {
      return [];
    }
  }

  public getGraveyard(filter?: { cwd?: string; all?: boolean }): Anchor[] {
    if (!fs.existsSync(this.graveyardPath)) return [];
    try {
      const raw = fs.readFileSync(this.graveyardPath, 'utf-8');
      const all: Anchor[] = raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
      if (filter?.all || !filter?.cwd) return all;
      const targetCwd = normalizePath(filter.cwd);
      return all.filter(a => !a.cwd || a.cwd === targetCwd);
    } catch {
      return [];
    }
  }
}
