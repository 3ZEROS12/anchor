import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { AnchorStore } from './store.ts';
import { SessionTouchObserver } from './observer.ts';
import { renderColdStartAnchorsContext, renderActiveAnchorsContext } from './context_injector.ts';
import { generateSettlementProposals, runPhysicalVerification } from './settlement.ts';
import { normalizePath, findMatchedAnchors } from './matcher.ts';
import { sweepStore } from './decay.ts';
import {
  updateAnchorStatusBar,
  openAnchorDashboard,
  groupAnchorsByQuadrant,
  classifyAnchor,
  formatOrigin,
  formatTargetDate,
  formatCreationTime,
  padToWidth
} from './tui.ts';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { pathToFileURL } from 'node:url';

let isStartupHooked = false;

/**
 * Dynamically hook Pi's InteractiveMode.prototype.showLoadedResources
 * to display [Anchors] with the exact same first-class status, styling,
 * expandable toggling (Ctrl+O), and quietStartup hiding behavior as [Skills].
 */
function installStartupAnchorSection(store: AnchorStore) {
  if (isStartupHooked) return;
  isStartupHooked = true;

  try {
    const candidates = [
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'modes', 'interactive', 'interactive-mode.js'),
      path.join(process.execPath, '..', 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'modes', 'interactive', 'interactive-mode.js')
    ];
    let filePath: string | null = null;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        filePath = c;
        break;
      }
    }
    if (!filePath) return;

    const modUrl = pathToFileURL(filePath).href;
    import(modUrl).then((mod) => {
      const InteractiveMode = mod.InteractiveMode;
      if (!InteractiveMode?.prototype?.showLoadedResources) return;

      const origShow = InteractiveMode.prototype.showLoadedResources;
      InteractiveMode.prototype.showLoadedResources = function (options: any) {
        // 1. Call original Pi method first
        origShow.call(this, options);

        // 2. Obey user's choice: if quietStartup is enabled, hide simultaneously with Skills!
        const showListing = options?.force || this.options?.verbose || !this.settingsManager?.getQuietStartup();
        if (!showListing) return;

        // 3. Fetch active anchors for current workspace
        const active = store.list({ status: 'active', cwd: this.session?.cwd || process.cwd() });
        if (active.length === 0) return;

        // 4. Extract existing ExpandableText and Spacer classes from Pi's container
        if (!this.loadedResourcesContainer?.children || this.loadedResourcesContainer.children.length < 2) return;
        const ExpandableTextClass = this.loadedResourcesContainer.children[0].constructor;
        const SpacerClass = this.loadedResourcesContainer.children[1].constructor;

        // 5. Build Collapsed & Expanded representations
        const groups = groupAnchorsByQuadrant(active);
        const sorted = [...groups.today, ...groups.upcoming, ...groups.habits, ...groups.backlog];

        const collapsedItems = sorted.slice(0, 3).map((a, i) => {
          const num = (i + 1).toString().padStart(2, '0');
          const q = classifyAnchor(a);
          return `[${q}] ${num} ${a.title}`;
        });
        if (sorted.length > 3) {
          collapsedItems.push(`(+${sorted.length - 3} more · /anchor)`);
        }
        const collapsedBody = `  ${collapsedItems.join(' · ')}`;

        const expandedLines: string[] = [];
        const sections = [
          { title: 'Today · 今日聚焦', list: groups.today },
          { title: 'Upcoming · 近期排期', list: groups.upcoming },
          { title: 'Habits · 每日循环', list: groups.habits },
          { title: 'Backlog · 长期愿景', list: groups.backlog },
        ];
        let seqNum = 1;
        for (const sec of sections) {
          if (sec.list.length === 0) continue;
          expandedLines.push(`  [${sec.title}]`);
          for (const a of sec.list) {
            const num = seqNum.toString().padStart(2, '0');
            seqNum++;
            const cat = padToWidth(`[${classifyAnchor(a)}]`, 12);
            const orig = formatOrigin(a);
            const tgt = formatTargetDate(a);
            const crt = formatCreationTime(a.createdAt);
            const titlePadded = padToWidth(a.title, 26);
            expandedLines.push(`    ${num}  ${cat}${titlePadded}  ${padToWidth(orig, 10)}  ${padToWidth(tgt, 10)}  ${crt}`);
          }
        }
        const expandedBody = expandedLines.join('\n');

        // 6. Mount section into loadedResourcesContainer alongside Skills
        const section = new ExpandableTextClass(
          () => `\x1b[36m[Anchors]\x1b[0m\n${collapsedBody}`,
          () => `\x1b[36m[Anchors]\x1b[0m\n${expandedBody}`,
          this.getStartupExpansionState?.() ?? false,
          0,
          0
        );

        this.loadedResourcesContainer.addChild(section);
        this.loadedResourcesContainer.addChild(new SpacerClass(1));
      };
    }).catch(() => {});
  } catch (_e) {
    // Graceful fallback
  }
}

