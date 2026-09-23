import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { DualAnchorStore } from './store.ts';
import { SessionTouchObserver } from './observer.ts';
import { renderActiveAnchorsContext } from './context_injector.ts';
import { generateSettlementProposals } from './settlement.ts';
import { sweepStore } from './decay.ts';
import { updateAnchorStatusBar, openAnchorDashboard } from './tui.ts';
import { execSync } from 'node:child_process';

export default function (pi: ExtensionAPI) {
  let store: DualAnchorStore | null = null;
  const observer = new SessionTouchObserver();

  function getStore(cwd: string): DualAnchorStore {
    if (!store || store.projectStore.rootDir !== cwd) {
      store = new DualAnchorStore(cwd);
    }
    return store;
  }

  // 1. Session start: sweep stale tasks and update TUI status bar
  pi.on('session_start', async (_event, ctx) => {
    const s = getStore(ctx.cwd);
    observer.clear();
    const sweep = sweepStore(s);

    if (sweep.transitionedToSleeping.length > 0) {
      ctx.ui.notify(`Anchor: ${sweep.transitionedToSleeping.length} 个非活跃任务已进入休眠`, 'info');
    }

    updateAnchorStatusBar(ctx, s);
  });

  // 2. Track touched files across all tool calls
  pi.on('tool_call', async (event, _ctx) => {
    observer.recordToolCall(event.toolName, event.input || {});
  });

  // 3. Ultra-compact context injection (only active anchors, sleeping consume 0 tokens)
  pi.on('before_agent_start', async (event, ctx) => {
    const s = getStore(ctx.cwd);
    const contextSnippet = renderActiveAnchorsContext(s);
    if (contextSnippet) {
      return {
        systemPrompt: `${event.systemPrompt}\n\n${contextSnippet}`
      };
    }
  });

  // 4. Session shutdown: One-tap settlement check
  pi.on('session_shutdown', async (_event, ctx) => {
    const s = getStore(ctx.cwd);

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

    const proposals = generateSettlementProposals(s, touched);
    if (proposals.length === 0) return;

    // Prompt user for one-tap settlement on exit
    for (const prop of proposals) {
      const a = prop.anchor;
      const ok = await ctx.ui.confirm(
        '⚓ Anchor 关门结案提议',
        `任务 #${a.id} [${a.title}] 关联的文件已在本会话中被修改 (${prop.matchedFiles.slice(0, 2).join(', ')})。\n是否标记已完成并结案归档？`
      );

      if (ok) {
        s.settle(a.id, {
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
      'Manage cross-session persistent task contracts that survive terminal restarts and auto-evict upon code changes or settlement. Use when the user asks to retain, pin, remember, or track a multi-session goal across sessions, or when an ongoing commitment must not be forgotten. Actions: pin (create new cross-session anchor), list (view active and sleeping anchors), settle (close and archive a completed anchor), touch (refresh activity), sweep (run decay cleanup). Scope can be "project" (default, stored in .anchor/) or "global" (stored in ~/.pi/agent/anchors/).',
    promptSnippet: 'Anchor cross-session task contracts that survive terminal restarts and auto-evict',
    promptGuidelines: [
      'Use `anchor` when the user asks to retain a goal across sessions, e.g. "保留这个任务直到完成" or "记住明天优化X".',
      'Choose scope: "global" for system/agent-wide tasks (e.g. Pi updates, user habits), "project" for repo-specific coding tasks.',
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
      scope: Type.Optional(Type.Union([Type.Literal('project'), Type.Literal('global')], { description: 'Storage scope: project-local (.anchor/) or user-global (~/.pi/agent/anchors/)' })),
      files: Type.Optional(Type.Array(Type.String(), { description: 'Associated file paths or directory prefixes' })),
      tags: Type.Optional(Type.Array(Type.String(), { description: 'Domain tags' })),
      id: Type.Optional(Type.String({ description: 'Anchor ID, e.g. anc-1 or anc-g1 (for settle or touch)' }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const s = getStore(ctx.cwd);
      if (params.action === 'pin') {
        if (!params.title) {
          return { content: [{ type: 'text', text: 'Error: title is required for pin action' }], isError: true };
        }
        const anc = s.create({
          title: params.title,
          priority: params.priority || 'p1',
          scope: params.scope || 'project',
          files: params.files || [],
          tags: params.tags || []
        });
        updateAnchorStatusBar(ctx, s);
        return {
          content: [{
            type: 'text',
            text: `Successfully pinned [${anc.scope.toUpperCase()}] anchor #${anc.id}: "${anc.title}". Stored in ${anc.scope === 'global' ? '~/.pi/agent/anchors/' : '.anchor/'}.`
          }],
          isError: false
        };
      }

      if (params.action === 'list') {
        const active = s.list({ status: 'active', scope: params.scope || 'all' });
        const sleeping = s.list({ status: 'sleeping', scope: params.scope || 'all' });
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
          const settled = s.settle(params.id, { settledBy: 'verification-test' });
          updateAnchorStatusBar(ctx, s);
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
        const res = sweepStore(s);
        updateAnchorStatusBar(ctx, s);
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

  // 6. Register /anchor command (with interactive ToolFlow-style TUI cockpit)
  pi.registerCommand('anchor', {
    description: '跨会话任务锚点管理与驾驶舱',
    handler: async (args, ctx) => {
      const s = getStore(ctx.cwd);
      const sub = (args || '').trim();

      if (!sub) {
        await openAnchorDashboard(ctx, s);
        return;
      }

      if (sub.startsWith('add ')) {
        let title = sub.slice(4).trim();
        let scope: 'project' | 'global' = 'project';
        if (title.startsWith('-g ') || title.startsWith('--global ')) {
          scope = 'global';
          title = title.replace(/^(-g|--global)\s+/, '').trim();
        }
        if (!title) {
          ctx.ui.notify('Usage: /anchor add [-g] <task>', 'warning');
          return;
        }
        const anc = s.create({ title, scope });
        ctx.ui.notify(`Anchor: pinned [${scope.toUpperCase()}] #${anc.id} "${anc.title}"`, 'info');
        updateAnchorStatusBar(ctx, s);
        return;
      }

      if (sub.startsWith('close ') || sub.startsWith('settle ')) {
        const id = sub.split(' ')[1]?.trim();
        if (!id) {
          ctx.ui.notify('Usage: /anchor close <id>', 'warning');
          return;
        }
        try {
          s.settle(id, { settledBy: 'manual-command' });
          ctx.ui.notify(`Anchor: settled #${id}`, 'info');
          updateAnchorStatusBar(ctx, s);
        } catch (err: any) {
          ctx.ui.notify(`Settlement error: ${err.message}`, 'error');
        }
        return;
      }

      if (sub === 'sweep') {
        const res = sweepStore(s);
        ctx.ui.notify(
          `Anchor: sweep complete (${res.transitionedToSleeping.length} sleeping, ${res.evictedToGraveyard.length} swept)`,
          'info'
        );
        updateAnchorStatusBar(ctx, s);
        return;
      }

      if (sub === 'list' || sub === 'ls') {
        await openAnchorDashboard(ctx, s);
        return;
      }

      ctx.ui.notify('Usage: /anchor (open cockpit), /anchor add [-g] <task>, /anchor close <id>, /anchor sweep', 'info');
    }
  });

  // Alias /pin to quick-add
  pi.registerCommand('pin', {
    description: '快速挂锚 (支持 -g / --global 全局作用域)',
    handler: async (args, ctx) => {
      const s = getStore(ctx.cwd);
      let text = (args || '').trim();
      if (!text) {
        await openAnchorDashboard(ctx, s);
        return;
      }
      let scope: 'project' | 'global' = 'project';
      if (text.startsWith('-g ') || text.startsWith('--global ')) {
        scope = 'global';
        text = text.replace(/^(-g|--global)\s+/, '').trim();
      }
      const anc = s.create({ title: text, scope });
      ctx.ui.notify(`Anchor: pinned [${scope.toUpperCase()}] #${anc.id} "${anc.title}"`, 'info');
      updateAnchorStatusBar(ctx, s);
    }
  });
}
