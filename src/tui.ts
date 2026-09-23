import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore } from './store.ts';

/**
 * Update the footer status bar indicator
 * Completely hidden when 0 anchors exist.
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
 * Clean, fast, non-intrusive text output
 */
export function openAnchorDashboard(ctx: ExtensionContext, store: AnchorStore): void {
  if (!ctx.hasUI || !ctx.ui) return;

  const active = store.list({ status: 'active', cwd: ctx.cwd });
  if (active.length === 0) {
    ctx.ui.notify('⚓ 暂无待办任务。输入 `/pin <任务描述>` 记录。', 'info');
    return;
  }

  const lines: string[] = ['[⚓ 待办锚点]'];
  for (const a of active) {
    lines.push(`  #${a.id}  ${a.title}`);
  }
  lines.push('完成请输: /anchor <id>，或在退出会话时自动结案');

  ctx.ui.notify(lines.join('\n'), 'info');
}
