import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  AnchorStore,
  findMatchedAnchors,
  isAnchorTargetingWorkspace,
  makeSafeTaskAnnotation,
  matchesCommitMessage,
  normalizePath,
  renderColdStartAnchorsContext,
  sweepQuietNotes
} from './store.ts';
import {
  formatProgressBar,
  hasActiveUI,
  openAnchorDashboard,
  sortAnchorsForDisplay,
  truncateToWidth,
  updateAnchorStatusBar,
  updateStartupBanner
} from './tui.ts';
import { defaultDockController, renderMissionReceipt } from './dock.ts';
import { inferLiveActivityLabel, replayTodoSnapshotFromBranch } from './bridge.ts';
import {
  extractGitCommitMessages,
  parseAnchorCommandInput,
  parseQuickNoteInput,
  registerAnchorCommands,
  resolveAnchorTarget
} from './commands.ts';

export const MUTATION_TOOLS = new Set(['edit', 'write', 'patch', 'apply_diff', 'create_file', 'modify']);

export {
  extractGitCommitMessages,
  parseAnchorCommandInput,
  parseQuickNoteInput,
  resolveAnchorTarget
};

export function getSessionFileSafe(ctx?: ExtensionContext): string | undefined {
  try {
    const file = (ctx as any)?.sessionManager?.getSessionFile?.();
    return typeof file === 'string' && file.trim() ? file.trim() : undefined;
  } catch {
    return undefined;
  }
}

