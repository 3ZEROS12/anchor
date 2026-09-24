import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore, getTodayDateString } from './store.ts';
import type { Anchor } from './types.ts';
import path from 'node:path';

/**
 * Calculate display width in terminal columns, accounting for CJK full-width characters (width 2)
 */
export function getDisplayWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    const code = char.codePointAt(0) || 0;
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0x3000 && code <= 0x303f)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * Pad string to target visual column width using spaces for clean vertical alignment
 */
export function padToWidth(str: string, targetWidth: number): string {
  const current = getDisplayWidth(str);
  if (current >= targetWidth) return str;
  return str + ' '.repeat(targetWidth - current);
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

  const optionMap = new Map<string, Anchor>();
  const displayOptions: string[] = [];

  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const idNum = a.id.replace(/^anc-/, '');
    const num = idNum.padStart(2, '0');
    const origin = formatOrigin(a);
    const target = formatTargetDate(a);
    const created = formatCreationTime(a.createdAt);

    const titleWithFiles = (a.files && a.files.length > 0)
      ? `${a.title} [${a.files.slice(0, 1).join(', ')}]`
      : a.title;

    // Clean tabular column alignment: ID, Title, Project, Target, Created
    const colNum = `${num}  `;
    const colTitle = padToWidth(titleWithFiles, 28);
    const colOrigin = padToWidth(origin, 10);
    const colTarget = padToWidth(target, 12);
    const colCreated = created;

    const label = `${colNum}${colTitle}  ${colOrigin}  ${colTarget}  ${colCreated}`.trimEnd();

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
