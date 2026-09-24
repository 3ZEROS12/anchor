import { ExtensionContext } from '@earendil-works/pi-coding-agent';

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
 * Get custom ephemeral decay policy based on temporal span (e.g. 后天, 大后天)
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
 * Resolve the canonical sovereign storage directory for Anchor.
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

interface DecayEvaluation {
    currentStatus: AnchorStatus;
    nextStatus: AnchorStatus;
    daysUntouched: number;
    remainingActiveDays: number;
    remainingSleepDays: number;
}
/**
 * Calculate precise decay status based on elapsed time since last touch
 */
declare function evaluateAnchorDecay(anchor: Anchor, now?: number): DecayEvaluation;
interface SweepResult {
    transitionedToSleeping: string[];
    wokenToActive: string[];
    evictedToGraveyard: string[];
}
/**
 * Run decay sweep across store: transitions statuses and evicts expired anchors
 */
declare function sweepStore(store: AnchorStore, now?: number): SweepResult;

/**
 * Convert simple glob pattern (e.g. *.ts, src/**\/*.ts, src/auth/*.ts) to RegExp
 */
declare function globToRegExp(pattern: string): RegExp;
/**
 * Normalize path separators to POSIX forward slashes and optionally relative to baseCwd
 */
declare function normalizePath(filePath: string, baseCwd?: string): string;
/**
 * Match touched files against an anchor's registered physical patterns
 * Only anchors with explicit files/globs/prefixes are matched against file touches.
 * Anchors with files: [] (pure mental notes or macro tasks) NEVER trigger on file operations.
 */
declare function matchAnchorAgainstTouchedFiles(anchor: Anchor, touchedFiles: string[]): TouchMatchResult | null;
/**
 * Filter and sort anchors that match a set of touched files
 * Prioritizes high confidence (exact > prefix > keyword) and priority (P0 > P1 > P2).
 */
declare function findMatchedAnchors(anchors: Anchor[], touchedFiles: string[]): TouchMatchResult[];

/**
 * Execute physical verification test command for an anchor
 */
declare function runPhysicalVerification(anchor: Anchor, cwd: string): {
    success: boolean;
    output: string;
};
/**
 * Generate settlement candidates based on files touched during the session
 */
declare function generateSettlementProposals(store: AnchorStore, touchedFiles: string[], cwd?: string): SettlementProposal[];
/**
 * Format settlement proposal into terminal-ready card
 */
declare function formatSettlementCard(proposal: SettlementProposal): string;

type AnchorQuadrant = 'Today' | 'Upcoming' | 'Habits' | 'Backlog';
interface GroupedAnchors {
    today: Anchor[];
    upcoming: Anchor[];
    habits: Anchor[];
    backlog: Anchor[];
}
/**
 * Classify anchor into one of four cognitive quadrants:
 * - 'Today': Due today or overdue
 * - 'Upcoming': Due in the future (tomorrow, in 2d, specific dates)
 * - 'Habits': Daily recurring habits
 * - 'Backlog': Open-ended long-term vision
 */
declare function classifyAnchor(anchor: Anchor, now?: number): AnchorQuadrant;
/**
 * Group active anchors by cognitive quadrant
 */
declare function groupAnchorsByQuadrant(anchors: Anchor[], now?: number): GroupedAnchors;
/**
 * Strip ANSI escape codes from string
 */
declare function stripAnsi(str: string): string;
/**
 * Calculate display width in terminal columns, accounting for:
 * - ANSI escape codes (width 0)
 * - CJK ideographs & fullwidth forms (width 2)
 * - Japanese Kana (width 2)
 * - Korean Hangul syllables & Jamo (width 2)
 * - Emojis & Pictographs (width 2)
 * - Zero-width characters & joiners (width 0)
 * - Standard ASCII (width 1)
 */
declare function getDisplayWidth(str: string): number;
/**
 * Truncate string to target terminal visual width with ellipsis
 */
declare function truncateToWidth(str: string, maxWidth: number, ellipsis?: string): string;
/**
 * Pad and/or truncate string to exact visual column width, eliminating column tearing
 */
declare function padToWidth(str: string, targetWidth: number): string;
/**
 * Format expected completion date in human-intuitive terms:
 * - 'Daily' for daily recurring habits
 * - 'Today' if targetDate is today
 * - 'Tomorrow' if targetDate is tomorrow
 * - 'In 2d' / 'In 3d' for near-term dates
 * - 'MM-DD' for future dates
 * - 'Overdue' if targetDate is past
 * - 'Someday' for open-ended architecture/long-term vision
 */
declare function formatTargetDate(anchor: Anchor, now?: number): string;
/**
 * Format creation timestamp as concise date/time:
 * - 'Today HH:MM' if created today
 * - 'Yesterday HH:MM' if created yesterday
 * - 'MM-DD HH:MM' if created this year
 * - 'YYYY-MM-DD' if older
 */
declare function formatCreationTime(timestamp: number, now?: number): string;
/**
 * Backward compatibility alias
 */
declare function formatRelativeTime(timestamp: number, now?: number): string;
/**
 * Backward compatibility alias (now returns target date representation)
 */
declare function formatRemainingTtl(anchor: Anchor, now?: number): string | undefined;
/**
 * Format origin creation workspace folder (provenance: where the task was born/created)
 */
