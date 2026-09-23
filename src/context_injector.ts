import type { AnchorStore } from './store.ts';
import { sweepStore } from './decay.ts';

/**
 * Render an ultra-compact system prompt injection block
 * Only active anchors for the current project context are injected.
 * Sleeping, graveyard, and other-project anchors consume 0 tokens.
 */
export function renderActiveAnchorsContext(
  store: AnchorStore,
  cwdOrNow?: string | number,
  nowArg?: number
): string {
  let cwd: string | undefined;
  let now = Date.now();

  if (typeof cwdOrNow === 'number') {
    now = cwdOrNow;
  } else if (typeof cwdOrNow === 'string') {
    cwd = cwdOrNow;
    if (typeof nowArg === 'number') {
      now = nowArg;
    }
  }

  // 1. Run opportunistic sweep to ensure expired anchors don't leak into context
  sweepStore(store, now);

  // 2. Fetch only 'active' anchors scoped to the current cwd
  const activeAnchors = store.list({ status: 'active', cwd });
  if (activeAnchors.length === 0) {
    return '';
  }

  const lines = activeAnchors.map(a => {
    const fileHint = a.files.length > 0 ? ` (Files: ${a.files.slice(0, 2).join(', ')})` : '';
    const tagHint = a.tags.length > 0 ? ` [${a.tags.join(', ')}]` : '';
    const projHint = a.cwd ? ` [${a.project}]` : ' [global]';
    return `• #${a.id}${projHint} [${a.priority.toUpperCase()}] ${a.title}${tagHint}${fileHint}`;
  });

  return [
    `<active-anchors count="${activeAnchors.length}">`,
    `Cross-session contracts awaiting settlement (auto-evicts upon completion):`,
    lines.join('\n'),
    `</active-anchors>`
  ].join('\n');
}
