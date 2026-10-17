import { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/**
 * Anchor v1.0 Domain Contracts
 * Cross-Session Task & Todo Dock + Instant Sticky Notes (`~/.anchor/state.json`)
 */
type AnchorStatus = 'active' | 'sleeping' | 'settled';
type AnchorPriority = 'p0' | 'p1' | 'p2';
type StepStatus = 'pending' | 'in_progress' | 'completed' | 'deleted';
interface AnchorStep {
    /** 1-based step id within the anchor */
    id: number;
    /** Imperative step title */
    subject: string;
    /** 4-state lifecycle matching `todo` tool */
    status: StepStatus;
    /** Live present-continuous activity label (e.g. 'editing src/auth.ts') */
    activeForm?: string;
    /** Prerequisite step IDs within the same anchor (`⛓ #1`) */
    blockedBy?: number[];
}
interface AnchorProgress {
    /** Completed steps or units */
    done: number;
    /** Total steps or units */
    total: number;
    /** Flat step titles for backward compatibility */
    steps?: string[];
    /** Rich structured step items with status, activeForm, and blockedBy DAG */
    items?: AnchorStep[];
}
interface AnchorEvidence {
    settledAt?: number;
    settledBy?: 'commit' | 'manual' | 'todo-complete' | 'one-tap-settlement' | 'manual-command' | 'verification-test';
    commitHash?: string;
    summary?: string;
    touchedFiles?: string[];
}
interface TodoTaskItem {
    id: number;
    subject: string;
    status: StepStatus;
    activeForm?: string;
    description?: string;
    blockedBy?: number[];
    owner?: string;
}
interface Anchor {
    /** Sequential identifier, e.g. 'anc-1' */
    id: string;
    /** Primary title or sticky note text */
    title: string;
    /** Optional detailed context */
    description?: string;
    /** Lifecycle status: 'active' (recent) or 'sleeping' (>7d untouched, 0 prompt tokens) */
    status: AnchorStatus;
    /** Origin source: 'manual' (user/tool pinned) or 'todo-sync' (auto-bridged from session todos) */
    source?: 'manual' | 'todo-sync';
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
    /** Associated file paths or globs */
    files: string[];
    /** Optional domain tags */
    tags: string[];
    /** Live present-continuous activity indicator (e.g. 'editing src/auth.ts') */
    activeForm?: string;
    /** Prerequisite anchor IDs (e.g. ['anc-1']) for cross-task sequencing */
    blockedBy?: string[];
    /** Associated Pi conversation session file (.jsonl) for 1-click session teleport (`/back`) */
    sessionFile?: string;
    /** Progress tracker & structured step tree */
    progress?: AnchorProgress;
    /** Optional due date ('YYYY-MM-DD') */
    targetDate?: string;
    /** Priority tier */
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
interface StepCounts {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
}
interface DockStepLayout {
    visible: AnchorStep[];
    hiddenCompleted: number;
    truncatedTail: number;
}
/** 7 days without activity moves a note to quiet mode (still visible in UI, 0 prompt tokens in unrelated workspaces) */
declare const QUIET_AFTER_DAYS = 7;
declare const MS_PER_DAY = 86400000;
declare const DEFAULT_MAX_DOCK_LINES = 8;

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
        source?: 'manual' | 'todo-sync';
        cwd?: string;
        project?: string;
        files?: string[];
        tags?: string[];
        blockedBy?: string[];
        activeForm?: string;
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
     * Add a structured sub-step to an anchor (with DAG dependency validation)
     */
    addStep(id: string, subject: string, options?: {
        blockedBy?: number[];
        activeForm?: string;
        status?: StepStatus;
    }): Anchor;
    /**
     * Update a specific sub-step within an anchor (status, subject, activeForm, or blockedBy DAG edges)
     */
    updateStep(id: string, stepId: number, patch: {
        status?: StepStatus;
        subject?: string;
        activeForm?: string;
        addBlockedBy?: number[];
        removeBlockedBy?: number[];
    }): Anchor;
    /**
     * Read recent settled/archived notes from `archive.jsonl` (newest first)
     */
    listArchive(limit?: number): Anchor[];
    /**
     * Clever Touch 4 (Todo-Bridge): Automatically mirror intra-session `todo` tool lists
     * into a cross-session checkpoint!
     * - While tasks are in_progress/pending: updates the live `[■■□□ done/total]` checkpoint on disk;
     * - When all tasks in the todo list reach `completed`: automatically tears off the checkpoint!
     */
    syncFromTodoTool(tasks: TodoTaskItem[], options?: {
        cwd?: string;
        sessionFile?: string;
        recentFiles?: string[];
    }): {
        status: 'synced' | 'completed' | 'noop';
        anchor?: Anchor;
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
    mode: 'dashboard' | 'undo' | 'fold' | 'settle' | 'step' | 'jump' | 'pin' | 'now';
    targetId?: string;
    delta?: number;
    title?: string;
};
/**
 * Detect 0ms human-first quick note prefix in the input box:
 * e.g. `pin: 明天把Token改Cookie` or `便签: 检查网关重试 [1/4]`
 * Returns `{ matched: true, note: '...' }` (or `note: ''` if user typed bare `pin:`)
 */
declare function parseQuickNoteInput(text: string): string | null;
/**
 * Resolve note target by exact ID first (`#2` -> `anc-2`), falling back to 1-based display row index
 * only when no note with that ID exists. Prevents settling the wrong note when sort order differs from ID order!
 */
declare function resolveAnchorTarget(store: AnchorStore, idOrIndex: string, cwd?: string): string | undefined;
declare function export_default(pi: ExtensionAPI): void;

export { type AnchorStep as A, renderColdStartAnchorsContext as B, COMMENT_FORMATS as C, type DockStepLayout as D, resolveAnchorTarget as E, sweepQuietNotes as F, export_default as G, MS_PER_DAY as M, QUIET_AFTER_DAYS as Q, type StepCounts as S, type TodoTaskItem as T, type AnchorProgress as a, type Anchor as b, type StepStatus as c, AnchorStore as d, type AnchorEvidence as e, type AnchorPriority as f, type AnchorStatus as g, type AnchorStoreState as h, DEFAULT_MAX_DOCK_LINES as i, type TouchMatchResult as j, acquireSyncLock as k, atomicRenameWithRetry as l, extractPathsFromText as m, extractProgressFromText as n, findMatchedAnchors as o, getDefaultStorageDir as p, globToRegExp as q, isAnchorTargetingWorkspace as r, isSameOrSubPath as s, makeSafeTaskAnnotation as t, matchAnchorAgainstTouchedFiles as u, matchesCommitMessage as v, normalizePath as w, parseAnchorCommandInput as x, parseQuickNoteInput as y, renderActiveAnchorsContext as z };
