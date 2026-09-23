import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore } from './store.ts';
import type { Anchor } from './types.ts';
import path from 'node:path';

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
 * Clean, minimalist checklist with explicit `left` vs `ago` time distinction
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
    const ttl = formatRemainingTtl(a);

    const metaParts: string[] = [origin];
    if (a.files && a.files.length > 0) {
      metaParts.push(a.files.slice(0, 1).join(', '));
    }
    if (ttl) {
      metaParts.push(ttl);
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
