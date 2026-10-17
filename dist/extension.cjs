"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  default: () => extension_default,
  parseAnchorCommandInput: () => parseAnchorCommandInput,
  parseQuickNoteInput: () => parseQuickNoteInput,
  resolveAnchorTarget: () => resolveAnchorTarget
});
module.exports = __toCommonJS(extension_exports);
var import_typebox = require("@sinclair/typebox");
var import_node_fs3 = __toESM(require("fs"), 1);

// src/store.ts
var import_node_fs = __toESM(require("fs"), 1);
var import_node_path2 = __toESM(require("path"), 1);
var import_node_os = __toESM(require("os"), 1);

// src/types.ts
var QUIET_AFTER_DAYS = 7;
var MS_PER_DAY = 864e5;

// src/graph.ts
function validateStepDependencies(steps, stepId, newBlockedBy) {
  const visibleMap = /* @__PURE__ */ new Map();
  for (const s of steps) {
    if (s.status !== "deleted") {
      visibleMap.set(s.id, s);
    }
  }
  for (const depId of newBlockedBy) {
    if (depId === stepId) {
      return { valid: false, error: `Step #${stepId} cannot be blocked by itself` };
    }
    if (!visibleMap.has(depId)) {
      return { valid: false, error: `Prerequisite step #${depId} does not exist or is deleted` };
    }
  }
  const edges = /* @__PURE__ */ new Map();
  for (const s of visibleMap.values()) {
    if (s.id === stepId) {
      const merged = /* @__PURE__ */ new Set([...s.blockedBy ?? [], ...newBlockedBy]);
      edges.set(s.id, [...merged]);
    } else {
      edges.set(s.id, s.blockedBy ? [...s.blockedBy] : []);
    }
  }
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const hasCycle = (node) => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const nb of edges.get(node) ?? []) {
      if (hasCycle(nb)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  for (const node of edges.keys()) {
    if (hasCycle(node)) {
      return { valid: false, error: `Dependency cycle detected involving step #${stepId}` };
    }
  }
  return { valid: true };
}
function validateAnchorDependencies(anchors, anchorId, newBlockedBy) {
  const normId = (raw) => {
    const clean = raw.trim().replace(/^#/, "");
    return /^\d+$/.test(clean) ? `anc-${parseInt(clean, 10)}` : clean;
  };
  const targetId = normId(anchorId);
  const activeMap = /* @__PURE__ */ new Map();
  for (const a of anchors) {
    activeMap.set(a.id, a);
  }
  const normalizedDeps = newBlockedBy.map(normId);
  for (const depId of normalizedDeps) {
    if (depId === targetId) {
      return { valid: false, error: `Note #${targetId} cannot depend on itself` };
    }
    if (!activeMap.has(depId)) {
      return { valid: false, error: `Prerequisite note #${depId} does not exist` };
    }
  }
  const edges = /* @__PURE__ */ new Map();
  for (const a of activeMap.values()) {
    if (a.id === targetId) {
      edges.set(a.id, Array.from(/* @__PURE__ */ new Set([...a.blockedBy ?? [], ...normalizedDeps])));
    } else {
      edges.set(a.id, a.blockedBy ? [...a.blockedBy] : []);
    }
  }
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const hasCycle = (node) => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const nb of edges.get(node) ?? []) {
      if (hasCycle(nb)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  for (const node of edges.keys()) {
    if (hasCycle(node)) {
      return { valid: false, error: `Dependency cycle detected involving #${targetId}` };
    }
  }
  return { valid: true };
}
function materializeSteps(progress) {
  if (!progress) return [];
  if (Array.isArray(progress.items) && progress.items.length > 0) {
    return progress.items.filter((s) => s.status !== "deleted").map((s) => ({ ...s }));
  }
  if (Array.isArray(progress.steps) && progress.steps.length > 0) {
    const done = Math.max(0, progress.done || 0);
    return progress.steps.map((subject, idx) => {
      let status = "pending";
      if (idx < done) status = "completed";
      else if (idx === done) status = "in_progress";
      return {
        id: idx + 1,
        subject,
        status
      };
    });
  }
  return [];
}
function syncProgressFromItems(items, existing) {
  const visible = items.filter((i) => i.status !== "deleted");
  const completed = visible.filter((i) => i.status === "completed").length;
  return {
    ...existing || {},
    done: completed,
    total: visible.length,
    steps: visible.map((i) => i.subject),
    items: items.map((i) => ({ ...i }))
  };
}
function selectDockStepLayout(steps, budget, hiddenCompletedIds = /* @__PURE__ */ new Set()) {
  const allVisible = steps.filter(
    (s) => s.status !== "deleted" && !(s.status === "completed" && hiddenCompletedIds.has(s.id))
  );
  const preHiddenCompleted = steps.filter(
    (s) => s.status === "completed" && hiddenCompletedIds.has(s.id)
  ).length;
  if (budget <= 0) {
    return { visible: [], hiddenCompleted: preHiddenCompleted, truncatedTail: allVisible.length };
  }
  if (allVisible.length <= budget && preHiddenCompleted === 0) {
    return { visible: allVisible, hiddenCompleted: 0, truncatedTail: 0 };
  }
  const innerBudget = preHiddenCompleted > 0 ? Math.max(1, budget - 1) : allVisible.length <= budget ? budget : Math.max(1, budget - 1);
  if (allVisible.length <= innerBudget && preHiddenCompleted === 0) {
    return { visible: allVisible, hiddenCompleted: 0, truncatedTail: 0 };
  }
  const nonCompleted = allVisible.filter((s) => s.status !== "completed");
  const newlyCompletedCount = allVisible.length - nonCompleted.length;
  if (nonCompleted.length <= innerBudget) {
    const kept = new Set(nonCompleted);
    for (const s of allVisible) {
      if (kept.size >= innerBudget) break;
      if (s.status === "completed") kept.add(s);
    }
    const visible2 = allVisible.filter((s) => kept.has(s));
    const shownCompleted = visible2.filter((s) => s.status === "completed").length;
    return {
      visible: visible2,
      hiddenCompleted: preHiddenCompleted + (newlyCompletedCount - shownCompleted),
      truncatedTail: 0
    };
  }
  const visible = nonCompleted.slice(0, innerBudget);
  return {
    visible,
    hiddenCompleted: preHiddenCompleted + newlyCompletedCount,
    truncatedTail: nonCompleted.length - innerBudget
  };
}

// src/bridge.ts
var import_node_path = __toESM(require("path"), 1);
function replayTodoSnapshotFromBranch(branch) {
  if (!branch || typeof branch[Symbol.iterator] !== "function") return null;
  let latestTasks = null;
  for (const entry of branch) {
    const e = entry;
    if (e?.type !== "message") continue;
    const msg = e.message;
    if (msg?.role !== "toolResult" || String(msg.toolName || "").toLowerCase() !== "todo") continue;
    const rawTasks = msg.details?.tasks;
    if (Array.isArray(rawTasks)) {
      latestTasks = rawTasks.filter((t) => t && typeof t === "object" && typeof t.subject === "string").map((t, idx) => ({
        id: typeof t.id === "number" ? t.id : idx + 1,
        subject: String(t.subject),
        status: t.status === "in_progress" || t.status === "completed" || t.status === "deleted" ? t.status : "pending",
        ...typeof t.activeForm === "string" && t.activeForm.trim() ? { activeForm: t.activeForm.trim() } : {},
        ...Array.isArray(t.blockedBy) ? { blockedBy: t.blockedBy.filter((n) => typeof n === "number") } : {}
      }));
    }
  }
  return latestTasks;
}
function convertTodoTasksToSteps(tasks) {
  return tasks.filter((t) => t && typeof t.subject === "string" && t.status !== "deleted").map((t, idx) => ({
    id: typeof t.id === "number" ? t.id : idx + 1,
    subject: t.subject.trim(),
    status: t.status,
    ...t.activeForm ? { activeForm: t.activeForm.trim() } : {},
    ...t.blockedBy && t.blockedBy.length > 0 ? { blockedBy: [...t.blockedBy] } : {}
  }));
}
function inferLiveActivityLabel(toolName, input, _cwd) {
  if (!input || typeof input !== "object") return void 0;
  const lower = (toolName || "").toLowerCase();
  const rawPath = input.path || input.filePath || input.file;
  if (typeof rawPath === "string" && rawPath.trim()) {
    const base = import_node_path.default.basename(rawPath.trim().replace(/\\/g, "/"));
    if (!base) return void 0;
    if (lower === "edit" || lower === "patch" || lower === "apply_diff" || lower === "modify") {
      return `editing ${base}`;
    }
    if (lower === "write" || lower === "create_file") {
      return `writing ${base}`;
    }
    if (lower === "read") {
      return `reading ${base}`;
    }
  }
  if (lower === "grep") {
    return "searching codebase";
  }
  if (lower === "find") {
    return "locating files";
  }
  if (lower === "ls") {
    return "inspecting directory";
  }
  if (lower === "subagent") {
    const ag = input.agent;
    return ag ? `delegating to ${ag}` : "running subagent";
  }
  if (lower === "bash" || lower === "powershell") {
    const cmd = String(input.command || "").trim();
    if (!cmd) return void 0;
    if (/\b(?:npm\s+test|vitest|pytest|cargo\s+test|go\s+test|tsx\s+--test)\b/i.test(cmd)) {
      return "running tests";
    }
    if (/\b(?:npm\s+run\s+build|tsc|tsup|cargo\s+build)\b/i.test(cmd)) {
      return "building project";
    }
    if (/\bgit\s+commit\b/i.test(cmd)) {
      return "committing changes";
    }
    if (/\bgit\s+(?:status|diff|log)\b/i.test(cmd)) {
      return "inspecting git status";
    }
    if (/\b(?:python|python3|py)\s+/i.test(cmd)) {
      return "running python script";
    }
    if (/\bcargo\s+/i.test(cmd)) {
      return "running cargo";
    }
    if (/\btypst\b/i.test(cmd)) {
      return "compiling typst";
    }
  }
  return void 0;
}

// src/store.ts
function normalizePath(filePath, baseCwd) {
  if (typeof filePath !== "string") return "";
  let norm = filePath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (baseCwd && (import_node_path2.default.isAbsolute(filePath) || norm.startsWith("/") || /^[a-zA-Z]:\//.test(norm))) {
    const normBase = baseCwd.trim().replace(/\\/g, "/").replace(/\/+$/, "");
    const lowerNorm = norm.toLowerCase();
    const lowerBase = normBase.toLowerCase();
    if (lowerNorm === lowerBase) {
      norm = "";
    } else if (lowerNorm.startsWith(lowerBase + "/")) {
      norm = norm.slice(normBase.length + 1).replace(/^\/+/, "");
    }
  }
  return norm;
}
function isSameOrSubPath(dirA, dirB) {
  if (!dirA || !dirB) return false;
  const normA = dirA.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const normB = dirB.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const isWin = process.platform === "win32" || /^[a-zA-Z]:\//.test(normA) || /^[a-zA-Z]:\//.test(normB);
  const a = isWin ? normA.toLowerCase() : normA;
  const b = isWin ? normB.toLowerCase() : normB;
  return a === b || b.startsWith(a + "/") || a.startsWith(b + "/");
}
function globToRegExp(pattern) {
  const collapsed = pattern.slice(0, 512).replace(/\/+(\*\*\/+)+/g, "/**/").replace(/\*{3,}/g, "**");
  const escaped = collapsed.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\/\*\*\//g, "___GLOB_DIR_SLASH___").replace(/\*\*/g, "___GLOB_STAR_STAR___").replace(/\*/g, "[^/]*").replace(/___GLOB_DIR_SLASH___/g, "(?:/|/(?:[^/]+/)+)").replace(/___GLOB_STAR_STAR___/g, ".*");
  return new RegExp(`^${escaped}$`);
}
function extractPathsFromText(text) {
  if (!text) return [];
  const results = /* @__PURE__ */ new Set();
  const regex = /(?:[a-zA-Z]:[\\/][^\s"'`，。；！？、,;)>\]]+|(?:\b(?:src|lib|dist|tests|test|docs|scripts|packages|extensions|bin|assets)[\\/][^\s"'`，。；！？、,;)>\]]+)|(?:\b[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|c|cpp|h|cs|md|json|yaml|yml|toml|html|css|sql|sh)\b))/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const cleaned = normalizePath(match[0].replace(/[.:;,'")\]}>]+$/, ""));
    if (cleaned && cleaned.length >= 3) {
      results.add(cleaned);
    }
  }
  return Array.from(results);
}
function extractProgressFromText(rawTitle) {
  if (!rawTitle) return { cleanTitle: "" };
  const stepParts = Array.from(rawTitle.matchAll(/(?:^|\s)(\d+)\.\s*([^\d]+?)(?=\s+\d+\.\s|$)/g));
  if (stepParts.length >= 2) {
    const steps = stepParts.map((m) => m[2].trim().replace(/[;；,，]+$/, "")).filter(Boolean);
    const items = steps.map((subject, idx) => ({
      id: idx + 1,
      subject,
      status: idx === 0 ? "in_progress" : "pending"
    }));
    const firstMatchIdx = rawTitle.indexOf(stepParts[0][0]);
    const prefix = rawTitle.slice(0, firstMatchIdx).replace(/[:：\-—\s]+$/, "").trim();
    return {
      cleanTitle: prefix || steps.join(" \u2192 "),
      progress: { done: 0, total: steps.length, steps, items }
    };
  }
  const ratioMatch = rawTitle.match(/(?:\[(\d{1,3})\/(\d{1,3})\]|\((\d{1,3})\/(\d{1,3})\))/);
  if (ratioMatch) {
    const done = parseInt(ratioMatch[1] ?? ratioMatch[3], 10);
    const total = parseInt(ratioMatch[2] ?? ratioMatch[4], 10);
    if (!isNaN(done) && !isNaN(total) && total >= 2 && total <= 500 && done >= 0 && done <= total) {
      const stripped = rawTitle.replace(ratioMatch[0], " ").replace(/\s+/g, " ").trim();
      return {
        cleanTitle: stripped || rawTitle.trim(),
        progress: { done, total }
      };
    }
  }
  return { cleanTitle: rawTitle.trim() };
}
function isAnchorTargetingWorkspace(anchor, targetCwd) {
  if (!targetCwd) return true;
  const normTarget = targetCwd.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const targetBase = import_node_path2.default.basename(normTarget).toLowerCase();
  if (anchor.project && anchor.project !== "global") {
    const normProj = anchor.project.trim().replace(/\\/g, "/").replace(/\/+$/, "");
    if (isSameOrSubPath(normProj, normTarget)) return true;
    if (import_node_path2.default.basename(normProj).toLowerCase() === targetBase) return true;
  }
  if (anchor.files && anchor.files.length > 0) {
    for (const f of anchor.files) {
      const resolvedFile = !import_node_path2.default.isAbsolute(f) && !/^[a-zA-Z]:\//.test(f) && anchor.cwd ? `${anchor.cwd.replace(/\\/g, "/").replace(/\/+$/, "")}/${f.replace(/^\/+/, "")}` : f;
      if (isSameOrSubPath(resolvedFile, normTarget)) return true;
    }
  }
  if (anchor.cwd && isSameOrSubPath(anchor.cwd, normTarget)) {
    return true;
  }
  return false;
}
function matchAnchorAgainstTouchedFiles(anchor, touchedFiles) {
  if (!anchor.files || anchor.files.length === 0) return null;
  const normTouched = touchedFiles.map((f) => normalizePath(f, anchor.cwd)).filter(Boolean);
  if (normTouched.length === 0) return null;
  const matchedExact = [];
  const matchedPrefix = [];
  for (const touched of normTouched) {
    for (const pattern of anchor.files) {
      const normPattern = normalizePath(pattern, anchor.cwd);
      if (normPattern === touched) {
        matchedExact.push(touched);
        break;
      }
      if (normPattern.includes("*") && globToRegExp(normPattern).test(touched)) {
        matchedExact.push(touched);
        break;
      }
      const dirPrefix = normPattern.endsWith("/") ? normPattern : normPattern + "/";
      if (touched.startsWith(dirPrefix)) {
        matchedPrefix.push(touched);
        break;
      }
    }
  }
  if (matchedExact.length > 0) {
    return { anchor, score: 1, matchedFiles: Array.from(new Set(matchedExact)), reason: "exact-file" };
  }
  if (matchedPrefix.length > 0) {
    return { anchor, score: 0.85, matchedFiles: Array.from(new Set(matchedPrefix)), reason: "dir-prefix" };
  }
  return null;
}
function findMatchedAnchors(anchors, touchedFiles) {
  const results = [];
  for (const anchor of anchors) {
    const m = matchAnchorAgainstTouchedFiles(anchor, touchedFiles);
    if (m) results.push(m);
  }
  return results.sort((a, b) => b.score - a.score);
}
var COMMENT_FORMATS = {
  ".ts": (m) => `// ${m}`,
  ".tsx": (m) => `// ${m}`,
  ".js": (m) => `// ${m}`,
  ".jsx": (m) => `// ${m}`,
  ".mjs": (m) => `// ${m}`,
  ".cjs": (m) => `// ${m}`,
  ".go": (m) => `// ${m}`,
  ".rs": (m) => `// ${m}`,
  ".c": (m) => `// ${m}`,
  ".cpp": (m) => `// ${m}`,
  ".h": (m) => `// ${m}`,
  ".cs": (m) => `// ${m}`,
  ".java": (m) => `// ${m}`,
  ".kt": (m) => `// ${m}`,
  ".swift": (m) => `// ${m}`,
  ".dart": (m) => `// ${m}`,
  ".py": (m) => `# ${m}`,
  ".rb": (m) => `# ${m}`,
  ".sh": (m) => `# ${m}`,
  ".bash": (m) => `# ${m}`,
  ".yaml": (m) => `# ${m}`,
  ".yml": (m) => `# ${m}`,
  ".toml": (m) => `# ${m}`,
  ".ps1": (m) => `# ${m}`,
  ".html": (m) => `<!-- ${m} -->`,
  ".xml": (m) => `<!-- ${m} -->`,
  ".svg": (m) => `<!-- ${m} -->`,
  ".vue": (m) => `<!-- ${m} -->`,
  ".svelte": (m) => `<!-- ${m} -->`,
  ".css": (m) => `/* ${m} */`,
  ".scss": (m) => `/* ${m} */`,
  ".sql": (m) => `-- ${m}`,
  ".lua": (m) => `-- ${m}`
};
function makeSafeTaskAnnotation(filePath, anchor) {
  const ext = import_node_path2.default.extname(filePath).toLowerCase();
  const fmt = COMMENT_FORMATS[ext];
  if (!fmt) return null;
  const num = anchor.id.replace(/^anc-/, "");
  return "\n\n" + fmt(`\u2316 Note #${num}: ${anchor.title}`);
}
var COMMIT_STOP_WORDS = /* @__PURE__ */ new Set([
  "fix",
  "feat",
  "chore",
  "docs",
  "test",
  "tests",
  "refactor",
  "style",
  "perf",
  "build",
  "ci",
  "bug",
  "issue",
  "update",
  "add",
  "remove",
  "todo",
  "note",
  "task",
  "the",
  "and",
  "for",
  "with",
  "\u4FEE\u590D",
  "\u4F18\u5316",
  "\u66F4\u65B0",
  "\u6DFB\u52A0",
  "\u4FEE\u6539",
  "\u5B8C\u6210",
  "\u95EE\u9898",
  "\u4EFB\u52A1",
  "\u6A21\u5757",
  "\u529F\u80FD"
]);
function matchesCommitMessage(anchor, commitMessages) {
  const idLower = anchor.id.toLowerCase();
  const numId = `#${anchor.id.replace(/^anc-/, "")}`;
  const title = anchor.title.toLowerCase();
  let titleTokens = [];
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    try {
      const seg = new Intl.Segmenter("und", { granularity: "word" });
      titleTokens = Array.from(seg.segment(title)).filter((s) => s.isWordLike).map((s) => s.segment.trim().toLowerCase()).filter((t) => t.length >= 2 && !COMMIT_STOP_WORDS.has(t));
    } catch {
      titleTokens = title.split(/[\s,._\-\/]+/).filter((t) => t.length >= 2 && !COMMIT_STOP_WORDS.has(t));
    }
  } else {
    titleTokens = title.split(/[\s,._\-\/]+/).filter((t) => t.length >= 2 && !COMMIT_STOP_WORDS.has(t));
  }
  for (const msg of commitMessages) {
    const msgLower = msg.toLowerCase();
    if (msgLower.includes(idLower) || new RegExp(`(?:^|\\s|\\()${numId}(?:\\b|\\)|$)`).test(msgLower)) {
      return { matched: true, message: msg };
    }
    if (titleTokens.length > 0) {
      const hits = titleTokens.filter((tok) => msgLower.includes(tok)).length;
      const requiredHits = titleTokens.length === 1 ? 1 : 2;
      if (hits >= requiredHits) {
        return { matched: true, message: msg };
      }
    }
  }
  return { matched: false };
}
function renderColdStartAnchorsContext(store, cwdOrNow, nowArg) {
  let cwd;
  let now = Date.now();
  if (typeof cwdOrNow === "number") now = cwdOrNow;
  else if (typeof cwdOrNow === "string") cwd = cwdOrNow;
  if (typeof nowArg === "number") now = nowArg;
  sweepQuietNotes(store, now);
  const activeNotes = store.list({ status: "active", cwd });
  if (activeNotes.length === 0) return "";
  const lines = activeNotes.map((a) => {
    const num = a.id.replace(/^anc-/, "");
    const tag = a.source === "todo-sync" ? `[Todo Checkpoint \xB7 ${a.project}]` : `[${a.project}]`;
    const files = a.files.length > 0 ? ` (${a.files.slice(0, 2).join(", ")})` : "";
    const nextStep = a.progress?.steps && a.progress.steps[a.progress.done] && a.progress.steps[a.progress.done] !== a.title ? ` \xB7 current/next: ${a.progress.steps[a.progress.done]}` : "";
    const prog = a.progress ? ` [${a.progress.done}/${a.progress.total}${nextStep}]` : "";
    const desc = a.description ? ` \u2014 ${a.description}` : "";
    return `\u2022 #${num} ${tag} ${a.title}${prog}${files}${desc}`;
  });
  return [
    `<sticky-notes count="${activeNotes.length}">`,
    `Pinned notes from previous sessions:`,
    lines.join("\n"),
    `When a note is completed, call anchor(action="settle", id="...") to tear it off.`,
    `</sticky-notes>`
  ].join("\n");
}
function sweepQuietNotes(store, now = Date.now()) {
  return store.withLock(() => {
    const state = store.loadState();
    const quieted = [];
    for (const a of state.anchors) {
      if (a.status === "active" && now - a.lastTouchedAt > QUIET_AFTER_DAYS * MS_PER_DAY) {
        a.status = "sleeping";
        a.updatedAt = now;
        quieted.push(a.id);
      }
    }
    if (quieted.length > 0) {
      state.lastSweepAt = now;
      store.saveState(state);
    }
    return { quieted };
  });
}
function getDefaultStorageDir() {
  if (process.env.ANCHOR_DIR) return import_node_path2.default.resolve(process.env.ANCHOR_DIR);
  return import_node_path2.default.join(import_node_os.default.homedir(), ".anchor");
}
function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
  }
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function acquireSyncLock(lockPath, maxWaitMs = 1500, staleTimeoutMs = 5e3) {
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < maxWaitMs) {
    attempt++;
    try {
      const fd = import_node_fs.default.openSync(lockPath, "wx");
      import_node_fs.default.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }), "utf-8");
      import_node_fs.default.closeSync(fd);
      return () => {
        try {
          if (import_node_fs.default.existsSync(lockPath)) import_node_fs.default.unlinkSync(lockPath);
        } catch {
        }
      };
    } catch (err) {
      if (err.code === "EEXIST") {
        try {
          const meta = JSON.parse(import_node_fs.default.readFileSync(lockPath, "utf-8"));
          const isStale = Date.now() - meta.createdAt > staleTimeoutMs;
          const isDead = meta.pid && !isProcessAlive(meta.pid);
          if (isStale || isDead) {
            try {
              import_node_fs.default.unlinkSync(lockPath);
              continue;
            } catch {
            }
          }
        } catch {
        }
        sleepSync(Math.min(40, Math.floor(attempt * 4 + Math.random() * 8)));
        continue;
      }
      break;
    }
  }
  return () => {
  };
}
function atomicRenameWithRetry(tempPath, targetPath, maxRetries = 5) {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      import_node_fs.default.renameSync(tempPath, targetPath);
      return;
    } catch (err) {
      lastErr = err;
      if (err.code === "EPERM" || err.code === "EACCES" || err.code === "EBUSY") {
        sleepSync(15 * (i + 1));
        continue;
      }
      break;
    }
  }
  try {
    import_node_fs.default.copyFileSync(tempPath, targetPath);
    import_node_fs.default.unlinkSync(tempPath);
  } catch {
    throw lastErr;
  }
}
var AnchorStore = class {
  storageDir;
  statePath;
  lockPath;
  archivePath;
  constructor(storageDir) {
    this.storageDir = storageDir ? import_node_path2.default.resolve(storageDir) : getDefaultStorageDir();
    this.statePath = import_node_path2.default.join(this.storageDir, "state.json");
    this.lockPath = import_node_path2.default.join(this.storageDir, "state.lock");
    this.archivePath = import_node_path2.default.join(this.storageDir, "archive.jsonl");
  }
  ensureDirs() {
    if (!import_node_fs.default.existsSync(this.storageDir)) {
      import_node_fs.default.mkdirSync(this.storageDir, { recursive: true });
    }
  }
  withLock(fn) {
    this.ensureDirs();
    const release = acquireSyncLock(this.lockPath);
    try {
      return fn();
    } finally {
      release();
    }
  }
  loadState() {
    this.ensureDirs();
    if (!import_node_fs.default.existsSync(this.statePath)) {
      return { version: 1, anchors: [], lastSweepAt: Date.now(), nextId: 1 };
    }
    try {
      const parsed = JSON.parse(import_node_fs.default.readFileSync(this.statePath, "utf-8"));
      if (!parsed || !Array.isArray(parsed.anchors)) {
        return { version: 1, anchors: [], lastSweepAt: Date.now(), nextId: 1 };
      }
      return parsed;
    } catch {
      try {
        import_node_fs.default.copyFileSync(this.statePath, import_node_path2.default.join(this.storageDir, `state.corrupt.${Date.now()}.json`));
      } catch {
      }
      return { version: 1, anchors: [], lastSweepAt: Date.now(), nextId: 1 };
    }
  }
  saveState(state) {
    this.ensureDirs();
    const tempPath = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
    import_node_fs.default.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf-8");
    atomicRenameWithRetry(tempPath, this.statePath);
  }
  generateId(state) {
    const numbers = state.anchors.map((a) => {
      const m = a.id.match(/^anc-(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    }).filter((n) => n > 0);
    const maxExisting = numbers.length > 0 ? Math.max(...numbers) : 0;
    const nextNum = Math.max(maxExisting + 1, state.nextId || 1);
    state.nextId = nextNum + 1;
    return `anc-${nextNum}`;
  }
  /**
   * Pin a new sticky note
   */
  create(input) {
    return this.withLock(() => {
      const state = this.loadState();
      const now = Date.now();
      const id = this.generateId(state);
      if (input.blockedBy && input.blockedBy.length > 0) {
        const check = validateAnchorDependencies(state.anchors, id, input.blockedBy);
        if (!check.valid) throw new Error(check.error);
      }
      const { cleanTitle, progress: parsedProgress } = extractProgressFromText(input.title);
      const explicitFiles = (input.files || []).map((f) => normalizePath(f)).filter(Boolean);
      const inferredFiles = explicitFiles.length > 0 ? explicitFiles : extractPathsFromText(`${cleanTitle} ${input.description || ""}`);
      let cwd = input.cwd ? normalizePath(input.cwd) : "";
      if (input.project && (/^[a-zA-Z]:[\\/]/.test(input.project.trim()) || input.project.trim().startsWith("/"))) {
        cwd = normalizePath(input.project.trim());
      } else if (inferredFiles.length > 0 && (/^[a-zA-Z]:\//.test(inferredFiles[0]) || inferredFiles[0].startsWith("/"))) {
        const firstDir = import_node_path2.default.dirname(inferredFiles[0]);
        if (firstDir && firstDir !== ".") cwd = normalizePath(firstDir);
      }
      const projectName = input.project ? input.project.trim() : cwd ? import_node_path2.default.basename(cwd) : "global";
      const normBlockedBy = input.blockedBy ? input.blockedBy.map((b) => {
        const c = b.trim().replace(/^#/, "");
        return /^\d+$/.test(c) ? `anc-${parseInt(c, 10)}` : c;
      }) : void 0;
      const anchor = {
        id,
        title: cleanTitle,
        description: input.description?.trim(),
        priority: input.priority || "p1",
        status: "active",
        ...input.source ? { source: input.source } : {},
        project: projectName,
        cwd,
        createdAt: now,
        updatedAt: now,
        lastTouchedAt: now,
        files: inferredFiles,
        tags: (input.tags || []).map((t) => t.trim()).filter(Boolean),
        ...input.activeForm ? { activeForm: input.activeForm.trim() } : {},
        ...normBlockedBy && normBlockedBy.length > 0 ? { blockedBy: normBlockedBy } : {},
        ...input.sessionFile ? { sessionFile: normalizePath(input.sessionFile) } : {},
        ...input.progress || parsedProgress ? { progress: input.progress || parsedProgress } : {}
      };
      state.anchors.push(anchor);
      this.saveState(state);
      return anchor;
    });
  }
  findAnchorIndex(anchors, id) {
    const clean = id.trim().replace(/^#/, "");
    return anchors.findIndex(
      (a) => a.id === clean || a.id === `anc-${clean}` || (/^\d+$/.test(clean) ? a.id === `anc-${parseInt(clean, 10)}` : false)
    );
  }
  get(id) {
    const state = this.loadState();
    const idx = this.findAnchorIndex(state.anchors, id);
    return idx === -1 ? void 0 : state.anchors[idx];
  }
  list(filter) {
    const state = this.loadState();
    const targetCwd = filter?.cwd ? normalizePath(filter.cwd) : null;
    return state.anchors.filter((a) => {
      if (filter?.status && a.status !== filter.status) return false;
      if (!filter?.all && targetCwd) {
        if (a.files.length > 0 && (a.cwd || a.project) && !isAnchorTargetingWorkspace(a, targetCwd)) {
          return false;
        }
      }
      return true;
    });
  }
  update(id, patch) {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);
      const updated = {
        ...state.anchors[idx],
        ...patch,
        updatedAt: Date.now()
      };
      if (patch.files) {
        updated.files = patch.files.map((f) => normalizePath(f)).filter(Boolean);
      }
      state.anchors[idx] = updated;
      this.saveState(state);
      return updated;
    });
  }
  touch(id, timestamp = Date.now(), sessionFile) {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);
      const current = state.anchors[idx];
      current.lastTouchedAt = timestamp;
      current.updatedAt = timestamp;
      if (current.status === "sleeping") {
        current.status = "active";
      }
      if (sessionFile) {
        current.sessionFile = normalizePath(sessionFile);
      }
      state.anchors[idx] = current;
      this.saveState(state);
      return current;
    });
  }
  /**
   * Advance (or set) progress on a sticky note:
   * - If delta is provided (default +1), increments `done` up to `total`.
   * - If note had no progress yet, initializes a 4-step bar (`1/4`).
   */
  step(id, delta = 1, explicitTotal) {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);
      const current = state.anchors[idx];
      const now = Date.now();
      const safeDelta = Number.isFinite(delta) ? delta : 1;
      const total = explicitTotal && Number.isFinite(explicitTotal) && explicitTotal >= 1 ? explicitTotal : current.progress?.total || 4;
      const prevDone = current.progress?.done || 0;
      const nextDone = Math.max(0, Math.min(total, prevDone + safeDelta));
      const existingItems = materializeSteps(current.progress);
      let updatedItems;
      if (existingItems.length > 0) {
        updatedItems = existingItems.map((item, idx2) => {
          let status = "pending";
          if (idx2 < nextDone) status = "completed";
          else if (idx2 === nextDone) status = "in_progress";
          return { ...item, status };
        });
      }
      current.progress = {
        ...current.progress || {},
        done: nextDone,
        total,
        ...updatedItems ? { items: updatedItems, steps: updatedItems.map((i) => i.subject) } : {}
      };
      current.lastTouchedAt = now;
      current.updatedAt = now;
      if (current.status === "sleeping") {
        current.status = "active";
      }
      state.anchors[idx] = current;
      this.saveState(state);
      return { anchor: current, completed: nextDone >= total };
    });
  }
  /**
   * Add a structured sub-step to an anchor (with DAG dependency validation)
   */
  addStep(id, subject, options = {}) {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);
      const current = state.anchors[idx];
      const items = materializeSteps(current.progress);
      const nextStepId = items.length > 0 ? Math.max(...items.map((s) => s.id)) + 1 : 1;
      if (options.blockedBy && options.blockedBy.length > 0) {
        const check = validateStepDependencies(items, nextStepId, options.blockedBy);
        if (!check.valid) throw new Error(check.error);
      }
      const newStep = {
        id: nextStepId,
        subject: subject.trim(),
        status: options.status || (items.some((s) => s.status === "in_progress") ? "pending" : "in_progress"),
        ...options.activeForm ? { activeForm: options.activeForm.trim() } : {},
        ...options.blockedBy && options.blockedBy.length > 0 ? { blockedBy: [...options.blockedBy] } : {}
      };
      const nextItems = [...items, newStep];
      current.progress = syncProgressFromItems(nextItems, current.progress);
      current.updatedAt = Date.now();
      current.lastTouchedAt = Date.now();
      state.anchors[idx] = current;
      this.saveState(state);
      return current;
    });
  }
  /**
   * Update a specific sub-step within an anchor (status, subject, activeForm, or blockedBy DAG edges)
   */
  updateStep(id, stepId, patch) {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);
      const current = state.anchors[idx];
      const items = materializeSteps(current.progress);
      const stepIdx = items.findIndex((s) => s.id === stepId);
      if (stepIdx === -1) throw new Error(`Step #${stepId} not found in #${current.id}`);
      if (patch.addBlockedBy && patch.addBlockedBy.length > 0) {
        const check = validateStepDependencies(items, stepId, patch.addBlockedBy);
        if (!check.valid) throw new Error(check.error);
      }
      const target = { ...items[stepIdx] };
      if (patch.status) target.status = patch.status;
      if (patch.subject) target.subject = patch.subject.trim();
      if (patch.activeForm !== void 0) {
        if (patch.activeForm) target.activeForm = patch.activeForm.trim();
        else delete target.activeForm;
      }
      if (patch.addBlockedBy || patch.removeBlockedBy) {
        const set = new Set(target.blockedBy ?? []);
        for (const addId of patch.addBlockedBy ?? []) set.add(addId);
        for (const rmId of patch.removeBlockedBy ?? []) set.delete(rmId);
        if (set.size > 0) target.blockedBy = [...set];
        else delete target.blockedBy;
      }
      items[stepIdx] = target;
      current.progress = syncProgressFromItems(items, current.progress);
      current.updatedAt = Date.now();
      current.lastTouchedAt = Date.now();
      state.anchors[idx] = current;
      this.saveState(state);
      return current;
    });
  }
  /**
   * Read recent settled/archived notes from `archive.jsonl` (newest first)
   */
  listArchive(limit = 20) {
    if (!import_node_fs.default.existsSync(this.archivePath)) return [];
    try {
      const lines = import_node_fs.default.readFileSync(this.archivePath, "utf-8").split(/\r?\n/).filter(Boolean);
      const parsed = [];
      for (let i = lines.length - 1; i >= 0 && parsed.length < limit; i--) {
        try {
          const item = JSON.parse(lines[i]);
          if (item && typeof item.id === "string" && typeof item.title === "string") {
            parsed.push(item);
          }
        } catch {
        }
      }
      return parsed;
    } catch {
      return [];
    }
  }
  /**
   * Clever Touch 4 (Todo-Bridge): Automatically mirror intra-session `todo` tool lists
   * into a cross-session checkpoint!
   * - While tasks are in_progress/pending: updates the live `[■■□□ done/total]` checkpoint on disk;
   * - When all tasks in the todo list reach `completed`: automatically tears off the checkpoint!
   */
  syncFromTodoTool(tasks, options = {}) {
    if (!Array.isArray(tasks)) return { status: "noop" };
    const visible = tasks.filter((t) => t && typeof t.subject === "string" && t.status !== "deleted");
    const normCwd = options.cwd ? normalizePath(options.cwd) : "";
    const normSession = options.sessionFile ? normalizePath(options.sessionFile) : void 0;
    return this.withLock(() => {
      const state = this.loadState();
      const existingIdx = state.anchors.findIndex(
        (a) => a.source === "todo-sync" && (normSession && a.sessionFile === normSession || normCwd && isSameOrSubPath(a.cwd, normCwd))
      );
      const completedTasks = visible.filter((t) => t.status === "completed");
      const unfinishedTasks = visible.filter((t) => t.status !== "completed");
      if (visible.length === 0 || unfinishedTasks.length === 0) {
        if (existingIdx !== -1) {
          const [settled] = state.anchors.splice(existingIdx, 1);
          settled.status = "settled";
          settled.updatedAt = Date.now();
          settled.evidence = {
            settledAt: Date.now(),
            settledBy: "todo-complete",
            summary: `All ${completedTasks.length} session todo(s) completed`
          };
          this.ensureDirs();
          import_node_fs.default.appendFileSync(this.archivePath, JSON.stringify(settled) + "\n", "utf-8");
          this.saveState(state);
          return { status: "completed", anchor: settled };
        }
        return { status: "noop" };
      }
      const inProgress = unfinishedTasks.find((t) => t.status === "in_progress") || unfinishedTasks[0];
      const structuredItems = convertTodoTasksToSteps(visible);
      const orderedSteps = [
        ...completedTasks.map((t) => t.subject.trim()),
        ...unfinishedTasks.filter((t) => t.status === "in_progress").map((t) => t.subject.trim()),
        ...unfinishedTasks.filter((t) => t.status === "pending").map((t) => t.subject.trim())
      ];
      const progress = {
        done: completedTasks.length,
        total: visible.length,
        steps: orderedSteps,
        items: structuredItems
      };
      const remainingSummary = unfinishedTasks.slice(0, 3).map((t) => t.subject.trim()).join(" \u2192 ");
      const headline = inProgress.subject.trim();
      const now = Date.now();
      if (existingIdx !== -1) {
        const current = state.anchors[existingIdx];
        current.title = headline;
        current.description = `Remaining (${unfinishedTasks.length}/${visible.length}): ${remainingSummary}`;
        current.progress = progress;
        current.status = "active";
        current.updatedAt = now;
        current.lastTouchedAt = now;
        if (normSession) current.sessionFile = normSession;
        if (options.recentFiles && options.recentFiles.length > 0) {
          const merged = Array.from(/* @__PURE__ */ new Set([...options.recentFiles.map((f) => normalizePath(f)), ...current.files])).slice(0, 5);
          current.files = merged;
        }
        state.anchors[existingIdx] = current;
        this.saveState(state);
        return { status: "synced", anchor: current };
      }
      const id = this.generateId(state);
      const inferredFiles = options.recentFiles && options.recentFiles.length > 0 ? options.recentFiles.map((f) => normalizePath(f)).filter(Boolean) : extractPathsFromText(orderedSteps.join(" "));
      const projectName = normCwd ? import_node_path2.default.basename(normCwd) : "global";
      const created = {
        id,
        title: headline,
        description: `Remaining (${unfinishedTasks.length}/${visible.length}): ${remainingSummary}`,
        priority: "p1",
        status: "active",
        source: "todo-sync",
        project: projectName,
        cwd: normCwd,
        createdAt: now,
        updatedAt: now,
        lastTouchedAt: now,
        files: inferredFiles,
        tags: ["todo-sync"],
        ...normSession ? { sessionFile: normSession } : {},
        progress
      };
      state.anchors.push(created);
      this.saveState(state);
      return { status: "synced", anchor: created };
    });
  }
  /**
   * Tear off (settle) a completed sticky note and archive it to archive.jsonl
   */
  settle(id, evidence = {}, now = Date.now()) {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);
      const [settled] = state.anchors.splice(idx, 1);
      settled.status = "settled";
      settled.updatedAt = now;
      settled.evidence = {
        ...evidence,
        settledAt: now,
        settledBy: evidence.settledBy || "manual"
      };
      this.ensureDirs();
      import_node_fs.default.appendFileSync(this.archivePath, JSON.stringify(settled) + "\n", "utf-8");
      this.saveState(state);
      return settled;
    });
  }
  /**
   * Put back (undo) the last torn-off sticky note
   */
  undoSettle() {
    return this.withLock(() => {
      if (!import_node_fs.default.existsSync(this.archivePath)) {
        throw new Error("No archived notes to restore");
      }
      const raw = import_node_fs.default.readFileSync(this.archivePath, "utf-8");
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      let anchor = null;
      while (lines.length > 0 && !anchor) {
        const candidate = lines.pop();
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed.id === "string" && typeof parsed.title === "string") {
            anchor = parsed;
          }
        } catch {
        }
      }
      if (!anchor) throw new Error("Archive is empty, nothing to undo");
      import_node_fs.default.writeFileSync(this.archivePath, lines.length > 0 ? lines.join("\n") + "\n" : "", "utf-8");
      anchor.status = "active";
      anchor.updatedAt = Date.now();
      anchor.lastTouchedAt = Date.now();
      delete anchor.evidence;
      const state = this.loadState();
      const existingIdx = state.anchors.findIndex((a) => a.id === anchor.id);
      if (existingIdx !== -1) {
        if (state.anchors[existingIdx].title === anchor.title) {
          state.anchors[existingIdx] = anchor;
        } else {
          anchor.id = this.generateId(state);
          state.anchors.push(anchor);
        }
      } else {
        const m = anchor.id.match(/^anc-(\d+)$/);
        if (m) state.nextId = Math.max(state.nextId || 1, parseInt(m[1], 10) + 1);
        state.anchors.push(anchor);
      }
      this.saveState(state);
      return anchor;
    });
  }
};

