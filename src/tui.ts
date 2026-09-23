import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore } from './store.ts';
import { evaluateAnchorDecay } from './decay.ts';

/**
 * Update the footer status bar indicator
 * Whisper-quiet: completely hidden when 0 anchors exist
 */
export function updateAnchorStatusBar(ctx: ExtensionContext, store: AnchorStore): void {
  if (!ctx.hasUI || !ctx.ui) return;

  const active = store.list({ status: 'active' });
  const sleeping = store.list({ status: 'sleeping' });

  if (active.length === 0 && sleeping.length === 0) {
    ctx.ui.setStatus('anchor', undefined);
    return;
  }

  const parts: string[] = [];
  if (active.length > 0) {
    parts.push(`anc: ${active.length} active`);
  }
  if (sleeping.length > 0) {
    parts.push(`${sleeping.length} sleep`);
  }

  ctx.ui.setStatus('anchor', `[${parts.join(', ')}]`);
}

/**
 * Display clean, non-intrusive text-based dashboard
 */
export function openAnchorDashboard(ctx: ExtensionContext, store: AnchorStore): void {
  if (!ctx.hasUI || !ctx.ui) return;

  const all = store.list();
  if (all.length === 0) {
    ctx.ui.notify('Anchor: No active contracts.\nUsage: /pin <task> or /anchor add <task>', 'info');
    return;
  }

  const active = all.filter(a => a.status === 'active');
  const sleeping = all.filter(a => a.status === 'sleeping');

  const lines: string[] = ['[Anchor Ledger]'];

  if (active.length > 0) {
    lines.push('Active:');
    for (const a of active) {
      const decay = evaluateAnchorDecay(a);
      const prio = `[${a.priority.toUpperCase()}]`;
      const files = a.files.length > 0 ? ` (${a.files.slice(0, 2).join(', ')})` : '';
      lines.push(`  #${a.id} ${prio} ${a.title}${files} · ${decay.remainingActiveDays}d left`);
    }
  }

  if (sleeping.length > 0) {
    lines.push('Sleeping:');
    for (const a of sleeping) {
      const decay = evaluateAnchorDecay(a);
      lines.push(`  #${a.id} ${a.title} · ${decay.remainingSleepDays}d until graveyard`);
    }
  }

  lines.push('Commands: /pin <task> | /anchor close <id> | /anchor sweep');
  ctx.ui.notify(lines.join('\n'), 'info');
}
