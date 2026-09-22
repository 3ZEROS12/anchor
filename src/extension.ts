import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { AnchorStore } from './store.ts';
import { SessionTouchObserver } from './observer.ts';
import { renderActiveAnchorsContext } from './context_injector.ts';
import { generateSettlementProposals } from './settlement.ts';
import { sweepStore } from './decay.ts';
import { updateAnchorStatusBar, openAnchorDashboard } from './tui.ts';
import { execSync } from 'node:child_process';

export default function (pi: ExtensionAPI) {
  let store: AnchorStore | null = null;
  const observer = new SessionTouchObserver();

  function getStore(cwd: string): AnchorStore {
    if (!store || store.rootDir !== cwd) {
      store = new AnchorStore(cwd);
    }
    return store;
  }

  // 1. Session start: sweep stale tasks and update TUI status bar
  pi.on('session_start', async (_event, ctx) => {
    const s = getStore(ctx.cwd);
    observer.clear();
    const sweep = sweepStore(s);

    if (sweep.transitionedToSleeping.length > 0) {
      ctx.ui.notify(`⚓ Anchor: ${sweep.transitionedToSleeping.length} 个非活跃任务已进入休眠（释放上下文）`, 'info');
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
        ctx.ui.notify(`⚓ 任务 #${a.id} 已完成并即焚归档！`, 'info');
      }
    }
  });

  // 5. Register /anchor command (with interactive TUI dashboard fallback)
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
        const title = sub.slice(4).trim();
        if (!title) {
          ctx.ui.notify('用法: /anchor add <任务描述>', 'warning');
          return;
        }
        const anc = s.create({ title });
        ctx.ui.notify(`⚓ 任务 #${anc.id} 已成功锚定！将在后续会话中保持追踪。`, 'info');
        updateAnchorStatusBar(ctx, s);
        return;
      }

      if (sub.startsWith('close ') || sub.startsWith('settle ')) {
        const id = sub.split(' ')[1]?.trim();
        if (!id) {
          ctx.ui.notify('用法: /anchor close <id>', 'warning');
          return;
        }
        try {
          s.settle(id, { settledBy: 'manual-command' });
          ctx.ui.notify(`⚓ 任务 #${id} 已结案归档！`, 'info');
          updateAnchorStatusBar(ctx, s);
        } catch (err: any) {
          ctx.ui.notify(`结案失败: ${err.message}`, 'error');
        }
        return;
      }

      if (sub === 'sweep') {
        const res = sweepStore(s);
        ctx.ui.notify(
          `⚓ 状态清理完成：休眠 ${res.transitionedToSleeping.length} 个，脱落墓园 ${res.evictedToGraveyard.length} 个。`,
          'info'
        );
        updateAnchorStatusBar(ctx, s);
        return;
      }

      if (sub === 'list' || sub === 'ls') {
        await openAnchorDashboard(ctx, s);
        return;
      }

      ctx.ui.notify('可用命令: /anchor (打开看板), /anchor add <任务>, /anchor close <id>, /anchor sweep', 'info');
    }
  });

  // Alias /pin to quick-add
  pi.registerCommand('pin', {
    description: '快速挂锚或打开 Anchor 任务看板',
    handler: async (args, ctx) => {
      const s = getStore(ctx.cwd);
      const title = (args || '').trim();
      if (!title) {
        await openAnchorDashboard(ctx, s);
        return;
      }
      const anc = s.create({ title });
      ctx.ui.notify(`⚓ 任务 #${anc.id} 已成功锚定！`, 'info');
      updateAnchorStatusBar(ctx, s);
    }
  });
}
