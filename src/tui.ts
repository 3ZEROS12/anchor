import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore, getTodayDateString } from './store.ts';
import type { Anchor } from './types.ts';
import path from 'node:path';

export type AnchorQuadrant = 'Today' | 'Upcoming' | 'Habits' | 'Backlog';

export interface GroupedAnchors {
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
export function classifyAnchor(anchor: Anchor, now: number = Date.now()): AnchorQuadrant {
  if (anchor.recurrence === 'daily') {
    return 'Habits';
  }
  if (!anchor.targetDate) {
    return 'Backlog';
  }

  const todayStr = getTodayDateString(now);
  if (anchor.targetDate <= todayStr) {
    return 'Today';
  }

  return 'Upcoming';
}

/**
 * Group active anchors by cognitive quadrant
 */
export function groupAnchorsByQuadrant(anchors: Anchor[], now: number = Date.now()): GroupedAnchors {
  const groups: GroupedAnchors = {
    today: [],
    upcoming: [],
    habits: [],
    backlog: []
  };

  for (const a of anchors) {
    const q = classifyAnchor(a, now);
    if (q === 'Today') groups.today.push(a);
    else if (q === 'Upcoming') groups.upcoming.push(a);
    else if (q === 'Habits') groups.habits.push(a);
    else groups.backlog.push(a);
  }

  return groups;
}

/**
 * Strip ANSI escape codes from string
 */
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

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
export function getDisplayWidth(str: string): number {
  const clean = stripAnsi(str);
  let width = 0;

  for (const char of clean) {
    const code = char.codePointAt(0) || 0;

    // Zero-width characters (ZWJ, variation selectors, combining marks)
    if (
      code === 0x200d ||
      code === 0xfe0f ||
      code === 0xfe0e ||
      (code >= 0x0300 && code <= 0x036f) ||
      (code >= 0x200b && code <= 0x200f)
    ) {
      continue;
    }

    // Double-width characters: CJK, Hangul, Kana, Emojis
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df) ||
      (code >= 0x2a700 && code <= 0x2b73f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x3130 && code <= 0x318f) ||
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff) ||
      (code >= 0x1f300 && code <= 0x1f9ff) ||
      (code >= 0x1f600 && code <= 0x1f64f) ||
      (code >= 0x1f680 && code <= 0x1f6ff) ||
      (code >= 0x2600 && code <= 0x27bf) ||
      (code >= 0x1fa70 && code <= 0x1faff)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }

  return width;
}

/**
 * Truncate string to target terminal visual width with ellipsis
 */
export function truncateToWidth(str: string, maxWidth: number, ellipsis = '…'): string {
  const current = getDisplayWidth(str);
  if (current <= maxWidth) return str;

  const ellipsisWidth = getDisplayWidth(ellipsis);
  const target = maxWidth - ellipsisWidth;
  if (target <= 0) return ellipsis.slice(0, maxWidth);

  let accumulated = '';
  let accumWidth = 0;

  for (const char of str) {
    const charWidth = getDisplayWidth(char);
    if (accumWidth + charWidth > target) {
      break;
    }
    accumulated += char;
    accumWidth += charWidth;
  }

  return accumulated + ellipsis;
}

/**
 * Pad and/or truncate string to exact visual column width, eliminating column tearing
 */
export function padToWidth(str: string, targetWidth: number): string {
  const truncated = truncateToWidth(str, targetWidth);
  const current = getDisplayWidth(truncated);
  if (current >= targetWidth) return truncated;
  return truncated + ' '.repeat(targetWidth - current);
}

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
export function formatTargetDate(anchor: Anchor, now: number = Date.now()): string {
  if (anchor.recurrence === 'daily') {
    return 'Daily';
  }
  if (!anchor.targetDate) {
    return 'Someday';
  }

  const todayStr = getTodayDateString(now);
  if (anchor.targetDate === todayStr) {
    return 'Today';
  }

  const MS_DAY = 24 * 60 * 60 * 1000;
  const tomorrowStr = getTodayDateString(now + MS_DAY);
  if (anchor.targetDate === tomorrowStr) {
    return 'Tomorrow';
  }

  const in2dStr = getTodayDateString(now + 2 * MS_DAY);
  if (anchor.targetDate === in2dStr) {
    return 'In 2d';
  }

  const in3dStr = getTodayDateString(now + 3 * MS_DAY);
  if (anchor.targetDate === in3dStr) {
    return 'In 3d';
  }

  if (anchor.targetDate < todayStr) {
    return 'Overdue';
  }

  const parts = anchor.targetDate.split('-');
  if (parts.length === 3) {
    return `${parts[1]}-${parts[2]}`;
  }

  return anchor.targetDate;
}

/**
 * Format creation timestamp as concise date/time:
 * - 'Today HH:MM' if created today
 * - 'Yesterday HH:MM' if created yesterday
 * - 'MM-DD HH:MM' if created this year
 * - 'YYYY-MM-DD' if older
 */
export function formatCreationTime(timestamp: number, now: number = Date.now()): string {
  const d = new Date(timestamp);
  const nowD = new Date(now);

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const todayStr = getTodayDateString(now);
  const createdDayStr = getTodayDateString(timestamp);

  if (createdDayStr === todayStr) {
    return `Today ${timeStr}`;
  }

  const yesterdayStr = getTodayDateString(now - 24 * 60 * 60 * 1000);
  if (createdDayStr === yesterdayStr) {
    return `Yesterday ${timeStr}`;
  }

  const mmdd = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (d.getFullYear() === nowD.getFullYear()) {
    return `${mmdd} ${timeStr}`;
  }

  return `${d.getFullYear()}-${mmdd}`;
}

