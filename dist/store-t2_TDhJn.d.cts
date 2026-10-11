/**
 * Anchor Data Contracts & Type Definitions
 * Single Global Source of Truth with Zero Workspace Contamination.
 */
type AnchorStatus = 'active' | 'sleeping' | 'settled' | 'graveyard';
type AnchorPriority = 'p0' | 'p1' | 'p2';
type AnchorDurability = 'ephemeral' | 'durable';
interface AnchorDecayPolicy {
    /** Days before an untouched active anchor transitions to sleeping */
    activeDays: number;
    /** Days an anchor remains sleeping before dropping to graveyard */
    sleepDays: number;
    /** Total maximum days before permanent graveyard sweep (9999 = never) */
    graveyardDays: number;
}
interface AnchorEvidence {
    settledAt?: number;
    settledBy?: 'one-tap-settlement' | 'manual-command' | 'verification-test';
    commitHash?: string;
    summary?: string;
    touchedFiles?: string[];
}
interface Anchor {
    /** Unique sequential identifier, e.g., 'anc-1' */
    id: string;
    /** Short imperative title of the task */
    title: string;
    /** Optional detailed context or notes */
    description?: string;
    /** Task priority */
    priority: AnchorPriority;
    /** Current lifecycle status */
    status: AnchorStatus;
    /** Durability tier: ephemeral (short-lived reminder, 48h TTL) or durable (long-term architecture vision) */
    durability: AnchorDurability;
    /** Canonical project name (e.g. 'PPT', 'X', or 'global') */
    project: string;
    /** Canonical root directory where the task was anchored (empty string for global tasks) */
    cwd: string;
    /** Creation timestamp in ms */
    createdAt: number;
    /** Last update timestamp in ms */
    updatedAt: number;
    /** Last touched timestamp in ms (resets on file touch) */
    lastTouchedAt: number;
    /** Associated file paths or globs, e.g. ['src/auth/*.ts'] */
    files: string[];
    /** Expected completion date in format 'YYYY-MM-DD' (e.g. '2026-09-24') */
    targetDate?: string;
    /** Optional shell command for automated physical verification (e.g. 'npm test') */
    verifyCommand?: string;
    /** Topic or domain tags, e.g. ['auth', 'security'] */
    tags: string[];
    /** Optional recurrence pattern: 'daily' for recurring daily habits */
    recurrence?: 'daily';
    /** Last completed date string 'YYYY-MM-DD' for recurring tasks */
    lastCompletedDate?: string;
    /** Decay policy overrides */
    decay: AnchorDecayPolicy;
    /** Settlement evidence metadata upon closure */
    evidence?: AnchorEvidence;
}
interface AnchorStoreState {
    version: number;
    anchors: Anchor[];
    lastSweepAt: number;
    nextId?: number;
}
interface TouchMatchResult {
    anchor: Anchor;
    score: number;
    matchedFiles: string[];
    reason: 'exact-file' | 'dir-prefix' | 'tag-keyword';
}
interface SettlementProposal {
    anchor: Anchor;
    matchedFiles: string[];
    reason: string;
    recommendedAction: 'settle' | 'defer';
}
declare const EPHEMERAL_DECAY_POLICY: AnchorDecayPolicy;
declare const DURABLE_DECAY_POLICY: AnchorDecayPolicy;
declare const DEFAULT_DECAY_POLICY: AnchorDecayPolicy;

/**
 * Detect whether a task is a short-term ephemeral reminder or a long-term architectural vision
 */
declare function detectDurability(title: string): AnchorDurability;
/**
 * Get custom ephemeral decay policy based on temporal span.
 * Note: graveyardDays is always 9999 so unfinished tasks are NEVER silently deleted.
 */
declare function getEphemeralDecayPolicy(title: string): AnchorDecayPolicy;
/**
 * Detect expected completion date from title keywords or explicit date string, returning 'YYYY-MM-DD'
 */
declare function detectTargetDate(titleOrDate: string, now?: number): string | undefined;
/**
 * Detect recurring patterns, e.g. daily habits
 */
declare function detectRecurrence(title: string): 'daily' | undefined;
/**
 * Get current date string 'YYYY-MM-DD' in local timezone
 */
