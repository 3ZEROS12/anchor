import { A as AnchorProgress, a as Anchor, T as TouchMatchResult, b as AnchorStep, D as DockStepLayout, S as StepCounts, c as TodoTaskItem, d as StepStatus, e as AnchorStore } from './extension-ztZoT_9j.js';
export { f as AnchorEvidence, g as AnchorPriority, h as AnchorStatus, i as AnchorStoreState, j as DEFAULT_MAX_DOCK_LINES, M as MS_PER_DAY, k as MUTATION_TOOLS, Q as QUIET_AFTER_DAYS, l as acquireSyncLock, m as atomicRenameWithRetry, n as extractGitCommitMessages, o as getDefaultStorageDir, p as getSessionFileSafe, q as parseAnchorCommandInput, r as parseQuickNoteInput, s as registerAnchorCommands, t as renderActiveAnchorsContext, u as renderColdStartAnchorsContext, v as resolveAnchorTarget, w as sweepQuietNotes } from './extension-ztZoT_9j.js';
import { ExtensionContext, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

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
 * Validate whether adding `newBlockedBy` to `stepId` introduces a cycle, self-dependency,
 * or reference to a non-existent/deleted step.
 */
declare function validateStepDependencies(steps: readonly AnchorStep[], stepId: number, newBlockedBy: readonly number[]): {
    valid: boolean;
    error?: string;
};
/**
 * Validate cross-anchor `blockedBy` dependencies for cycles or self-blocks
 */
declare function validateAnchorDependencies(anchors: readonly Anchor[], anchorId: string, newBlockedBy: readonly string[]): {
    valid: boolean;
    error?: string;
};
/**
 * Build inverse adjacency map: for each step S, which other steps are blocked by S
 */
declare function deriveStepBlocks(steps: readonly AnchorStep[]): Map<number, number[]>;
/**
 * Materialize structured `AnchorStep[]` from an `AnchorProgress` object
 * (supports both rich `progress.items` and legacy flat `progress.steps` string arrays)
 */
declare function materializeSteps(progress?: AnchorProgress): AnchorStep[];
/**
 * Synchronize `progress.done`, `progress.total`, and `progress.steps` from structured `AnchorStep[]`
 */
declare function syncProgressFromItems(items: readonly AnchorStep[], existing?: AnchorProgress): AnchorProgress;
/**
 * Compute status counts across structured steps
 */
declare function selectStepCounts(steps: readonly AnchorStep[]): StepCounts;
/**
 * Select which steps to display in the `belowEditor` Dock within a row budget:
 * 1. Hides completed steps that already had their 1-turn strikethrough grace period (`hiddenCompletedIds`).
 * 2. If remaining steps fit within `budget`, shows all of them.
 * 3. On overflow, drops remaining completed steps first, then truncates tail pending steps,
 *    returning exact `hiddenCompleted` and `truncatedTail` counts for the `+N more` summary line.
 */
declare function selectDockStepLayout(steps: readonly AnchorStep[], budget: number, hiddenCompletedIds?: ReadonlySet<number>): DockStepLayout;

/**
 * Inspect session transcript branch (`ctx.sessionManager.getBranch()`) to recover
 * the latest `todo` tool snapshot (`@juicesharp/rpiv-todo` or built-in `todo`).
 */
declare function replayTodoSnapshotFromBranch(branch?: Iterable<unknown> | null): TodoTaskItem[] | null;
/**
 * Convert `TodoTaskItem[]` into structured `AnchorStep[]` preserving `status`, `activeForm`, and `blockedBy` DAG edges.
 */
declare function convertTodoTasksToSteps(tasks: readonly TodoTaskItem[]): AnchorStep[];
/**
 * Derive a live present-continuous `activeForm` indicator from a real tool execution
 * (e.g. `editing auth.ts`, `running npm test`, `reading store.ts`).
 */
declare function inferLiveActivityLabel(toolName: string, input?: Record<string, unknown> | null, _cwd?: string): string | undefined;

declare const STATUS_GLYPH: Record<StepStatus, string>;
declare function formatStepGlyph(status: StepStatus, fg: (color: string, text: string) => string): string;
declare function applyStrikethrough(text: string, theme?: any): string;
/**
 * Format a single step row inside the `belowEditor` Tree Dock:
 * `✓ #1 Extract auth interface` (strikethrough)
 * `◐ #2 Switch token to HttpOnly cookie (editing auth.ts)`
 * `○ #3 Add integration tests ⛓ #2`
 */
declare function formatDockStepRow(step: AnchorStep, options: {
    fg: (color: string, text: string) => string;
    theme?: any;
    showId?: boolean;
    fallbackActiveForm?: string;
    liveDurationSec?: number;
    driftWarning?: string;
}): string;
/**
 * Stateful Dock Controller managing:
 * - Expanded Tree Dock vs 1-Line Compact Strip (`collapsed` state, toggled via `Alt+A` or `/anchor fold`)
 * - 1-Turn Completed Step Grace Period (`completedStepIdsPendingHide` -> `hiddenCompletedStepIds` on `agent_start`)
 */
declare class AnchorDockController {
    private collapsed;
    private pendingHideByAnchor;
    private hiddenByAnchor;
    isCollapsed(): boolean;
    setCollapsed(val: boolean): void;
    toggleCollapsed(): boolean;
    resetGraceState(anchorId?: string): void;
    /**
     * Called on `agent_start`: folds away completed steps that were shown with `✓` strikethrough
     * during the previous turn so the dock stays compact while coding.
     */
    foldCompletedStepsFromPreviousTurn(): boolean;
    /**
     * Render the `belowEditor` widget lines for active anchors.
     * - If `collapsed === true` OR no anchor has multi-step items, renders the 1-line Sticky Strip.
     * - If `collapsed === false` AND the primary anchor has structured steps (`total >= 2`),
     *   renders the multi-row Tree Dock (up to `maxStepRows = 4` step rows + optional side note summary).
     */
    renderDockLines(activeAnchors: readonly Anchor[], options: {
        width: number;
        cwd?: string;
        theme?: any;
        maxStepRows?: number;
    }): string[];
    private renderSingleLineStrip;
}
declare const defaultDockController: AnchorDockController;
/**
 * Render elegant ASCII Mission Completion Receipt upon anchor settlement
 */
declare function renderMissionReceipt(anchor: Anchor, options?: {
    fg?: (color: string, text: string) => string;
}): string[];

declare function stripAnsi(str: string): string;
/**
 * Calculate visual terminal column width (CJK/Kana/Hangul/Emoji = 2 cells, ASCII = 1 cell)
 */
declare function getDisplayWidth(str: string): number;
declare function hasActiveUI(ctx: ExtensionContext | null | undefined): ctx is ExtensionContext;
declare function truncateToWidth(str: string, maxWidth: number, ellipsis?: string): string;
declare function padToWidth(str: string, targetWidth: number): string;
/**
 * Render a 4-cell micro progress bar: e.g. `[■■□□ 2/4]` or `[■□□□ 5/30]`
 */
declare function formatProgressBar(progress?: AnchorProgress, cells?: number): string;
/**
 * Render a sleek Linear-grade micro gauge: e.g. `━━╸─── 2/5` or `━━━━━━ 4/4`
 */
declare function formatMicroGauge(progress?: AnchorProgress, cells?: number): string;
/**
 * Format relative sticky-note age cleanly: 'just now', '15m ago', '3h ago', '2d ago'
 */
declare function formatRelativeAge(timestamp: number, now?: number): string;
/**
 * Format workspace & first file context concisely (e.g. 'anchor · auth.ts' or 'College/优化')
 */
declare function formatOrigin(anchor: Anchor | string): string;
/**
 * Sort sticky notes naturally:
 * 1. Active notes before quiet (>7d untouched) notes
 * 2. Notes belonging to current workspace first
 * 3. Most recently touched first
 */
declare function sortAnchorsForDisplay(anchors: Anchor[], cwd?: string): Anchor[];
/**
 * Update status bar badge (`⌖ 2`) AND the persistent below-editor sticky strip!
 */
declare function updateAnchorStatusBar(ctx: ExtensionContext, store: AnchorStore): void;
/**
 * Render persistent `belowEditor` Anchor Dock (Tree Dock when expanded, 1-line strip when folded).
 * Never collides with `pi-lingual` (`aboveEditor`), stays visible while you work,
 * and takes 0 lines when there are no active notes.
 */
declare function updateStartupBanner(ctx: ExtensionContext, store: AnchorStore): void;
/**
 * Interactive `/anchor` sticky-note board with 1-click progress stepping and session teleport (`switchSession`)
 */
declare function openAnchorDashboard(ctx: ExtensionContext | ExtensionCommandContext, store: AnchorStore): Promise<void>;

export { Anchor, AnchorDockController, AnchorProgress, AnchorStep, AnchorStore, COMMENT_FORMATS, DockStepLayout, STATUS_GLYPH, StepCounts, StepStatus, TodoTaskItem, TouchMatchResult, applyStrikethrough, convertTodoTasksToSteps, defaultDockController, deriveStepBlocks, extractPathsFromText, extractProgressFromText, findMatchedAnchors, formatDockStepRow, formatMicroGauge, formatOrigin, formatProgressBar, formatRelativeAge, formatStepGlyph, getDisplayWidth, globToRegExp, hasActiveUI, inferLiveActivityLabel, isAnchorTargetingWorkspace, isSameOrSubPath, makeSafeTaskAnnotation, matchAnchorAgainstTouchedFiles, matchesCommitMessage, materializeSteps, normalizePath, openAnchorDashboard, padToWidth, renderMissionReceipt, replayTodoSnapshotFromBranch, selectDockStepLayout, selectStepCounts, sortAnchorsForDisplay, stripAnsi, syncProgressFromItems, truncateToWidth, updateAnchorStatusBar, updateStartupBanner, validateAnchorDependencies, validateStepDependencies };
