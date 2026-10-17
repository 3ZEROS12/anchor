import { materializeSteps, selectDockStepLayout } from './graph.ts';
import type { Anchor, AnchorStep, StepStatus } from './types.ts';
import { formatMicroGauge, formatOrigin, formatProgressBar, getDisplayWidth, sortAnchorsForDisplay, truncateToWidth } from './tui.ts';

export const STATUS_GLYPH: Record<StepStatus, string> = {
  pending: '○',
  in_progress: '◐',
  completed: '✓',
  deleted: '✗'
};

export function formatStepGlyph(status: StepStatus, fg: (color: string, text: string) => string): string {
  switch (status) {
    case 'pending':
      return fg('dim', '○');
    case 'in_progress':
      return fg('warning', '◐');
    case 'completed':
      return fg('success', '✓');
    case 'deleted':
      return fg('error', '✗');
  }
}

export function applyStrikethrough(text: string, theme?: any): string {
  if (theme && typeof theme.strikethrough === 'function') {
    return theme.strikethrough(text);
  }
  return `\x1b[9m${text}\x1b[29m`;
}

/**
 * Format a single step row inside the `belowEditor` Tree Dock:
 * `✓ #1 Extract auth interface` (strikethrough)
 * `◐ #2 Switch token to HttpOnly cookie (editing auth.ts)`
 * `○ #3 Add integration tests ⛓ #2`
 */
export function formatDockStepRow(
  step: AnchorStep,
  options: {
    fg: (color: string, text: string) => string;
    theme?: any;
    showId?: boolean;
    fallbackActiveForm?: string;
    liveDurationSec?: number;
    driftWarning?: string;
  }
): string {
  const { fg, theme, showId = true, fallbackActiveForm, liveDurationSec, driftWarning } = options;
  const glyph = formatStepGlyph(step.status, fg);
  const subjectColor =
    step.status === 'in_progress'
      ? 'accent'
      : step.status === 'completed' || step.status === 'deleted'
        ? 'muted'
        : 'text';

  let subject = fg(subjectColor, step.subject);
  if (step.status === 'completed' || step.status === 'deleted') {
    subject = applyStrikethrough(subject, theme);
  }

  let row = glyph;
  if (showId) {
    row += ` ${fg('dim', `${step.id}.`)}`;
  }
  row += ` ${subject}`;

  const activeForm = step.status === 'in_progress' ? (step.activeForm || fallbackActiveForm) : undefined;
  if (activeForm) {
    const durStr = typeof liveDurationSec === 'number' && liveDurationSec > 0 ? ` · ${liveDurationSec}s` : '';
    row += ` ${fg('muted', `(${activeForm}${durStr})`)}`;
  }

  if (driftWarning) {
    row += ` ${fg('warning', `⚠️ [Drift: ${driftWarning}]`)}`;
  }

  if (step.blockedBy && step.blockedBy.length > 0) {
    row += ` ${fg('muted', `⛓ #${step.blockedBy.join(',#')}`)}`;
  }

  return row;
}

/**
 * Stateful Dock Controller managing:
 * - Expanded Tree Dock vs 1-Line Compact Strip (`collapsed` state, toggled via `Alt+A` or `/anchor fold`)
 * - 1-Turn Completed Step Grace Period (`completedStepIdsPendingHide` -> `hiddenCompletedStepIds` on `agent_start`)
 */
export class AnchorDockController {
  private collapsed = false;
  private pendingHideByAnchor = new Map<string, Set<number>>();
  private hiddenByAnchor = new Map<string, Set<number>>();

  public isCollapsed(): boolean {
    return this.collapsed;
  }

  public setCollapsed(val: boolean): void {
    this.collapsed = val;
  }

  public toggleCollapsed(): boolean {
    this.collapsed = !this.collapsed;
    return this.collapsed;
  }

  public resetGraceState(anchorId?: string): void {
    if (anchorId) {
      this.pendingHideByAnchor.delete(anchorId);
      this.hiddenByAnchor.delete(anchorId);
    } else {
      this.pendingHideByAnchor.clear();
      this.hiddenByAnchor.clear();
    }
  }

  /**
   * Called on `agent_start`: folds away completed steps that were shown with `✓` strikethrough
   * during the previous turn so the dock stays compact while coding.
   */
  public foldCompletedStepsFromPreviousTurn(): boolean {
    let changed = false;
    for (const [anchorId, pendingSet] of this.pendingHideByAnchor.entries()) {
      if (pendingSet.size === 0) continue;
      let hiddenSet = this.hiddenByAnchor.get(anchorId);
      if (!hiddenSet) {
        hiddenSet = new Set<number>();
        this.hiddenByAnchor.set(anchorId, hiddenSet);
      }
      for (const id of pendingSet) {
        hiddenSet.add(id);
        changed = true;
      }
      pendingSet.clear();
    }
    return changed;
  }

