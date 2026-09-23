import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore } from './store.ts';
import type { Anchor } from './types.ts';

/**
 * Update the footer status bar indicator
 * Whisper-quiet: completely hidden when 0 anchors exist.
 */
export function updateAnchorStatusBar(ctx: ExtensionContext, store: AnchorStore): void {
  if (!ctx.hasUI || !ctx.ui) return;

  const active = store.list({ status: 'active', cwd: ctx.cwd });
  if (active.length === 0) {
    ctx.ui.setStatus('anchor', undefined);
    return;
  }

  ctx.ui.setStatus('anchor', `[⚓ ${active.length}]`);
}

/**
 * Single-step, non-intrusive task checklist.
 * Pick an item -> directly completes and clears it. Zero second-level menus.
 */
export async function openAnchorDashboard(
  ctx: ExtensionContext,
  store: AnchorStore
): Promise<void> {
  if (!ctx.hasUI || !ctx.ui) return;

  const list = store.list({ status: 'active', cwd: ctx.cwd });
  if (list.length === 0) {
    ctx.ui.notify('⚓ 暂无待办任务。用 `/pin <任务描述>` 随手记录。', 'info');
    return;
  }

  const optionMap = new Map<string, Anchor>();
  const displayOptions: string[] = [];

  for (const a of list) {
    const label = `✓ 完成: ${a.title}`;
    optionMap.set(label, a);
    displayOptions.push(label);
  }
  displayOptions.push('✕ 取消');

  const selected = await ctx.ui.select('⚓ 点击待办直接划掉完成:', displayOptions);
  if (!selected || selected === '✕ 取消') return;

  const anchor = optionMap.get(selected);
  if (!anchor) return;

  store.settle(anchor.id, { settledBy: 'manual-command' });
  ctx.ui.notify(`⚓ 已完成: "${anchor.title}"`, 'info');
  updateAnchorStatusBar(ctx, store);
}
