import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore } from './store.ts';
import { evaluateAnchorDecay } from './decay.ts';

/**
 * Update the footer status bar indicator
 * Uses clean Cupertino / Minimalist dot aesthetic
 */
export function updateAnchorStatusBar(ctx: ExtensionContext, store: AnchorStore): void {
  if (!ctx.ui?.hasUI) return;

  const active = store.list({ status: 'active' });
  const sleeping = store.list({ status: 'sleeping' });

  if (active.length === 0 && sleeping.length === 0) {
    ctx.ui.setStatus('anchor', undefined);
    return;
  }

  const parts: string[] = [];
  if (active.length > 0) {
    parts.push(`⚓ ● ${active.length} active`);
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
  if (!ctx.ui?.hasUI) return;

  const all = store.list();
  if (all.length === 0) {
    const action = await ctx.ui.select('⚓ Anchor 任务锚点看板 (空空如也)', [
      { label: '➕ 新建跨会话锚点', value: 'add' },
      { label: '✕ 退出看板', value: 'exit' }
    ]);

    if (action === 'add') {
      const title = await ctx.ui.input('落锚新建', '请输入任务标题与承兑承诺:');
      if (title && title.trim()) {
        const created = store.create({ title: title.trim() });
        ctx.ui.notify(`⚓ 任务 #${created.id} 已成功锚定！`, 'info');
        updateAnchorStatusBar(ctx, store);
      }
    }
    return;
  }

  const options = all.map(a => {
    const decay = evaluateAnchorDecay(a);
    const badge = a.status === 'active' ? '🟢 活跃' : '💤 休眠';
    const prio = `[${a.priority.toUpperCase()}]`;
    const daysInfo = a.status === 'active'
      ? `(活跃剩余 ${decay.remainingActiveDays}天)`
      : `(离脱落剩余 ${decay.remainingSleepDays}天)`;

    return {
      label: `${badge} #${a.id} ${prio} ${a.title} ${daysInfo}`,
      value: a.id
    };
  });

  options.push({ label: '➕ 新增任务锚点...', value: 'add' });
  options.push({ label: '✕ 关闭看板', value: 'exit' });

  const selected = await ctx.ui.select('⚓ Anchor 任务锚点驾驶舱', options);
  if (!selected || selected === 'exit') return;

  if (selected === 'add') {
    const title = await ctx.ui.input('落锚新建', '请输入任务标题:');
    if (title && title.trim()) {
      const created = store.create({ title: title.trim() });
      ctx.ui.notify(`⚓ 任务 #${created.id} 已成功锚定！`, 'info');
      updateAnchorStatusBar(ctx, store);
    }
    return;
  }

  const anchor = store.get(selected);
  if (!anchor) return;

  // Actions for selected anchor
  const action = await ctx.ui.select(`管理任务 #${anchor.id}: ${anchor.title}`, [
    { label: '✓ 确认结案归档 (Settle & Evict)', value: 'settle' },
    { label: '⚡ 触碰激活 (Touch & Refresh TTL)', value: 'touch' },
    { label: '🗑 移入墓园 (Drop to Graveyard)', value: 'graveyard' },
    { label: '← 返回', value: 'back' }
  ]);

  if (action === 'settle') {
    store.settle(anchor.id, { settledBy: 'manual-command' });
    ctx.ui.notify(`⚓ 任务 #${anchor.id} 已结案归档！`, 'info');
  } else if (action === 'touch') {
    store.touch(anchor.id);
    ctx.ui.notify(`⚓ 任务 #${anchor.id} 活跃半衰期已刷新！`, 'info');
  } else if (action === 'graveyard') {
    store.dropToGraveyard(anchor.id, 'Manually dropped from dashboard');
    ctx.ui.notify(`⚓ 任务 #${anchor.id} 已移入墓园档案。`, 'info');
  }

  updateAnchorStatusBar(ctx, store);
}