  /**
   * Render the `belowEditor` widget lines for active anchors.
   * - If `collapsed === true` OR no anchor has multi-step items, renders the 1-line Sticky Strip.
   * - If `collapsed === false` AND the primary anchor has structured steps (`total >= 2`),
   *   renders the multi-row Tree Dock (up to `maxStepRows = 4` step rows + optional side note summary).
   */
  public renderDockLines(
    activeAnchors: readonly Anchor[],
    options: {
      width: number;
      cwd?: string;
      theme?: any;
      maxStepRows?: number;
    }
  ): string[] {
    const { width, cwd, theme, maxStepRows = 4 } = options;
    if (activeAnchors.length === 0) return [];

    const sorted = sortAnchorsForDisplay([...activeAnchors], cwd);
    const fg = theme?.fg ? theme.fg.bind(theme) : (_c: string, text: string) => text;
    const primary = sorted[0];
    const steps = materializeSteps(primary.progress);

    // 1. Compact 1-Line Strip Mode (when collapsed, narrow <60 cols, or no multi-step tree on primary note)
    if (this.collapsed || width < 60 || steps.length < 2) {
      return this.renderSingleLineStrip(sorted, width, fg);
    }

    // 2. Expanded Tree Dock Mode for multi-step primary anchor
    const completedIds = new Set(steps.filter(s => s.status === 'completed').map(s => s.id));
    const pendingSet = this.pendingHideByAnchor.get(primary.id) ?? new Set<number>();
    const hiddenSet = this.hiddenByAnchor.get(primary.id) ?? new Set<number>();

    // Prune stale IDs if step was un-completed
    for (const id of [...pendingSet]) {
      if (!completedIds.has(id)) pendingSet.delete(id);
    }
    for (const id of [...hiddenSet]) {
      if (!completedIds.has(id)) hiddenSet.delete(id);
    }
    this.pendingHideByAnchor.set(primary.id, pendingSet);
    this.hiddenByAnchor.set(primary.id, hiddenSet);

    const layout = selectDockStepLayout(steps, maxStepRows, hiddenSet);

    // Record newly displayed completed steps so they fold on the next turn
    for (const s of layout.visible) {
      if (s.status === 'completed' && !pendingSet.has(s.id) && !hiddenSet.has(s.id)) {
        pendingSet.add(s.id);
      }
    }

    // If all steps were hidden or layout has 0 visible rows, fall back to 1-line strip
    if (layout.visible.length === 0) {
      return this.renderSingleLineStrip(sorted, width, fg);
    }

    const num = primary.id.replace(/^anc-/, '');
    const bar = primary.progress ? `${fg('accent', formatProgressBar(primary.progress))} ` : '';
    const origin = formatOrigin(primary);
    const sessionIcon = primary.sessionFile ? ' ↪' : '';
    const blockedTag = primary.blockedBy && primary.blockedBy.length > 0
      ? ` ${fg('muted', `⛓ #${primary.blockedBy.map(b => b.replace(/^anc-/, '')).join(',#')}`)}`
      : '';
    const foldHint = width >= 76 ? fg('dim', '  [Alt+A fold]') : '';

    const headerPrefix = `${fg('accent', '⌖')} ${fg('dim', `#${num}`)} ${bar}`;
    const headerSuffix = `${blockedTag} ${fg('muted', `(${origin}${sessionIcon})`)}${foldHint}`;
    const titleBudget = Math.max(12, width - getDisplayWidth(headerPrefix) - getDisplayWidth(headerSuffix) - 2);
    const headerLine = truncateToWidth(
      `${headerPrefix}${truncateToWidth(primary.title, titleBudget)}${headerSuffix}`,
      width
    );

    const lines: string[] = [headerLine];
    const otherNotes = sorted.slice(1);
    const hasFooterRow = layout.hiddenCompleted > 0 || layout.truncatedTail > 0 || otherNotes.length > 0;

    for (let i = 0; i < layout.visible.length; i++) {
      const step = layout.visible[i];
      const isLastRow = i === layout.visible.length - 1 && !hasFooterRow;
      const branch = fg('dim', isLastRow ? '└─ ' : '├─ ');
      const liveDurationSec = primary.liveStartedAt ? Math.max(1, Math.floor((Date.now() - primary.liveStartedAt) / 1000)) : undefined;
      const stepText = formatDockStepRow(step, {
        fg,
        theme,
        showId: true,
        fallbackActiveForm: primary.activeForm,
        liveDurationSec: step.status === 'in_progress' ? liveDurationSec : undefined,
        driftWarning: step.status === 'in_progress' ? primary.driftWarning : undefined
      });
      lines.push(truncateToWidth(`${branch}${stepText}`, width));
    }

    if (hasFooterRow) {
      const parts: string[] = [];
      if (layout.hiddenCompleted > 0 || layout.truncatedTail > 0) {
        const overflowDetails: string[] = [];
        if (layout.hiddenCompleted > 0) overflowDetails.push(`${layout.hiddenCompleted} done`);
        if (layout.truncatedTail > 0) overflowDetails.push(`${layout.truncatedTail} pending`);
        parts.push(fg('dim', `+${layout.hiddenCompleted + layout.truncatedTail} steps (${overflowDetails.join(', ')})`));
      }
      if (otherNotes.length > 0) {
        const preview = otherNotes
          .slice(0, 2)
          .map(a => `#${a.id.replace(/^anc-/, '')} ${truncateToWidth(a.title, 20)}`)
          .join(' · ');
        const extra = otherNotes.length > 2 ? ` +${otherNotes.length - 2}` : '';
        parts.push(fg('muted', `📌 ${preview}${extra}`));
      }
      lines.push(truncateToWidth(`${fg('dim', '└─ ')}${parts.join(fg('dim', '  │  '))}`, width));
    }

    return lines;
  }

