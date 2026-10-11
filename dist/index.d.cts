import { a as AnchorStatus, b as Anchor, A as AnchorStore, T as TouchMatchResult, S as SettlementProposal } from './store-t2_TDhJn.cjs';
export { c as AnchorDecayPolicy, d as AnchorDurability, e as AnchorEvidence, f as AnchorPriority, g as AnchorStoreState, D as DEFAULT_DECAY_POLICY, h as DURABLE_DECAY_POLICY, E as EPHEMERAL_DECAY_POLICY, i as acquireSyncLock, j as atomicRenameWithRetry, k as detectDurability, l as detectRecurrence, m as detectTargetDate, n as getDefaultStorageDir, o as getEphemeralDecayPolicy, p as getTodayDateString } from './store-t2_TDhJn.cjs';
import { ExtensionContext } from '@earendil-works/pi-coding-agent';

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
 * Compare two workspace CWDs safely (case-insensitive on Windows, supports subdirectory scoping)
 */
declare function isSameOrSubPath(anchorCwd?: string, targetCwd?: string): boolean;
/**
 * Extract explicit file or directory paths mentioned in natural language title/description
 * (e.g. "D:/College/优化/EXTERNAL_ARCHITECTURE_INSPIRATIONS.md", "src/auth/jwt.ts")
 */
declare function extractPathsFromText(text?: string): string[];
/**
 * Determine whether an anchor specifically targets a given workspace directory (`targetCwd`),
 * checking `anchor.cwd`, `anchor.project`, and `anchor.files`.
 */
declare function isAnchorTargetingWorkspace(anchor: Anchor, targetCwd?: string): boolean;
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
 * Execute physical verification test command for an anchor
 */
declare function runPhysicalVerification(anchor: Anchor, cwd: string): {
    success: boolean;
    output: string;
};
/**
 * Real-time autonomous settlement during active session:
 * Triggered immediately when a non-error shell command runs `git commit` or a matching `verifyCommand`.
 * Works for BOTH file-bound and file-less (`files: []`) anchors!
 */
declare function tryRealtimeAutoSettle(store: AnchorStore, observer: SessionTouchObserver, cwd?: string, executedCommand?: string): Array<{
    anchor: Anchor;
    reason: string;
}>;
/**
 * Generate settlement candidates based on files touched or commits made during the session
 */
declare function generateSettlementProposals(store: AnchorStore, touchedFiles: string[], cwd?: string, observer?: SessionTouchObserver): SettlementProposal[];
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
 * Sort unfinished anchors into a single compact, priority-driven engineering list:
 * 1. Active before Sleeping (quiet)
 * 2. Matching current workspace before other workspaces
 * 3. Due Today / Overdue before open-ended
 * 4. Priority (P0 -> P1 -> P2)
 */
declare function sortAnchorsForDisplay(anchors: Anchor[], cwd?: string, now?: number): Anchor[];
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
declare function hasActiveUI(ctx: ExtensionContext | null | undefined): ctx is ExtensionContext;
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
 * Format origin workspace / project label concisely
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
 * Clean, flat priority-sorted engineering checklist (includes both active and quiet/sleeping tasks so nothing is ever lost)
 */
declare function openAnchorDashboard(ctx: ExtensionContext, store: AnchorStore): Promise<void>;

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
declare function renderColdStartAnchorsContext(store: AnchorStore, cwdOrNow?: string | number, nowArg?: number, preflightFailures?: Map<string, string>): string;
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
 * Anchor protocol engine for cross-session task management.
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

export { type AgentAdapter, Anchor, AnchorProtocol, type AnchorQuadrant, AnchorStatus, AnchorStore, COMMENT_FORMATS, type DecayEvaluation, type GroupedAnchors, SessionTouchObserver, SettlementProposal, type SweepResult, TouchMatchResult, classifyAnchor, evaluateAnchorDecay, extractPathsFromText, findMatchedAnchors, formatCreationTime, formatOrigin, formatRelativeTime, formatRemainingTtl, formatSettlementCard, formatTargetDate, generateSettlementProposals, getDisplayWidth, globToRegExp, groupAnchorsByQuadrant, hasActiveUI, isAnchorTargetingWorkspace, isSameOrSubPath, makeSafeTaskAnnotation, matchAnchorAgainstTouchedFiles, normalizePath, openAnchorDashboard, padToWidth, renderActiveAnchorsContext, renderColdStartAnchorsContext, runPhysicalVerification, sortAnchorsForDisplay, stripAnsi, sweepStore, truncateToWidth, tryRealtimeAutoSettle, updateAnchorStatusBar, updateStartupBanner };
