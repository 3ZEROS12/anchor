import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore } from './store.ts';
import { evaluateAnchorDecay } from './decay.ts';

/**
 * Update the footer status bar indicator
 * Uses clean Cupertino / Minimalist dot aesthetic
 */
export function updateAnchorStatusBar(ctx: ExtensionContext, store: AnchorStore): void {
  if (!ctx.hasUI || !ctx.ui) return;

  const active = store.list({ status: 'active' });
  const sleeping = store.list({ status: 'sleeping' });

  const parts: string[] = [];
  if (active.length > 0) {
    parts.push(`⚓ ● ${active.length} active`);
  } else {
    parts.push('⚓ 0 active');
  }
  if (sleeping.length > 0) {
    parts.push(`💤 ${sleeping.length} sleep`);
  }

  ctx.ui.setStatus('anchor', parts.join(' | '));
}

/**
 * Open the interactive Anchor Cockpit via native select dialog
 */
export async function openAnchorDashboard(ctx: ExtensionContext, store: AnchorStore): Promise<void> {
  if (!ctx.hasUI || !ctx.ui) return;

  const OPT_ADD_EMPTY = '➕ 新建跨会话锚点';
  const OPT_EXIT_EMPTY = '✕ 退出看板';

  const all = store.list();
  if (all.length === 0) {
    const action = await ctx.ui.select('⚓ Anchor 任务锚点看板 (空空如也)', [
      OPT_ADD_EMPTY,
      OPT_EXIT_EMPTY
    ]);

    if (action === OPT_ADD_EMPTY) {
      const title = await ctx.ui.input('落锚新建', '请输入任务标题与承兑承诺:');
      if (title && title.trim()) {
        const created = store.create({ title: title.trim() });
        ctx.ui.notify(`⚓ 任务 #${created.id} 已成功锚定！`, 'info');
        updateAnchorStatusBar(ctx, store);
      }
    }
    return;
  }

  const OPT_ADD = '➕ 新增任务锚点...';
  const OPT_EXIT = '✕ 关闭看板';

  const itemMap = new Map<string, string>();
  const displayOptions: string[] = [];

  for (const a of all) {
    const decay = evaluateAnchorDecay(a);
    const badge = a.status === 'active' ? '🟢 活跃' : '💤 休眠';
    const prio = `[${a.priority.toUpperCase()}]`;
    const daysInfo = a.status === 'active'
      ? `(活跃剩余 ${decay.remainingActiveDays}天)`
      : `(离脱落剩余 ${decay.remainingSleepDays}天)`;
    const label = `${badge} #${a.id} ${prio} ${a.title} ${daysInfo}`;
    itemMap.set(label, a.id);
    displayOptions.push(label);
  }

  displayOptions.push(OPT_ADD);
  displayOptions.push(OPT_EXIT);

  const selected = await ctx.ui.select('⚓ Anchor 任务锚点驾驶舱', displayOptions);
  if (!selected || selected === OPT_EXIT) return;

  if (selected === OPT_ADD) {
    const title = await ctx.ui.input('落锚新建', '请输入任务标题:');
    if (title && title.trim()) {
      const created = store.create({ title: title.trim() });
      ctx.ui.notify(`⚓ 任务 #${created.id} 已成功锚定！`, 'info');
      updateAnchorStatusBar(ctx, store);
    }
    return;
  }

  const anchorId = itemMap.get(selected);
  if (!anchorId) return;

  const anchor = store.get(anchorId);
  if (!anchor) return;

  const ACT_SETTLE = '✓ 确认结案归档 (Settle & Evict)';
  const ACT_TOUCH = '⚡ 触碰激活 (Touch & Refresh TTL)';
  const ACT_GRAVEYARD = '🗑 移入墓园 (Drop to Graveyard)';
  const ACT_BACK = '← 返回';

  // Actions for selected anchor
  const action = await ctx.ui.select(`管理任务 #${anchor.id}: ${anchor.title}`, [
    ACT_SETTLE,
    ACT_TOUCH,
    ACT_GRAVEYARD,
    ACT_BACK
  ]);

  if (action === ACT_SETTLE) {
    store.settle(anchor.id, { settledBy: 'manual-command' });
    ctx.ui.notify(`⚓ 任务 #${anchor.id} 已结案归档！`, 'info');
  } else if (action === ACT_TOUCH) {
    store.touch(anchor.id);
    ctx.ui.notify(`⚓ 任务 #${anchor.id} 活跃半衰期已刷新！`, 'info');
  } else if (action === ACT_GRAVEYARD) {
    store.dropToGraveyard(anchor.id, 'Manually dropped from dashboard');
    ctx.ui.notify(`⚓ 任务 #${anchor.id} 已移入墓园档案。`, 'info');
  }

  updateAnchorStatusBar(ctx, store);
}
