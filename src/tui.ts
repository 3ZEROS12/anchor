import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore } from './store.ts';
import { evaluateAnchorDecay } from './decay.ts';
import type { Anchor } from './types.ts';
import path from 'node:path';

/**
 * Touchpoint 1 (Option A): Minimalist geometric crosshair status indicator
 * Clean, focused: `⌖ 1`
 * Completely hidden when 0 anchors exist.
 */
export function updateAnchorStatusBar(ctx: ExtensionContext, store: AnchorStore): void {
  if (!ctx.hasUI || !ctx.ui) return;

  const active = store.list({ status: 'active', cwd: ctx.cwd });
  const sleeping = store.list({ status: 'sleeping', cwd: ctx.cwd });

  if (active.length === 0 && sleeping.length === 0) {
    ctx.ui.setStatus('anchor', undefined);
    return;
  }

  const parts: string[] = [];
  if (active.length > 0) {
    parts.push(`⌖ ${active.length}`);
  }
  if (sleeping.length > 0) {
    parts.push(`(${sleeping.length}z)`);
  }

  ctx.ui.setStatus('anchor', parts.join(' '));
}

/**
 * Touchpoint 2 (Plan 2): Geometric Neovim/Geek layout with folder metadata
 * ◈ 01  Task title  [folder/path]  (3d)
 * Single-step completion: select to settle immediately.
 */
export async function openAnchorDashboard(
  ctx: ExtensionContext,
  store: AnchorStore
): Promise<void> {
  if (!ctx.hasUI || !ctx.ui) return;

  const list = store.list({ status: 'active', cwd: ctx.cwd });
  if (list.length === 0) {
    ctx.ui.notify('⌖ 暂无未完成的跨会话任务。输入 /pin <任务描述> 记录。', 'info');
    return;
  }

  const optionMap = new Map<string, Anchor>();
  const displayOptions: string[] = [];

  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const decay = evaluateAnchorDecay(a);
    const icon = a.durability === 'ephemeral' ? '◇' : '◈';
    const num = (i + 1).toString().padStart(2, '0');

    // Folder and path metadata description
    let folder = '[全局]';
    if (a.files && a.files.length > 0) {
      folder = `[${a.files.slice(0, 1).join(', ')}]`;
    } else if (a.cwd) {
      folder = `[${path.basename(a.cwd)}]`;
    }

    const decayInfo = a.durability === 'ephemeral' ? '48h' : `${decay.remainingActiveDays}d`;
    const label = `${icon} ${num}  ${a.title}  ${folder}  (${decayInfo})`;

    optionMap.set(label, a);
    displayOptions.push(label);
  }

  const projectName = path.basename(ctx.cwd) || 'Workspace';
  const selected = await ctx.ui.select(`⌖ 跨会话任务 · ${projectName} (回车划掉):`, displayOptions);
  if (!selected) return;

  const anchor = optionMap.get(selected);
  if (!anchor) return;

  store.settle(anchor.id, { settledBy: 'manual-command' });
  ctx.ui.notify(`⌖ 已完成: "${anchor.title}"`, 'info');
  updateAnchorStatusBar(ctx, store);
}
