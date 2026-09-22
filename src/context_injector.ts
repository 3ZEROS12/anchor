import { AnchorStore } from './store.ts';
import { sweepStore } from './decay.ts';

/**
 * Render an ultra-compact system prompt injection block
 * Only active anchors are injected. Sleeping and graveyard anchors consume 0 tokens.
 */
export function renderActiveAnchorsContext(store: AnchorStore, now: number = Date.now()): string {
  // 1. Run opportunistic sweep to ensure expired anchors don't leak into context
  sweepStore(store, now);

  // 2. Fetch only 'active' anchors (sleeping anchors are silenced)
  const activeAnchors = store.list({ status: 'active' });
  if (activeAnchors.length === 0) {
    return '';
  }

  const lines = activeAnchors.map(a => {
    const fileHint = a.files.length > 0 ? ` (Files: ${a.files.slice(0, 2).join(', ')})` : '';
    const tagHint = a.tags.length > 0 ? ` [${a.tags.join(', ')}]` : '';
    return `• #${a.id} [${a.priority.toUpperCase()}] ${a.title}${tagHint}${fileHint}`;
  });

  return [
    `<active-anchors count="${activeAnchors.length}">`,
    `Cross-session contracts awaiting settlement (auto-evicts upon completion):`,
    lines.join('\n'),
    `</active-anchors>`
  ].join('\n');
}
