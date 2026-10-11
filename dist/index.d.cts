import { A as Anchor, a as AnchorStore } from './extension-B1-fzCox.cjs';
export { b as AnchorEvidence, c as AnchorPriority, d as AnchorStatus, e as AnchorStoreState, C as COMMENT_FORMATS, M as MS_PER_DAY, Q as QUIET_AFTER_DAYS, T as TouchMatchResult, f as acquireSyncLock, g as atomicRenameWithRetry, h as extractPathsFromText, i as findMatchedAnchors, j as getDefaultStorageDir, k as globToRegExp, l as isAnchorTargetingWorkspace, m as isSameOrSubPath, n as makeSafeTaskAnnotation, o as matchAnchorAgainstTouchedFiles, p as matchesCommitMessage, q as normalizePath, r as parseAnchorCommandInput, s as renderActiveAnchorsContext, t as renderColdStartAnchorsContext, u as resolveAnchorTarget, v as sweepQuietNotes } from './extension-B1-fzCox.cjs';
import { ExtensionContext } from '@earendil-works/pi-coding-agent';

declare function stripAnsi(str: string): string;
/**
 * Calculate visual terminal column width (CJK/Kana/Hangul/Emoji = 2 cells, ASCII = 1 cell)
 */
declare function getDisplayWidth(str: string): number;
declare function hasActiveUI(ctx: ExtensionContext | null | undefined): ctx is ExtensionContext;
declare function truncateToWidth(str: string, maxWidth: number, ellipsis?: string): string;
declare function padToWidth(str: string, targetWidth: number): string;
/**
 * Format relative sticky-note age cleanly: 'just now', '15m ago', '3h ago', '2d ago'
 */
declare function formatRelativeAge(timestamp: number, now?: number): string;
/**
 * Format workspace & first file context concisely (e.g. 'anchor · src/auth.ts' or 'College/优化')
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
 * Update status bar badge: `⌖ 2` (invisible when 0 active notes)
 */
declare function updateAnchorStatusBar(ctx: ExtensionContext, store: AnchorStore): void;
/**
 * Render clean sticky-note card above editor on session startup.
 * Automatically disappears as soon as the user sends their first message.
 */
declare function updateStartupBanner(ctx: ExtensionContext, store: AnchorStore): void;
/**
 * Interactive `/anchor` sticky-note board
 */
declare function openAnchorDashboard(ctx: ExtensionContext, store: AnchorStore): Promise<void>;

export { Anchor, AnchorStore, formatOrigin, formatRelativeAge, getDisplayWidth, hasActiveUI, openAnchorDashboard, padToWidth, sortAnchorsForDisplay, stripAnsi, truncateToWidth, updateAnchorStatusBar, updateStartupBanner };
