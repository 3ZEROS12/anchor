import type { ExtensionCommandContext, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore, isAnchorTargetingWorkspace, isSameOrSubPath } from './store.ts';
import { materializeSteps } from './graph.ts';
import { defaultDockController, STATUS_GLYPH } from './dock.ts';
import type { Anchor, AnchorProgress } from './types.ts';
import fs from 'node:fs';
import path from 'node:path';

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, '');
}

/**
 * Calculate visual terminal column width (CJK/Kana/Hangul/Emoji = 2 cells, ASCII = 1 cell)
 */
export function getDisplayWidth(str: string): number {
  const clean = stripAnsi(str);
  let width = 0;

  for (const char of clean) {
    const code = char.codePointAt(0) || 0;
    if (
      code === 0x200d ||
      code === 0xfe0f ||
      code === 0xfe0e ||
      (code >= 0x0300 && code <= 0x036f) ||
      (code >= 0x200b && code <= 0x200f)
    ) {
      continue;
    }

    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df) ||
      (code >= 0x2a700 && code <= 0x2b73f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x3130 && code <= 0x318f) ||
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff) ||
      (code >= 0x1f300 && code <= 0x1f9ff) ||
      (code >= 0x1f600 && code <= 0x1f64f) ||
      (code >= 0x1f680 && code <= 0x1f6ff) ||
      (code >= 0x2600 && code <= 0x27bf) ||
      (code >= 0x1fa70 && code <= 0x1faff)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }

  return width;
}

export function hasActiveUI(ctx: ExtensionContext | null | undefined): ctx is ExtensionContext {
  if (!ctx) return false;
  try {
    return Boolean(ctx.hasUI && ctx.ui);
  } catch {
    return false;
  }
}

export function truncateToWidth(str: string, maxWidth: number, ellipsis = '…'): string {
  if (maxWidth <= 0) return '';
  const singleLine = str.replace(/[\r\n\t]+/g, ' ');
  const totalWidth = getDisplayWidth(singleLine);
  if (totalWidth <= maxWidth) return singleLine;

  const ellipsisWidth = getDisplayWidth(ellipsis);
  const target = Math.max(0, maxWidth - ellipsisWidth);
  if (target === 0) return ellipsis.slice(0, maxWidth);

  let accumulated = '';
  let accumWidth = 0;
  let i = 0;

  while (i < singleLine.length) {
    ANSI_REGEX.lastIndex = i;
    const match = ANSI_REGEX.exec(singleLine);
    if (match && match.index === i) {
      accumulated += match[0];
      i += match[0].length;
      continue;
    }

    const codePoint = singleLine.codePointAt(i) || 0;
    const charLen = codePoint > 0xffff ? 2 : 1;
    const fullChar = singleLine.slice(i, i + charLen);
    const charWidth = getDisplayWidth(fullChar);

    if (accumWidth + charWidth > target) break;
    accumulated += fullChar;
    accumWidth += charWidth;
    i += charLen;
  }

  // Invariant 11: Strip any trailing unclosed parenthesis/bracket fragment right before ellipsis
  accumulated = accumulated.replace(/\s*[\(\[\{（【][^)\]}）】]*$/, '');
  return accumulated + ellipsis + (singleLine.includes('\x1b') ? '\x1b[0m' : '');
}

export function padToWidth(str: string, targetWidth: number): string {
  const truncated = truncateToWidth(str, targetWidth);
  const current = getDisplayWidth(truncated);
  if (current >= targetWidth) return truncated;
  return truncated + ' '.repeat(targetWidth - current);
}

/**
 * Render a 4-cell micro progress bar: e.g. `[■■□□ 2/4]` or `[■□□□ 5/30]`
 */
export function formatProgressBar(progress?: AnchorProgress, cells = 4): string {
  if (!progress || !progress.total || progress.total < 1) return '';
  const done = Math.max(0, Math.min(progress.total, progress.done || 0));
  const filled = Math.min(cells, Math.max(done > 0 ? 1 : 0, Math.round((done / progress.total) * cells)));
  const finalFilled = done >= progress.total ? cells : (done === 0 ? 0 : filled);
  const bar = '■'.repeat(finalFilled) + '□'.repeat(Math.max(0, cells - finalFilled));
  return `[${bar} ${done}/${progress.total}]`;
}

/**
 * Format relative sticky-note age cleanly: 'just now', '15m ago', '3h ago', '2d ago'
 */