/**
 * Backward compatibility alias
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  return formatCreationTime(timestamp, now);
}

/**
 * Backward compatibility alias (now returns target date representation)
 */
export function formatRemainingTtl(anchor: Anchor, now: number = Date.now()): string | undefined {
  return formatTargetDate(anchor, now);
}

/**
 * Format origin creation workspace folder (provenance: where the task was born/created)
 */
export function formatOrigin(anchor: Anchor | string): string {
  if (typeof anchor === 'object') {
    if (!anchor.cwd) return anchor.project || 'global';
    return path.basename(anchor.cwd) || 'global';
  }
  if (!anchor) return 'global';
  return path.basename(anchor) || 'global';
}

/**
 * Update footer status bar capsule: `⌖ 1`
 */
export function updateAnchorStatusBar(ctx: ExtensionContext, store: AnchorStore): void {
  if (!ctx.hasUI || !ctx.ui) return;

  const active = store.list({ status: 'active', cwd: ctx.cwd });
  if (active.length === 0) {
    ctx.ui.setStatus('anchor', undefined);
    return;
  }

  ctx.ui.setStatus('anchor', `⌖ ${active.length}`);
}

/**
 * Render lightweight startup banner widget above the editor.
 * Features 3-4 lines with quadrant badges and target date hints.
 * Automatically cleared on agent_start (when user sends first message).
 */
export function updateStartupBanner(ctx: ExtensionContext, store: AnchorStore): void {
  if (!ctx.hasUI || !ctx.ui) return;

  const active = store.list({ status: 'active', cwd: ctx.cwd });
  if (active.length === 0) {
    ctx.ui.setWidget('anchor-startup', undefined);
    return;
  }

  const groups = groupAnchorsByQuadrant(active);
  const sorted = [...groups.today, ...groups.upcoming, ...groups.habits, ...groups.backlog];

  const lines: string[] = [
    `⌖ Anchor · ${active.length} active commitments:`
  ];

  const topItems = sorted.slice(0, 3);
  for (let i = 0; i < topItems.length; i++) {
    const a = topItems[i];
    const num = (i + 1).toString().padStart(2, '0');
    const q = classifyAnchor(a);
    const tgt = formatTargetDate(a);
    const titlePadded = a.title.length > 34 ? a.title.slice(0, 32) + '..' : a.title;
    lines.push(`  • [${q}]  ${num} ${titlePadded} (${tgt})`);
  }

  if (sorted.length > 3) {
    lines.push(`  (+${sorted.length - 3} more · run /anchor to inspect)`);
  }

  ctx.ui.setWidget('anchor-startup', lines, { placement: 'aboveEditor' });
}

/**
 * Clean, columnar-aligned checklist with Target Date and Creation Time columns
 */
export async function openAnchorDashboard(
  ctx: ExtensionContext,
  store: AnchorStore
): Promise<void> {
  if (!ctx.hasUI || !ctx.ui) return;

  const list = store.list({ status: 'active', cwd: ctx.cwd });
  if (list.length === 0) {
    ctx.ui.notify('⌖ No active anchors. Use /pin <task> to record.', 'info');
    return;
  }

  const groups = groupAnchorsByQuadrant(list);
  const sortedList = [
    ...groups.today,
    ...groups.upcoming,
    ...groups.habits,
    ...groups.backlog
  ];

  const optionMap = new Map<string, Anchor>();
  const displayOptions: string[] = [];

  for (let i = 0; i < sortedList.length; i++) {
    const a = sortedList[i];
    const num = (i + 1).toString().padStart(2, '0');
    const category = padToWidth(`[${classifyAnchor(a)}]`, 12);
    const origin = formatOrigin(a);
    const target = formatTargetDate(a);
    const created = formatCreationTime(a.createdAt);

    const titleWithFiles = (a.files && a.files.length > 0)
      ? `${a.title} [${a.files.slice(0, 1).join(', ')}]`
      : a.title;

    // Clean tabular column alignment: ID, Category, Title, Project, Target, Created
    const colNum = `${num}  `;
    const colTitle = padToWidth(titleWithFiles, 34);
    const colOrigin = padToWidth(origin, 10);
    const colTarget = padToWidth(target, 12);
    const colCreated = created;

    const label = `${colNum}${category}${colTitle}  ${colOrigin}  ${colTarget}  ${colCreated}`.trimEnd();

    optionMap.set(label, a);
    displayOptions.push(label);
  }

  const selected = await ctx.ui.select('⌖ Anchors (enter to complete):', displayOptions);
  if (!selected) return;

  const anchor = optionMap.get(selected);
  if (!anchor) return;

  store.settle(anchor.id, { settledBy: 'manual-command' });
  const successMsg = anchor.recurrence === 'daily'
    ? `⌖ Completed for today: "${anchor.title}" (resets tomorrow)`
    : `⌖ Settled: "${anchor.title}"`;
  ctx.ui.notify(successMsg, 'info');
  updateAnchorStatusBar(ctx, store);
}