// src/dock.ts
var STATUS_GLYPH = {
  pending: "\u25CB",
  in_progress: "\u25D0",
  completed: "\u2713",
  deleted: "\u2717"
};
function formatStepGlyph(status, fg) {
  switch (status) {
    case "pending":
      return fg("dim", "\u25CB");
    case "in_progress":
      return fg("warning", "\u25D0");
    case "completed":
      return fg("success", "\u2713");
    case "deleted":
      return fg("error", "\u2717");
  }
}
function applyStrikethrough(text, theme) {
  if (theme && typeof theme.strikethrough === "function") {
    return theme.strikethrough(text);
  }
  return `\x1B[9m${text}\x1B[29m`;
}
function formatDockStepRow(step, options) {
  const { fg, theme, showId = true, fallbackActiveForm } = options;
  const glyph = formatStepGlyph(step.status, fg);
  const subjectColor = step.status === "in_progress" ? "accent" : step.status === "completed" || step.status === "deleted" ? "muted" : "text";
  let subject = fg(subjectColor, step.subject);
  if (step.status === "completed" || step.status === "deleted") {
    subject = applyStrikethrough(subject, theme);
  }
  let row = glyph;
  if (showId) {
    row += ` ${fg("dim", `${step.id}.`)}`;
  }
  row += ` ${subject}`;
  const activeForm = step.status === "in_progress" ? step.activeForm || fallbackActiveForm : void 0;
  if (activeForm) {
    row += ` ${fg("muted", `(${activeForm})`)}`;
  }
  if (step.blockedBy && step.blockedBy.length > 0) {
    row += ` ${fg("muted", `\u26D3 #${step.blockedBy.join(",#")}`)}`;
  }
  return row;
}
var AnchorDockController = class {
  collapsed = false;
  pendingHideByAnchor = /* @__PURE__ */ new Map();
  hiddenByAnchor = /* @__PURE__ */ new Map();
  isCollapsed() {
    return this.collapsed;
  }
  setCollapsed(val) {
    this.collapsed = val;
  }
  toggleCollapsed() {
    this.collapsed = !this.collapsed;
    return this.collapsed;
  }
  resetGraceState(anchorId) {
    if (anchorId) {
      this.pendingHideByAnchor.delete(anchorId);
      this.hiddenByAnchor.delete(anchorId);
    } else {
      this.pendingHideByAnchor.clear();
      this.hiddenByAnchor.clear();
    }
  }
  /**
   * Called on `agent_start`: folds away completed steps that were shown with `✓` strikethrough
   * during the previous turn so the dock stays compact while coding.
   */
  foldCompletedStepsFromPreviousTurn() {
    let changed = false;
    for (const [anchorId, pendingSet] of this.pendingHideByAnchor.entries()) {
      if (pendingSet.size === 0) continue;
      let hiddenSet = this.hiddenByAnchor.get(anchorId);
      if (!hiddenSet) {
        hiddenSet = /* @__PURE__ */ new Set();
        this.hiddenByAnchor.set(anchorId, hiddenSet);
      }
      for (const id of pendingSet) {
        hiddenSet.add(id);
        changed = true;
      }
      pendingSet.clear();
    }
    return changed;
  }
  /**
   * Render the `belowEditor` widget lines for active anchors.
   * - If `collapsed === true` OR no anchor has multi-step items, renders the 1-line Sticky Strip.
   * - If `collapsed === false` AND the primary anchor has structured steps (`total >= 2`),
   *   renders the multi-row Tree Dock (up to `maxStepRows = 4` step rows + optional side note summary).
   */
  renderDockLines(activeAnchors, options) {
    const { width, cwd, theme, maxStepRows = 4 } = options;
    if (activeAnchors.length === 0) return [];
    const sorted = sortAnchorsForDisplay([...activeAnchors], cwd);
    const fg = theme?.fg ? theme.fg.bind(theme) : (_c, text) => text;
    const primary = sorted[0];
    const steps = materializeSteps(primary.progress);
    if (this.collapsed || width < 60 || steps.length < 2) {
      return this.renderSingleLineStrip(sorted, width, fg);
    }
    const completedIds = new Set(steps.filter((s) => s.status === "completed").map((s) => s.id));
    const pendingSet = this.pendingHideByAnchor.get(primary.id) ?? /* @__PURE__ */ new Set();
    const hiddenSet = this.hiddenByAnchor.get(primary.id) ?? /* @__PURE__ */ new Set();
    for (const id of [...pendingSet]) {
      if (!completedIds.has(id)) pendingSet.delete(id);
    }
    for (const id of [...hiddenSet]) {
      if (!completedIds.has(id)) hiddenSet.delete(id);
    }
    this.pendingHideByAnchor.set(primary.id, pendingSet);
    this.hiddenByAnchor.set(primary.id, hiddenSet);
    const layout = selectDockStepLayout(steps, maxStepRows, hiddenSet);
    for (const s of layout.visible) {
      if (s.status === "completed" && !pendingSet.has(s.id) && !hiddenSet.has(s.id)) {
        pendingSet.add(s.id);
      }
    }
    if (layout.visible.length === 0) {
      return this.renderSingleLineStrip(sorted, width, fg);
    }
    const num = primary.id.replace(/^anc-/, "");
    const bar = primary.progress ? `${fg("accent", formatProgressBar(primary.progress))} ` : "";
    const origin = formatOrigin(primary);
    const sessionIcon = primary.sessionFile ? " \u21AA" : "";
    const blockedTag = primary.blockedBy && primary.blockedBy.length > 0 ? ` ${fg("muted", `\u26D3 #${primary.blockedBy.map((b) => b.replace(/^anc-/, "")).join(",#")}`)}` : "";
    const foldHint = width >= 76 ? fg("dim", "  [Alt+A fold]") : "";
    const headerPrefix = `${fg("accent", "\u2316")} ${fg("dim", `#${num}`)} ${bar}`;
    const headerSuffix = `${blockedTag} ${fg("muted", `(${origin}${sessionIcon})`)}${foldHint}`;
    const titleBudget = Math.max(12, width - getDisplayWidth(headerPrefix) - getDisplayWidth(headerSuffix) - 2);
    const headerLine = truncateToWidth(
      `${headerPrefix}${truncateToWidth(primary.title, titleBudget)}${headerSuffix}`,
      width
    );
    const lines = [headerLine];
    const otherNotes = sorted.slice(1);
    const hasFooterRow = layout.hiddenCompleted > 0 || layout.truncatedTail > 0 || otherNotes.length > 0;
    for (let i = 0; i < layout.visible.length; i++) {
      const step = layout.visible[i];
      const isLastRow = i === layout.visible.length - 1 && !hasFooterRow;
      const branch = fg("dim", isLastRow ? "\u2514\u2500 " : "\u251C\u2500 ");
      const stepText = formatDockStepRow(step, {
        fg,
        theme,
        showId: true,
        fallbackActiveForm: primary.activeForm
      });
      lines.push(truncateToWidth(`${branch}${stepText}`, width));
    }
    if (hasFooterRow) {
      const parts = [];
      if (layout.hiddenCompleted > 0 || layout.truncatedTail > 0) {
        const overflowDetails = [];
        if (layout.hiddenCompleted > 0) overflowDetails.push(`${layout.hiddenCompleted} done`);
        if (layout.truncatedTail > 0) overflowDetails.push(`${layout.truncatedTail} pending`);
        parts.push(fg("dim", `+${layout.hiddenCompleted + layout.truncatedTail} steps (${overflowDetails.join(", ")})`));
      }
      if (otherNotes.length > 0) {
        const preview = otherNotes.slice(0, 2).map((a) => `#${a.id.replace(/^anc-/, "")} ${truncateToWidth(a.title, 20)}`).join(" \xB7 ");
        const extra = otherNotes.length > 2 ? ` +${otherNotes.length - 2}` : "";
        parts.push(fg("muted", `\u{1F4CC} ${preview}${extra}`));
      }
      lines.push(truncateToWidth(`${fg("dim", "\u2514\u2500 ")}${parts.join(fg("dim", "  \u2502  "))}`, width));
    }
    return lines;
  }
  renderSingleLineStrip(sorted, width, fg) {
    if (sorted.length === 1) {
      const a = sorted[0];
      const num = a.id.replace(/^anc-/, "");
      const bar = a.progress ? `${fg("accent", formatProgressBar(a.progress))} ` : "";
      const candidateStep = a.progress?.steps ? a.progress.steps[a.progress.done] !== a.title ? a.progress.steps[a.progress.done] : a.progress.steps[a.progress.done + 1] : void 0;
      const nextStep = candidateStep ? fg("muted", ` \u25B8 ${candidateStep}`) : "";
      const activeHint = a.activeForm ? fg("muted", ` (${a.activeForm})`) : "";
      const origin = formatOrigin(a);
      const sessionIcon = a.sessionFile ? " \u21AA" : "";
      const prefix = `${fg("accent", "\u2316")} ${fg("dim", `#${num}`)} ${bar}`;
      const suffix = `${activeHint} ${fg("muted", `(${origin}${sessionIcon})`)}`;
      const availTitle = Math.max(
        12,
        width - getDisplayWidth(prefix) - getDisplayWidth(nextStep) - getDisplayWidth(suffix) - 2
      );
      const titleClipped = truncateToWidth(a.title, availTitle);
      return [truncateToWidth(`${prefix}${titleClipped}${nextStep}${suffix}`, width)];
    }
    const maxItems = width < 68 ? 1 : width < 100 ? 2 : 3;
    const visibleSlice = sorted.slice(0, maxItems);
    const countTag = fg("accent", `\u2316 ${sorted.length}: `);
    const moreCount = sorted.length - visibleSlice.length;
    const moreSuffix = moreCount > 0 ? fg("dim", ` +${moreCount}`) : "";
    const perSlotWidth = Math.max(
      10,
      Math.floor((width - getDisplayWidth(countTag) - getDisplayWidth(moreSuffix) - (visibleSlice.length - 1) * 5) / visibleSlice.length)
    );
    const segments = visibleSlice.map((a) => {
      const num = a.id.replace(/^anc-/, "");
      const bar = a.progress ? `${formatProgressBar(a.progress)} ` : "";
      const prefix = `#${num} ${bar}`;
      const titleBudget = Math.max(6, perSlotWidth - getDisplayWidth(prefix));
      const shortTitle = truncateToWidth(a.title, titleBudget);
      return `${fg("dim", `#${num}`)} ${bar}${shortTitle}`;
    });
    return [truncateToWidth(`${countTag}${segments.join(fg("dim", " \xB7 "))}${moreSuffix}`, width)];
  }
};
var defaultDockController = new AnchorDockController();

