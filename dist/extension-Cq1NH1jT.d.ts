import { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/**
 * Anchor Data Contracts
 * Minimalist cross-session sticky notes stored in ~/.anchor/state.json
 */
type AnchorStatus = 'active' | 'sleeping' | 'settled';
type AnchorPriority = 'p0' | 'p1' | 'p2';
interface AnchorProgress {
    /** Completed steps or units */
    done: number;
    /** Total steps or units */
    total: number;
    /** Optional parsed step labels (e.g. ['抽出接口', '替换Cookie', '补单测']) */
    steps?: string[];
}
interface AnchorEvidence {
    settledAt?: number;
    settledBy?: 'commit' | 'manual' | 'one-tap-settlement' | 'manual-command' | 'verification-test';
    commitHash?: string;
    summary?: string;
    touchedFiles?: string[];
}
interface Anchor {
    /** Sequential identifier, e.g. 'anc-1' */
    id: string;
    /** Sticky note text */
    title: string;
    /** Optional extra context */
    description?: string;
    /** Lifecycle status: 'active' (recent) or 'sleeping' (>7d untouched, 0 prompt tokens) */
    status: AnchorStatus;
    /** Short workspace label (e.g. 'anchor', 'College/优化', or 'global') */
    project: string;
    /** Workspace directory path where the note applies */
    cwd: string;
    /** Creation timestamp (ms) */
    createdAt: number;
    /** Last update timestamp (ms) */
    updatedAt: number;
    /** Last activity timestamp (ms) */
    lastTouchedAt: number;
    /** Associated file paths or globs (explicit, auto-extracted from note text, or inherited from active session) */
    files: string[];
    /** Optional tags */
    tags: string[];
    /** Associated Pi conversation session file (.jsonl) for 1-click session jump/resume */
    sessionFile?: string;
    /** Optional lightweight progress tracker for long-term or multi-step notes */
    progress?: AnchorProgress;
    /** Optional due date ('YYYY-MM-DD') */
    targetDate?: string;
    /** Optional priority kept for backward compatibility */
    priority?: AnchorPriority;
    /** Settlement metadata when archived */
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
    reason: 'exact-file' | 'dir-prefix';
}
/** 7 days without activity moves a note to quiet mode (still visible in UI, 0 prompt tokens in unrelated workspaces) */
declare const QUIET_AFTER_DAYS = 7;
declare const MS_PER_DAY = 86400000;

/**
 * Normalize path separators to forward slashes and strip baseCwd prefix when inside baseCwd
 */
declare function normalizePath(filePath: string, baseCwd?: string): string;
/**
 * Safe boundary-aware directory comparison (case-insensitive on Windows)
 */
declare function isSameOrSubPath(dirA?: string, dirB?: string): boolean;
/**
 * Convert simple glob pattern (*.ts, src/**\/*.ts) to safe RegExp
 */
declare function globToRegExp(pattern: string): RegExp;
/**
 * Clever Touch 1: Automatically spot file or directory paths mentioned inside a sticky note
 * (e.g. "src/auth.ts", "D:/College/优化/notes.md") so the user never has to fill out forms.
 */
declare function extractPathsFromText(text?: string): string[];
/**
 * Automatically extract lightweight progress metadata from note text if present:
 * - Explicit ratio: `[2/5]`, `(3/10)`, or standalone `5/30` (where 0 <= done <= total and 2 <= total <= 500)
 * - Numbered inline steps: `1. 抽出接口 2. 替换Cookie 3. 补单测`
 */
declare function extractProgressFromText(rawTitle: string): {
    cleanTitle: string;
    progress?: AnchorProgress;
};
/**
 * Check if a sticky note belongs to or targets the given workspace directory
 */
declare function isAnchorTargetingWorkspace(anchor: Anchor, targetCwd?: string): boolean;
/**
 * Match touched files against an anchor's file patterns
 */
declare function matchAnchorAgainstTouchedFiles(anchor: Anchor, touchedFiles: string[]): TouchMatchResult | null;
declare function findMatchedAnchors(anchors: Anchor[], touchedFiles: string[]): TouchMatchResult[];
/**
 * Clever Touch 2: Syntax-safe 1-line comment whisper when the AI reads/edits a matching file.
 * Strictly skips JSON, ENV, lockfiles, and binaries so parsers are never broken.
 */
declare const COMMENT_FORMATS: Record<string, (msg: string) => string>;
declare function makeSafeTaskAnnotation(filePath: string, anchor: Anchor): string | null;
/**
 * Clever Touch 3: Match a `git commit -m "..."` message against a sticky note (supports CJK & English)
 */
declare function matchesCommitMessage(anchor: Anchor, commitMessages: string[]): {
    matched: boolean;
    message?: string;
};
/**
 * Render ultra-compact Turn-1 sticky note context for the AI.
 * Turn 2+ consumes 0 tokens.
 */
declare function renderColdStartAnchorsContext(store: AnchorStore, cwdOrNow?: string | number, nowArg?: number): string;
declare const renderActiveAnchorsContext: typeof renderColdStartAnchorsContext;
/**
 * Transition notes untouched for >7 days to 'sleeping' (quiet mode) so they don't burn Turn-1 tokens
 * in unrelated sessions, while NEVER deleting them.
 */
declare function sweepQuietNotes(store: AnchorStore, now?: number): {
    quieted: string[];
};
declare function getDefaultStorageDir(): string;
declare function acquireSyncLock(lockPath: string, maxWaitMs?: number, staleTimeoutMs?: number): () => void;
declare function atomicRenameWithRetry(tempPath: string, targetPath: string, maxRetries?: number): void;
declare class AnchorStore {
    readonly storageDir: string;
    readonly statePath: string;
    readonly lockPath: string;
    readonly archivePath: string;
    constructor(storageDir?: string);
    private ensureDirs;
    withLock<T>(fn: () => T): T;
    loadState(): AnchorStoreState;
    saveState(state: AnchorStoreState): void;
    private generateId;
    /**
     * Pin a new sticky note
     */
    create(input: {
        title: string;
        description?: string;
        priority?: AnchorPriority;
        cwd?: string;
        project?: string;
        files?: string[];
        tags?: string[];
        sessionFile?: string;
        progress?: AnchorProgress;
    }): Anchor;
    private findAnchorIndex;
    get(id: string): Anchor | undefined;
    list(filter?: {
        status?: AnchorStatus;
        cwd?: string;
        all?: boolean;
    }): Anchor[];
    update(id: string, patch: Partial<Omit<Anchor, 'id' | 'createdAt'>>): Anchor;
    touch(id: string, timestamp?: number, sessionFile?: string): Anchor;
    /**
     * Advance (or set) progress on a sticky note:
     * - If delta is provided (default +1), increments `done` up to `total`.
     * - If note had no progress yet, initializes a 4-step bar (`1/4`).
     */
    step(id: string, delta?: number, explicitTotal?: number): {
        anchor: Anchor;
        completed: boolean;
    };
    /**
     * Tear off (settle) a completed sticky note and archive it to archive.jsonl
     */
    settle(id: string, evidence?: AnchorEvidence, now?: number): Anchor;
    /**
     * Put back (undo) the last torn-off sticky note
     */
    undoSettle(): Anchor;
}

declare function parseAnchorCommandInput(raw: string): {
    mode: 'dashboard' | 'undo' | 'settle' | 'step' | 'jump' | 'pin';
    targetId?: string;
    delta?: number;
    title?: string;
};
/**
 * Detect 0ms human-first quick note prefix in the input box:
 * e.g. `pin: 明天把Token改Cookie` or `便签: 检查网关重试 [1/4]`
 */
declare function parseQuickNoteInput(text: string): string | null;
declare function resolveAnchorTarget(store: AnchorStore, idOrIndex: string, cwd?: string): string | undefined;
declare function export_default(pi: ExtensionAPI): void;

export { type Anchor as A, COMMENT_FORMATS as C, MS_PER_DAY as M, QUIET_AFTER_DAYS as Q, type TouchMatchResult as T, type AnchorProgress as a, AnchorStore as b, type AnchorEvidence as c, type AnchorPriority as d, type AnchorStatus as e, type AnchorStoreState as f, acquireSyncLock as g, atomicRenameWithRetry as h, extractPathsFromText as i, extractProgressFromText as j, findMatchedAnchors as k, getDefaultStorageDir as l, globToRegExp as m, isAnchorTargetingWorkspace as n, isSameOrSubPath as o, makeSafeTaskAnnotation as p, matchAnchorAgainstTouchedFiles as q, matchesCommitMessage as r, normalizePath as s, parseAnchorCommandInput as t, parseQuickNoteInput as u, renderActiveAnchorsContext as v, renderColdStartAnchorsContext as w, resolveAnchorTarget as x, sweepQuietNotes as y, export_default as z };
