import { A as Anchor, a as AnchorProgress, b as AnchorStore } from './extension-Cq1NH1jT.js';
export { c as AnchorEvidence, d as AnchorPriority, e as AnchorStatus, f as AnchorStoreState, C as COMMENT_FORMATS, M as MS_PER_DAY, Q as QUIET_AFTER_DAYS, T as TouchMatchResult, g as acquireSyncLock, h as atomicRenameWithRetry, i as extractPathsFromText, j as extractProgressFromText, k as findMatchedAnchors, l as getDefaultStorageDir, m as globToRegExp, n as isAnchorTargetingWorkspace, o as isSameOrSubPath, p as makeSafeTaskAnnotation, q as matchAnchorAgainstTouchedFiles, r as matchesCommitMessage, s as normalizePath, t as parseAnchorCommandInput, u as parseQuickNoteInput, v as renderActiveAnchorsContext, w as renderColdStartAnchorsContext, x as resolveAnchorTarget, y as sweepQuietNotes } from './extension-Cq1NH1jT.js';
import { ExtensionContext, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

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
 * Render persistent 1-line sticky-note strip BELOW the editor (`placement: 'belowEditor'`).
 * Never collides with `pi-lingual` (`aboveEditor`), stays visible while you work,
 * and takes 0 lines when there are no active notes.
 */
declare function updateStartupBanner(ctx: ExtensionContext, store: AnchorStore): void;
/**
 * Interactive `/anchor` sticky-note board with 1-click progress stepping and session teleport (`switchSession`)
 */
declare function openAnchorDashboard(ctx: ExtensionContext | ExtensionCommandContext, store: AnchorStore): Promise<void>;

export { Anchor, AnchorProgress, AnchorStore, formatOrigin, formatProgressBar, formatRelativeAge, getDisplayWidth, hasActiveUI, openAnchorDashboard, padToWidth, sortAnchorsForDisplay, stripAnsi, truncateToWidth, updateAnchorStatusBar, updateStartupBanner };
