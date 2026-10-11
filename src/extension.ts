import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { AnchorStore, detectTargetDate } from './store.ts';
import { SessionTouchObserver } from './observer.ts';
import { renderColdStartAnchorsContext, renderActiveAnchorsContext, makeSafeTaskAnnotation } from './context_injector.ts';
import { generateSettlementProposals, runPhysicalVerification, tryRealtimeAutoSettle } from './settlement.ts';
import { normalizePath, isSameOrSubPath, findMatchedAnchors, isAnchorTargetingWorkspace } from './matcher.ts';
import { sweepStore } from './decay.ts';
import { updateAnchorStatusBar, openAnchorDashboard, updateStartupBanner, truncateToWidth, hasActiveUI, sortAnchorsForDisplay } from './tui.ts';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MUTATION_TOOLS = new Set(['edit', 'write', 'patch', 'apply_diff', 'create_file', 'modify']);

/**
 * Parse inline `--due <date>` / `-d <date>` flags and `done`/`rm`/`close`/`settle` subcommands
 * for `/anchor` and `/pin` slash commands.
 */
export function parseAnchorCommandInput(raw: string, now: number = Date.now()): {
  mode: 'dashboard' | 'undo' | 'settle' | 'pin';
  targetId?: string;
  title?: string;
  targetDate?: string;
} {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed === 'list' || trimmed === 'ls') {
    return { mode: 'dashboard' };
  }
  if (trimmed === 'undo') {
    return { mode: 'undo' };
  }

  // Match explicit settle subcommands: `/anchor done 1`, `/anchor rm anc-2`, `/anchor settle #1`
  const settleMatch = trimmed.match(/^(?:done|rm|close|settle)\s+(.+)$/i);
  if (settleMatch) {
    return {
      mode: 'settle',
      targetId: settleMatch[1].trim().replace(/^#/, '')
    };
  }

  // Extract optional `--due <val>` or `-d <val>` flag
  let targetDate: string | undefined;
  const tokens = trimmed.split(/\s+/);
  const dueIdx = tokens.findIndex(t => t === '--due' || t === '-d');
  if (dueIdx !== -1 && tokens[dueIdx + 1]) {
    const rawDue = tokens[dueIdx + 1];
    targetDate = detectTargetDate(rawDue, now) || rawDue;
    tokens.splice(dueIdx, 2);
  }
  const cleanTitle = tokens.join(' ').trim();

  return {
    mode: 'pin',
    title: cleanTitle || trimmed,
    targetDate
  };
}

/**
 * Resolve either an explicit anchor ID ('anc-2', '2') or a 1-based visual dashboard index ('01', '1')
 */
