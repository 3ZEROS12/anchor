import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Type } from '@sinclair/typebox';
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
  hasActiveUI,
  openAnchorDashboard,
  sortAnchorsForDisplay,
  truncateToWidth,
  updateAnchorStatusBar,
  updateStartupBanner
} from './tui.ts';

const MUTATION_TOOLS = new Set(['edit', 'write', 'patch', 'apply_diff', 'create_file', 'modify']);

export function parseAnchorCommandInput(raw: string): {
  mode: 'dashboard' | 'undo' | 'settle' | 'pin';
  targetId?: string;
  title?: string;
} {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed === 'list' || trimmed === 'ls') {
    return { mode: 'dashboard' };
  }
  if (trimmed === 'undo') {
    return { mode: 'undo' };
  }

  const settleMatch = trimmed.match(/^(?:done|rm|close|settle)\s+(.+)$/i);
  if (settleMatch) {
    return {
      mode: 'settle',
      targetId: settleMatch[1].trim().replace(/^#/, '')
    };
  }

  return {
    mode: 'pin',
    title: trimmed
  };
}

export function resolveAnchorTarget(store: AnchorStore, idOrIndex: string, cwd?: string): string | undefined {
  const clean = idOrIndex.trim().replace(/^#/, '');
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
  return store.get(clean)?.id;
}

export default function (pi: ExtensionAPI) {
  const store = new AnchorStore();
  const annotatedThisSession = new Set<string>();

  // 1. Session start: quiet old notes (>7d), wake notes belonging to this workspace, show sticky note banner
  pi.on('session_start', async (event: any, ctx: ExtensionContext) => {
    annotatedThisSession.clear();
    sweepQuietNotes(store);

    // Clever Touch: If a quiet note belongs to the workspace we just opened, wake it up automatically
    const quietForHere = store
      .list({ status: 'sleeping', all: true })
      .filter(a => (a.files.length > 0 || (a.project && a.project !== 'global') || a.cwd) && isAnchorTargetingWorkspace(a, ctx.cwd));
    for (const q of quietForHere) {
      store.touch(q.id);
    }

    updateAnchorStatusBar(ctx, store);

    if (event.reason !== 'resume') {
      updateStartupBanner(ctx, store);
    } else if (hasActiveUI(ctx)) {
      try {
        ctx.ui.setWidget('anchor-startup', undefined);
      } catch {}
    }
  });

  // 2. Clear sticky note banner as soon as the user sends the first prompt
  pi.on('agent_start', async (_event: any, ctx: ExtensionContext) => {
    if (hasActiveUI(ctx)) {
      try {
        ctx.ui.setWidget('anchor-startup', undefined);
      } catch {}
    }
  });

  // 3. Turn 1 Cold-Start Brief (0 tokens on Turn 2+)
  pi.on('before_agent_start', async (event: any, ctx: ExtensionContext) => {
    const entries = (ctx as any).sessionManager?.getEntries() || [];
    const messageTurns = entries.filter((e: any) => e.type === 'message');
    if (messageTurns.length <= 1) {
      const snippet = renderColdStartAnchorsContext(store, ctx.cwd);
      if (snippet) {
        return { systemPrompt: `${event.systemPrompt}\n\n${snippet}` };
      }
    }
  });

  // 4. Clever Touches on Tool Execution:
  //    (a) Auto-tear off sticky notes on matching `git commit`
  //    (b) Slip a 1-line comment whisper when the AI reads/edits a matching file
  pi.on('tool_result', async (event: any, ctx: ExtensionContext) => {
    if (event.isError) return;

    const lowerTool = String(event.toolName || '').toLowerCase();

    // (a) Real-time auto-tear on `git commit -m "..."`
    if (lowerTool === 'bash' || lowerTool === 'powershell') {
      const cmd = String((event.input as any)?.command || '');
      if (cmd.includes('git commit')) {
        const msgMatch = cmd.match(/-m\s+["']([^"']+)["']/);
        if (msgMatch && msgMatch[1]) {
          const commitMsg = msgMatch[1];
          const candidates = store.list({ cwd: ctx.cwd }).filter(a => a.status === 'active' || a.status === 'sleeping');
          for (const a of candidates) {
            if (matchesCommitMessage(a, [commitMsg]).matched && isAnchorTargetingWorkspace(a, ctx.cwd)) {
              store.settle(a.id, { settledBy: 'commit', summary: commitMsg });
              updateAnchorStatusBar(ctx, store);
              if (hasActiveUI(ctx)) {
                try {
                  ctx.ui.notify(`⌖ Auto-torn off #${a.id.replace(/^anc-/, '')} ("${a.title}") on git commit`, 'info');
                } catch {}
              }
            }
          }
        }
      }
    }

    // (b) 1-line syntax-safe file whisper
    const pathInput = (event.input as any)?.path;
    if (typeof pathInput !== 'string') return;

    const touchedPath = normalizePath(pathInput, ctx.cwd);
    const notes = store.list({ cwd: ctx.cwd }).filter(a => a.status === 'active' || a.status === 'sleeping');
    const matches = findMatchedAnchors(notes, [touchedPath]);
    if (matches.length === 0) return;

    if (MUTATION_TOOLS.has(lowerTool)) {
      for (const m of matches) store.touch(m.anchor.id);
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

  // 5. Register LLM Tool: anchor
  pi.registerTool({
    name: 'anchor',
    label: 'Anchor (Sticky Note)',
    description:
      'Pin, list, or tear off cross-session sticky notes stored in ~/.anchor/ (zero git repo clutter). Actions: pin (stick a new note), list (view notes), settle (tear off completed note).',
    promptSnippet: 'Pin or tear off cross-session sticky notes that survive terminal restarts',
    promptGuidelines: [
      'Use `anchor` when the user asks to remember something for later/tomorrow or across sessions (e.g. "记一下明天重构鉴权", "晚上清理缓存").',
      'BOUNDARY WITH TODO: `todo` is for multi-step work right now in this session; `anchor` is a sticky note for future sessions.',
      'When a pinned note is completed, call `anchor` with action "settle" to tear it off.'
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('pin'),
        Type.Literal('list'),
        Type.Literal('settle'),
        Type.Literal('touch'),
        Type.Literal('sweep')
      ]),
      title: Type.Optional(Type.String({ description: 'Sticky note text (for pin)' })),
      description: Type.Optional(Type.String({ description: 'Optional extra details' })),
      project: Type.Optional(Type.String({ description: 'Optional project name or folder' })),
      files: Type.Optional(Type.Array(Type.String(), { description: 'Optional associated file paths' })),
      id: Type.Optional(Type.String({ description: 'Note ID, e.g. anc-1 or 1 (for settle)' }))
    }),
    renderCall(args: any, theme: any) {
      const action = args.action || 'list';
      let title = theme.fg('toolTitle', theme.bold('⌖ anchor ')) + theme.fg('accent', action);
      if (action === 'pin' && args.title) {
        title += ` "${args.title}"`;
      } else if ((action === 'settle' || action === 'touch') && args.id) {
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
          files: params.files || []
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
          const touched = store.touch(String(params.id));
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

  // 6. Slash Commands: /anchor, /pin, /done
  pi.registerCommand('anchor', {
    description: 'View, pin, or tear off sticky notes (/anchor, /anchor done 1, /anchor undo)',
    handler: async (args: string, ctx: ExtensionContext) => {
      const parsed = parseAnchorCommandInput(args);

      if (parsed.mode === 'dashboard') {
        await openAnchorDashboard(ctx, store);
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

      if (parsed.mode === 'settle' && parsed.targetId) {
        const resolvedId = resolveAnchorTarget(store, parsed.targetId, ctx.cwd);
        if (!resolvedId) {
          ctx.ui.notify(`⌖ Note not found: ${parsed.targetId}`, 'error');
          return;
        }
        const settled = store.settle(resolvedId, { settledBy: 'manual' });
        ctx.ui.notify(`⌖ Torn off #${settled.id.replace(/^anc-/, '')}: "${settled.title}" (/anchor undo to put back)`, 'info');
        updateAnchorStatusBar(ctx, store);
        return;
      }

      const rawTrimmed = (args || '').trim();
      if (/^(?:#?anc-\d+|#\d+)$/i.test(rawTrimmed)) {
        const resolvedId = resolveAnchorTarget(store, rawTrimmed, ctx.cwd);
        if (resolvedId) {
          const settled = store.settle(resolvedId, { settledBy: 'manual' });
          ctx.ui.notify(`⌖ Torn off #${settled.id.replace(/^anc-/, '')}: "${settled.title}" (/anchor undo to put back)`, 'info');
          updateAnchorStatusBar(ctx, store);
          return;
        }
      }

      const anc = store.create({ title: parsed.title || rawTrimmed, cwd: ctx.cwd });
      ctx.ui.notify(`⌖ Pinned #${anc.id.replace(/^anc-/, '')}: "${anc.title}"`, 'info');
      updateAnchorStatusBar(ctx, store);
    }
  });

  pi.registerCommand('pin', {
    description: 'Stick a quick note across sessions (e.g. /pin Check auth token expiry)',
    handler: async (args: string, ctx: ExtensionContext) => {
      const text = (args || '').trim();
      if (!text) {
        await openAnchorDashboard(ctx, store);
        return;
      }
      const anc = store.create({ title: text, cwd: ctx.cwd });
      ctx.ui.notify(`⌖ Pinned #${anc.id.replace(/^anc-/, '')}: "${anc.title}"`, 'info');
      updateAnchorStatusBar(ctx, store);
    }
  });

  pi.registerCommand('done', {
    description: 'Tear off a sticky note by number or ID (e.g. /done 1)',
    handler: async (args: string, ctx: ExtensionContext) => {
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
      ctx.ui.notify(`⌖ Torn off #${settled.id.replace(/^anc-/, '')}: "${settled.title}" (/anchor undo to put back)`, 'info');
      updateAnchorStatusBar(ctx, store);
    }
  });

  pi.registerCommand('anchors', {
    description: 'View sticky notes',
    handler: async (_args: string, ctx: ExtensionContext) => {
      await openAnchorDashboard(ctx, store);
    }
  });
}
