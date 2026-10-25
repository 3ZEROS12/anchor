import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from '@earendil-works/pi-coding-agent';
import fs from 'node:fs';
import { AnchorStore, isSameOrSubPath } from './store.ts';
import {
  formatOrigin,
  formatProgressBar,
  openAnchorDashboard,
  sortAnchorsForDisplay,
  updateAnchorStatusBar,
  updateStartupBanner
} from './tui.ts';
import { defaultDockController, renderMissionReceipt } from './dock.ts';

export function parseAnchorCommandInput(raw: string): {
  mode: 'dashboard' | 'undo' | 'fold' | 'settle' | 'step' | 'jump' | 'pin' | 'now' | 'steer' | 'check' | 'search' | 'history';
  targetId?: string;
  delta?: number;
  title?: string;
  query?: string;
} {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed === 'list' || trimmed === 'ls') {
    return { mode: 'dashboard' };
  }
  if (trimmed === 'now' || trimmed === 'what' || trimmed === 'status' || trimmed === 'hey') {
    return { mode: 'now' };
  }
  if (/^(?:history|archive|archived)$/i.test(trimmed)) {
    return { mode: 'history' };
  }
  const searchMatch = trimmed.match(/^(?:search|find|grep)\s+(.+)$/i);
  if (searchMatch) {
    return {
      mode: 'search',
      query: searchMatch[1].trim()
    };
  }
  if (/^(?:search|find|grep)$/i.test(trimmed)) {
    return {
      mode: 'search',
      query: ''
    };
  }
  const checkMatch = trimmed.match(/^(?:check|mark)\s+(.+)$/i);
  if (checkMatch) {
    return {
      mode: 'check',
      targetId: checkMatch[1].trim().replace(/^#/, '')
    };
  }
  const steerMatch = trimmed.match(/^steer\s+(.+)$/i);
  if (steerMatch) {
    return {
      mode: 'steer',
      title: steerMatch[1].trim()
    };
  }
  if (trimmed === 'undo') {
    return { mode: 'undo' };
  }
  if (trimmed === 'fold' || trimmed === 'compact' || trimmed === 'toggle' || trimmed === 'expand') {
    return { mode: 'fold' };
  }

  const settleMatch = trimmed.match(/^(?:done|rm|close|settle)\s+(.+)$/i);
  if (settleMatch) {
    return {
      mode: 'settle',
      targetId: settleMatch[1].trim().replace(/^#/, '')
    };
  }

  const stepMatch = trimmed.match(/^(?:step|\+)\s*(\S+)(?:\s+([+-]?\d+))?$/i);
  if (stepMatch) {
    return {
      mode: 'step',
      targetId: stepMatch[1].trim().replace(/^#/, ''),
      delta: stepMatch[2] ? parseInt(stepMatch[2], 10) : 1
    };
  }

  const jumpMatch = trimmed.match(/^(?:jump|resume|session)\s+(.+)$/i);
  if (jumpMatch) {
    return {
      mode: 'jump',
      targetId: jumpMatch[1].trim().replace(/^#/, '')
    };
  }

  return {
    mode: 'pin',
    title: trimmed
  };
}

/**
 * Detect 0ms human-first quick note prefix in the input box:
 * e.g. `pin: 明天把Token改Cookie` or `便签: 检查网关重试 [1/4]`
 * Returns `{ matched: true, note: '...' }` (or `note: ''` if user typed bare `pin:`)
 */
export function parseQuickNoteInput(text: string): string | null {
  const m = (text || '').trim().match(/^(?:pin|note|便签|备忘)\s*[:：]\s*(.*)$/i);
  if (!m) return null;
  return m[1].trim();
}

/**
 * Resolve note target by exact ID first (`#2` -> `anc-2`), falling back to 1-based display row index
 * only when no note with that ID exists. Prevents settling the wrong note when sort order differs from ID order!
 */
export function resolveAnchorTarget(store: AnchorStore, idOrIndex: string, cwd?: string): string | undefined {
  const clean = idOrIndex.trim().replace(/^#/, '');
  // 1. Exact ID match first (matches #num shown in TUI and CLI!)
  const direct = store.get(clean);
  if (direct) return direct.id;

  // 2. Fallback to 1-based display row index
  if (/^\d+$/.test(clean)) {
    const seqIndex = parseInt(clean, 10);
    const visible = store
      .list({ cwd, all: true })
      .filter(a => a.status === 'active' || a.status === 'sleeping');
    const sorted = sortAnchorsForDisplay(visible, cwd);
    if (seqIndex >= 1 && seqIndex <= sorted.length) {
      return sorted[seqIndex - 1].id;
    }
  }
  return undefined;
}

/**
 * Extract all commit messages from git commit commands:
 * supports multiple `-m "..."`, `-am "..."`, `--message="..."`, and single quotes `-m '...'`
 */
export function extractGitCommitMessages(cmd: string): string[] {
  if (!cmd || typeof cmd !== 'string') return [];
  const regex = /(?<=^|\s)(?:-m|-am|--message)\s*=?\s*(?:"([^"]*)"|'([^']*)')/gi;
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(cmd)) !== null) {
    const msg = match[1] ?? match[2];
    if (msg !== undefined) {
      results.push(msg);
    }
  }
  return results;
}

export function registerAnchorCommands(
  pi: ExtensionAPI,
  store: AnchorStore,
  createStickyNoteFromUser: (title: string, ctx: ExtensionContext) => any,
  getSessionFileSafe: (ctx?: ExtensionContext) => string | undefined
): void {
  // 6. Slash Commands: /anchor, /pin, /step, /done, /check, /todo, /steer, /now, /anchors, /back
  pi.registerCommand('anchor', {
    description: 'View, pin, step, jump to session, or tear off sticky notes (/anchor, /anchor step 1, /anchor jump 1, /anchor done 1)',
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const parsed = parseAnchorCommandInput(args);

      if (parsed.mode === 'dashboard') {
        await openAnchorDashboard(ctx, store);
        return;
      }

      if (parsed.mode === 'now') {
        const activeHere = sortAnchorsForDisplay(store.list({ status: 'active', cwd: ctx.cwd }), ctx.cwd);
        if (activeHere.length === 0) {
          ctx.ui.notify('⌖ No active anchor in this workspace. Type "pin: <goal>" to anchor your vibe-coding task!', 'info');
          return;
        }
        const p = activeHere[0];
        const bar = p.progress ? ` ${formatProgressBar(p.progress)}` : '';
        const origin = formatOrigin(p);
        const activity = p.activeForm ? ` • Live Pulse: ◐ ${p.activeForm}` : '';
        const files = p.files && p.files.length > 0 ? ` • Files: ${p.files.slice(0, 3).join(', ')}` : '';
        const steer = p.steerGuidance ? ` • Steer: "${p.steerGuidance}"` : '';
        const msg = `⌖ Active Anchor #${p.id.replace(/^anc-/, '')}${bar}: "${p.title}" (${origin})${activity}${files}${steer}`;
        ctx.ui.notify(msg, 'info');
        return;
      }

      if (parsed.mode === 'history') {
        const archived = store.listArchive(10);
        if (archived.length === 0) {
          ctx.ui.notify('⌖ No archived notes yet.', 'info');
          return;
        }
        const lines = archived.map(a => {
          const num = a.id.replace(/^anc-/, '');
          return `#${num} "${a.title}" (${a.project || 'global'} · ${a.evidence?.settledBy || 'settled'})`;
        });
        ctx.ui.notify(lines.join('\n'), 'info');
        return;
      }

      if (parsed.mode === 'search') {
        const hits = store.search(parsed.query || '');
        if (hits.length === 0) {
          ctx.ui.notify(`⌖ No notes matching "${parsed.query}".`, 'info');
          return;
        }
        const lines = hits.map(a => {
          const num = a.id.replace(/^anc-/, '');
          return `[${a.status}] #${num} "${a.title}" (${a.project || 'global'})`;
        });
        ctx.ui.notify(lines.join('\n'), 'info');
        return;
      }

      if (parsed.mode === 'steer') {
        const text = (parsed.title || '').trim();
        if (!text) {
          ctx.ui.notify('Usage: /anchor steer <guidance for current anchor>', 'warn');
          return;
        }
        const activeHere = sortAnchorsForDisplay(store.list({ status: 'active', cwd: ctx.cwd }), ctx.cwd);
        if (activeHere.length === 0) {
          ctx.ui.notify('⌖ No active anchor to steer. Type "pin: <goal>" first!', 'warn');
          return;
        }
        const p = activeHere[0];
        store.update(p.id, { steerGuidance: text });
        updateStartupBanner(ctx, store);
        ctx.ui.notify(`⌖ Steered Anchor #${p.id.replace(/^anc-/, '')}: "${text}"`, 'info');
        return;
      }

      if (parsed.mode === 'undo') {
        try {
          const restored = store.undoSettle();
          ctx.ui.notify(`⌖ Put back #${restored.id.replace(/^anc-/, '')}: "${restored.title}"`, 'info');
          updateAnchorStatusBar(ctx, store);
        } catch (err: any) {
          ctx.ui.notify(`Undo failed: ${err.message}`, 'error');
        }
        return;
      }

      if (parsed.mode === 'fold') {
        const collapsed = defaultDockController.toggleCollapsed();
        updateStartupBanner(ctx, store);
        ctx.ui.notify(`⌖ Anchor Dock ${collapsed ? 'folded to 1-line strip' : 'expanded to tree view'} (Alt+A)`, 'info');
        return;
      }

      if (parsed.mode === 'check' && parsed.targetId) {
        const activeHere = sortAnchorsForDisplay(store.list({ status: 'active', cwd: ctx.cwd }), ctx.cwd);
        if (activeHere.length === 0) {
          ctx.ui.notify('⌖ No active anchor to check steps. Type "pin: <goal>" first!', 'warn');
          return;
        }
        const p = activeHere[0];
        const stepNum = parseInt(parsed.targetId, 10);
        if (isNaN(stepNum)) {
          ctx.ui.notify('Usage: /anchor check <stepNumber> (e.g. /check 2)', 'warn');
          return;
        }
        try {
          store.updateStep(p.id, stepNum, { status: 'completed' });
          ctx.ui.notify(`⌖ Checked step #${stepNum} on "${p.title}"`, 'info');
          updateStartupBanner(ctx, store);
        } catch (err: any) {
          ctx.ui.notify(`Check step failed: ${err.message}`, 'error');
        }
        return;
      }

      if (parsed.mode === 'step' && parsed.targetId) {
        const resolvedId = resolveAnchorTarget(store, parsed.targetId, ctx.cwd);
        if (!resolvedId) {
          ctx.ui.notify(`⌖ Note not found: ${parsed.targetId}`, 'error');
          return;
        }
        const { anchor: updated } = store.step(resolvedId, parsed.delta || 1);
        ctx.ui.notify(`⌖ Advanced #${updated.id.replace(/^anc-/, '')} to ${formatProgressBar(updated.progress)}`, 'info');
        updateAnchorStatusBar(ctx, store);
        return;
      }

      if (parsed.mode === 'jump' && parsed.targetId) {
        const resolvedId = resolveAnchorTarget(store, parsed.targetId, ctx.cwd);
        const note = resolvedId ? store.get(resolvedId) : undefined;
        if (!note || !note.sessionFile || !fs.existsSync(note.sessionFile)) {
          ctx.ui.notify(`⌖ No saved conversation session found for #${parsed.targetId}`, 'error');
          return;
        }
        await ctx.switchSession(note.sessionFile);
        return;
      }

      if (parsed.mode === 'settle' && parsed.targetId) {
        const resolvedId = resolveAnchorTarget(store, parsed.targetId, ctx.cwd);
        if (!resolvedId) {
          ctx.ui.notify(`⌖ Note not found: ${parsed.targetId}`, 'error');
          return;
        }
        const settled = store.settle(resolvedId, { settledBy: 'manual' });
        try {
          const fg = (c: string, t: string) => (ctx.ui as any).theme?.fg ? (ctx.ui as any).theme.fg(c, t) : t;
          const receipt = renderMissionReceipt(settled, { fg });
          ctx.ui.notify(receipt.join('\n'), 'info');
        } catch {
          ctx.ui.notify(`⌖ Torn off #${settled.id.replace(/^anc-/, '')}: "${settled.title}" (/anchor undo to put back)`, 'info');
        }
        updateAnchorStatusBar(ctx, store);
        return;
      }

      const rawTrimmed = (args || '').trim();
      if (/^(?:#?anc-\d+|#?\d+)$/i.test(rawTrimmed)) {
        const resolvedId = resolveAnchorTarget(store, rawTrimmed, ctx.cwd);
        if (resolvedId) {
          const settled = store.settle(resolvedId, { settledBy: 'manual' });
          try {
            const fg = (c: string, t: string) => (ctx.ui as any).theme?.fg ? (ctx.ui as any).theme.fg(c, t) : t;
            const receipt = renderMissionReceipt(settled, { fg });
            ctx.ui.notify(receipt.join('\n'), 'info');
          } catch {
            ctx.ui.notify(`⌖ Torn off #${settled.id.replace(/^anc-/, '')}: "${settled.title}" (/anchor undo to put back)`, 'info');
          }
          updateAnchorStatusBar(ctx, store);
          return;
        }
      }

      const anc = createStickyNoteFromUser(parsed.title || rawTrimmed, ctx);
      const bar = anc.progress ? ` ${formatProgressBar(anc.progress)}` : '';
      ctx.ui.notify(`⌖ Pinned #${anc.id.replace(/^anc-/, '')}${bar}: "${anc.title}"`, 'info');
    }
  });

  pi.registerCommand('pin', {
    description: 'Stick a quick note across sessions (e.g. /pin Migrate auth [1/3])',
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const text = (args || '').trim();
      if (!text) {
        await openAnchorDashboard(ctx, store);
        return;
      }
      const anc = createStickyNoteFromUser(text, ctx);
      const bar = anc.progress ? ` ${formatProgressBar(anc.progress)}` : '';
      ctx.ui.notify(`⌖ Pinned #${anc.id.replace(/^anc-/, '')}${bar}: "${anc.title}"`, 'info');
    }
  });

  pi.registerCommand('step', {
    description: 'Advance progress bar on a sticky note (e.g. /step 1)',
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const tokens = (args || '').trim().split(/\s+/).filter(Boolean);
      const target = tokens[0] || '1';
      const delta = tokens[1] ? parseInt(tokens[1], 10) : 1;
      const resolvedId = resolveAnchorTarget(store, target, ctx.cwd);
      if (!resolvedId) {
        ctx.ui.notify(`⌖ Note not found: ${target}`, 'error');
        return;
      }
      const { anchor: updated } = store.step(resolvedId, isNaN(delta) ? 1 : delta);
      ctx.ui.notify(`⌖ Advanced #${updated.id.replace(/^anc-/, '')} to ${formatProgressBar(updated.progress)}`, 'info');
      updateAnchorStatusBar(ctx, store);
    }
  });

  pi.registerCommand('done', {
    description: 'Tear off a sticky note by number or ID (e.g. /done 1)',
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const target = (args || '').trim();
      if (!target) {
        await openAnchorDashboard(ctx, store);
        return;
      }
      const resolvedId = resolveAnchorTarget(store, target, ctx.cwd);
      if (!resolvedId) {
        ctx.ui.notify(`⌖ Note not found: ${target}`, 'error');
        return;
      }
      const settled = store.settle(resolvedId, { settledBy: 'manual' });
      try {
        const fg = (c: string, t: string) => (ctx.ui as any).theme?.fg ? (ctx.ui as any).theme.fg(c, t) : t;
        const receipt = renderMissionReceipt(settled, { fg });
        ctx.ui.notify(receipt.join('\n'), 'info');
      } catch {
        ctx.ui.notify(`⌖ Torn off #${settled.id.replace(/^anc-/, '')}: "${settled.title}" (/anchor undo to put back)`, 'info');
      }
      updateAnchorStatusBar(ctx, store);
    }
  });

  pi.registerCommand('check', {
    description: 'Mark a step completed on the active anchor/todo dock (e.g. /check 2)',
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const target = (args || '').trim().replace(/^#/, '');
      if (!target) {
        ctx.ui.notify('Usage: /check <stepNumber> (e.g. /check 2)', 'warn');
        return;
      }
      const activeHere = sortAnchorsForDisplay(store.list({ status: 'active', cwd: ctx.cwd }), ctx.cwd);
      if (activeHere.length === 0) {
        ctx.ui.notify('⌖ No active anchor to check steps. Type "pin: <goal>" first!', 'warn');
        return;
      }
      const p = activeHere[0];
      const stepNum = parseInt(target, 10);
      if (isNaN(stepNum)) {
        ctx.ui.notify('Usage: /check <stepNumber> (e.g. /check 2)', 'warn');
        return;
      }
      try {
        store.updateStep(p.id, stepNum, { status: 'completed' });
        ctx.ui.notify(`⌖ Checked step #${stepNum} on "${p.title}"`, 'info');
        updateStartupBanner(ctx, store);
      } catch (err: any) {
        ctx.ui.notify(`Check step failed: ${err.message}`, 'error');
      }
    }
  });

  pi.registerCommand('todo', {
    description: 'View or manage unified active tasks on the Anchor dock (/todo)',
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      await openAnchorDashboard(ctx, store);
    }
  });

  pi.registerCommand('steer', {
    description: 'Steer active vibe-coding anchor with real-time guidance (/steer <instruction>)',
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const text = (args || '').trim();
      if (!text) {
        ctx.ui.notify('Usage: /steer <guidance for current anchor>', 'warn');
        return;
      }
      const activeHere = sortAnchorsForDisplay(store.list({ status: 'active', cwd: ctx.cwd }), ctx.cwd);
      if (activeHere.length === 0) {
        ctx.ui.notify('⌖ No active anchor to steer. Type "pin: <goal>" first!', 'warn');
        return;
      }
      const p = activeHere[0];
      store.update(p.id, { steerGuidance: text });
      updateStartupBanner(ctx, store);
      ctx.ui.notify(`⌖ Steered Anchor #${p.id.replace(/^anc-/, '')}: "${text}"`, 'info');
    }
  });

  pi.registerCommand('now', {
    description: 'Inspect active vibe-coding anchor and live activity pulse (/now)',
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const activeHere = sortAnchorsForDisplay(store.list({ status: 'active', cwd: ctx.cwd }), ctx.cwd);
      if (activeHere.length === 0) {
        ctx.ui.notify('⌖ No active anchor in this workspace. Type "pin: <goal>" to anchor your vibe-coding task!', 'info');
        return;
      }
      const p = activeHere[0];
      const bar = p.progress ? ` ${formatProgressBar(p.progress)}` : '';
      const origin = formatOrigin(p);
      const activity = p.activeForm ? ` • Live Pulse: ◐ ${p.activeForm}` : '';
      const files = p.files && p.files.length > 0 ? ` • Files: ${p.files.slice(0, 3).join(', ')}` : '';
      const msg = `⌖ Active Anchor #${p.id.replace(/^anc-/, '')}${bar}: "${p.title}" (${origin})${activity}${files}`;
      ctx.ui.notify(msg, 'info');
    }
  });

  pi.registerCommand('anchors', {
    description: 'View sticky notes',
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      await openAnchorDashboard(ctx, store);
    }
  });

  // 1-click Session Time-Machine: `/back` (or `/back 1`) jumps straight to the saved session of an unfinished note/todo checkpoint
  pi.registerCommand('back', {
    description: 'Jump back to the conversation session of the latest unfinished note or todo checkpoint (/back [id])',
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const targetArg = (args || '').trim();
      const currentSession = getSessionFileSafe(ctx);

      if (targetArg) {
        const resolvedId = resolveAnchorTarget(store, targetArg, ctx.cwd);
        const note = resolvedId ? store.get(resolvedId) : undefined;
        if (!note || !note.sessionFile || !fs.existsSync(note.sessionFile)) {
          ctx.ui.notify(`⌖ No saved session found for #${targetArg}`, 'error');
          return;
        }
        await ctx.switchSession(note.sessionFile);
        return;
      }

      const candidates = sortAnchorsForDisplay(
        store.list({ cwd: ctx.cwd, all: true }).filter(a => a.status === 'active' || a.status === 'sleeping'),
        ctx.cwd
      );
      const jumpTarget = candidates.find(a =>
        a.sessionFile &&
        fs.existsSync(a.sessionFile) &&
        (!currentSession || !isSameOrSubPath(a.sessionFile, currentSession))
      );

      if (!jumpTarget || !jumpTarget.sessionFile) {
        ctx.ui.notify('⌖ No other linked conversation session found to jump back to.', 'info');
        return;
      }

      await ctx.switchSession(jumpTarget.sessionFile);
    }
  });
}
