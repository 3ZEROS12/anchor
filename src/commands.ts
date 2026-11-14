import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { execSync, execFileSync } from 'node:child_process';
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
  mode: 'dashboard' | 'undo' | 'fold' | 'settle' | 'step' | 'jump' | 'pin' | 'now' | 'steer' | 'check' | 'search' | 'history' | 'snap' | 'legacy';
  targetId?: string;
  delta?: number;
  title?: string;
  query?: string;
  snapMessage?: string;
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
  const snapMatch = trimmed.match(/^(?:snap|snapshot|checkpoint)(?:\s+(.+))?$/i);
  if (snapMatch) {
    return {
      mode: 'snap',
      snapMessage: (snapMatch[1] || '').trim()
    };
  }
  const legacyMatch = trimmed.match(/^legacy(?:\s+(on|off|toggle))?$/i);
  if (legacyMatch) {
    return {
      mode: 'legacy',
      title: legacyMatch[1]?.trim()?.toLowerCase() || 'toggle'
    };
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

  // Bare action verbs have no target. Falling through pinned a note literally titled
  // `done` / `steer`; open the dock instead so the note list is one keystroke away.
  if (/^(?:done|close|settle|rm|step|check|mark|steer|jump|resume|session)$/i.test(trimmed)) {
    return { mode: 'dashboard' };
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
export function createGitWipSnapshot(cwd: string, message?: string): {
  success: boolean;
  commitHash?: string;
  isClean?: boolean;
  error?: string;
} {
  try {
    // argv form only: the snapshot message is user text, and a quoted shell string let
    // `$(…)`, backticks and `$VAR` expand (POSIX) or break out entirely (cmd.exe).
    const git = (args: string[], timeout = 3000): string =>
      execFileSync('git', args, {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
        timeout
      }).trim();

    const isGit = git(['rev-parse', '--is-inside-work-tree']) === 'true';

    if (!isGit) {
      return { success: false, error: 'Not inside a git repository' };
    }

    const snapMsg = (message || '').trim() || `anchor-snap-${new Date().toISOString().replace(/[:.]/g, '-')}`;

    const status = git(['status', '--porcelain']);

    if (!status) {
      return { success: true, commitHash: git(['rev-parse', '--short', 'HEAD']), isClean: true };
    }

    // `git stash create` snapshots tracked modifications only and yields an empty hash when
    // nothing tracked changed, so an untracked-only tree used to be reported as "clean".
    if (!git(['status', '--porcelain', '--untracked-files=no'])) {
      return {
        success: false,
        error: 'Only untracked changes present; git stash snapshots tracked modifications only. Stage or commit the new files first.'
      };
    }

    const commitHash = git(['stash', 'create', snapMsg], 5000);

    if (!commitHash) {
      return { success: false, error: 'git stash create returned no commit (nothing tracked to snapshot)' };
    }

    try {
      // `git update-ref <ref> <newvalue> [<oldvalue>]` takes no message positionally: the third
      // argument is the expected old value, so the old call always failed and was swallowed.
      git(['update-ref', '-m', `anchor snap: ${snapMsg}`, 'refs/anchor/snap', commitHash]);
    } catch {
      // update-ref is non-fatal
    }

    return { success: true, commitHash: commitHash.slice(0, 7) };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function tryHandleLegacySlashCommand(
  text: string,
  store: AnchorStore,
  ctx: ExtensionContext
): boolean {
  const trimmed = (text || '').trim();
  if (!trimmed.startsWith('/')) return false;

  const parts = trimmed.slice(1).split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const rest = parts.slice(1).join(' ').trim();

  if (cmd === 'done') {
    if (!rest) {
      openAnchorDashboard(ctx, store);
      return true;
    }
    const resolvedId = resolveAnchorTarget(store, rest, ctx.cwd);
    if (!resolvedId) {
      ctx.ui.notify(`⌖ Note not found: ${rest}`, 'error');
      return true;
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
    return true;
  }

  if (cmd === 'check') {
    const activeHere = sortAnchorsForDisplay(store.list({ status: 'active', cwd: ctx.cwd }), ctx.cwd);
    if (activeHere.length === 0) {
      ctx.ui.notify('⌖ No active anchor to check steps. Type "pin: <goal>" first!', 'warning');
      return true;
    }
    const p = activeHere[0];
    const stepNum = parseInt(rest.replace(/^#/, ''), 10);
    if (isNaN(stepNum)) {
      ctx.ui.notify('Usage: /check <stepNumber> (e.g. /check 2)', 'warning');
      return true;
    }
    try {
      store.updateStep(p.id, stepNum, { status: 'completed' });
      ctx.ui.notify(`⌖ Checked step #${stepNum} on "${p.title}"`, 'info');
      updateStartupBanner(ctx, store);
    } catch (err: any) {
      ctx.ui.notify(`Check step failed: ${err.message}`, 'error');
    }
    return true;
  }

  if (cmd === 'step') {
    const tokens = rest.split(/\s+/).filter(Boolean);
    const target = tokens[0] || '1';
    const delta = tokens[1] ? parseInt(tokens[1], 10) : 1;
    const resolvedId = resolveAnchorTarget(store, target, ctx.cwd);
    if (!resolvedId) {
      ctx.ui.notify(`⌖ Note not found: ${target}`, 'error');
      return true;
    }
    const { anchor: updated } = store.step(resolvedId, isNaN(delta) ? 1 : delta);
    ctx.ui.notify(`⌖ Advanced #${updated.id.replace(/^anc-/, '')} to ${formatProgressBar(updated.progress)}`, 'info');
    updateAnchorStatusBar(ctx, store);
    return true;
  }

  if (cmd === 'steer') {
    if (!rest) {
      ctx.ui.notify('Usage: /steer <guidance for current anchor>', 'warning');
      return true;
    }
    const activeHere = sortAnchorsForDisplay(store.list({ status: 'active', cwd: ctx.cwd }), ctx.cwd);
    if (activeHere.length === 0) {
      ctx.ui.notify('⌖ No active anchor to steer. Type "pin: <goal>" first!', 'warning');
      return true;
    }
    const p = activeHere[0];
    store.update(p.id, { steerGuidance: rest });
    updateStartupBanner(ctx, store);
    ctx.ui.notify(`⌖ Steered Anchor #${p.id.replace(/^anc-/, '')}: "${rest}"`, 'info');
    return true;
  }

  if (cmd === 'now') {
    const activeHere = sortAnchorsForDisplay(store.list({ status: 'active', cwd: ctx.cwd }), ctx.cwd);
    if (activeHere.length === 0) {
      ctx.ui.notify('⌖ No active anchor in this workspace. Type "pin: <goal>" to anchor your vibe-coding task!', 'info');
      return true;
    }
    const p = activeHere[0];
    const bar = p.progress ? ` ${formatProgressBar(p.progress)}` : '';
    const origin = formatOrigin(p);
    const activity = p.activeForm ? ` • Live Pulse: ◐ ${p.activeForm}` : '';
    const files = p.files && p.files.length > 0 ? ` • Files: ${p.files.slice(0, 3).join(', ')}` : '';
    const msg = `⌖ Active Anchor #${p.id.replace(/^anc-/, '')}${bar}: "${p.title}" (${origin})${activity}${files}`;
    ctx.ui.notify(msg, 'info');
    return true;
  }

  if (cmd === 'todo' || cmd === 'anchors') {
    openAnchorDashboard(ctx, store);
    return true;
  }

  return false;
}


export function registerAnchorCommands(
  pi: ExtensionAPI,
  store: AnchorStore,
  createStickyNoteFromUser: (title: string, ctx: ExtensionContext) => any,
  getSessionFileSafe: (ctx?: ExtensionContext) => string | undefined
): void {
  // 6. Slash Commands: /anchor, /pin, /step, /done, /check, /todo, /steer, /now, /anchors, /back
  pi.registerCommand('anchor', {
    description: 'View, pin, step, snap, steer, or tear off tasks (/anchor, /anchor done, /anchor snap, /anchor step, /anchor check)',
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
      if (parsed.mode === 'snap') {
        const res = createGitWipSnapshot(ctx.cwd, parsed.snapMessage);
        if (!res.success) {
          ctx.ui.notify(`Snap failed: ${res.error}`, 'error');
          return;
        }
        if (res.isClean) {
          ctx.ui.notify(`⌖ Working tree clean. Snapshot at HEAD commit [${res.commitHash}]`, 'info');
        } else {
          ctx.ui.notify(
            `⌖ Git WIP snapshot saved: [${res.commitHash}] "${parsed.snapMessage || 'WIP snapshot'}"\nTo diff: git diff refs/anchor/snap\nTo restore: git checkout refs/anchor/snap -- .`,
            'info'
          );
        }
        return;
      }

      if (parsed.mode === 'legacy') {
        const flag = parsed.title;
        const current = process.env.ANCHOR_LEGACY_COMMANDS === '1';
        const menu = current ? 'full (11 commands)' : 'decluttered (/anchor, /pin, /snap, /back)';
        if (flag === 'on' || flag === 'off') {
          // Commands are registered once when the extension loads, so switching mid-session
          // cannot add or remove them; the old code only mutated process.env and reported
          // success, which was unreachable by design.
          ctx.ui.notify(
            `⌖ This session keeps the ${menu} menu. Legacy commands register at load time: run ${flag === 'on' ? 'export ANCHOR_LEGACY_COMMANDS=1' : 'unset ANCHOR_LEGACY_COMMANDS'} before starting the session to change it.`,
            'info'
          );
        } else {
          ctx.ui.notify(`⌖ Menu mode: ${menu}. Set ANCHOR_LEGACY_COMMANDS=1 before starting the session to switch.`, 'info');
        }
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
          ctx.ui.notify('Usage: /anchor steer <guidance for current anchor>', 'warning');
          return;
        }
        const activeHere = sortAnchorsForDisplay(store.list({ status: 'active', cwd: ctx.cwd }), ctx.cwd);
        if (activeHere.length === 0) {
          ctx.ui.notify('⌖ No active anchor to steer. Type "pin: <goal>" first!', 'warning');
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
          ctx.ui.notify('⌖ No active anchor to check steps. Type "pin: <goal>" first!', 'warning');
          return;
        }
        const p = activeHere[0];
        const stepNum = parseInt(parsed.targetId, 10);
        if (isNaN(stepNum)) {
          ctx.ui.notify('Usage: /anchor check <stepNumber> (e.g. /check 2)', 'warning');
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
        if (typeof ctx.switchSession !== 'function') {
          ctx.ui.notify('Session switching is unavailable in this host.', 'warning');
          return;
        }
        try {
          await ctx.switchSession(note.sessionFile);
        } catch (err: any) {
          ctx.ui.notify(`Could not switch session: ${err?.message || err}`, 'error');
        }
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
  pi.registerCommand('snap', {
    description: 'Create lightweight git WIP checkpoint snapshot (/snap [message])',
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const res = createGitWipSnapshot(ctx.cwd, args);
      if (!res.success) {
        ctx.ui.notify(`Snap failed: ${res.error}`, 'error');
        return;
      }
      if (res.isClean) {
        ctx.ui.notify(`⌖ Working tree clean. Snapshot at HEAD commit [${res.commitHash}]`, 'info');
      } else {
        ctx.ui.notify(
          `⌖ Git WIP snapshot saved: [${res.commitHash}] "${(args || '').trim() || 'WIP snapshot'}"\nTo diff: git diff refs/anchor/snap\nTo restore: git checkout refs/anchor/snap -- .`,
          'info'
        );
      }
    }
  });

  if (process.env.ANCHOR_LEGACY_COMMANDS === '1') {

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
        ctx.ui.notify('Usage: /check <stepNumber> (e.g. /check 2)', 'warning');
        return;
      }
      const activeHere = sortAnchorsForDisplay(store.list({ status: 'active', cwd: ctx.cwd }), ctx.cwd);
      if (activeHere.length === 0) {
        ctx.ui.notify('⌖ No active anchor to check steps. Type "pin: <goal>" first!', 'warning');
        return;
      }
      const p = activeHere[0];
      const stepNum = parseInt(target, 10);
      if (isNaN(stepNum)) {
        ctx.ui.notify('Usage: /check <stepNumber> (e.g. /check 2)', 'warning');
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
        ctx.ui.notify('Usage: /steer <guidance for current anchor>', 'warning');
        return;
      }
      const activeHere = sortAnchorsForDisplay(store.list({ status: 'active', cwd: ctx.cwd }), ctx.cwd);
      if (activeHere.length === 0) {
        ctx.ui.notify('⌖ No active anchor to steer. Type "pin: <goal>" first!', 'warning');
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

  }

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
        if (typeof ctx.switchSession !== 'function') {
          ctx.ui.notify('Session switching is unavailable in this host.', 'warning');
          return;
        }
        try {
          await ctx.switchSession(note.sessionFile);
        } catch (err: any) {
          ctx.ui.notify(`Could not switch session: ${err?.message || err}`, 'error');
        }
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

      if (typeof ctx.switchSession !== 'function') {
        ctx.ui.notify('Session switching is unavailable in this host.', 'warning');
        return;
      }
      try {
        await ctx.switchSession(jumpTarget.sessionFile);
      } catch (err: any) {
        ctx.ui.notify(`Could not switch session: ${err?.message || err}`, 'error');
      }
    }
  });
}