declare function formatOrigin(anchor: Anchor | string): string;
/**
 * Update footer status bar capsule: `⌖ 1`
 */
declare function updateAnchorStatusBar(ctx: ExtensionContext, store: AnchorStore): void;
/**
 * Render lightweight startup banner widget above the editor.
 * Features 3-4 lines with quadrant badges and target date hints.
 * Automatically cleared on agent_start (when user sends first message).
 */
declare function updateStartupBanner(ctx: ExtensionContext, store: AnchorStore): void;
/**
 * Clean, columnar-aligned checklist with Target Date and Creation Time columns
 */
declare function openAnchorDashboard(ctx: ExtensionContext, store: AnchorStore): Promise<void>;

declare class SessionTouchObserver {
    private touchedFiles;
    private modifiedFiles;
    private inspectedFiles;
    private committed;
    private commitMessages;
    clear(): void;
    /**
     * Observe and record a tool call invocation, separating inspection from mutation
     */
    recordToolCall(toolName: string, input: Record<string, unknown>): void;
    /**
     * Add a file path manually (e.g. from git status diff)
     */
    addTouchedFile(filePath: string, isModified?: boolean): void;
    getModifiedFiles(): string[];
    getInspectedFiles(): string[];
    getTouchedFiles(): string[];
    hasCommitted(): boolean;
    getCommitMessages(): string[];
    /**
     * Check if any commit message explicitly references or resolves an anchor
     */
    matchesCommit(anchor: Anchor): {
        matched: boolean;
        message?: string;
    };
}

/**
 * Universal multi-language comment generator.
 * Maps file extension to safe comment syntax.
 * Formats that do not safely support comments (e.g. .json, .env, binary) return null.
 */
declare const COMMENT_FORMATS: Record<string, (msg: string) => string>;
/**
 * Format safe task context comment for a specific file.
 * Returns null for formats that do not safely support comments (e.g. .json, .env, .lock)
 */
declare function makeSafeTaskAnnotation(filePath: string, anchor: Anchor): string | null;
/**
 * Render ultra-compact cold-start context block for session turn 1.
 * Only active anchors for the current project context are injected.
 * From turn 2 onwards, this returns empty string (0 tokens).
 */
declare function renderColdStartAnchorsContext(store: AnchorStore, cwdOrNow?: string | number, nowArg?: number): string;
/** Legacy alias for backwards compatibility */
declare const renderActiveAnchorsContext: typeof renderColdStartAnchorsContext;

/**
 * Universal Agent Adapter Interface.
 * Any AI coding harness (Pi, Claude Code, Cursor, Aider, custom MCP server) implements this thin layer.
 */
interface AgentAdapter {
    readonly name: string;
    getCwd(): string;
    notify?(message: string, level: 'info' | 'warn' | 'error'): void;
}
/**
 * The Sovereign Anchor Protocol Engine.
 * Decoupled, harness-agnostic core managing state, decay, JIT annotations, and settlement.
 */
declare class AnchorProtocol {
    readonly store: AnchorStore;
    readonly observer: SessionTouchObserver;
    private readonly annotatedThisSession;
    constructor(store: AnchorStore);
    /**
     * Run session initialization lifecycle: sweeps stale anchors and resets session state
     */
    handleSessionStart(now?: number): {
        sleepingCount: number;
    };
    /**
     * Handle turn lifecycle: injects cold-start prompt on turn 1, returns null (0 tokens) on turn 2+
     */
    handleBeforeTurn(turnCount: number, cwd: string, now?: number): string | null;
    /**
     * Handle tool execution result: detects touched paths, refreshes mutation touch timers,
     * and returns safe language-specific JIT annotation (or null if syntax incompatible/already annotated).
     */
    handleToolResult(input: {
        toolName: string;
        filePath?: string;
        isError?: boolean;
        isMutation?: boolean;
        cwd: string;
    }): {
        annotation: string | null;
        matchedAnchors: Anchor[];
    };
}

export { type AgentAdapter, type Anchor, type AnchorDecayPolicy, type AnchorDurability, type AnchorEvidence, type AnchorPriority, AnchorProtocol, type AnchorQuadrant, type AnchorStatus, AnchorStore, type AnchorStoreState, COMMENT_FORMATS, DEFAULT_DECAY_POLICY, DURABLE_DECAY_POLICY, type DecayEvaluation, EPHEMERAL_DECAY_POLICY, type GroupedAnchors, SessionTouchObserver, type SettlementProposal, type SweepResult, type TouchMatchResult, acquireSyncLock, atomicRenameWithRetry, classifyAnchor, detectDurability, detectRecurrence, detectTargetDate, evaluateAnchorDecay, findMatchedAnchors, formatCreationTime, formatOrigin, formatRelativeTime, formatRemainingTtl, formatSettlementCard, formatTargetDate, generateSettlementProposals, getDefaultStorageDir, getDisplayWidth, getEphemeralDecayPolicy, getTodayDateString, globToRegExp, groupAnchorsByQuadrant, makeSafeTaskAnnotation, matchAnchorAgainstTouchedFiles, normalizePath, openAnchorDashboard, padToWidth, renderActiveAnchorsContext, renderColdStartAnchorsContext, runPhysicalVerification, stripAnsi, sweepStore, truncateToWidth, updateAnchorStatusBar, updateStartupBanner };
