import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore } from './store.ts';
import { evaluateAnchorDecay } from './decay.ts';
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
    parts.push(`⚓ ${active.length} active`);
  }
  if (sleeping.length > 0) {
    parts.push(`${sleeping.length} sleep`);
  }

  ctx.ui.setStatus('anchor', `[${parts.join(', ')}]`);
}

/**
 * Clean, fast, non-intrusive text ledger output
 */
export function openAnchorDashboard(
  ctx: ExtensionContext,
  store: AnchorStore,
  options?: { showAll?: boolean }
): void {
  if (!ctx.hasUI || !ctx.ui) return;

  const showAll = options?.showAll || false;
  const list = store.list({ cwd: showAll ? undefined : ctx.cwd, all: showAll });

  if (list.length === 0) {
    const scopeLabel = showAll ? '全部空间' : `当前工程 (${path.basename(ctx.cwd) || '根目录'})`;
    ctx.ui.notify(`Anchor: ${scopeLabel} 暂无活跃锚点。\n用法: /pin <任务描述> 或 /anchor all 查看全盘`, 'info');
    return;
  }

  const active = list.filter(a => a.status === 'active');
  const sleeping = list.filter(a => a.status === 'sleeping');

  const scopeTitle = showAll ? '全盘总览' : (path.basename(ctx.cwd) || '当前项目');
  const lines: string[] = [`[⚓ Anchor 任务清单 · ${scopeTitle}]`];

  if (active.length > 0) {
    lines.push('活跃契约 (Active):');
    for (const a of active) {
      const decay = evaluateAnchorDecay(a);
      const prio = `[${a.priority.toUpperCase()}]`;
      const projTag = a.cwd ? `[${a.project}]` : '[global]';
      const files = a.files.length > 0 ? ` (${a.files.slice(0, 2).join(', ')})` : '';
      const verify = a.verifyCommand ? ` [verify: ${a.verifyCommand}]` : '';
      lines.push(`  #${a.id} ${projTag} ${prio} ${a.title}${files}${verify} · 剩余 ${decay.remainingActiveDays}天`);
    }
  }

  if (sleeping.length > 0) {
    lines.push('休眠中 (Sleeping - 0 Token):');
    for (const a of sleeping) {
      const decay = evaluateAnchorDecay(a);
      const projTag = a.cwd ? `[${a.project}]` : '[global]';
      lines.push(`  #${a.id} ${projTag} ${a.title} · 距脱落还剩 ${decay.remainingSleepDays}天`);
    }
  }

  lines.push('操作: /pin <任务> | /anchor all | /anchor close <id> | /anchor sweep');
  ctx.ui.notify(lines.join('\n'), 'info');
}