export function resolveAnchorTarget(store: AnchorStore, idOrIndex: string, cwd?: string): string | undefined {
  const clean = idOrIndex.trim().replace(/^#/, '');
  // 1. Check 1-based sequential index from the sorted display list first when user passes a plain number
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
  // 2. Fallback to direct ID lookup in store
  const direct = store.get(clean);
  return direct?.id;
}

export default function (pi: ExtensionAPI) {
  // Global authoritative store in ~/.anchor/ (0 workspace clutter)
  const store = new AnchorStore();
  const observer = new SessionTouchObserver();
  const annotatedThisSession = new Set<string>();
  const preflightFailures = new Map<string, string>();

  // 1. Session start: sweep stale tasks, run physical pre-flight tests, update TUI status bar
  pi.on('session_start', async (event: any, ctx: ExtensionContext) => {
    observer.clear();
    annotatedThisSession.clear();
    preflightFailures.clear();

    const sweep = sweepStore(store);

    // Smart Workspace Wakeup: if a sleeping anchor specifically targets the workspace we just opened, wake it automatically!
    const sleepingForWorkspace = store
      .list({ status: 'sleeping', all: true })
      .filter(a => (a.files.length > 0 || (a.project && a.project !== 'global') || a.cwd) && isAnchorTargetingWorkspace(a, ctx.cwd));
    for (const sa of sleepingForWorkspace) {
      store.touch(sa.id);
    }

    if (sweep.transitionedToSleeping.length > 0 && sleepingForWorkspace.length === 0) {
      ctx.ui.notify(`⌖ Anchor: ${sweep.transitionedToSleeping.length} inactive task(s) moved to quiet mode (/anchor to view)`, 'info');
    }

    // Physical Pre-flight Verification: auto-settle passing tasks or record failing output (scoped strictly to current cwd)
    const activeAnchors = store.list({ cwd: ctx.cwd }).filter(a => a.status === 'active');
    for (const a of activeAnchors) {
      if (a.verifyCommand && (!a.cwd || isSameOrSubPath(a.cwd, ctx.cwd))) {
        try {
          const res = runPhysicalVerification(a, ctx.cwd);
          if (res.success) {
            store.settle(a.id, {
              settledBy: 'verification-test',
              summary: `Physical pre-flight test passed: ${a.verifyCommand}`
            });
            ctx.ui.notify(`⌖ Verification passed! Auto-settled #${a.id}: "${a.title}"`, 'info');
          } else {
            preflightFailures.set(a.id, res.output.slice(-250));
          }
        } catch (_) {}
      }
    }

    // Exit Guard notification check
    try {
      const home = process.env.HOME || process.env.USERPROFILE || '';
      const pendingPath = path.join(home, '.anchor', 'pending_exit.json');
      if (fs.existsSync(pendingPath)) {
        const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));
        const isExpired = Date.now() - pending.timestamp >= 24 * 60 * 60 * 1000;
        if (!isExpired && isSameOrSubPath(pending.cwd, ctx.cwd)) {
          ctx.ui.notify(`⌖ [Exit Guard] Detected ${pending.modifiedCount} uncommitted changes from previous session exit. Run /pin to record.`, 'info');
          fs.unlinkSync(pendingPath);
        } else if (isExpired) {
          fs.unlinkSync(pendingPath);
        }
      }
    } catch (_) {}

    updateAnchorStatusBar(ctx, store);

    // Only render startup banner on initial startup or new session, not on mid-session resume
    if (event.reason !== 'resume') {
      updateStartupBanner(ctx, store);
    } else if (hasActiveUI(ctx)) {
      try {
        ctx.ui.setWidget('anchor-startup', undefined);
      } catch {}
    }
  });

  // 2. Auto-clear startup banner when agent starts first turn to keep screen clean
  pi.on('agent_start', async (_event: any, ctx: ExtensionContext) => {
    if (hasActiveUI(ctx)) {
      try {
        ctx.ui.setWidget('anchor-startup', undefined);
      } catch {}
    }
  });

  // 3. JIT Cold-Start Injection: Only fires on Turn 1 of a session. From turn 2 onwards, consumes 0 tokens!
  pi.on('before_agent_start', async (event: any, ctx: ExtensionContext) => {
    const entries = (ctx as any).sessionManager?.getEntries() || [];
    const messageTurns = entries.filter((e: any) => e.type === 'message');
    const isColdStart = messageTurns.length <= 1;

    if (isColdStart) {
      const contextSnippet = renderColdStartAnchorsContext(store, ctx.cwd, undefined, preflightFailures);
      if (contextSnippet) {
        return {
          systemPrompt: `${event.systemPrompt}\n\n${contextSnippet}`
        };
      }
    }
  });

  // 4. JIT Path-Triggered Context Alert & Real-Time Autonomous Commit/Test Settlement
  pi.on('tool_result', async (event: any, ctx: ExtensionContext) => {
    const lowerTool = String(event.toolName || '').toLowerCase();

    // Only verified, non-error tool executions are recorded to prevent false-positive settlement
    if (!event.isError) {
      observer.recordToolCall(event.toolName, event.input || {});

      // Real-time autonomous settlement on git commit or passing verifyCommand!
      if (lowerTool === 'bash' || lowerTool === 'powershell') {
        const executedCmd = String((event.input as any)?.command || '');
        if (executedCmd.includes('git commit') || executedCmd.length > 0) {
          const settledNow = tryRealtimeAutoSettle(store, observer, ctx.cwd, executedCmd);
          if (settledNow.length > 0) {
            updateAnchorStatusBar(ctx, store);
            if (hasActiveUI(ctx)) {
              for (const item of settledNow) {
                try {
                  ctx.ui.notify(`⌖ Auto-settled #${item.anchor.id} ("${item.anchor.title}") via ${item.reason}`, 'info');
                } catch {}
              }
            }
          }
        }
      }
    }

    const pathInput = (event.input as any)?.path;
    if (typeof pathInput !== 'string') return;

    const touchedPath = normalizePath(pathInput, ctx.cwd);
    const anchors = store.list({ cwd: ctx.cwd }).filter(a => a.status === 'active' || a.status === 'sleeping');
    const matches = findMatchedAnchors(anchors, [touchedPath]);

    if (matches.length > 0) {
      const isMutation = MUTATION_TOOLS.has((event.toolName || '').toLowerCase());

      // Only physical mutations (edit, write) refresh decay timer and wake sleeping anchors!
      // Read-only inspection (read, grep) provides JIT context without fake lifecycle extension.
      if (isMutation && !event.isError) {
        for (const m of matches) {
          store.touch(m.anchor.id);
        }
        updateAnchorStatusBar(ctx, store);
      }

      const a = matches[0].anchor;

      // Deduplicate annotations and ensure syntax safety (e.g. skip .json/.env)
      if (!annotatedThisSession.has(a.id)) {
        annotatedThisSession.add(a.id);

        const alert = makeSafeTaskAnnotation(touchedPath, a);
        if (alert) {
          const contents = [...(event.content || [])];
          for (let i = contents.length - 1; i >= 0; i--) {
            const item = contents[i];
            if (item && item.type === 'text') {
              contents[i] = { ...item, text: item.text + alert };
              return { content: contents };
            }
          }
        }
      }
    }
  });

  // 4. Session shutdown: Single-pass git inspection, one-tap settlement check & Exit Guard
  pi.on('session_shutdown', async (event: any, ctx: ExtensionContext) => {
    let gitStatus = '';
    try {
      gitStatus = execSync('git status --porcelain', {
        cwd: ctx.cwd,
        encoding: 'utf-8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore']
      }).replace(/[\r\n]+$/, '');
      const changed = gitStatus
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l: string) => l.slice(3).replace(/^"(.*)"$/, '$1').trim())
        .filter(Boolean);
      for (const f of changed) {
        observer.addTouchedFile(f);
      }
    } catch {}

    // Exit Guard: detect uncommitted changes on abrupt session shutdown
    if (event?.reason === 'quit' && gitStatus) {
      try {
        const activeAnchors = store.list({ cwd: ctx.cwd }).filter(a => a.status === 'active');
        if (activeAnchors.length === 0) {
          const home = process.env.HOME || process.env.USERPROFILE || '';
          const pendingPath = path.join(home, '.anchor', 'pending_exit.json');
          const data = {
            cwd: ctx.cwd,
            timestamp: Date.now(),
            modifiedCount: gitStatus.split('\n').filter(Boolean).length
          };
          fs.writeFileSync(pendingPath, JSON.stringify(data, null, 2), 'utf-8');
        }
      } catch {}
    }

    const modified = observer.getModifiedFiles();
    if (modified.length === 0 && !observer.hasCommitted()) return;

    const proposals = generateSettlementProposals(store, modified, ctx.cwd, observer);
    if (proposals.length === 0) return;

    // Check proposals for automated verification or one-tap settlement
    for (const prop of proposals) {
      const a = prop.anchor;

      // 1. Zero-friction Git Commit evidence matching
      const commitMatch = observer.matchesCommit(a);
      if (commitMatch.matched) {
        store.settle(a.id, {
          settledBy: 'verification-test',
          summary: `Auto-settled via Git commit: ${commitMatch.message}`,
          touchedFiles: prop.matchedFiles
        });
        if (hasActiveUI(ctx)) {
          try {
            ctx.ui.notify(`⌖ Auto-settled #${a.id} via Git commit (run /anchor undo to revert)`, 'info');
          } catch {}
        }
        continue;
      }

      // 2. Automated physical verification command
      if (a.verifyCommand) {
        const verifyRes = runPhysicalVerification(a, ctx.cwd);
        if (verifyRes.success) {
          store.settle(a.id, {
            settledBy: 'verification-test',
            summary: `Automated test passed: ${a.verifyCommand}`,
            touchedFiles: prop.matchedFiles
          });
          if (hasActiveUI(ctx)) {
            try {
              ctx.ui.notify(`⌖ Test passed (${a.verifyCommand}), auto-settled #${a.id}`, 'info');
            } catch {}
          }
          continue;
        }
      }

      // 3. Fallback: Prompt user for one-tap settlement on exit
      if (!hasActiveUI(ctx)) continue;

      try {
        const ok = await ctx.ui.confirm(
          '⌖ Settle Anchor Task',
          `Task #${a.id} [${a.title}] touched files (${prop.matchedFiles.slice(0, 2).join(', ')}).\nMark as completed and archive?`
        );

        if (ok) {
          store.settle(a.id, {
            settledBy: 'one-tap-settlement',
            touchedFiles: prop.matchedFiles
          });
          ctx.ui.notify(`⌖ Settled #${a.id}: "${a.title}"`, 'info');
        }
      } catch {}
    }
  });

  // 5. Register LLM Tool: anchor
  pi.registerTool({
    name: 'anchor',
    label: 'Anchor (Cross-session Task Protocol)',
    description:
      'Manage cross-session persistent tasks that survive terminal restarts and auto-evict upon code changes or settlement. Use when the user asks to retain, pin, remember, or track a multi-session goal across sessions, or when an ongoing commitment must not be forgotten. Actions: pin (create new cross-session anchor), list (view active and sleeping anchors), settle (close and archive a completed anchor), touch (refresh activity), sweep (run decay cleanup). Stored in ~/.anchor/ with zero project repository pollution.',
    promptSnippet: 'Anchor cross-session task contracts that survive terminal restarts and auto-evict',
    promptGuidelines: [
      'Use `anchor` when the user asks to retain a goal across sessions or record a reminder for later/tonight/tomorrow (e.g. "晚上清理垃圾", "明天优化X", "保留任务直到完成").',
      'BOUNDARY WITH TODO: `todo` is strictly for intra-session active work breakdown (step 1, step 2, step 3 right now). For future reminders or cross-session goals, ONLY use `anchor`. NEVER duplicate a cross-session reminder into both `todo` and `anchor`.',
      'DO NOT over-engineer or assume automated scheduled tasks unless the user explicitly requests Windows Task Scheduler or cron.',
      'Tasks are automatically scoped to the current project context without cluttering the project git repository.',
      'When code for an anchor is completed and verified, call `anchor` with action "settle" to archive it and free context.',
      'Active anchors are automatically injected into future sessions in an ultra-compact block.'
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('pin'),
        Type.Literal('list'),
        Type.Literal('settle'),
        Type.Literal('touch'),
        Type.Literal('sweep')
      ]),
      title: Type.Optional(Type.String({ description: 'Short imperative task title (for pin)' })),
      description: Type.Optional(Type.String({ description: 'Detailed context, acceptance criteria, or technical notes' })),
      priority: Type.Optional(Type.Union([Type.Literal('p0'), Type.Literal('p1'), Type.Literal('p2')])),
      project: Type.Optional(Type.String({ description: 'Target project name or workspace (defaults to current directory if omitted)' })),
      targetDate: Type.Optional(Type.String({ description: 'Expected completion date (e.g. YYYY-MM-DD, today, tomorrow)' })),
      files: Type.Optional(Type.Array(Type.String(), { description: 'Associated file paths or directory prefixes' })),
      tags: Type.Optional(Type.Array(Type.String(), { description: 'Domain tags' })),
      verifyCommand: Type.Optional(Type.String({ description: 'Optional shell command for automated physical verification' })),
      id: Type.Optional(Type.String({ description: 'Anchor ID, e.g. anc-1 (for settle or touch)' }))
    }),
    renderCall(args: any, theme: any) {
      const action = args.action || 'list';
      let title = theme.fg('toolTitle', theme.bold('⌖ anchor ')) + theme.fg('accent', action);

      if (action === 'pin' && args.title) {
        const due = args.targetDate ? ` ${theme.fg('dim', `[${args.targetDate}]`)}` : '';
        const files = (args.files && args.files.length > 0)
          ? ` ${theme.fg('muted', `(${args.files.slice(0, 2).join(', ')})`)}`
          : '';
        title += ` "${args.title}"${due}${files}`;
      } else if (action === 'settle' && args.id) {
        title += ` ${theme.fg('dim', `#${args.id}`)}`;
      } else if (action === 'touch' && args.id) {
        title += ` ${theme.fg('dim', `#${args.id}`)}`;
      } else if (action === 'list') {
        if (args.priority) title += ` ${theme.fg('muted', `[${args.priority}]`)}`;
      }

      return {
        render: (width: number) => [truncateToWidth(title, width)],
        invalidate: () => {}
      };
    },
    renderResult(result: any, _options: any, theme: any) {
      if (result.isError) {
        const errText = result.content?.[0]?.text || 'Execution failed';
        return {
          render: (width: number) => [truncateToWidth(theme.fg('error', `✗ ${errText}`), width)],
          invalidate: () => {}
        };
      }

      const text = result.content?.[0]?.text || 'OK';
      return {
        render: (width: number) => [truncateToWidth(theme.fg('success', `✔ ${text}`), width)],
        invalidate: () => {}
      };
    },
    async execute(_toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (partial: any) => void, ctx?: ExtensionContext) {
      if (!ctx) return { content: [{ type: 'text', text: 'Error: context required' }], isError: true };
      if (params.action === 'pin') {
        if (!params.title) {
          return { content: [{ type: 'text', text: 'Error: title is required for pin action' }], isError: true };
        }
        const anc = store.create({
          title: params.title,
          description: params.description,
          priority: params.priority || 'p1',
          project: params.project,
          targetDate: params.targetDate,
          cwd: ctx.cwd,
          files: params.files || [],
          tags: params.tags || [],
          verifyCommand: params.verifyCommand
        });
        updateAnchorStatusBar(ctx, store);
        return {
          content: [{
            type: 'text',
            text: `Successfully anchored task #${anc.id}: "${anc.title}" [${anc.project}]. Stored in ~/.anchor/.`
          }],
          isError: false
        };
      }

      if (params.action === 'list') {
        const active = store.list({ status: 'active', cwd: ctx.cwd });
        const sleeping = store.list({ status: 'sleeping', cwd: ctx.cwd });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ active, sleeping }, null, 2)
          }],
          isError: false
        };
      }

      if (params.action === 'settle') {
        if (!params.id) {
          return { content: [{ type: 'text', text: 'Error: id is required for settle action' }], isError: true };
        }
        try {
          const settled = store.settle(params.id, { settledBy: 'verification-test' });
          updateAnchorStatusBar(ctx, store);
          return {
            content: [{
              type: 'text',
              text: `Anchor #${settled.id} successfully settled and evicted from active context.`
            }],
            isError: false
          };
        } catch (err: any) {
          return { content: [{ type: 'text', text: err.message }], isError: true };
        }
      }

      if (params.action === 'touch') {
        if (!params.id) {
          return { content: [{ type: 'text', text: 'Error: id is required for touch action' }], isError: true };
        }
        try {
          const touched = store.touch(params.id);
          updateAnchorStatusBar(ctx, store);
          return {
            content: [{
              type: 'text',
              text: `Anchor #${touched.id} touched and decay timer refreshed.`
            }],
            isError: false
          };
        } catch (err: any) {
          return { content: [{ type: 'text', text: err.message }], isError: true };
        }
      }

      if (params.action === 'sweep') {
        const res = sweepStore(store);
        updateAnchorStatusBar(ctx, store);
        return {
          content: [{
            type: 'text',
            text: `Sweep complete: ${res.transitionedToSleeping.length} sleeping, ${res.evictedToGraveyard.length} evicted to graveyard.`
          }],
          isError: false
        };
      }

      return { content: [{ type: 'text', text: 'Unknown action' }], isError: true };
    }
  });

  // 6. User Slash Commands: /anchor, /pin, and /done
  pi.registerCommand('anchor', {
    description: 'Inspect, pin, or settle active anchors (e.g. /anchor, /anchor done 1, /anchor undo)',
    handler: async (args: string, ctx: ExtensionContext) => {
      const parsed = parseAnchorCommandInput(args);

      // Case 1: View active anchors (clean list, enter to complete)
      if (parsed.mode === 'dashboard') {
        await openAnchorDashboard(ctx, store);
        return;
      }

      // Case 2: Revert settlement
      if (parsed.mode === 'undo') {
        try {
          const restored = store.undoSettle();
          ctx.ui.notify(`⌖ Restored #${restored.id}: "${restored.title}"`, 'info');
          updateAnchorStatusBar(ctx, store);
        } catch (err: any) {
          ctx.ui.notify(`Revert failed: ${err.message}`, 'error');
        }
        return;
      }

      // Case 3: Explicit settle subcommand (`/anchor done 1` or `/anchor done anc-1`)
      if (parsed.mode === 'settle' && parsed.targetId) {
        const resolvedId = resolveAnchorTarget(store, parsed.targetId, ctx.cwd);
        if (!resolvedId) {
          ctx.ui.notify(`⌖ Anchor not found: ${parsed.targetId}`, 'error');
          return;
        }
        const settled = store.settle(resolvedId, { settledBy: 'manual-command' });
        ctx.ui.notify(`⌖ Settled #${settled.id}: "${settled.title}" (/anchor undo to revert)`, 'info');
        updateAnchorStatusBar(ctx, store);
        return;
      }

      // Case 4: Direct ID completion if input matches an existing ID (e.g. `/anchor anc-1` or `/anchor #1`)
      const rawTrimmed = (args || '').trim();
      if (/^(?:#?anc-\d+|#\d+)$/i.test(rawTrimmed)) {
        const resolvedId = resolveAnchorTarget(store, rawTrimmed, ctx.cwd);
        if (resolvedId) {
          const settled = store.settle(resolvedId, { settledBy: 'manual-command' });
          ctx.ui.notify(`⌖ Settled #${settled.id}: "${settled.title}" (/anchor undo to revert)`, 'info');
          updateAnchorStatusBar(ctx, store);
          return;
        }
      }

      // Case 5: Freeform text creates an anchor (supports `--due <date>`)
      const anc = store.create({
        title: parsed.title || rawTrimmed,
        targetDate: parsed.targetDate,
        cwd: ctx.cwd
      });
      ctx.ui.notify(`⌖ Pinned #${anc.id}: "${anc.title}"${anc.targetDate ? ` (due ${anc.targetDate})` : ''}`, 'info');
      updateAnchorStatusBar(ctx, store);
    }
  });

  // Alias /pin to instant-add (supports `--due <date>`)
  pi.registerCommand('pin', {
    description: 'Pin a task across sessions (e.g. /pin Refactor auth --due tomorrow)',
    handler: async (args: string, ctx: ExtensionContext) => {
      const parsed = parseAnchorCommandInput(args);
      if (parsed.mode === 'dashboard' || !parsed.title) {
        await openAnchorDashboard(ctx, store);
        return;
      }
      const anc = store.create({
        title: parsed.title,
        targetDate: parsed.targetDate,
        cwd: ctx.cwd
      });
      ctx.ui.notify(`⌖ Pinned #${anc.id}: "${anc.title}"${anc.targetDate ? ` (due ${anc.targetDate})` : ''}`, 'info');
      updateAnchorStatusBar(ctx, store);
    }
  });

  // Alias /done for 1-step completion by display number or ID (e.g. `/done 1`)
  pi.registerCommand('done', {
    description: 'Complete an active anchor by row number or ID (e.g. /done 1)',
    handler: async (args: string, ctx: ExtensionContext) => {
      const target = (args || '').trim();
      if (!target) {
        await openAnchorDashboard(ctx, store);
        return;
      }
      const resolvedId = resolveAnchorTarget(store, target, ctx.cwd);
      if (!resolvedId) {
        ctx.ui.notify(`⌖ Anchor not found: ${target}`, 'error');
        return;
      }
      const settled = store.settle(resolvedId, { settledBy: 'manual-command' });
      ctx.ui.notify(`⌖ Settled #${settled.id}: "${settled.title}" (/anchor undo to revert)`, 'info');
      updateAnchorStatusBar(ctx, store);
    }
  });

  // Alias /anchors to open dashboard
  pi.registerCommand('anchors', {
    description: 'Inspect and settle active anchors',
    handler: async (_args: string, ctx: ExtensionContext) => {
      await openAnchorDashboard(ctx, store);
    }
  });
}
