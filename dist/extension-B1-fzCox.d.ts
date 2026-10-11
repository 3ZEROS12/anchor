import { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/**
 * Anchor Data Contracts
 * Minimalist cross-session sticky notes stored in ~/.anchor/state.json
 */
type AnchorStatus = 'active' | 'sleeping' | 'settled';
type AnchorPriority = 'p0' | 'p1' | 'p2';
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
    /** Associated file paths or globs (explicit or auto-extracted from note text) */
    files: string[];
    /** Optional tags */
    tags: string[];
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
    }): Anchor;
    private findAnchorIndex;
    get(id: string): Anchor | undefined;
    list(filter?: {
        status?: AnchorStatus;
        cwd?: string;
        all?: boolean;
    }): Anchor[];
    update(id: string, patch: Partial<Omit<Anchor, 'id' | 'createdAt'>>): Anchor;
    touch(id: string, timestamp?: number): Anchor;
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
    mode: 'dashboard' | 'undo' | 'settle' | 'pin';
    targetId?: string;
    title?: string;
};
declare function resolveAnchorTarget(store: AnchorStore, idOrIndex: string, cwd?: string): string | undefined;
declare function export_default(pi: ExtensionAPI): void;

export { type Anchor as A, COMMENT_FORMATS as C, MS_PER_DAY as M, QUIET_AFTER_DAYS as Q, type TouchMatchResult as T, AnchorStore as a, type AnchorEvidence as b, type AnchorPriority as c, type AnchorStatus as d, type AnchorStoreState as e, acquireSyncLock as f, atomicRenameWithRetry as g, extractPathsFromText as h, findMatchedAnchors as i, getDefaultStorageDir as j, globToRegExp as k, isAnchorTargetingWorkspace as l, isSameOrSubPath as m, makeSafeTaskAnnotation as n, matchAnchorAgainstTouchedFiles as o, matchesCommitMessage as p, normalizePath as q, parseAnchorCommandInput as r, renderActiveAnchorsContext as s, renderColdStartAnchorsContext as t, resolveAnchorTarget as u, sweepQuietNotes as v, export_default as w };