// src/tui.ts
var import_node_fs2 = __toESM(require("fs"), 1);
var import_node_path3 = __toESM(require("path"), 1);
var ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
function stripAnsi(str) {
  return str.replace(ANSI_REGEX, "");
}
function getDisplayWidth(str) {
  const clean = stripAnsi(str);
  let width = 0;
  for (const char of clean) {
    const code = char.codePointAt(0) || 0;
    if (code === 8205 || code === 65039 || code === 65038 || code >= 768 && code <= 879 || code >= 8203 && code <= 8207) {
      continue;
    }
    if (code >= 19968 && code <= 40959 || code >= 13312 && code <= 19903 || code >= 131072 && code <= 173791 || code >= 173824 && code <= 177983 || code >= 65281 && code <= 65376 || code >= 12288 && code <= 12351 || code >= 44032 && code <= 55215 || code >= 4352 && code <= 4607 || code >= 12592 && code <= 12687 || code >= 12352 && code <= 12447 || code >= 12448 && code <= 12543 || code >= 127744 && code <= 129535 || code >= 128512 && code <= 128591 || code >= 128640 && code <= 128767 || code >= 9728 && code <= 10175 || code >= 129648 && code <= 129791) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}
function hasActiveUI(ctx) {
  if (!ctx) return false;
  try {
    return Boolean(ctx.hasUI && ctx.ui);
  } catch {
    return false;
  }
}
function truncateToWidth(str, maxWidth, ellipsis = "\u2026") {
  if (maxWidth <= 0) return "";
  const singleLine = str.replace(/[\r\n\t]+/g, " ");
  const totalWidth = getDisplayWidth(singleLine);
  if (totalWidth <= maxWidth) return singleLine;
  const ellipsisWidth = getDisplayWidth(ellipsis);
  const target = Math.max(0, maxWidth - ellipsisWidth);
  if (target === 0) return ellipsis.slice(0, maxWidth);
  let accumulated = "";
  let accumWidth = 0;
  let i = 0;
  while (i < singleLine.length) {
    ANSI_REGEX.lastIndex = i;
    const match = ANSI_REGEX.exec(singleLine);
    if (match && match.index === i) {
      accumulated += match[0];
      i += match[0].length;
      continue;
    }
    const codePoint = singleLine.codePointAt(i) || 0;
    const charLen = codePoint > 65535 ? 2 : 1;
    const fullChar = singleLine.slice(i, i + charLen);
    const charWidth = getDisplayWidth(fullChar);
    if (accumWidth + charWidth > target) break;
    accumulated += fullChar;
    accumWidth += charWidth;
    i += charLen;
  }
  accumulated = accumulated.replace(/\s*(?!\x1b\[)(?<!\x1b)[\(\[\{（【](?:(?!\x1b\[)[^)\]}）】])*$/, "");
  return accumulated + ellipsis + (singleLine.includes("\x1B") ? "\x1B[0m" : "");
}
function padToWidth(str, targetWidth) {
  const truncated = truncateToWidth(str, targetWidth);
  const current = getDisplayWidth(truncated);
  if (current >= targetWidth) return truncated;
  return truncated + " ".repeat(targetWidth - current);
}
function formatProgressBar(progress, cells = 4) {
  if (!progress || !progress.total || progress.total < 1) return "";
  const done = Math.max(0, Math.min(progress.total, progress.done || 0));
  const filled = Math.min(cells, Math.max(done > 0 ? 1 : 0, Math.round(done / progress.total * cells)));
  const finalFilled = done >= progress.total ? cells : done === 0 ? 0 : filled;
  const bar = "\u25A0".repeat(finalFilled) + "\u25A1".repeat(Math.max(0, cells - finalFilled));
  return `[${bar} ${done}/${progress.total}]`;
}
function formatRelativeAge(timestamp, now = Date.now()) {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1e3));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
function formatOrigin(anchor) {
  if (typeof anchor === "string") {
    if (!anchor) return "global";
    return import_node_path3.default.basename(anchor.replace(/\\/g, "/")) || "global";
  }
  let proj = "global";
  if (anchor.project && anchor.project !== "global") {
    const normProj = anchor.project.replace(/\\/g, "/").replace(/\/+$/, "");
    if (normProj.includes("/")) {
      const parts = normProj.split("/").filter(Boolean);
      proj = parts.slice(-2).join("/");
    } else {
      proj = normProj;
    }
  } else if (anchor.cwd) {
    proj = import_node_path3.default.basename(anchor.cwd.replace(/\\/g, "/")) || "global";
  }
  if (anchor.files && anchor.files.length > 0) {
    const shortFile = import_node_path3.default.basename(anchor.files[0].replace(/\\/g, "/"));
    if (shortFile && !proj.endsWith(shortFile)) {
      return `${proj} \xB7 ${shortFile}`;
    }
  }
  return proj;
}
function sortAnchorsForDisplay(anchors, cwd) {
  return [...anchors].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "active" ? -1 : 1;
    }
    if (cwd) {
      const aMatch = isAnchorTargetingWorkspace(a, cwd) ? 0 : 1;
      const bMatch = isAnchorTargetingWorkspace(b, cwd) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }
    return b.lastTouchedAt - a.lastTouchedAt;
  });
}
function updateAnchorStatusBar(ctx, store) {
  if (!hasActiveUI(ctx)) return;
  try {
    const active = store.list({ status: "active", cwd: ctx.cwd });
    ctx.ui.setStatus("anchor", active.length > 0 ? `\u2316 ${active.length}` : void 0);
    updateStartupBanner(ctx, store);
  } catch {
  }
}
function updateStartupBanner(ctx, store) {
  if (!hasActiveUI(ctx)) return;
  try {
    const active = store.list({ status: "active", cwd: ctx.cwd });
    if (active.length === 0) {
      ctx.ui.setWidget("anchor-startup", void 0, { placement: "belowEditor" });
      return;
    }
    const factory = (_tui, theme) => ({
      render: (width) => defaultDockController.renderDockLines(active, {
        width,
        cwd: ctx.cwd,
        theme: ctx.ui?.theme ?? theme
      }),
      invalidate: () => {
      }
    });
    const content = ctx.ui?.theme ? factory : factory().render(80);
    ctx.ui.setWidget("anchor-startup", content, { placement: "belowEditor" });
  } catch {
  }
}
async function openAnchorDashboard(ctx, store) {
  if (!hasActiveUI(ctx)) return;
  const allNotes = store.list({ cwd: ctx.cwd, all: true }).filter((a) => a.status === "active" || a.status === "sleeping");
  if (allNotes.length === 0) {
    ctx.ui.notify("\u2316 No sticky notes. Type `pin: <note>` or `/pin <note>` to stick one.", "info");
    return;
  }
  const sorted = sortAnchorsForDisplay(allNotes, ctx.cwd);
  const optionMap = /* @__PURE__ */ new Map();
  const displayOptions = [];
  const termCols = process.stdout?.columns || 96;
  const isNarrow = termCols < 84;
  const titleWidth = isNarrow ? Math.max(20, termCols - 30) : 42;
  for (const a of sorted) {
    const num = a.id.replace(/^anc-/, "").padStart(2, "0");
    const bar = a.progress ? `${formatProgressBar(a.progress)} ` : "";
    const origin = formatOrigin(a) + (a.sessionFile ? " \u21AA" : "");
    const age = a.status === "sleeping" ? `${formatRelativeAge(a.createdAt)} \xB7 quiet` : formatRelativeAge(a.createdAt);
    const colNum = `${num}  `;
    const colTitle = padToWidth(`${bar}${a.title}`, titleWidth);
    const colOrigin = padToWidth(origin, 22);
    const label = isNarrow ? `${colNum}${colTitle}  ${age}`.trimEnd() : `${colNum}${colTitle}  ${colOrigin}  ${age}`.trimEnd();
    optionMap.set(label, a);
    displayOptions.push(label);
  }
  const selected = await ctx.ui.select("\u2316 Notes (select a note):", displayOptions);
  if (!selected) return;
  const anchor = optionMap.get(selected);
  if (!anchor) return;
  const currentSessionFile = ctx.sessionManager?.getSessionFile?.();
  const canJumpSession = Boolean(
    anchor.sessionFile && import_node_fs2.default.existsSync(anchor.sessionFile) && typeof ctx.switchSession === "function" && (!currentSessionFile || !isSameOrSubPath(anchor.sessionFile, currentSessionFile))
  );
  const stepLabel = anchor.progress ? `\u25B6 Advance step (${anchor.progress.done}/${anchor.progress.total} \u2794 ${Math.min(anchor.progress.total, anchor.progress.done + 1)}/${anchor.progress.total})` : "\u25B6 Start progress bar (1/4)";
  const structuredSteps = materializeSteps(anchor.progress);
  const stepOptions = structuredSteps.map((s) => {
    const g = STATUS_GLYPH[s.status] || "\u25CB";
    const nextAction = s.status === "completed" ? "reopen" : "complete";
    return `${g} Step ${s.id}: ${s.subject} (${nextAction})`;
  });
  const actions = [
    "\u2713 Done (tear off note)",
    stepLabel,
    ...stepOptions,
    ...canJumpSession ? ["\u21AA Jump to session (resume linked conversation)"] : [],
    ...anchor.status === "sleeping" ? ["\u26A1 Wake up (mark active)"] : [],
    "\u2139 Read full note",
    "\u21A9 Back"
  ];
  const action = await ctx.ui.select(`\u2316 #${anchor.id.replace(/^anc-/, "")}: "${anchor.title}"`, actions);
  if (!action || action.startsWith("\u21A9")) return;
  if (action.startsWith("\u2713 Done")) {
    store.settle(anchor.id, { settledBy: "manual" });
    ctx.ui.notify(`\u2316 Torn off #${anchor.id.replace(/^anc-/, "")}: "${anchor.title}" (/anchor undo to put back)`, "info");
    updateAnchorStatusBar(ctx, store);
  } else if (action.startsWith("\u25B6")) {
    const { anchor: updated, completed } = store.step(anchor.id, 1);
    updateAnchorStatusBar(ctx, store);
    if (completed) {
      ctx.ui.notify(
        `\u2316 #${updated.id.replace(/^anc-/, "")} reached ${formatProgressBar(updated.progress)}! Run /done ${updated.id.replace(/^anc-/, "")} to tear off.`,
        "info"
      );
    } else {
      ctx.ui.notify(`\u2316 Advanced #${updated.id.replace(/^anc-/, "")} to ${formatProgressBar(updated.progress)}`, "info");
    }
  } else if (/^[○◐✓✗]\s+Step\s+(\d+):/.test(action)) {
    const m = action.match(/Step\s+(\d+):/);
    if (m) {
      const stepId = parseInt(m[1], 10);
      const targetStep = structuredSteps.find((s) => s.id === stepId);
      if (targetStep) {
        const nextStatus = targetStep.status === "completed" ? "pending" : "completed";
        const updated = store.updateStep(anchor.id, stepId, { status: nextStatus });
        ctx.ui.notify(
          `\u2316 Step ${stepId} ${nextStatus === "completed" ? "completed \u2713" : "reopened \u25CB"} (${formatProgressBar(updated.progress)})`,
          "info"
        );
        updateAnchorStatusBar(ctx, store);
      }
    }
  } else if (action.startsWith("\u21AA") && anchor.sessionFile) {
    try {
      await ctx.switchSession(anchor.sessionFile);
    } catch (err) {
      ctx.ui.notify(`Could not switch session: ${err.message}`, "error");
    }
  } else if (action.startsWith("\u26A1")) {
    store.touch(anchor.id);
    ctx.ui.notify(`\u2316 Woke up #${anchor.id.replace(/^anc-/, "")}: "${anchor.title}"`, "info");
    updateAnchorStatusBar(ctx, store);
  } else if (action.startsWith("\u2139")) {
    const details = [
      `\u2316 Note #${anchor.id.replace(/^anc-/, "")}: ${anchor.title}`,
      anchor.progress ? `Progress: ${formatProgressBar(anchor.progress)}${anchor.progress.steps ? ` (${anchor.progress.steps.join(" \u2192 ")})` : ""}` : null,
      anchor.description ? `Details: ${anchor.description}` : null,
      anchor.files.length > 0 ? `Files: ${anchor.files.join(", ")}` : null,
      anchor.sessionFile ? `Session: ${import_node_path3.default.basename(anchor.sessionFile)}` : null,
      `Workspace: ${anchor.project || "global"} \xB7 Pinned ${formatRelativeAge(anchor.createdAt)}`
    ].filter(Boolean).join("\n");
    ctx.ui.notify(details, "info");
  }
}

