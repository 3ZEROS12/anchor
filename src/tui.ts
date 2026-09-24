import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore } from './store.ts';
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
 * Format relative past time in concise English (e.g. 'just now', '23m ago', '2h ago', '3d ago')
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const elapsedMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(elapsedMs / (60 * 1000));
  const hours = Math.floor(elapsedMs / (60 * 60 * 1000));
  const days = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Format remaining TTL for ephemeral tasks (e.g. '48h left')
 */
export function formatRemainingTtl(anchor: Anchor, now: number = Date.now()): string | undefined {
  if (anchor.durability !== 'ephemeral') return undefined;
  const ttlMs = (anchor.decay.graveyardDays || 2) * 24 * 60 * 60 * 1000;
  const elapsedMs = Math.max(0, now - anchor.createdAt);
  const remainingMs = Math.max(0, ttlMs - elapsedMs);
  const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
  return `${remainingHours}h left`;
}

/**
 * Format origin workspace in concise English
 */
export function formatOrigin(cwd: string): string {
  if (!cwd) return 'global';
  return path.basename(cwd) || 'global';
}

/**
 * Update the footer status bar indicator
 * Clean, focused: `⌖ 1`
 * Completely hidden when 0 anchors exist.
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
 * Clean, columnar-aligned checklist with daily habit support
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
    const origin = formatOrigin(a.cwd);
    const relTime = formatRelativeTime(a.createdAt);
    const ttl = formatRemainingTtl(a);

    let cadence = '';
    if (a.recurrence === 'daily') {
      cadence = 'daily';
    } else if (ttl) {
      cadence = ttl;
    }

    const titleWithFiles = (a.files && a.files.length > 0)
      ? `${a.title} [${a.files.slice(0, 1).join(', ')}]`
      : a.title;

    // Clean tabular column alignment
    const colNum = `${num}  `;
    const colTitle = padToWidth(titleWithFiles, 28);
    const colOrigin = padToWidth(origin, 10);
    const colCadence = padToWidth(cadence, 12);
    const colTime = relTime;

    const label = `${colNum}${colTitle}  ${colOrigin}  ${colCadence}  ${colTime}`.trimEnd();

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