export default function (pi: ExtensionAPI, customStore?: AnchorStore) {
  const store = customStore || new AnchorStore();
  const annotatedThisSession = new Set<string>();
  const recentSessionFiles: string[] = [];

  function rememberTouchedFile(filePath: string, cwd?: string) {
    const norm = normalizePath(filePath, cwd);
    if (!norm) return;
    const idx = recentSessionFiles.indexOf(norm);
    if (idx !== -1) recentSessionFiles.splice(idx, 1);
    recentSessionFiles.unshift(norm);
    if (recentSessionFiles.length > 5) recentSessionFiles.pop();
  }

  function createStickyNoteFromUser(title: string, ctx: ExtensionContext) {
    const sessionFile = getSessionFileSafe(ctx);
    const anc = store.create({
      title,
      cwd: ctx.cwd,
      sessionFile
    });
    // If the user didn't write a file path in the note, automatically attach the most recently edited file in this session
    if (anc.files.length === 0 && recentSessionFiles.length > 0) {
      store.update(anc.id, { files: [recentSessionFiles[0]] });
    }
    updateAnchorStatusBar(ctx, store);
    return store.get(anc.id) || anc;
  }

  // 1. Session start: quiet old notes (>7d), wake notes belonging to this workspace, replay branch todos, render belowEditor Dock
  pi.on('session_start', async (_event: any, ctx: ExtensionContext) => {
    annotatedThisSession.clear();
    recentSessionFiles.length = 0;
    defaultDockController.resetGraceState();
    sweepQuietNotes(store);

    // Clear stale live activity indicator on cold start
    const activeHere = store.list({ status: 'active', cwd: ctx.cwd });
    for (const a of activeHere) {
      if (a.activeForm) {
        store.update(a.id, { activeForm: undefined });
      }
    }

    // Pre-Flight Auto-Settle: If an anchor declares verifyCommand, execute it on session_start
    for (const a of activeHere) {
      if (a.verifyCommand && a.verifyCommand.trim()) {
        try {
          const runCwd = [ctx.cwd, a.cwd, process.cwd()].find(dir => typeof dir === 'string' && dir.trim() && fs.existsSync(dir)) || process.cwd();
          execSync(a.verifyCommand, {
            cwd: runCwd,
            stdio: 'ignore',
            timeout: 5000
          });
          const settled = store.settle(a.id, { settledBy: 'verify', summary: a.verifyCommand });
          if (hasActiveUI(ctx)) {
            try {
              const fg = (c: string, t: string) => (ctx.ui as any).theme?.fg ? (ctx.ui as any).theme.fg(c, t) : t;
              const receipt = renderMissionReceipt(settled, { fg });
              ctx.ui.notify(receipt.join('\n'), 'info');
            } catch {
              ctx.ui.notify(`⌖ Auto-settled #${a.id.replace(/^anc-/, '')} ("${a.title}") via verifyCommand`, 'info');
            }
          }
        } catch {
          // verifyCommand failed or timed out; leave anchor active
        }
      }
    }

    // Replay current session branch for any existing `todo` tool snapshot
    try {
      const branch = (ctx as any).sessionManager?.getBranch?.();
      const tasks = replayTodoSnapshotFromBranch(branch);
      if (tasks) {
        store.syncFromTodoTool(tasks, {
          cwd: ctx.cwd,
          sessionFile: getSessionFileSafe(ctx)
        });
      }
    } catch {}

    updateAnchorStatusBar(ctx, store);
  });

  // 1b. Fold completed steps from previous turn on `agent_start` (1-turn strikethrough grace period)
  pi.on('agent_start', async (_event: any, ctx: ExtensionContext) => {
    if (defaultDockController.foldCompletedStepsFromPreviousTurn()) {
      updateStartupBanner(ctx, store);
    }
  });

  // 1c. Clear active live pulse indicator when agent finishes turn and goes idle
  pi.on('agent_end', async (_event: any, ctx: ExtensionContext) => {
    const activeHere = sortAnchorsForDisplay(store.list({ status: 'active', cwd: ctx.cwd }), ctx.cwd);
    if (activeHere.length > 0 && activeHere[0].activeForm) {
      store.update(activeHere[0].id, { activeForm: undefined });
      updateStartupBanner(ctx, store);
    }
  });

  // 1c. Keyboard shortcut `alt+a`: toggle belowEditor Dock between Expanded Tree and 1-Line Compact Strip
  if (typeof (pi as any).registerShortcut === 'function') {
    try {
      (pi as any).registerShortcut('alt+a', {
        description: 'Collapse or expand the Anchor belowEditor task dock',
        handler: (ctx: ExtensionContext) => {
          defaultDockController.toggleCollapsed();
          updateStartupBanner(ctx, store);
        }
      });
    } catch {}
  }

  // 2. Human-First 0ms Input Hook: type `pin: <note>` or `便签: <note>` directly in the editor!
  //    Intercepted in 0ms without triggering an LLM turn or burning a single token.
  pi.on('input', async (event: any, ctx: ExtensionContext) => {
    if (event?.source === 'extension') return { action: 'continue' };
    const quickNote = parseQuickNoteInput(String(event?.text || ''));
    if (quickNote === null) return { action: 'continue' };

    if (!quickNote) {
      if (hasActiveUI(ctx)) {
        await openAnchorDashboard(ctx, store);
      }
      return { action: 'handled' };
    }

    const anc = createStickyNoteFromUser(quickNote, ctx);
    const bar = anc.progress ? ` ${formatProgressBar(anc.progress)}` : '';
    if (hasActiveUI(ctx)) {
      ctx.ui.notify(`⌖ Pinned #${anc.id.replace(/^anc-/, '')}${bar}: "${anc.title}"`, 'info');
    }
    return { action: 'handled' };
  });

  // 3. Turn 1 Cold-Start Brief & Vibe-Coding Goal-Drift Guard
  pi.on('before_agent_start', async (event: any, ctx: ExtensionContext) => {
    const entries = (ctx as any).sessionManager?.getEntries() || [];
    const messageTurns = entries.filter((e: any) => e.type === 'message');
    if (messageTurns.length <= 1) {
      const snippet = renderColdStartAnchorsContext(store, ctx.cwd);
      if (snippet) {
        const base = event.systemPrompt ? `${event.systemPrompt}\n\n` : '';
        return { systemPrompt: `${base}${snippet}` };
      }
    } else {
      // Vibe-coding Goal-Drift Guard: tether the model strictly to the active anchor
      const activeHere = sortAnchorsForDisplay(store.list({ status: 'active', cwd: ctx.cwd }), ctx.cwd);
      if (activeHere.length > 0) {
        const p = activeHere[0];
        const bar = p.progress ? ` ${formatProgressBar(p.progress)}` : '';
        const steerPart = p.steerGuidance ? ` [Human Steering Guidance]: "${p.steerGuidance}".` : '';
        const guard = `[Active Anchor Focus]: #${p.id.replace(/^anc-/, '')} "${p.title}"${bar}.${steerPart} Primary goal for this session. Scope code changes strictly to this objective.`;
        const base = event.systemPrompt ? `${event.systemPrompt}\n\n` : '';
        return { systemPrompt: `${base}${guard}` };
      }
    }
  });

  // 3b. Real-time live activity pulse on tool_call (updates dock BEFORE and DURING tool execution)
  pi.on('tool_call', async (event: any, ctx: ExtensionContext) => {
    const lowerTool = String(event.toolName || '').toLowerCase();
    const liveActivity = inferLiveActivityLabel(lowerTool, event.input as any, ctx.cwd);
    const activeHere = sortAnchorsForDisplay(store.list({ status: 'active', cwd: ctx.cwd }), ctx.cwd);
    if (activeHere.length > 0) {
      const p = activeHere[0];
      let driftWarning: string | undefined = undefined;

      // Watchdog: detect if tool touches files outside the declared anchor scope (mutating tools only)
      if (MUTATION_TOOLS.has(lowerTool)) {
        const rawPath = (event.input as any)?.path || (event.input as any)?.filePath || (event.input as any)?.file;
        if (typeof rawPath === 'string' && rawPath.trim() && p.files.length > 0) {
          const touchedNorm = normalizePath(rawPath, ctx.cwd);
          const matches = findMatchedAnchors([p], [touchedNorm, rawPath]);
          if (matches.length === 0) {
            driftWarning = path.basename(touchedNorm);
          }
        }
      }

      const nextActiveForm = liveActivity || p.activeForm;
      const nextDrift = driftWarning !== undefined ? driftWarning : p.driftWarning;
      if (nextActiveForm !== p.activeForm || nextDrift !== p.driftWarning) {
        store.update(p.id, {
          activeForm: nextActiveForm,
          liveStartedAt: Date.now(),
          ...(driftWarning !== undefined ? { driftWarning } : {})
        });
        updateStartupBanner(ctx, store);
      }
    }
  });

  // 4. Clever Touches on Tool Execution:
  //    (a) Auto-Bridge for `todo` tool (`@juicesharp/rpiv-todo` / built-in `todo`):
  //        Mirrors unfinished session todos into a persistent cross-session checkpoint, and auto-clears when 100% done!
  //    (b) Auto-tear off sticky notes on matching `git commit`
  //    (c) Slip a 1-line comment whisper when reading/editing a matching file & bind current sessionFile
  pi.on('tool_result', async (event: any, ctx: ExtensionContext) => {
    if (event.isError) return;

    const lowerTool = String(event.toolName || '').toLowerCase();
    const currentSessionFile = getSessionFileSafe(ctx);

    // (a) Auto-Bridge for intra-session `todo` tool
    if (lowerTool === 'todo') {
      const tasks = event?.details?.tasks;
      if (Array.isArray(tasks)) {
        const syncRes = store.syncFromTodoTool(tasks, {
          cwd: ctx.cwd,
          sessionFile: currentSessionFile,
          recentFiles: recentSessionFiles
        });
        if (syncRes.status !== 'noop') {
          updateAnchorStatusBar(ctx, store);
        }
      }
      return;
    }

    // (b) Real-time auto-tear on `git commit` matching message
    if (lowerTool === 'bash' || lowerTool === 'powershell') {
      const cmd = String((event.input as any)?.command || '');
      if (cmd.includes('git commit')) {
        const commitMsgs = extractGitCommitMessages(cmd);
        if (commitMsgs.length > 0) {
          const candidates = store.list({ cwd: ctx.cwd }).filter(a => a.status === 'active' || a.status === 'sleeping');
          for (const a of candidates) {
            const matchResult = matchesCommitMessage(a, commitMsgs);
            if (matchResult.matched && isAnchorTargetingWorkspace(a, ctx.cwd)) {
              const settled = store.settle(a.id, { settledBy: 'commit', summary: matchResult.message || commitMsgs[0] });
              updateAnchorStatusBar(ctx, store);
              if (hasActiveUI(ctx)) {
                try {
                  const fg = (c: string, t: string) => (ctx.ui as any).theme?.fg ? (ctx.ui as any).theme.fg(c, t) : t;
                  const receipt = renderMissionReceipt(settled, { fg });
                  ctx.ui.notify(receipt.join('\n'), 'info');
                } catch {
                  ctx.ui.notify(`⌖ Auto-torn off #${a.id.replace(/^anc-/, '')} ("${a.title}") on git commit`, 'info');
                }
              }
            }
          }
        }
      }
    }

    // (c) 1-line syntax-safe file whisper, live activity indicator (`activeForm`), & session bookmark update
    const liveActivity = inferLiveActivityLabel(lowerTool, event.input as any, ctx.cwd);
    const pathInput = (event.input as any)?.path;
    if (typeof pathInput !== 'string') {
      if (liveActivity) {
        const activeHere = store.list({ status: 'active', cwd: ctx.cwd });
        if (activeHere.length > 0) {
          store.update(activeHere[0].id, { activeForm: liveActivity });
          updateStartupBanner(ctx, store);
        }
      }
      return;
    }

    const isMutation = MUTATION_TOOLS.has(lowerTool);
    if (isMutation) {
      rememberTouchedFile(pathInput, ctx.cwd);
    }

    const touchedPath = normalizePath(pathInput, ctx.cwd);
    const notes = store.list({ cwd: ctx.cwd }).filter(a => a.status === 'active' || a.status === 'sleeping');
    const matches = findMatchedAnchors(notes, [touchedPath]);
    if (matches.length === 0) return;

    if (isMutation || liveActivity) {
      for (const m of matches) {
        if (isMutation) {
          store.touch(m.anchor.id, Date.now(), currentSessionFile);
        }
        if (liveActivity) {
          store.update(m.anchor.id, { activeForm: liveActivity });
        }
      }
      updateAnchorStatusBar(ctx, store);
    }

    const targetNote = matches[0].anchor;
    if (!annotatedThisSession.has(targetNote.id)) {
      annotatedThisSession.add(targetNote.id);
      const whisper = makeSafeTaskAnnotation(touchedPath, targetNote);
      if (whisper) {
        const contents = [...(event.content || [])];
        for (let i = contents.length - 1; i >= 0; i--) {
          const item = contents[i];
          if (item && item.type === 'text') {
            contents[i] = { ...item, text: item.text + whisper };
            return { content: contents };
          }
        }
      }
    }
  });

  // 5. Register LLM Tool: anchor (optional assistant access; primary authoring is human-driven)
  pi.registerTool({
    name: 'anchor',
    label: 'Anchor (Sticky Note)',
    description:
      'Pin, list, search, history, step, or tear off cross-session sticky notes stored in ~/.anchor/ (zero git repo clutter). Actions: pin (stick a new note), list (view notes), search (find notes), history (view archived notes), step (advance progress bar), settle (tear off completed note).',
    promptSnippet: 'Pin or tear off cross-session sticky notes that survive terminal restarts',
    promptGuidelines: [
      'Use `anchor` when the user explicitly asks to remember something for later/tomorrow or across sessions.',
      'BOUNDARY WITH TODO: `todo` is for multi-step work right now in this session; `anchor` is a sticky note for future sessions.',
      'When a pinned note is completed, call `anchor` with action "settle" to tear it off.'
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('pin'),
        Type.Literal('list'),
        Type.Literal('step'),
        Type.Literal('settle'),
        Type.Literal('touch'),
        Type.Literal('sweep'),
        Type.Literal('search'),
        Type.Literal('history')
      ]),
      title: Type.Optional(Type.String({ description: 'Sticky note text (supports [1/4] or 1. A 2. B progress steps)' })),
      description: Type.Optional(Type.String({ description: 'Optional extra details' })),
      project: Type.Optional(Type.String({ description: 'Optional project name or folder' })),
      files: Type.Optional(Type.Array(Type.String(), { description: 'Optional associated file paths' })),
      id: Type.Optional(Type.String({ description: 'Note ID, e.g. anc-1 or 1 (for step/settle)' })),
      verifyCommand: Type.Optional(Type.String({ description: 'Pre-flight verification command to auto-settle the task' })),
      query: Type.Optional(Type.String({ description: 'Search query for search action' }))
    }),
    renderCall(args: any, theme: any) {
      const action = args.action || 'list';
      let title = theme.fg('toolTitle', theme.bold('⌖ anchor ')) + theme.fg('accent', action);
      if (action === 'pin' && args.title) {
        title += ` "${args.title}"`;
      } else if (action === 'search' && (args.query || args.title)) {
        title += ` "${args.query || args.title}"`;
      } else if ((action === 'settle' || action === 'touch' || action === 'step') && args.id) {
        title += ` ${theme.fg('dim', `#${String(args.id).replace(/^anc-/, '')}`)}`;
      }
      return {
        render: (width: number) => [truncateToWidth(title, width)],
        invalidate: () => {}
      };
    },
    renderResult(result: any, _options: any, theme: any) {
      const text = result.content?.[0]?.text || (result.isError ? 'Failed' : 'OK');
      const color = result.isError ? 'error' : 'success';
      const icon = result.isError ? '✗' : '✔';
      return {
        render: (width: number) => [truncateToWidth(theme.fg(color, `${icon} ${text}`), width)],
        invalidate: () => {}
      };
    },
    async execute(_toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (partial: any) => void, ctx?: ExtensionContext) {
      if (!ctx) return { content: [{ type: 'text', text: 'Error: context required' }], isError: true };

      if (params.action === 'pin') {
        if (!params.title) {
          return { content: [{ type: 'text', text: 'Error: title is required for pin' }], isError: true };
        }
        const anc = store.create({
          title: params.title,
          description: params.description,
          project: params.project,
          cwd: ctx.cwd,
          files: params.files?.length ? params.files : (recentSessionFiles[0] ? [recentSessionFiles[0]] : []),
          sessionFile: getSessionFileSafe(ctx),
          verifyCommand: params.verifyCommand
        });
        updateAnchorStatusBar(ctx, store);
        return {
          content: [{ type: 'text', text: `Pinned note #${anc.id.replace(/^anc-/, '')}: "${anc.title}"` }],
          isError: false
        };
      }

      if (params.action === 'list') {
        const notes = store.list({ cwd: ctx.cwd, all: true }).filter(a => a.status === 'active' || a.status === 'sleeping');
        return {
          content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }],
          isError: false
        };
      }

      if (params.action === 'search') {
        const query = params.query || params.title || '';
        const hits = store.search(query);
        return {
          content: [{ type: 'text', text: JSON.stringify(hits, null, 2) }],
          isError: false
        };
      }

      if (params.action === 'history') {
        const archived = store.listArchive(20);
        return {
          content: [{ type: 'text', text: JSON.stringify(archived, null, 2) }],
          isError: false
        };
      }

      if (params.action === 'step') {
        const rawId = params.id || '1';
        try {
          const targetId = resolveAnchorTarget(store, String(rawId), ctx.cwd) || String(rawId);
          const { anchor: updated } = store.step(targetId, 1);
          updateAnchorStatusBar(ctx, store);
          return {
            content: [{ type: 'text', text: `Advanced #${updated.id.replace(/^anc-/, '')} to ${formatProgressBar(updated.progress)}` }],
            isError: false
          };
        } catch (err: any) {
          return { content: [{ type: 'text', text: err.message }], isError: true };
        }
      }

      if (params.action === 'settle') {
        if (!params.id) {
          return { content: [{ type: 'text', text: 'Error: id is required for settle' }], isError: true };
        }
        try {
          const targetId = resolveAnchorTarget(store, String(params.id), ctx.cwd) || String(params.id);
          const settled = store.settle(targetId, { settledBy: 'manual' });
          updateAnchorStatusBar(ctx, store);
          return {
            content: [{ type: 'text', text: `Torn off note #${settled.id.replace(/^anc-/, '')}: "${settled.title}"` }],
            isError: false
          };
        } catch (err: any) {
          return { content: [{ type: 'text', text: err.message }], isError: true };
        }
      }

      if (params.action === 'touch' && params.id) {
        try {
          const touched = store.touch(String(params.id), Date.now(), getSessionFileSafe(ctx));
          updateAnchorStatusBar(ctx, store);
          return { content: [{ type: 'text', text: `Refreshed note #${touched.id}` }], isError: false };
        } catch (err: any) {
          return { content: [{ type: 'text', text: err.message }], isError: true };
        }
      }

      if (params.action === 'sweep') {
        const res = sweepQuietNotes(store);
        updateAnchorStatusBar(ctx, store);
        return { content: [{ type: 'text', text: `Quieted ${res.quieted.length} old note(s).` }], isError: false };
      }

      return { content: [{ type: 'text', text: 'Unknown action' }], isError: true };
    }
  });

  // 6. Slash Commands: registered via modularized registerAnchorCommands
  registerAnchorCommands(pi, store, createStickyNoteFromUser, getSessionFileSafe);
}