export function formatRelativeAge(timestamp: number, now: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Format workspace & first file context concisely (e.g. 'anchor · auth.ts' or 'College/优化')
 */
export function formatOrigin(anchor: Anchor | string): string {
  if (typeof anchor === 'string') {
    if (!anchor) return 'global';
    return path.basename(anchor.replace(/\\/g, '/')) || 'global';
  }

  let proj = 'global';
  if (anchor.project && anchor.project !== 'global') {
    const normProj = anchor.project.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normProj.includes('/')) {
      const parts = normProj.split('/').filter(Boolean);
      proj = parts.slice(-2).join('/');
    } else {
      proj = normProj;
    }
  } else if (anchor.cwd) {
    proj = path.basename(anchor.cwd.replace(/\\/g, '/')) || 'global';
  }

  if (anchor.files && anchor.files.length > 0) {
    const shortFile = path.basename(anchor.files[0].replace(/\\/g, '/'));
    if (shortFile && !proj.endsWith(shortFile)) {
      return `${proj} · ${shortFile}`;
    }
  }
  return proj;
}

/**
 * Sort sticky notes naturally:
 * 1. Active notes before quiet (>7d untouched) notes
 * 2. Notes belonging to current workspace first
 * 3. Most recently touched first
 */
export function sortAnchorsForDisplay(anchors: Anchor[], cwd?: string): Anchor[] {
  return [...anchors].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'active' ? -1 : 1;
    }
    if (cwd) {
      const aMatch = isAnchorTargetingWorkspace(a, cwd) ? 0 : 1;
      const bMatch = isAnchorTargetingWorkspace(b, cwd) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }
    return b.lastTouchedAt - a.lastTouchedAt;
  });
}

/**
 * Update status bar badge (`⌖ 2`) AND the persistent below-editor sticky strip!
 */
export function updateAnchorStatusBar(ctx: ExtensionContext, store: AnchorStore): void {
  if (!hasActiveUI(ctx)) return;
  try {
    const active = store.list({ status: 'active', cwd: ctx.cwd });
    ctx.ui.setStatus('anchor', active.length > 0 ? `⌖ ${active.length}` : undefined);
    updateStartupBanner(ctx, store);
  } catch {}
}

/**
 * Render persistent `belowEditor` Anchor Dock (Tree Dock when expanded, 1-line strip when folded).
 * Never collides with `pi-lingual` (`aboveEditor`), stays visible while you work,
 * and takes 0 lines when there are no active notes.
 */
export function updateStartupBanner(ctx: ExtensionContext, store: AnchorStore): void {
  if (!hasActiveUI(ctx)) return;

  try {
    const active = store.list({ status: 'active', cwd: ctx.cwd });
    if (active.length === 0) {
      ctx.ui.setWidget('anchor-startup', undefined, { placement: 'belowEditor' });
      return;
    }

    const factory = (_tui?: any, theme?: any) => ({
      render: (width: number) =>
        defaultDockController.renderDockLines(active, {
          width,
          cwd: ctx.cwd,
          theme: (ctx as any).ui?.theme ?? theme
        }),
      invalidate: () => {}
    });

    const content = (ctx as any).ui?.theme ? factory : factory().render(80);
    ctx.ui.setWidget('anchor-startup', content as any, { placement: 'belowEditor' });
  } catch {}
}

/**
 * Interactive `/anchor` sticky-note board with 1-click progress stepping and session teleport (`switchSession`)
 */
