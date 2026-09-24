import {
  AnchorStore,
  SessionTouchObserver,
  findMatchedAnchors,
  generateSettlementProposals,
  normalizePath,
  openAnchorDashboard,
  renderColdStartAnchorsContext,
  runPhysicalVerification,
  sweepStore,
  updateAnchorStatusBar,
  updateStartupBanner
} from "./chunk-7KT74MHZ.js";

// src/extension.ts
import { Type } from "@sinclair/typebox";
import { execSync } from "child_process";
function extension_default(pi) {
  const store = new AnchorStore();
  const observer = new SessionTouchObserver();
  pi.on("session_start", async (_event, ctx) => {
    observer.clear();
    const sweep = sweepStore(store);
    if (sweep.transitionedToSleeping.length > 0) {
      ctx.ui.notify(`Anchor: ${sweep.transitionedToSleeping.length} \u4E2A\u975E\u6D3B\u8DC3\u4EFB\u52A1\u5DF2\u8FDB\u5165\u4F11\u7720`, "info");
    }
    updateAnchorStatusBar(ctx, store);
    updateStartupBanner(ctx, store);
  });
  pi.on("agent_start", async (_event, ctx) => {
    if (ctx.hasUI && ctx.ui) {
      ctx.ui.setWidget("anchor-startup", void 0);
    }
  });
  pi.on("tool_call", async (event, _ctx) => {
    observer.recordToolCall(event.toolName, event.input || {});
  });
  pi.on("before_agent_start", async (event, ctx) => {
    const entries = ctx.sessionManager?.getEntries() || [];
    const messageTurns = entries.filter((e) => e.type === "message");
    const isColdStart = messageTurns.length <= 1;
    if (isColdStart) {
      const contextSnippet = renderColdStartAnchorsContext(store, ctx.cwd);
      if (contextSnippet) {
        return {
          systemPrompt: `${event.systemPrompt}

${contextSnippet}`
        };
      }
    }
  });
  pi.on("tool_result", async (event, ctx) => {
    const pathInput = event.input?.path;
    if (typeof pathInput !== "string") return;
    const touchedPath = normalizePath(pathInput);
    const anchors = store.list({ cwd: ctx.cwd }).filter((a) => a.status === "active" || a.status === "sleeping");
    const matches = findMatchedAnchors(anchors, [touchedPath]);
    if (matches.length > 0) {
      for (const m of matches) {
        store.touch(m.anchor.id);
      }
      updateAnchorStatusBar(ctx, store);
      const a = matches[0].anchor;
      const alert = `

// \u2316 anchor context: #${a.id} ${a.title} (${a.priority.toUpperCase()})`;
      const contents = [...event.content || []];
      for (let i = contents.length - 1; i >= 0; i--) {
        const item = contents[i];
        if (item && item.type === "text") {
          contents[i] = { ...item, text: item.text + alert };
          return { content: contents };
        }
      }
    }
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    try {
      const gitStatus = execSync("git status --porcelain", {
        cwd: ctx.cwd,
        encoding: "utf-8",
        timeout: 3e3,
        stdio: ["ignore", "pipe", "ignore"]
      });
      const changed = gitStatus.split("\n").map((l) => l.slice(3).trim()).filter(Boolean);
      for (const f of changed) {
        observer.addTouchedFile(f);
      }
    } catch {
    }
    const touched = observer.getTouchedFiles();
    if (touched.length === 0) return;
    const proposals = generateSettlementProposals(store, touched, ctx.cwd);
    if (proposals.length === 0) return;
    for (const prop of proposals) {
      const a = prop.anchor;
      const commitMatch = observer.matchesCommit(a);
      if (commitMatch.matched) {
        store.settle(a.id, {
          settledBy: "verification-test",
          summary: `Auto-settled via Git commit: ${commitMatch.message}`,
          touchedFiles: prop.matchedFiles
        });
        ctx.ui.notify(`\u2316 Auto-settled #${a.id} via Git commit (run /anchor undo to revert)`, "info");
        continue;
      }
      if (a.verifyCommand) {
        const verifyRes = runPhysicalVerification(a, ctx.cwd);
        if (verifyRes.success) {
          store.settle(a.id, {
            settledBy: "verification-test",
            summary: `Automated test passed: ${a.verifyCommand}`,
            touchedFiles: prop.matchedFiles
          });
          ctx.ui.notify(`\u2316 Test passed (${a.verifyCommand}), auto-settled #${a.id}`, "info");
          continue;
        }
      }
      if (!ctx.hasUI || !ctx.ui) continue;
      const ok = await ctx.ui.confirm(
        "\u2316 Settle Anchor Task",
        `Task #${a.id} [${a.title}] touched files (${prop.matchedFiles.slice(0, 2).join(", ")}).
Mark as completed and archive?`
      );
      if (ok) {
        store.settle(a.id, {
          settledBy: "one-tap-settlement",
          touchedFiles: prop.matchedFiles
        });
        ctx.ui.notify(`\u2316 Settled #${a.id}: "${a.title}"`, "info");
      }
    }
  });
  pi.registerTool({
    name: "anchor",
    label: "Anchor (Cross-session Task Protocol)",
    description: "Manage cross-session persistent task contracts that survive terminal restarts and auto-evict upon code changes or settlement. Use when the user asks to retain, pin, remember, or track a multi-session goal across sessions, or when an ongoing commitment must not be forgotten. Actions: pin (create new cross-session anchor), list (view active and sleeping anchors), settle (close and archive a completed anchor), touch (refresh activity), sweep (run decay cleanup). Stored in the global ledger (~/.pi/agent/anchors/) with zero project repository pollution.",
    promptSnippet: "Anchor cross-session task contracts that survive terminal restarts and auto-evict",
    promptGuidelines: [
      'Use `anchor` when the user asks to retain a goal across sessions or record a reminder for later/tonight/tomorrow (e.g. "\u665A\u4E0A\u6E05\u7406\u5783\u573E", "\u660E\u5929\u4F18\u5316X", "\u4FDD\u7559\u4EFB\u52A1\u76F4\u5230\u5B8C\u6210").',
      "BOUNDARY WITH TODO: `todo` is strictly for intra-session active work breakdown (step 1, step 2, step 3 right now). For future reminders or cross-session goals, ONLY use `anchor`. NEVER duplicate a cross-session reminder into both `todo` and `anchor`.",
      "DO NOT over-engineer or assume automated scheduled tasks unless the user explicitly requests Windows Task Scheduler or cron.",
      "Tasks are automatically scoped to the current project context without cluttering the project git repository.",
      'When code for an anchor is completed and verified, call `anchor` with action "settle" to archive it and free context.',
      "Active anchors are automatically injected into future sessions in an ultra-compact block."
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("pin"),
        Type.Literal("list"),
        Type.Literal("settle"),
        Type.Literal("touch"),
        Type.Literal("sweep")
      ]),
      title: Type.Optional(Type.String({ description: "Short imperative task title (for pin)" })),
      priority: Type.Optional(Type.Union([Type.Literal("p0"), Type.Literal("p1"), Type.Literal("p2")])),
      project: Type.Optional(Type.String({ description: "Target project name or workspace (defaults to current directory if omitted)" })),
      targetDate: Type.Optional(Type.String({ description: "Expected completion date (e.g. YYYY-MM-DD, today, tomorrow)" })),
      files: Type.Optional(Type.Array(Type.String(), { description: "Associated file paths or directory prefixes" })),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Domain tags" })),
      verifyCommand: Type.Optional(Type.String({ description: "Optional shell command for automated physical verification" })),
      id: Type.Optional(Type.String({ description: "Anchor ID, e.g. anc-1 (for settle or touch)" }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx) return { content: [{ type: "text", text: "Error: context required" }], isError: true };
      if (params.action === "pin") {
        if (!params.title) {
          return { content: [{ type: "text", text: "Error: title is required for pin action" }], isError: true };
        }
        const anc = store.create({
          title: params.title,
          priority: params.priority || "p1",
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
            type: "text",
            text: `Successfully anchored task #${anc.id}: "${anc.title}" [${anc.project}]. Stored in global ledger (~/.pi/agent/anchors/).`
          }],
          isError: false
        };
      }
      if (params.action === "list") {
        const active = store.list({ status: "active", cwd: ctx.cwd });
        const sleeping = store.list({ status: "sleeping", cwd: ctx.cwd });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ active, sleeping }, null, 2)
          }],
          isError: false
        };
      }
      if (params.action === "settle") {
        if (!params.id) {
          return { content: [{ type: "text", text: "Error: id is required for settle action" }], isError: true };
        }
        try {
          const settled = store.settle(params.id, { settledBy: "verification-test" });
          updateAnchorStatusBar(ctx, store);
          return {
            content: [{
              type: "text",
              text: `Anchor #${settled.id} successfully settled and evicted from active context.`
            }],
            isError: false
          };
        } catch (err) {
          return { content: [{ type: "text", text: err.message }], isError: true };
        }
      }
      if (params.action === "touch") {
        if (!params.id) {
          return { content: [{ type: "text", text: "Error: id is required for touch action" }], isError: true };
        }
        try {
          const touched = store.touch(params.id);
          updateAnchorStatusBar(ctx, store);
          return {
            content: [{
              type: "text",
              text: `Anchor #${touched.id} touched and decay timer refreshed.`
            }],
            isError: false
          };
        } catch (err) {
          return { content: [{ type: "text", text: err.message }], isError: true };
        }
      }
      if (params.action === "sweep") {
        const res = sweepStore(store);
        updateAnchorStatusBar(ctx, store);
        return {
          content: [{
            type: "text",
            text: `Sweep complete: ${res.transitionedToSleeping.length} sleeping, ${res.evictedToGraveyard.length} evicted to graveyard.`
          }],
          isError: false
        };
      }
      return { content: [{ type: "text", text: "Unknown action" }], isError: true };
    }
  });
  pi.registerCommand("anchor", {
    description: "Inspect and settle active anchors",
    handler: async (args, ctx) => {
      const input = (args || "").trim();
      if (!input || input === "list" || input === "ls") {
        await openAnchorDashboard(ctx, store);
        return;
      }
      if (input === "undo") {
        try {
          const restored = store.undoSettle();
          ctx.ui.notify(`\u2316 Restored #${restored.id}: "${restored.title}"`, "info");
          updateAnchorStatusBar(ctx, store);
        } catch (err) {
          ctx.ui.notify(`Revert failed: ${err.message}`, "error");
        }
        return;
      }
      const targetId = input.startsWith("#") ? input.slice(1) : input;
      const item = store.get(targetId);
      if (item) {
        store.settle(targetId, { settledBy: "manual-command" });
        ctx.ui.notify(`\u2316 Settled: "${item.title}"`, "info");
        updateAnchorStatusBar(ctx, store);
        return;
      }
      const anc = store.create({ title: input, cwd: ctx.cwd });
      ctx.ui.notify(`\u2316 Pinned #${anc.id}: "${anc.title}"`, "info");
      updateAnchorStatusBar(ctx, store);
    }
  });
  pi.registerCommand("pin", {
    description: "Quickly pin a task across sessions",
    handler: async (args, ctx) => {
      const title = (args || "").trim();
      if (!title) {
        await openAnchorDashboard(ctx, store);
        return;
      }
      const anc = store.create({ title, cwd: ctx.cwd });
      ctx.ui.notify(`\u2316 Pinned #${anc.id}: "${anc.title}"`, "info");
      updateAnchorStatusBar(ctx, store);
    }
  });
}
export {
  extension_default as default
};
