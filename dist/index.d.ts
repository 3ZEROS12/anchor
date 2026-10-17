import { A as AnchorStep, a as AnchorProgress, D as DockStepLayout, S as StepCounts, b as Anchor, T as TodoTaskItem, c as StepStatus, d as AnchorStore } from './extension-D-jGK0pi.js';
export { e as AnchorEvidence, f as AnchorPriority, g as AnchorStatus, h as AnchorStoreState, C as COMMENT_FORMATS, i as DEFAULT_MAX_DOCK_LINES, M as MS_PER_DAY, Q as QUIET_AFTER_DAYS, j as TouchMatchResult, k as acquireSyncLock, l as atomicRenameWithRetry, m as extractPathsFromText, n as extractProgressFromText, o as findMatchedAnchors, p as getDefaultStorageDir, q as globToRegExp, r as isAnchorTargetingWorkspace, s as isSameOrSubPath, t as makeSafeTaskAnnotation, u as matchAnchorAgainstTouchedFiles, v as matchesCommitMessage, w as normalizePath, x as parseAnchorCommandInput, y as parseQuickNoteInput, z as renderActiveAnchorsContext, B as renderColdStartAnchorsContext, E as resolveAnchorTarget, F as sweepQuietNotes } from './extension-D-jGK0pi.js';
import { ExtensionContext, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

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

export { Anchor, AnchorDockController, AnchorProgress, AnchorStep, AnchorStore, DockStepLayout, STATUS_GLYPH, StepCounts, StepStatus, TodoTaskItem, applyStrikethrough, convertTodoTasksToSteps, defaultDockController, deriveStepBlocks, formatDockStepRow, formatMicroGauge, formatOrigin, formatProgressBar, formatRelativeAge, formatStepGlyph, getDisplayWidth, hasActiveUI, inferLiveActivityLabel, materializeSteps, openAnchorDashboard, padToWidth, renderMissionReceipt, replayTodoSnapshotFromBranch, selectDockStepLayout, selectStepCounts, sortAnchorsForDisplay, stripAnsi, syncProgressFromItems, truncateToWidth, updateAnchorStatusBar, updateStartupBanner, validateAnchorDependencies, validateStepDependencies };
