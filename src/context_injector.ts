import type { AnchorStore } from './store.ts';
import { sweepStore } from './decay.ts';

/**
 * Render ultra-compact cold-start context block for session turn 1.
 * Only active anchors for the current project context are injected.
 * From turn 2 onwards, this returns empty string (0 tokens).
 */
export function renderColdStartAnchorsContext(
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
    const fileHint = a.files.length > 0 ? ` (${a.files.slice(0, 2).join(', ')})` : '';
    const tagHint = a.tags.length > 0 ? ` [${a.tags.join(', ')}]` : '';
    const projHint = a.cwd ? `[${a.project}]` : '[global]';
    const duraHint = a.durability === 'ephemeral' ? ' [短期备忘]' : ' [长期目标]';
    return `• #${a.id} ${projHint}${duraHint} [${a.priority.toUpperCase()}] ${a.title}${tagHint}${fileHint}`;
  });

  return [
    `<active-anchors count="${activeAnchors.length}">`,
    `Unfinished cross-session commitments from previous sessions:`,
    lines.join('\n'),
    ``,
    `CONVERSATIONAL PROTOCOL (HUMAN PARTNER TONE):`,
    `- If the user opens the session with a casual greeting or continuation ("hi", "在吗", "继续", "早上好"), naturally mention the pending item in a friendly assistant tone (e.g. "嗨！上次提到的【...】现在处理还是看别的？").`,
    `- If the user issues a direct, concrete new instruction (e.g. "帮我查下这个报错"), DO NOT interrupt their flow. Focus directly on their instruction.`,
    `- When a commitment is satisfied during work, automatically call anchor(action="settle", id=...) to clear it.`,
    `</active-anchors>`
  ].join('\n');
}

/** Legacy alias for backwards compatibility */
export const renderActiveAnchorsContext = renderColdStartAnchorsContext;
