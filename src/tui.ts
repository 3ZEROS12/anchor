import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore } from './store.ts';
import { evaluateAnchorDecay } from './decay.ts';
import type { Anchor } from './types.ts';

/**
 * Touchpoint 1: Apple Cupertino Zen-divider footer status bar
 * Clean and quiet: `⚓ │ 2`
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
    parts.push(`⚓ │ ${active.length}`);
  }
  if (sleeping.length > 0) {
    parts.push(`(${sleeping.length} sleep)`);
  }

  ctx.ui.setStatus('anchor', parts.join(' '));
}

/**
 * Touchpoint 2: Clean, hierarchical columnar selection list
 * Single-step completion: select task to settle immediately.
 */
export async function openAnchorDashboard(
  ctx: ExtensionContext,
  store: AnchorStore
): Promise<void> {
  if (!ctx.hasUI || !ctx.ui) return;

  const list = store.list({ status: 'active', cwd: ctx.cwd });
  if (list.length === 0) {
    ctx.ui.notify('⚓ 暂无未完成的锚点任务。输入 /pin <任务描述> 记录。', 'info');
    return;
  }

  const optionMap = new Map<string, Anchor>();
  const displayOptions: string[] = [];

  for (const a of list) {
    const decay = evaluateAnchorDecay(a);
    const scopeTag = a.cwd ? `[${a.project}]` : '[全局]';
    const prio = `[${a.priority.toUpperCase()}]`;
    const dura = a.durability === 'ephemeral' ? '短期' : '长期';
    const days = `${decay.remainingActiveDays}d`;

    // High-readability columnar spacing
    const idCol = a.id.padEnd(7, ' ');
    const scopeCol = scopeTag.padEnd(8, ' ');
    const prioCol = prio.padEnd(5, ' ');
    const label = `${idCol} ${scopeCol} ${prioCol} ${a.title}  (${dura} · ${days})`;
    optionMap.set(label, a);
    displayOptions.push(label);
  }
  displayOptions.push('✕ 取消');

  const selected = await ctx.ui.select('⚓ 活跃契约清单 (选择一项划掉完成):', displayOptions);
  if (!selected || selected === '✕ 取消') return;

  const anchor = optionMap.get(selected);
  if (!anchor) return;

  store.settle(anchor.id, { settledBy: 'manual-command' });
  ctx.ui.notify(`⚓ 已完成: "${anchor.title}"`, 'info');
  updateAnchorStatusBar(ctx, store);
}
