import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore } from './store.ts';
import type { Anchor } from './types.ts';

/**
 * Touchpoint 1: Minimalist geometric crosshair status indicator
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
 * Touchpoint 2: Clean, human-centric checklist
 * 01  Task title  [code/file.ts]
 * Zero brackets clutter, zero fake countdowns, zero desktop prefixes.
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

    // Only display file tag if the task is genuinely bound to code files
    const fileTag = (a.files && a.files.length > 0) ? `  [${a.files.slice(0, 1).join(', ')}]` : '';
    const label = `${num}  ${a.title}${fileTag}`;

    optionMap.set(label, a);
    displayOptions.push(label);
  }

  const selected = await ctx.ui.select('⌖ 待办清单:', displayOptions);
  if (!selected) return;

  const anchor = optionMap.get(selected);
  if (!anchor) return;

  store.settle(anchor.id, { settledBy: 'manual-command' });
  ctx.ui.notify(`⌖ 已完成: "${anchor.title}"`, 'info');
  updateAnchorStatusBar(ctx, store);
}