// src/extension.ts
var MUTATION_TOOLS = /* @__PURE__ */ new Set(["edit", "write", "patch", "apply_diff", "create_file", "modify"]);
function parseAnchorCommandInput(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed || trimmed === "list" || trimmed === "ls") {
    return { mode: "dashboard" };
  }
  if (trimmed === "now" || trimmed === "what" || trimmed === "status" || trimmed === "hey") {
    return { mode: "now" };
  }
  if (trimmed === "undo") {
    return { mode: "undo" };
  }
  if (trimmed === "fold" || trimmed === "compact" || trimmed === "toggle" || trimmed === "expand") {
    return { mode: "fold" };
  }
  const settleMatch = trimmed.match(/^(?:done|rm|close|settle)\s+(.+)$/i);
  if (settleMatch) {
    return {
      mode: "settle",
      targetId: settleMatch[1].trim().replace(/^#/, "")
    };
  }
  const stepMatch = trimmed.match(/^(?:step|\+)\s*(\S+)(?:\s+([+-]?\d+))?$/i);
  if (stepMatch) {
    return {
      mode: "step",
      targetId: stepMatch[1].trim().replace(/^#/, ""),
      delta: stepMatch[2] ? parseInt(stepMatch[2], 10) : 1
    };
  }
  const jumpMatch = trimmed.match(/^(?:jump|resume|session)\s+(.+)$/i);
  if (jumpMatch) {
    return {
      mode: "jump",
      targetId: jumpMatch[1].trim().replace(/^#/, "")
    };
  }
  return {
    mode: "pin",
    title: trimmed
  };
}
function parseQuickNoteInput(text) {
  const m = (text || "").trim().match(/^(?:pin|note|便签|备忘)\s*[:：]\s*(.*)$/i);
  if (!m) return null;
  return m[1].trim();
}
function resolveAnchorTarget(store, idOrIndex, cwd) {
  const clean = idOrIndex.trim().replace(/^#/, "");
  const direct = store.get(clean);
  if (direct) return direct.id;
  if (/^\d+$/.test(clean)) {
    const seqIndex = parseInt(clean, 10);
    const visible = store.list({ cwd, all: true }).filter((a) => a.status === "active" || a.status === "sleeping");
    const sorted = sortAnchorsForDisplay(visible, cwd);
    if (seqIndex >= 1 && seqIndex <= sorted.length) {
      return sorted[seqIndex - 1].id;
    }
  }
  return void 0;
}
function getSessionFileSafe(ctx) {
  try {
    const file = ctx?.sessionManager?.getSessionFile?.();
    return typeof file === "string" && file.trim() ? file.trim() : void 0;
  } catch {
    return void 0;
  }
}
function extension_default(pi) {
  const store = new AnchorStore();
  const annotatedThisSession = /* @__PURE__ */ new Set();
  const recentSessionFiles = [];
  function rememberTouchedFile(filePath, cwd) {
    const norm = normalizePath(filePath, cwd);
    if (!norm) return;
    const idx = recentSessionFiles.indexOf(norm);
    if (idx !== -1) recentSessionFiles.splice(idx, 1);
    recentSessionFiles.unshift(norm);
    if (recentSessionFiles.length > 5) recentSessionFiles.pop();
  }
  function createStickyNoteFromUser(title, ctx) {
    const sessionFile = getSessionFileSafe(ctx);
    const anc = store.create({
      title,
      cwd: ctx.cwd,
      sessionFile
    });
    if (anc.files.length === 0 && recentSessionFiles.length > 0) {
      store.update(anc.id, { files: [recentSessionFiles[0]] });
    }
    updateAnchorStatusBar(ctx, store);
    return store.get(anc.id) || anc;
  }
  pi.on("session_start", async (_event, ctx) => {
    annotatedThisSession.clear();
    recentSessionFiles.length = 0;
    defaultDockController.resetGraceState();
    sweepQuietNotes(store);
    const quietForHere = store.list({ status: "sleeping", all: true }).filter((a) => (a.files.length > 0 || a.project && a.project !== "global" || a.cwd) && isAnchorTargetingWorkspace(a, ctx.cwd));
    for (const q of quietForHere) {
      store.touch(q.id);
    }
    try {
      const branch = ctx.sessionManager?.getBranch?.();
      const tasks = replayTodoSnapshotFromBranch(branch);
      if (tasks) {
        store.syncFromTodoTool(tasks, {
          cwd: ctx.cwd,
          sessionFile: getSessionFileSafe(ctx)
        });
      }
    } catch {
    }
    updateAnchorStatusBar(ctx, store);
  });
  pi.on("agent_start", async (_event, ctx) => {
    if (defaultDockController.foldCompletedStepsFromPreviousTurn()) {
      updateStartupBanner(ctx, store);
    }
  });
  if (typeof pi.registerShortcut === "function") {
    try {
      pi.registerShortcut("alt+a", {
        description: "Collapse or expand the Anchor belowEditor task dock",
        handler: (ctx) => {
          defaultDockController.toggleCollapsed();
          updateStartupBanner(ctx, store);
        }
      });
    } catch {
    }
  }
  pi.on("input", async (event, ctx) => {
    if (event?.source === "extension") return { action: "continue" };
    const quickNote = parseQuickNoteInput(String(event?.text || ""));
    if (quickNote === null) return { action: "continue" };
    if (!quickNote) {
      if (hasActiveUI(ctx)) {
        await openAnchorDashboard(ctx, store);
      }
      return { action: "handled" };
    }
    const anc = createStickyNoteFromUser(quickNote, ctx);
    const bar = anc.progress ? ` ${formatProgressBar(anc.progress)}` : "";
    if (hasActiveUI(ctx)) {
      ctx.ui.notify(`\u2316 Pinned #${anc.id.replace(/^anc-/, "")}${bar}: "${anc.title}"`, "info");
    }
    return { action: "handled" };
  });
  pi.on("before_agent_start", async (event, ctx) => {
    const entries = ctx.sessionManager?.getEntries() || [];
    const messageTurns = entries.filter((e) => e.type === "message");
    if (messageTurns.length <= 1) {
      const snippet = renderColdStartAnchorsContext(store, ctx.cwd);
      if (snippet) {
        return { systemPrompt: `${event.systemPrompt}

${snippet}` };
      }
    } else {
      const activeHere = store.list({ status: "active", cwd: ctx.cwd });
      if (activeHere.length > 0) {
        const p = activeHere[0];
        const bar = p.progress ? ` ${formatProgressBar(p.progress)}` : "";
        const guard = `[Active Anchor Focus]: #${p.id.replace(/^anc-/, "")} "${p.title}"${bar}. Keep execution strictly focused on this anchor. Do not perform unrequested refactoring or modify unrelated files.`;
        return { systemPrompt: `${event.systemPrompt}

${guard}` };
      }
    }
  });
  pi.on("tool_call", async (event, ctx) => {
    const lowerTool = String(event.toolName || "").toLowerCase();
    const liveActivity = inferLiveActivityLabel(lowerTool, event.input, ctx.cwd);
    if (liveActivity) {
      const activeHere = store.list({ status: "active", cwd: ctx.cwd });
      if (activeHere.length > 0) {
        store.update(activeHere[0].id, { activeForm: liveActivity });
        updateStartupBanner(ctx, store);
      }
    }
  });
  pi.on("tool_result", async (event, ctx) => {
    if (event.isError) return;
    const lowerTool = String(event.toolName || "").toLowerCase();
    const currentSessionFile = getSessionFileSafe(ctx);
    if (lowerTool === "todo") {
      const tasks = event?.details?.tasks;
      if (Array.isArray(tasks)) {
        const syncRes = store.syncFromTodoTool(tasks, {
          cwd: ctx.cwd,
          sessionFile: currentSessionFile,
          recentFiles: recentSessionFiles
        });
        if (syncRes.status !== "noop") {
          updateAnchorStatusBar(ctx, store);
        }
      }
      return;
    }
    if (lowerTool === "bash" || lowerTool === "powershell") {
      const cmd = String(event.input?.command || "");
      if (cmd.includes("git commit")) {
        const msgMatch = cmd.match(/-m\s+["']([^"']+)["']/);
        if (msgMatch && msgMatch[1]) {
          const commitMsg = msgMatch[1];
          const candidates = store.list({ cwd: ctx.cwd }).filter((a) => a.status === "active" || a.status === "sleeping");
          for (const a of candidates) {
            if (matchesCommitMessage(a, [commitMsg]).matched && isAnchorTargetingWorkspace(a, ctx.cwd)) {
              store.settle(a.id, { settledBy: "commit", summary: commitMsg });
              updateAnchorStatusBar(ctx, store);
              if (hasActiveUI(ctx)) {
                try {
                  ctx.ui.notify(`\u2316 Auto-torn off #${a.id.replace(/^anc-/, "")} ("${a.title}") on git commit`, "info");
                } catch {
                }
              }
            }
          }
        }
      }
    }
    const liveActivity = inferLiveActivityLabel(lowerTool, event.input, ctx.cwd);
    const pathInput = event.input?.path;
    if (typeof pathInput !== "string") {
      if (liveActivity) {
        const activeHere = store.list({ status: "active", cwd: ctx.cwd });
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
    const notes = store.list({ cwd: ctx.cwd }).filter((a) => a.status === "active" || a.status === "sleeping");
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
        const contents = [...event.content || []];
        for (let i = contents.length - 1; i >= 0; i--) {
          const item = contents[i];
          if (item && item.type === "text") {
            contents[i] = { ...item, text: item.text + whisper };
            return { content: contents };
          }
        }
      }
    }
  });
  pi.registerTool({
    name: "anchor",
    label: "Anchor (Sticky Note)",
    description: "Pin, list, step, or tear off cross-session sticky notes stored in ~/.anchor/ (zero git repo clutter). Actions: pin (stick a new note), list (view notes), step (advance progress bar), settle (tear off completed note).",
    promptSnippet: "Pin or tear off cross-session sticky notes that survive terminal restarts",
    promptGuidelines: [
      "Use `anchor` when the user explicitly asks to remember something for later/tomorrow or across sessions.",
      "BOUNDARY WITH TODO: `todo` is for multi-step work right now in this session; `anchor` is a sticky note for future sessions.",
      'When a pinned note is completed, call `anchor` with action "settle" to tear it off.'
    ],
    parameters: import_typebox.Type.Object({
      action: import_typebox.Type.Union([
        import_typebox.Type.Literal("pin"),
        import_typebox.Type.Literal("list"),
        import_typebox.Type.Literal("step"),
        import_typebox.Type.Literal("settle"),
        import_typebox.Type.Literal("touch"),
        import_typebox.Type.Literal("sweep")
      ]),
      title: import_typebox.Type.Optional(import_typebox.Type.String({ description: "Sticky note text (supports [1/4] or 1. A 2. B progress steps)" })),
      description: import_typebox.Type.Optional(import_typebox.Type.String({ description: "Optional extra details" })),
      project: import_typebox.Type.Optional(import_typebox.Type.String({ description: "Optional project name or folder" })),
      files: import_typebox.Type.Optional(import_typebox.Type.Array(import_typebox.Type.String(), { description: "Optional associated file paths" })),
      id: import_typebox.Type.Optional(import_typebox.Type.String({ description: "Note ID, e.g. anc-1 or 1 (for step/settle)" }))
    }),
    renderCall(args, theme) {
      const action = args.action || "list";
      let title = theme.fg("toolTitle", theme.bold("\u2316 anchor ")) + theme.fg("accent", action);
      if (action === "pin" && args.title) {
        title += ` "${args.title}"`;
      } else if ((action === "settle" || action === "touch" || action === "step") && args.id) {
        title += ` ${theme.fg("dim", `#${String(args.id).replace(/^anc-/, "")}`)}`;
      }
      return {
        render: (width) => [truncateToWidth(title, width)],
        invalidate: () => {
        }
      };
    },
    renderResult(result, _options, theme) {
      const text = result.content?.[0]?.text || (result.isError ? "Failed" : "OK");
      const color = result.isError ? "error" : "success";
      const icon = result.isError ? "\u2717" : "\u2714";
      return {
        render: (width) => [truncateToWidth(theme.fg(color, `${icon} ${text}`), width)],
        invalidate: () => {
        }
      };
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx) return { content: [{ type: "text", text: "Error: context required" }], isError: true };
      if (params.action === "pin") {
        if (!params.title) {
          return { content: [{ type: "text", text: "Error: title is required for pin" }], isError: true };
        }
        const anc = store.create({
          title: params.title,
          description: params.description,
          project: params.project,
          cwd: ctx.cwd,
          files: params.files?.length ? params.files : recentSessionFiles[0] ? [recentSessionFiles[0]] : [],
          sessionFile: getSessionFileSafe(ctx)
        });
        updateAnchorStatusBar(ctx, store);
        return {
          content: [{ type: "text", text: `Pinned note #${anc.id.replace(/^anc-/, "")}: "${anc.title}"` }],
          isError: false
        };
      }
      if (params.action === "list") {
        const notes = store.list({ cwd: ctx.cwd, all: true }).filter((a) => a.status === "active" || a.status === "sleeping");
        return {
          content: [{ type: "text", text: JSON.stringify(notes, null, 2) }],
          isError: false
        };
      }
      if (params.action === "step") {
        const rawId = params.id || "1";
        try {
          const targetId = resolveAnchorTarget(store, String(rawId), ctx.cwd) || String(rawId);
          const { anchor: updated } = store.step(targetId, 1);
          updateAnchorStatusBar(ctx, store);
          return {
            content: [{ type: "text", text: `Advanced #${updated.id.replace(/^anc-/, "")} to ${formatProgressBar(updated.progress)}` }],
            isError: false
          };
        } catch (err) {
          return { content: [{ type: "text", text: err.message }], isError: true };
        }
      }
      if (params.action === "settle") {
        if (!params.id) {
          return { content: [{ type: "text", text: "Error: id is required for settle" }], isError: true };
        }
        try {
          const targetId = resolveAnchorTarget(store, String(params.id), ctx.cwd) || String(params.id);
          const settled = store.settle(targetId, { settledBy: "manual" });
          updateAnchorStatusBar(ctx, store);
          return {
            content: [{ type: "text", text: `Torn off note #${settled.id.replace(/^anc-/, "")}: "${settled.title}"` }],
            isError: false
          };
        } catch (err) {
          return { content: [{ type: "text", text: err.message }], isError: true };
        }
      }
      if (params.action === "touch" && params.id) {
        try {
          const touched = store.touch(String(params.id), Date.now(), getSessionFileSafe(ctx));
          updateAnchorStatusBar(ctx, store);
          return { content: [{ type: "text", text: `Refreshed note #${touched.id}` }], isError: false };
        } catch (err) {
          return { content: [{ type: "text", text: err.message }], isError: true };
        }
      }
      if (params.action === "sweep") {
        const res = sweepQuietNotes(store);
        updateAnchorStatusBar(ctx, store);
        return { content: [{ type: "text", text: `Quieted ${res.quieted.length} old note(s).` }], isError: false };
      }
      return { content: [{ type: "text", text: "Unknown action" }], isError: true };
    }
  });
  pi.registerCommand("anchor", {
    description: "View, pin, step, jump to session, or tear off sticky notes (/anchor, /anchor step 1, /anchor jump 1, /anchor done 1)",
    handler: async (args, ctx) => {
      const parsed = parseAnchorCommandInput(args);
      if (parsed.mode === "dashboard") {
        await openAnchorDashboard(ctx, store);
        return;
      }
      if (parsed.mode === "now") {
        const activeHere = store.list({ status: "active", cwd: ctx.cwd });
        if (activeHere.length === 0) {
          ctx.ui.notify('\u2316 No active anchor in this workspace. Type "pin: <goal>" to anchor your vibe-coding task!', "info");
          return;
        }
        const p = activeHere[0];
        const bar2 = p.progress ? ` ${formatProgressBar(p.progress)}` : "";
        const origin = formatOrigin(p);
        const activity = p.activeForm ? ` \u2022 Live Pulse: \u25D0 ${p.activeForm}` : "";
        const files = p.files && p.files.length > 0 ? ` \u2022 Files: ${p.files.slice(0, 3).join(", ")}` : "";
        const msg = `\u2316 Active Anchor #${p.id.replace(/^anc-/, "")}${bar2}: "${p.title}" (${origin})${activity}${files}`;
        ctx.ui.notify(msg, "info");
        return;
      }
      if (parsed.mode === "undo") {
        try {
          const restored = store.undoSettle();
          ctx.ui.notify(`\u2316 Put back #${restored.id.replace(/^anc-/, "")}: "${restored.title}"`, "info");
          updateAnchorStatusBar(ctx, store);
        } catch (err) {
          ctx.ui.notify(`Undo failed: ${err.message}`, "error");
        }
        return;
      }
      if (parsed.mode === "fold") {
        const collapsed = defaultDockController.toggleCollapsed();
        updateStartupBanner(ctx, store);
        ctx.ui.notify(`\u2316 Anchor Dock ${collapsed ? "folded to 1-line strip" : "expanded to tree view"} (Alt+A)`, "info");
        return;
      }
      if (parsed.mode === "step" && parsed.targetId) {
        const resolvedId = resolveAnchorTarget(store, parsed.targetId, ctx.cwd);
        if (!resolvedId) {
          ctx.ui.notify(`\u2316 Note not found: ${parsed.targetId}`, "error");
          return;
        }
        const { anchor: updated } = store.step(resolvedId, parsed.delta || 1);
        ctx.ui.notify(`\u2316 Advanced #${updated.id.replace(/^anc-/, "")} to ${formatProgressBar(updated.progress)}`, "info");
        updateAnchorStatusBar(ctx, store);
        return;
      }
      if (parsed.mode === "jump" && parsed.targetId) {
        const resolvedId = resolveAnchorTarget(store, parsed.targetId, ctx.cwd);
        const note = resolvedId ? store.get(resolvedId) : void 0;
        if (!note || !note.sessionFile || !import_node_fs3.default.existsSync(note.sessionFile)) {
          ctx.ui.notify(`\u2316 No saved conversation session found for #${parsed.targetId}`, "error");
          return;
        }
        await ctx.switchSession(note.sessionFile);
        return;
      }
      if (parsed.mode === "settle" && parsed.targetId) {
        const resolvedId = resolveAnchorTarget(store, parsed.targetId, ctx.cwd);
        if (!resolvedId) {
          ctx.ui.notify(`\u2316 Note not found: ${parsed.targetId}`, "error");
          return;
        }
        const settled = store.settle(resolvedId, { settledBy: "manual" });
        ctx.ui.notify(`\u2316 Torn off #${settled.id.replace(/^anc-/, "")}: "${settled.title}" (/anchor undo to put back)`, "info");
        updateAnchorStatusBar(ctx, store);
        return;
      }
      const rawTrimmed = (args || "").trim();
      if (/^(?:#?anc-\d+|#?\d+)$/i.test(rawTrimmed)) {
        const resolvedId = resolveAnchorTarget(store, rawTrimmed, ctx.cwd);
        if (resolvedId) {
          const settled = store.settle(resolvedId, { settledBy: "manual" });
          ctx.ui.notify(`\u2316 Torn off #${settled.id.replace(/^anc-/, "")}: "${settled.title}" (/anchor undo to put back)`, "info");
          updateAnchorStatusBar(ctx, store);
          return;
        }
      }
      const anc = createStickyNoteFromUser(parsed.title || rawTrimmed, ctx);
      const bar = anc.progress ? ` ${formatProgressBar(anc.progress)}` : "";
      ctx.ui.notify(`\u2316 Pinned #${anc.id.replace(/^anc-/, "")}${bar}: "${anc.title}"`, "info");
    }
  });
  pi.registerCommand("pin", {
    description: "Stick a quick note across sessions (e.g. /pin Migrate auth [1/3])",
    handler: async (args, ctx) => {
      const text = (args || "").trim();
      if (!text) {
        await openAnchorDashboard(ctx, store);
        return;
      }
      const anc = createStickyNoteFromUser(text, ctx);
      const bar = anc.progress ? ` ${formatProgressBar(anc.progress)}` : "";
      ctx.ui.notify(`\u2316 Pinned #${anc.id.replace(/^anc-/, "")}${bar}: "${anc.title}"`, "info");
    }
  });
  pi.registerCommand("step", {
    description: "Advance progress bar on a sticky note (e.g. /step 1)",
    handler: async (args, ctx) => {
      const tokens = (args || "").trim().split(/\s+/).filter(Boolean);
      const target = tokens[0] || "1";
      const delta = tokens[1] ? parseInt(tokens[1], 10) : 1;
      const resolvedId = resolveAnchorTarget(store, target, ctx.cwd);
      if (!resolvedId) {
        ctx.ui.notify(`\u2316 Note not found: ${target}`, "error");
        return;
      }
      const { anchor: updated } = store.step(resolvedId, isNaN(delta) ? 1 : delta);
      ctx.ui.notify(`\u2316 Advanced #${updated.id.replace(/^anc-/, "")} to ${formatProgressBar(updated.progress)}`, "info");
      updateAnchorStatusBar(ctx, store);
    }
  });
  pi.registerCommand("done", {
    description: "Tear off a sticky note by number or ID (e.g. /done 1)",
    handler: async (args, ctx) => {
      const target = (args || "").trim();
      if (!target) {
        await openAnchorDashboard(ctx, store);
        return;
      }
      const resolvedId = resolveAnchorTarget(store, target, ctx.cwd);
      if (!resolvedId) {
        ctx.ui.notify(`\u2316 Note not found: ${target}`, "error");
        return;
      }
      const settled = store.settle(resolvedId, { settledBy: "manual" });
      ctx.ui.notify(`\u2316 Torn off #${settled.id.replace(/^anc-/, "")}: "${settled.title}" (/anchor undo to put back)`, "info");
      updateAnchorStatusBar(ctx, store);
    }
  });
  pi.registerCommand("now", {
    description: "Inspect active vibe-coding anchor and live activity pulse (/now)",
    handler: async (_args, ctx) => {
      const activeHere = store.list({ status: "active", cwd: ctx.cwd });
      if (activeHere.length === 0) {
        ctx.ui.notify('\u2316 No active anchor in this workspace. Type "pin: <goal>" to anchor your vibe-coding task!', "info");
        return;
      }
      const p = activeHere[0];
      const bar = p.progress ? ` ${formatProgressBar(p.progress)}` : "";
      const origin = formatOrigin(p);
      const activity = p.activeForm ? ` \u2022 Live Pulse: \u25D0 ${p.activeForm}` : "";
      const files = p.files && p.files.length > 0 ? ` \u2022 Files: ${p.files.slice(0, 3).join(", ")}` : "";
      const msg = `\u2316 Active Anchor #${p.id.replace(/^anc-/, "")}${bar}: "${p.title}" (${origin})${activity}${files}`;
      ctx.ui.notify(msg, "info");
    }
  });
  pi.registerCommand("anchors", {
    description: "View sticky notes",
    handler: async (_args, ctx) => {
      await openAnchorDashboard(ctx, store);
    }
  });
  pi.registerCommand("back", {
    description: "Jump back to the conversation session of the latest unfinished note or todo checkpoint (/back [id])",
    handler: async (args, ctx) => {
      const targetArg = (args || "").trim();
      const currentSession = getSessionFileSafe(ctx);
      if (targetArg) {
        const resolvedId = resolveAnchorTarget(store, targetArg, ctx.cwd);
        const note = resolvedId ? store.get(resolvedId) : void 0;
        if (!note || !note.sessionFile || !import_node_fs3.default.existsSync(note.sessionFile)) {
          ctx.ui.notify(`\u2316 No saved session found for #${targetArg}`, "error");
          return;
        }
        await ctx.switchSession(note.sessionFile);
        return;
      }
      const candidates = sortAnchorsForDisplay(
        store.list({ cwd: ctx.cwd, all: true }).filter((a) => a.status === "active" || a.status === "sleeping"),
        ctx.cwd
      );
      const jumpTarget = candidates.find(
        (a) => a.sessionFile && import_node_fs3.default.existsSync(a.sessionFile) && (!currentSession || !isSameOrSubPath(a.sessionFile, currentSession))
      );
      if (!jumpTarget || !jumpTarget.sessionFile) {
        ctx.ui.notify("\u2316 No other linked conversation session found to jump back to.", "info");
        return;
      }
      await ctx.switchSession(jumpTarget.sessionFile);
    }
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  parseAnchorCommandInput,
  parseQuickNoteInput,
  resolveAnchorTarget
});
