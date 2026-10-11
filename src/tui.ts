import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AnchorStore, isAnchorTargetingWorkspace } from './store.ts';
import type { Anchor } from './types.ts';
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
 * Format workspace & first file context concisely (e.g. 'anchor · src/auth.ts' or 'College/优化')
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
 * Update status bar badge: `⌖ 2` (invisible when 0 active notes)
 */
export function updateAnchorStatusBar(ctx: ExtensionContext, store: AnchorStore): void {
  if (!hasActiveUI(ctx)) return;
  try {
    const active = store.list({ status: 'active', cwd: ctx.cwd });
    ctx.ui.setStatus('anchor', active.length > 0 ? `⌖ ${active.length}` : undefined);
  } catch {}
}

/**
 * Render clean sticky-note card above editor on session startup.
 * Automatically disappears as soon as the user sends their first message.
 */
export function updateStartupBanner(ctx: ExtensionContext, store: AnchorStore): void {
  if (!hasActiveUI(ctx)) return;

  try {
    const active = store.list({ status: 'active', cwd: ctx.cwd });
    if (active.length === 0) {
      ctx.ui.setWidget('anchor-startup', undefined);
      return;
    }

    const sorted = sortAnchorsForDisplay(active, ctx.cwd);
    const topItems = sorted.slice(0, 3);

    const factory = (_tui?: any, theme?: any) => ({
      render: (width: number) => {
        const maxTitleWidth = Math.max(14, width - 34);
        const fg = theme?.fg ? theme.fg.bind(theme) : (_c: string, text: string) => text;
        const label = active.length === 1 ? '1 note' : `${active.length} notes`;

        const lines: string[] = [
          truncateToWidth(fg('accent', `⌖ ${label}`), width)
        ];

        for (const a of topItems) {
          const num = a.id.replace(/^anc-/, '').padStart(2, '0');
          const origin = formatOrigin(a);
          const age = formatRelativeAge(a.createdAt);
          const titleClipped = truncateToWidth(a.title, maxTitleWidth);
          lines.push(
            truncateToWidth(
              `  ${fg('dim', num)}  ${titleClipped}  ${fg('muted', `· ${origin}`)} ${fg('dim', `(${age})`)}`,
              width
            )
          );
        }

        if (sorted.length > 3) {
          lines.push(truncateToWidth(fg('dim', `  +${sorted.length - 3} more · /anchor`), width));
        }

        return lines;
      },
      invalidate: () => {}
    });

    const content = (ctx as any).ui?.theme ? factory : factory().render(80);
    ctx.ui.setWidget('anchor-startup', content as any, { placement: 'aboveEditor' });
  } catch {}
}

/**
 * Interactive `/anchor` sticky-note board
 */
export async function openAnchorDashboard(ctx: ExtensionContext, store: AnchorStore): Promise<void> {
  if (!hasActiveUI(ctx)) return;

  const allNotes = store
    .list({ cwd: ctx.cwd, all: true })
    .filter(a => a.status === 'active' || a.status === 'sleeping');

  if (allNotes.length === 0) {
    ctx.ui.notify('⌖ No sticky notes. Use /pin <note> to stick one.', 'info');
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
    const origin = formatOrigin(a);
    const age = a.status === 'sleeping'
      ? `${formatRelativeAge(a.createdAt)} · quiet`
      : formatRelativeAge(a.createdAt);

    const colNum = `${num}  `;
    const colTitle = padToWidth(a.title, titleWidth);
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

  const actions = [
    '✓ Done (tear off note)',
    ...(anchor.status === 'sleeping' ? ['⚡ Wake up (mark active)'] : []),
    'ℹ Read full note',
    '↩ Back'
  ];

  const action = await ctx.ui.select(`⌖ #${anchor.id.replace(/^anc-/, '')}: "${anchor.title}"`, actions);
  if (!action || action.startsWith('↩')) return;

  if (action.startsWith('✓')) {
    store.settle(anchor.id, { settledBy: 'manual' });
    ctx.ui.notify(`⌖ Torn off #${anchor.id.replace(/^anc-/, '')}: "${anchor.title}" (/anchor undo to put back)`, 'info');
    updateAnchorStatusBar(ctx, store);
  } else if (action.startsWith('⚡')) {
    store.touch(anchor.id);
    ctx.ui.notify(`⌖ Woke up #${anchor.id.replace(/^anc-/, '')}: "${anchor.title}"`, 'info');
    updateAnchorStatusBar(ctx, store);
  } else if (action.startsWith('ℹ')) {
    const details = [
      `⌖ Note #${anchor.id.replace(/^anc-/, '')}: ${anchor.title}`,
      anchor.description ? `Details: ${anchor.description}` : null,
      anchor.files.length > 0 ? `Files: ${anchor.files.join(', ')}` : null,
      `Workspace: ${anchor.project || 'global'} · Pinned ${formatRelativeAge(anchor.createdAt)}`
    ].filter(Boolean).join('\n');
    ctx.ui.notify(details, 'info');
  }
}
