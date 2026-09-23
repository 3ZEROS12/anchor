import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  Anchor,
  AnchorEvidence,
  AnchorPriority,
  AnchorScope,
  AnchorStatus,
  AnchorStoreState
} from './types.ts';
import { DEFAULT_DECAY_POLICY } from './types.ts';

export class AnchorStore {
  public readonly rootDir: string;
  public readonly scope: AnchorScope;
  public readonly anchorDir: string;
  public readonly statePath: string;
  public readonly archivePath: string;
  public readonly graveyardPath: string;

  constructor(rootDir: string = process.cwd(), scope: AnchorScope = 'project', customGlobalDir?: string) {
    this.rootDir = path.resolve(rootDir);
    this.scope = scope;
    if (scope === 'global') {
      this.anchorDir = customGlobalDir || path.join(os.homedir(), '.pi', 'agent', 'anchors');
    } else {
      this.anchorDir = path.join(this.rootDir, '.anchor');
    }
    this.statePath = path.join(this.anchorDir, 'state.json');
    this.archivePath = path.join(this.anchorDir, 'archive.jsonl');
    this.graveyardPath = path.join(this.anchorDir, 'graveyard.jsonl');
    this.ensureDirs();
  }

  private ensureDirs(): void {
    if (!fs.existsSync(this.anchorDir)) {
      try {
        fs.mkdirSync(this.anchorDir, { recursive: true });
      } catch {}
    }
  }

  /**
   * Load current store state. If non-existent or corrupted, returns clean default.
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
        throw new Error('Invalid state structure: anchors must be an array');
      }
      return data as AnchorStoreState;
    } catch (err) {
      // Backup corrupted file for forensic safety and initialize clean slate
      const backupPath = path.join(this.anchorDir, `state.corrupt.${Date.now()}.json`);
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
    const tempPath = path.join(this.anchorDir, `state.tmp.${process.pid}.${Date.now()}`);
    const serialized = JSON.stringify(state, null, 2);
    fs.writeFileSync(tempPath, serialized, 'utf-8');
    fs.renameSync(tempPath, this.statePath);
  }

  /**
   * Generate next sequential ID, e.g. 'anc-1', 'anc-2'
   */
  private generateId(existingAnchors: Anchor[]): string {
    const prefix = this.scope === 'global' ? 'anc-g' : 'anc-';
    const regex = new RegExp(`^${prefix}(\\d+)$`);
    const numbers = existingAnchors
      .map(a => {
        const match = a.id.match(regex);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => n > 0);
    const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    return `${prefix}${nextNum}`;
  }

  /**
   * Create a new Anchor
   */
  public create(input: {
    title: string;
    description?: string;
    priority?: AnchorPriority;
    files?: string[];
    tags?: string[];
    scope?: AnchorScope;
  }): Anchor {
    const state = this.loadState();
    const now = Date.now();
    const id = this.generateId(state.anchors);

    const anchor: Anchor = {
      id,
      title: input.title.trim(),
      description: input.description?.trim(),
      priority: input.priority || 'p1',
      status: 'active',
      scope: input.scope || this.scope,
      createdAt: now,
      updatedAt: now,
      lastTouchedAt: now,
      files: (input.files || []).map(f => f.trim().replace(/\\/g, '/')).filter(Boolean),
      tags: (input.tags || []).map(t => t.trim()).filter(Boolean),
      decay: { ...DEFAULT_DECAY_POLICY }
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
   * List anchors with optional status/priority filtering
   */
  public list(filter?: { status?: AnchorStatus; priority?: AnchorPriority }): Anchor[] {
    const state = this.loadState();
    return state.anchors.filter(a => {
      if (filter?.status && a.status !== filter.status) return false;
      if (filter?.priority && a.priority !== filter.priority) return false;
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
      updated.files = patch.files.map(f => f.trim().replace(/\\/g, '/')).filter(Boolean);
    }

    state.anchors[idx] = updated;
    this.saveState(state);
    return updated;
  }

  /**
   * Touch an anchor to refresh its decay window and reactivate sleeping anchor
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
      current.status = 'active'; // Wake up upon file touch
    }

    state.anchors[idx] = current;
    this.saveState(state);
    return current;
  }

  /**
   * Settle and archive an anchor (closing the contract)
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

    // 1. Append to archive.jsonl
    this.ensureDirs();
    fs.appendFileSync(this.archivePath, JSON.stringify(anchor) + '\n', 'utf-8');

    // 2. Save active state without this anchor
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
}

/**
 * Multi-scope store manager handling both Project-local (.anchor/) and User-global (~/.pi/agent/anchors/)
 */
export class DualAnchorStore {
  public readonly projectStore: AnchorStore;
  public readonly globalStore: AnchorStore;

  constructor(cwd: string = process.cwd(), customGlobalDir?: string) {
    this.projectStore = new AnchorStore(cwd, 'project');
    this.globalStore = new AnchorStore(cwd, 'global', customGlobalDir);
  }

  public getStoreForScope(scope: AnchorScope): AnchorStore {
    return scope === 'global' ? this.globalStore : this.projectStore;
  }

  public get(id: string): { anchor: Anchor; store: AnchorStore } | undefined {
    const inProj = this.projectStore.get(id);
    if (inProj) return { anchor: inProj, store: this.projectStore };
    const inGlob = this.globalStore.get(id);
    if (inGlob) return { anchor: inGlob, store: this.globalStore };
    return undefined;
  }

  public list(filter?: { status?: AnchorStatus; priority?: AnchorPriority; scope?: AnchorScope | 'all' }): Anchor[] {
    const targetScope = filter?.scope || 'all';
    let res: Anchor[] = [];
    if (targetScope === 'all' || targetScope === 'project') {
      res = res.concat(this.projectStore.list(filter));
    }
    if (targetScope === 'all' || targetScope === 'global') {
      res = res.concat(this.globalStore.list(filter));
    }
    return res;
  }

  public create(input: {
    title: string;
    description?: string;
    priority?: AnchorPriority;
    files?: string[];
    tags?: string[];
    scope?: AnchorScope;
  }): Anchor {
    const targetScope = input.scope || 'project';
    const store = this.getStoreForScope(targetScope);
    return store.create(input);
  }

  public settle(id: string, evidence?: AnchorEvidence): Anchor {
    const item = this.get(id);
    if (!item) throw new Error(`Anchor not found: ${id}`);
    return item.store.settle(id, evidence);
  }

  public touch(id: string, timestamp?: number): Anchor {
    const item = this.get(id);
    if (!item) throw new Error(`Anchor not found: ${id}`);
    return item.store.touch(id, timestamp);
  }

  public dropToGraveyard(id: string, reason: string): Anchor {
    const item = this.get(id);
    if (!item) throw new Error(`Anchor not found: ${id}`);
    return item.store.dropToGraveyard(id, reason);
  }
}