declare function getTodayDateString(timestamp?: number): string;
/**
 * Resolve the default storage directory for Anchor (~/.anchor).
 * Hierarchy:
 * 1. Process environment: ANCHOR_DIR
 * 2. Canonical user-global store: ~/.anchor/
 * 3. Legacy Pi harness fallback: ~/.pi/agent/anchors/ (migrates automatically if present)
 */
declare function getDefaultStorageDir(): string;
/**
 * Acquire exclusive lockfile using atomic 'wx' file creation (zero external dependencies).
 * Features:
 * - 0 async infection (100% synchronous)
 * - Automatic stale lock eviction (>5000ms or dead PID)
 * - Exponential backoff with jitter
 */
declare function acquireSyncLock(lockPath: string, maxWaitMs?: number, staleTimeoutMs?: number): () => void;
/**
 * Windows-tolerant atomic rename with exponential spin-retry to combat NTFS EBUSY/EPERM file locks
 */
declare function atomicRenameWithRetry(tempPath: string, targetPath: string, maxAttempts?: number): void;
declare class AnchorStore {
    readonly storageDir: string;
    readonly statePath: string;
    readonly archivePath: string;
    readonly graveyardPath: string;
    constructor(customStorageDir?: string);
    get lockPath(): string;
    /**
     * Execute mutation within a cross-process exclusive lock
     */
    withLock<T>(fn: () => T): T;
    private ensureDirs;
    /**
     * Load store state. If corrupt or missing, returns safe default.
     */
    loadState(): AnchorStoreState;
    /**
     * Atomically save store state via temp file + atomic rename with Windows NTFS spin-retry
     */
    saveState(state: AnchorStoreState): void;
    private generateId;
    /**
     * Create a new Anchor with automatic project and cwd tagging
     */
    create(input: {
        title: string;
        description?: string;
        priority?: AnchorPriority;
        durability?: AnchorDurability;
        recurrence?: 'daily';
        cwd?: string;
        project?: string;
        targetDate?: string;
        files?: string[];
        tags?: string[];
        verifyCommand?: string;
        decay?: AnchorDecayPolicy;
    }): Anchor;
    private findAnchorIndex;
    /**
     * Get an anchor by ID (supports 'anc-1', '#anc-1', '1', '01')
     */
    get(id: string): Anchor | undefined;
    /**
     * List anchors. By default, if cwd is provided, only returns anchors
     * belonging to this cwd or marked as global (''). Pass all: true for global view.
     */
    list(filter?: {
        status?: AnchorStatus;
        priority?: AnchorPriority;
        cwd?: string;
        all?: boolean;
        now?: number;
    }): Anchor[];
    /**
     * Update an existing anchor
     */
    update(id: string, patch: Partial<Omit<Anchor, 'id' | 'createdAt'>>): Anchor;
    /**
     * Touch an anchor to refresh its decay window and reactivate sleeping state
     */
    touch(id: string, timestamp?: number): Anchor;
    /**
     * Settle an anchor (recurring daily habits complete for today and wake up tomorrow)
     */
    settle(id: string, evidence?: AnchorEvidence, now?: number): Anchor;
    /**
     * Reverse/undo the last settled anchor, popping it from archive.jsonl back into state.json
     */
    undoSettle(): Anchor;
    /**
     * Evict anchor to graveyard.jsonl upon total decay expiry
     */
    dropToGraveyard(id: string, reason: string): Anchor;
    getArchive(filter?: {
        cwd?: string;
        all?: boolean;
    }): Anchor[];
    getGraveyard(filter?: {
        cwd?: string;
        all?: boolean;
    }): Anchor[];
}

export { AnchorStore as A, DEFAULT_DECAY_POLICY as D, EPHEMERAL_DECAY_POLICY as E, type SettlementProposal as S, type TouchMatchResult as T, type AnchorStatus as a, type Anchor as b, type AnchorDecayPolicy as c, type AnchorDurability as d, type AnchorEvidence as e, type AnchorPriority as f, type AnchorStoreState as g, DURABLE_DECAY_POLICY as h, acquireSyncLock as i, atomicRenameWithRetry as j, detectDurability as k, detectRecurrence as l, detectTargetDate as m, getDefaultStorageDir as n, getEphemeralDecayPolicy as o, getTodayDateString as p };
