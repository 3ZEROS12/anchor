import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore } from './store.ts';
import type { Anchor } from './types.ts';
import path from 'node:path';

/**
 * Format relative time in concise English (e.g. 'now', '17m', '2h', '3d')
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const elapsedMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(elapsedMs / (60 * 1000));
  const hours = Math.floor(elapsedMs / (60 * 60 * 1000));
  const days = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
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
 * Clean, minimalist checklist in concise English
 * Task title retains user's original language.
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
    const num = (i + 1).toString().padStart(2, '0');
    const origin = formatOrigin(a.cwd);
    const relTime = formatRelativeTime(a.createdAt);

    const metaParts: string[] = [origin];
    if (a.files && a.files.length > 0) {
      metaParts.push(a.files.slice(0, 1).join(', '));
    }
    if (a.durability === 'ephemeral') {
      metaParts.push('48h');
    }
    metaParts.push(relTime);

    const label = `${num}  ${a.title}  · ${metaParts.join(' · ')}`;

    optionMap.set(label, a);
    displayOptions.push(label);
  }

  const selected = await ctx.ui.select('⌖ Anchors (enter to complete):', displayOptions);
  if (!selected) return;

  const anchor = optionMap.get(selected);
  if (!anchor) return;

  store.settle(anchor.id, { settledBy: 'manual-command' });
  ctx.ui.notify(`⌖ Settled: "${anchor.title}"`, 'info');
  updateAnchorStatusBar(ctx, store);
}