export async function openAnchorDashboard(
  ctx: ExtensionContext | ExtensionCommandContext,
  store: AnchorStore
): Promise<void> {
  if (!hasActiveUI(ctx)) return;

  const allNotes = store
    .list({ cwd: ctx.cwd, all: true })
    .filter(a => a.status === 'active' || a.status === 'sleeping');

  if (allNotes.length === 0) {
    ctx.ui.notify('⌖ No sticky notes. Type `pin: <note>` or `/pin <note>` to stick one.', 'info');
    return;
  }

  const sorted = sortAnchorsForDisplay(allNotes, ctx.cwd);
  const optionMap = new Map<string, Anchor>();
  const displayOptions: string[] = [];
  const termCols = process.stdout?.columns || 96;
  const isNarrow = termCols < 84;
  const titleWidth = isNarrow ? Math.max(20, termCols - 30) : 42;

  for (const a of sorted) {
    const num = a.id.replace(/^anc-/, '').padStart(2, '0');
    const bar = a.progress ? `${formatProgressBar(a.progress)} ` : '';
    const origin = formatOrigin(a) + (a.sessionFile ? ' ↪' : '');
    const age = a.status === 'sleeping'
      ? `${formatRelativeAge(a.createdAt)} · quiet`
      : formatRelativeAge(a.createdAt);

    const colNum = `${num}  `;
    const colTitle = padToWidth(`${bar}${a.title}`, titleWidth);
    const colOrigin = padToWidth(origin, 22);

    const label = isNarrow
      ? `${colNum}${colTitle}  ${age}`.trimEnd()
      : `${colNum}${colTitle}  ${colOrigin}  ${age}`.trimEnd();

    optionMap.set(label, a);
    displayOptions.push(label);
  }

  const selected = await ctx.ui.select('⌖ Notes (select a note):', displayOptions);
  if (!selected) return;

  const anchor = optionMap.get(selected);
  if (!anchor) return;

  const currentSessionFile = (ctx as any).sessionManager?.getSessionFile?.();
  const canJumpSession = Boolean(
    anchor.sessionFile &&
    fs.existsSync(anchor.sessionFile) &&
    typeof (ctx as ExtensionCommandContext).switchSession === 'function' &&
    (!currentSessionFile || !isSameOrSubPath(anchor.sessionFile, currentSessionFile))
  );

  const stepLabel = anchor.progress
    ? `▶ Advance step (${anchor.progress.done}/${anchor.progress.total} ➔ ${Math.min(anchor.progress.total, anchor.progress.done + 1)}/${anchor.progress.total})`
    : '▶ Start progress bar (1/4)';

  const structuredSteps = materializeSteps(anchor.progress);
  const stepOptions = structuredSteps.map(s => {
    const g = STATUS_GLYPH[s.status] || '○';
    const nextAction = s.status === 'completed' ? 'reopen' : 'complete';
    return `${g} Step ${s.id}: ${s.subject} (${nextAction})`;
  });

  const actions = [
    '✓ Done (tear off note)',
    stepLabel,
    ...stepOptions,
    ...(canJumpSession ? ['↪ Jump to session (resume linked conversation)'] : []),
    ...(anchor.status === 'sleeping' ? ['⚡ Wake up (mark active)'] : []),
    'ℹ Read full note',
    '↩ Back'
  ];

  const action = await ctx.ui.select(`⌖ #${anchor.id.replace(/^anc-/, '')}: "${anchor.title}"`, actions);
  if (!action || action.startsWith('↩')) return;

  if (action.startsWith('✓ Done')) {
    store.settle(anchor.id, { settledBy: 'manual' });
    ctx.ui.notify(`⌖ Torn off #${anchor.id.replace(/^anc-/, '')}: "${anchor.title}" (/anchor undo to put back)`, 'info');
    updateAnchorStatusBar(ctx, store);
  } else if (action.startsWith('▶')) {
    const { anchor: updated, completed } = store.step(anchor.id, 1);
    updateAnchorStatusBar(ctx, store);
    if (completed) {
      ctx.ui.notify(
        `⌖ #${updated.id.replace(/^anc-/, '')} reached ${formatProgressBar(updated.progress)}! Run /done ${updated.id.replace(/^anc-/, '')} to tear off.`,
        'info'
      );
    } else {
      ctx.ui.notify(`⌖ Advanced #${updated.id.replace(/^anc-/, '')} to ${formatProgressBar(updated.progress)}`, 'info');
    }
  } else if (/^[○◐✓✗]\s+Step\s+(\d+):/.test(action)) {
    const m = action.match(/Step\s+(\d+):/);
    if (m) {
      const stepId = parseInt(m[1], 10);
      const targetStep = structuredSteps.find(s => s.id === stepId);
      if (targetStep) {
        const nextStatus = targetStep.status === 'completed' ? 'pending' : 'completed';
        const updated = store.updateStep(anchor.id, stepId, { status: nextStatus });
        ctx.ui.notify(
          `⌖ Step ${stepId} ${nextStatus === 'completed' ? 'completed ✓' : 'reopened ○'} (${formatProgressBar(updated.progress)})`,
          'info'
        );
        updateAnchorStatusBar(ctx, store);
      }
    }
  } else if (action.startsWith('↪') && anchor.sessionFile) {
    try {
      await (ctx as ExtensionCommandContext).switchSession(anchor.sessionFile);
    } catch (err: any) {
      ctx.ui.notify(`Could not switch session: ${err.message}`, 'error');
    }
  } else if (action.startsWith('⚡')) {
    store.touch(anchor.id);
    ctx.ui.notify(`⌖ Woke up #${anchor.id.replace(/^anc-/, '')}: "${anchor.title}"`, 'info');
    updateAnchorStatusBar(ctx, store);
  } else if (action.startsWith('ℹ')) {
    const details = [
      `⌖ Note #${anchor.id.replace(/^anc-/, '')}: ${anchor.title}`,
      anchor.progress ? `Progress: ${formatProgressBar(anchor.progress)}${anchor.progress.steps ? ` (${anchor.progress.steps.join(' → ')})` : ''}` : null,
      anchor.description ? `Details: ${anchor.description}` : null,
      anchor.files.length > 0 ? `Files: ${anchor.files.join(', ')}` : null,
      anchor.sessionFile ? `Session: ${ path.basename(anchor.sessionFile)}` : null,
      `Workspace: ${anchor.project || 'global'} · Pinned ${formatRelativeAge(anchor.createdAt)}`
    ].filter(Boolean).join('\n');
    ctx.ui.notify(details, 'info');
  }
}
