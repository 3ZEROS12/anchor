import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import fs from 'node:fs';
import path from 'node:path';
import {
  AnchorStore,
  findMatchedAnchors,
  isAnchorTargetingWorkspace,
  isSameOrSubPath,
  makeSafeTaskAnnotation,
  matchesCommitMessage,
  normalizePath,
  renderColdStartAnchorsContext,
  sweepQuietNotes
} from './store.ts';
import {
  formatOrigin,
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

const MUTATION_TOOLS = new Set(['edit', 'write', 'patch', 'apply_diff', 'create_file', 'modify']);

export function parseAnchorCommandInput(raw: string): {
  mode: 'dashboard' | 'undo' | 'fold' | 'settle' | 'step' | 'jump' | 'pin' | 'now' | 'steer' | 'check';
  targetId?: string;
  delta?: number;
  title?: string;
} {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed === 'list' || trimmed === 'ls') {
    return { mode: 'dashboard' };
  }
  if (trimmed === 'now' || trimmed === 'what' || trimmed === 'status' || trimmed === 'hey') {
    return { mode: 'now' };
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

function getSessionFileSafe(ctx?: ExtensionContext): string | undefined {
  try {
    const file = (ctx as any)?.sessionManager?.getSessionFile?.();
    return typeof file === 'string' && file.trim() ? file.trim() : undefined;
  } catch {
    return undefined;
  }
}

export default function (pi: ExtensionAPI) {
  const store = new AnchorStore();
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

      // Watchdog: detect if tool touches files outside the declared anchor scope
      const rawPath = (event.input as any)?.path || (event.input as any)?.filePath || (event.input as any)?.file;
      if (typeof rawPath === 'string' && rawPath.trim() && p.files.length > 0) {
        const touchedNorm = normalizePath(rawPath, ctx.cwd);
        const matches = findMatchedAnchors([p], [touchedNorm]);
        if (matches.length === 0 && !isSameOrSubPath(touchedNorm, p.cwd)) {
          driftWarning = path.basename(touchedNorm);
        }
      }

      store.update(p.id, {
        activeForm: liveActivity || p.activeForm,
        liveStartedAt: Date.now(),
        ...(driftWarning !== undefined ? { driftWarning } : {})
      });
      updateStartupBanner(ctx, store);
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

    // (b) Real-time auto-tear on `git commit -m "..."` or `git commit -am "..."` (handles apostrophes inside double quotes)
    if (lowerTool === 'bash' || lowerTool === 'powershell') {
      const cmd = String((event.input as any)?.command || '');
      if (cmd.includes('git commit')) {
        const msgMatch = cmd.match(/(?:-m|-am)\s+(?:"([^"]+)"|'([^']+)')/i);
        const commitMsg = msgMatch ? (msgMatch[1] ?? msgMatch[2]) : undefined;
        if (commitMsg) {
          const candidates = store.list({ cwd: ctx.cwd }).filter(a => a.status === 'active' || a.status === 'sleeping');
          for (const a of candidates) {
            if (matchesCommitMessage(a, [commitMsg]).matched && isAnchorTargetingWorkspace(a, ctx.cwd)) {
              const settled = store.settle(a.id, { settledBy: 'commit', summary: commitMsg });
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
      'Pin, list, step, or tear off cross-session sticky notes stored in ~/.anchor/ (zero git repo clutter). Actions: pin (stick a new note), list (view notes), step (advance progress bar), settle (tear off completed note).',
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
        Type.Literal('sweep')
      ]),
      title: Type.Optional(Type.String({ description: 'Sticky note text (supports [1/4] or 1. A 2. B progress steps)' })),
      description: Type.Optional(Type.String({ description: 'Optional extra details' })),
      project: Type.Optional(Type.String({ description: 'Optional project name or folder' })),
      files: Type.Optional(Type.Array(Type.String(), { description: 'Optional associated file paths' })),
      id: Type.Optional(Type.String({ description: 'Note ID, e.g. anc-1 or 1 (for step/settle)' }))
    }),
    renderCall(args: any, theme: any) {
      const action = args.action || 'list';
      let title = theme.fg('toolTitle', theme.bold('⌖ anchor ')) + theme.fg('accent', action);
      if (action === 'pin' && args.title) {
        title += ` "${args.title}"`;
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
          sessionFile: getSessionFileSafe(ctx)
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

  // 6. Slash Commands: /anchor, /pin, /step, /done
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
