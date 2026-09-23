import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore } from './store.ts';
import type { Anchor, AnchorDurability } from './types.ts';
import path from 'node:path';

/**
 * Format relative time in natural human language
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const elapsedMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(elapsedMs / (60 * 1000));
  const hours = Math.floor(elapsedMs / (60 * 60 * 1000));
  const days = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days === 1) return '昨天';
  if (days < 30) return `${days}天前`;
  return `${Math.floor(days / 30)}个月前`;
}

/**
 * Format workspace origin
 */
export function formatOrigin(cwd: string): string {
  if (!cwd) return '[全局]';
  const name = path.basename(cwd);
  if (name.toLowerCase() === 'desktop' || name === '桌面') return '[来自: 桌面]';
  return `[来自: ${name}]`;
}

/**
 * Format lifecycle contract tag
 */
export function formatLifecycle(durability: AnchorDurability): string {
  if (durability === 'ephemeral') {
    return '[48h 自净]';
  }
  return '[长期常驻]';
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
 * Clean, human-centric checklist with clear origin and lifecycle contract
 */
export async function openAnchorDashboard(
  ctx: ExtensionContext,
  store: AnchorStore
): Promise<void> {
  if (!ctx.hasUI || !ctx.ui) return;

  const list = store.list({ status: 'active', cwd: ctx.cwd });
  if (list.length === 0) {
    ctx.ui.notify('⌖ 暂无未完成的任务。输入 /pin <任务描述> 记录。', 'info');
    return;
  }

  const optionMap = new Map<string, Anchor>();
  const displayOptions: string[] = [];

  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const num = (i + 1).toString().padStart(2, '0');
    const origin = formatOrigin(a.cwd);
    const lifecycle = formatLifecycle(a.durability);
    const relTime = formatRelativeTime(a.createdAt);
    const fileTag = (a.files && a.files.length > 0) ? ` [${a.files.slice(0, 1).join(', ')}]` : '';

    const label = `${num}  ${a.title}${fileTag}  ${origin}  ${lifecycle}  ${relTime}`;

    optionMap.set(label, a);
    displayOptions.push(label);
  }

  const selected = await ctx.ui.select('⌖ 待办清单 (回车划掉完成):', displayOptions);
  if (!selected) return;

  const anchor = optionMap.get(selected);
  if (!anchor) return;

  store.settle(anchor.id, { settledBy: 'manual-command' });
  ctx.ui.notify(`⌖ 已完成: "${anchor.title}"`, 'info');
  updateAnchorStatusBar(ctx, store);
}
