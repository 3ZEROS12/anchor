import type { AnchorStore } from './store.ts';
import type { Anchor } from './types.ts';
import { sweepStore } from './decay.ts';
import { getTodayDateString } from './store.ts';
import path from 'node:path';

/**
 * Universal multi-language comment generator.
 * Maps file extension to safe comment syntax.
 * Formats that do not safely support comments (e.g. .json, .env, binary) return null.
 */
export const COMMENT_FORMATS: Record<string, (msg: string) => string> = {
  // Double slash //
  '.ts': m => `// ${m}`,
  '.tsx': m => `// ${m}`,
  '.js': m => `// ${m}`,
  '.jsx': m => `// ${m}`,
  '.mjs': m => `// ${m}`,
  '.cjs': m => `// ${m}`,
  '.java': m => `// ${m}`,
  '.kt': m => `// ${m}`,
  '.swift': m => `// ${m}`,
  '.go': m => `// ${m}`,
  '.rs': m => `// ${m}`,
  '.c': m => `// ${m}`,
  '.cpp': m => `// ${m}`,
  '.h': m => `// ${m}`,
  '.hpp': m => `// ${m}`,
  '.cs': m => `// ${m}`,
  '.dart': m => `// ${m}`,
  '.scala': m => `// ${m}`,
  '.zig': m => `// ${m}`,
  '.proto': m => `// ${m}`,

  // Hash #
  '.py': m => `# ${m}`,
  '.rb': m => `# ${m}`,
  '.sh': m => `# ${m}`,
  '.bash': m => `# ${m}`,
  '.zsh': m => `# ${m}`,
  '.yaml': m => `# ${m}`,
  '.yml': m => `# ${m}`,
  '.toml': m => `# ${m}`,
  '.conf': m => `# ${m}`,
  '.dockerfile': m => `# ${m}`,
  '.ps1': m => `# ${m}`,
  '.r': m => `# ${m}`,

  // HTML / XML <!-- -->
  '.html': m => `<!-- ${m} -->`,
  '.xml': m => `<!-- ${m} -->`,
  '.svg': m => `<!-- ${m} -->`,
  '.vue': m => `<!-- ${m} -->`,
  '.svelte': m => `<!-- ${m} -->`,

  // Block comment /* */
  '.css': m => `/* ${m} */`,
  '.scss': m => `/* ${m} */`,
  '.less': m => `/* ${m} */`,

  // SQL / Lua / Haskell --
  '.sql': m => `-- ${m}`,
  '.lua': m => `-- ${m}`,
  '.hs': m => `-- ${m}`,

  // Batch REM
  '.bat': m => `REM ${m}`,
  '.cmd': m => `REM ${m}`,
};

/**
 * Format safe task context comment for a specific file.
 * Returns null for formats that do not safely support comments (e.g. .json, .env, .lock)
 */
export function makeSafeTaskAnnotation(filePath: string, anchor: Anchor): string | null {
  const ext = path.extname(filePath).toLowerCase();
  const formatter = COMMENT_FORMATS[ext];
  if (!formatter) {
    return null;
  }
  return '\n\n' + formatter(`⌖ anchor context: #${anchor.id} ${anchor.title} (${anchor.priority.toUpperCase()})`);
}

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

    // Target cadence hint
    let targetHint = '';
    if (a.recurrence === 'daily') {
      targetHint = ' [今日循环·Daily]';
    } else if (a.targetDate) {
      const todayStr = getTodayDateString(now);
      if (a.targetDate === todayStr) {
        targetHint = ' [今日聚焦·Due Today]';
      } else if (a.targetDate < todayStr) {
        targetHint = ' [已逾期·Overdue]';
      } else {
        targetHint = ` [排期:${a.targetDate}]`;
      }
    } else {
      targetHint = ' [长期愿景·Someday]';
    }

    const ageDays = Math.floor((now - a.createdAt) / (24 * 60 * 60 * 1000));
    const ageHint = ageDays > 0 ? ` (${ageDays}d old)` : '';

    return `• #${a.id} ${projHint}${targetHint} [${a.priority.toUpperCase()}] ${a.title}${ageHint}${tagHint}${fileHint}`;
  });

  return [
    `<active-anchors count="${activeAnchors.length}">`,
    `Unfinished cross-session commitments from previous sessions:`,
    lines.join('\n'),
    ``,
    `CONVERSATIONAL PROTOCOL (HUMAN PARTNER TONE):`,
    `- If the user opens the session with a casual greeting or continuation ("hi", "在吗", "继续", "早上好"), naturally prioritize items tagged [今日聚焦·Due Today] in a friendly assistant tone (e.g. "嗨！今天规划的【...】现在处理还是看别的？").`,
    `- If the user issues a direct, concrete new instruction (e.g. "帮我查下这个报错"), DO NOT interrupt their flow. Focus directly on their instruction.`,
    `- When a commitment is satisfied during work, automatically call anchor(action="settle", id=...) to clear it.`,
    `</active-anchors>`
  ].join('\n');
}

/** Legacy alias for backwards compatibility */
export const renderActiveAnchorsContext = renderColdStartAnchorsContext;