  private renderSingleLineStrip(
    sorted: readonly Anchor[],
    width: number,
    fg: (color: string, text: string) => string
  ): string[] {
    if (sorted.length === 1) {
      const a = sorted[0];
      const num = a.id.replace(/^anc-/, '');
      const bar = a.progress ? `${fg('accent', formatProgressBar(a.progress))} ` : '';
      const candidateStep = a.progress?.steps
        ? (a.progress.steps[a.progress.done] !== a.title
            ? a.progress.steps[a.progress.done]
            : a.progress.steps[a.progress.done + 1])
        : undefined;
      const nextStep = candidateStep ? fg('muted', ` ▸ ${candidateStep}`) : '';
      const liveDurationSec = a.liveStartedAt ? Math.max(1, Math.floor((Date.now() - a.liveStartedAt) / 1000)) : undefined;
      const durStr = liveDurationSec ? ` · ${liveDurationSec}s` : '';
      const activeHint = a.activeForm ? fg('muted', ` (${a.activeForm}${durStr})`) : '';
      const driftAlert = a.driftWarning ? ` ${fg('warning', `⚠️ [Drift: ${a.driftWarning}]`)}` : '';
      const origin = formatOrigin(a);
      const sessionIcon = a.sessionFile ? ' ↪' : '';
      const prefix = `${fg('accent', '⌖')} ${fg('dim', `#${num}`)} ${bar}`;
      const suffix = `${activeHint}${driftAlert} ${fg('muted', `(${origin}${sessionIcon})`)}`;
      const availTitle = Math.max(
        12,
        width - getDisplayWidth(prefix) - getDisplayWidth(nextStep) - getDisplayWidth(suffix) - 2
      );
      const titleClipped = truncateToWidth(a.title, availTitle);
      return [truncateToWidth(`${prefix}${titleClipped}${nextStep}${suffix}`, width)];
    }

    const maxItems = width < 68 ? 1 : (width < 100 ? 2 : 3);
    const visibleSlice = sorted.slice(0, maxItems);
    const countTag = fg('accent', `⌖ ${sorted.length}: `);
    const moreCount = sorted.length - visibleSlice.length;
    const moreSuffix = moreCount > 0 ? fg('dim', ` +${moreCount}`) : '';
    const perSlotWidth = Math.max(
      10,
      Math.floor((width - getDisplayWidth(countTag) - getDisplayWidth(moreSuffix) - (visibleSlice.length - 1) * 5) / visibleSlice.length)
    );

    const segments = visibleSlice.map(a => {
      const num = a.id.replace(/^anc-/, '');
      const bar = a.progress ? `${formatProgressBar(a.progress)} ` : '';
      const prefix = `#${num} ${bar}`;
      const titleBudget = Math.max(6, perSlotWidth - getDisplayWidth(prefix));
      const shortTitle = truncateToWidth(a.title, titleBudget);
      return `${fg('dim', `#${num}`)} ${bar}${shortTitle}`;
    });
    return [truncateToWidth(`${countTag}${segments.join(fg('dim', ' · '))}${moreSuffix}`, width)];
  }
}

export const defaultDockController = new AnchorDockController();

/**
 * Render elegant ASCII Mission Completion Receipt upon anchor settlement
 */
export function renderMissionReceipt(
  anchor: Anchor,
  options?: { fg?: (color: string, text: string) => string }
): string[] {
  const fg = options?.fg || ((_c: string, text: string) => text);
  const now = Date.now();
  const elapsedSec = Math.max(1, Math.floor((now - anchor.createdAt) / 1000));
  const durationStr = elapsedSec < 60 ? `${elapsedSec}s` : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`;
  const num = anchor.id.replace(/^anc-/, '');
  const targetStr = anchor.files.length > 0
    ? anchor.files.slice(0, 3).map(f => f.split(/[\\/]/).pop()).join(', ')
    : anchor.project || 'workspace';
  const progressStr = anchor.progress ? `[■■■■ ${anchor.progress.total}/${anchor.progress.total}] Verified` : '100% Completed';

  return [
    fg('accent', `┌─ ⌖ Mission #${num} Completed: "${anchor.title}" ─────────────────────────┐`),
    fg('muted',  `│  • Duration: ${durationStr} · Progress: ${progressStr}`),
    fg('muted',  `│  • Target Scope: ${targetStr} · Drift: 0 violations`),
    fg('accent', `└─────────────────────────────────────────────────────────────┘`)
  ];
}