export default function (pi: ExtensionAPI) {
  // Global authoritative store in ~/.pi/agent/anchors/ (0 workspace clutter)
  const store = new AnchorStore();
  const observer = new SessionTouchObserver();

  // Install startup hook to display [Anchors] with identical status to [Skills]
  installStartupAnchorSection(store);

  // 1. Session start: sweep stale tasks and update TUI status bar for current workspace
  pi.on('session_start', async (_event: any, ctx: ExtensionContext) => {
    observer.clear();
    const sweep = sweepStore(store);

    if (sweep.transitionedToSleeping.length > 0) {
      ctx.ui.notify(`Anchor: ${sweep.transitionedToSleeping.length} 个非活跃任务已进入休眠`, 'info');
    }

    updateAnchorStatusBar(ctx, store);
  });

  // 2. Track touched files across all tool calls
  pi.on('tool_call', async (event: any, _ctx: ExtensionContext) => {
    observer.recordToolCall(event.toolName, event.input || {});
  });

  // 3. JIT Cold-Start Injection: Only fires on Turn 1 of a session. From turn 2 onwards, consumes 0 tokens!
  pi.on('before_agent_start', async (event: any, ctx: ExtensionContext) => {
    const entries = (ctx as any).sessionManager?.getEntries() || [];
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
  pi.on('tool_result', async (event: any, ctx: ExtensionContext) => {
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
      const alert = `\n\n// ⌖ anchor context: #${a.id} ${a.title} (${a.priority.toUpperCase()})`;

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
  pi.on('session_shutdown', async (_event: any, ctx: ExtensionContext) => {
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
        .map((l: string) => l.slice(3).trim())
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

      // 1. Zero-friction Git Commit evidence matching
      const commitMatch = observer.matchesCommit(a);
      if (commitMatch.matched) {
        store.settle(a.id, {
          settledBy: 'verification-test',
          summary: `Auto-settled via Git commit: ${commitMatch.message}`,
          touchedFiles: prop.matchedFiles
        });
        ctx.ui.notify(`⌖ Auto-settled #${a.id} via Git commit (run /anchor undo to revert)`, 'info');
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
          ctx.ui.notify(`⌖ Test passed (${a.verifyCommand}), auto-settled #${a.id}`, 'info');
          continue;
        }
      }

      // 3. Fallback: Prompt user for one-tap settlement on exit
      if (!ctx.hasUI || !ctx.ui) continue;

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
      priority: Type.Optional(Type.Union([Type.Literal('p0'), Type.Literal('p1'), Type.Literal('p2')])),
      project: Type.Optional(Type.String({ description: 'Target project name or workspace (defaults to current directory if omitted)' })),
      targetDate: Type.Optional(Type.String({ description: 'Expected completion date (e.g. YYYY-MM-DD, today, tomorrow)' })),
      files: Type.Optional(Type.Array(Type.String(), { description: 'Associated file paths or directory prefixes' })),
      tags: Type.Optional(Type.Array(Type.String(), { description: 'Domain tags' })),
      verifyCommand: Type.Optional(Type.String({ description: 'Optional shell command for automated physical verification' })),
      id: Type.Optional(Type.String({ description: 'Anchor ID, e.g. anc-1 (for settle or touch)' }))
    }),
    async execute(_toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: (partial: any) => void, ctx?: ExtensionContext) {
      if (!ctx) return { content: [{ type: 'text', text: 'Error: context required' }], isError: true };
      if (params.action === 'pin') {
        if (!params.title) {
          return { content: [{ type: 'text', text: 'Error: title is required for pin action' }], isError: true };
        }
        const anc = store.create({
          title: params.title,
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

  // 6. User Slash Commands: /anchor and /pin
  pi.registerCommand('anchor', {
    description: 'Inspect and settle active anchors',
    handler: async (args: string, ctx: ExtensionContext) => {
      const input = (args || '').trim();

      // Case 1: View active anchors (clean list, enter to complete)
      if (!input || input === 'list' || input === 'ls') {
        await openAnchorDashboard(ctx, store);
        return;
      }

      // Case 2: Revert settlement
      if (input === 'undo') {
        try {
          const restored = store.undoSettle();
          ctx.ui.notify(`⌖ Restored #${restored.id}: "${restored.title}"`, 'info');
          updateAnchorStatusBar(ctx, store);
        } catch (err: any) {
          ctx.ui.notify(`Revert failed: ${err.message}`, 'error');
        }
        return;
      }

      // Case 3: Complete directly by ID (e.g. /anchor anc-1)
      const targetId = input.startsWith('#') ? input.slice(1) : input;
      const item = store.get(targetId);
      if (item) {
        store.settle(targetId, { settledBy: 'manual-command' });
        ctx.ui.notify(`⌖ Settled: "${item.title}"`, 'info');
        updateAnchorStatusBar(ctx, store);
        return;
      }

      // Case 4: Freeform text directly creates an anchor
      const anc = store.create({ title: input, cwd: ctx.cwd });
      ctx.ui.notify(`⌖ Pinned #${anc.id}: "${anc.title}"`, 'info');
      updateAnchorStatusBar(ctx, store);
    }
  });

  // Alias /pin to instant-add
  pi.registerCommand('pin', {
    description: 'Quickly pin a task across sessions',
    handler: async (args: string, ctx: ExtensionContext) => {
      const title = (args || '').trim();
      if (!title) {
        await openAnchorDashboard(ctx, store);
        return;
      }
      const anc = store.create({ title, cwd: ctx.cwd });
      ctx.ui.notify(`⌖ Pinned #${anc.id}: "${anc.title}"`, 'info');
      updateAnchorStatusBar(ctx, store);
    }
  });
}
