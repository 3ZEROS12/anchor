import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore } from './store.ts';
import { evaluateAnchorDecay } from './decay.ts';
import type { Anchor } from './types.ts';
import path from 'node:path';

/**
 * Update the footer status bar indicator
 * Scoped to current workspace context. Completely hidden when 0 anchors exist.
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
    parts.push(`⚓ ${active.length}`);
  }
  if (sleeping.length > 0) {
    parts.push(`${sleeping.length} sleep`);
  }

  ctx.ui.setStatus('anchor', `[${parts.join(', ')}]`);
}

/**
 * Clean, lightweight native interactive panel using ctx.ui.select
 * Zero complex full-screen ASCII boxes; 100% native Pi select dialog.
 */
export async function openAnchorDashboard(
  ctx: ExtensionContext,
  store: AnchorStore,
  options?: { showAll?: boolean }
): Promise<void> {
  if (!ctx.hasUI || !ctx.ui) return;

  const showAll = options?.showAll || false;
  const list = store.list({ cwd: showAll ? undefined : ctx.cwd, all: showAll });

  const OPT_ADD = '➕ 新建任务锚点';
  const OPT_TOGGLE_ALL = '🌐 查看全盘所有项目';
  const OPT_TOGGLE_CUR = '📁 仅查看当前工程';
  const OPT_EXIT = '✕ 退出';

  if (list.length === 0) {
    const scopeLabel = showAll ? '全盘' : (path.basename(ctx.cwd) || '当前项目');
    const action = await ctx.ui.select(`⚓ Anchor 待办清单 (${scopeLabel}暂无待办)`, [
      OPT_ADD,
      showAll ? OPT_TOGGLE_CUR : OPT_TOGGLE_ALL,
      OPT_EXIT
    ]);

    if (action === OPT_ADD) {
      const title = await ctx.ui.input('新建锚点', '请输入任务描述:');
      if (title && title.trim()) {
        const anc = store.create({ title: title.trim(), cwd: ctx.cwd });
        ctx.ui.notify(`⚓ 已记录 #${anc.id}: "${anc.title}"`, 'info');
        updateAnchorStatusBar(ctx, store);
      }
    } else if (action === OPT_TOGGLE_ALL) {
      return openAnchorDashboard(ctx, store, { showAll: true });
    } else if (action === OPT_TOGGLE_CUR) {
      return openAnchorDashboard(ctx, store, { showAll: false });
    }
    return;
  }

  // Build clean string options
  const optionMap = new Map<string, Anchor>();
  const displayOptions: string[] = [];

  for (const a of list) {
    const decay = evaluateAnchorDecay(a);
    const scopeTag = a.cwd ? `[${a.project}]` : '[全局]';
    const prio = `[${a.priority.toUpperCase()}]`;
    const days = a.status === 'active' ? `(${decay.remainingActiveDays}d 剩余)` : `(休眠)`;
    const label = `#${a.id} ${scopeTag} ${prio} ${a.title} ${days}`;
    optionMap.set(label, a);
    displayOptions.push(label);
  }

  displayOptions.push(OPT_ADD);
  displayOptions.push(showAll ? OPT_TOGGLE_CUR : OPT_TOGGLE_ALL);
  displayOptions.push(OPT_EXIT);

  const scopeTitle = showAll ? '全盘所有项目' : (path.basename(ctx.cwd) || '当前项目');
  const selected = await ctx.ui.select(`⚓ Anchor 待办清单 · ${scopeTitle} (上下键选择，回车操作)`, displayOptions);
  if (!selected || selected === OPT_EXIT) return;

  if (selected === OPT_ADD) {
    const title = await ctx.ui.input('新建锚点', '请输入任务描述:');
    if (title && title.trim()) {
      const anc = store.create({ title: title.trim(), cwd: ctx.cwd });
      ctx.ui.notify(`⚓ 已记录 #${anc.id}: "${anc.title}"`, 'info');
      updateAnchorStatusBar(ctx, store);
    }
    return;
  }

  if (selected === OPT_TOGGLE_ALL) {
    return openAnchorDashboard(ctx, store, { showAll: true });
  }

  if (selected === OPT_TOGGLE_CUR) {
    return openAnchorDashboard(ctx, store, { showAll: false });
  }

  const anchor = optionMap.get(selected);
  if (!anchor) return;

  const ACT_SETTLE = '✓ 标记完成并清除 (Settle)';
  const ACT_TOUCH = '⚡ 刷新活跃时间 (Touch)';
  const ACT_GRAVEYARD = '🗑 移入墓园 (Drop)';
  const ACT_BACK = '← 返回';

  // Action menu for selected anchor
  const act = await ctx.ui.select(`操作 #${anchor.id}: ${anchor.title}`, [
    ACT_SETTLE,
    ACT_TOUCH,
    ACT_GRAVEYARD,
    ACT_BACK
  ]);

  if (act === ACT_SETTLE) {
    store.settle(anchor.id, { settledBy: 'manual-command' });
    ctx.ui.notify(`⚓ 已完成并清除 #${anchor.id}: "${anchor.title}"`, 'info');
    updateAnchorStatusBar(ctx, store);
  } else if (act === ACT_TOUCH) {
    store.touch(anchor.id);
    ctx.ui.notify(`⚓ #${anchor.id} 活跃半衰期已刷新`, 'info');
    updateAnchorStatusBar(ctx, store);
  } else if (act === ACT_GRAVEYARD) {
    store.dropToGraveyard(anchor.id, 'Manually dropped from panel');
    ctx.ui.notify(`⚓ #${anchor.id} 已移入墓园`, 'info');
    updateAnchorStatusBar(ctx, store);
  }
}
