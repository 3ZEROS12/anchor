import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { AnchorStore } from './store.ts';
import { SessionTouchObserver } from './observer.ts';
import { renderColdStartAnchorsContext, renderActiveAnchorsContext } from './context_injector.ts';
import { generateSettlementProposals, runPhysicalVerification } from './settlement.ts';
import { normalizePath, findMatchedAnchors } from './matcher.ts';
import { sweepStore } from './decay.ts';
import { updateAnchorStatusBar, openAnchorDashboard } from './tui.ts';
import { execSync } from 'node:child_process';

export default function (pi: ExtensionAPI) {
  // Global authoritative store in ~/.pi/agent/anchors/ (0 workspace clutter)
  const store = new AnchorStore();
  const observer = new SessionTouchObserver();

  // 1. Session start: sweep stale tasks and update TUI status bar for current workspace
  pi.on('session_start', async (_event, ctx) => {
    observer.clear();
    const sweep = sweepStore(store);

    if (sweep.transitionedToSleeping.length > 0) {
      ctx.ui.notify(`Anchor: ${sweep.transitionedToSleeping.length} 个非活跃任务已进入休眠`, 'info');
    }

    updateAnchorStatusBar(ctx, store);
  });

  // 2. Track touched files across all tool calls
  pi.on('tool_call', async (event, _ctx) => {
    observer.recordToolCall(event.toolName, event.input || {});
  });

  // 3. JIT Cold-Start Injection: Only fires on Turn 1 of a session. From turn 2 onwards, consumes 0 tokens!
  pi.on('before_agent_start', async (event, ctx) => {
    const entries = ctx.sessionManager?.getEntries() || [];
    const messageTurns = entries.filter((e: any) => e.type === 'message');
    const isColdStart = messageTurns.length <= 1;

    if (isColdStart) {
      const contextSnippet = renderColdStartAnchorsContext(store, ctx.cwd);
      if (contextSnippet) {
        return {
          systemPrompt: `${event.systemPrompt}\n\n${contextSnippet}`
        };
      }
    }
  });

  // 4. JIT Path-Triggered Context Alert: When agent touches an intersecting file, annotate tool result JIT
  pi.on('tool_result', async (event, ctx) => {
    const pathInput = (event.input as any)?.path;
    if (typeof pathInput !== 'string') return;

    const touchedPath = normalizePath(pathInput);
    const anchors = store.list({ cwd: ctx.cwd }).filter(a => a.status === 'active' || a.status === 'sleeping');
    const matches = findMatchedAnchors(anchors, [touchedPath]);

    if (matches.length > 0) {
      for (const m of matches) {
        store.touch(m.anchor.id);
      }
      updateAnchorStatusBar(ctx, store);

      const a = matches[0].anchor;
      const alert = `\n\n[Anchor JIT Alert: Accessing "${touchedPath}" intersects with active commitment #${a.id}: "${a.title}" (${a.priority.toUpperCase()}).]`;

      const contents = [...(event.content || [])];
      for (let i = contents.length - 1; i >= 0; i--) {
        const item = contents[i];
        if (item && item.type === 'text') {
          contents[i] = { ...item, text: item.text + alert };
          return { content: contents };
        }
      }
    }
  });

  // 4. Session shutdown: One-tap settlement check scoped to current workspace
  pi.on('session_shutdown', async (_event, ctx) => {
    // Opportunistically scan git modified files
    try {
      const gitStatus = execSync('git status --porcelain', {
        cwd: ctx.cwd,
        encoding: 'utf-8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore']
      });
      const changed = gitStatus
        .split('\n')
        .map(l => l.slice(3).trim())
        .filter(Boolean);
      for (const f of changed) {
        observer.addTouchedFile(f);
      }
    } catch {}

    const touched = observer.getTouchedFiles();
    if (touched.length === 0) return;

    const proposals = generateSettlementProposals(store, touched, ctx.cwd);
    if (proposals.length === 0) return;

    // Check proposals for automated verification or one-tap settlement
    for (const prop of proposals) {
      const a = prop.anchor;

      // Automated physical verification
      if (a.verifyCommand) {
        const verifyRes = runPhysicalVerification(a, ctx.cwd);
        if (verifyRes.success) {
          store.settle(a.id, {
            settledBy: 'verification-test',
            summary: `Automated test passed: ${a.verifyCommand}`,
            touchedFiles: prop.matchedFiles
          });
          ctx.ui.notify(`Anchor: 物理验讫通过 (${a.verifyCommand})，任务 #${a.id} 自动结案归档！`, 'info');
          continue;
        }
      }

      const ok = await ctx.ui.confirm(
        '⚓ Anchor 关门结案提议',
        `任务 #${a.id} [${a.title}] 关联的文件已在本会话中被修改 (${prop.matchedFiles.slice(0, 2).join(', ')})。\n是否标记已完成并结案归档？`
      );

      if (ok) {
        store.settle(a.id, {
          settledBy: 'one-tap-settlement',
          touchedFiles: prop.matchedFiles
        });
        ctx.ui.notify(`Anchor: 任务 #${a.id} 已完成并即焚归档！`, 'info');
      }
    }
  });

  // 5. Register LLM Tool: anchor
  pi.registerTool({
    name: 'anchor',
    label: 'Anchor (Cross-session Task Protocol)',
    description:
      'Manage cross-session persistent task contracts that survive terminal restarts and auto-evict upon code changes or settlement. Use when the user asks to retain, pin, remember, or track a multi-session goal across sessions, or when an ongoing commitment must not be forgotten. Actions: pin (create new cross-session anchor), list (view active and sleeping anchors), settle (close and archive a completed anchor), touch (refresh activity), sweep (run decay cleanup). Stored in the global ledger (~/.pi/agent/anchors/) with zero project repository pollution.',
    promptSnippet: 'Anchor cross-session task contracts that survive terminal restarts and auto-evict',
    promptGuidelines: [
      'Use `anchor` when the user asks to retain a goal across sessions, e.g. "保留这个任务直到完成" or "记住明天优化X".',
      'Tasks are automatically scoped to the current project context without cluttering the project git repository.',
      'Never put cross-session tasks into AGENTS.md or TODO.md; use `anchor` instead to prevent context rot.',
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
      priority: Type.Optional(Type.Union([Type.Literal('p0'), Type.Literal('p1'), Type.Literal('p2')])),
      files: Type.Optional(Type.Array(Type.String(), { description: 'Associated file paths or directory prefixes' })),
      tags: Type.Optional(Type.Array(Type.String(), { description: 'Domain tags' })),
      verifyCommand: Type.Optional(Type.String({ description: 'Optional shell command for automated physical verification' })),
      id: Type.Optional(Type.String({ description: 'Anchor ID, e.g. anc-1 (for settle or touch)' }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.action === 'pin') {
        if (!params.title) {
          return { content: [{ type: 'text', text: 'Error: title is required for pin action' }], isError: true };
        }
        const anc = store.create({
          title: params.title,
          priority: params.priority || 'p1',
          cwd: ctx.cwd,
          files: params.files || [],
          tags: params.tags || [],
          verifyCommand: params.verifyCommand
        });
        updateAnchorStatusBar(ctx, store);
        return {
          content: [{
            type: 'text',
            text: `Successfully anchored task #${anc.id}: "${anc.title}" [${anc.project}]. Stored in global ledger (~/.pi/agent/anchors/).`
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

  // 6. Register /anchor command
  pi.registerCommand('anchor', {
    description: '跨会话任务锚点管理 (支持 /anchor 或 /anchor all)',
    handler: async (args, ctx) => {
      const sub = (args || '').trim();

      if (!sub) {
        openAnchorDashboard(ctx, store, { showAll: false });
        return;
      }

      if (sub === 'all' || sub === '-a') {
        openAnchorDashboard(ctx, store, { showAll: true });
        return;
      }

      if (sub.startsWith('add ')) {
        const title = sub.slice(4).trim();
        if (!title) {
          ctx.ui.notify('Usage: /anchor add <task>', 'warning');
          return;
        }
        const anc = store.create({ title, cwd: ctx.cwd });
        ctx.ui.notify(`Anchor: pinned #${anc.id} "${anc.title}" [${anc.project}]`, 'info');
        updateAnchorStatusBar(ctx, store);
        return;
      }

      if (sub.startsWith('close ') || sub.startsWith('settle ')) {
        const id = sub.split(' ')[1]?.trim();
        if (!id) {
          ctx.ui.notify('Usage: /anchor close <id>', 'warning');
          return;
        }
        try {
          store.settle(id, { settledBy: 'manual-command' });
          ctx.ui.notify(`Anchor: settled #${id}`, 'info');
          updateAnchorStatusBar(ctx, store);
        } catch (err: any) {
          ctx.ui.notify(`Settlement error: ${err.message}`, 'error');
        }
        return;
      }

      if (sub === 'sweep') {
        const res = sweepStore(store);
        ctx.ui.notify(
          `Anchor: sweep complete (${res.transitionedToSleeping.length} sleeping, ${res.evictedToGraveyard.length} swept)`,
          'info'
        );
        updateAnchorStatusBar(ctx, store);
        return;
      }

      if (sub === 'list' || sub === 'ls') {
        openAnchorDashboard(ctx, store, { showAll: false });
        return;
      }

      ctx.ui.notify('Usage: /anchor (current project), /anchor all (all projects), /anchor add <task>, /anchor close <id>, /anchor sweep', 'info');
    }
  });

  // Alias /pin to quick-add
  pi.registerCommand('pin', {
    description: '快速挂锚至当前项目上下文',
    handler: async (args, ctx) => {
      const title = (args || '').trim();
      if (!title) {
        openAnchorDashboard(ctx, store, { showAll: false });
        return;
      }
      const anc = store.create({ title, cwd: ctx.cwd });
      ctx.ui.notify(`Anchor: pinned #${anc.id} "${anc.title}" [${anc.project}]`, 'info');
      updateAnchorStatusBar(ctx, store);
    }
  });
}
