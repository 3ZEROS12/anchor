import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { DualAnchorStore, AnchorStore } from './store.ts';
import { evaluateAnchorDecay } from './decay.ts';

/**
 * Update the footer status bar indicator
 * Clean, whisper-quiet original anchor icon: [⚓ 1 active]
 * Completely hidden when 0 anchors exist.
 */
export function updateAnchorStatusBar(ctx: ExtensionContext, store: DualAnchorStore | AnchorStore): void {
  if (!ctx.hasUI || !ctx.ui) return;

  const active = store.list({ status: 'active' });
  const sleeping = store.list({ status: 'sleeping' });

  if (active.length === 0 && sleeping.length === 0) {
    ctx.ui.setStatus('anchor', undefined);
    return;
  }

  const parts: string[] = [];
  if (active.length > 0) {
    parts.push(`⚓ ${active.length} active`);
  }
  if (sleeping.length > 0) {
    parts.push(`${sleeping.length} sleep`);
  }

  ctx.ui.setStatus('anchor', `[${parts.join(', ')}]`);
}

/**
 * Clean, fast, non-intrusive text ledger output (no complex TUI modals)
 */
export function openAnchorDashboard(ctx: ExtensionContext, store: DualAnchorStore | AnchorStore): void {
  if (!ctx.hasUI || !ctx.ui) return;

  const all = store.list();
  if (all.length === 0) {
    ctx.ui.notify('Anchor: 暂无活跃锚点。\n用法: /pin [-g] <任务描述> 或 /anchor add [-g] <任务描述>', 'info');
    return;
  }

  const active = all.filter(a => a.status === 'active');
  const sleeping = all.filter(a => a.status === 'sleeping');

  const lines: string[] = ['[⚓ Anchor 任务清单]'];

  if (active.length > 0) {
    lines.push('活跃契约 (Active):');
    for (const a of active) {
      const decay = evaluateAnchorDecay(a);
      const prio = `[${a.priority.toUpperCase()}]`;
      const scopeBadge = a.scope === 'global' ? '[全局]' : '[项目]';
      const files = a.files.length > 0 ? ` (${a.files.slice(0, 2).join(', ')})` : '';
      lines.push(`  #${a.id} ${scopeBadge} ${prio} ${a.title}${files} · 剩余 ${decay.remainingActiveDays}天`);
    }
  }

  if (sleeping.length > 0) {
    lines.push('休眠中 (Sleeping - 0 Token):');
    for (const a of sleeping) {
      const decay = evaluateAnchorDecay(a);
      const scopeBadge = a.scope === 'global' ? '[全局]' : '[项目]';
      lines.push(`  #${a.id} ${scopeBadge} ${a.title} · 距墓园脱落还剩 ${decay.remainingSleepDays}天`);
    }
  }

  lines.push('操作: /pin [-g] <任务> | /anchor close <id> | /anchor sweep');
  ctx.ui.notify(lines.join('\n'), 'info');
}
